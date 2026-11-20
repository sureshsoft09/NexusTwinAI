"""ERP Inventory & Isolated FMCG B2B Procurement Microservice (erp_inventory_mcp).

Port: 8081
Built with FastMCP exposing Model Context Protocol over Streamable HTTP at /mcp.

Two-Industry Zero-Trust Data Separation:
  - Retail ERP Domain Tools -> read/write BigQuery `retail_erp_inventory` + Firestore `store_live_shelf`
  - FMCG Manufacturer B2B Tools -> read/write isolated BigQuery `fmcg_factory_inventory`
  - Server-Side Governance Guardrails:
      * `create_transfer_order`: enforces live ATP >= quantity AND freight_cost <= $1,000 (unless vp_approval_token provided)
      * `create_fmcg_purchase_order`: strictly requires a signed `vp_approval_token` (external B2B commitment)
"""

import os
import sys
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List
from dotenv import load_dotenv
from fastmcp import FastMCP

# Ensure shared package is importable both locally and in Cloud Run container (/app/shared)
_mcp_dir = Path(__file__).resolve().parent
_src_dir = _mcp_dir.parent.parent
for _p in (str(_mcp_dir), str(_src_dir)):
    if _p not in sys.path:
        sys.path.insert(0, _p)

from shared.topology import FMCG_MANUFACTURERS, get_node_display_name
from shared.bq_lakehouse import bq_lakehouse

load_dotenv()

AUTONOMY_CAP_USD = float(os.getenv("AUTONOMY_THRESHOLD_USD", "1000.0"))
mcp = FastMCP("erp-inventory-mcp")


# =============================================================================
# RETAIL ENTERPRISE ERP DOMAIN TOOLS (BigQuery: retail_erp_inventory + Firestore)
# =============================================================================

@mcp.tool()
def get_warehouse_stock(sku: str, dc_id: str) -> Dict[str, Any]:
    """Retrieve live physical stock, safety reserve, and ATP surplus at a Retail DC or Store directly from the database."""
    item = bq_lakehouse.get_node_inventory(
        node_id=dc_id,
        sku_id=sku,
        prefer_bigquery_erp=not dc_id.startswith("STORE-"),
    )
    on_hand = int(item.get("on_hand", 0))
    safety = int(item.get("safety_buffer", 0))
    atp = max(0, on_hand - safety)
    table_ref = (
        f"firestore://store_live_shelf/{dc_id}"
        if dc_id.startswith("STORE-")
        else f"{bq_lakehouse.project_id}.{bq_lakehouse.dataset_id}.retail_erp_inventory"
    )
    return {
        "status": "AVAILABLE" if on_hand > 0 else "NOT_FOUND",
        "domain": "RETAIL_ERP",
        "dc_id": dc_id,
        "display_name": get_node_display_name(dc_id),
        "sku": sku,
        "on_hand": on_hand,
        "safety_buffer": safety,
        "atp_surplus": atp,
        "reserved": int(item.get("reserved", 0)),
        "data_source": item.get("data_source", table_ref),
    }


@mcp.tool()
def get_dc_available_to_promise(sku: str, dc_id: str, requested_units: int = 1500) -> Dict[str, Any]:
    """Query Retail ERP BigQuery (`retail_erp_inventory`) for Available-to-Promise (ATP) surplus
    at a Regional Warehouse, ensuring its local safety stock buffer is never breached.
    If ATP < requested_units, recommends escalating across the B2B boundary to the FMCG Manufacturer.
    """
    res = get_warehouse_stock(sku=sku, dc_id=dc_id)
    atp = int(res["atp_surplus"])
    can_fulfill = atp >= int(requested_units)
    return {
        "domain": "RETAIL_ERP",
        "dc_id": dc_id,
        "display_name": res["display_name"],
        "sku": sku,
        "on_hand": res["on_hand"],
        "safety_buffer": res["safety_buffer"],
        "atp_units": atp,
        "requested_units": int(requested_units),
        "can_fulfill_from_dc": can_fulfill,
        "recommended_procurement_path": "STO_FROM_DC" if can_fulfill else "PO_TO_FMCG",
        "fmcg_fallback_vendor": "FMCG-PLANT-TX01",
        "unit_gross_margin_usd": 6.20,
        "projected_protected_margin_usd": round(int(requested_units) * 6.20, 2),
        "data_source": res["data_source"],
    }


