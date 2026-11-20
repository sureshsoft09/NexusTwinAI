"""Logistics Rates & SLA Microservice (logistics_rates_mcp).

Port: 8082
Built with FastMCP exposing Model Context Protocol over Streamable HTTP at /mcp.
Represents the independent 3PL Carrier Network domain — quoting realistic Texas lane
freight rates, transit hours, and SLA compliance without exposing internal carrier pricing DBs.
"""

import os
from typing import Any, Dict, List
from dotenv import load_dotenv
from fastmcp import FastMCP

load_dotenv()

mcp = FastMCP("logistics-rates-mcp")

CARRIER_CONTRACTS = [
    {
        "carrier_id": "CARRIER-TX-FLEET",
        "name": "Texas Fleet Logistics (Dedicated Ground)",
        "mode": "LATERAL_GROUND_TRANSFER",
        "avg_speed_mph": 52.0,
        "sla_reliability": 0.988,
    },
    {
        "carrier_id": "CARRIER-TX-ECON",
        "name": "Texas Rail & Ground Economy (25-Day Pre-Position)",
        "mode": "SCHEDULED_ECONOMY_PREPOSITION",
        "avg_speed_mph": 35.0,
        "sla_reliability": 0.992,
    },
    {
        "carrier_id": "CARRIER-ALAMO-EXP",
        "name": "Alamo Regional Dedicated Express",
        "mode": "LATERAL_GROUND_TRANSFER",
        "avg_speed_mph": 54.0,
        "sla_reliability": 0.985,
    },
    {
        "carrier_id": "CARRIER-FMCG-COLD",
        "name": "HydroBoost Cold-Chain Direct Carrier (FMCG PO)",
        "mode": "FMCG_DIRECT_EXPEDITED_PO",
        "avg_speed_mph": 55.0,
        "sla_reliability": 0.994,
    },
    {
        "carrier_id": "CARRIER-AIR-EXP",
        "name": "LoneStar Expedited Air Cargo",
        "mode": "EXPEDITED_AIR_FREIGHT",
        "avg_speed_mph": 220.0,
        "sla_reliability": 0.996,
    },
]

# Realistic Texas triangle highway mileages
DISTANCE_MATRIX = {
    ("DC-ATX-02", "STORE-DAL-04"): 195.0,
    ("DC-ATX-02", "STORE-PLANO-07"): 215.0,
    ("DC-ATX-02", "STORE-FW-02"): 190.0,
    ("DC-SAT-03", "STORE-ARL-11"): 260.0,
    ("DC-SAT-03", "STORE-SAT-06"): 18.0,
    ("DC-HOU-01", "STORE-HOU-05"): 24.0,
    ("FMCG-PLANT-TX01", "STORE-HOU-05"): 185.0,
    ("FMCG-PLANT-TX01", "STORE-DAL-04"): 96.0,
}


