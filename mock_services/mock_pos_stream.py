"""Enterprise POS, 25-Day Weather API & Social Media Signal Simulator CLI.

Simulates real-time retail checkout scanner bursts, 25-day Weather API heatwave predictions,
and viral social media forum events across the 6 Retail Stores, 3 DCs, and 1 FMCG Plant.
"""

import argparse
import json
import time
import urllib.request
import urllib.error

DEFAULT_URL = "http://localhost:8080/api/v1/signals/ingest"
RESET_URL = "http://localhost:8080/api/v1/twin/reset"

TEST_SCENARIOS = {
    "shop1_pos_dc_replenish": {
        "event_id": "evt_shop1_pos_dc_sto",
        "store_id": "STORE-DAL-04",
        "sku_id": "SKU-4089-HYDRATE",
        "signal_source": "POS_SCANNER",
        "forecast_horizon_days": 0,
        "observed_velocity": 215.0,
        "baseline_velocity": 48.0,
        "current_store_stock": 180,
        "requested_units_override": 1500,
        "context_notes": "Shop 1 (Dallas) Fast POS Surge (215 u/hr). Serving Austin DC (DC-ATX-02) has 3,600 ATP surplus -> Auto-executes Internal STO.",
    },
    "shop2_dc_shortage_fmcg_po": {
        "event_id": "evt_shop2_fmcg_po_hitl",
        "store_id": "STORE-HOU-05",
        "sku_id": "SKU-4089-HYDRATE",
        "signal_source": "POS_SCANNER",
        "forecast_horizon_days": 0,
        "observed_velocity": 230.0,
        "baseline_velocity": 52.0,
        "current_store_stock": 140,
        "requested_units_override": 1800,
        "context_notes": "Shop 2 (Houston) Fast POS Surge (230 u/hr). Serving Houston DC (DC-HOU-01) has only 180 ATP surplus (< 1,800 needed) -> Escalates to FMCG Plant (FMCG-PLANT-TX01) via External PO & RemoteA2aAgent HITL.",
    },
    "shop3_weather_25day_prediction": {
        "event_id": "evt_shop3_weather_25d",
        "store_id": "STORE-PLANO-07",
        "sku_id": "SKU-4089-HYDRATE",
        "signal_source": "WEATHER_FORECAST_25D",
        "forecast_horizon_days": 25,
        "observed_velocity": 128.0,
        "baseline_velocity": 40.0,
        "current_store_stock": 520,
        "requested_units_override": 1500,
        "context_notes": "Shop 3 (Plano) Weather API 25-Day Prediction: 104.2°F Extreme Heat Dome forecasted in T+25 Days -> Proactive Economy Pre-Positioning from DC-ATX-02.",
    },
    "shop4_social_media_event_spike": {
        "event_id": "evt_shop4_social_event",
        "store_id": "STORE-ARL-11",
        "sku_id": "SKU-4089-HYDRATE",
        "signal_source": "SOCIAL_MEDIA_MONITOR",
        "forecast_horizon_days": 0,
        "observed_velocity": 165.0,
        "baseline_velocity": 44.0,
        "current_store_stock": 310,
        "requested_units_override": 1200,
        "context_notes": "Shop 4 (Arlington Stadium) Social Media & Reddit Monitor: 18,500 runners at Arlington Charity Marathon viral buzz (Score 94.5/100) -> Proactive STO from DC-SAT-03.",
    },
    # Keep legacy scenario keys aliased for backward compatibility
    "dallas_heatwave_surge": {
        "event_id": "evt_tx_9921",
        "store_id": "STORE-DAL-04",
        "sku_id": "SKU-4089-HYDRATE",
        "signal_source": "POS_SCANNER",
        "forecast_horizon_days": 0,
        "observed_velocity": 215.0,
        "baseline_velocity": 48.0,
        "current_store_stock": 180,
        "requested_units_override": 1500,
        "context_notes": "Heatwave 98.2°F + North Texas Youth Soccer Cup (12,000 attendees within 1.8 mi)",
    },
}


