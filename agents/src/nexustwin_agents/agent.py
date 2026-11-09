"""Google ADK Entrypoint (`agent.py`) for `nexustwin_agents`.

Required by `adk web` and `adk api_server` for agent package discovery in the UI dropdown.
Exports `root_agent = twin_supervisor`.
"""

from nexustwin_agents.supervisor import (
    twin_supervisor,
    sensing_tool,
    replenishment_tool,
    logistics_tool,
    approval_agent,
    execute_replenishment_sto,
    execute_fmcg_purchase_order,
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
    "execute_replenishment_sto",
    "execute_fmcg_purchase_order",
    "NexusTwinSupervisor",
]
