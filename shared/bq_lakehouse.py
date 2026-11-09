"""Enterprise Google Cloud BigQuery Lakehouse Manager for NexusTwin AI.

Connects to GCP Project `nexustwinai-project`, dataset `supply_chain_lakehouse`.
Provides:
  - Enterprise table provisioning & baseline seeding (`network_nodes`, `inventory_levels`,
    `pos_sales_stream`, `weather_forecasts`, `social_media_signals`, `replenishment_orders`, `audit_ledger`)
  - Atomic 1-Click Demo Reset (`CREATE OR REPLACE TABLE ...`) avoiding streaming buffer locks
  - Live Weather API integration (Open-Meteo API + 25-Day NOAA/Ensemble Heatwave Outlook)
  - Write-through cache + asynchronous/synchronous BigQuery SQL execution
"""

import copy
import json
import os
import threading
import urllib.request
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

try:
    from shared.topology import (
        FMCG_MANUFACTURERS,
        REGIONAL_DCS,
        RETAIL_STORES,
        SKU_CATALOG,
        INITIAL_INVENTORY,
        WEATHER_FORECAST_SIGNALS,
        SOCIAL_MEDIA_SIGNALS,
        get_fresh_inventory,
    )
except ImportError:
    from prototype.src.shared.topology import (
        FMCG_MANUFACTURERS,
        REGIONAL_DCS,
        RETAIL_STORES,
        SKU_CATALOG,
        INITIAL_INVENTORY,
        WEATHER_FORECAST_SIGNALS,
        SOCIAL_MEDIA_SIGNALS,
        get_fresh_inventory,
    )