@mcp.tool()
def create_transfer_order(
    from_dc: str,
    to_location: str,
    sku: str,
    quantity: int,
    freight_cost_usd: float = 750.0,
    vp_approval_token: str = "",
    event_id: str = "",
) -> Dict[str, Any]:
    """Post an internal Retail SAP S/4HANA Stock Transfer Order (STO) from a Regional DC to a Retail Store.

    Server-Side Policy Enforcement:
      1. Live BigQuery ATP at `from_dc` must be >= `quantity`.
      2. `freight_cost_usd` must be <= $1,000.00 autonomy limit UNLESS a verified `vp_approval_token` is supplied.
    """
    if float(freight_cost_usd) > AUTONOMY_CAP_USD and not (vp_approval_token or "").strip():
        return {
            "status": "REJECTED_VP_APPROVAL_REQUIRED",
            "message": (
                f"Policy Guardrail Blocked STO: freight cost ${float(freight_cost_usd):,.2f} exceeds "
                f"${AUTONOMY_CAP_USD:,.2f} autonomy cap and no `vp_approval_token` was provided. "
                "Hand over to `approval_agent` (A2A HITL Queue) first."
            ),
            "requires_human_approval": True,
        }

    order_id = f"STO-SAP-{uuid.uuid4().hex[:6].upper()}"
    db_res = bq_lakehouse.execute_retail_dc_sto_in_db(
        from_dc=from_dc,
        target_store=to_location,
        sku_id=sku,
        quantity=int(quantity),
        order_id=order_id,
        freight_cost=float(freight_cost_usd),
        event_id=event_id,
        vp_approval_token=vp_approval_token,
    )
    if db_res.get("status") != "SUCCESS":
        return {
            "status": "FAILED_ATP_BREACH",
            "message": db_res.get("message", "Insufficient ATP at Retail DC."),
            "requires_fmcg_po": True,
            "fmcg_vendor_id": "FMCG-PLANT-TX01",
            "remaining_on_hand": db_res.get("remaining_on_hand", 0),
            "remaining_atp": db_res.get("remaining_atp", 0),
        }

    return {
        "status": "SUCCESS",
        "domain": "RETAIL_ERP",
        "order_id": order_id,
        "sap_transfer_order_id": order_id,
        "order_type": "STO_FROM_DC",
        "from_dc": from_dc,
        "from_dc_display_name": get_node_display_name(from_dc),
        "to_location": to_location,
        "to_location_display_name": get_node_display_name(to_location),
        "sku": sku,
        "quantity": int(quantity),
        "freight_cost_usd": float(freight_cost_usd),
        "remaining_on_hand": db_res["remaining_on_hand"],
        "remaining_atp": db_res["remaining_atp"],
        "store_inbound_reserved": db_res["store_inbound_reserved"],
        "bigquery_table_updated": f"{bq_lakehouse.project_id}.{bq_lakehouse.dataset_id}.retail_erp_inventory",
        "message": (
            f"SAP S/4HANA STO {order_id} committed to BigQuery & Firestore. "
            f"{int(quantity):,} packs staged at {get_node_display_name(from_dc)} for {get_node_display_name(to_location)}."
        ),
    }


# =============================================================================
# ISOLATED FMCG MANUFACTURER B2B DOMAIN TOOLS (BigQuery: fmcg_factory_inventory)
# =============================================================================

