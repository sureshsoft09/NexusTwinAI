"""Remote A2A Human-in-the-Loop Governance Agent (human_in_loop / approval_agent).

Exposed on Google Cloud Run via Google ADK `to_a2a(root_agent)` at:
  https://nexustwin-backend-311231946335.us-central1.run.app/a2a/human_in_loop

Protocol Lifecycle:
  1. PAUSE (`input-required`):
     When `twin_supervisor` (on Vertex AI Agent Engine) transfers a Gate-4 escalation (> $1,000
     or External B2B FMCG Purchase Order), `approval_agent` invokes
     `LongRunningFunctionTool(func=ask_for_approval)`.
     This persists a durable ticket in Cloud Firestore (`a2a_approval_queue`) with
     `a2a_task_state = "input-required"` and returns immediately so the UI renders the full
     verified business case without blocking.
  2. RESUME (`completed`):
     When the Retail VP clicks "Approve & Dispatch Order" in Tab 5, the backend resumes the
     paused Vertex AI Agent Engine session (`vertex_session_id`), delivering the VP's approval
     decision + signed `vp_approval_token` (`SIG-VP-...`) back to this Remote A2A Agent.
     `approval_agent` then calls `erp-inventory-mcp:create_fmcg_purchase_order` (or
     `create_transfer_order`) over MCP with `vp_approval_token` to commit the real order to
     BigQuery & Firestore!
"""

import asyncio
import os
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional
from dotenv import load_dotenv

for _p in Path(__file__).resolve().parents:
    if (_p / ".env").exists():
        load_dotenv(_p / ".env", override=True)
        break

for _p in Path(__file__).resolve().parents:
    if (_p / "shared").exists() and str(_p) not in sys.path:
        sys.path.insert(0, str(_p))
        break

try:
    from shared.bq_lakehouse import bq_lakehouse
    from shared.topology import get_node_display_name
except Exception:
    bq_lakehouse = None
    def get_node_display_name(node_id: str) -> str:
        return node_id

from google.adk.agents.llm_agent import Agent
from google.adk.models import Gemini
from google.adk.tools.long_running_tool import LongRunningFunctionTool
from google.adk.tools.mcp_tool.mcp_toolset import MCPToolset
from google.adk.tools.mcp_tool.mcp_session_manager import StreamableHTTPConnectionParams
from google.adk.tools.tool_context import ToolContext
from google.genai import types

PUBLIC_BACKEND_URL = os.getenv(
    "PUBLIC_BACKEND_URL",
    "https://nexustwin-backend-311231946335.us-central1.run.app",
).rstrip("/")

AGENT_CARD_URL = os.getenv(
    "A2A_AGENT_CARD_URL",
    f"{PUBLIC_BACKEND_URL}/a2a/human_in_loop/.well-known/agent-card.json",
)

_erp_url = os.getenv("MCP_ERP_URL", "https://erp-inventory-mcp-zjhvvbsjwa-uc.a.run.app/mcp").rstrip("/")
if not _erp_url.endswith("/mcp"):
    _erp_url = f"{_erp_url}/mcp"

ApprovalErpMCP_Tool = MCPToolset(
    connection_params=StreamableHTTPConnectionParams(
        url=_erp_url,
        timeout=30.0,
    ),
    errlog=None,
)

# In-process mirror alongside durable Cloud Firestore `a2a_approval_queue`
A2A_PENDING_TICKETS: dict[str, dict[str, Any]] = {}