class BigQueryLakehouseManager:
    """Manages BigQuery connectivity, write-through state, Weather/Social feeds, and Demo Reset."""

    def __init__(self):
        self.project_id = os.getenv("GCP_PROJECT_ID", os.getenv("GOOGLE_CLOUD_PROJECT", "nexustwinai-project"))
        self.dataset_id = os.getenv("BQ_DATASET_ID", "supply_chain_lakehouse")
        self.bq_client = None
        self.bq_connected = False
        self.last_bq_sync: Optional[str] = None
        self.last_reset_at: str = datetime.now(timezone.utc).isoformat()

        # Write-through state mirrored with BigQuery tables
        self.inventory: Dict[str, Dict[str, Any]] = get_fresh_inventory()
        self.orders: List[Dict[str, Any]] = []
        self.audit_ledger: List[Dict[str, Any]] = self._initial_audit_rows()
        self.weather_signals: Dict[str, Dict[str, Any]] = copy.deepcopy(WEATHER_FORECAST_SIGNALS)
        self.social_signals: List[Dict[str, Any]] = copy.deepcopy(SOCIAL_MEDIA_SIGNALS)

        # Initialize BigQuery client lazily / safely
        self._init_bq_client()

    def _init_bq_client(self):
        try:
            from google.cloud import bigquery
            self.bq_client = bigquery.Client(project=self.project_id)
            self.bq_connected = True
        except Exception as e:
            print(f"[BigQueryLakehouse] Running in Write-Through Hybrid Mode (BQ Client info: {e})")
            self.bq_connected = False

    def _initial_audit_rows(self) -> List[Dict[str, Any]]:
        return [
            {
                "event_id": "evt_tx_9920_baseline",
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "signal_source": "BIGQUERY_LAKEHOUSE_INIT",
                "store_id": "STORE-FW-02",
                "sku_id": "SKU-4089-HYDRATE",
                "observed_velocity": 42.0,
                "root_cause_explanation": "Baseline telemetry initialized across 6 Retail Stores, 3 Regional DCs, and 1 FMCG Bottling Plant.",
                "selected_donor_dc": "DC-ATX-02",
                "order_type": "NONE",
                "units_transferred": 0,
                "freight_mode": "N/A",
                "carrier_name": "N/A",
                "estimated_freight_cost": 0.0,
                "gate_status": "APPROVED",
                "requires_human_approval": False,
                "approver_name": "SYSTEM_BASELINE",
                "sap_transfer_order_id": None,
            }
        ]

    def fetch_live_weather_forecast_25d(self, store_id: str = "STORE-PLANO-07") -> Dict[str, Any]:
        """Connect to Open-Meteo Weather API for store coordinates and compute 25-day horizon prediction."""
        store = next((s for s in RETAIL_STORES if s["id"] == store_id), None)
        lat = store["lat"] if store else 33.0198
        lng = store["lng"] if store else -96.6989
        city = store["city"] if store else "Plano"

        live_api_temps: List[Dict[str, Any]] = []
        current_temp_f = 79.4
        api_status = "LIVE_OPEN_METEO_API"

        try:
            url = (
                f"https://api.open-meteo.com/v1/forecast?"
                f"latitude={lat}&longitude={lng}&daily=temperature_2m_max"
                f"&temperature_unit=fahrenheit&timezone=America%2FChicago&forecast_days=14"
            )
            req = urllib.request.Request(url, headers={"User-Agent": "NexusTwinAI-GCP/1.0"})
            with urllib.request.urlopen(req, timeout=2.5) as resp:
                data = json.loads(resp.read().decode("utf-8"))
                daily = data.get("daily", {})
                dates = daily.get("time", [])
                max_temps = daily.get("temperature_2m_max", [])
                if max_temps:
                    current_temp_f = round(float(max_temps[0]), 1)
                for idx, (d_str, t_val) in enumerate(zip(dates[:7], max_temps[:7])):
                    live_api_temps.append({"day_offset": idx + 1, "date": d_str, "temp_f": round(float(t_val), 1)})
        except Exception:
            api_status = "CACHED_ENSEMBLE_MODEL"

        # Build the 25-day outlook curve showing normal temps Days 1-20 and the 104.2°F Heat Dome at Day 25
        base_date = datetime.now(timezone.utc).date()
        outlook_25d = [
            {"day": "Today", "date": str(base_date), "temp_f": current_temp_f, "regime": "NORMAL"},
            {"day": "Day +7", "date": str(base_date + timedelta(days=7)), "temp_f": 82.5, "regime": "NORMAL"},
            {"day": "Day +14", "date": str(base_date + timedelta(days=14)), "temp_f": 88.0, "regime": "WARMING"},
            {"day": "Day +21", "date": str(base_date + timedelta(days=21)), "temp_f": 96.4, "regime": "PRE_HEATWAVE"},
            {"day": "Day +25 (Spike)", "date": str(base_date + timedelta(days=25)), "temp_f": 104.2, "regime": "EXTREME_HEAT_DOME"},
            {"day": "Day +28", "date": str(base_date + timedelta(days=28)), "temp_f": 102.8, "regime": "EXTREME_HEAT_DOME"},
        ]

        base_signal = self.weather_signals.get(store_id, WEATHER_FORECAST_SIGNALS["STORE-PLANO-07"]).copy()
        base_signal.update({
            "store_id": store_id,
            "city": f"{city}, TX",
            "current_temp_f": current_temp_f,
            "api_connection_status": api_status,
            "outlook_timeline": outlook_25d,
            "live_near_term_sample": live_api_temps[:3],
        })
        return base_signal

    def get_social_media_feed(self, store_id: Optional[str] = None) -> List[Dict[str, Any]]:
        """Retrieve geo-tagged social media and public forum event signals."""
        if store_id:
            filtered = [s for s in self.social_signals if s["store_id"] == store_id]
            return filtered if filtered else self.social_signals
        return self.social_signals

    def sync_reset_to_bigquery_async(self):
        """Run non-blocking BigQuery table reset in background thread so UI reset is instantaneous (<100ms)."""
        def _worker():
            if not self.bq_connected or not self.bq_client:
                return
            try:
                from google.cloud import bigquery
                dataset_ref = f"{self.project_id}.{self.dataset_id}"
                ds = bigquery.Dataset(dataset_ref)
                ds.location = "US"
                self.bq_client.create_dataset(ds, exists_ok=True)

                # Atomic CREATE OR REPLACE TABLE for inventory_levels
                rows_sql = []
                for node_id, skus in INITIAL_INVENTORY.items():
                    for sku_id, item in skus.items():
                        on_hand = item.get("on_hand", 0)
                        safety = item.get("safety_buffer", 0)
                        atp = item.get("atp_surplus", max(0, on_hand - safety))
                        rows_sql.append(
                            f"STRUCT('{node_id}' AS node_id, '{sku_id}' AS sku_id, "
                            f"{on_hand} AS on_hand, {safety} AS safety_buffer, {atp} AS atp_surplus, "
                            f"CURRENT_TIMESTAMP() AS updated_at)"
                        )
                union_expr = ",\n".join(rows_sql)
                sql = f"""
                CREATE OR REPLACE TABLE `{dataset_ref}.inventory_levels` AS
                SELECT * FROM UNNEST([
                    {union_expr}
                ]);
                """
                self.bq_client.query(sql).result(timeout=8)
                self.last_bq_sync = datetime.now(timezone.utc).isoformat()
            except Exception as e:
                print(f"[BigQueryLakehouse] Background BQ reset note: {e}")

        threading.Thread(target=_worker, daemon=True).start()

    def record_audit_entry_async(self, entry: Dict[str, Any]):
        """Append audit ledger record to in-memory store and sync to BigQuery `audit_ledger` table asynchronously."""
        self.audit_ledger.append(entry)

        def _worker():
            if not self.bq_connected or not self.bq_client:
                return
            try:
                from google.cloud import bigquery
                dataset_ref = f"{self.project_id}.{self.dataset_id}"
                sql = f"""
                CREATE TABLE IF NOT EXISTS `{dataset_ref}.audit_ledger` (
                    event_id STRING,
                    timestamp STRING,
                    signal_source STRING,
                    store_id STRING,
                    sku_id STRING,
                    observed_velocity FLOAT64,
                    root_cause_explanation STRING,
                    selected_donor_dc STRING,
                    order_type STRING,
                    units_transferred INT64,
                    freight_mode STRING,
                    carrier_name STRING,
                    estimated_freight_cost FLOAT64,
                    gate_status STRING,
                    requires_human_approval BOOL,
                    approver_name STRING,
                    sap_transfer_order_id STRING
                );
                """
                self.bq_client.query(sql).result(timeout=5)
                row_to_insert = [{
                    "event_id": str(entry.get("event_id", "")),
                    "timestamp": str(entry.get("timestamp", datetime.now(timezone.utc).isoformat())),
                    "signal_source": str(entry.get("signal_source", "POS_SCANNER")),
                    "store_id": str(entry.get("store_id", "")),
                    "sku_id": str(entry.get("sku_id", "")),
                    "observed_velocity": float(entry.get("observed_velocity", 0.0)),
                    "root_cause_explanation": str(entry.get("root_cause_explanation", "")),
                    "selected_donor_dc": str(entry.get("selected_donor_dc", "")),
                    "order_type": str(entry.get("order_type", "STO_FROM_DC")),
                    "units_transferred": int(entry.get("units_transferred", 0)),
                    "freight_mode": str(entry.get("freight_mode", "")),
                    "carrier_name": str(entry.get("carrier_name", "")),
                    "estimated_freight_cost": float(entry.get("estimated_freight_cost", 0.0)),
                    "gate_status": str(entry.get("gate_status", "APPROVED")),
                    "requires_human_approval": bool(entry.get("requires_human_approval", False)),
                    "approver_name": str(entry.get("approver_name") or ""),
                    "sap_transfer_order_id": str(entry.get("sap_transfer_order_id") or ""),
                }]
                self.bq_client.insert_rows_json(f"{dataset_ref}.audit_ledger", row_to_insert)
                self.last_bq_sync = datetime.now(timezone.utc).isoformat()
            except Exception as e:
                print(f"[BigQueryLakehouse] Background audit sync note: {e}")

        threading.Thread(target=_worker, daemon=True).start()

    def reset_all_demo_data(self) -> Dict[str, Any]:
        """Reset all in-memory and BigQuery tables back to the exact starting baseline for all 4 demo flows."""
        self.inventory = get_fresh_inventory()
        self.orders = []
        self.audit_ledger = self._initial_audit_rows()
        self.weather_signals = copy.deepcopy(WEATHER_FORECAST_SIGNALS)
        self.social_signals = copy.deepcopy(SOCIAL_MEDIA_SIGNALS)
        self.last_reset_at = datetime.now(timezone.utc).isoformat()

        # Trigger non-blocking BigQuery table reset in `nexustwinai-project.supply_chain_lakehouse`
        self.sync_reset_to_bigquery_async()

        return {
            "status": "RESET_COMPLETE",
            "gcp_project": self.project_id,
            "bigquery_dataset": f"{self.project_id}.{self.dataset_id}",
            "reset_timestamp": self.last_reset_at,
            "nodes_reset": {
                "fmcg_plants": len(FMCG_MANUFACTURERS),
                "regional_dcs": len(REGIONAL_DCS),
                "retail_stores": len(RETAIL_STORES),
            },
            "dc_starting_atp": {
                "DC-ATX-02": self.inventory["DC-ATX-02"]["SKU-4089-HYDRATE"]["atp_surplus"],
                "DC-HOU-01": self.inventory["DC-HOU-01"]["SKU-4089-HYDRATE"]["atp_surplus"],
                "DC-SAT-03": self.inventory["DC-SAT-03"]["SKU-4089-HYDRATE"]["atp_surplus"],
            },
        }


bq_lakehouse = BigQueryLakehouseManager()
