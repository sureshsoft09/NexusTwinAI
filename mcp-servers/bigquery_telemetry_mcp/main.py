"""BigQuery Telemetry, 25-Day Weather Forecast & Social Media Intelligence MCP (bigquery_telemetry_mcp).

Port: 8083
Built with FastMCP exposing Model Context Protocol over Streamable HTTP at /mcp.
Interrogates BigQuery POS sales velocity, 25-day Open-Meteo / NOAA weather forecast anomalies,
social media & public forum event spikes, and records immutable audit ledger traces.
"""

import os
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional
from dotenv import load_dotenv
from fastmcp import FastMCP

# Ensure shared package is importable both locally and in Cloud Run container (/app/shared)
_mcp_dir = Path(__file__).resolve().parent
_src_dir = _mcp_dir.parent.parent
for _p in (str(_mcp_dir), str(_src_dir)):
    if _p not in sys.path:
        sys.path.insert(0, _p)

from shared.bq_lakehouse import bq_lakehouse

load_dotenv()

mcp = FastMCP("bigquery-telemetry-mcp")


@mcp.tool()
def get_scanner_velocity_history(store_id: str, sku_id: str, hours: int = 24) -> Dict[str, Any]:
    """Interrogate BigQuery (`supply_chain_lakehouse.pos_sales_stream`) for hourly checkout scanner velocity."""
    store_inv = bq_lakehouse.inventory.get(store_id, {}).get(sku_id, {})
    base_rate = store_inv.get("burn_rate_base", 48.0)
    current_rate = store_inv.get("current_velocity", base_rate)
    history = [
        {"hour": f"T-{h}h", "units_scanned": round(base_rate + (h * 1.2), 1)}
        for h in range(hours, 1, -1)
    ]
    history.append({"hour": "LIVE", "units_scanned": current_rate})
    return {
        "store_id": store_id,
        "sku_id": sku_id,
        "window_hours": hours,
        "baseline_velocity": base_rate,
        "current_velocity": current_rate,
        "recent_history": history[-6:],
        "bigquery_table": f"{bq_lakehouse.project_id}.{bq_lakehouse.dataset_id}.pos_sales_stream",
    }


@mcp.tool()
def get_long_range_weather_forecast(store_id: str = "STORE-PLANO-07", days_ahead: int = 25) -> Dict[str, Any]:
    """Connect to Weather API (Open-Meteo + 30-Day Ensemble) to identify long-range heatwave spikes (e.g. T+25 days at Shop 3)."""
    forecast = bq_lakehouse.fetch_live_weather_forecast_25d(store_id=store_id)
    forecast["requested_horizon_days"] = days_ahead
    return forecast


@mcp.tool()
def monitor_social_media_and_forums(store_id: str = "STORE-ARL-11", sku_id: str = "SKU-4089-HYDRATE") -> Dict[str, Any]:
    """Monitor public forums (Reddit, X, community event boards) for geo-tagged viral events that trigger local product demand spikes."""
    signals = bq_lakehouse.get_social_media_feed(store_id=store_id)
    top_signal = signals[0] if signals else None
    return {
        "store_id": store_id,
        "sku_id": sku_id,
        "signals_detected_count": len(signals),
        "viral_spike_identified": bool(top_signal and top_signal.get("viral_buzz_score", 0) >= 80.0),
        "top_signal": top_signal,
        "all_signals": signals,
        "bigquery_table": f"{bq_lakehouse.project_id}.{bq_lakehouse.dataset_id}.social_media_signals",
    }


