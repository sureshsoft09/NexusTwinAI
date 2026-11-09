"""Remote A2A Human-in-the-Loop Approval Agent package for NexusTwin AI.

Exposed at: http://localhost:8001/a2a/human_in_loop/.well-known/agent.json
Launched via: adk api_server --port 8001 --a2a agents/src
"""

from . import agent
from .agent import root_agent

__all__ = ["agent", "root_agent"]
