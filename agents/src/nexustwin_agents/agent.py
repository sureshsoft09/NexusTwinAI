"""Google ADK Entrypoint (`agent.py`) for `nexustwin_agents`.

Required by `adk web`, `adk api_server`, and Vertex AI Agent Engine deployment.
Exports `root_agent = twin_supervisor`.
"""

from nexustwin_agents.supervisor import (
    twin_supervisor,
    sensing_tool,
    replenishment_tool,
    logistics_tool,
    approval_agent,
    evaluate_4_gate_guardrail,
    NexusTwinSupervisor,
)

root_agent = twin_supervisor

__all__ = [
    "root_agent",
    "twin_supervisor",
    "sensing_tool",
    "replenishment_tool",
    "logistics_tool",
    "approval_agent",
    "evaluate_4_gate_guardrail",
    "NexusTwinSupervisor",
]