def reset_demo(reset_url: str = RESET_URL):
    req = urllib.request.Request(reset_url, method="POST", headers={"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req) as resp:
            res = json.loads(resp.read().decode("utf-8"))
            print(f"\n🔄 DEMO DATA RESET COMPLETE: {res.get('status')}")
            print(f"BigQuery Dataset: {res.get('summary', {}).get('bigquery_dataset')}")
            print(f"Starting DC ATP:  {res.get('summary', {}).get('dc_starting_atp')}\n")
    except urllib.error.URLError as e:
        print(f"\n❌ Error resetting demo data at {reset_url}: {e}\n")


def send_signal(url: str, scenario_key: str):
    payload = TEST_SCENARIOS.get(scenario_key)
    if not payload:
        print(f"Unknown scenario '{scenario_key}'. Choose from: {list(TEST_SCENARIOS.keys())}")
        return

    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=data,
        headers={"Content-Type": "application/json", "X-API-Key": "nexus-twin-secret-key-2026"},
    )

    print(f"\n=======================================================")
    print(f"🚀 INGESTING DEMO SIGNAL: {scenario_key}")
    print(f"Source: {payload['signal_source']} | Horizon: T+{payload['forecast_horizon_days']}d")
    print(f"Store:  {payload['store_id']} | SKU: {payload['sku_id']}")
    print(f"Observed/Predicted Velocity: {payload['observed_velocity']} u/h (Baseline: {payload['baseline_velocity']} u/h)")
    print(f"Store Stock: {payload['current_store_stock']} units")
    print(f"=======================================================")

    try:
        start_t = time.time()
        with urllib.request.urlopen(req) as response:
            res_body = response.read().decode("utf-8")
            elapsed = round((time.time() - start_t) * 1000, 1)
            result = json.loads(res_body)

            print(f"\n✅ RESPONSE RECEIVED ({elapsed}ms) [HTTP {response.status}]:")
            print(f"Order Type:              {result.get('order_type')}")
            print(f"Gate Status:             {result.get('gate_status')}")
            print(f"Requires Human Approval: {result.get('requires_human_approval')}")
            print(f"Source Node (DC/FMCG):   {result.get('selected_donor_dc')}")
            print(f"Units Ordered:           {result.get('units_transferred')}")
            print(f"Freight Mode:            {result.get('freight_mode')}")
            print(f"Freight Cost:            ${result.get('estimated_freight_cost', 0):,.2f}")
            if result.get("fmcg_po_merchandise_cost", 0) > 0:
                print(f"FMCG PO Merchandise:     ${result.get('fmcg_po_merchandise_cost', 0):,.2f}")
                print(f"Total Commitment:        ${result.get('total_financial_commitment', 0):,.2f}")
            print(f"Order ID (STO / PO):     {result.get('fmcg_purchase_order_id') or result.get('sap_transfer_order_id') or 'PENDING_A2A_APPROVAL'}")
            print(f"\nGenAI Root-Cause:")
            print(f"  {result.get('root_cause_explanation')}")
            print(f"=======================================================\n")

    except urllib.error.URLError as e:
        print(f"\n❌ Error connecting to Agent Bridge at {url}: {e}")
        print("Tip: Ensure the FastAPI server is running with `python -m prototype.src.backend.app.main`\n")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="NexusTwin Signal Simulator CLI")
    parser.add_argument("--url", default=DEFAULT_URL, help=f"Target URL (default: {DEFAULT_URL})")
    parser.add_argument(
        "--scenario",
        default="shop1_pos_dc_replenish",
        choices=list(TEST_SCENARIOS.keys()),
        help="Scenario to trigger",
    )
    parser.add_argument("--reset", action="store_true", help="Reset all BigQuery & Twin demo data to starting state")
    args = parser.parse_args()
    if args.reset:
        reset_demo()
    else:
        send_signal(args.url, args.scenario)
