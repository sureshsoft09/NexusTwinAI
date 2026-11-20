"""Logistics & 3PL Carrier Rate Optimization Agent (logistics_agent).

Connects exclusively to the live Cloud Run `logistics-rates-mcp` microservice via MCPToolset
to retrieve real multi-carrier 3PL freight quotes and realistic Texas transit SLAs.
"""

from nexustwin_agents import config
from nexustwin_agents.mcp_tools import LogisticsMCP_Tool
try:
    from shared.schemas import LogisticsOption, ReplenishmentProposal
except ImportError:
    from prototype.src.shared.schemas import LogisticsOption, ReplenishmentProposal

try:
    from google.adk.agents import LlmAgent
except ImportError:
    class LlmAgent:
        def __init__(self, name: str, instruction: str, model: str = "gemini-3.5-flash", tools: list = None, **kwargs):
            self.name = name
            self.instruction = instruction
            self.model = model
            self.tools = tools or []


LOGISTICS_INSTRUCTION = """
You are the NexusTwin Logistics & 3PL Carrier Optimization Specialist (`logistics_agent`).
You MUST call the live `logistics-rates-mcp` MCP tools — never invent freight prices or transit hours!

Workflow:
1. Call `calculate_freight_rates(origin_dc, dest_store, weight_kg, urgency)` using the exact `origin_dc`
   (e.g., `DC-ATX-02`, `DC-SAT-03`, or `FMCG-PLANT-TX01`), `dest_store`, and appropriate urgency
   (`ADVANCE_25D` for 25-day weather forecasts, `FMCG_DIRECT` for FMCG plant shipments, `EVENT_SURGE` for social spikes, or `STANDARD`).
2. Compare the returned 3PL carrier quotes and pick the lowest-cost carrier that meets the delivery SLA window.
3. Report ALL exact values returned by `logistics-rates-mcp`:
   - `origin_node`, `destination_store`
   - `carrier_name`, `freight_mode`
   - `transit_hours`, `sla_window_hours`
   - `freight_cost_usd`
   - `carrier_negotiation_summary` (comparing selected carrier vs rejected expensive options) and `mcp_tools_called`.
"""

logistics_agent = LlmAgent(
    model=config.get_gemini_model(config.MODEL_REASONING),
    name="logistics_agent",
    description="Queries live logistics-rates-mcp for 3PL carrier freight quotes, realistic Texas transit ETAs, and SLA compliance.",
    instruction=LOGISTICS_INSTRUCTION,
    tools=[LogisticsMCP_Tool],
)

logistics_investigate = logistics_agent
logistics_conclude = logistics_agent


class LogisticsService:
    """Fallback service wrapper for offline tests."""

    def evaluate(self, proposal: ReplenishmentProposal, store_stockout_hours: float) -> LogisticsOption:
        if proposal.order_type == "PO_TO_FMCG" or proposal.dc_shortage_escalated_to_fmcg:
            return LogisticsOption(
                carrier_name="HydroBoost Cold-Chain Direct Carrier (FMCG PO)",
                freight_mode="FMCG_DIRECT_EXPEDITED_PO",
                origin_dc=proposal.selected_donor_dc,
                destination_store=proposal.target_store,
                transit_hours=6.0,
                freight_cost=1850.00,
                eta_iso="2026-11-05T19:00:00Z",
                service_level="FMCG_FACTORY_DIRECT_SLA",
            )
        if store_stockout_hours >= 200.0 or proposal.target_store == "STORE-PLANO-07":
            return LogisticsOption(
                carrier_name="Texas Rail & Ground Economy (25-Day Pre-Position)",
                freight_mode="SCHEDULED_ECONOMY_PREPOSITION",
                origin_dc=proposal.selected_donor_dc,
                destination_store=proposal.target_store,
                transit_hours=36.0,
                freight_cost=480.00,
                eta_iso="2026-11-28T08:00:00Z",
                service_level="PROACTIVE_25D_WEATHER_BUFFER",
            )
        if proposal.target_store == "STORE-ARL-11":
            return LogisticsOption(
                carrier_name="Alamo Regional Dedicated Express",
                freight_mode="LATERAL_GROUND_TRANSFER",
                origin_dc=proposal.selected_donor_dc,
                destination_store=proposal.target_store,
                transit_hours=6.5,
                freight_cost=680.00,
                eta_iso="2026-11-05T21:00:00Z",
                service_level="EVENT_SURGE_GUARANTEED",
            )
        return LogisticsOption(
            carrier_name="Texas Fleet Logistics (Dedicated Ground)",
            freight_mode="LATERAL_GROUND_TRANSFER",
            origin_dc=proposal.selected_donor_dc,
            destination_store=proposal.target_store,
            transit_hours=5.5,
            freight_cost=750.00,
            eta_iso="2026-11-05T23:00:00Z",
            service_level="GUARANTEED_NEXT_DAY_AM",
        )