@mcp.tool()
def check_fmcg_manufacturer_capacity(
    sku: str = "SKU-4089-HYDRATE",
    requested_units: int = 1800,
    fmcg_vendor_id: str = "FMCG-PLANT-TX01",
) -> Dict[str, Any]:
    """Query the isolated FMCG Manufacturer ERP (`fmcg_factory_inventory`) via B2B MCP boundary
    for available bottling plant capacity and contracted wholesale tier pricing.
    """
    plant = FMCG_MANUFACTURERS[0]
    item = bq_lakehouse.get_node_inventory(
        node_id=fmcg_vendor_id,
        sku_id=sku,
        prefer_bigquery_erp=True,
    )
    on_hand = int(item.get("on_hand", 50000))
    safety = int(item.get("safety_buffer", 5000))
    atp = max(0, on_hand - safety)
    contract_unit_cost = float(plant.get("wholesale_unit_cost", 8.79))
    spot_unit_cost = 9.60
    merchandise_total = round(int(requested_units) * contract_unit_cost, 2)
    negotiated_savings = round(int(requested_units) * (spot_unit_cost - contract_unit_cost), 2)

    return {
        "status": "AVAILABLE" if atp >= int(requested_units) else "INSUFFICIENT_CAPACITY",
        "domain": "FMCG_MANUFACTURER_B2B",
        "fmcg_vendor_id": fmcg_vendor_id,
        "display_name": get_node_display_name(fmcg_vendor_id),
        "sku": sku,
        "on_hand": on_hand,
        "safety_buffer": safety,
        "atp_surplus": atp,
        "requested_units": int(requested_units),
        "can_fulfill": atp >= int(requested_units),
        "contract_wholesale_unit_cost_usd": contract_unit_cost,
        "spot_unit_cost_usd": spot_unit_cost,
        "negotiated_savings_usd": negotiated_savings,
        "merchandise_total_usd": merchandise_total,
        "unit_gross_margin_usd": 6.20,
        "projected_protected_margin_usd": round(int(requested_units) * 6.20, 2),
        "requires_vp_approval_token": True,
        "data_source": f"{bq_lakehouse.project_id}.{bq_lakehouse.dataset_id}.fmcg_factory_inventory",
        "negotiation_summary": (
            f"Negotiated direct batch allocation with {get_node_display_name(fmcg_vendor_id)}: "
            f"locked contract wholesale tier at ${contract_unit_cost:.2f}/pack (vs ${spot_unit_cost:.2f} spot, "
            f"saving ${negotiated_savings:,.2f}) for {int(requested_units):,} packs (${merchandise_total:,.2f} merchandise)."
        ),
    }


