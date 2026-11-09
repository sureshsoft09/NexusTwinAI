"""ERP Inventory & FMCG Procurement Microservice (erp_inventory_mcp).

Port: 8081
Built with FastMCP exposing Model Context Protocol over Streamable HTTP at /mcp.
Simulates SAP S/4HANA Inventory Management & B2B FMCG Purchase Order (PO) execution,
backed by BigQuery Lakehouse (`nexustwinai-project.supply_chain_lakehouse`).
"""

import os
import sys
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional
from dotenv import load_dotenv
from fastmcp import FastMCP

# Ensure shared package is importable both locally and in Cloud Run container (/app/shared)
_mcp_dir = Path(__file__).resolve().parent
_src_dir = _mcp_dir.parent.parent
for _p in (str(_mcp_dir), str(_src_dir)):
    if _p not in sys.path:
        sys.path.insert(0, _p)

from shared.topology import FMCG_MANUFACTURERS, get_fresh_inventory
from shared.bq_lakehouse import bq_lakehouse

load_dotenv()

mcp = FastMCP("erp-inventory-mcp")

TRANSFER_ORDERS: List[Dict[str, Any]] = []
FMCG_PURCHASE_ORDERS: List[Dict[str, Any]] = []


@mcp.tool()
def get_warehouse_stock(sku: str, dc_id: str) -> Dict[str, Any]:
    """Retrieve current physical stock, safety buffer, and allocated units at a specific DC or Store from BigQuery Lakehouse."""
    dc_stock = bq_lakehouse.inventory.get(dc_id, {})
    item = dc_stock.get(sku)
    if not item:
        return {
            "status": "NOT_FOUND",
            "dc_id": dc_id,
            "sku": sku,
            "on_hand": 0,
            "safety_buffer": 0,
            "atp_surplus": 0,
        }
    atp = max(0, item["on_hand"] - item["safety_buffer"] - item.get("allocated", 0))
    return {
        "status": "AVAILABLE",
        "dc_id": dc_id,
        "sku": sku,
        "on_hand": item["on_hand"],
        "safety_buffer": item["safety_buffer"],
        "allocated": item.get("allocated", 0),
        "atp_surplus": atp,
        "bigquery_table": f"{bq_lakehouse.project_id}.{bq_lakehouse.dataset_id}.inventory_levels",
    }


@mcp.tool()
def get_dc_available_to_promise(sku: str, dc_id: str, requested_units: int = 1500) -> Dict[str, Any]:
    """Calculate Available-to-Promise (ATP) surplus ensuring local safety stock is never breached.
    If ATP < requested_units, recommends escalating to upstream FMCG Manufacturer PO process.
    """
    res = get_warehouse_stock(sku=sku, dc_id=dc_id)
    can_fulfill = res["atp_surplus"] >= requested_units
    return {
        "dc_id": dc_id,
        "sku": sku,
        "atp_units": res["atp_surplus"],
        "requested_units": requested_units,
        "can_fulfill_from_dc": can_fulfill,
        "can_fulfill_1500": res["atp_surplus"] >= 1500,
        "recommended_procurement_path": "INTERNAL_DC_STO" if can_fulfill else "ESCALATE_EXTERNAL_FMCG_PO",
        "fmcg_fallback_vendor": "FMCG-PLANT-TX01",
    }


@mcp.tool()
def create_transfer_order(from_dc: str, to_location: str, sku: str, quantity: int) -> Dict[str, Any]:
    """Post an internal Stock Transfer Order (STO) to SAP S/4HANA when serving DC has sufficient ATP surplus."""
    dc_stock = bq_lakehouse.inventory.get(from_dc, {}).get(sku)
    if not dc_stock:
        return {"status": "ERROR", "message": f"Source DC {from_dc} has no record of {sku}"}

    atp = dc_stock["on_hand"] - dc_stock["safety_buffer"] - dc_stock.get("allocated", 0)
    if atp < quantity:
        return {
            "status": "FAILED_ATP_BREACH",
            "message": (
                f"Requested {quantity} exceeds ATP surplus of {atp} at {from_dc}. "
                "Must escalate to FMCG Purchase Order (create_fmcg_purchase_order)."
            ),
            "requires_fmcg_po": True,
            "fmcg_vendor_id": "FMCG-PLANT-TX01",
        }

    # Deduct and commit STO
    dc_stock["on_hand"] -= quantity
    dc_stock["atp_surplus"] = max(0, dc_stock["on_hand"] - dc_stock["safety_buffer"])
    order_id = f"STO-SAP-{uuid.uuid4().hex[:6].upper()}"
    sto_record = {
        "order_id": order_id,
        "order_type": "STO_FROM_DC",
        "from_dc": from_dc,
        "to_location": to_location,
        "sku": sku,
        "quantity": quantity,
        "status": "DISPATCHED_TO_WMS",
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }
    TRANSFER_ORDERS.append(sto_record)
    bq_lakehouse.orders.append(sto_record)

    return {
        "status": "SUCCESS",
        "order_id": order_id,
        "order_type": "STO_FROM_DC",
        "message": f"SAP S/4HANA STO {order_id} generated. {quantity} units staged at {from_dc} dock for {to_location}.",
        "remaining_on_hand": dc_stock["on_hand"],
        "remaining_atp": dc_stock["atp_surplus"],
    }


