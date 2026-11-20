"""Texas regional supply chain topology for NexusTwin AI digital twin.

Covers 1 Upstream FMCG Manufacturer Plant, 3 Regional Distribution Centers (DCs),
6 Retail Stores, Hero SKU catalog, unified canonical naming registry,
healthy baseline inventory allocations, 25-day weather forecast signals,
and social media / public forum signals.
"""

import copy
from typing import Dict, Any, List

FMCG_MANUFACTURERS: List[Dict[str, Any]] = [
    {
        "id": "FMCG-PLANT-TX01",
        "name": "Waco Bottling Factory (FMCG-PLANT-TX01)",
        "short_name": "Waco Bottling Factory",
        "city": "Waco",
        "state": "TX",
        "lat": 31.5493,
        "lng": -97.1467,
        "daily_production_capacity": 50000,
        "wholesale_unit_cost": 8.79,
        "moq_units": 1000,
        "standard_lead_time_hours": 36.0,
        "expedited_lead_time_hours": 6.0,
        "role": "UPSTREAM_FMCG_MANUFACTURER",
    }
]

REGIONAL_DCS: List[Dict[str, Any]] = [
    {
        "id": "DC-ATX-02",
        "name": "Austin Warehouse (DC-ATX-02)",
        "short_name": "Austin Warehouse",
        "city": "Austin",
        "state": "TX",
        "lat": 30.2672,
        "lng": -97.7431,
        "capacity_pallets": 12000,
        "current_utilization": 0.72,
        "role": "SURPLUS_DONOR",
    },
    {
        "id": "DC-HOU-01",
        "name": "Houston Warehouse (DC-HOU-01)",
        "short_name": "Houston Warehouse",
        "city": "Houston",
        "state": "TX",
        "lat": 29.7604,
        "lng": -95.3698,
        "capacity_pallets": 18000,
        "current_utilization": 0.88,
        "role": "LOW_ATP_CONSTRAINED",
    },
    {
        "id": "DC-SAT-03",
        "name": "San Antonio Warehouse (DC-SAT-03)",
        "short_name": "San Antonio Warehouse",
        "city": "San Antonio",
        "state": "TX",
        "lat": 29.4241,
        "lng": -98.4936,
        "capacity_pallets": 9500,
        "current_utilization": 0.65,
        "role": "SECONDARY_DONOR",
    },
]

RETAIL_STORES: List[Dict[str, Any]] = [
    {
        "id": "STORE-DAL-04",
        "name": "Shop 1: Dallas (STORE-DAL-04)",
        "short_name": "Shop 1: Dallas",
        "city": "Dallas",
        "state": "TX",
        "lat": 32.7767,
        "lng": -96.7970,
        "serving_dc": "DC-ATX-02",
        "tier": "TIER_1_SUPERCENTER",
        "demo_role": "FLOW_1_FAST_POS_DC_STO",
    },
    {
        "id": "STORE-HOU-05",
        "name": "Shop 2: Houston (STORE-HOU-05)",
        "short_name": "Shop 2: Houston",
        "city": "Houston",
        "state": "TX",
        "lat": 29.7399,
        "lng": -95.4617,
        "serving_dc": "DC-HOU-01",
        "tier": "TIER_1_SUPERCENTER",
        "demo_role": "FLOW_2_DC_SHORTAGE_FMCG_PO",
    },
    {
        "id": "STORE-PLANO-07",
        "name": "Shop 3: Plano (STORE-PLANO-07)",
        "short_name": "Shop 3: Plano",
        "city": "Plano",
        "state": "TX",
        "lat": 33.0198,
        "lng": -96.6989,
        "serving_dc": "DC-ATX-02",
        "tier": "TIER_2_GROCERY",
        "demo_role": "FLOW_3_WEATHER_25DAY_PREDICTION",
    },
    {
        "id": "STORE-ARL-11",
        "name": "Shop 4: Arlington (STORE-ARL-11)",
        "short_name": "Shop 4: Arlington",
        "city": "Arlington",
        "state": "TX",
        "lat": 32.7357,
        "lng": -97.1081,
        "serving_dc": "DC-SAT-03",
        "tier": "TIER_1_SUPERCENTER",
        "demo_role": "FLOW_4_SOCIAL_MEDIA_EVENT_SPIKE",
    },
    {
        "id": "STORE-FW-02",
        "name": "Shop 5: Fort Worth (STORE-FW-02)",
        "short_name": "Shop 5: Fort Worth",
        "city": "Fort Worth",
        "state": "TX",
        "lat": 32.7555,
        "lng": -97.3308,
        "serving_dc": "DC-ATX-02",
        "tier": "TIER_1_SUPERCENTER",
        "demo_role": "BASELINE_HEALTHY",
    },
    {
        "id": "STORE-SAT-06",
        "name": "Shop 6: San Antonio (STORE-SAT-06)",
        "short_name": "Shop 6: San Antonio",
        "city": "San Antonio",
        "state": "TX",
        "lat": 29.4252,
        "lng": -98.4861,
        "serving_dc": "DC-SAT-03",
        "tier": "TIER_2_GROCERY",
        "demo_role": "BASELINE_HEALTHY",
    },
]