@mcp.tool()
def calculate_freight_rates(
    origin_dc: str,
    dest_store: str,
    weight_kg: float = 9300.0,
    urgency: str = "STANDARD",
) -> Dict[str, Any]:
    """Calculate multi-carrier 3PL freight quotes, realistic Texas transit ETAs, and autonomy cap status.

    Parameters:
      - origin_dc: Source Warehouse or FMCG Plant ID (e.g., `DC-ATX-02`, `DC-SAT-03`, `FMCG-PLANT-TX01`)
      - dest_store: Target Retail Store ID (e.g., `STORE-DAL-04`, `STORE-HOU-05`, `STORE-PLANO-07`, `STORE-ARL-11`)
      - urgency: `ADVANCE_25D` | `EVENT_SURGE` | `FMCG_DIRECT` | `STANDARD`
    """
    clean_origin = origin_dc.split(" ")[0].strip()
    dist_miles = DISTANCE_MATRIX.get((clean_origin, dest_store), 200.0)
    urg = (urgency or "STANDARD").upper()
    quotes: List[Dict[str, Any]] = []

    if clean_origin.startswith("FMCG-") or "FMCG" in urg:
        quotes.append({
            "carrier_id": "CARRIER-FMCG-COLD",
            "carrier_name": "HydroBoost Cold-Chain Direct Carrier (FMCG PO)",
            "freight_mode": "FMCG_DIRECT_EXPEDITED_PO",
            "transit_hours": 6.0,
            "sla_window_hours": 16.0,
            "total_freight_cost": 1850.00,
            "within_1000_autonomy_limit": False,
            "recommended": True,
            "rationale": (
                "Direct cold-chain reefer from Waco Bottling Factory to Shop 2: Houston (185 mi, 6.0h transit <= 16.0h SLA), "
                "bypassing Houston Warehouse cross-dock bottleneck. Freight ($1,850) + merchandise triggers Gate 4 VP Sign-Off."
            ),
        })
        quotes.append({
            "carrier_id": "CARRIER-AIR-EXP",
            "carrier_name": "LoneStar Expedited Air Cargo",
            "freight_mode": "EXPEDITED_AIR_FREIGHT",
            "transit_hours": 4.5,
            "sla_window_hours": 16.0,
            "total_freight_cost": 3500.00,
            "within_1000_autonomy_limit": False,
            "recommended": False,
            "rationale": "Unnecessarily expensive ($3,500) when Cold-Chain Direct already arrives in 6.0h.",
        })
    elif dest_store == "STORE-PLANO-07" or "25D" in urg or "ADVANCE" in urg or "ECONOMY" in urg:
        quotes.append({
            "carrier_id": "CARRIER-TX-ECON",
            "carrier_name": "Texas Rail & Ground Economy (25-Day Pre-Position)",
            "freight_mode": "SCHEDULED_ECONOMY_PREPOSITION",
            "transit_hours": 36.0,
            "sla_window_hours": 600.0,
            "total_freight_cost": 480.00,
            "within_1000_autonomy_limit": True,
            "recommended": True,
            "rationale": (
                "25-day weather lead time enables scheduled economy backhaul ($480.00, 36.0h transit <= 600.0h window), "
                "saving $3,020 (86%) vs emergency air freight and staying well under the $1,000 auto-cap."
            ),
        })
        quotes.append({
            "carrier_id": "CARRIER-TX-FLEET",
            "carrier_name": "Texas Fleet Logistics (Dedicated Ground)",
            "freight_mode": "LATERAL_GROUND_TRANSFER",
            "transit_hours": 6.0,
            "sla_window_hours": 600.0,
            "total_freight_cost": 750.00,
            "within_1000_autonomy_limit": True,
            "recommended": False,
            "rationale": "Faster than needed for a 25-day forecast horizon; Economy saves $270.",
        })
    elif dest_store == "STORE-ARL-11" or clean_origin == "DC-SAT-03":
        quotes.append({
            "carrier_id": "CARRIER-ALAMO-EXP",
            "carrier_name": "Alamo Regional Dedicated Express",
            "freight_mode": "LATERAL_GROUND_TRANSFER",
            "transit_hours": 6.5,
            "sla_window_hours": 24.0,
            "total_freight_cost": 680.00,
            "within_1000_autonomy_limit": True,
            "recommended": True,
            "rationale": (
                "Negotiated regional dedicated truck from San Antonio Warehouse to Shop 4: Arlington (260 mi, 6.5h transit <= 24.0h "
                "pre-marathon SLA) at $680.00 — safely under the $1,000 auto-execution threshold."
            ),
        })
        quotes.append({
            "carrier_id": "CARRIER-AIR-EXP",
            "carrier_name": "LoneStar Expedited Air Cargo",
            "freight_mode": "EXPEDITED_AIR_FREIGHT",
            "transit_hours": 4.0,
            "sla_window_hours": 24.0,
            "total_freight_cost": 3500.00,
            "within_1000_autonomy_limit": False,
            "recommended": False,
            "rationale": "Rejected: $3,500 air cargo erodes margin when regional express already arrives in 6.5h.",
        })
    else:
        # Default Shop 1 (DC-ATX-02 -> STORE-DAL-04, 195 miles)
        quotes.append({
            "carrier_id": "CARRIER-TX-FLEET",
            "carrier_name": "Texas Fleet Logistics (Dedicated Ground)",
            "freight_mode": "LATERAL_GROUND_TRANSFER",
            "transit_hours": 5.5,
            "sla_window_hours": 12.0,
            "total_freight_cost": 750.00,
            "within_1000_autonomy_limit": True,
            "recommended": True,
            "rationale": (
                "Negotiated dedicated I-35 ground truck from Austin Warehouse to Shop 1: Dallas (195 mi: 3.8h drive + 1.7h dock = 5.5h "
                "<= 12.0h SLA window) at $750.00 — saving $2,750 vs air cargo and staying under the $1,000 auto-cap."
            ),
        })
        quotes.append({
            "carrier_id": "CARRIER-AIR-EXP",
            "carrier_name": "LoneStar Expedited Air Cargo",
            "freight_mode": "EXPEDITED_AIR_FREIGHT",
            "transit_hours": 4.0,
            "sla_window_hours": 12.0,
            "total_freight_cost": 3500.00,
            "within_1000_autonomy_limit": False,
            "recommended": False,
            "rationale": "Rejected: $3,500 air freight costs 4.6x more than dedicated ground.",
        })

    return {
        "domain": "3PL_LOGISTICS_CARRIERS",
        "origin_dc": clean_origin,
        "dest_store": dest_store,
        "distance_miles": dist_miles,
        "options_evaluated": len(quotes),
        "quotes": quotes,
    }


@mcp.tool()
def get_carrier_transit_eta(origin_dc: str, dest_store: str, mode: str = "LATERAL_GROUND_TRANSFER") -> Dict[str, Any]:
    """Retrieve precise carrier transit lead times and delivery SLA window."""
    clean_origin = origin_dc.split(" ")[0].strip()
    m = (mode or "").upper()
    if "ECONOMY" in m or "PREPOSITION" in m:
        transit, sla = 36.0, 600.0
    elif "FMCG" in m or clean_origin.startswith("FMCG-"):
        transit, sla = 6.0, 16.0
    elif "AIR" in m:
        transit, sla = 4.0, 12.0
    elif dest_store == "STORE-ARL-11":
        transit, sla = 6.5, 24.0
    else:
        transit, sla = 5.5, 12.0

    return {
        "origin_dc": clean_origin,
        "dest_store": dest_store,
        "mode": mode,
        "transit_hours": transit,
        "sla_window_hours": sla,
        "on_time_guarantee_pct": 98.8,
    }


@mcp.tool()
def list_active_freight_contracts() -> List[Dict[str, Any]]:
    """Return contracted 3PL carriers, modes, and SLA reliability ratings."""
    return CARRIER_CONTRACTS


if __name__ == "__main__":
    port = int(os.getenv("PORT", 8082))
    print(f"Starting logistics_rates_mcp on port {port} (Streamable HTTP /mcp)...")
    mcp.run(
        transport="streamable-http",
        host="0.0.0.0",
        port=port,
    )
