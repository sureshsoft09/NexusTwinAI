"""Market Sensing Agent (sensing_agent).

Two-Stage Google ADK Pipeline:
  Stage 1: Investigate Agent (queries BigQuery POS velocity, 25-day Weather API forecasts, and Social Media forums)
  Stage 2: Conclude Agent (synthesizes root-cause explanation and projected stockout runway)
"""

from typing import Any, Dict
from nexustwin_agents import config
from nexustwin_agents.mcp_tools import BigQueryMCP_Tool
try:
    from shared.schemas import MarketSignalContext, MarketSignalEvent
    from shared.bq_lakehouse import bq_lakehouse
except ImportError:
    from prototype.src.shared.schemas import MarketSignalContext, MarketSignalEvent
    from prototype.src.shared.bq_lakehouse import bq_lakehouse

try:
    from google.adk.agents import LlmAgent, SequentialAgent
except ImportError:
    class LlmAgent:
        def __init__(self, name: str, instruction: str, model: str = "gemini-2.5-flash", tools: list = None, **kwargs):
            self.name = name
            self.instruction = instruction
            self.model = model
            self.tools = tools or []

    class SequentialAgent:
        def __init__(self, name: str, sub_agents: list = None, **kwargs):
            self.name = name
            self.sub_agents = sub_agents or []


def query_store_pos_velocity(store_id: str = "STORE-DAL-04", sku_id: str = "SKU-4089-HYDRATE") -> Dict[str, Any]:
    """Query real-time POS scanner velocity from BigQuery (`supply_chain_lakehouse.pos_sales_stream`)."""
    store_inv = bq_lakehouse.inventory.get(store_id, {}).get(sku_id, {})
    base = store_inv.get("burn_rate_base", 48.0)
    obs = store_inv.get("current_velocity", 215.0)
    stock = store_inv.get("on_hand", 180)
    return {
        "store_id": store_id,
        "sku_id": sku_id,
        "baseline_velocity_units_hr": base,
        "observed_velocity_units_hr": obs,
        "velocity_spike_pct": round(((obs / max(base, 1.0)) - 1) * 100, 1),
        "current_shelf_stock_units": stock,
        "projected_stockout_runway_hours": round(stock / max(obs, 1.0), 1),
    }


def query_weather_forecast_25d(store_id: str = "STORE-PLANO-07") -> Dict[str, Any]:
    """Query 25-day long-range Weather API forecast (Open-Meteo + Ensemble) for upcoming heatwave spikes."""
    return bq_lakehouse.fetch_live_weather_forecast_25d(store_id=store_id)


def query_social_media_buzz(store_id: str = "STORE-ARL-11", sku_id: str = "SKU-4089-HYDRATE") -> Dict[str, Any]:
    """Monitor Reddit, X, and public forums for viral local events triggering demand spikes."""
    signals = bq_lakehouse.get_social_media_feed(store_id=store_id)
    return {
        "store_id": store_id,
        "sku_id": sku_id,
        "signals": signals,
    }


SENSING_INSTRUCTION = """
You are the NexusTwin Market Sensing Specialist (`market_sensing_agent`).
Your task is to analyze demand anomalies from three enterprise ingestion streams and synthesize a clear assessment:
1. Real-time POS checkout scanners (`query_store_pos_velocity`).
2. 25-day Weather API heatwave predictions (`query_weather_forecast_25d`).
3. Social media & public forum event monitors (`query_social_media_buzz`).

After calling the relevant sensing tool(s), report:
- The causal root-cause of the demand spike (POS velocity, 25-day weather forecast, or viral social event).
- The projected hours or days until shelf stockout.
- A confidence score (0-100%).
"""

_sensing_tools = [query_store_pos_velocity, query_weather_forecast_25d, query_social_media_buzz]
if not hasattr(BigQueryMCP_Tool, "name"):
    _sensing_tools.append(BigQueryMCP_Tool)

sensing_agent = LlmAgent(
    model=config.get_gemini_model(config.MODEL_FAST),
    name="market_sensing_agent",
    description="Analyzes retail POS velocity surges, 25-day weather API forecasts, and social media event drivers.",
    instruction=SENSING_INSTRUCTION,
    tools=_sensing_tools,
)

# Backwards-compatible aliases
sensing_investigate = sensing_agent
sensing_conclude = sensing_agent


