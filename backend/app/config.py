"""Backend configuration settings for NexusTwin AI.

Loads environment variables from `Prototype/src/backend/.env`.
"""

import os
from pathlib import Path
from dotenv import load_dotenv
from pydantic_settings import BaseSettings

_backend_dir = Path(__file__).resolve().parent.parent
_env_file = _backend_dir / ".env"
if _env_file.exists():
    load_dotenv(_env_file, override=True)


class Settings(BaseSettings):
    PROJECT_NAME: str = "NexusTwin AI - Cognitive Agent Bridge"
    VERSION: str = "2.0.0"
    API_V1_PREFIX: str = "/api/v1"
    PORT: int = int(os.getenv("PORT", "8080"))
    HOST: str = os.getenv("HOST", "0.0.0.0")
    CORS_ORIGINS: list[str] = ["*"]

    # GCP, BigQuery Lakehouse & Cloud Firestore Configuration
    GCP_PROJECT_ID: str = os.getenv("GCP_PROJECT_ID", os.getenv("GOOGLE_CLOUD_PROJECT", "nexustwinai-project"))
    BQ_DATASET_ID: str = os.getenv("BQ_DATASET_ID", "supply_chain_lakehouse")

    # Public Cloud Run URL for RemoteA2aAgent card & A2A JSON-RPC
    PUBLIC_BACKEND_URL: str = os.getenv(
        "PUBLIC_BACKEND_URL",
        "https://nexustwin-backend-311231946335.us-central1.run.app",
    )

    # Deployed Vertex AI Agent Engine Configuration
    AGENT_ENGINE_REGION: str = os.getenv("AGENT_ENGINE_REGION", "us-central1")
    AGENT_ENGINE_RESOURCE_ID: str = os.getenv(
        "AGENT_ENGINE_RESOURCE_ID",
        "projects/311231946335/locations/us-central1/reasoningEngines/6418419193229606912",
    )

    # Cloud Run FastMCP Endpoint (used by embedded A2A approval_agent & VP fallback)
    MCP_ERP_URL: str = os.getenv(
        "MCP_ERP_URL",
        "https://erp-inventory-mcp-zjhvvbsjwa-uc.a.run.app/mcp",
    )

    # Remote A2A HITL Agent Base URL
    A2A_APPROVAL_AGENT_BASE_URL: str = os.getenv(
        "A2A_APPROVAL_AGENT_BASE_URL",
        "https://nexustwin-backend-311231946335.us-central1.run.app/a2a/human_in_loop",
    )

    # 4-Rule Feasibility Gate Thresholds
    AUTONOMY_THRESHOLD_USD: float = float(os.getenv("AUTONOMY_THRESHOLD_USD", "1000.0"))
    MIN_STOCKOUT_RUNWAY_BUFFER_HOURS: float = float(os.getenv("MIN_STOCKOUT_RUNWAY_BUFFER_HOURS", "4.0"))

    AGENT_BRIDGE_SECRET: str = os.getenv("AGENT_BRIDGE_SECRET", "nexus-twin-secret-key-2026")


settings = Settings()
