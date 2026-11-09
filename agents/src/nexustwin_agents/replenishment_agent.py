"""Dynamic Replenishment Agent (replenishment_agent).

Two-Stage Google ADK Pipeline:
  Stage 1: Investigate Agent (queries BigQuery / SAP S/4HANA ERP inventory & ATP across 3 regional DCs)
  Stage 2: Conclude Agent (selects internal Donor DC for STO, OR escalates to FMCG Manufacturer PO when DC lacks ATP)
"""

from typing import Any, Dict
from nexustwin_agents import config
from nexustwin_agents.mcp_tools import ErpMCP_Tool
try:
    from shared.schemas import MarketSignalContext, ReplenishmentProposal
    from shared.topology import RETAIL_STORES, FMCG_MANUFACTURERS
    from shared.bq_lakehouse import bq_lakehouse
except ImportError:
    from prototype.src.shared.schemas import MarketSignalContext, ReplenishmentProposal
    from prototype.src.shared.topology import RETAIL_STORES, FMCG_MANUFACTURERS
    from prototype.src.shared.bq_lakehouse import bq_lakehouse

try:
    from google.adk.agents import LlmAgent, SequentialAgent
except ImportError:
    class LlmAgent:
        def __init__(self, name: str, instruction: str, model: str = "gemini-2.5-pro", tools: list = None, **kwargs):
            self.name = name
            self.instruction = instruction
            self.model = model
            self.tools = tools or []

    class SequentialAgent:
        def __init__(self, name: str, sub_agents: list = None, **kwargs):
            self.name = name
            self.sub_agents = sub_agents or []


def query_regional_dc_atp_inventory(sku_id: str = "SKU-4089-HYDRATE", requested_units: int = 1500) -> Dict[str, Any]:
    """Query SAP S/4HANA & BigQuery Available-to-Promise (ATP) stock across the 3 Texas DCs and 1 FMCG Plant."""
    dcs_report = []
    for dc_id in ["DC-ATX-02", "DC-HOU-01", "DC-SAT-03"]:
        inv = bq_lakehouse.inventory.get(dc_id, {}).get(sku_id, {"on_hand": 0, "safety_buffer": 0})
        atp = max(0, inv["on_hand"] - inv["safety_buffer"])
        dcs_report.append({
            "dc_id": dc_id,
            "on_hand_units": inv["on_hand"],
            "safety_stock_buffer_units": inv["safety_buffer"],
            "available_to_promise_atp": atp,
            "can_fulfill_from_dc": atp >= requested_units,
        })

    fmcg_plant = FMCG_MANUFACTURERS[0]
    fmcg_inv = bq_lakehouse.inventory.get(fmcg_plant["id"], {}).get(sku_id, {"on_hand": 50000, "safety_buffer": 5000})

    return {
        "sku_id": sku_id,
        "requested_units": requested_units,
        "regional_dcs": dcs_report,
        "fmcg_manufacturer_fallback": {
            "fmcg_id": fmcg_plant["id"],
            "name": fmcg_plant["name"],
            "available_atp": fmcg_inv["on_hand"] - fmcg_inv["safety_buffer"],
            "wholesale_unit_cost_usd": fmcg_plant["wholesale_unit_cost"],
        },
        "unit_gross_margin_usd": 6.20,
        "projected_protected_margin_usd": round(requested_units * 6.20, 2),
    }


REPLENISHMENT_INSTRUCTION = """
You are the NexusTwin Autonomous Replenishment Planner (`replenishment_agent`).
Your task is to identify optimal replenishment sources for the 6 Retail Stores across our 3 Regional DCs:
1. Call `query_regional_dc_atp_inventory` to evaluate Available-to-Promise (ATP) surplus at the store's serving DC (`DC-ATX-02`, `DC-HOU-01`, or `DC-SAT-03`).
2. Ensure donor DCs NEVER breach their local safety stock buffers.
3. If the serving DC has sufficient ATP surplus, select `STO_FROM_DC` and report the post-transfer ATP balance and protected gross margin.
4. If the serving DC does NOT have enough ATP surplus (e.g., `DC-HOU-01` has only 180 ATP units), escalate to the upstream FMCG Manufacturer (`FMCG-PLANT-TX01`) via the External Purchase Order (`PO_TO_FMCG`) process and report the merchandise cost.
"""

