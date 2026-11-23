"""Root Supervisor Agent (`twin_supervisor`) with In-Loop 4-Gate Guardrail, Live Cloud Run MCPs,
and Remote A2A HITL Handover (`RemoteA2aAgent` -> Cloud Run `to_a2a(approval_agent)`).

Architecture:
  1. `market_sensing_agent` (AgentTool) -> calls Cloud Run `bigquery-telemetry-mcp` (real DB shelf/velocity/weather/social)
  2. `replenishment_agent` (AgentTool) -> calls Cloud Run `erp-inventory-mcp` (BigQuery `retail_erp_inventory` + isolated `fmcg_factory_inventory`)
  3. `logistics_agent` (AgentTool) -> calls Cloud Run `logistics-rates-mcp` (real 3PL quotes & Texas transit SLAs)
  4. `evaluate_4_gate_guardrail` (In-Loop Deterministic Python Tool) -> runs 4 math gates BEFORE any execution or VP pause
  5. Verified Branching:
       - `AUTO_EXECUTE_STO` (<= $1,000 internal STO) -> calls `create_transfer_order` on `erp-inventory-mcp`
       - `ESCALATE_TO_VP_A2A` (> $1,000 / External FMCG PO) -> transfers to `approval_agent` (`RemoteA2aAgent` on Cloud Run)
       - `REJECT_INFEASIBLE` (Gates 1-3 fail) -> blocks cleanly with zero ERP/VP action
"""

import os
from datetime import datetime, timezone
from typing import Any, Dict, Optional

from nexustwin_agents import config
from nexustwin_agents.sensing_agent import sensing_agent, MarketSensingService
from nexustwin_agents.replenishment_agent import replenishment_agent, ReplenishmentService
from nexustwin_agents.logistics_agent import logistics_agent, LogisticsService
from nexustwin_agents.mcp_tools import ErpMCP_Tool
from nexustwin_agents.gate import (
    evaluate_4_gate_guardrail,
    evaluate_feasibility_gate_from_common_output,
)

try:
    from shared.schemas import (
        GateEvaluationResult,
        GateStatus,
        LogisticsAgentCommonOutput,
        MarketSignalEvent,
        MultiAgentCommonOutput,
        ReplenishmentAgentCommonOutput,
        ReplenishmentDecisionManifest,
        SensingAgentCommonOutput,
    )
    from shared.topology import get_node_display_name
    from shared.bq_lakehouse import bq_lakehouse
except ImportError:
    from prototype.src.shared.schemas import (
        GateEvaluationResult,
        GateStatus,
        LogisticsAgentCommonOutput,
        MarketSignalEvent,
        MultiAgentCommonOutput,
        ReplenishmentAgentCommonOutput,
        ReplenishmentDecisionManifest,
        SensingAgentCommonOutput,
    )
    from prototype.src.shared.topology import get_node_display_name
    from prototype.src.shared.bq_lakehouse import bq_lakehouse