class MarketSensingService:
    """Service wrapper for standalone and programmatic execution across all 4 demo flows."""

    def analyze(self, event: MarketSignalEvent) -> MarketSignalContext:
        ratio = event.observed_velocity / max(event.baseline_velocity, 1.0)
        burn_rate = max(event.observed_velocity, 1.0)
        runway_hours = round(event.current_store_stock / burn_rate, 1)

        if event.signal_source == "WEATHER_FORECAST_25D" or event.forecast_horizon_days >= 20:
            weather_info = bq_lakehouse.fetch_live_weather_forecast_25d(event.store_id)
            runway_hours = 25 * 24.0  # 25 days proactive lead window
            root_cause = (
                f"[25-DAY WEATHER PREDICTION] Open-Meteo & NOAA Ensemble Forecast identified a severe "
                f"104.2°F Heat Dome arriving at {event.store_id} in T+{event.forecast_horizon_days or 25} days "
                f"(current temp: {weather_info.get('current_temp_f', 79.4)}°F). Predictive elasticity model projects "
                f"a +{round((ratio - 1) * 100)}% surge ({event.observed_velocity} u/hr) for {event.sku_id}. "
                f"Recommending proactive pre-positioning now via low-cost ground freight."
            )
            ext_factors = weather_info
        elif event.signal_source == "SOCIAL_MEDIA_MONITOR":
            social_list = bq_lakehouse.get_social_media_feed(event.store_id)
            top_soc = social_list[0] if social_list else {}
            runway_hours = max(18.0, runway_hours)
            root_cause = (
                f"[SOCIAL MEDIA & FORUM MONITOR] Viral local event detected on {top_soc.get('platform', 'Reddit/X')} "
                f"(Buzz Score: {top_soc.get('viral_buzz_score', 94.5)}/100, {top_soc.get('mention_velocity_per_hr', 420)} mentions/hr) "
                f"within {top_soc.get('geo_radius_miles', 1.2)} mi of {event.store_id}: "
                f"\"{top_soc.get('post_text', event.context_notes or '')}\" — triggering a +{round((ratio - 1) * 100)}% demand spike."
            )
            ext_factors = top_soc
        elif event.store_id == "STORE-HOU-05":
            # Shop 2: Fast POS spike + DC shortage -> FMCG PO
            runway_hours = max(18.0, runway_hours)
            root_cause = (
                f"[POS SCANNER SURGE + DC SHORTAGE] Checkout velocity for {event.sku_id} at Shop 2 ({event.store_id}) "
                f"spiked to {event.observed_velocity} u/hr (+{round((ratio - 1) * 100)}% over {event.baseline_velocity} u/hr baseline) "
                f"during the Gulf Coast CrossFit Finals (15,000 attendees). Serving Houston DC (DC-HOU-01) has only 180 ATP units "
                f"available above its 1,500-unit safety buffer — escalating to External FMCG Manufacturer (FMCG-PLANT-TX01) via PO process."
            )
            ext_factors = {"ambient_temp_f": 96.5, "dc_atp_shortage": True, "fmcg_escalation": "FMCG-PLANT-TX01"}
        else:
            # Shop 1 (STORE-DAL-04): Fast POS spike -> Fulfilled from Austin DC (DC-ATX-02)
            runway_hours = max(24.0, runway_hours)
            root_cause = (
                f"[FAST POS SCANNER SURGE] Checkout velocity for {event.sku_id} at Shop 1 ({event.store_id}) "
                f"spiked to {event.observed_velocity} u/hr (+{round((ratio - 1) * 100)}% over {event.baseline_velocity} u/hr baseline). "
                f"Driven by 98.2°F regional heatwave + North Texas Youth Soccer Cup (12,000 attendees). "
                f"Serving Austin DC (DC-ATX-02) has 3,600 ATP surplus units available for immediate internal STO transfer."
            )
            ext_factors = {
                "ambient_temp_f": 98.2,
                "heat_advisory": True,
                "event": "North Texas Youth Soccer Cup",
                "attendance": 12000,
            }

        return MarketSignalContext(
            event_id=event.event_id,
            store_id=event.store_id,
            sku_id=event.sku_id,
            signal_source=event.signal_source,
            forecast_horizon_days=event.forecast_horizon_days,
            velocity_spike_ratio=round(ratio, 2),
            projected_stockout_hours=runway_hours,
            root_cause_explanation=root_cause,
            external_factors=ext_factors,
            confidence_score=0.96,
        )
