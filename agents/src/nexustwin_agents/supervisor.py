"""Root Supervisor Agent (twin_supervisor) with Remote A2A HITL Handover & FMCG PO Execution.

Built with Google Agent Development Kit (ADK):
  - `from google.adk.agents.llm_agent import Agent`
  - `from google.adk.agents.remote_a2a_agent import AGENT_CARD_WELL_KNOWN_PATH, RemoteA2aAgent`
  - `from google.genai import types`

Coordinates:
  1. In-process ADK SequentialAgent tools (`sensing_agent`, `replenishment_agent`, `logistics_agent`)
  2. Standardized Common Multi-Agent Output (`MultiAgentCommonOutput`) including BigQuery checks,
     SAP ERP checks, Supplier/Factory Price Negotiation, and 3PL Carrier Rate Negotiation
  3. Mandatory 4-Rule Mathematical Feasibility Gate (`evaluate_feasibility_gate_from_common_output`)
  4. Autonomous SAP Stock Transfer Order execution (`execute_replenishment_sto`) when <= $1,000
     or Remote A2A Human-in-the-Loop delegation (`approval_agent = RemoteA2aAgent(...)`) when > $1,000
"""

import os
from datetime import datetime, timezone
from typing import Any, Dict, Optional

from nexustwin_agents import config
from nexustwin_agents.sensing_agent import sensing_agent, MarketSensingService
from nexustwin_agents.replenishment_agent import replenishment_agent, ReplenishmentService
from nexustwin_agents.logistics_agent import logistics_agent, LogisticsService
from nexustwin_agents.gate import evaluate_feasibility_gate_from_common_output

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
    from prototype.src.shared.bq_lakehouse import bq_lakehouse


def execute_replenishment_sto(
    purpose: str,
    amount: float,
    sku_id: str = "SKU-4089-HYDRATE",
    donor_dc: str = "DC-ATX-02",
    target_store: str = "STORE-DAL-04",
    units: int = 1500,
) -> Dict[str, Any]:
    """Execute autonomous SAP Stock Transfer Order (STO) from a Regional DC when DC has ATP and freight <= $1,000."""
    return {
        "status": "ok",
        "order_type": "STO_FROM_DC",
        "sap_transfer_order_id": f"STO-SAP-{os.urandom(3).hex().upper()}",
        "purpose": purpose,
        "amount": amount,
        "sku_id": sku_id,
        "donor_dc": donor_dc,
        "target_store": target_store,
        "units": units,
    }


def execute_fmcg_purchase_order(
    purpose: str,
    freight_amount: float,
    merchandise_amount: float,
    sku_id: str = "SKU-4089-HYDRATE",
    fmcg_vendor_id: str = "FMCG-PLANT-TX01",
    target_store: str = "STORE-HOU-05",
    units: int = 1800,
) -> Dict[str, Any]:
    """Execute an External Purchase Order (PO) to the FMCG Manufacturer (HydroBoost Bottling Plant)
    when the serving Regional DC lacks sufficient ATP stock.
    """
    po_id = f"PO-FMCG-{os.urandom(3).hex().upper()}"
    return {
        "status": "ok",
        "order_type": "PO_TO_FMCG",
        "fmcg_purchase_order_id": po_id,
        "sap_transfer_order_id": po_id,
        "purpose": purpose,
        "freight_amount": freight_amount,
        "merchandise_amount": merchandise_amount,
        "total_commitment_usd": round(freight_amount + merchandise_amount, 2),
        "sku_id": sku_id,
        "fmcg_vendor_id": fmcg_vendor_id,
        "target_store": target_store,
        "units": units,
    }


