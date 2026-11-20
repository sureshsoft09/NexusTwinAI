"""NexusTwin AI - FastAPI Agent Bridge & Cloud Run Remote A2A Governance Host.

Bridges:
  1. Speed-controlled Live POS / 25-Day Weather / Social Media telemetry streaming (Firestore + BigQuery)
  2. Google ADK Multi-Agent System on Vertex AI Agent Engine (`twin_supervisor`)
  3. Cloud Run FastMCP Microservices (`erp-inventory-mcp`, `bigquery-telemetry-mcp`, `logistics-rates-mcp`)
  4. Official Google ADK `to_a2a(approval_agent)` Remote A2A Server mounted at `/a2a/human_in_loop`
  5. React 18 Control Tower Dashboard (Firebase Hosting)
"""

import os
import sys
from pathlib import Path
from contextlib import asynccontextmanager
from typing import Any, Dict
from urllib.parse import urlparse
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import uvicorn

# Ensure repo root, shared, and agents are on sys.path (works locally and in Cloud Run container)
_app_dir = Path(__file__).resolve().parent
_backend_dir = _app_dir.parent
_src_dir = _backend_dir.parent
for p in [
    str(_src_dir),
    str(_src_dir / "agents" / "src"),
    str(_backend_dir),
    str(_backend_dir / "agents" / "src"),
    str(_backend_dir / "shared"),
]:
    if p not in sys.path:
        sys.path.insert(0, p)

from backend.app.config import settings
from backend.app.api.signals import router as signals_router
from backend.app.api.governance import router as governance_router
from backend.app.api.twin_state import router as twin_state_router
from backend.app.api.audit import router as audit_router
from shared.bq_lakehouse import bq_lakehouse

# Build the official Google ADK `to_a2a(approval_agent)` Starlette ASGI app for Cloud Run HTTPS
_a2a_starlette_app = None
_a2a_mounted_mode = "DISABLED"
try:
    from google.adk.a2a.utils.agent_to_a2a import to_a2a
    from human_in_loop.agent import root_agent as approval_root_agent

    _parsed = urlparse(settings.PUBLIC_BACKEND_URL)
    _protocol = _parsed.scheme or "https"
    _host = _parsed.hostname or "nexustwin-backend-311231946335.us-central1.run.app"
    _port = _parsed.port or (443 if _protocol == "https" else settings.PORT)

    _a2a_starlette_app = to_a2a(
        approval_root_agent,
        host=_host,
        port=_port,
        protocol=_protocol,
        rpc_path="a2a/human_in_loop",
    )
    _a2a_mounted_mode = "OFFICIAL_ADK_TO_A2A"
except Exception as _a2a_err:
    print(f"[NexusTwin Backend] Warning: could not initialize ADK to_a2a(approval_agent): {_a2a_err}")


@asynccontextmanager
async def lifespan(app: FastAPI):
    print(f"Starting {settings.PROJECT_NAME} v{settings.VERSION} on port {settings.PORT}...")
    if _a2a_starlette_app is not None:
        async with _a2a_starlette_app.router.lifespan_context(_a2a_starlette_app):
            existing_paths = {getattr(r, "path", None) for r in app.router.routes}
            for route in _a2a_starlette_app.routes:
                if getattr(route, "path", None) not in existing_paths:
                    app.router.routes.append(route)
            print(
                f"[A2A Server] Official Google ADK to_a2a(approval_agent) active at "
                f"{settings.PUBLIC_BACKEND_URL}/a2a/human_in_loop/.well-known/agent-card.json"
            )
            yield
    else:
        yield
    print(f"Shutting down {settings.PROJECT_NAME}...")


app = FastAPI(
    title=settings.PROJECT_NAME,
    version=settings.VERSION,
    description="Cognitive Multi-Agent Bridge connecting FMCG Supply Chains to Retail Shelves with Official A2A Governance.",
    lifespan=lifespan,
)

# Enable CORS for local & Firebase Hosting React frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount API Routers
app.include_router(signals_router, prefix=settings.API_V1_PREFIX)
app.include_router(governance_router, prefix=settings.API_V1_PREFIX)
app.include_router(twin_state_router, prefix=settings.API_V1_PREFIX)
app.include_router(audit_router, prefix=settings.API_V1_PREFIX)


@app.get("/a2a/human_in_loop/pending", tags=["A2A Governance"])
async def a2a_list_pending():
    """Return durable A2A pending & approved VP tickets from Cloud Firestore."""
    return bq_lakehouse.list_a2a_tickets()


@app.get("/health", tags=["Health & Status"])
async def health_check() -> Dict[str, Any]:
    return {
        "status": "HEALTHY",
        "service": settings.PROJECT_NAME,
        "version": settings.VERSION,
        "gcp_project": settings.GCP_PROJECT_ID,
        "firestore_connected": bq_lakehouse.fs_connected,
        "bigquery_connected": bq_lakehouse.bq_connected,
        "bigquery_dataset": f"{settings.GCP_PROJECT_ID}.{settings.BQ_DATASET_ID}",
        "agent_engine_resource_id": settings.AGENT_ENGINE_RESOURCE_ID,
        "agent_engine_region": settings.AGENT_ENGINE_REGION,
        "a2a_server_mode": _a2a_mounted_mode,
        "a2a_agent_card_url": f"{settings.PUBLIC_BACKEND_URL.rstrip('/')}/a2a/human_in_loop/.well-known/agent-card.json",
    }


if __name__ == "__main__":
    port = int(os.environ.get("PORT", settings.PORT))
    uvicorn.run(
        "backend.app.main:app",
        host="0.0.0.0",
        port=port,
        reload=False,
    )
