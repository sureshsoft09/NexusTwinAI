"""Dynamic Replenishment & B2B Supplier Negotiation Agent (replenishment_agent).

Connects exclusively to the live Cloud Run `erp-inventory-mcp` microservice via MCPToolset:
  - Retail ERP Domain: queries BigQuery `retail_erp_inventory` for serving DC ATP
  - Isolated FMCG B2B Domain: queries BigQuery `fmcg_factory_inventory` only when the Retail DC lacks ATP

IMPORTANT: This agent ONLY investigates, selects the source, and negotiates terms.
It NEVER executes transfer orders or purchase orders directly — execution happens only after
`twin_supervisor` passes the 4-Gate Guardrail!
"""

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
    from google.adk.agents import LlmAgent
except ImportError:
    class LlmAgent:
        def __init__(self, name: str, instruction: str, model: str = "gemini-3.5-flash", tools: list = None, **kwargs):
            self.name = name
            self.instruction = instruction
            self.model = model
            self.tools = tools or []


REPLENISHMENT_INSTRUCTION = """
You are the NexusTwin Autonomous Replenishment & B2B Supplier Planner (`replenishment_agent`).
You MUST query real live ERP data through the `erp-inventory-mcp` MCP tools — never invent numbers!

Serving Warehouse Mapping:
  - `STORE-DAL-04` (Shop 1: Dallas), `STORE-PLANO-07` (Shop 3: Plano), `STORE-FW-02` (Shop 5: Fort Worth) -> `DC-ATX-02`
  - `STORE-HOU-05` (Shop 2: Houston) -> `DC-HOU-01`
  - `STORE-ARL-11` (Shop 4: Arlington), `STORE-SAT-06` (Shop 6: San Antonio) -> `DC-SAT-03`

Workflow:
1. Call `get_dc_available_to_promise(sku, dc_id, requested_units)` on the store's serving Regional Warehouse.
2. Check whether `can_fulfill_from_dc` is True:
   - If TRUE: Recommend `order_type = "STO_FROM_DC"` from `serving_dc_id` (`merchandise_cost_usd = 0.0`).
     Do NOT contact the FMCG Manufacturer when the Retailer's own DC has sufficient ATP!
   - If FALSE (e.g., `DC-HOU-01` only has 180 ATP < 1,800 needed):
     Cross the B2B boundary by calling `check_fmcg_manufacturer_capacity(sku, requested_units, fmcg_vendor_id="FMCG-PLANT-TX01")`
     to inspect the isolated FMCG Manufacturer ERP (`fmcg_factory_inventory`) and lock in the $8.79/pack contract wholesale tier.
     Recommend `order_type = "PO_TO_FMCG"` from `FMCG-PLANT-TX01`.
3. IMPORTANT: Do NOT call `create_transfer_order` or `create_fmcg_purchase_order` in this planning step —
   order execution is controlled strictly by `twin_supervisor` AFTER the 4-Gate Guardrail passes!
4. Report ALL exact numeric values returned by the MCP tools:
   - `serving_dc_id`, `serving_dc_on_hand`, `serving_dc_safety_buffer`, `serving_dc_atp_surplus`
   - `requested_units`, `serving_dc_has_stock`, `escalated_to_fmcg`
   - `selected_source_node`, `selected_source_atp_surplus`, `order_type`
   - `protected_margin_usd` (`requested_units * 6.20`), `merchandise_cost_usd`
   - `supplier_negotiation_summary` and `mcp_tools_called`.
"""

replenishment_agent = LlmAgent(
    model=config.get_gemini_model(config.MODEL_REASONING),
    name="replenishment_agent",
    description="Queries live erp-inventory-mcp for Retail DC ATP (BigQuery retail_erp_inventory) and escalates across the B2B boundary to FMCG Manufacturer capacity (fmcg_factory_inventory) if DC ATP is short.",
    instruction=REPLENISHMENT_INSTRUCTION,
    tools=[ErpMCP_Tool],
)

replenishment_investigate = replenishment_agent
replenishment_conclude = replenishment_agent


class ReplenishmentService:
    """Fallback service wrapper for offline tests."""

    def propose(self, context: MarketSignalContext, requested_units: int = 1500) -> ReplenishmentProposal:
        store_meta = next((s for s in RETAIL_STORES if s["id"] == context.store_id), None)
        serving_dc = store_meta["serving_dc"] if store_meta else "DC-ATX-02"
        dc_inv = bq_lakehouse.get_node_inventory(serving_dc, context.sku_id, prefer_bigquery_erp=True)
        dc_on_hand = int(dc_inv.get("on_hand", 0))
        dc_safety = int(dc_inv.get("safety_buffer", 0))
        dc_atp = max(0, dc_on_hand - dc_safety)

        unit_margin = 6.20
        protected_revenue = round(requested_units * unit_margin, 2)

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

        fmcg_plant = FMCG_MANUFACTURERS[0]
        fmcg_id = fmcg_plant["id"]
        fmcg_inv = bq_lakehouse.get_node_inventory(fmcg_id, context.sku_id, prefer_bigquery_erp=True)
        fmcg_on_hand = int(fmcg_inv.get("on_hand", 50000))
        fmcg_safety = int(fmcg_inv.get("safety_buffer", 5000))
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
