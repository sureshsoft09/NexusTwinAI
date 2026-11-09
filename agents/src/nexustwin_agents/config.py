"""Configuration and environment management for NexusTwin AI ADK agents."""

import os
import sys
from pathlib import Path
from dotenv import load_dotenv

# Search for .env in `agents/.env` or `backend/.env`
_curr = Path(__file__).resolve().parent
for _ in range(4):
    for _cand in (_curr / ".env", _curr / "backend" / ".env", _curr / "agents" / ".env"):
        if _cand.exists():
            load_dotenv(_cand, override=True)
            break
    _curr = _curr.parent

# Google Cloud & Vertex AI settings (Standardized on NexusTwinAI-project: nexustwinai-project)
GOOGLE_CLOUD_PROJECT = os.getenv("GCP_PROJECT_ID", os.getenv("GOOGLE_CLOUD_PROJECT", "nexustwinai-project"))
GCP_PROJECT_ID = GOOGLE_CLOUD_PROJECT
GEMINI_MODEL_LOCATION = os.getenv("GEMINI_MODEL_LOCATION", "global")
GOOGLE_CLOUD_LOCATION = GEMINI_MODEL_LOCATION
GCP_REGION = GEMINI_MODEL_LOCATION
GOOGLE_GENAI_USE_VERTEXAI = os.getenv("GOOGLE_GENAI_USE_VERTEXAI", "true")

# Ensure Vertex AI / ADK environment variables are exported in-process (overrides container default location to global for gemini-3.5-flash)
os.environ["GOOGLE_CLOUD_PROJECT"] = GCP_PROJECT_ID
os.environ["GCP_PROJECT_ID"] = GCP_PROJECT_ID
os.environ["GOOGLE_CLOUD_LOCATION"] = GEMINI_MODEL_LOCATION
os.environ["GOOGLE_GENAI_USE_VERTEXAI"] = GOOGLE_GENAI_USE_VERTEXAI

# ADK Model configuration (Standardized on gemini-3.5-flash with automatic 429 retry backoff)
ADK_MODEL = os.getenv("ADK_MODEL", "gemini-3.5-flash")
MODEL_REASONING = os.getenv("MODEL_REASONING", "gemini-3.5-flash")
MODEL_FAST = os.getenv("MODEL_FAST", "gemini-3.5-flash")


def get_gemini_model(model_name: str | None = None):
    """Return a Google ADK `Gemini` model configured with automatic HTTP 429 exponential backoff retry."""
    target_model = model_name or ADK_MODEL
    try:
        from google.adk.models import Gemini
        from google.genai import types

        return Gemini(
            model=target_model,
            retry_options=types.HttpRetryOptions(
                initial_delay=2.0,
                attempts=5,
                exp_base=2.0,
                http_status_codes=[429, 500, 502, 503, 504],
            ),
        )
    except Exception:
        return target_model

# MCP Server Endpoints (Streamable HTTP /mcp - Cloud Run or Local)
MCP_ERP_URL = os.getenv("MCP_ERP_URL", "https://erp-inventory-mcp-zjhvvbsjwa-uc.a.run.app/mcp")
MCP_LOGISTICS_URL = os.getenv("MCP_LOGISTICS_URL", "https://logistics-rates-mcp-zjhvvbsjwa-uc.a.run.app/mcp")
MCP_BIGQUERY_URL = os.getenv("MCP_BIGQUERY_URL", "https://bigquery-telemetry-mcp-zjhvvbsjwa-uc.a.run.app/mcp")

# Feasibility Gate Thresholds
AUTONOMY_THRESHOLD_USD = float(os.getenv("AUTONOMY_THRESHOLD_USD", "1000.0"))
MIN_STOCKOUT_RUNWAY_BUFFER_HOURS = float(os.getenv("MIN_STOCKOUT_RUNWAY_BUFFER_HOURS", "4.0"))

# Remote A2A Agent Endpoints (Human-in-the-Loop Approval Agent on Port 8001)
A2A_APPROVAL_AGENT_BASE_URL = os.getenv(
    "A2A_APPROVAL_AGENT_BASE_URL",
    "http://localhost:8001/a2a/human_in_loop",
)

# Deployed Vertex AI Agent Engine Resource ID
AGENT_ENGINE_REGION = os.getenv("AGENT_ENGINE_REGION", "us-central1")
AGENT_ENGINE_RESOURCE_ID = os.getenv(
    "AGENT_ENGINE_RESOURCE_ID",
    os.getenv(
        "AGENT_ENGINE_RESOURCE_NAME",
        "projects/311231946335/locations/us-central1/reasoningEngines/6418419193229606912",
    ),
)

# Self-alias so both `from nexustwin_agents import config` and `from nexustwin_agents.config import config` work
config = sys.modules[__name__]
