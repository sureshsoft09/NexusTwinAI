"""Remote A2A Human-in-the-Loop Approval Agent (human_in_loop).

Handles high-value supply chain replenishment approvals where estimated freight
cost exceeds the $1,000.00 autonomous execution threshold (Rule 4 of the
Supply Chain Feasibility Gate).

Uses Google ADK `LongRunningFunctionTool` to pause execution across distributed
A2A agent boundaries until human VP Supply Chain authorization is received.
"""

import os
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional
from dotenv import load_dotenv

# Load .env from `human_in_loop/.env` or `agents/.env`
for _p in Path(__file__).resolve().parents:
    if (_p / ".env").exists():
        load_dotenv(_p / ".env", override=True)
        break

# Add parent directories containing `shared` to sys.path (works both locally and in /code/ inside Agent Engine)
for _p in Path(__file__).resolve().parents:
    if (_p / "shared").exists() and str(_p) not in sys.path:
        sys.path.insert(0, str(_p))
        break

try:
    from shared.bq_lakehouse import bq_lakehouse
except Exception:
    bq_lakehouse = None

from google.adk.agents.llm_agent import Agent
from google.adk.models import Gemini
from google.adk.tools.long_running_tool import LongRunningFunctionTool
from google.adk.tools.tool_context import ToolContext
from google.genai import types

AGENT_CARD_URL = os.getenv(
    "A2A_AGENT_CARD_URL",
    "http://localhost:8001/a2a/human_in_loop/.well-known/agent-card.json",
)

# Shared ledger of A2A HITL tickets created by `ask_for_approval` and finalized by `approve_replenishment_sto`
A2A_PENDING_TICKETS: dict[str, dict[str, Any]] = {}


def ask_for_approval(
    purpose: str,
    amount: float,
    sku_id: str = "SKU-4089-HYDRATE",
    donor_dc: str = "FMCG-PLANT-TX01",
    target_store: str = "STORE-HOU-05",
    units: int = 1800,
    tool_context: Optional[ToolContext] = None,
) -> dict[str, Any]:
    """Ask for VP Supply Chain human-in-the-loop approval for high-value replenishment or External FMCG PO (> $1,000)."""
    ticket_id = f"HITL-STO-{os.urandom(2).hex().upper()}"
    event_id = f"evt_tx_{ticket_id.lower()}"
    reason_msg = (
        f"Total commitment (${amount:,.2f}) for {purpose} exceeds the $1,000.00 autonomy threshold. "
        f"Awaiting VP Supply Chain authorization for ticket {ticket_id}."
    )
    A2A_PENDING_TICKETS[event_id] = {
        "event_id": event_id,
        "ticket_id": ticket_id,
        "agent_name": "approval_agent",
        "agent_card_url": AGENT_CARD_URL,
        "a2a_task_state": "input-required",
        "tool_invoked": "LongRunningFunctionTool(ask_for_approval)",
        "store_id": target_store,
        "donor_dc": donor_dc,
        "sku_id": sku_id,
        "units": units,
        "freight_cost": amount,
        "freight_mode": "FMCG_DIRECT_EXPEDITED_PO" if "FMCG" in donor_dc.upper() else "EXPEDITED_AIR_FREIGHT",
        "carrier_name": (
            "HydroBoost Cold-Chain Direct Carrier (FMCG PO)"
            if "FMCG" in donor_dc.upper()
            else "LoneStar Expedited Air Cargo"
        ),
        "reason": reason_msg,
        "status": "pending",
        "sap_transfer_order_id": None,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }
    # Persist PENDING_HUMAN_APPROVAL ticket to BigQuery (`supply_chain_lakehouse.audit_decision_ledger`)
    if bq_lakehouse is not None:
        try:
            bq_lakehouse.record_order_execution({
                "order_id": ticket_id,
                "event_id": event_id,
                "order_type": "PO_TO_FMCG" if "FMCG" in donor_dc.upper() else "STO_FROM_DC",
                "source_node": donor_dc,
                "target_store": target_store,
                "sku_id": sku_id,
                "units": units,
                "freight_cost": 1850.0 if "FMCG" in donor_dc.upper() else amount,
                "merchandise_cost": max(0.0, amount - 1850.0) if "FMCG" in donor_dc.upper() else 0.0,
                "total_cost": amount,
                "gate_status": "PENDING_HUMAN_APPROVAL",
                "signal_source": "A2A_REMOTE_AGENT_HANDOVER",
            })
        except Exception:
            pass

    return {
        "status": "pending",
        "ticket-id": ticket_id,
        "event_id": event_id,
        "amount": amount,
        "purpose": purpose,
        "sku_id": sku_id,
        "donor_dc": donor_dc,
        "target_store": target_store,
        "units": units,
        "bigquery_ledger_table": "nexustwinai-project.supply_chain_lakehouse.audit_decision_ledger",
        "message": reason_msg,
    }


