"""Remote A2A Server for Human-in-the-Loop Approval Agent (Port 8001).

Serves the ACTUAL Google ADK `human_in_loop` LlmAgent (`approval_agent` in
`agents/src/human_in_loop/agent.py`) over the official Google ADK A2A protocol
using `google.adk.a2a.utils.agent_to_a2a.to_a2a()` and `A2aAgentExecutor`:
  - GET  http://localhost:8001/a2a/human_in_loop/.well-known/agent-card.json
  - GET  http://localhost:8001/a2a/human_in_loop/.well-known/agent.json
  - POST http://localhost:8001/a2a/human_in_loop  (Live ADK A2aAgentExecutor + Gemini LLM)
  - GET  http://localhost:8001/a2a/human_in_loop/pending (Ticket feed for React Cockpit)

 Can also be launched via the ADK CLI:
  `adk api_server --a2a --port 8001 agents/src`
"""

import os
import sys
from pathlib import Path

from starlette.middleware.cors import CORSMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse
from starlette.routing import Route
import uvicorn

root_dir = Path(__file__).resolve().parent
agents_src = root_dir / "agents" / "src"
for p in [str(root_dir), str(agents_src)]:
    if p not in sys.path:
        sys.path.insert(0, p)

from google.adk.a2a.utils.agent_to_a2a import to_a2a
from human_in_loop.agent import (
    root_agent as human_in_loop_agent,
    A2A_PENDING_TICKETS,
    ask_for_approval,
    approve_replenishment_sto,
)

A2A_HOST = os.getenv("A2A_HOST", "localhost")
A2A_PORT = int(os.getenv("A2A_PORT", "8001"))
A2A_PROTOCOL = os.getenv("A2A_PROTOCOL", "http")

# Convert the actual `human_in_loop` ADK LlmAgent into an A2A Starlette application
app = to_a2a(
    human_in_loop_agent,
    host=A2A_HOST,
    port=A2A_PORT,
    protocol=A2A_PROTOCOL,
    rpc_path="a2a/human_in_loop",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


async def list_a2a_pending_tickets(request: Request) -> JSONResponse:
    """Return all live A2A approval tickets created by `human_in_loop` LlmAgent tool calls."""
    return JSONResponse(list(A2A_PENDING_TICKETS.values()))


async def reset_a2a_pending_tickets(request: Request) -> JSONResponse:
    """Clear all in-memory pending A2A tickets on Demo Reset."""
    A2A_PENDING_TICKETS.clear()
    return JSONResponse({"status": "reset", "pending_count": 0})


async def get_legacy_agent_json(request: Request) -> JSONResponse:
    """Alias `/.well-known/agent.json` to the live ADK A2A AgentCard route."""
    for route in app.routes:
        if getattr(route, "path", "") == "/a2a/human_in_loop/.well-known/agent-card.json":
            return await route.endpoint(request)
    return JSONResponse({"name": "approval_agent", "url": f"{A2A_PROTOCOL}://{A2A_HOST}:{A2A_PORT}/a2a/human_in_loop"})


async def forward_trailing_slash_rpc(request: Request):
    """Ensure both `/a2a/human_in_loop` and `/a2a/human_in_loop/` route to the live A2A Agent Executor."""
    # Also support direct backend-api bridge JSON-RPC approval/ticket triggers alongside ADK RemoteA2aAgent
    body = await request.json()
    params = body.get("params", {}) if isinstance(body, dict) else {}
    if isinstance(params, dict) and "action" in params and "message" not in params:
        action = params.get("action")
        if action == "reset":
            A2A_PENDING_TICKETS.clear()
            return JSONResponse({"jsonrpc": "2.0", "id": body.get("id", "1"), "result": {"status": "reset"}})
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
        return JSONResponse({"jsonrpc": "2.0", "id": body.get("id", "1"), "result": res})

    for route in app.routes:
        if getattr(route, "path", "") == "/a2a/human_in_loop":
            return await route.endpoint(request)
    return JSONResponse({"error": "A2A route not initialized"}, status_code=500)


app.routes.extend([
    Route("/a2a/human_in_loop/pending", endpoint=list_a2a_pending_tickets, methods=["GET"]),
    Route("/a2a/human_in_loop/reset", endpoint=reset_a2a_pending_tickets, methods=["POST"]),
    Route("/a2a/human_in_loop/.well-known/agent.json", endpoint=get_legacy_agent_json, methods=["GET"]),
    Route("/a2a/human_in_loop/", endpoint=forward_trailing_slash_rpc, methods=["POST"]),
])


if __name__ == "__main__":
    print(f"Starting REAL Google ADK Remote A2A Agent Server (`human_in_loop`) on port {A2A_PORT}...")
    print(f"Agent Card URL: {A2A_PROTOCOL}://{A2A_HOST}:{A2A_PORT}/a2a/human_in_loop/.well-known/agent-card.json")
    uvicorn.run(app, host="0.0.0.0", port=A2A_PORT)

