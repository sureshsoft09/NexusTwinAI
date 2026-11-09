"""Governance, Feasibility Gate, and HITL Approvals API Router."""

from typing import Any, Dict, List
from fastapi import APIRouter, HTTPException
try:
    from shared.schemas import (
        ApprovalDecisionRequest,
        GateEvaluationResult,
        ReplenishmentDecisionManifest,
        ReplenishmentProposal,
    )
    from backend.app.services.twin_engine import twin_service
    from backend.app.services.event_bus import manager
except ImportError:
    from prototype.src.shared.schemas import (
        ApprovalDecisionRequest,
        GateEvaluationResult,
        ReplenishmentDecisionManifest,
        ReplenishmentProposal,
    )
    from prototype.src.backend.app.services.twin_engine import twin_service
    from prototype.src.backend.app.services.event_bus import manager
from nexustwin_agents.gate import evaluate_feasibility_gate

router = APIRouter(prefix="/governance", tags=["Feasibility Gate & HITL Governance"])


@router.post("/gate/evaluate", response_model=GateEvaluationResult)
async def evaluate_gate(
    proposal: ReplenishmentProposal,
    store_stockout_runway_hours: float = 26.5,
    has_human_approval: bool = False,
):
    """Direct deterministic evaluation of a proposal against the 4 supply chain constraints."""
    return evaluate_feasibility_gate(
        proposal=proposal,
        store_stockout_runway_hours=store_stockout_runway_hours,
        has_human_approval=has_human_approval,
    )


@router.get("/pending", response_model=List[Dict[str, Any]])
async def list_pending_approvals():
    """Retrieve all pending A2A Approval Cards from RemoteA2aAgent (http://localhost:8001/a2a/human_in_loop) and local twin queue."""
    return await twin_service.get_pending_a2a_cards()


@router.post("/approve", response_model=Dict[str, Any])
async def submit_human_approval(req: ApprovalDecisionRequest):
    """Submit human sign-off from the React UI to RemoteA2aAgent (approval_agent) and finalize SAP STO."""
    try:
        result = await twin_service.approve_transfer(req)
        await manager.broadcast({
            "type": "ORDER_APPROVED",
            "event_id": req.event_id,
            "manifest": result,
        })
        return result
    except ValueError as ve:
        raise HTTPException(status_code=404, detail=str(ve))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