@mcp.tool()
def create_fmcg_purchase_order(
    target_store: str,
    serving_dc: str,
    sku: str,
    quantity: int,
    fmcg_vendor_id: str = "FMCG-PLANT-TX01",
) -> Dict[str, Any]:
    """Raise an External Purchase Order (PO) to the FMCG Manufacturer (HydroBoost Bottling Plant)
    when the serving Regional DC does not have sufficient Available-to-Promise (ATP) stock.
    """
    plant = FMCG_MANUFACTURERS[0]
    unit_cost = plant.get("wholesale_unit_cost", 8.79)
    merchandise_total = round(quantity * unit_cost, 2)
    po_id = f"PO-FMCG-{uuid.uuid4().hex[:6].upper()}"

    # Deduct from FMCG Plant stock
    fmcg_stock = bq_lakehouse.inventory.get(fmcg_vendor_id, {}).get(sku)
    if fmcg_stock:
        fmcg_stock["on_hand"] = max(0, fmcg_stock["on_hand"] - quantity)
        fmcg_stock["atp_surplus"] = max(0, fmcg_stock["on_hand"] - fmcg_stock["safety_buffer"])

    po_record = {
        "order_id": po_id,
        "order_type": "PO_TO_FMCG",
        "fmcg_vendor_id": fmcg_vendor_id,
        "fmcg_vendor_name": plant["name"],
        "serving_dc": serving_dc,
        "target_store": target_store,
        "sku": sku,
        "quantity": quantity,
        "unit_wholesale_cost": unit_cost,
        "merchandise_total_usd": merchandise_total,
        "status": "DISPATCHED_TO_FMCG_EDI_850",
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }
    FMCG_PURCHASE_ORDERS.append(po_record)
    bq_lakehouse.orders.append(po_record)

    return {
        "status": "SUCCESS",
        "fmcg_purchase_order_id": po_id,
        "order_type": "PO_TO_FMCG",
        "fmcg_vendor_id": fmcg_vendor_id,
        "fmcg_vendor_name": plant["name"],
        "target_store": target_store,
        "via_dc": serving_dc,
        "quantity": quantity,
        "unit_wholesale_cost": unit_cost,
        "merchandise_total_usd": merchandise_total,
        "message": (
            f"External FMCG Purchase Order {po_id} transmitted via B2B EDI 850 / Webhook to {plant['name']} "
            f"for {quantity} units (${merchandise_total:,.2f}) to replenish {target_store} (since {serving_dc} lacked ATP stock)."
        ),
    }


@mcp.tool()
def get_inventory_health_summary() -> Dict[str, Any]:
    """Return regional supply network health status across all 1 FMCG Plant, 3 DCs, and 6 Retail Stores."""
    return {
        "fmcg_plants": FMCG_MANUFACTURERS,
        "dcs": [
            {
                "id": dc_id,
                "skus": list(stocks.keys()),
                "total_stock": sum(s.get("on_hand", 0) for s in stocks.values()),
                "hydrate_atp": stocks.get("SKU-4089-HYDRATE", {}).get("atp_surplus", 0),
            }
            for dc_id, stocks in bq_lakehouse.inventory.items()
            if dc_id.startswith("DC-")
        ],
        "active_transfer_orders": len(TRANSFER_ORDERS),
        "active_fmcg_purchase_orders": len(FMCG_PURCHASE_ORDERS),
    }


if __name__ == "__main__":
    port = int(os.getenv("PORT", 8081))
    print(f"Starting erp_inventory_mcp on port {port} (Streamable HTTP /mcp)...")
    mcp.run(
        transport="streamable-http",
        host="0.0.0.0",
        port=port,
    )
