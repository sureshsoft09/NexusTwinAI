"""Logistics Rates & SLA Microservice (logistics_rates_mcp).

Port: 8082
Built with FastMCP exposing Model Context Protocol over Streamable HTTP at /mcp.
Calculates dynamic carrier rates, transit hours, and SLA compliance.
"""

import os
from typing import Any, Dict, List, Optional
from dotenv import load_dotenv
from fastmcp import FastMCP
from pydantic import BaseModel

load_dotenv()

mcp = FastMCP("logistics-rates-mcp")

# Contracted Carrier Matrix for Texas triangle
CARRIER_CONTRACTS = [
    {
        "carrier_id": "CARRIER-TX-FLEET",
        "name": "Texas Dedicated Fleet (Ground Freight)",
        "mode": "LATERAL_GROUND_TRANSFER",
        "base_rate_per_mile": 2.15,
        "handling_fee": 150.0,
        "avg_speed_mph": 45.0,
        "sla_reliability": 0.985,
    },
    {
        "carrier_id": "CARRIER-AIR-EXP",
        "name": "LoneStar Expedited Air Cargo",
        "mode": "EXPEDITED_AIR_FREIGHT",
        "base_flat_rate": 3500.0,
        "per_kg_rate": 1.45,
        "handling_fee": 450.0,
        "sla_reliability": 0.995,
    },
    {
        "carrier_id": "CARRIER-LTL-CONWAY",
        "name": "Conway Regional LTL Ground",
        "mode": "REGIONAL_LTL_GROUND",
        "base_rate_per_mile": 1.65,
        "handling_fee": 95.0,
        "avg_speed_mph": 35.0,
        "sla_reliability": 0.910,
    },
]

# Mileages between network nodes
DISTANCE_MATRIX = {
    ("DC-ATX-02", "STORE-DAL-04"): 195.0,
    ("DC-ATX-02", "STORE-FW-02"): 190.0,
    ("DC-HOU-01", "STORE-DAL-04"): 240.0,
    ("DC-SAT-03", "STORE-DAL-04"): 275.0,
}


@mcp.tool()
def calculate_freight_rates(
    origin_dc: str,
    dest_store: str,
    weight_kg: float = 9300.0,
    urgency: str = "STANDARD",
) -> Dict[str, Any]:
    """Calculate multi-carrier freight rate quotes and transit durations for a transfer."""
    dist_miles = DISTANCE_MATRIX.get((origin_dc, dest_store), 200.0)
    quotes = []

    # 1. Dedicated Ground
    ground_transit = round((dist_miles / 45.0) + 3.0, 1)  # +3h dock loading/unloading
    ground_cost = round((dist_miles * 2.15) + 150.0 + 180.0, 2)  # fuel surcharge
    quotes.append({
        "carrier_id": "CARRIER-TX-FLEET",
        "carrier_name": "Texas Fleet Logistics (Dedicated)",
        "freight_mode": "LATERAL_GROUND_TRANSFER",
        "transit_hours": ground_transit,
        "total_freight_cost": ground_cost,
        "recommended": True,
        "rationale": f"Optimal cost ($750) with reliable {ground_transit}h arrival well within store stockout runway.",
    })

    # 2. Expedited Air
    air_transit = 7.5
    air_cost = round(3500.0 + (weight_kg * 0.05) + 450.0, 2)
    quotes.append({
        "carrier_id": "CARRIER-AIR-EXP",
        "carrier_name": "LoneStar Expedited Air Cargo",
        "freight_mode": "EXPEDITED_AIR_FREIGHT",
        "transit_hours": air_transit,
        "total_freight_cost": air_cost,
        "recommended": False,
        "rationale": f"Fastest ({air_transit}h), but cost (${air_cost}) creates unnecessary margin erosion.",
    })

    # 3. Regional LTL
    ltl_transit = round((dist_miles / 35.0) + 12.0, 1)  # cross-dock sorting delay
    ltl_cost = round((dist_miles * 1.65) + 95.0, 2)
    quotes.append({
        "carrier_id": "CARRIER-LTL-CONWAY",
        "carrier_name": "Conway Regional LTL Ground",
        "freight_mode": "REGIONAL_LTL_GROUND",
        "transit_hours": ltl_transit,
        "total_freight_cost": ltl_cost,
        "recommended": False,
        "rationale": f"Lowest cost (${ltl_cost}), but transit ({ltl_transit}h) risks shelf stockout.",
    })

    return {
        "origin_dc": origin_dc,
        "dest_store": dest_store,
        "distance_miles": dist_miles,
        "options_evaluated": len(quotes),
        "quotes": quotes,
    }


@mcp.tool()
def get_carrier_transit_eta(origin_dc: str, dest_store: str, mode: str = "LATERAL_GROUND_TRANSFER") -> Dict[str, Any]:
    """Retrieve precise carrier transit lead times and delivery ETA."""
    dist_miles = DISTANCE_MATRIX.get((origin_dc, dest_store), 200.0)
    if "AIR" in mode.upper():
        lead_hours = 8.0
    elif "LTL" in mode.upper():
        lead_hours = 22.0
    else:
        lead_hours = 14.0

    return {
        "origin_dc": origin_dc,
        "dest_store": dest_store,
        "mode": mode,
        "transit_hours": lead_hours,
        "handling_hours": 2.5,
        "total_sla_hours": lead_hours + 2.5,
        "on_time_guarantee_pct": 98.5,
    }


@mcp.tool()
def list_active_freight_contracts() -> List[Dict[str, Any]]:
    """Return contracted carriers, SLA ratings, and rate schedules."""
    return CARRIER_CONTRACTS


if __name__ == "__main__":
    port = int(os.getenv("PORT", 8082))
    print(f"Starting logistics_rates_mcp on port {port} (Streamable HTTP /mcp)...")
    mcp.run(
        transport="streamable-http",
        host="0.0.0.0",
        port=port,
    )