try:
    from google.adk.agents import LlmAgent
    from google.adk.agents.remote_a2a_agent import AGENT_CARD_WELL_KNOWN_PATH
    from google.adk.agents.remote_a2a_agent import RemoteA2aAgent
    from google.adk.tools import AgentTool
    from google.genai import types

    sensing_tool = AgentTool(agent=sensing_agent)
    replenishment_tool = AgentTool(agent=replenishment_agent)
    logistics_tool = AgentTool(agent=logistics_agent)

    _a2a_base = config.A2A_APPROVAL_AGENT_BASE_URL.rstrip("/")
    if (
        os.getenv("AGENT_ENGINE_DEPLOY", "").lower() == "true"
        and ("localhost" in _a2a_base or "127.0.0.1" in _a2a_base)
    ):
        # Safety guard only if someone deploys with localhost; public Cloud Run HTTPS uses RemoteA2aAgent
        from human_in_loop.agent import root_agent as _in_process_approval_agent
        approval_agent = _in_process_approval_agent
    else:
        approval_agent = RemoteA2aAgent(
            name="approval_agent",
            description=(
                "Remote A2A Supply Chain Governance & Human-in-the-Loop VP Approval Agent on Cloud Run. "
                "Handles External B2B FMCG Purchase Orders and replenishment transfers exceeding $1,000.00. "
                "Pauses with `input-required` and resumes to execute via ERP MCP upon VP sign-off."
            ),
            agent_card=f"{_a2a_base}{AGENT_CARD_WELL_KNOWN_PATH}",
        )

    SUPERVISOR_INSTRUCTION = """
You are `twin_supervisor`, the NexusTwin AI Autonomous Supply Chain Orchestrator across a Retail Network
(6 Texas Stores + 3 Regional Warehouses) and an upstream FMCG Manufacturer (`FMCG-PLANT-TX01`), plus 3PL Carriers.
Never invent numbers — all metrics MUST come from live MCP tools via your specialist agents.

NETWORK DEFAULTS (use when not specified in the input alert):
- Product: `SKU-4089-HYDRATE` (HydroBoost Electrolyte 12-Pack, unit_gross_margin_usd=6.20)
- Store -> Serving DC & Default Qty:
  * `STORE-DAL-04` (Shop 1: Dallas) -> `DC-ATX-02`, 1500 packs, `STANDARD`
  * `STORE-HOU-05` (Shop 2: Houston) -> `DC-HOU-01`, 1800 packs, `STANDARD` (or `FMCG_DIRECT` if escalated to `FMCG-PLANT-TX01`)
  * `STORE-PLANO-07` (Shop 3: Plano) -> `DC-ATX-02`, 1500 packs, `ADVANCE_25D`
  * `STORE-ARL-11` (Shop 4: Arlington) -> `DC-SAT-03`, 1200 packs, `EVENT_SURGE`
  * `STORE-FW-02` -> `DC-ATX-02`; `STORE-SAT-06` -> `DC-SAT-03`

COMMON DEFAULT 6-STEP WORKFLOW (apply automatically to every incoming demand/telemetry/weather/social alert;
if the user supplies a specific custom workflow override OR a Retail VP approval resume token `SIG-...`, follow that
specific instruction directly without re-running Steps 1-3):
1. SENSING (call `market_sensing_agent` ONCE): pass `store_id`, `sku_id`, `signal_source` to fetch live shelf stock, velocity, and weather/social context.
2. REPLENISHMENT (call `replenishment_agent` ONCE): pass `store_id`, `serving_dc`, `sku_id`, `requested_units` to verify live Retail DC ATP (and escalate to `FMCG-PLANT-TX01` ONLY if DC ATP < `requested_units`).
3. LOGISTICS (call `logistics_agent` ONCE): pass `selected_source_node`, `store_id`, `requested_units`, and `urgency` (`FMCG_DIRECT` if `selected_source_node == "FMCG-PLANT-TX01"`, else alert urgency hint).
4. IN-LOOP 4-GATE GUARDRAIL (call `evaluate_4_gate_guardrail` ONCE BEFORE any ERP write or VP handover):
   Pass EXACT numeric values from Steps 1-3: `event_id`, `order_type` (`"STO_FROM_DC"` or `"PO_TO_FMCG"`),
   `source_node`, `source_atp_surplus`, `requested_units`, `transit_hours`, `sla_window_hours`,
   `freight_cost_usd`, `merchandise_cost_usd`, `unit_gross_margin_usd=6.20`, `has_human_approval=False`.
5. VERIFIED EXECUTION / HANDOVER (obey `evaluate_4_gate_guardrail.decision` strictly):
   - `AUTO_EXECUTE_STO`: call `create_transfer_order(from_dc, to_location, sku, quantity, freight_cost_usd, event_id=...)` on `erp-inventory-mcp`.
   - `ESCALATE_TO_VP_A2A`: NEVER call ERP write tools! Transfer to `approval_agent` passing exact `purpose`, `amount` (`total_commitment_usd`), `sku_id`, `donor_dc` (`selected_source_node`), `target_store`, `units`, `freight_cost`, `merchandise_cost`, `event_id`.
   - `REJECT_INFEASIBLE`: stop immediately with zero ERP or VP action.
6. CONCISE STRUCTURED JSON OUTPUT:
   Keep prose to 1-2 sentences and ALWAYS include a valid fenced ```json ... ``` block with these exact keys and real MCP numbers:
   ```json
   {
     "sensing_agent_output": {
       "store_id": "STORE-DAL-04", "sku_id": "SKU-4089-HYDRATE", "signal_source": "POS_SCANNER",
       "observed_velocity_hr": 215.0, "baseline_velocity_hr": 48.0, "velocity_spike_ratio": 4.48,
       "current_shelf_stock": 180, "safety_buffer": 250, "stockout_runway_hours": 0.8,
       "mcp_tools_called": ["get_scanner_velocity_history"], "activities_performed": ["..."], "finding_summary": "..."
     },
     "replenishment_agent_output": {
       "serving_dc_id": "DC-ATX-02", "serving_dc_on_hand": 4800, "serving_dc_safety_buffer": 1200,
       "serving_dc_atp_surplus": 3600, "requested_units": 1500, "serving_dc_has_stock": true,
       "escalated_to_fmcg": false, "selected_source_node": "DC-ATX-02", "selected_source_atp_surplus": 3600,
       "order_type": "STO_FROM_DC", "protected_margin_usd": 9300.0, "merchandise_cost_usd": 0.0,
       "supplier_negotiation_summary": "...", "mcp_tools_called": ["get_dc_available_to_promise"],
       "activities_performed": ["..."], "finding_summary": "..."
     },
     "logistics_agent_output": {
       "origin_node": "DC-ATX-02", "destination_store": "STORE-DAL-04",
       "carrier_name": "Texas Fleet Logistics (Dedicated Ground)", "freight_mode": "LATERAL_GROUND_TRANSFER",
       "transit_hours": 5.5, "sla_window_hours": 12.0, "freight_cost_usd": 750.0,
       "total_commitment_usd": 750.0, "carrier_negotiation_summary": "...",
       "mcp_tools_called": ["calculate_freight_rates"], "activities_performed": ["..."], "finding_summary": "..."
     },
     "final_execution": {
       "gate_status": "APPROVED", "order_type": "STO_FROM_DC",
       "sap_transfer_order_id": "STO-SAP-XXXXXX", "fmcg_purchase_order_id": null,
       "a2a_ticket_id": null, "a2a_task_state": "completed", "executive_summary": "..."
     }
   }
   ```
"""

    twin_supervisor = LlmAgent(
        name="twin_supervisor",
        model=config.get_gemini_model(config.MODEL_REASONING),
        description=(
            "NexusTwin AI Supply Chain Supervisor coordinating live MCP demand sensing, "
            "isolated Retail/FMCG ERP planning, 3PL logistics, deterministic 4-Gate guardrail, "
            "autonomous SAP STO execution, and Cloud Run RemoteA2aAgent VP governance."
        ),
        instruction=SUPERVISOR_INSTRUCTION,
        tools=[
            sensing_tool,
            replenishment_tool,
            logistics_tool,
            evaluate_4_gate_guardrail,
            ErpMCP_Tool,
        ],
        sub_agents=[approval_agent],
        before_model_callback=config.before_model_guard,
        generate_content_config=types.GenerateContentConfig(temperature=0.1),
    )

    root_agent = twin_supervisor