try:
    from google.adk.agents import LlmAgent
    from google.adk.agents.remote_a2a_agent import AGENT_CARD_WELL_KNOWN_PATH
    from google.adk.agents.remote_a2a_agent import RemoteA2aAgent
    from google.adk.tools import AgentTool
    from google.genai import types

    sensing_tool = AgentTool(agent=sensing_agent)
    replenishment_tool = AgentTool(agent=replenishment_agent)
    logistics_tool = AgentTool(agent=logistics_agent)

    if (
        os.getenv("AGENT_ENGINE_DEPLOY", "").lower() == "true"
        and "localhost" in config.A2A_APPROVAL_AGENT_BASE_URL
    ):
        from human_in_loop.agent import root_agent as _in_process_approval_agent
        approval_agent = _in_process_approval_agent
    else:
        approval_agent = RemoteA2aAgent(
            name="approval_agent",
            description=(
                "Help approve the replenishment stock transfer or external FMCG Purchase Order "
                "if the expenditure is greater than $1000."
            ),
            agent_card=(
                f"{config.A2A_APPROVAL_AGENT_BASE_URL}{AGENT_CARD_WELL_KNOWN_PATH}"
            ),
        )

    SUPERVISOR_INSTRUCTION = """
You are the NexusTwin AI Autonomous Supply Chain Supervisor coordinating multi-agent
demand sensing, inventory replenishment, supplier negotiation, and 3PL logistics across
6 retail stores, 3 regional DCs, and 1 upstream FMCG bottling plant for `SKU-4089-HYDRATE`.

Workflow:
1. Call `market_sensing_agent` (sensing_tool) to query BigQuery Lakehouse telemetry and investigate
   real-time POS velocity surges, 25-day weather heatwave forecasts, or viral social media events.
2. Call `replenishment_agent` (replenishment_tool) to query SAP S/4HANA ERP inventory for Available-to-Promise
   (ATP) surplus at the serving regional DC (`DC-ATX-02`, `DC-HOU-01`, `DC-SAT-03`), or escalate upstream
   to the FMCG Manufacturer (`FMCG-PLANT-TX01`) and negotiate priority batch allocation & wholesale pricing
   when the serving DC lacks sufficient ATP stock.
3. Call `logistics_agent` (logistics_tool) to query 3PL carrier rate tables, negotiate lane rates, and verify
   delivery transit SLAs.
4. Enforce the 4-Rule Supply Chain Feasibility Gate ($1,000 autonomy threshold):
   - If total financial commitment <= $1,000, call `execute_replenishment_sto()` immediately.
   - If total financial commitment > $1,000, hand over to `approval_agent` (Remote A2A Agent) for VP sign-off.
"""

    twin_supervisor = LlmAgent(
        name="twin_supervisor",
        model=config.get_gemini_model(config.MODEL_REASONING),
        description=(
            "NexusTwin AI Supply Chain Supervisor coordinating multi-agent "
            "demand sensing, DC/FMCG replenishment, supplier negotiation, and 3PL logistics."
        ),
        instruction=SUPERVISOR_INSTRUCTION,
        tools=[
            sensing_tool,
            replenishment_tool,
            logistics_tool,
            execute_replenishment_sto,
            execute_fmcg_purchase_order,
        ],
        sub_agents=[approval_agent],
        generate_content_config=types.GenerateContentConfig(temperature=0.1),
    )

    root_agent = twin_supervisor

