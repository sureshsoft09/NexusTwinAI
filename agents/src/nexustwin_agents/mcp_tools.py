"""Model Context Protocol (MCP) toolset bindings for NexusTwin ADK agents.

Connects to the three standalone FastMCP microservices via Streamable HTTP (SSE):
  1. `ErpMCP_Tool`:       erp-inventory-mcp -> get_warehouse_stock, get_dc_available_to_promise, create_transfer_order
  2. `LogisticsMCP_Tool`: logistics-rates-mcp -> calculate_freight_rates, get_carrier_transit_eta
  3. `BigQueryMCP_Tool`:  bigquery-telemetry-mcp -> get_scanner_velocity_history, query_weather_and_local_events, commit_audit_ledger_entry
"""

import os
from google.adk.tools.mcp_tool.mcp_toolset import MCPToolset
from google.adk.tools.mcp_tool.mcp_session_manager import StreamableHTTPConnectionParams
from nexustwin_agents import config


def _normalize_mcp_url(url: str) -> str:
    url = (url or "").rstrip("/")
    return url if url.endswith("/mcp") else f"{url}/mcp"


# MCP Server Streamable HTTP URLs (from config / environment / Cloud Run)
ERP_MCP_URL = _normalize_mcp_url(config.MCP_ERP_URL)
LOGISTICS_MCP_URL = _normalize_mcp_url(config.MCP_LOGISTICS_URL)
BIGQUERY_MCP_URL = _normalize_mcp_url(config.MCP_BIGQUERY_URL)

# Note: `errlog=None` prevents `sys.stderr` (`TextIOWrapper`) from being stored on `MCPToolset`,
# allowing `AdkApp.clone()` (`copy.deepcopy`) and `cloudpickle.dump` to succeed during Agent Engine deployment!
ErpMCP_Tool = MCPToolset(
    connection_params=StreamableHTTPConnectionParams(
        url=ERP_MCP_URL,
        timeout=30.0,
    ),
    errlog=None,
)

LogisticsMCP_Tool = MCPToolset(
    connection_params=StreamableHTTPConnectionParams(
        url=LOGISTICS_MCP_URL,
        timeout=30.0,
    ),
    errlog=None,
)

BigQueryMCP_Tool = MCPToolset(
    connection_params=StreamableHTTPConnectionParams(
        url=BIGQUERY_MCP_URL,
        timeout=30.0,
    ),
    errlog=None,
)