_replenishment_tools = [query_regional_dc_atp_inventory]
if not hasattr(ErpMCP_Tool, "name"):
    _replenishment_tools.append(ErpMCP_Tool)

replenishment_agent = LlmAgent(
    model=config.get_gemini_model(config.MODEL_REASONING),
    name="replenishment_agent",
    description="Queries BigQuery/SAP Available-to-Promise (ATP) inventory across 3 DCs and escalates to FMCG PO when DC stock is insufficient.",
    instruction=REPLENISHMENT_INSTRUCTION,
    tools=_replenishment_tools,
)

# Backwards-compatible aliases
replenishment_investigate = replenishment_agent
replenishment_conclude = replenishment_agent


class ReplenishmentService:
    """Service wrapper for standalone and programmatic execution."""

    def propose(self, context: MarketSignalContext, requested_units: int = 1500) -> ReplenishmentProposal:
        store_meta = next((s for s in RETAIL_STORES if s["id"] == context.store_id), None)
        serving_dc = store_meta["serving_dc"] if store_meta else "DC-ATX-02"

        dc_inv = bq_lakehouse.inventory.get(serving_dc, {}).get(
            context.sku_id,
            {"on_hand": 4800, "safety_buffer": 1200, "atp_surplus": 3600},
        )
        dc_on_hand = dc_inv.get("on_hand", 0)
        dc_safety = dc_inv.get("safety_buffer", 0)
        dc_atp = max(0, dc_on_hand - dc_safety)

        unit_margin = 6.20
        protected_revenue = round(requested_units * unit_margin, 2)

        # Check if Serving DC has enough ATP surplus
        if dc_atp >= requested_units:
            return ReplenishmentProposal(
                proposal_id=f"PROP-STO-{context.event_id}",
                event_id=context.event_id,
                sku_id=context.sku_id,
                target_store=context.store_id,
                selected_donor_dc=serving_dc,
                order_type="STO_FROM_DC",
                units_to_transfer=requested_units,
                donor_current_stock=dc_on_hand,
                donor_safety_stock=dc_safety,
                donor_atp_surplus=dc_atp,
                dc_shortage_escalated_to_fmcg=False,
                fmcg_vendor_id=None,
                fmcg_po_merchandise_cost=0.0,
                unit_retail_price=14.99,
                unit_gross_margin=unit_margin,
                projected_protected_revenue=protected_revenue,
            )
        else:
            # Serving DC does NOT have enough stock (e.g., Shop 2 STORE-HOU-05 served by DC-HOU-01 with only 180 ATP)!
            # Escalate upstream to FMCG Manufacturer (FMCG-PLANT-TX01) via External Purchase Order (PO)
            fmcg_plant = FMCG_MANUFACTURERS[0]
            fmcg_id = fmcg_plant["id"]
            fmcg_inv = bq_lakehouse.inventory.get(fmcg_id, {}).get(
                context.sku_id,
                {"on_hand": 50000, "safety_buffer": 5000, "atp_surplus": 45000},
            )
            fmcg_on_hand = fmcg_inv.get("on_hand", 50000)
            fmcg_safety = fmcg_inv.get("safety_buffer", 5000)
            fmcg_atp = max(0, fmcg_on_hand - fmcg_safety)
            merchandise_cost = round(requested_units * fmcg_plant.get("wholesale_unit_cost", 8.79), 2)

            return ReplenishmentProposal(
                proposal_id=f"PROP-FMCG-PO-{context.event_id}",
                event_id=context.event_id,
                sku_id=context.sku_id,
                target_store=context.store_id,
                selected_donor_dc=f"{fmcg_id} (via {serving_dc})",
                order_type="PO_TO_FMCG",
                units_to_transfer=requested_units,
                donor_current_stock=fmcg_on_hand,
                donor_safety_stock=fmcg_safety,
                donor_atp_surplus=fmcg_atp,
                dc_shortage_escalated_to_fmcg=True,
                fmcg_vendor_id=fmcg_id,
                fmcg_po_merchandise_cost=merchandise_cost,
                unit_retail_price=14.99,
                unit_gross_margin=unit_margin,
                projected_protected_revenue=protected_revenue,
            )
