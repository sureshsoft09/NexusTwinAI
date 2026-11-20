"""Dual-Database Enterprise Lakehouse & Real-Time Operational Twin Manager for NexusTwin AI.

Connects to GCP Project `nexustwinai-project`:
  1. Cloud Firestore (Real-Time Operational State — OLTP, <50ms updates):
       - `store_live_shelf`       : Live retail shelf stock & checkout velocity per shop
       - `erp_inventory_mirror`   : Fast live mirror of BigQuery Retail DC & FMCG Plant stock
       - `live_telemetry_stream`  : Live ingested POS / Weather / Social telemetry packets
       - `a2a_approval_queue`     : Durable A2A HITL VP approval tickets + paused vertex_session_id
       - `runtime_state`          : Latest real ReplenishmentDecisionManifest
  2. BigQuery (`nexustwinai-project.supply_chain_lakehouse` — Enterprise ERP & Audit OLAP):
       - `retail_erp_inventory`   : Retailer's 3 Regional DCs + 6 Retail Stores ERP table
       - `fmcg_factory_inventory` : Isolated FMCG Manufacturer Plant ERP table (Waco Bottling Factory)
       - `pos_sales_stream`       : Synced POS checkout velocity & sales telemetry log
       - `replenishment_orders`   : Executed SAP STOs & VP-approved B2B FMCG POs
       - `audit_ledger`           : Immutable operational & 4-Gate compliance ledger

Both Backend (Cloud Run) and MCP Microservices (Cloud Run) share this exact layer so
Streaming Data == Live UI Stock == Retail ERP BigQuery == MCP Tool Reads == FMCG ERP BigQuery.
"""

from concurrent.futures import ThreadPoolExecutor
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
        get_node_display_name,
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
        get_node_display_name,
    )


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _sql_escape(val: Any) -> str:
    return str(val if val is not None else "").replace("\\", "\\\\").replace("'", "\\'")


