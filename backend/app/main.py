"""NexusTwin AI - FastAPI Agent Bridge Core.

Bridges:
  1. Inbound POS scanner streams, 25-Day Weather API & Social Media feeds
  2. Google ADK Multi-Agent System (root_agent = twin_supervisor) & Vertex AI Agent Engine
  3. FastMCP Streamable HTTP Microservices on Cloud Run
  4. A2A Human-in-the-Loop Governance endpoints (`/a2a/human_in_loop/*`)
  5. React 18 Command & Control Dashboard
"""

import os
import sys
from pathlib import Path
from contextlib import asynccontextmanager
from typing import Any, Dict
from fastapi import FastAPI, Request
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
from human_in_loop.agent import (
    A2A_PENDING_TICKETS,
    ask_for_approval,
    approve_replenishment_sto,
)


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

# Enable CORS for local & Cloud Run React frontend
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


# Built-in A2A Human-in-the-Loop endpoints so Cloud Run single-container deployments
# serve `/a2a/human_in_loop/*` natively alongside `/api/v1/*`
@app.get("/a2a/human_in_loop/.well-known/agent.json", tags=["A2A Governance"])
@app.get("/a2a/human_in_loop/.well-known/agent-card.json", tags=["A2A Governance"])
async def a2a_agent_card(request: Request) -> Dict[str, Any]:
    base_url = str(request.base_url).rstrip("/")
    return {
        "name": "approval_agent",
        "description": "Executive A2A Human-in-the-Loop Governance Agent for Supply Chain Orders > $1,000",
        "url": f"{base_url}/a2a/human_in_loop",
        "version": "1.0.0",
        "capabilities": {"streaming": False, "pushNotifications": False},
        "skills": [
            {
                "id": "ask_for_approval",
                "name": "Ask for Executive Approval",
                "description": "Escalate replenishment or factory purchase orders exceeding $1,000 to VP Queue.",
            },
            {
                "id": "approve_replenishment_sto",
                "name": "Approve Replenishment Order",
                "description": "Record executive sign-off and release order to SAP ERP.",
            },
        ],
    }


@app.get("/a2a/human_in_loop/pending", tags=["A2A Governance"])
async def a2a_list_pending():
    return list(A2A_PENDING_TICKETS.values())


@app.post("/a2a/human_in_loop/reset", tags=["A2A Governance"])
async def a2a_reset_pending():
    A2A_PENDING_TICKETS.clear()
    return {"status": "reset", "pending_count": 0}


@app.post("/a2a/human_in_loop", tags=["A2A Governance"])
@app.post("/a2a/human_in_loop/", tags=["A2A Governance"])
async def a2a_rpc_endpoint(request: Request):
    body = await request.json()
    params = body.get("params", {}) if isinstance(body, dict) else {}
    action = params.get("action", "request_approval")
    if action == "reset":
        A2A_PENDING_TICKETS.clear()
        return {"jsonrpc": "2.0", "id": body.get("id", "1"), "result": {"status": "reset"}}

    purpose = params.get("purpose", "High-value replenishment / FMCG PO")
    amount = float(params.get("amount", 17672.0))
    sku_id = params.get("sku_id", "SKU-4089-HYDRATE")
    donor_dc = params.get("donor_dc", "FMCG-PLANT-TX01")
    target_store = params.get("target_store", "STORE-HOU-05")
    units = int(params.get("units", 1800))

    if action == "approve":
        res = approve_replenishment_sto(
            purpose=purpose,
            amount=amount,
            sku_id=sku_id,
            donor_dc=donor_dc,
            target_store=target_store,
            units=units,
        )
    else:
        res = ask_for_approval(
            purpose=purpose,
            amount=amount,
            sku_id=sku_id,
            donor_dc=donor_dc,
            target_store=target_store,
            units=units,
        )
    return {"jsonrpc": "2.0", "id": body.get("id", "1"), "result": res}


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
    port = int(os.environ.get("PORT", settings.PORT))
    uvicorn.run(
        "backend.app.main:app",
        host="0.0.0.0",
        port=port,
        reload=False,
    )