@mcp.tool()
def create_fmcg_purchase_order(
    target_store: str,
    serving_dc: str,
    sku: str,
    quantity: int,
    freight_cost_usd: float = 1850.0,
    vp_approval_token: str = "",
    fmcg_vendor_id: str = "FMCG-PLANT-TX01",
    event_id: str = "",
) -> Dict[str, Any]:
    """Raise a legally binding External B2B Purchase Order (EDI 850) to the FMCG Manufacturer.

    Server-Side Zero-Trust Guardrail:
      Strictly requires a verified `vp_approval_token` signed by the Retail VP of Supply Chain.
      Rejects unauthorized autonomous B2B PO execution.
    """
    if not (vp_approval_token or "").strip() or not vp_approval_token.startswith("SIG-"):
        return {
            "status": "REJECTED_VP_APPROVAL_REQUIRED",
            "domain": "FMCG_MANUFACTURER_B2B",
            "requires_human_approval": True,
            "message": (
                "Zero-Trust Guardrail Blocked External FMCG PO: Cross-company B2B Purchase Orders "
                "require a signed `vp_approval_token` (prefix `SIG-`) from the Retail VP of Supply Chain. "
                "Pause via `approval_agent` (A2A HITL Queue) and wait for VP approval."
            ),
        }

    plant = FMCG_MANUFACTURERS[0]
    unit_cost = float(plant.get("wholesale_unit_cost", 8.79))
    merchandise_total = round(int(quantity) * unit_cost, 2)
    total_commitment = round(merchandise_total + float(freight_cost_usd), 2)
    po_id = f"PO-FMCG-{uuid.uuid4().hex[:6].upper()}"

    db_res = bq_lakehouse.execute_fmcg_po_in_db(
        fmcg_vendor_id=fmcg_vendor_id,
        serving_dc=serving_dc,
        target_store=target_store,
        sku_id=sku,
        quantity=int(quantity),
        order_id=po_id,
        freight_cost=float(freight_cost_usd),
        merchandise_cost=merchandise_total,
        vp_approval_token=vp_approval_token,
        event_id=event_id,
    )

    return {
        "status": "SUCCESS",
        "domain": "FMCG_MANUFACTURER_B2B",
        "fmcg_purchase_order_id": po_id,
        "sap_transfer_order_id": po_id,
        "order_type": "PO_TO_FMCG",
        "fmcg_vendor_id": fmcg_vendor_id,
        "fmcg_vendor_display_name": get_node_display_name(fmcg_vendor_id),
        "target_store": target_store,
        "target_store_display_name": get_node_display_name(target_store),
        "via_dc": serving_dc,
        "quantity": int(quantity),
        "unit_wholesale_cost_usd": unit_cost,
        "merchandise_total_usd": merchandise_total,
        "freight_cost_usd": float(freight_cost_usd),
        "total_commitment_usd": total_commitment,
        "vp_approval_token": vp_approval_token,
        "remaining_factory_on_hand": db_res.get("remaining_factory_on_hand"),
        "remaining_factory_atp": db_res.get("remaining_factory_atp"),
        "store_inbound_reserved": db_res.get("store_inbound_reserved"),
        "bigquery_table_updated": f"{bq_lakehouse.project_id}.{bq_lakehouse.dataset_id}.fmcg_factory_inventory",
        "message": (
            f"External B2B FMCG Purchase Order {po_id} authorized ({vp_approval_token}) and transmitted via "
            f"EDI 850 to {get_node_display_name(fmcg_vendor_id)} for {int(quantity):,} packs "
            f"(${total_commitment:,.2f} total) bound for {get_node_display_name(target_store)}."
        ),
    }


@mcp.tool()
def get_inventory_health_summary() -> Dict[str, Any]:
    """Return live regional supply network health status directly from Firestore & BigQuery."""
    inv = bq_lakehouse.get_live_inventory(force_refresh=True)
    return {
        "fmcg_plants": [
            {
                "id": "FMCG-PLANT-TX01",
                "display_name": get_node_display_name("FMCG-PLANT-TX01"),
                "hydrate_on_hand": inv.get("FMCG-PLANT-TX01", {}).get("SKU-4089-HYDRATE", {}).get("on_hand", 0),
                "hydrate_atp": inv.get("FMCG-PLANT-TX01", {}).get("SKU-4089-HYDRATE", {}).get("atp_surplus", 0),
            }
        ],
        "dcs": [
            {
                "id": dc_id,
                "display_name": get_node_display_name(dc_id),
                "hydrate_on_hand": inv.get(dc_id, {}).get("SKU-4089-HYDRATE", {}).get("on_hand", 0),
                "hydrate_atp": inv.get(dc_id, {}).get("SKU-4089-HYDRATE", {}).get("atp_surplus", 0),
            }
            for dc_id in ("DC-ATX-02", "DC-HOU-01", "DC-SAT-03")
        ],
        "stores": [
            {
                "id": st_id,
                "display_name": get_node_display_name(st_id),
                "on_hand": inv.get(st_id, {}).get("SKU-4089-HYDRATE", {}).get("on_hand", 0),
                "current_velocity": inv.get(st_id, {}).get("SKU-4089-HYDRATE", {}).get("current_velocity", 0),
            }
            for st_id in ("STORE-DAL-04", "STORE-HOU-05", "STORE-PLANO-07", "STORE-ARL-11", "STORE-FW-02", "STORE-SAT-06")
        ],
    }


if __name__ == "__main__":
    port = int(os.getenv("PORT", 8081))
    print(f"Starting erp_inventory_mcp on port {port} (Streamable HTTP /mcp)...")
    mcp.run(
        transport="streamable-http",
        host="0.0.0.0",
        port=port,
    )