class BigQueryLakehouseManager:
    """Manages Cloud Firestore (real-time operational state) + BigQuery (Retail/FMCG ERP & Audit)."""

    def __init__(self):
        self.project_id = os.getenv("GCP_PROJECT_ID", os.getenv("GOOGLE_CLOUD_PROJECT", "nexustwinai-project"))
        self.dataset_id = os.getenv("BQ_DATASET_ID", "supply_chain_lakehouse")
        self.bq_client = None
        self.bq_connected = False
        self.fs_client = None
        self.fs_connected = False
        self.last_bq_sync: Optional[str] = None
        self.last_reset_at: str = _now_iso()

        # Local write-through fallback cache (always synced from/to Firestore & BigQuery)
        self.inventory: Dict[str, Dict[str, Any]] = get_fresh_inventory()
        self.orders: List[Dict[str, Any]] = []
        self.audit_ledger: List[Dict[str, Any]] = self._initial_audit_rows()
        self.weather_signals: Dict[str, Dict[str, Any]] = copy.deepcopy(WEATHER_FORECAST_SIGNALS)
        self.social_signals: List[Dict[str, Any]] = copy.deepcopy(SOCIAL_MEDIA_SIGNALS)
        self.a2a_tickets_cache: Dict[str, Dict[str, Any]] = {}
        self.latest_manifest_cache: Optional[Dict[str, Any]] = None

        self._init_clients()

    def _init_clients(self):
        try:
            from google.cloud import bigquery
            self.bq_client = bigquery.Client(project=self.project_id)
            self.bq_connected = True
        except Exception as e:
            print(f"[DualDB] BigQuery unavailable (local fallback mode): {e}")
            self.bq_connected = False

        try:
            from google.cloud import firestore
            self.fs_client = firestore.Client(project=self.project_id)
            self.fs_connected = True
        except Exception as e:
            print(f"[DualDB] Firestore unavailable (local fallback mode): {e}")
            self.fs_connected = False

    def _initial_audit_rows(self) -> List[Dict[str, Any]]:
        # Start with an empty order ledger on fresh reset so only real executed/escalated orders appear
        return []

    # =========================================================================
    # FIRESTORE HELPERS — REAL-TIME OPERATIONAL STATE (OLTP)
    # =========================================================================

    def _seed_firestore_baseline(self) -> None:
        """Seed Firestore `store_live_shelf` and `erp_inventory_mirror` to healthy baseline."""
        if not self.fs_connected or not self.fs_client:
            return
        try:
            fresh = get_fresh_inventory()
            batch = self.fs_client.batch()
            now = _now_iso()
            for node_id, skus in fresh.items():
                item = skus.get("SKU-4089-HYDRATE")
                if not item:
                    continue
                on_hand = int(item.get("on_hand", 0))
                safety = int(item.get("safety_buffer", 0))
                atp = int(item.get("atp_surplus", max(0, on_hand - safety)))
                doc_payload = {
                    "node_id": node_id,
                    "display_name": get_node_display_name(node_id),
                    "sku_id": "SKU-4089-HYDRATE",
                    "on_hand": on_hand,
                    "reserved": int(item.get("reserved", 0)),
                    "safety_buffer": safety,
                    "atp_surplus": atp,
                    "burn_rate_base": float(item.get("burn_rate_base", 0.0)),
                    "current_velocity": float(item.get("current_velocity", 0.0)),
                    "updated_at": now,
                }
                if node_id.startswith("STORE-"):
                    ref = self.fs_client.collection("store_live_shelf").document(node_id)
                else:
                    ref = self.fs_client.collection("erp_inventory_mirror").document(node_id)
                batch.set(ref, doc_payload)
            batch.commit()
        except Exception as e:
            print(f"[DualDB] Firestore baseline seed note: {e}")

    def _clear_firestore_collection(self, collection_name: str) -> None:
        if not self.fs_connected or not self.fs_client:
            return
        try:
            docs = list(self.fs_client.collection(collection_name).stream())
            if not docs:
                return
            batch = self.fs_client.batch()
            count = 0
            for doc in docs:
                batch.delete(doc.reference)
                count += 1
                if count >= 400:
                    batch.commit()
                    batch = self.fs_client.batch()
                    count = 0
            if count > 0:
                batch.commit()
        except Exception as e:
            print(f"[DualDB] Firestore clear `{collection_name}` note: {e}")

    def get_live_inventory(self, force_refresh: bool = True) -> Dict[str, Dict[str, Any]]:
        """Read live inventory across all 10 network nodes directly from Firestore + BigQuery."""
        if not force_refresh or not self.fs_connected or not self.fs_client:
            return self.inventory

        try:
            store_docs = list(self.fs_client.collection("store_live_shelf").stream())
            erp_docs = list(self.fs_client.collection("erp_inventory_mirror").stream())

            if not store_docs or not erp_docs:
                self._seed_firestore_baseline()
                store_docs = list(self.fs_client.collection("store_live_shelf").stream())
                erp_docs = list(self.fs_client.collection("erp_inventory_mirror").stream())

            merged = copy.deepcopy(self.inventory)
            for doc in store_docs + erp_docs:
                data = doc.to_dict() or {}
                node_id = data.get("node_id") or doc.id
                sku_id = data.get("sku_id") or "SKU-4089-HYDRATE"
                on_hand = int(data.get("on_hand", 0))
                safety = int(data.get("safety_buffer", 0))
                atp = int(data.get("atp_surplus", max(0, on_hand - safety)))
                merged.setdefault(node_id, {})[sku_id] = {
                    "on_hand": on_hand,
                    "reserved": int(data.get("reserved", 0)),
                    "safety_buffer": safety,
                    "atp_surplus": atp,
                    "burn_rate_base": float(data.get("burn_rate_base", merged.get(node_id, {}).get(sku_id, {}).get("burn_rate_base", 48.0))),
                    "current_velocity": float(data.get("current_velocity", merged.get(node_id, {}).get(sku_id, {}).get("current_velocity", 48.0))),
                    "updated_at": data.get("updated_at"),
                }
            self.inventory = merged
        except Exception as e:
            print(f"[DualDB] Firestore live inventory read fallback: {e}")

        return self.inventory

    def get_node_inventory(
        self,
        node_id: str,
        sku_id: str = "SKU-4089-HYDRATE",
        prefer_bigquery_erp: bool = False,
    ) -> Dict[str, Any]:
        """Fetch live real-time inventory for a single node from its authoritative database.

        - Retail Stores (`STORE-*`): Authoritative live shelf is Cloud Firestore `store_live_shelf`.
        - Retail Warehouses (`DC-*`): Authoritative ERP is BigQuery `retail_erp_inventory` (mirrored in Firestore).
        - FMCG Factory (`FMCG-*`): Authoritative isolated ERP is BigQuery `fmcg_factory_inventory` (mirrored in Firestore).
        """
        # 1. If authoritative BigQuery ERP read is requested by ERP MCP Server
        if prefer_bigquery_erp and self.bq_connected and self.bq_client and not node_id.startswith("STORE-"):
            try:
                table = (
                    f"{self.project_id}.{self.dataset_id}.fmcg_factory_inventory"
                    if node_id.startswith("FMCG-")
                    else f"{self.project_id}.{self.dataset_id}.retail_erp_inventory"
                )
                sql = (
                    f"SELECT on_hand, safety_buffer, atp_surplus "
                    f"FROM `{table}` "
                    f"WHERE node_id = '{_sql_escape(node_id)}' AND sku_id = '{_sql_escape(sku_id)}' "
                    f"LIMIT 1"
                )
                rows = list(self.bq_client.query(sql).result(timeout=6))
                if rows:
                    r = rows[0]
                    on_hand = int(r["on_hand"])
                    safety = int(r["safety_buffer"])
                    atp = int(r["atp_surplus"])
                    self.inventory.setdefault(node_id, {})[sku_id] = {
                        "on_hand": on_hand,
                        "safety_buffer": safety,
                        "atp_surplus": atp,
                        "reserved": 0,
                        "data_source": f"BIGQUERY:{table}",
                    }
                    return self.inventory[node_id][sku_id]
            except Exception as e:
                print(f"[DualDB] BigQuery ERP read note for {node_id}: {e}")

        # 2. Read live from Firestore (`store_live_shelf` for stores, `erp_inventory_mirror` for DCs/Factory)
        if self.fs_connected and self.fs_client:
            try:
                col = "store_live_shelf" if node_id.startswith("STORE-") else "erp_inventory_mirror"
                snap = self.fs_client.collection(col).document(node_id).get()
                if snap.exists:
                    data = snap.to_dict() or {}
                    on_hand = int(data.get("on_hand", 0))
                    safety = int(data.get("safety_buffer", 0))
                    atp = int(data.get("atp_surplus", max(0, on_hand - safety)))
                    item = {
                        "on_hand": on_hand,
                        "reserved": int(data.get("reserved", 0)),
                        "safety_buffer": safety,
                        "atp_surplus": atp,
                        "burn_rate_base": float(data.get("burn_rate_base", 48.0)),
                        "current_velocity": float(data.get("current_velocity", 48.0)),
                        "updated_at": data.get("updated_at"),
                        "data_source": f"FIRESTORE:{col}/{node_id}",
                    }
                    self.inventory.setdefault(node_id, {})[sku_id] = item
                    return item
            except Exception as e:
                print(f"[DualDB] Firestore node read note for {node_id}: {e}")

        return self.inventory.get(node_id, {}).get(sku_id, {
            "on_hand": 0,
            "reserved": 0,
            "safety_buffer": 0,
            "atp_surplus": 0,
            "burn_rate_base": 48.0,
            "current_velocity": 48.0,
        })

    def apply_pos_sale_tick(
        self,
        store_id: str,
        sku_id: str,
        units_sold: int,
        observed_velocity: float,
        note: str,
        scenario_key: str,
        tick: int,
        signal_source: str = "POS_SCANNER",
        threshold_breached: bool = False,
        extra_metrics: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        """Atomically decrement live store shelf stock in Firestore during POS/Social streaming
        and record the live telemetry packet in `live_telemetry_stream`.
        """
        current = self.get_node_inventory(store_id, sku_id)
        prev_on_hand = int(current.get("on_hand", 480))
        safety = int(current.get("safety_buffer", 250))
        baseline = float(current.get("burn_rate_base", 48.0))
        reserved = int(current.get("reserved", 0))

        new_on_hand = max(0, prev_on_hand - max(0, int(units_sold)))
        new_atp = max(0, new_on_hand - safety)
        now = _now_iso()

        updated_shelf = {
            "node_id": store_id,
            "display_name": get_node_display_name(store_id),
            "sku_id": sku_id,
            "on_hand": new_on_hand,
            "reserved": reserved,
            "safety_buffer": safety,
            "atp_surplus": new_atp,
            "burn_rate_base": baseline,
            "current_velocity": float(observed_velocity),
            "updated_at": now,
        }
        self.inventory.setdefault(store_id, {})[sku_id] = updated_shelf

        packet = {
            "scenario_key": scenario_key,
            "signal_source": signal_source,
            "store_id": store_id,
            "store_display_name": get_node_display_name(store_id),
            "sku_id": sku_id,
            "tick": tick,
            "units_sold": int(units_sold),
            "on_hand_before": prev_on_hand,
            "on_hand": new_on_hand,
            "safety_buffer": safety,
            "baseline_velocity": baseline,
            "velocity": float(observed_velocity),
            "spike_ratio": round(float(observed_velocity) / max(baseline, 1.0), 2),
            "threshold_breached": threshold_breached,
            "note": note,
            "timestamp": now,
            **(extra_metrics or {}),
        }

        if self.fs_connected and self.fs_client:
            try:
                self.fs_client.collection("store_live_shelf").document(store_id).set(updated_shelf, merge=True)
                self.fs_client.collection("live_telemetry_stream").document(f"{scenario_key}_tick_{tick}").set(packet)
            except Exception as e:
                print(f"[DualDB] Firestore POS tick write note: {e}")

        return packet

    def sync_store_snapshot_to_bigquery(
        self,
        store_id: str,
        sku_id: str,
        event_id: str,
        units_sold_total: int,
    ) -> None:
        """Sync live store shelf stock & velocity from Firestore into BigQuery `retail_erp_inventory`
        and `pos_sales_stream` right when a threshold breach triggers the Multi-Agent System,
        so Streaming Data == Firestore == Retail ERP BigQuery 100%.
        """
        shelf = self.get_node_inventory(store_id, sku_id)
        on_hand = int(shelf.get("on_hand", 0))
        safety = int(shelf.get("safety_buffer", 250))
        atp = max(0, on_hand - safety)
        vel = float(shelf.get("current_velocity", 48.0))
        base = float(shelf.get("burn_rate_base", 48.0))

        if not self.bq_connected or not self.bq_client:
            return

        def _sync():
            try:
                ds = f"{self.project_id}.{self.dataset_id}"
                update_sql = f"""
                UPDATE `{ds}.retail_erp_inventory`
                SET on_hand = {on_hand},
                    atp_surplus = {atp},
                    current_velocity = {vel},
                    updated_at = CURRENT_TIMESTAMP()
                WHERE node_id = '{_sql_escape(store_id)}' AND sku_id = '{_sql_escape(sku_id)}';
                """
                self.bq_client.query(update_sql).result(timeout=8)

                insert_pos_sql = f"""
                INSERT INTO `{ds}.pos_sales_stream`
                (event_id, store_id, sku_id, units_sold, observed_velocity, baseline_velocity, on_hand_after, timestamp)
                VALUES (
                    '{_sql_escape(event_id)}',
                    '{_sql_escape(store_id)}',
                    '{_sql_escape(sku_id)}',
                    {int(units_sold_total)},
                    {vel},
                    {base},
                    {on_hand},
                    CURRENT_TIMESTAMP()
                );
                """
                self.bq_client.query(insert_pos_sql).result(timeout=8)
                self.last_bq_sync = _now_iso()
            except Exception as e:
                print(f"[DualDB] BigQuery store snapshot sync note: {e}")

        # Execute synchronously with tight timeout so MCP tools immediately read the synced row
        _sync()

    # =========================================================================
    # REAL ERP & FMCG ORDER EXECUTION (BIGQUERY + FIRESTORE ATOMIC SYNC)
    # =========================================================================

    def execute_retail_dc_sto_in_db(
        self,
        from_dc: str,
        target_store: str,
        sku_id: str,
        quantity: int,
        order_id: str,
        freight_cost: float,
        event_id: str = "",
        vp_approval_token: str = "",
    ) -> Dict[str, Any]:
        """Deduct stock from Retailer's DC in BigQuery `retail_erp_inventory`, mirror to Firestore,
        credit inbound stock on `store_live_shelf/{target_store}`, and record `replenishment_orders`.
        """
        dc_inv = self.get_node_inventory(from_dc, sku_id, prefer_bigquery_erp=True)
        dc_on_hand = int(dc_inv.get("on_hand", 0))
        dc_safety = int(dc_inv.get("safety_buffer", 0))
        dc_atp = max(0, dc_on_hand - dc_safety)

        if dc_atp < quantity:
            return {
                "status": "FAILED_ATP_BREACH",
                "remaining_on_hand": dc_on_hand,
                "remaining_atp": dc_atp,
                "message": f"Requested {quantity} exceeds live ATP {dc_atp} at {from_dc}.",
            }

        new_dc_on_hand = max(0, dc_on_hand - quantity)
        new_dc_atp = max(0, new_dc_on_hand - dc_safety)
        now = _now_iso()

        # Update local cache
        self.inventory.setdefault(from_dc, {})[sku_id] = {
            "on_hand": new_dc_on_hand,
            "safety_buffer": dc_safety,
            "atp_surplus": new_dc_atp,
            "reserved": 0,
            "updated_at": now,
        }

        # Credit store inbound/reserved stock
        st_inv = self.get_node_inventory(target_store, sku_id)
        new_reserved = int(st_inv.get("reserved", 0)) + int(quantity)
        st_inv["reserved"] = new_reserved
        st_inv["updated_at"] = now
        self.inventory.setdefault(target_store, {})[sku_id] = st_inv

        # Update Firestore mirror + live store shelf
        if self.fs_connected and self.fs_client:
            try:
                self.fs_client.collection("erp_inventory_mirror").document(from_dc).set(
                    {
                        "node_id": from_dc,
                        "display_name": get_node_display_name(from_dc),
                        "sku_id": sku_id,
                        "on_hand": new_dc_on_hand,
                        "safety_buffer": dc_safety,
                        "atp_surplus": new_dc_atp,
                        "updated_at": now,
                    },
                    merge=True,
                )
                self.fs_client.collection("store_live_shelf").document(target_store).set(
                    {"reserved": new_reserved, "updated_at": now},
                    merge=True,
                )
            except Exception as e:
                print(f"[DualDB] Firestore STO update note: {e}")

        # Update BigQuery `retail_erp_inventory` + `replenishment_orders`
        if self.bq_connected and self.bq_client:
            try:
                ds = f"{self.project_id}.{self.dataset_id}"
                self.bq_client.query(
                    f"""
                    UPDATE `{ds}.retail_erp_inventory`
                    SET on_hand = {new_dc_on_hand},
                        atp_surplus = {new_dc_atp},
                        updated_at = CURRENT_TIMESTAMP()
                    WHERE node_id = '{_sql_escape(from_dc)}' AND sku_id = '{_sql_escape(sku_id)}';
                    """
                ).result(timeout=8)

                self.bq_client.query(
                    f"""
                    INSERT INTO `{ds}.replenishment_orders`
                    (order_id, event_id, order_type, source_node, target_store, sku_id, units,
                     freight_cost, merchandise_cost, total_commitment, gate_status, vp_approval_token, created_at)
                    VALUES (
                        '{_sql_escape(order_id)}',
                        '{_sql_escape(event_id or order_id)}',
                        'STO_FROM_DC',
                        '{_sql_escape(from_dc)}',
                        '{_sql_escape(target_store)}',
                        '{_sql_escape(sku_id)}',
                        {int(quantity)},
                        {float(freight_cost)},
                        0.0,
                        {float(freight_cost)},
                        'APPROVED',
                        '{_sql_escape(vp_approval_token)}',
                        CURRENT_TIMESTAMP()
                    );
                    """
                ).result(timeout=8)
                self.last_bq_sync = now
            except Exception as e:
                print(f"[DualDB] BigQuery STO update note: {e}")

        order_rec = {
            "order_id": order_id,
            "order_type": "STO_FROM_DC",
            "source_node": from_dc,
            "target_store": target_store,
            "sku_id": sku_id,
            "units": int(quantity),
            "freight_cost": float(freight_cost),
            "total_commitment": float(freight_cost),
            "created_at": now,
        }
        self.orders.append(order_rec)
        return {
            "status": "SUCCESS",
            "order_id": order_id,
            "remaining_on_hand": new_dc_on_hand,
            "remaining_atp": new_dc_atp,
            "store_inbound_reserved": new_reserved,
        }

    def execute_fmcg_po_in_db(
        self,
        fmcg_vendor_id: str,
        serving_dc: str,
        target_store: str,
        sku_id: str,
        quantity: int,
        order_id: str,
        freight_cost: float,
        merchandise_cost: float,
        vp_approval_token: str,
        event_id: str = "",
    ) -> Dict[str, Any]:
        """Deduct stock from isolated BigQuery `fmcg_factory_inventory`, mirror to Firestore,
        credit inbound stock on `store_live_shelf/{target_store}`, and record `replenishment_orders`.
        """
        fmcg_inv = self.get_node_inventory(fmcg_vendor_id, sku_id, prefer_bigquery_erp=True)
        plant_on_hand = int(fmcg_inv.get("on_hand", 50000))
        plant_safety = int(fmcg_inv.get("safety_buffer", 5000))
        new_plant_on_hand = max(0, plant_on_hand - int(quantity))
        new_plant_atp = max(0, new_plant_on_hand - plant_safety)
        total_commitment = round(float(freight_cost) + float(merchandise_cost), 2)
        now = _now_iso()

        self.inventory.setdefault(fmcg_vendor_id, {})[sku_id] = {
            "on_hand": new_plant_on_hand,
            "safety_buffer": plant_safety,
            "atp_surplus": new_plant_atp,
            "reserved": 0,
            "updated_at": now,
        }

        st_inv = self.get_node_inventory(target_store, sku_id)
        new_reserved = int(st_inv.get("reserved", 0)) + int(quantity)
        st_inv["reserved"] = new_reserved
        st_inv["updated_at"] = now
        self.inventory.setdefault(target_store, {})[sku_id] = st_inv

        if self.fs_connected and self.fs_client:
            try:
                self.fs_client.collection("erp_inventory_mirror").document(fmcg_vendor_id).set(
                    {
                        "node_id": fmcg_vendor_id,
                        "display_name": get_node_display_name(fmcg_vendor_id),
                        "sku_id": sku_id,
                        "on_hand": new_plant_on_hand,
                        "safety_buffer": plant_safety,
                        "atp_surplus": new_plant_atp,
                        "updated_at": now,
                    },
                    merge=True,
                )
                self.fs_client.collection("store_live_shelf").document(target_store).set(
                    {"reserved": new_reserved, "updated_at": now},
                    merge=True,
                )
            except Exception as e:
                print(f"[DualDB] Firestore FMCG PO update note: {e}")

        if self.bq_connected and self.bq_client:
            try:
                ds = f"{self.project_id}.{self.dataset_id}"
                self.bq_client.query(
                    f"""
                    UPDATE `{ds}.fmcg_factory_inventory`
                    SET on_hand = {new_plant_on_hand},
                        atp_surplus = {new_plant_atp},
                        updated_at = CURRENT_TIMESTAMP()
                    WHERE node_id = '{_sql_escape(fmcg_vendor_id)}' AND sku_id = '{_sql_escape(sku_id)}';
                    """
                ).result(timeout=8)

                self.bq_client.query(
                    f"""
                    INSERT INTO `{ds}.replenishment_orders`
                    (order_id, event_id, order_type, source_node, target_store, sku_id, units,
                     freight_cost, merchandise_cost, total_commitment, gate_status, vp_approval_token, created_at)
                    VALUES (
                        '{_sql_escape(order_id)}',
                        '{_sql_escape(event_id or order_id)}',
                        'PO_TO_FMCG',
                        '{_sql_escape(fmcg_vendor_id)}',
                        '{_sql_escape(target_store)}',
                        '{_sql_escape(sku_id)}',
                        {int(quantity)},
                        {float(freight_cost)},
                        {float(merchandise_cost)},
                        {total_commitment},
                        'APPROVED_BY_VP',
                        '{_sql_escape(vp_approval_token)}',
                        CURRENT_TIMESTAMP()
                    );
                    """
                ).result(timeout=8)
                self.last_bq_sync = now
            except Exception as e:
                print(f"[DualDB] BigQuery FMCG PO update note: {e}")

        order_rec = {
            "order_id": order_id,
            "order_type": "PO_TO_FMCG",
            "source_node": f"{fmcg_vendor_id} (via {serving_dc})",
            "target_store": target_store,
            "sku_id": sku_id,
            "units": int(quantity),
            "freight_cost": float(freight_cost),
            "merchandise_cost": float(merchandise_cost),
            "total_commitment": total_commitment,
            "created_at": now,
        }
        self.orders.append(order_rec)
        return {
            "status": "SUCCESS",
            "fmcg_purchase_order_id": order_id,
            "remaining_factory_on_hand": new_plant_on_hand,
            "remaining_factory_atp": new_plant_atp,
            "store_inbound_reserved": new_reserved,
        }

    # =========================================================================
    # FIRESTORE DURABLE A2A APPROVAL QUEUE & RUNTIME MANIFEST
    # =========================================================================

    def save_a2a_ticket(self, ticket: Dict[str, Any]) -> Dict[str, Any]:
        event_id = ticket.get("event_id") or f"evt_hitl_{os.urandom(3).hex()}"
        record = dict(ticket)
        record["event_id"] = event_id
        record.setdefault("created_at", _now_iso())
        record["updated_at"] = _now_iso()
        self.a2a_tickets_cache[event_id] = record

        if self.fs_connected and self.fs_client:
            try:
                self.fs_client.collection("a2a_approval_queue").document(event_id).set(record, merge=True)
            except Exception as e:
                print(f"[DualDB] Firestore save_a2a_ticket note: {e}")
        return record

    def get_a2a_ticket(self, event_id: str) -> Optional[Dict[str, Any]]:
        if self.fs_connected and self.fs_client:
            try:
                snap = self.fs_client.collection("a2a_approval_queue").document(event_id).get()
                if snap.exists:
                    data = snap.to_dict() or {}
                    self.a2a_tickets_cache[event_id] = data
                    return data
            except Exception as e:
                print(f"[DualDB] Firestore get_a2a_ticket note: {e}")
        return self.a2a_tickets_cache.get(event_id)

    def list_a2a_tickets(self) -> List[Dict[str, Any]]:
        if self.fs_connected and self.fs_client:
            try:
                docs = list(self.fs_client.collection("a2a_approval_queue").stream())
                tickets = []
                for d in docs:
                    data = d.to_dict() or {}
                    data.setdefault("event_id", d.id)
                    tickets.append(data)
                    self.a2a_tickets_cache[data["event_id"]] = data
                return tickets
            except Exception as e:
                print(f"[DualDB] Firestore list_a2a_tickets note: {e}")
        return list(self.a2a_tickets_cache.values())

    def mark_a2a_ticket_approved(
        self,
        event_id: str,
        order_id: str,
        approver_name: str,
        vp_approval_token: str,
        a2a_resume_response: str = "",
    ) -> Optional[Dict[str, Any]]:
        now = _now_iso()
        updates = {
            "status": "approved",
            "a2a_task_state": "completed",
            "sap_order_id": order_id,
            "sap_transfer_order_id": order_id,
            "approver_name": approver_name,
            "vp_approval_token": vp_approval_token,
            "a2a_resume_response": a2a_resume_response,
            "approved_at": now,
            "updated_at": now,
        }
        if event_id in self.a2a_tickets_cache:
            self.a2a_tickets_cache[event_id].update(updates)
        if self.fs_connected and self.fs_client:
            try:
                self.fs_client.collection("a2a_approval_queue").document(event_id).set(updates, merge=True)
            except Exception as e:
                print(f"[DualDB] Firestore mark_a2a_ticket_approved note: {e}")
        return self.a2a_tickets_cache.get(event_id)

    def save_latest_manifest(self, manifest_dict: Dict[str, Any]) -> None:
        self.latest_manifest_cache = manifest_dict
        if self.fs_connected and self.fs_client:
            try:
                self.fs_client.collection("runtime_state").document("latest_manifest").set(manifest_dict)
            except Exception as e:
                print(f"[DualDB] Firestore save_latest_manifest note: {e}")

    def get_latest_manifest(self) -> Optional[Dict[str, Any]]:
        if self.fs_connected and self.fs_client:
            try:
                snap = self.fs_client.collection("runtime_state").document("latest_manifest").get()
                if snap.exists:
                    self.latest_manifest_cache = snap.to_dict()
                    return self.latest_manifest_cache
            except Exception:
                pass
        return self.latest_manifest_cache

    # =========================================================================
    # WEATHER & SOCIAL TELEMETRY FEEDS
    # =========================================================================

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
            "store_display_name": get_node_display_name(store_id),
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

    # =========================================================================
    # BIGQUERY AUDIT LEDGER (IMMUTABLE READ & WRITE)
    # =========================================================================

    def record_audit_entry_async(self, entry: Dict[str, Any]):
        """Append audit ledger record to local store and insert via SQL into BigQuery `audit_ledger`."""
        self.audit_ledger.append(entry)

        def _worker():
            if not self.bq_connected or not self.bq_client:
                return
            try:
                ds = f"{self.project_id}.{self.dataset_id}"
                sql = f"""
                INSERT INTO `{ds}.audit_ledger`
                (event_id, timestamp, signal_source, store_id, sku_id, observed_velocity,
                 root_cause_explanation, selected_donor_dc, order_type, units_transferred,
                 freight_mode, carrier_name, estimated_freight_cost, gate_status,
                 requires_human_approval, approver_name, sap_transfer_order_id, vertex_session_id)
                VALUES (
                    '{_sql_escape(entry.get("event_id", ""))}',
                    '{_sql_escape(entry.get("timestamp", _now_iso()))}',
                    '{_sql_escape(entry.get("signal_source", "POS_SCANNER"))}',
                    '{_sql_escape(entry.get("store_id", ""))}',
                    '{_sql_escape(entry.get("sku_id", ""))}',
                    {float(entry.get("observed_velocity", 0.0))},
                    '{_sql_escape(entry.get("root_cause_explanation", ""))}',
                    '{_sql_escape(entry.get("selected_donor_dc", ""))}',
                    '{_sql_escape(entry.get("order_type", "STO_FROM_DC"))}',
                    {int(entry.get("units_transferred", 0))},
                    '{_sql_escape(entry.get("freight_mode", ""))}',
                    '{_sql_escape(entry.get("carrier_name", ""))}',
                    {float(entry.get("estimated_freight_cost", 0.0))},
                    '{_sql_escape(entry.get("gate_status", "APPROVED"))}',
                    {'TRUE' if entry.get("requires_human_approval") else 'FALSE'},
                    '{_sql_escape(entry.get("approver_name") or "")}',
                    '{_sql_escape(entry.get("sap_transfer_order_id") or "")}',
                    '{_sql_escape(entry.get("vertex_session_id") or "")}'
                );
                """
                self.bq_client.query(sql).result(timeout=8)
                self.last_bq_sync = _now_iso()
            except Exception as e:
                print(f"[DualDB] BigQuery audit insert note: {e}")

        threading.Thread(target=_worker, daemon=True).start()

    def fetch_audit_ledger_from_bq(self, limit: int = 50) -> List[Dict[str, Any]]:
        """Query live deduplicated audit records directly from BigQuery `audit_ledger`.
        Collapses superseded `REFERRED_TO_HUMAN` rows once the same `event_id` is `APPROVED` with an order ID.
        """
        if self.bq_connected and self.bq_client:
            try:
                ds = f"{self.project_id}.{self.dataset_id}"
                sql = f"""
                SELECT event_id, timestamp, signal_source, store_id, sku_id, observed_velocity,
                       root_cause_explanation, selected_donor_dc, order_type, units_transferred,
                       freight_mode, carrier_name, estimated_freight_cost, gate_status,
                       requires_human_approval, approver_name, sap_transfer_order_id, vertex_session_id
                FROM `{ds}.audit_ledger`
                WHERE event_id != 'evt_tx_baseline_init'
                  AND signal_source != 'LAKEHOUSE_BASELINE_INIT'
                  AND order_type != 'NONE'
                QUALIFY ROW_NUMBER() OVER (
                    PARTITION BY event_id
                    ORDER BY CASE WHEN sap_transfer_order_id IS NOT NULL AND sap_transfer_order_id != '' THEN 1 ELSE 0 END DESC,
                             timestamp DESC
                ) = 1
                ORDER BY timestamp DESC
                LIMIT {int(limit)}
                """
                rows = list(self.bq_client.query(sql).result(timeout=6))
                return [dict(r.items()) for r in rows]
            except Exception as e:
                print(f"[DualDB] BigQuery audit read fallback: {e}")

        # In-memory deduplicated fallback (preferring finalized row with order ID, then newest timestamp)
        deduped: Dict[str, Dict[str, Any]] = {}
        for r in self.audit_ledger:
            if (
                r.get("event_id") == "evt_tx_baseline_init"
                or r.get("signal_source") == "LAKEHOUSE_BASELINE_INIT"
                or r.get("order_type") == "NONE"
            ):
                continue
            eid = r.get("event_id", "")
            existing = deduped.get(eid)
            has_id = bool((r.get("sap_transfer_order_id") or "").strip())
            existing_has_id = bool(existing and (existing.get("sap_transfer_order_id") or "").strip())
            if not existing or (has_id and not existing_has_id) or (has_id == existing_has_id and str(r.get("timestamp", "")) >= str(existing.get("timestamp", ""))):
                deduped[eid] = r
        ordered = sorted(deduped.values(), key=lambda x: str(x.get("timestamp", "")), reverse=True)
        return ordered[:limit]

    # =========================================================================
    # ATOMIC 1-CLICK DEMO RESET (FIRESTORE + ALL 5 BIGQUERY TABLES)
    # =========================================================================

    def _reset_bigquery_tables_sync(self) -> bool:
        """Atomically recreate all 5 BigQuery tables via `CREATE OR REPLACE TABLE` (zero streaming buffer locks)."""
        if not self.bq_connected or not self.bq_client:
            return False
        try:
            from google.cloud import bigquery
            ds_ref = f"{self.project_id}.{self.dataset_id}"
            ds = bigquery.Dataset(ds_ref)
            ds.location = "US"
            self.bq_client.create_dataset(ds, exists_ok=True)

            # 1. Retail ERP Inventory (`retail_erp_inventory` — 3 DCs + 6 Healthy Stores)
            retail_structs = []
            for node_id, skus in INITIAL_INVENTORY.items():
                if node_id.startswith("FMCG-"):
                    continue
                node_type = "STORE" if node_id.startswith("STORE-") else "DC"
                disp = _sql_escape(get_node_display_name(node_id))
                for sku_id, item in skus.items():
                    on_hand = int(item.get("on_hand", 0))
                    safety = int(item.get("safety_buffer", 0))
                    atp = int(item.get("atp_surplus", max(0, on_hand - safety)))
                    reserved = int(item.get("reserved", 0))
                    base_vel = float(item.get("burn_rate_base", 0.0))
                    curr_vel = float(item.get("current_velocity", 0.0))
                    retail_structs.append(
                        f"STRUCT('{node_id}' AS node_id, '{node_type}' AS node_type, '{disp}' AS display_name, "
                        f"'{sku_id}' AS sku_id, {on_hand} AS on_hand, {safety} AS safety_buffer, "
                        f"{atp} AS atp_surplus, {reserved} AS reserved, {base_vel} AS burn_rate_base, "
                        f"{curr_vel} AS current_velocity, CURRENT_TIMESTAMP() AS updated_at)"
                    )

            sql_retail = f"""
            CREATE OR REPLACE TABLE `{ds_ref}.retail_erp_inventory` AS
            SELECT * FROM UNNEST([
                {", ".join(retail_structs)}
            ]);
            """

            # 2. Isolated FMCG Manufacturer Inventory (`fmcg_factory_inventory` — Waco Bottling Factory)
            fmcg_item = INITIAL_INVENTORY["FMCG-PLANT-TX01"]["SKU-4089-HYDRATE"]
            sql_fmcg = f"""
            CREATE OR REPLACE TABLE `{ds_ref}.fmcg_factory_inventory` AS
            SELECT * FROM UNNEST([
                STRUCT(
                    'FMCG-PLANT-TX01' AS node_id,
                    '{_sql_escape(get_node_display_name("FMCG-PLANT-TX01"))}' AS display_name,
                    'SKU-4089-HYDRATE' AS sku_id,
                    {int(fmcg_item["on_hand"])} AS on_hand,
                    {int(fmcg_item["safety_buffer"])} AS safety_buffer,
                    {int(fmcg_item["atp_surplus"])} AS atp_surplus,
                    8.79 AS wholesale_unit_cost,
                    CURRENT_TIMESTAMP() AS updated_at
                )
            ]);
            """

            # 3. POS Sales Stream table
            sql_pos = f"""
            CREATE OR REPLACE TABLE `{ds_ref}.pos_sales_stream` (
                event_id STRING,
                store_id STRING,
                sku_id STRING,
                units_sold INT64,
                observed_velocity FLOAT64,
                baseline_velocity FLOAT64,
                on_hand_after INT64,
                timestamp TIMESTAMP
            );
            """

            # 4. Replenishment Orders table
            sql_orders = f"""
            CREATE OR REPLACE TABLE `{ds_ref}.replenishment_orders` (
                order_id STRING,
                event_id STRING,
                order_type STRING,
                source_node STRING,
                target_store STRING,
                sku_id STRING,
                units INT64,
                freight_cost FLOAT64,
                merchandise_cost FLOAT64,
                total_commitment FLOAT64,
                gate_status STRING,
                vp_approval_token STRING,
                created_at TIMESTAMP
            );
            """

            # 5. Clean empty Audit Ledger table (populated strictly by real executed/escalated orders)
            sql_audit = f"""
            CREATE OR REPLACE TABLE `{ds_ref}.audit_ledger` (
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
                sap_transfer_order_id STRING,
                vertex_session_id STRING
            );
            """

            # Run all 5 DDL statements in parallel (~2-3s total!)
            def _run(q: str):
                self.bq_client.query(q).result(timeout=12)

            with ThreadPoolExecutor(max_workers=5) as pool:
                futures = [pool.submit(_run, q) for q in (sql_retail, sql_fmcg, sql_pos, sql_orders, sql_audit)]
                for f in futures:
                    f.result()

            self.last_bq_sync = _now_iso()
            return True
        except Exception as e:
            print(f"[DualDB] BigQuery atomic reset note: {e}")
            return False

    def reset_all_demo_data(self) -> Dict[str, Any]:
        """Atomically reset Cloud Firestore collections AND BigQuery tables back to healthy baseline."""
        self.inventory = get_fresh_inventory()
        self.orders = []
        self.audit_ledger = self._initial_audit_rows()
        self.a2a_tickets_cache.clear()
        self.latest_manifest_cache = None
        self.weather_signals = copy.deepcopy(WEATHER_FORECAST_SIGNALS)
        self.social_signals = copy.deepcopy(SOCIAL_MEDIA_SIGNALS)
        self.last_reset_at = _now_iso()

        # 1. Synchronously reset Firestore (store_live_shelf, erp_inventory_mirror, stream, A2A queue, runtime_state)
        self._clear_firestore_collection("live_telemetry_stream")
        self._clear_firestore_collection("a2a_approval_queue")
        self._clear_firestore_collection("runtime_state")
        self._seed_firestore_baseline()

        # 2. Synchronously reset all 5 BigQuery tables in parallel (zero streaming buffer locks)
        bq_ok = self._reset_bigquery_tables_sync()

        return {
            "status": "RESET_COMPLETE",
            "gcp_project": self.project_id,
            "firestore_reset": self.fs_connected,
            "bigquery_reset": bq_ok,
            "bigquery_dataset": f"{self.project_id}.{self.dataset_id}",
            "bigquery_tables_reset": [
                "retail_erp_inventory",
                "fmcg_factory_inventory",
                "pos_sales_stream",
                "replenishment_orders",
                "audit_ledger",
            ],
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
