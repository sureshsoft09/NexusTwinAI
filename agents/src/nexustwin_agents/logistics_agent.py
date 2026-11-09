"""Logistics Router Agent (logistics_agent).

Two-Stage Google ADK Pipeline:
  Stage 1: Investigate Agent (queries 3PL carrier rates and transit SLAs)
  Stage 2: Conclude Agent (optimizes freight cost vs. stockout runway across DC STOs and FMCG POs)
"""

from typing import Any, Dict
from nexustwin_agents import config
from nexustwin_agents.mcp_tools import LogisticsMCP_Tool
try:
    from shared.schemas import LogisticsOption, ReplenishmentProposal
except ImportError:
    from prototype.src.shared.schemas import LogisticsOption, ReplenishmentProposal

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


def quote_carrier_freight_lanes(origin_dc: str = "DC-ATX-02", destination_store: str = "STORE-DAL-04") -> Dict[str, Any]:
    """Retrieve 3PL freight quotes and transit SLAs between a donor DC / FMCG Plant and retail store."""
    return {
        "origin_dc": origin_dc,
        "destination_store": destination_store,
        "lanes": [
            {
                "freight_mode": "SCHEDULED_ECONOMY_PREPOSITION",
                "carrier_name": "Texas Rail & Ground Economy (25-Day Advance)",
                "freight_cost_usd": 480.00,
                "transit_eta_hours": 48.0,
                "within_1000_autonomy_limit": True,
            },
            {
                "freight_mode": "LATERAL_GROUND_TRANSFER",
                "carrier_name": "Texas Fleet Logistics (Dedicated)",
                "freight_cost_usd": 750.00,
                "transit_eta_hours": 14.0,
                "within_1000_autonomy_limit": True,
            },
            {
                "freight_mode": "FMCG_DIRECT_EXPEDITED_PO",
                "carrier_name": "HydroBoost Cold-Chain Direct Carrier",
                "freight_cost_usd": 1850.00,
                "transit_eta_hours": 12.0,
                "within_1000_autonomy_limit": False,
            },
            {
                "freight_mode": "EXPEDITED_AIR_FREIGHT",
                "carrier_name": "LoneStar Expedited Air Cargo",
                "freight_cost_usd": 3500.00,
                "transit_eta_hours": 4.5,
                "within_1000_autonomy_limit": False,
            },
        ],
    }


LOGISTICS_INSTRUCTION = """
You are the NexusTwin Logistics Optimization Specialist (`logistics_agent`).
Your task is to evaluate 3PL freight options that arrive safely BEFORE store shelves stock out:
1. Call `quote_carrier_freight_lanes` for freight options between the source node (Donor DC or FMCG Bottling Plant) and destination store.
2. Compare Economy Pre-Positioning ($480), Lateral Ground ($750), FMCG Direct Cold-Chain ($1,850), and Expedited Air ($3,500).
3. Report the selected carrier, freight cost, transit ETA, and whether the order executes autonomously (<= $1,000) or requires RemoteA2aAgent human-in-the-loop approval (> $1,000 or External FMCG PO).
"""

_logistics_tools = [quote_carrier_freight_lanes]
if not hasattr(LogisticsMCP_Tool, "name"):
    _logistics_tools.append(LogisticsMCP_Tool)

logistics_agent = LlmAgent(
    model=config.get_gemini_model(config.MODEL_REASONING),
    name="logistics_agent",
    description="Evaluates 3PL carrier freight rates and transit SLAs for DC transfers and FMCG POs.",
    instruction=LOGISTICS_INSTRUCTION,
    tools=_logistics_tools,
)

# Backwards-compatible aliases
logistics_investigate = logistics_agent
logistics_conclude = logistics_agent


class LogisticsService:
    """Service wrapper for standalone and programmatic execution across all 4 demo flows."""

    def evaluate(self, proposal: ReplenishmentProposal, store_stockout_hours: float) -> LogisticsOption:
        # Demo Flow 2: Shop 2 (STORE-HOU-05) -> DC-HOU-01 lacked ATP stock -> External PO to FMCG-PLANT-TX01
        if proposal.order_type == "PO_TO_FMCG" or proposal.dc_shortage_escalated_to_fmcg:
            return LogisticsOption(
                carrier_name="HydroBoost Cold-Chain Direct Carrier (FMCG PO)",
                freight_mode="FMCG_DIRECT_EXPEDITED_PO",
                origin_dc=proposal.selected_donor_dc,
                destination_store=proposal.target_store,
                transit_hours=12.0,
                freight_cost=1850.00,
                eta_iso="2026-11-05T19:00:00Z",
                service_level="FMCG_FACTORY_DIRECT_SLA",
            )

        # Legacy High-Value Air Freight scenario
        if proposal.sku_id == "SKU-1022-PROTEIN":
            return LogisticsOption(
                carrier_name="LoneStar Expedited Air Cargo",
                freight_mode="EXPEDITED_AIR_FREIGHT",
                origin_dc=proposal.selected_donor_dc,
                destination_store=proposal.target_store,
                transit_hours=4.5,
                freight_cost=3500.00,
                eta_iso="2026-11-05T16:30:00Z",
                service_level="PRIORITY_AIR_CARGO",
            )

        # Demo Flow 3: Shop 3 (STORE-PLANO-07) -> 25-Day Weather Forecast Prediction (600h runway)
        if store_stockout_hours >= 200.0 or proposal.target_store == "STORE-PLANO-07":
            return LogisticsOption(
                carrier_name="Texas Rail & Ground Economy (25-Day Pre-Position)",
                freight_mode="SCHEDULED_ECONOMY_PREPOSITION",
                origin_dc=proposal.selected_donor_dc,
                destination_store=proposal.target_store,
                transit_hours=48.0,
                freight_cost=480.00,
                eta_iso="2026-11-28T08:00:00Z",
                service_level="PROACTIVE_25D_WEATHER_BUFFER",
            )

        # Demo Flow 4: Shop 4 (STORE-ARL-11) -> Social Media Event Spike from DC-SAT-03
        if proposal.target_store == "STORE-ARL-11":
            return LogisticsOption(
                carrier_name="Alamo Regional Dedicated Express",
                freight_mode="LATERAL_GROUND_TRANSFER",
                origin_dc=proposal.selected_donor_dc,
                destination_store=proposal.target_store,
                transit_hours=10.0,
                freight_cost=680.00,
                eta_iso="2026-11-05T21:00:00Z",
                service_level="EVENT_SURGE_GUARANTEED",
            )

        # Demo Flow 1: Shop 1 (STORE-DAL-04) -> Fast POS Surge fulfilled from Austin DC (DC-ATX-02)
        return LogisticsOption(
            carrier_name="Texas Fleet Logistics (Dedicated)",
            freight_mode="LATERAL_GROUND_TRANSFER",
            origin_dc=proposal.selected_donor_dc,
            destination_store=proposal.target_store,
            transit_hours=14.0,
            freight_cost=750.00,
            eta_iso="2026-11-05T23:00:00Z",
            service_level="GUARANTEED_NEXT_DAY_AM",
        )