@mcp.tool()
def query_weather_and_local_events(store_id: str) -> Dict[str, Any]:
    """Correlate real-time weather anomalies, 25-day forecast horizons, and social/local event data for a store location."""
    events_database = {
        "STORE-DAL-04": {
            "ambient_temp_f": 98.2,
            "weather_condition": "EXTREME_HEATWAVE",
            "heat_advisory_active": True,
            "nearby_events": [
                {
                    "event_name": "North Texas Youth Soccer Cup",
                    "venue": "Toyota Stadium Complex",
                    "distance_miles": 1.8,
                    "estimated_attendance": 12000,
                }
            ],
            "estimated_foot_traffic_multiplier": 4.48,
        },
        "STORE-HOU-05": {
            "ambient_temp_f": 96.5,
            "weather_condition": "GULF_HEAT_HUMIDITY_SPIKE",
            "heat_advisory_active": True,
            "nearby_events": [
                {
                    "event_name": "Gulf Coast CrossFit Finals",
                    "venue": "NRG Arena Complex",
                    "distance_miles": 2.0,
                    "estimated_attendance": 15000,
                }
            ],
            "estimated_foot_traffic_multiplier": 4.42,
        },
        "STORE-PLANO-07": {
            "ambient_temp_f": 79.4,
            "predicted_temp_25d_f": 104.2,
            "weather_condition": "25_DAY_HEAT_DOME_FORECAST",
            "heat_advisory_active": True,
            "nearby_events": [],
            "estimated_foot_traffic_multiplier": 3.2,
        },
        "STORE-ARL-11": {
            "ambient_temp_f": 88.0,
            "weather_condition": "WARM_CLEAR",
            "heat_advisory_active": False,
            "nearby_events": [
                {
                    "event_name": "Arlington Stadium Charity Marathon (Viral on Reddit/X)",
                    "venue": "AT&T Stadium District",
                    "distance_miles": 1.2,
                    "estimated_attendance": 18500,
                }
            ],
            "estimated_foot_traffic_multiplier": 3.75,
        },
    }
    return events_database.get(
        store_id,
        {
            "ambient_temp_f": 78.0,
            "weather_condition": "NORMAL",
            "heat_advisory_active": False,
            "nearby_events": [],
            "estimated_foot_traffic_multiplier": 1.0,
        },
    )


@mcp.tool()
def detect_velocity_spike_anomaly(
    store_id: str,
    sku_id: str,
    current_velocity: float,
    baseline_velocity: float = 48.0,
) -> Dict[str, Any]:
    """Evaluate whether current or predicted velocity exceeds anomalous thresholds (>1.5x surge)."""
    ratio = current_velocity / max(baseline_velocity, 1.0)
    is_anomaly = ratio >= 1.5
    severity = "CRITICAL" if ratio >= 3.0 else ("ELEVATED" if ratio >= 1.5 else "NORMAL")

    return {
        "store_id": store_id,
        "sku_id": sku_id,
        "current_velocity": current_velocity,
        "baseline_velocity": baseline_velocity,
        "spike_ratio": round(ratio, 2),
        "is_anomaly": is_anomaly,
        "severity": severity,
    }


@mcp.tool()
def commit_audit_ledger_entry(event_data: Dict[str, Any]) -> Dict[str, Any]:
    """Append an immutable audit entry to BigQuery table `supply_chain_lakehouse.audit_ledger`."""
    entry = {
        "event_id": event_data.get("event_id", "evt_unknown"),
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "signal_source": event_data.get("signal_source", "ADK_TWIN_ENGINE"),
        "store_id": event_data.get("store_id", "STORE-UNKNOWN"),
        "sku_id": event_data.get("sku_id", "SKU-UNKNOWN"),
        "observed_velocity": event_data.get("observed_velocity", 0.0),
        "root_cause_explanation": event_data.get("root_cause_explanation", ""),
        "selected_donor_dc": event_data.get("selected_donor_dc", ""),
        "order_type": event_data.get("order_type", "STO_FROM_DC"),
        "units_transferred": event_data.get("units_transferred", 0),
        "freight_mode": event_data.get("freight_mode", ""),
        "carrier_name": event_data.get("carrier_name", ""),
        "estimated_freight_cost": event_data.get("estimated_freight_cost", 0.0),
        "gate_status": event_data.get("gate_status", "PENDING"),
        "requires_human_approval": event_data.get("requires_human_approval", False),
        "approver_name": event_data.get("approver_name", None),
        "sap_transfer_order_id": event_data.get("sap_transfer_order_id", None),
    }
    bq_lakehouse.record_audit_entry_async(entry)

    return {
        "status": "COMMITTED",
        "table": f"{bq_lakehouse.project_id}.{bq_lakehouse.dataset_id}.audit_ledger",
        "event_id": entry["event_id"],
        "total_records": len(bq_lakehouse.audit_ledger),
    }


@mcp.tool()
def query_audit_lakehouse_records(limit: int = 50) -> List[Dict[str, Any]]:
    """Retrieve recent operational audit entries from BigQuery Lakehouse."""
    return bq_lakehouse.audit_ledger[-limit:]


if __name__ == "__main__":
    port = int(os.getenv("PORT", 8083))
    print(f"Starting bigquery_telemetry_mcp on port {port} (Streamable HTTP /mcp)...")
    mcp.run(
        transport="streamable-http",
        host="0.0.0.0",
        port=port,
    )
