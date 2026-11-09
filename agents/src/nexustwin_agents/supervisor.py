"""Root Supervisor Agent (twin_supervisor) with Remote A2A HITL Handover & FMCG PO Execution.

Built with Google Agent Development Kit (ADK):
  - `from google.adk.agents.llm_agent import Agent`
  - `from google.adk.agents.remote_a2a_agent import AGENT_CARD_WELL_KNOWN_PATH, RemoteA2aAgent`
  - `from google.genai import types`

Coordinates:
  1. In-process ADK SequentialAgent tools (`sensing_agent`, `replenishment_agent`, `logistics_agent`)
  2. Autonomous SAP Stock Transfer Order execution (`execute_replenishment_sto`) when DC has ATP & freight <= $1,000
  3. External FMCG Purchase Order execution (`execute_fmcg_purchase_order`) when serving DC lacks ATP stock
  4. Remote A2A Human-in-the-Loop delegation (`approval_agent = RemoteA2aAgent(...)`) if cost > $1,000

Adheres strictly to the Google ADK discovery contract (`root_agent = twin_supervisor`).
"""

import os
import sys
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from nexustwin_agents import config
from nexustwin_agents.sensing_agent import sensing_agent, MarketSensingService
from nexustwin_agents.replenishment_agent import replenishment_agent, ReplenishmentService
from nexustwin_agents.logistics_agent import logistics_agent, LogisticsService
from nexustwin_agents.gate import evaluate_feasibility_gate

try:
    from shared.schemas import (
        GateEvaluationResult,
        GateStatus,
        MarketSignalEvent,
        ReplenishmentDecisionManifest,
    )
except ImportError:
    from prototype.src.shared.schemas import (
        GateEvaluationResult,
        GateStatus,
        MarketSignalEvent,
        ReplenishmentDecisionManifest,
    )


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

    # Specialized ADK AgentTools wrapping each domain sub-agent (Pattern 1)
    sensing_tool = AgentTool(agent=sensing_agent)
    replenishment_tool = AgentTool(agent=replenishment_agent)
    logistics_tool = AgentTool(agent=logistics_agent)

    if (
        os.getenv("AGENT_ENGINE_DEPLOY", "").lower() == "true"
        and "localhost" in config.A2A_APPROVAL_AGENT_BASE_URL
    ):
        # When deployed to Vertex AI Agent Engine without a public Cloud Run A2A URL,
        # bind the real `human_in_loop` LlmAgent in-process so cloud execution never calls localhost:8001
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
You are the conversational NexusTwin Autonomous Supply Chain Supervisor coordinating multi-agent
demand sensing, inventory replenishment, and 3PL logistics across 6 retail stores, 3 regional DCs,
and 1 upstream FMCG bottling plant for Hero Product `SKU-4089-HYDRATE`.

Workflow:
1. Call `market_sensing_agent` (sensing_tool) to investigate real-time POS velocity surges,
   25-day weather heatwave forecasts, or viral social media events.
2. Call `replenishment_agent` (replenishment_tool) to check Available-to-Promise (ATP) inventory
   at the serving regional DC (`DC-ATX-02`, `DC-HOU-01`, `DC-SAT-03`), or escalate upstream to
   the FMCG Manufacturer (`FMCG-PLANT-TX01`) via an External Purchase Order (`PO_TO_FMCG`) when
   the serving DC lacks sufficient ATP stock.
3. Call `logistics_agent` (logistics_tool) to quote 3PL carrier freight lanes and transit SLAs.
4. Enforce the 4-Rule Supply Chain Feasibility Gate ($1,000 autonomy threshold):
   - If total financial commitment <= $1,000, call `execute_replenishment_sto()` immediately.
   - If total financial commitment > $1,000 (such as an External FMCG Purchase Order or Expedited
     Air Freight), hand over to `approval_agent` (Remote A2A Agent) or report that VP Supply Chain
     Human-in-the-Loop approval is required before executing `execute_fmcg_purchase_order()`.
"""

    twin_supervisor = LlmAgent(
        name="twin_supervisor",
        model=config.get_gemini_model(config.MODEL_REASONING),
        description=(
            "Conversational NexusTwin AI Supply Chain Supervisor coordinating multi-agent "
            "demand sensing, DC/FMCG replenishment, and 3PL logistics."
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


class NexusTwinSupervisor:
    """Enterprise orchestrator bridging FastAPI Agent Bridge with ADK multi-agent swarm & RemoteA2aAgent."""

    def __init__(self):
        self.sensing_svc = MarketSensingService()
        self.replenishment_svc = ReplenishmentService()
        self.logistics_svc = LogisticsService()
        self.approval_agent_card = f"{config.A2A_APPROVAL_AGENT_BASE_URL}{AGENT_CARD_WELL_KNOWN_PATH}"

    async def run_resolution_cycle(
        self,
        event: MarketSignalEvent,
        has_human_approval: bool = False,
        approver_token: Optional[str] = None,
    ) -> ReplenishmentDecisionManifest:
        """Execute end-to-end multi-agent resolution loop across all 4 Demo Flows."""

        # Determine requested units per scenario
        if event.requested_units_override:
            requested_units = event.requested_units_override
        elif event.store_id == "STORE-HOU-05":
            requested_units = 1800  # Exceeds DC-HOU-01's 180 ATP surplus -> triggers FMCG PO
        elif event.store_id == "STORE-ARL-11":
            requested_units = 1200  # Social media marathon spike -> fulfilled by DC-SAT-03 (1,600 ATP)
        else:
            requested_units = 1500  # Shop 1 (STORE-DAL-04) & Shop 3 (STORE-PLANO-07) -> fulfilled by DC-ATX-02

        # 1. Market Sensing Agent: Investigate & Conclude (POS / 25d Weather / Social Forum)
        sensing_context = self.sensing_svc.analyze(event)

        # 2. Replenishment Agent: Check DC ATP Surplus vs Escalate to FMCG Plant PO
        proposal = self.replenishment_svc.propose(
            context=sensing_context,
            requested_units=requested_units,
        )

        # 3. Logistics Agent: Evaluate Carrier Freight & Transit SLA
        logistics_opt = self.logistics_svc.evaluate(
            proposal=proposal,
            store_stockout_hours=sensing_context.projected_stockout_hours,
        )
        proposal.selected_logistics = logistics_opt

        # 4. Deterministic 4-Rule Supply Chain Feasibility Gate
        gate_res: GateEvaluationResult = evaluate_feasibility_gate(
            proposal=proposal,
            store_stockout_runway_hours=sensing_context.projected_stockout_hours,
            has_human_approval=has_human_approval,
            approver_token=approver_token,
        )

        # 5. Autonomous Execution (<= $1,000) vs Remote A2A Handover (> $1,000)
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

        total_commitment = round(logistics_opt.freight_cost + proposal.fmcg_po_merchandise_cost, 2)

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
            created_at=datetime.now(timezone.utc),
        )
