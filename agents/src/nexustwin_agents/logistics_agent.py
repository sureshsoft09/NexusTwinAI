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
    from google.genai import types
    _LOG_GEN_CFG = types.GenerateContentConfig(temperature=0.1, max_output_tokens=512)
except ImportError:
    _LOG_GEN_CFG = None

    class LlmAgent:
        def __init__(self, name: str, instruction: str, model: str = "gemini-3.5-flash-lite", tools: list = None, **kwargs):
            self.name = name
            self.instruction = instruction
            self.model = model
            self.tools = tools or []


LOGISTICS_INSTRUCTION = """
You are `logistics_agent`. Use ONLY live `logistics-rates-mcp` tools; never invent prices or transit hours.

STRICT SINGLE-CALL RULE:
1. Call `calculate_freight_rates(origin_dc, dest_store, weight_kg, urgency)` EXACTLY ONCE
   (`weight_kg = requested_units * 6.0` if omitted; `urgency`: `ADVANCE_25D` for 25-day weather / `STORE-PLANO-07`,
   `FMCG_DIRECT` for `FMCG-PLANT-TX01`, `EVENT_SURGE` for social spikes / `STORE-ARL-11`, else `STANDARD`).
2. DO NOT call `get_carrier_transit_eta` or any second tool — `calculate_freight_rates` already includes transit hours and SLA windows.
3. Select the lowest-cost carrier meeting the SLA window and return ONLY a concise JSON object (no essay):
   `origin_node`, `destination_store`, `carrier_name`, `freight_mode`, `transit_hours`,
   `sla_window_hours`, `freight_cost_usd`, `mcp_tools_called`, and 1-sentence `carrier_negotiation_summary`.
"""

logistics_agent = LlmAgent(
    model=config.get_gemini_model(config.MODEL_FAST),
    name="logistics_agent",
    description="Queries live logistics-rates-mcp for 3PL carrier freight quotes, realistic Texas transit ETAs, and SLA compliance.",
    instruction=LOGISTICS_INSTRUCTION,
    tools=[LogisticsMCP_Tool],
    before_model_callback=config.before_model_guard,
    generate_content_config=_LOG_GEN_CFG,
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
