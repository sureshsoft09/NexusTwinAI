"""NexusTwin AI - FastAPI Agent Bridge Core.

Bridges:
  1. Inbound POS scanner streams & optional n8n iPaaS workflows
  2. Google ADK Multi-Agent Swarm (root_agent = twin_supervisor)
  3. FastMCP Streamable HTTP Microservices on Cloud Run
  4. React 18 Command & Control Dashboard
"""

import sys
from pathlib import Path
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import uvicorn

# Ensure repo root and agents are on sys.path
_app_dir = Path(__file__).resolve().parent
_backend_dir = _app_dir.parent
_src_dir = _backend_dir.parent
_workspace_dir = _src_dir.parent.parent
for p in [str(_src_dir), str(_src_dir / "agents" / "src"), str(_backend_dir), str(_workspace_dir)]:
    if p not in sys.path:
        sys.path.insert(0, p)

from backend.app.config import settings
from backend.app.api.signals import router as signals_router
from backend.app.api.governance import router as governance_router
from backend.app.api.twin_state import router as twin_state_router
from backend.app.api.audit import router as audit_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    print(f"Starting {settings.PROJECT_NAME} v{settings.VERSION} on port {settings.PORT}...")
    yield
    print(f"Shutting down {settings.PROJECT_NAME}...")


app = FastAPI(
    title=settings.PROJECT_NAME,
    version=settings.VERSION,
    description="Cognitive Multi-Agent Bridge connecting FMCG Supply Chains to Retail Shelves.",
    lifespan=lifespan,
)

# Enable CORS for local React development
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


@app.get("/health", tags=["Health & Status"])
async def health_check():
    return {
        "status": "HEALTHY",
        "service": settings.PROJECT_NAME,
        "version": settings.VERSION,
        "gcp_project": settings.GCP_PROJECT_ID,
        "bigquery_dataset": f"{settings.GCP_PROJECT_ID}.{settings.BQ_DATASET_ID}",
        "agent_engine_resource_id": settings.AGENT_ENGINE_RESOURCE_ID,
        "agent_engine_region": settings.AGENT_ENGINE_REGION,
        "a2a_approval_agent_url": settings.A2A_APPROVAL_AGENT_BASE_URL,
    }


if __name__ == "__main__":
    uvicorn.run(
        "prototype.src.backend.app.main:app",
        host=settings.HOST,
        port=settings.PORT,
        reload=False,
    )
