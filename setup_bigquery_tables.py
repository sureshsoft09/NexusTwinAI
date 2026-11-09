"""Provision & Seed Enterprise BigQuery Tables in `nexustwinai-project.supply_chain_lakehouse`.

Usage:
  # Create dataset + all 7 tables and load baseline data for 1 FMCG Plant, 3 DCs, 6 Stores:
  .\.venv\Scripts\python.exe setup_bigquery_tables.py

  # Reset tables back to starting demo state:
  .\.venv\Scripts\python.exe setup_bigquery_tables.py --reset
"""

import argparse
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

_src_dir = Path(__file__).resolve().parent
if str(_src_dir) not in sys.path:
    sys.path.insert(0, str(_src_dir))

from shared.topology import (
    FMCG_MANUFACTURERS,
    REGIONAL_DCS,
    RETAIL_STORES,
    INITIAL_INVENTORY,
    WEATHER_FORECAST_SIGNALS,
    SOCIAL_MEDIA_SIGNALS,
)

PROJECT_ID = os.getenv("GOOGLE_CLOUD_PROJECT", "nexustwinai-project")
DATASET_ID = os.getenv("BQ_DATASET_ID", "supply_chain_lakehouse")


def setup_and_seed_bigquery():
    from google.cloud import bigquery

    print("==========================================================")
    print(f"Setting up BigQuery Lakehouse in Project: {PROJECT_ID}")
    print(f"Dataset: {PROJECT_ID}.{DATASET_ID}")
    print("==========================================================")

    client = bigquery.Client(project=PROJECT_ID)
    dataset_ref = f"{PROJECT_ID}.{DATASET_ID}"
    dataset = bigquery.Dataset(dataset_ref)
    dataset.location = "US"
    client.create_dataset(dataset, exists_ok=True)
    print(f"[1/6] Dataset `{dataset_ref}` verified.")

    # 1. network_nodes table (1 FMCG Plant + 3 DCs + 6 Retail Stores)
    node_structs = []
    for p in FMCG_MANUFACTURERS:
        node_structs.append(
            f"STRUCT('{p['id']}' AS node_id, 'FMCG_PLANT' AS node_type, '{p['name']}' AS name, "
            f"'{p['city']}' AS city, {p['lat']} AS lat, {p['lng']} AS lng, 'NONE' AS serving_dc)"
        )
    for d in REGIONAL_DCS:
        node_structs.append(
            f"STRUCT('{d['id']}' AS node_id, 'REGIONAL_DC' AS node_type, '{d['name']}' AS name, "
            f"'{d['city']}' AS city, {d['lat']} AS lat, {d['lng']} AS lng, 'FMCG-PLANT-TX01' AS serving_dc)"
        )
    for s in RETAIL_STORES:
        node_structs.append(
            f"STRUCT('{s['id']}' AS node_id, 'RETAIL_STORE' AS node_type, '{s['name']}' AS name, "
            f"'{s['city']}' AS city, {s['lat']} AS lat, {s['lng']} AS lng, '{s['serving_dc']}' AS serving_dc)"
        )
    sql_nodes = f"""
    CREATE OR REPLACE TABLE `{dataset_ref}.network_nodes` AS
    SELECT * FROM UNNEST([{', '.join(node_structs)}]);
    """
    client.query(sql_nodes).result()
    print(f"[2/6] Table `{dataset_ref}.network_nodes` seeded (1 FMCG Plant, 3 DCs, 6 Retail Stores).")

    # 2. inventory_levels & inventory_levels_baseline
    inv_structs = []
    for node_id, skus in INITIAL_INVENTORY.items():
        for sku_id, item in skus.items():
            on_hand = item.get("on_hand", 0)
            safety = item.get("safety_buffer", 0)
            atp = item.get("atp_surplus", max(0, on_hand - safety))
            inv_structs.append(
                f"STRUCT('{node_id}' AS node_id, '{sku_id}' AS sku_id, "
                f"{on_hand} AS on_hand, {safety} AS safety_buffer, {atp} AS atp_surplus, "
                f"CURRENT_TIMESTAMP() AS updated_at)"
            )
    sql_inv_base = f"""
    CREATE OR REPLACE TABLE `{dataset_ref}.inventory_levels_baseline` AS
    SELECT * FROM UNNEST([{', '.join(inv_structs)}]);
    """
    client.query(sql_inv_base).result()

    sql_inv_live = f"""
    CREATE OR REPLACE TABLE `{dataset_ref}.inventory_levels` AS
    SELECT * FROM `{dataset_ref}.inventory_levels_baseline`;
    """
    client.query(sql_inv_live).result()
    print(f"[3/6] Tables `inventory_levels` & `inventory_levels_baseline` seeded.")

    # 3. pos_sales_stream
    pos_structs = []
    for s in RETAIL_STORES:
        sid = s["id"]
        inv = INITIAL_INVENTORY.get(sid, {}).get("SKU-4089-HYDRATE", {})
        base_v = inv.get("burn_rate_base", 45.0)
        curr_v = inv.get("current_velocity", base_v)
        pos_structs.append(
            f"STRUCT('evt_init_{sid}' AS event_id, CURRENT_TIMESTAMP() AS timestamp, "
            f"'{sid}' AS store_id, 'SKU-4089-HYDRATE' AS sku_id, "
            f"{curr_v} AS observed_velocity_uph, {base_v} AS baseline_velocity_uph)"
        )
    sql_pos = f"""
    CREATE OR REPLACE TABLE `{dataset_ref}.pos_sales_stream` AS
    SELECT * FROM UNNEST([{', '.join(pos_structs)}]);
    """
    client.query(sql_pos).result()
    print(f"[4/6] Table `{dataset_ref}.pos_sales_stream` seeded.")

    # 4. weather_forecasts (T+25 Day Prediction for Shop 3)
    w_structs = []
    for sid, w in WEATHER_FORECAST_SIGNALS.items():
        w_structs.append(
            f"STRUCT('{sid}' AS store_id, '{w['city']}' AS city, "
            f"{w['current_temp_f']} AS current_temp_f, {w['forecast_horizon_days']} AS forecast_horizon_days, "
            f"{w['predicted_peak_temp_f']} AS predicted_peak_temp_f, "
            f"'{w['weather_anomaly_type']}' AS weather_anomaly_type, "
            f"{w['predicted_demand_multiplier']} AS predicted_demand_multiplier)"
        )
    sql_weather = f"""
    CREATE OR REPLACE TABLE `{dataset_ref}.weather_forecasts` AS
    SELECT * FROM UNNEST([{', '.join(w_structs)}]);
    """
    client.query(sql_weather).result()
    print(f"[5/6] Table `{dataset_ref}.weather_forecasts` seeded (T+25 Day 104.2F Heat Dome for Shop 3).")

    # 5. social_media_signals & audit_ledger
    soc_structs = []
    for sig in SOCIAL_MEDIA_SIGNALS:
        clean_text = sig["post_text"].replace("'", "\\'")
        soc_structs.append(
            f"STRUCT('{sig['signal_id']}' AS signal_id, '{sig['platform']}' AS platform, "
            f"'{sig['store_id']}' AS store_id, '{sig['sku_id']}' AS sku_id, "
            f"'{clean_text}' AS post_text, {sig['viral_buzz_score']} AS viral_buzz_score, "
            f"{sig['recommended_units']} AS recommended_units)"
        )
    sql_soc = f"""
    CREATE OR REPLACE TABLE `{dataset_ref}.social_media_signals` AS
    SELECT * FROM UNNEST([{', '.join(soc_structs)}]);
    """
    client.query(sql_soc).result()

    sql_audit = f"""
    CREATE OR REPLACE TABLE `{dataset_ref}.audit_ledger` AS
    SELECT
        'evt_tx_9920_baseline' AS event_id,
        CURRENT_TIMESTAMP() AS timestamp,
        'BIGQUERY_LAKEHOUSE_INIT' AS signal_source,
        'STORE-DAL-04' AS store_id,
        'SKU-4089-HYDRATE' AS sku_id,
        48.0 AS observed_velocity,
        'Baseline telemetry initialized across 6 Stores, 3 DCs, and 1 FMCG Plant.' AS root_cause_explanation,
        'DC-ATX-02' AS selected_donor_dc,
        'STO_FROM_DC' AS order_type,
        0 AS units_transferred,
        0.0 AS estimated_freight_cost,
        'APPROVED' AS gate_status,
        FALSE AS requires_human_approval,
        'SYSTEM_INIT' AS approver_name,
        'NONE' AS sap_transfer_order_id;
    """
    client.query(sql_audit).result()
    print(f"[6/6] Tables `social_media_signals` & `audit_ledger` seeded.")
    print("\n✅ BigQuery Lakehouse Setup & Baseline Seeding Complete!")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Setup & Seed BigQuery Lakehouse Tables")
    parser.add_argument("--reset", action="store_true", help="Reset tables to baseline")
    args = parser.parse_args()
    setup_and_seed_bigquery()