def ask_for_approval(
    purpose: str,
    amount: float,
    sku_id: str = "SKU-4089-HYDRATE",
    donor_dc: str = "FMCG-PLANT-TX01",
    target_store: str = "STORE-HOU-05",
    units: int = 1800,
    freight_cost: float = 1850.0,
    merchandise_cost: float = 15822.0,
    event_id: str = "",
    tool_context: Optional[ToolContext] = None,
) -> dict[str, Any]:
    """Raise a durable A2A HITL VP approval ticket in Firestore and pause (`input-required`)."""
    is_fmcg = "FMCG" in (donor_dc or "").upper() or float(merchandise_cost) > 0
    order_type = "PO_TO_FMCG" if is_fmcg else "STO_FROM_DC"
    prefix = "HITL-PO" if is_fmcg else "HITL-STO"

    resolved_event_id = event_id or (
        "evt_shop2_fmcg_po_hitl" if target_store == "STORE-HOU-05" else f"evt_hitl_{os.urandom(3).hex()}"
    )

    # Deduplicate existing pending ticket for same store + SKU
    existing_ticket_id = None
    existing_tickets = bq_lakehouse.list_a2a_tickets() if bq_lakehouse else list(A2A_PENDING_TICKETS.values())
    for t in existing_tickets:
        if t.get("store_id") == target_store and t.get("sku_id") == sku_id and t.get("status") == "pending":
            resolved_event_id = t.get("event_id", resolved_event_id)
            existing_ticket_id = t.get("ticket_id")
            break

    ticket_id = existing_ticket_id or f"{prefix}-{os.urandom(2).hex().upper()}"
    total_amt = round(float(amount), 2)
    freight_val = round(float(freight_cost), 2)
    merch_val = round(float(merchandise_cost), 2)
    if is_fmcg and merch_val == 0.0 and total_amt > freight_val:
        merch_val = round(total_amt - freight_val, 2)

    reason_msg = (
        f"Gates 1-3 passed (ATP, Delivery SLA, Profit ROI verified). Gate 4 paused for Retail VP sign-off: "
        f"{'External B2B FMCG PO ' if is_fmcg else ''}total commitment (${total_amt:,.2f}) exceeds the "
        f"$1,000.00 autonomous cap. Ticket {ticket_id} awaiting approval in Tab 5."
    )

    ticket_record = {
        "event_id": resolved_event_id,
        "ticket_id": ticket_id,
        "order_type": order_type,
        "agent_name": "approval_agent",
        "agent_card_url": AGENT_CARD_URL,
        "a2a_task_state": "input-required",
        "tool_invoked": "LongRunningFunctionTool(ask_for_approval)",
        "store_id": target_store,
        "store_display_name": get_node_display_name(target_store),
        "donor_dc": donor_dc,
        "donor_display_name": get_node_display_name(donor_dc),
        "sku_id": sku_id,
        "units": int(units),
        "freight_cost": freight_val,
        "fmcg_po_merchandise_cost": merch_val,
        "total_financial_commitment": total_amt,
        "freight_mode": "FMCG_DIRECT_EXPEDITED_PO" if is_fmcg else "EXPEDITED_AIR_FREIGHT",
        "carrier": (
            "HydroBoost Cold-Chain Direct Carrier (FMCG PO)"
            if is_fmcg
            else "LoneStar Expedited Air Cargo"
        ),
        "carrier_name": (
            "HydroBoost Cold-Chain Direct Carrier (FMCG PO)"
            if is_fmcg
            else "LoneStar Expedited Air Cargo"
        ),
        "reason": reason_msg,
        "status": "pending",
        "sap_transfer_order_id": None,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }

    A2A_PENDING_TICKETS[resolved_event_id] = ticket_record
    if bq_lakehouse is not None:
        try:
            bq_lakehouse.save_a2a_ticket(ticket_record)
        except Exception as e:
            print(f"[A2A approval_agent] Firestore ticket save note: {e}")

    return {
        "status": "pending",
        "a2a_task_state": "input-required",
        "ticket_id": ticket_id,
        "event_id": resolved_event_id,
        "order_type": order_type,
        "amount": total_amt,
        "freight_cost": freight_val,
        "merchandise_cost": merch_val,
        "purpose": purpose,
        "sku_id": sku_id,
        "donor_dc": donor_dc,
        "target_store": target_store,
        "units": int(units),
        "message": reason_msg,
    }