NODE_DISPLAY_NAMES: Dict[str, str] = {
    item["id"]: item["name"]
    for item in (FMCG_MANUFACTURERS + REGIONAL_DCS + RETAIL_STORES)
}

NODE_SHORT_NAMES: Dict[str, str] = {
    item["id"]: item["short_name"]
    for item in (FMCG_MANUFACTURERS + REGIONAL_DCS + RETAIL_STORES)
}


def get_node_display_name(node_id: str) -> str:
    """Return the unified canonical display name, e.g. 'Shop 1: Dallas (STORE-DAL-04)'."""
    if not node_id:
        return ""
    if node_id in NODE_DISPLAY_NAMES:
        return NODE_DISPLAY_NAMES[node_id]
    for known_id, full_name in NODE_DISPLAY_NAMES.items():
        if node_id.startswith(known_id):
            return full_name
    return node_id


def get_node_short_name(node_id: str) -> str:
    """Return the unified short label, e.g. 'Shop 1: Dallas'."""
    if not node_id:
        return ""
    return NODE_SHORT_NAMES.get(node_id, node_id)


SKU_CATALOG: Dict[str, Dict[str, Any]] = {
    "SKU-4089-HYDRATE": {
        "sku": "SKU-4089-HYDRATE",
        "name": "HydroBoost Electro-Electrolyte 500ml 12-Pack",
        "category": "High-Velocity FMCG Beverage",
        "retail_price": 14.99,
        "cost_of_goods": 8.79,
        "gross_margin": 6.20,
        "pallet_units": 480,
        "weight_per_unit_kg": 6.2,
    },
    "SKU-1022-PROTEIN": {
        "sku": "SKU-1022-PROTEIN",
        "name": "VitalWhey Clean Protein Isolate 1kg",
        "category": "FMCG Nutrition",
        "retail_price": 32.99,
        "cost_of_goods": 19.50,
        "gross_margin": 13.49,
        "pallet_units": 240,
        "weight_per_unit_kg": 1.1,
    },
    "SKU-8821-SNACK": {
        "sku": "SKU-8821-SNACK",
        "name": "CrunchPro Organic Seed Cluster 250g",
        "category": "Packaged Snack",
        "retail_price": 5.49,
        "cost_of_goods": 2.80,
        "gross_margin": 2.69,
        "pallet_units": 600,
        "weight_per_unit_kg": 0.3,
    },
}

# Calm, healthy starting baseline across all 10 network nodes (1 Factory, 3 DCs, 6 Retail Shops)
INITIAL_INVENTORY: Dict[str, Dict[str, Any]] = {
    # Isolated FMCG Manufacturer Inventory (BigQuery: fmcg_factory_inventory)
    "FMCG-PLANT-TX01": {
        "SKU-4089-HYDRATE": {"on_hand": 50000, "safety_buffer": 5000, "atp_surplus": 45000},
    },
    # 3 Regional Retail Warehouses (BigQuery: retail_erp_inventory)
    "DC-ATX-02": {
        # Austin Warehouse has 3,600 ATP surplus -> Fulfills Shop 1 & Shop 3 via internal STO
        "SKU-4089-HYDRATE": {"on_hand": 4800, "safety_buffer": 1200, "atp_surplus": 3600},
        "SKU-1022-PROTEIN": {"on_hand": 2900, "safety_buffer": 800, "atp_surplus": 2100},
        "SKU-8821-SNACK": {"on_hand": 6500, "safety_buffer": 1500, "atp_surplus": 5000},
    },
    "DC-HOU-01": {
        # Houston Warehouse has only 180 ATP surplus (1,680 on hand - 1,500 safety reserve)
        # -> Deterministically triggers B2B FMCG Purchase Order escalation to Waco Bottling Factory!
        "SKU-4089-HYDRATE": {"on_hand": 1680, "safety_buffer": 1500, "atp_surplus": 180},
    },
    "DC-SAT-03": {
        # San Antonio Warehouse has 1,600 ATP surplus -> Fulfills Shop 4 via internal STO
        "SKU-4089-HYDRATE": {"on_hand": 2500, "safety_buffer": 900, "atp_surplus": 1600},
    },
    # 6 Retail Shops — ALL start calm and healthy before live telemetry streaming runs
    "STORE-DAL-04": {
        "SKU-4089-HYDRATE": {"on_hand": 480, "reserved": 0, "safety_buffer": 250, "atp_surplus": 230, "burn_rate_base": 48.0, "current_velocity": 48.0},
    },
    "STORE-HOU-05": {
        "SKU-4089-HYDRATE": {"on_hand": 460, "reserved": 0, "safety_buffer": 250, "atp_surplus": 210, "burn_rate_base": 52.0, "current_velocity": 52.0},
    },
    "STORE-PLANO-07": {
        "SKU-4089-HYDRATE": {"on_hand": 520, "reserved": 0, "safety_buffer": 220, "atp_surplus": 300, "burn_rate_base": 40.0, "current_velocity": 40.0},
    },
    "STORE-ARL-11": {
        "SKU-4089-HYDRATE": {"on_hand": 490, "reserved": 0, "safety_buffer": 240, "atp_surplus": 250, "burn_rate_base": 44.0, "current_velocity": 44.0},
    },
    "STORE-FW-02": {
        "SKU-4089-HYDRATE": {"on_hand": 640, "reserved": 0, "safety_buffer": 250, "atp_surplus": 390, "burn_rate_base": 42.0, "current_velocity": 42.0},
    },
    "STORE-SAT-06": {
        "SKU-4089-HYDRATE": {"on_hand": 590, "reserved": 0, "safety_buffer": 200, "atp_surplus": 390, "burn_rate_base": 38.0, "current_velocity": 38.0},
    },
}

