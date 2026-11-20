"""Market Signals, Speed-Controlled Telemetry Stream Scenarios, and Live Vertex AI Agent Engine API Router."""

from typing import Any, Dict, Optional
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

try:
    from shared.schemas import MarketSignalEvent, ReplenishmentDecisionManifest
    from backend.app.services.twin_engine import twin_service, DEMO_SCENARIOS
    from backend.app.services.event_bus import manager
except ImportError:
    from prototype.src.shared.schemas import MarketSignalEvent, ReplenishmentDecisionManifest
    from prototype.src.backend.app.services.twin_engine import twin_service, DEMO_SCENARIOS
    from prototype.src.backend.app.services.event_bus import manager

router = APIRouter(prefix="/signals", tags=["Market Signals Ingestion & Vertex AI Agent Engine"])


class AgentQueryRequest(BaseModel):
    prompt: str
    user_id: Optional[str] = "supply_chain_planner_01"


@router.post("/ingest", response_model=ReplenishmentDecisionManifest)
async def ingest_market_signal(event: MarketSignalEvent):
    """Ingest POS scanner velocity, 25-day Weather API forecast, or Social Media signal and trigger NexusTwin AI Multi-Agent System."""
    try:
        manifest = await twin_service.ingest_market_signal(event, broadcast_fn=manager.broadcast)
        await manager.broadcast({
            "type": "SIGNAL_RESOLVED",
            "event_id": manifest.event_id,
            "manifest": manifest.model_dump(mode="json"),
            "state": twin_service.get_topology_state(),
        })
        return manifest
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/query-agent")
async def query_deployed_agent_engine(req: AgentQueryRequest) -> Dict[str, Any]:
    """Query the deployed Vertex AI Agent Engine directly with any prompt."""
    try:
        res = await twin_service.query_remote_agent(
            prompt=req.prompt,
            user_id=req.user_id or "supply_chain_planner_01",
            broadcast_fn=manager.broadcast,
        )
        await manager.broadcast({
            "type": "AGENT_QUERY_COMPLETED",
            "agent_engine_resource_id": res.get("agent_engine_resource_id"),
            "vertex_session_id": res.get("vertex_session_id"),
            "response_text": res.get("response_text"),
            "step_events": res.get("step_events", []),
        })
        return res
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/scenarios")
async def list_demo_scenarios():
    """Return all 4 pre-configured enterprise demo scenarios."""
    return {
        "agent_engine_resource_id": twin_service.agent_engine_resource_id,
        "scenarios": DEMO_SCENARIOS,
    }


@router.post("/stop")
async def stop_active_stream():
    """Request cancellation of any currently running telemetry simulation stream."""
    twin_service.request_stop_stream()
    await manager.broadcast({"type": "STREAM_STOPPED"})
    return {"status": "STOP_REQUESTED"}


@router.post("/scenario/{scenario_key}", response_model=ReplenishmentDecisionManifest)
async def trigger_demo_scenario_endpoint(
    scenario_key: str,
    speed: float = Query(default=1.0, ge=0.25, le=4.0, description="Telemetry stream playback speed (0.5=Slow, 1.0=Normal, 2.0=Fast)"),
):
    """Run live DB-backed telemetry stream at `speed` -> detect spike -> trigger live Vertex AI Agent Engine
    + 4-Gate Guardrail + Real Cloud Run MCPs / RemoteA2aAgent.
    """
    try:
        manifest = await twin_service.trigger_demo_scenario(
            scenario_key,
            broadcast_fn=manager.broadcast,
            speed=speed,
        )
        await manager.broadcast({
            "type": "SIGNAL_RESOLVED",
            "scenario_key": scenario_key,
            "event_id": manifest.event_id,
            "manifest": manifest.model_dump(mode="json"),
            "state": twin_service.get_topology_state(),
        })
        return manifest
    except ValueError as ve:
        raise HTTPException(status_code=404, detail=str(ve))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