except ImportError:
    AGENT_CARD_WELL_KNOWN_PATH = "/.well-known/agent.json"

    class MockRemoteA2aAgent:
        def __init__(self, name: str, description: str, agent_card: str):
            self.name = name
            self.description = description
            self.agent_card = agent_card

    class MockAgent:
        def __init__(
            self,
            name: str,
            instruction: str,
            model: str = "gemini-2.5-flash",
            tools: list = None,
            sub_agents: list = None,
            **kwargs,
        ):
            self.name = name
            self.instruction = instruction
            self.model = model
            self.tools = tools or []
            self.sub_agents = sub_agents or []

    approval_agent = MockRemoteA2aAgent(
        name="approval_agent",
        description="Help approve the replenishment stock transfer or FMCG PO if cost > $1000.",
        agent_card=f"{config.A2A_APPROVAL_AGENT_BASE_URL}{AGENT_CARD_WELL_KNOWN_PATH}",
    )

    root_agent = MockAgent(
        model=config.ADK_MODEL,
        name="twin_supervisor",
        instruction="NexusTwin Autonomous Supply Chain Supervisor with A2A HITL Handover",
        tools=[execute_replenishment_sto, execute_fmcg_purchase_order],
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
    """Enterprise orchestrator producing `MultiAgentCommonOutput` and evaluating the 4-Rule Gate."""

    def __init__(self):
        self.sensing_svc = MarketSensingService()
        self.replenishment_svc = ReplenishmentService()
        self.logistics_svc = LogisticsService()
        self.approval_agent_card = f"{config.A2A_APPROVAL_AGENT_BASE_URL}{AGENT_CARD_WELL_KNOWN_PATH}"

    def build_common_agent_output(
        self,
        event: MarketSignalEvent,
        scenario_key: Optional[str] = None,
    ) -> tuple[MultiAgentCommonOutput, Any, Any, Any]:
        """Run the 3 specialized agents (`sensing_agent` -> `replenishment_agent` -> `logistics_agent`)
        and package their findings + MCP tool activities into `MultiAgentCommonOutput`.
        """
        if event.requested_units_override:
            requested_units = event.requested_units_override
        elif event.store_id == "STORE-HOU-05":
            requested_units = 1800
        elif event.store_id == "STORE-ARL-11":
            requested_units = 1200
        else:
            requested_units = 1500

        # 1. Market Sensing Agent (`sensing_agent`) — Queries BigQuery Lakehouse & External Feeds
        sensing_context = self.sensing_svc.analyze(event)
        store_inv = bq_lakehouse.inventory.get(event.store_id, {}).get(event.sku_id, {})
        store_safety_buffer = int(store_inv.get("safety_buffer", 250))

        if event.signal_source == "WEATHER_FORECAST_25D":
            sensing_tools = [
                "bigquery-telemetry-mcp:get_long_range_weather_forecast(STORE-PLANO-07, days=25)",
                "bigquery-telemetry-mcp:query_pos_velocity_anomalies(STORE-PLANO-07)",
            ]
            sensing_activities = [
                "Queried BigQuery `weather_forecast_25d` table & Open-Meteo 25-Day API for Plano, TX",
                "Detected 104.2°F Extreme Heat Dome arriving Day 16–25 (+220% projected hydration demand)",
                "Calculated proactive pre-positioning window (25 days ahead of shelf depletion)",
            ]
            sla_window = 120.0
            transit_hrs = 18.0
        elif event.signal_source == "SOCIAL_MEDIA_MONITOR":
            sensing_tools = [
                "bigquery-telemetry-mcp:monitor_social_media_and_forums(STORE-ARL-11)",
                "bigquery-telemetry-mcp:get_regional_market_signals(Arlington_TX)",
            ]
            sensing_activities = [
                "Queried BigQuery `social_media_signals` table & Reddit/X local event stream",
                "Verified viral buzz score 94.5/100 for Arlington Stadium Charity Marathon (18,500 runners, 1.2 mi away)",
                f"Projected store checkout surge to {event.observed_velocity:.0f} packs/hr vs {event.baseline_velocity:.0f}/hr baseline",
            ]
            sla_window = 24.0
            transit_hrs = 4.5
        else:
            sensing_tools = [
                f"bigquery-telemetry-mcp:query_pos_velocity_anomalies({event.store_id})",
                f"bigquery-telemetry-mcp:get_regional_market_signals({event.store_id})",
            ]
            sensing_activities = [
                f"Queried BigQuery `store_pos_velocity_logs` real-time streaming table for {event.store_id}",
                f"Confirmed checkout velocity spike: {event.observed_velocity:.0f} packs/hr vs {event.baseline_velocity:.0f}/hr baseline ({sensing_context.velocity_spike_ratio}x)",
                f"Verified shelf stock ({event.current_store_stock} packs) is below safety reserve ({store_safety_buffer} packs) with {sensing_context.projected_stockout_hours}h until empty shelf",
            ]
            sla_window = 16.0 if event.store_id == "STORE-HOU-05" else 12.0
            transit_hrs = 6.0 if event.store_id == "STORE-HOU-05" else 3.5

        sensing_out = SensingAgentCommonOutput(
            signal_source=event.signal_source,
            store_id=event.store_id,
            sku_id=event.sku_id,
            observed_velocity_hr=event.observed_velocity,
            baseline_velocity_hr=event.baseline_velocity,
            velocity_spike_ratio=sensing_context.velocity_spike_ratio,
            current_shelf_stock=event.current_store_stock,
            safety_buffer=store_safety_buffer,
            stockout_runway_hours=sensing_context.projected_stockout_hours,
            anomaly_detected=True,
            mcp_tools_called=sensing_tools,
            activities_performed=sensing_activities,
            finding_summary=sensing_context.root_cause_explanation,
        )

        # 2. Stock & Replenishment Agent (`replenishment_agent`) — SAP ERP Check & Supplier Negotiation
        proposal = self.replenishment_svc.propose(
            context=sensing_context,
            requested_units=requested_units,
        )
        serving_dc_id = STORE_SERVING_DC.get(event.store_id, "DC-ATX-02")
        serving_dc_inv = bq_lakehouse.inventory.get(serving_dc_id, {}).get(event.sku_id, {})
        dc_on_hand = int(serving_dc_inv.get("on_hand", 4800))
        dc_safety = int(serving_dc_inv.get("safety_buffer", 1200))
        dc_atp = int(serving_dc_inv.get("atp_surplus", max(0, dc_on_hand - dc_safety)))
        is_fmcg = proposal.order_type == "PO_TO_FMCG"

        if is_fmcg:
            fmcg_inv = bq_lakehouse.inventory.get("FMCG-PLANT-TX01", {}).get(event.sku_id, {})
            source_atp = int(fmcg_inv.get("atp_surplus", 45000))
            rep_tools = [
                f"erp-inventory-mcp:get_dc_inventory_atp({serving_dc_id}, {event.sku_id})",
                "erp-inventory-mcp:check_fmcg_manufacturer_capacity(FMCG-PLANT-TX01)",
                "erp-inventory-mcp:negotiate_supplier_batch_pricing(FMCG-PLANT-TX01, units=1800)",
            ]
            negotiation_summary = (
                "Negotiated direct factory batch allocation with Waco Bottling Factory (FMCG-PLANT-TX01): "
                "secured wholesale tier rate of $8.79/pack (down from $9.60 spot price, saving $1,458.00) "
                "with immediate cold-chain dock release for 1,800 packs ($15,822.00 merchandise)."
            )
            rep_activities = [
                f"Checked SAP S/4HANA ERP stock at serving {serving_dc_id}: only {dc_atp} spare packs (< {requested_units:,} needed) -> DC Shortage!",
                f"Queried Waco Bottling Factory (`FMCG-PLANT-TX01`) ERP database: verified {source_atp:,} spare packs available",
                "Executed automated supplier negotiation via MCP: locked in $8.79/pack contract tier (saving $1,458 vs spot) & priority production slot",
            ]
            rep_finding = (
                f"Serving warehouse {serving_dc_id} only has {dc_atp} spare packs (< {requested_units:,} required). "
                f"Escalated to Waco Bottling Factory ({source_atp:,} spare packs) and negotiated $8.79/pack wholesale PO ($15,822.00)."
            )
        else:
            source_atp = dc_atp
            rep_tools = [
                f"erp-inventory-mcp:get_dc_inventory_atp({serving_dc_id}, {event.sku_id})",
                f"erp-inventory-mcp:verify_safety_buffer_compliance({serving_dc_id})",
                f"erp-inventory-mcp:reserve_internal_sto_allocation({serving_dc_id}, units={requested_units})",
            ]
            negotiation_summary = (
                f"Internal warehouse stock transfer from {serving_dc_id} ({dc_atp:,} spare packs available above "
                f"{dc_safety:,} safety reserve). $0 external supplier merchandise purchase required."
            )
            rep_activities = [
                f"Checked SAP S/4HANA ERP inventory at {serving_dc_id}: {dc_on_hand:,} On-Hand, {dc_safety:,} Safety Reserve, {dc_atp:,} Spare ATP",
                f"Confirmed {dc_atp:,} spare packs >= {requested_units:,} needed without touching warehouse safety reserve",
                f"Allocated {requested_units:,} packs for Internal Stock Transfer Order (`STO_FROM_DC`) protecting ${proposal.projected_protected_revenue:,.2f} store margin",
            ]
            rep_finding = (
                f"Warehouse {serving_dc_id} has {dc_atp:,} spare packs (>= {requested_units:,} needed). "
                f"Reserved {requested_units:,} packs for internal warehouse transfer."
            )

        rep_out = ReplenishmentAgentCommonOutput(
            serving_dc_id=serving_dc_id,
            serving_dc_on_hand=dc_on_hand,
            serving_dc_safety_buffer=dc_safety,
            serving_dc_atp_surplus=dc_atp,
            requested_units=proposal.units_to_transfer,
            serving_dc_has_stock=not is_fmcg,
            escalated_to_fmcg=is_fmcg,
            selected_source_node="FMCG-PLANT-TX01" if is_fmcg else serving_dc_id,
            selected_source_atp_surplus=source_atp,
            order_type=proposal.order_type,
            unit_gross_margin_usd=6.20,
            protected_margin_usd=proposal.projected_protected_revenue,
            merchandise_cost_usd=proposal.fmcg_po_merchandise_cost,
            supplier_negotiation_summary=negotiation_summary,
            mcp_tools_called=rep_tools,
            activities_performed=rep_activities,
            finding_summary=rep_finding,
        )

        # 3. Carrier & Logistics Agent (`logistics_agent`) — 3PL Rate Comparison & Carrier Negotiation
        logistics_opt = self.logistics_svc.evaluate(
            proposal=proposal,
            store_stockout_hours=sensing_context.projected_stockout_hours,
        )
        proposal.selected_logistics = logistics_opt
        total_commitment = round(logistics_opt.freight_cost + proposal.fmcg_po_merchandise_cost, 2)

        log_tools = [
            f"logistics-rates-mcp:quote_3pl_freight_lanes({rep_out.selected_source_node}, {event.store_id})",
            "logistics-rates-mcp:negotiate_carrier_spot_rate(units=" + str(proposal.units_to_transfer) + ")",
            "logistics-rates-mcp:verify_delivery_sla_window()",
        ]
        if event.signal_source == "WEATHER_FORECAST_25D":
            carrier_neg = (
                "Compared 3PL carriers 25 days ahead: negotiated scheduled economy backhaul rate of $480.00 "
                "(saving $3,020 vs $3,500 emergency air freight — 86% freight reduction)."
            )
        elif is_fmcg:
            carrier_neg = (
                "Negotiated direct factory cold-chain reefer lane from Waco Plant to Houston Store at $1,850.00 "
                "(6.0h express transit, bypassing DC cross-docking delay)."
            )
        else:
            carrier_neg = (
                f"Polled 3 regional 3PL carriers and negotiated dedicated ground truck rate at ${logistics_opt.freight_cost:,.2f} "
                f"({transit_hrs}h transit <= {sla_window}h SLA window, avoiding $3,500 air cargo)."
            )

        log_activities = [
            f"Queried 3PL Logistics MCP rate tables for lane `{rep_out.selected_source_node} -> {event.store_id}`",
            carrier_neg,
            f"Confirmed total financial commitment: ${total_commitment:,.2f} (${logistics_opt.freight_cost:,.2f} shipping + ${proposal.fmcg_po_merchandise_cost:,.2f} merchandise)",
        ]

        log_out = LogisticsAgentCommonOutput(
            origin_node=rep_out.selected_source_node,
            destination_store=event.store_id,
            carrier_name=logistics_opt.carrier_name,
            freight_mode=logistics_opt.freight_mode,
            transit_hours=transit_hrs,
            sla_window_hours=sla_window,
            freight_cost_usd=logistics_opt.freight_cost,
            total_commitment_usd=total_commitment,
            carrier_negotiation_summary=carrier_neg,
            mcp_tools_called=log_tools,
            activities_performed=log_activities,
            finding_summary=(
                f"Selected {logistics_opt.carrier_name} ({transit_hrs}h transit <= {sla_window}h window) "
                f"at ${logistics_opt.freight_cost:,.2f} shipping (Total Commitment: ${total_commitment:,.2f})."
            ),
        )

        common_output = MultiAgentCommonOutput(
            event_id=event.event_id,
            scenario_key=scenario_key,
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
        """Execute end-to-end multi-agent resolution loop:
        1. Build `MultiAgentCommonOutput` from the 3 agents (`sensing`, `replenishment`, `logistics`).
        2. Evaluate the 4 Mandatory Mathematical Gate Checks on `MultiAgentCommonOutput`.
        3. Execute final ERP order (`<= $1,000`) or route to Remote A2A Approval Queue (`> $1,000`).
        """
        common_output, sensing_context, proposal, logistics_opt = self.build_common_agent_output(
            event=event,
            scenario_key=scenario_key,
        )

        # Evaluate the 4 Mandatory Mathematical Gate Checks directly on the Common Output
        gate_res: GateEvaluationResult = evaluate_feasibility_gate_from_common_output(
            common_output=common_output,
            has_human_approval=has_human_approval,
            approver_token=approver_token,
        )

        sap_sto_id = None
        fmcg_po_id = None
        if gate_res.passed and gate_res.gate_status == GateStatus.APPROVED:
            if proposal.order_type == "PO_TO_FMCG":
                po_res = execute_fmcg_purchase_order(
                    purpose=f"External FMCG PO for {event.sku_id} at {event.store_id}",
                    freight_amount=logistics_opt.freight_cost,
                    merchandise_amount=proposal.fmcg_po_merchandise_cost,
                    sku_id=event.sku_id,
                    fmcg_vendor_id=proposal.fmcg_vendor_id or "FMCG-PLANT-TX01",
                    target_store=event.store_id,
                    units=proposal.units_to_transfer,
                )
                fmcg_po_id = po_res["fmcg_purchase_order_id"]
                sap_sto_id = fmcg_po_id
            else:
                sto_res = execute_replenishment_sto(
                    purpose=f"Replenish {event.sku_id} at {event.store_id}",
                    amount=logistics_opt.freight_cost,
                    sku_id=event.sku_id,
                    donor_dc=proposal.selected_donor_dc,
                    target_store=event.store_id,
                    units=proposal.units_to_transfer,
                )
                sap_sto_id = sto_res["sap_transfer_order_id"]

        total_commitment = common_output.logistics_agent_output.total_commitment_usd

        return ReplenishmentDecisionManifest(
            event_id=event.event_id,
            sku_id=event.sku_id,
            target_store=event.store_id,
            selected_donor_dc=proposal.selected_donor_dc,
            order_type=proposal.order_type,
            signal_source=event.signal_source,
            forecast_horizon_days=event.forecast_horizon_days,
            units_transferred=proposal.units_to_transfer,
            freight_mode=logistics_opt.freight_mode,
            carrier_name=logistics_opt.carrier_name,
            estimated_freight_cost=logistics_opt.freight_cost,
            fmcg_po_merchandise_cost=proposal.fmcg_po_merchandise_cost,
            total_financial_commitment=total_commitment,
            root_cause_explanation=sensing_context.root_cause_explanation,
            gate_status=gate_res.gate_status,
            requires_human_approval=gate_res.requires_human_approval,
            sap_transfer_order_id=sap_sto_id,
            fmcg_purchase_order_id=fmcg_po_id,
            common_agent_output=common_output,
            gate_evaluation=gate_res,
            created_at=datetime.now(timezone.utc),
        )