except ImportError:
    AGENT_CARD_WELL_KNOWN_PATH = "/.well-known/agent-card.json"

    class MockRemoteA2aAgent:
        def __init__(self, name: str, description: str, agent_card: str):
            self.name = name
            self.description = description
            self.agent_card = agent_card

    class MockAgent:
        def __init__(self, name: str, instruction: str, model: str = "gemini-3.5-flash", tools: list = None, sub_agents: list = None, **kwargs):
            self.name = name
            self.instruction = instruction
            self.model = model
            self.tools = tools or []
            self.sub_agents = sub_agents or []

    approval_agent = MockRemoteA2aAgent(
        name="approval_agent",
        description="Remote A2A HITL VP Approval Agent",
        agent_card=f"{config.A2A_APPROVAL_AGENT_BASE_URL.rstrip('/')}{AGENT_CARD_WELL_KNOWN_PATH}",
    )
    root_agent = MockAgent(
        model=config.ADK_MODEL,
        name="twin_supervisor",
        instruction="NexusTwin Autonomous Supply Chain Supervisor",
        tools=[evaluate_4_gate_guardrail],
        sub_agents=[approval_agent],
    )
    twin_supervisor = root_agent


STORE_SERVING_DC = {
    "STORE-DAL-04": "DC-ATX-02",
    "STORE-PLANO-07": "DC-ATX-02",
    "STORE-FW-02": "DC-ATX-02",
    "STORE-HOU-05": "DC-HOU-01",
    "STORE-ARL-11": "DC-SAT-03",
    "STORE-SAT-06": "DC-SAT-03",
}