def approve_replenishment_sto(
    purpose: str,
    amount: float,
    sku_id: str = "SKU-4089-HYDRATE",
    donor_dc: str = "FMCG-PLANT-TX01",
    target_store: str = "STORE-HOU-05",
    units: int = 1800,
) -> dict[str, Any]:
    """Commit the approved replenishment Stock Transfer Order (STO) or External FMCG Purchase Order (PO) to SAP S/4HANA & BigQuery."""
    is_fmcg_po = "FMCG" in donor_dc.upper() or "FMCG" in purpose.upper() or "PO" in purpose.upper()
    prefix = "PO-FMCG" if is_fmcg_po else "STO-SAP"
    order_id = f"{prefix}-{os.urandom(3).hex().upper()}"

    # Mark matching pending tickets as approved
    for ticket in A2A_PENDING_TICKETS.values():
        if ticket["status"] == "pending":
            ticket["status"] = "approved"
            ticket["a2a_task_state"] = "completed"
            ticket["sap_transfer_order_id"] = order_id

    # Commit approved order & update inventory positions in BigQuery (`supply_chain_lakehouse`)
    if bq_lakehouse is not None:
        try:
            bq_lakehouse.record_order_execution({
                "order_id": order_id,
                "event_id": f"evt_approved_{order_id.lower()}",
                "order_type": "PO_TO_FMCG" if is_fmcg_po else "STO_FROM_DC",
                "source_node": donor_dc,
                "target_store": target_store,
                "sku_id": sku_id,
                "units": units,
                "freight_cost": 1850.0 if is_fmcg_po else amount,
                "merchandise_cost": max(0.0, amount - 1850.0) if is_fmcg_po else 0.0,
                "total_cost": amount,
                "gate_status": "APPROVED_BY_HUMAN_VP",
                "signal_source": "A2A_HITL_APPROVAL",
            })
        except Exception:
            pass

    return {
        "status": "ok",
        "order_type": "PO_TO_FMCG" if is_fmcg_po else "STO_FROM_DC",
        "sap_transfer_order_id": order_id,
        "fmcg_purchase_order_id": order_id if is_fmcg_po else None,
        "bigquery_ledger_table": "nexustwinai-project.supply_chain_lakehouse.audit_decision_ledger",
        "amount": amount,
        "purpose": purpose,
        "sku_id": sku_id,
        "donor_dc": donor_dc,
        "target_store": target_store,
        "units": units,
    }


root_agent = Agent(
    model=Gemini(
        model=os.getenv("ADK_MODEL", "gemini-3.5-flash"),
        retry_options=types.HttpRetryOptions(
            initial_delay=2.0,
            attempts=5,
            exp_base=2.0,
            http_status_codes=[429, 500, 502, 503, 504],
        ),
    ),
    name="approval_agent",
    description=(
        "Supply Chain Governance & Human-in-the-Loop Approval Agent for NexusTwin AI. "
        "Handles replenishment stock transfers and external FMCG Purchase Orders exceeding $1,000.00."
    ),
    instruction="""
      You are the Supply Chain Governance & Human-in-the-Loop Approval Agent
      (`approval_agent`) for NexusTwin AI. You handle replenishment stock transfer
      requests (`STO_FROM_DC`) and External FMCG Purchase Orders (`PO_TO_FMCG`)
      where the total expenditure is greater than $1,000.00.

      Workflow:
      1. When you receive a replenishment or FMCG Purchase Order request with cost > $1,000.00,
         first call `ask_for_approval()` with the purpose, total amount, SKU (`SKU-4089-HYDRATE`),
         source node (`donor_dc`, e.g., `FMCG-PLANT-TX01` or `DC-ATX-02`), target store, and unit
         quantity to pause execution and wait for VP Supply Chain human approval.
         Clearly report the generated ticket ID (`HITL-STO-...`) and ask the human approver
         to reply with their approval confirmation.
      2. Once the human approver confirms and approves the pending request, call
         `approve_replenishment_sto()` to finalize and issue the SAP S/4HANA Stock Transfer
         Order (`STO-SAP-...`) or External FMCG Purchase Order (`PO-FMCG-...`), and report
         the issued order ID clearly.
      3. If the human approver rejects the request, report that the order was declined.
    """,
    tools=[
        approve_replenishment_sto,
        LongRunningFunctionTool(func=ask_for_approval),
    ],
    generate_content_config=types.GenerateContentConfig(temperature=0.1),
)
