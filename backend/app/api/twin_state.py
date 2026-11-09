"""Digital Twin State, BigQuery Reset, Weather API & Social Media WebSocket Router."""

from typing import Any, Dict, Optional
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
try:
    from backend.app.services.twin_engine import twin_service
    from backend.app.services.event_bus import manager
    from shared.bq_lakehouse import bq_lakehouse
except ImportError:
    from prototype.src.backend.app.services.twin_engine import twin_service
    from prototype.src.backend.app.services.event_bus import manager
    from prototype.src.shared.bq_lakehouse import bq_lakehouse

router = APIRouter(prefix="/twin", tags=["Digital Twin State & Demo Reset"])


@router.get("/state")
async def get_digital_twin_topology():
    """Retrieve full regional Texas network topology (1 FMCG Plant, 3 DCs, 6 Stores, SKUs, Inventory, Weather 25d & Social signals)."""
    return twin_service.get_topology_state()


@router.post("/reset")
async def reset_digital_twin_demo_data():
    """Reset all BigQuery Lakehouse tables (`nexustwinai-project.supply_chain_lakehouse`) and Twin inventory back to starting demo values."""
    summary = twin_service.reset_demo_state()
    await manager.broadcast({
        "type": "DEMO_RESET",
        "summary": summary,
        "state": twin_service.get_topology_state(),
    })
    return {
        "status": "RESET_COMPLETE",
        "summary": summary,
        "state": twin_service.get_topology_state(),
    }


@router.get("/weather/{store_id}")
async def get_store_weather_forecast_25d(store_id: str = "STORE-PLANO-07"):
    """Fetch 25-day Weather API forecast (Open-Meteo + Ensemble) for a retail store."""
    return bq_lakehouse.fetch_live_weather_forecast_25d(store_id=store_id)


@router.get("/social")
async def get_social_media_signals(store_id: Optional[str] = None):
    """Fetch geo-tagged social media and public forum event signals."""
    return {
        "signals": bq_lakehouse.get_social_media_feed(store_id=store_id),
    }


@router.websocket("/ws/telemetry")
async def websocket_telemetry_endpoint(websocket: WebSocket):
    """Real-time bi-directional WebSocket connection for streaming scanner telemetry and agent traces."""
    await manager.connect(websocket)
    try:
        await websocket.send_json({
            "type": "INITIAL_SNAPSHOT",
            "state": twin_service.get_topology_state(),
        })
        while True:
            data = await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(websocket)