class NexusTwinSupervisor:
    """Offline fallback orchestrator (used ONLY if Vertex AI Agent Engine is unreachable)."""

    def __init__(self):
        self.sensing_svc = MarketSensingService()
        self.replenishment_svc = ReplenishmentService()
        self.logistics_svc = LogisticsService()
        self.approval_agent_card = f"{config.A2A_APPROVAL_AGENT_BASE_URL.rstrip('/')}{AGENT_CARD_WELL_KNOWN_PATH}"

    def build_common_agent_output(
        self,
        event: MarketSignalEvent,
        scenario_key: Optional[str] = None,
    ) -> tuple[MultiAgentCommonOutput, Any, Any, Any]:
        requested_units = event.requested_units_override or (
            1800 if event.store_id == "STORE-HOU-05" else (1200 if event.store_id == "STORE-ARL-11" else 1500)
        )
        sensing_context = self.sensing_svc.analyze(event)
        store_inv = bq_lakehouse.get_node_inventory(event.store_id, event.sku_id)
        store_safety = int(store_inv.get("safety_buffer", 250))

        if event.signal_source == "WEATHER_FORECAST_25D":
            sla_window, transit_hrs = 600.0, 36.0
        elif event.signal_source == "SOCIAL_MEDIA_MONITOR":
            sla_window, transit_hrs = 24.0, 6.5
        elif event.store_id == "STORE-HOU-05":
            sla_window, transit_hrs = 16.0, 6.0
        else:
            sla_window, transit_hrs = 12.0, 5.5

        sensing_out = SensingAgentCommonOutput(
            signal_source=event.signal_source,
            store_id=event.store_id,
            store_display_name=get_node_display_name(event.store_id),
            sku_id=event.sku_id,
            observed_velocity_hr=event.observed_velocity,
            baseline_velocity_hr=event.baseline_velocity,
            velocity_spike_ratio=sensing_context.velocity_spike_ratio,
            current_shelf_stock=int(store_inv.get("on_hand", event.current_store_stock)),
            safety_buffer=store_safety,
            stockout_runway_hours=sensing_context.projected_stockout_hours,
            anomaly_detected=True,
            mcp_tools_called=["bigquery-telemetry-mcp:get_scanner_velocity_history"],
            activities_performed=[
                f"Queried live shelf state for {get_node_display_name(event.store_id)}: {store_inv.get('on_hand', event.current_store_stock)} packs on shelf",
                f"Detected velocity {event.observed_velocity:.0f}/hr ({sensing_context.velocity_spike_ratio}x baseline)",
            ],
            finding_summary=sensing_context.root_cause_explanation,
        )

        proposal = self.replenishment_svc.propose(context=sensing_context, requested_units=requested_units)
        serving_dc_id = STORE_SERVING_DC.get(event.store_id, "DC-ATX-02")
        serving_dc_inv = bq_lakehouse.get_node_inventory(serving_dc_id, event.sku_id, prefer_bigquery_erp=True)
        dc_on_hand = int(serving_dc_inv.get("on_hand", 0))
        dc_safety = int(serving_dc_inv.get("safety_buffer", 0))
        dc_atp = max(0, dc_on_hand - dc_safety)
        is_fmcg = proposal.order_type == "PO_TO_FMCG"
        source_node = "FMCG-PLANT-TX01" if is_fmcg else serving_dc_id
        source_atp = proposal.donor_atp_surplus

        rep_out = ReplenishmentAgentCommonOutput(
            serving_dc_id=serving_dc_id,
            serving_dc_display_name=get_node_display_name(serving_dc_id),
            serving_dc_on_hand=dc_on_hand,
            serving_dc_safety_buffer=dc_safety,
            serving_dc_atp_surplus=dc_atp,
            requested_units=proposal.units_to_transfer,
            serving_dc_has_stock=not is_fmcg,
            escalated_to_fmcg=is_fmcg,
            selected_source_node=source_node,
            selected_source_display_name=get_node_display_name(source_node),
            selected_source_atp_surplus=source_atp,
            order_type=proposal.order_type,
            unit_gross_margin_usd=6.20,
            protected_margin_usd=proposal.projected_protected_revenue,
            merchandise_cost_usd=proposal.fmcg_po_merchandise_cost,
            supplier_negotiation_summary=(
                f"Escalated across B2B boundary to {get_node_display_name('FMCG-PLANT-TX01')}: "
                f"$8.79/pack contract tier (${proposal.fmcg_po_merchandise_cost:,.2f} merchandise)."
                if is_fmcg
                else f"Internal Retail Warehouse transfer from {get_node_display_name(serving_dc_id)} ({dc_atp:,} spare ATP)."
            ),
            mcp_tools_called=(
                ["erp-inventory-mcp:get_dc_available_to_promise", "erp-inventory-mcp:check_fmcg_manufacturer_capacity"]
                if is_fmcg
                else ["erp-inventory-mcp:get_dc_available_to_promise"]
            ),
            activities_performed=[
                f"Queried BigQuery retail_erp_inventory for {get_node_display_name(serving_dc_id)}: {dc_atp:,} spare ATP",
            ],
            finding_summary=(
                f"{get_node_display_name(serving_dc_id)} has only {dc_atp:,} ATP (< {requested_units:,}); escalated to {get_node_display_name('FMCG-PLANT-TX01')}."
                if is_fmcg
                else f"{get_node_display_name(serving_dc_id)} has {dc_atp:,} spare ATP (>= {requested_units:,} needed)."
            ),
        )

        logistics_opt = self.logistics_svc.evaluate(proposal=proposal, store_stockout_hours=sensing_context.projected_stockout_hours)
        total_commitment = round(logistics_opt.freight_cost + proposal.fmcg_po_merchandise_cost, 2)

        log_out = LogisticsAgentCommonOutput(
            origin_node=source_node,
            destination_store=event.store_id,
            carrier_name=logistics_opt.carrier_name,
            freight_mode=logistics_opt.freight_mode,
            transit_hours=transit_hrs,
            sla_window_hours=sla_window,
            freight_cost_usd=logistics_opt.freight_cost,
            total_commitment_usd=total_commitment,
            carrier_negotiation_summary=f"Selected {logistics_opt.carrier_name} ({transit_hrs}h <= {sla_window}h SLA) at ${logistics_opt.freight_cost:,.2f}.",
            mcp_tools_called=["logistics-rates-mcp:calculate_freight_rates"],
            activities_performed=[f"Quoted 3PL carriers for {source_node} -> {event.store_id}"],
            finding_summary=f"Selected {logistics_opt.carrier_name} at ${logistics_opt.freight_cost:,.2f} (Total commitment: ${total_commitment:,.2f}).",
        )

        common_output = MultiAgentCommonOutput(
            event_id=event.event_id,
            scenario_key=scenario_key,
            data_source="LOCAL_FALLBACK",
            sensing_agent_output=sensing_out,
            replenishment_agent_output=rep_out,
            logistics_agent_output=log_out,
        )
        return common_output, sensing_context, proposal, logistics_opt

    async def run_resolution_cycle(
        self,
        event: MarketSignalEvent,
        has_human_approval: bool = False,
        approver_token: Optional[str] = None,
        scenario_key: Optional[str] = None,
    ) -> ReplenishmentDecisionManifest:
        common_output, sensing_context, proposal, logistics_opt = self.build_common_agent_output(
            event=event,
            scenario_key=scenario_key,
        )
        gate_res: GateEvaluationResult = evaluate_feasibility_gate_from_common_output(
            common_output=common_output,
            has_human_approval=has_human_approval,
            approver_token=approver_token,
        )

        sap_sto_id = None
        fmcg_po_id = None
        if gate_res.passed and gate_res.gate_status == GateStatus.APPROVED:
            if proposal.order_type == "PO_TO_FMCG":
                fmcg_po_id = f"PO-FMCG-{os.urandom(3).hex().upper()}"
                sap_sto_id = fmcg_po_id
            else:
                sap_sto_id = f"STO-SAP-{os.urandom(3).hex().upper()}"

        return ReplenishmentDecisionManifest(
            event_id=event.event_id,
            sku_id=event.sku_id,
            target_store=event.store_id,
            target_store_display_name=get_node_display_name(event.store_id),
            selected_donor_dc=common_output.replenishment_agent_output.selected_source_node,
            selected_donor_display_name=get_node_display_name(common_output.replenishment_agent_output.selected_source_node),
            order_type=proposal.order_type,
            signal_source=event.signal_source,
            forecast_horizon_days=event.forecast_horizon_days,
            units_transferred=proposal.units_to_transfer,
            freight_mode=logistics_opt.freight_mode,
            carrier_name=logistics_opt.carrier_name,
            estimated_freight_cost=logistics_opt.freight_cost,
            fmcg_po_merchandise_cost=proposal.fmcg_po_merchandise_cost,
            total_financial_commitment=common_output.logistics_agent_output.total_commitment_usd,
            root_cause_explanation=sensing_context.root_cause_explanation,
            gate_status=gate_res.gate_status,
            requires_human_approval=gate_res.requires_human_approval,
            sap_transfer_order_id=sap_sto_id,
            fmcg_purchase_order_id=fmcg_po_id,
            data_source="LOCAL_FALLBACK",
            common_agent_output=common_output,
            gate_evaluation=gate_res,
            created_at=datetime.now(timezone.utc),
        )
