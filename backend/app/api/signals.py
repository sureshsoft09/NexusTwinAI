"""Market Signals, 4-Act Demo Scenario, and Live Vertex AI Agent Engine Query API Router."""

from typing import Any, Dict, Optional
from fastapi import APIRouter, HTTPException
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
    """Ingest POS scanner velocity, 25-day Weather API forecast, or Social Media signal and trigger NexusTwin AI Multi-Agent System + 4-Rule Gate."""
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
    """Query the deployed Vertex AI Agent Engine (`projects/311231946335/locations/us-central1/reasoningEngines/6418419193229606912`) directly with any prompt."""
    try:
        res = await twin_service.query_remote_agent(
            prompt=req.prompt,
            user_id=req.user_id or "supply_chain_planner_01",
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


@router.post("/scenario/{scenario_key}", response_model=ReplenishmentDecisionManifest)
async def trigger_demo_scenario_endpoint(scenario_key: str):
    """Trigger one of the 4 demo flows (shop1_pos_dc_replenish, shop2_dc_shortage_fmcg_po, shop3_weather_25day_prediction, shop4_social_media_event_spike)."""
    try:
        manifest = await twin_service.trigger_demo_scenario(scenario_key, broadcast_fn=manager.broadcast)
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