WEATHER_FORECAST_SIGNALS: Dict[str, Dict[str, Any]] = {
    "STORE-PLANO-07": {
        "store_id": "STORE-PLANO-07",
        "store_display_name": "Shop 3: Plano (STORE-PLANO-07)",
        "city": "Plano, TX",
        "lat": 33.0198,
        "lng": -96.6989,
        "current_temp_f": 79.4,
        "forecast_horizon_days": 25,
        "peak_window_start_day": 25,
        "peak_window_end_day": 29,
        "predicted_peak_temp_f": 104.2,
        "weather_anomaly_type": "EXTREME_HEAT_DOME_PREDICTION",
        "predicted_demand_multiplier": 3.2,
        "predicted_extra_units_needed": 1500,
        "recommended_action": "PROACTIVE_PRE_POSITION_FROM_DC",
        "weather_api_source": "Open-Meteo Ensemble & NOAA 30-Day Outlook",
    },
    "STORE-DAL-04": {
        "store_id": "STORE-DAL-04",
        "store_display_name": "Shop 1: Dallas (STORE-DAL-04)",
        "city": "Dallas, TX",
        "lat": 32.7767,
        "lng": -96.7970,
        "current_temp_f": 98.2,
        "forecast_horizon_days": 1,
        "peak_window_start_day": 0,
        "peak_window_end_day": 3,
        "predicted_peak_temp_f": 99.5,
        "weather_anomaly_type": "ACTIVE_REGIONAL_HEATWAVE",
        "predicted_demand_multiplier": 3.8,
        "predicted_extra_units_needed": 1500,
        "recommended_action": "IMMEDIATE_DC_STO_REPLENISHMENT",
        "weather_api_source": "Open-Meteo Live Telemetry",
    },
}

SOCIAL_MEDIA_SIGNALS: List[Dict[str, Any]] = [
    {
        "signal_id": "SOC-TX-8801",
        "platform": "Reddit (r/arlington & r/dfwrunning)",
        "store_id": "STORE-ARL-11",
        "store_display_name": "Shop 4: Arlington (STORE-ARL-11)",
        "sku_id": "SKU-4089-HYDRATE",
        "author": "u/DFWMarathonOfficial",
        "post_text": "18,500 runners registered for the Arlington Stadium Charity Marathon! Official trackside hydration partner: HydroBoost Electro-Electrolyte 12-Packs — grab yours at Shop 4: Arlington (STORE-ARL-11)!",
        "hashtags": ["#ArlingtonMarathon", "#HydroBoost", "#TexasRunners", "#Electrolytes"],
        "mention_velocity_per_hr": 420,
        "viral_buzz_score": 94.5,
        "geo_radius_miles": 1.2,
        "predicted_demand_spike_pct": 275.0,
        "recommended_units": 1200,
        "detected_at": "2026-11-05T07:15:00Z",
    },
    {
        "signal_id": "SOC-TX-8802",
        "platform": "X / Public Community Forum",
        "store_id": "STORE-HOU-05",
        "store_display_name": "Shop 2: Houston (STORE-HOU-05)",
        "sku_id": "SKU-4089-HYDRATE",
        "author": "@HoustonFitnessClub",
        "post_text": "Shelves of HydroBoost Electrolyte 12-packs disappearing fast at Shop 2: Houston (STORE-HOU-05) ahead of the Gulf Coast CrossFit Finals!",
        "hashtags": ["#HoustonFitness", "#HydroBoost", "#StockAlert"],
        "mention_velocity_per_hr": 310,
        "viral_buzz_score": 89.0,
        "geo_radius_miles": 2.0,
        "predicted_demand_spike_pct": 340.0,
        "recommended_units": 1800,
        "detected_at": "2026-11-05T07:22:00Z",
    },
]


def get_fresh_inventory() -> Dict[str, Dict[str, Any]]:
    """Return a deep copy of the healthy baseline inventory for demo reset."""
    return copy.deepcopy(INITIAL_INVENTORY)
