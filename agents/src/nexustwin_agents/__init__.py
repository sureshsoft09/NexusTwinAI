"""NexusTwin AI Agent Package Root.

Built natively on the Google Cloud Agent Development Kit (ADK) framework.
Exports `agent` and `root_agent` for native CLI discovery by `adk web` and Vertex AI Agent Engine.
"""

import sys
from pathlib import Path

# Ensure 'agents/src' and repo root are always on sys.path
_pkg_root = Path(__file__).resolve().parent.parent
_repo_root = _pkg_root.parent.parent

for _p in [str(_pkg_root), str(_repo_root)]:
    if _p not in sys.path:
        sys.path.insert(0, _p)

from . import agent
from .agent import (
    root_agent,
    twin_supervisor,
    approval_agent,
    execute_replenishment_sto,
    execute_fmcg_purchase_order,
    NexusTwinSupervisor,
)
from nexustwin_agents.gate import FeasibilityGateEvaluator, evaluate_feasibility_gate

__all__ = [
    "agent",
    "root_agent",
    "twin_supervisor",
    "approval_agent",
    "execute_replenishment_sto",
    "execute_fmcg_purchase_order",
    "NexusTwinSupervisor",
    "FeasibilityGateEvaluator",
    "evaluate_feasibility_gate",
]
