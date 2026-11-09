"""BigQuery Lakehouse Audit Ledger API Router."""

from typing import Any, Dict, List
from fastapi import APIRouter
try:
    from backend.app.services.twin_engine import twin_service
except ImportError:
    from prototype.src.backend.app.services.twin_engine import twin_service

router = APIRouter(prefix="/audit", tags=["Audit Lakehouse"])


@router.get("/ledger", response_model=List[Dict[str, Any]])
async def get_audit_ledger(limit: int = 50):
    """Query recent operational traces from the BigQuery audit ledger and Vertex AI Agent Engine runs."""
    return twin_service.get_audit_ledger(limit=limit)