_APPROVAL_PROJECT = os.getenv("GCP_PROJECT_ID", os.getenv("GOOGLE_CLOUD_PROJECT", "nexustwinai-project"))
_APPROVAL_LOCATION = os.getenv("GEMINI_MODEL_LOCATION", "global")
_APPROVAL_MODEL = os.getenv("MODEL_APPROVAL", os.getenv("MODEL_FAST", "gemini-3.5-flash-lite"))
_APPROVAL_PACING_SEC = float(os.getenv("LLM_PACING_DELAY_SEC", "0.5"))


async def _approval_before_model_guard(callback_context: Any, llm_request: Any) -> Optional[Any]:
    os.environ["GOOGLE_CLOUD_PROJECT"] = _APPROVAL_PROJECT
    os.environ["GOOGLE_CLOUD_LOCATION"] = _APPROVAL_LOCATION
    os.environ["GOOGLE_GENAI_USE_VERTEXAI"] = "true"
    if _APPROVAL_PACING_SEC > 0:
        await asyncio.sleep(_APPROVAL_PACING_SEC)
    return None


root_agent = Agent(
    model=Gemini(
        model=_APPROVAL_MODEL,
        client_kwargs={
            "vertexai": True,
            "project": _APPROVAL_PROJECT,
            "location": _APPROVAL_LOCATION,
        },
        retry_options=types.HttpRetryOptions(
            initial_delay=3.0,
            max_delay=45.0,
            attempts=8,
            exp_base=2.0,
            jitter=1.0,
            http_status_codes=[429, 500, 502, 503, 504],
        ),
    ),
    name="approval_agent",
    description=(
        "Remote A2A Supply Chain Governance & Human-in-the-Loop VP Approval Agent. "
        "Pauses External B2B FMCG Purchase Orders and high-value transfers (> $1,000) "
        "with state `input-required`, then resumes to execute the real ERP MCP order once "
        "the Retail VP provides a signed `vp_approval_token`."
    ),
    instruction="""
You are `approval_agent`, the Remote A2A Supply Chain Governance & VP Approval Agent.

PHASE 1 — NEW GATE-4 ESCALATION (no `SIG-` token yet):
1. Call `ask_for_approval(...)` ONCE with exact parameters (`purpose`, `amount`, `sku_id`, `donor_dc`,
   `target_store`, `units`, `freight_cost`, `merchandise_cost`, `event_id`).
2. NEVER call `create_fmcg_purchase_order` or `create_transfer_order` yet.
3. Return a concise summary with exact `ticket_id`, `a2a_task_state: "input-required"`, and note that Gate 4 awaits Retail VP sign-off in Tab 5.

PHASE 2 — RETAIL VP RESUME INPUT WITH `APPROVED` + `vp_approval_token` (`SIG-...`):
1. Call the live `erp-inventory-mcp` write tool ONCE:
   - External FMCG PO (`PO_TO_FMCG` / `FMCG-PLANT-TX01`): `create_fmcg_purchase_order(target_store, serving_dc, sku, quantity, freight_cost_usd, vp_approval_token, fmcg_vendor_id="FMCG-PLANT-TX01", event_id=...)`
   - Internal DC STO (`STO_FROM_DC`): `create_transfer_order(from_dc, to_location, sku, quantity, freight_cost_usd, vp_approval_token, event_id=...)`
2. Report the confirmed `PO-FMCG-...` or `STO-SAP-...` order ID and `a2a_task_state: "completed"`.
3. If declined/rejected, do NOT call any ERP write tool and report the decline.
""",
    tools=[
        LongRunningFunctionTool(func=ask_for_approval),
        ApprovalErpMCP_Tool,
    ],
    before_model_callback=_approval_before_model_guard,
    generate_content_config=types.GenerateContentConfig(temperature=0.1, max_output_tokens=512),
)
