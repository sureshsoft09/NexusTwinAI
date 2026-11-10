"""Cognitive Twin Service bridging FastAPI with Deployed Vertex AI Agent Engine,
ADK NexusTwinSupervisor, RemoteA2aAgent, Cloud Run FastMCP Servers, and BigQuery Lakehouse.

Deployed Vertex AI Agent Engine Resource ID:
  projects/311231946335/locations/us-central1/reasoningEngines/6418419193229606912
"""

import logging
import os
import re
import sys
from pathlib import Path
from typing import Any, Dict, List, Optional
import httpx

# Ensure paths are importable
_service_dir = Path(__file__).resolve().parent
_backend_dir = _service_dir.parent.parent
_src_dir = _backend_dir.parent
_agents_src = _src_dir / "agents" / "src"
_workspace_dir = _src_dir.parent.parent
for p in [str(_src_dir), str(_agents_src), str(_backend_dir), str(_workspace_dir)]:
    if p not in sys.path:
        sys.path.insert(0, p)

from backend.app.config import settings
from nexustwin_agents.supervisor import NexusTwinSupervisor
from nexustwin_agents.gate import evaluate_feasibility_gate
from nexustwin_agents.config import config

try:
    from shared.schemas import (
        MarketSignalEvent,
        ReplenishmentDecisionManifest,
        GateEvaluationResult,
        ApprovalDecisionRequest,
        GateStatus,
    )
    from shared.topology import (
        FMCG_MANUFACTURERS,
        REGIONAL_DCS,
        RETAIL_STORES,
        SKU_CATALOG,
        get_fresh_inventory,
    )
    from shared.bq_lakehouse import bq_lakehouse
except ImportError:
    from prototype.src.shared.schemas import (
        MarketSignalEvent,
        ReplenishmentDecisionManifest,
        GateEvaluationResult,
        ApprovalDecisionRequest,
        GateStatus,
    )
    from prototype.src.shared.topology import (
        FMCG_MANUFACTURERS,
        REGIONAL_DCS,
        RETAIL_STORES,
        SKU_CATALOG,
        get_fresh_inventory,
    )
    from prototype.src.shared.bq_lakehouse import bq_lakehouse

logger = logging.getLogger("nexustwin-engine")

DEMO_SCENARIOS: Dict[str, Dict[str, Any]] = {
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
        "agent_prompt": (
            "URGENT POS SCANNER SURGE at Shop 1 (`STORE-DAL-04`, Dallas Uptown) for `SKU-4089-HYDRATE`. "
            "Observed checkout velocity is 215.0 units/hr vs 48.0 units/hr baseline, with only 180 units left on shelf. "
            "Run the full supply chain swarm: 1) Call `sensing_agent` to verify the velocity anomaly and weather/events at `STORE-DAL-04`. "
            "2) Call `replenishment_agent` to check ATP surplus at serving DC `DC-ATX-02` for 1,500 units. "
            "3) Call `logistics_agent` to quote ground freight from `DC-ATX-02` to `STORE-DAL-04`. "
            "4) Since freight is under the $1,000 autonomy limit, call `execute_replenishment_sto` to dispatch the internal SAP STO."
        ),
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
        "agent_prompt": (
            "CRITICAL POS SURGE + DC SHORTAGE at Shop 2 (`STORE-HOU-05`, Houston Galleria) for `SKU-4089-HYDRATE`. "
            "Observed velocity is 230.0 units/hr vs 52.0 baseline, with only 140 units remaining (1,800 units required). "
            "Run the supply chain swarm: 1) Call `sensing_agent` to confirm the surge at `STORE-HOU-05`. "
            "2) Call `replenishment_agent` to check serving DC `DC-HOU-01` ATP surplus for 1,800 units (it only has 180 ATP surplus, so escalate to `FMCG-PLANT-TX01`). "
            "3) Call `logistics_agent` to quote expedited FMCG direct cold-chain freight for 1,800 units. "
            "4) Because total financial commitment ($17,672) and freight ($1,850) exceed the $1,000 autonomy threshold, report that VP Human-in-the-Loop approval is required."
        ),
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
        "agent_prompt": (
            "25-DAY LONG-RANGE WEATHER FORECAST SIGNAL for Shop 3 (`STORE-PLANO-07`, Plano Legacy) on `SKU-4089-HYDRATE`. "
            "Run the supply chain swarm: 1) Call `sensing_agent` to check the 25-day weather forecast (`get_long_range_weather_forecast`) for `STORE-PLANO-07` (104.2°F Heat Dome in T+25 days). "
            "2) Call `replenishment_agent` to check ATP surplus at `DC-ATX-02` for 1,500 units. "
            "3) Call `logistics_agent` to quote scheduled economy ground pre-positioning from `DC-ATX-02` to `STORE-PLANO-07`. "
            "4) Since economy freight ($480) is under $1,000, call `execute_replenishment_sto` to pre-position the stock."
        ),
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
        "agent_prompt": (
            "VIRAL SOCIAL MEDIA & FORUM EVENT SPIKE detected near Shop 4 (`STORE-ARL-11`, Arlington Stadium) for `SKU-4089-HYDRATE`. "
            "Run the supply chain swarm: 1) Call `sensing_agent` to monitor social media and forums (`monitor_social_media_and_forums`) for `STORE-ARL-11` (Arlington Stadium Charity Marathon viral buzz 94.5/100, 18,500 runners). "
            "2) Call `replenishment_agent` to verify ATP surplus at `DC-SAT-03` for 1,200 units. "
            "3) Call `logistics_agent` to quote ground freight from `DC-SAT-03` to `STORE-ARL-11`. "
            "4) Since freight ($680) is under $1,000, call `execute_replenishment_sto` to dispatch the internal STO."
        ),
    },
}


class DigitalTwinService:
    def __init__(self):
        self.supervisor = NexusTwinSupervisor()
        self.pending_approvals: Dict[str, Dict[str, Any]] = {}
        self.audit_records: List[Dict[str, Any]] = list(bq_lakehouse.audit_ledger)
        self.last_manifest: Optional[Dict[str, Any]] = None
        self.a2a_base_url = settings.A2A_APPROVAL_AGENT_BASE_URL
        self.agent_engine_resource_id = settings.AGENT_ENGINE_RESOURCE_ID
        self.agent_engine_region = settings.AGENT_ENGINE_REGION
        self._remote_engine = None
        self._remote_engine_checked = False

    def get_remote_reasoning_engine(self):
        """Lazily initialize connection to the deployed Vertex AI Agent Engine."""
        if not self._remote_engine_checked and self.agent_engine_resource_id:
            self._remote_engine_checked = True
            try:
                import vertexai
                from vertexai import agent_engines

                vertexai.init(
                    project=settings.GCP_PROJECT_ID,
                    location=self.agent_engine_region,
                )
                self._remote_engine = agent_engines.get(self.agent_engine_resource_id)
                logger.info(
                    "Connected to deployed Vertex AI Agent Engine: %s",
                    self.agent_engine_resource_id,
                )
            except Exception as e:
                logger.warning(
                    "Could not connect to remote Vertex AI Agent Engine (%s): %s",
                    self.agent_engine_resource_id,
                    e,
                )
                self._remote_engine = None
        return self._remote_engine

    @property
    def inventory_state(self) -> Dict[str, Dict[str, Any]]:
        return bq_lakehouse.inventory

    def get_topology_state(self) -> Dict[str, Any]:
        """Return current state of Texas supply chain network (1 FMCG Plant, 3 DCs, 6 Stores) & GCP telemetry."""
        return {
            "gcp_project": bq_lakehouse.project_id,
            "bigquery_dataset": f"{bq_lakehouse.project_id}.{bq_lakehouse.dataset_id}",
            "agent_engine_resource_id": self.agent_engine_resource_id,
            "agent_engine_region": self.agent_engine_region,
            "fmcg_manufacturers": FMCG_MANUFACTURERS,
            "dcs": REGIONAL_DCS,
            "stores": RETAIL_STORES,
            "skus": SKU_CATALOG,
            "inventory": bq_lakehouse.inventory,
            "weather_forecast_25d": bq_lakehouse.fetch_live_weather_forecast_25d("STORE-PLANO-07"),
            "social_media_signals": bq_lakehouse.get_social_media_feed(),
            "active_orders": bq_lakehouse.orders,
            "last_manifest": self.last_manifest,
            "pending_approvals_count": len(self.pending_approvals),
            "last_reset_at": bq_lakehouse.last_reset_at,
            "a2a_approval_agent_url": f"{self.a2a_base_url}/.well-known/agent.json",
        }

    def get_audit_ledger(self, limit: int = 50) -> List[Dict[str, Any]]:
        """Return deduplicated live operational audit records."""
        combined: List[Dict[str, Any]] = []
        seen_ids = set()
        for rec in reversed(self.audit_records + bq_lakehouse.audit_ledger):
            key = f"{rec.get('event_id')}_{rec.get('timestamp')}"
            if key not in seen_ids:
                seen_ids.add(key)
                combined.append(rec)
        combined.reverse()
        return combined[-limit:]

    def reset_demo_state(self) -> Dict[str, Any]:
        """Reset all in-memory and BigQuery tables back to starting demo values."""
        reset_summary = bq_lakehouse.reset_all_demo_data()
        self.pending_approvals.clear()
        self.audit_records = list(bq_lakehouse.audit_ledger)
        self.last_manifest = None
        try:
            with httpx.Client(timeout=2.0) as client:
                client.post(f"{self.a2a_base_url}/", json={"id": "reset", "params": {"action": "reset"}})
        except Exception:
            pass
        return reset_summary

    async def query_remote_agent(
        self,
        prompt: str,
        user_id: str = "supply_chain_planner_01",
        session_state: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        """Directly invoke the deployed Vertex AI Agent Engine (`reasoningEngines/6418419193229606912`)
        and return the live streaming events, tool calls, and synthesized text response.
        """
        remote_engine = self.get_remote_reasoning_engine()
        if not remote_engine:
            return {
                "remote_executed": False,
                "agent_engine_resource_id": self.agent_engine_resource_id,
                "vertex_session_id": None,
                "response_text": "",
                "step_events": [],
                "error": "Vertex AI Agent Engine client unavailable",
            }

        vertex_session_id: Optional[str] = None
        step_events: List[Dict[str, Any]] = []
        text_chunks: List[str] = []

        try:
            created = await remote_engine.async_create_session(
                user_id=user_id,
                state=session_state or {"project": settings.GCP_PROJECT_ID},
            )
            vertex_session_id = (
                created.get("id")
                if isinstance(created, dict)
                else getattr(created, "id", None)
            )
            logger.info(
                "Created live Vertex AI Agent Engine session %s on %s",
                vertex_session_id,
                self.agent_engine_resource_id,
            )

            idx = 0
            async for ev in remote_engine.async_stream_query(
                message=prompt,
                user_id=user_id,
                session_id=vertex_session_id,
            ):
                idx += 1
                ev_dict = (
                    ev
                    if isinstance(ev, dict)
                    else (ev.to_dict() if hasattr(ev, "to_dict") else {"raw": str(ev)})
                )
                author = ev_dict.get("author") or "twin_supervisor"
                content = ev_dict.get("content") or {}
                parts = content.get("parts", []) if isinstance(content, dict) else []

                step_texts: List[str] = []
                tool_calls: List[str] = []
                for p in parts:
                    if isinstance(p, dict):
                        if p.get("text"):
                            step_texts.append(str(p["text"]))
                            text_chunks.append(str(p["text"]))
                        if p.get("function_call"):
                            fn = p["function_call"]
                            tool_calls.append(fn.get("name", "tool_call"))
                        if p.get("function_response"):
                            fr = p["function_response"]
                            tool_calls.append(f"{fr.get('name', 'tool')} -> response")
                    else:
                        if getattr(p, "text", None):
                            step_texts.append(str(p.text))
                            text_chunks.append(str(p.text))

                step_events.append(
                    {
                        "step_seq": idx,
                        "agent": author,
                        "phase": "TOOL_EXECUTION" if tool_calls else "AGENT_REASONING",
                        "tools": tool_calls,
                        "message": " ".join(step_texts) if step_texts else (
                            f"Invoked {', '.join(tool_calls)}" if tool_calls else f"Agent {author} step"
                        ),
                        "vertex_session_id": vertex_session_id,
                    }
                )

            full_text = "\n".join(t.strip() for t in text_chunks if t.strip())
            return {
                "remote_executed": True,
                "agent_engine_resource_id": self.agent_engine_resource_id,
                "vertex_session_id": vertex_session_id,
                "response_text": full_text,
                "step_events": step_events,
            }
        except Exception as e:
            logger.warning(
                "Vertex AI Agent Engine stream_query warning (session=%s): %s",
                vertex_session_id,
                e,
            )
            full_text = "\n".join(t.strip() for t in text_chunks if t.strip())
            return {
                "remote_executed": bool(step_events or full_text),
                "agent_engine_resource_id": self.agent_engine_resource_id,
                "vertex_session_id": vertex_session_id,
                "response_text": full_text,
                "step_events": step_events,
                "error": str(e),
            }

    async def trigger_demo_scenario(
        self,
        scenario_key: str,
        broadcast_fn: Optional[Any] = None,
    ) -> ReplenishmentDecisionManifest:
        """Run live telemetry stream in Python -> fire Live Alert Notification -> trigger NexusTwin AI Multi-Agent System
        -> produce Common Output -> run 4 Mandatory Mathematical Gate Checks -> execute final ERP / A2A workflow.
        """
        import asyncio

        payload = DEMO_SCENARIOS.get(scenario_key)
        if not payload:
            raise ValueError(f"Unknown scenario '{scenario_key}'. Valid: {list(DEMO_SCENARIOS.keys())}")
        event_fields = {k: v for k, v in payload.items() if k != "agent_prompt"}
        event = MarketSignalEvent(**event_fields)

        store_id = event.store_id
        sku_id = event.sku_id
        store_friendly = {
            "STORE-DAL-04": "Shop 1: Dallas Uptown (STORE-DAL-04)",
            "STORE-HOU-05": "Shop 2: Houston Galleria (STORE-HOU-05)",
            "STORE-PLANO-07": "Shop 3: Plano Legacy (STORE-PLANO-07)",
            "STORE-ARL-11": "Shop 4: Arlington Stadium (STORE-ARL-11)",
        }.get(store_id, store_id)

        # 1. Stream 3 live POS / Weather / Social telemetry ticks from Python so the UI shows live data arriving
        tick_sequences = {
            "shop1_pos_dc_replenish": [
                {"tick": 1, "velocity": 96.0, "on_hand": 340, "note": "POS Stream Tick #1: Checkout scans rising to 96 packs/hr (Shelf: 340 packs)"},
                {"tick": 2, "velocity": 158.0, "on_hand": 240, "note": "POS Stream Tick #2: Checkout scans climbing to 158 packs/hr (Shelf: 240 packs)"},
                {"tick": 3, "velocity": 215.0, "on_hand": 180, "note": "POS Stream Tick #3: CRITICAL 215 packs/hr (4.48x spike) • Shelf dropped to 180 packs (< 250 safety buffer)!"},
            ],
            "shop2_dc_shortage_fmcg_po": [
                {"tick": 1, "velocity": 108.0, "on_hand": 320, "note": "POS Stream Tick #1: Houston Galleria checkout velocity rising to 108 packs/hr (Shelf: 320 packs)"},
                {"tick": 2, "velocity": 174.0, "on_hand": 210, "note": "POS Stream Tick #2: Checkout velocity at 174 packs/hr (Shelf: 210 packs)"},
                {"tick": 3, "velocity": 230.0, "on_hand": 140, "note": "POS Stream Tick #3: CRITICAL 230 packs/hr (4.42x spike) • Only 140 packs left & Houston DC has only 180 spare!"},
            ],
            "shop3_weather_25day_prediction": [
                {"tick": 1, "velocity": 42.0, "on_hand": 520, "note": "Weather API Stream (Day 1–10): 81.5°F Normal • Store velocity 42 packs/hr"},
                {"tick": 2, "velocity": 84.0, "on_hand": 520, "note": "Weather API Stream (Day 11–18): 96.0°F Heat Ridging • Projected demand climbing to 84 packs/hr"},
                {"tick": 3, "velocity": 128.0, "on_hand": 520, "note": "Weather API Stream (Day 19–25): 104.2°F Extreme Heat Dome Detected! Projected velocity 128 packs/hr (+220% surge)!"},
            ],
            "shop4_social_media_event_spike": [
                {"tick": 1, "velocity": 68.0, "on_hand": 420, "note": "Social Stream Tick #1: Reddit/X mentions rising (Buzz Score 62/100) near Arlington Stadium"},
                {"tick": 2, "velocity": 115.0, "on_hand": 360, "note": "Social Stream Tick #2: Marathon registration posts trending (Buzz Score 84/100)"},
                {"tick": 3, "velocity": 165.0, "on_hand": 310, "note": "Social Stream Tick #3: VIRAL ALERT (Score 94.5/100 • 18,500 Runners 1.2 mi away) • Velocity jumping to 165 packs/hr!"},
            ],
        }
        ticks = tick_sequences.get(scenario_key, [])
        for t in ticks:
            if store_id in bq_lakehouse.inventory and sku_id in bq_lakehouse.inventory[store_id]:
                bq_lakehouse.inventory[store_id][sku_id]["current_velocity"] = t["velocity"]
                bq_lakehouse.inventory[store_id][sku_id]["on_hand"] = t["on_hand"]
            if broadcast_fn:
                await broadcast_fn({
                    "type": "TELEMETRY_STREAM_TICK",
                    "scenario_key": scenario_key,
                    "store_id": store_id,
                    "sku_id": sku_id,
                    "tick": t["tick"],
                    "total_ticks": len(ticks),
                    "velocity": t["velocity"],
                    "on_hand": t["on_hand"],
                    "note": t["note"],
                    "state": self.get_topology_state(),
                })
            await asyncio.sleep(0.45)

        # 2. Threshold breached -> Broadcast Live Alert Notification before triggering Multi-Agent System
        spike_ratio = round(event.observed_velocity / max(1.0, event.baseline_velocity), 2)
        alert_msg = (
            f"🚨 LIVE ALERT — {store_friendly}: Demand spiked to {event.observed_velocity:.0f} packs/hr "
            f"({spike_ratio}x normal) with {event.current_store_stock} packs on shelf. "
            f"Triggering NexusTwin AI Multi-Agent System..."
        )
        if broadcast_fn:
            await broadcast_fn({
                "type": "LIVE_ALERT_NOTIFICATION",
                "scenario_key": scenario_key,
                "event_id": event.event_id,
                "store_id": store_id,
                "alert_message": alert_msg,
            })
        await asyncio.sleep(0.4)

        return await self.ingest_market_signal(
            event,
            custom_prompt=payload.get("agent_prompt"),
            scenario_key=scenario_key,
            broadcast_fn=broadcast_fn,
        )

    async def get_pending_a2a_cards(self) -> List[Dict[str, Any]]:
        """Fetch deduplicated pending HITL approval cards from RemoteA2aAgent (Port 8001) + local twin queue."""
        raw_cards: List[Dict[str, Any]] = []
        try:
            async with httpx.AsyncClient(timeout=2.5) as client:
                resp = await client.get(f"{self.a2a_base_url}/pending")
                if resp.status_code == 200:
                    data = resp.json()
                    if isinstance(data, list):
                        raw_cards.extend(data)
                    elif isinstance(data, dict):
                        raw_cards.extend(data.get("pending_approvals", []))
        except Exception:
            pass

        for event_id, item in self.pending_approvals.items():
            manifest = item.get("manifest", {})
            order_type = manifest.get("order_type", "STO_FROM_DC")
            prefix = "HITL-FMCG-PO" if order_type == "PO_TO_FMCG" else "HITL-STO"
            raw_cards.append(
                {
                    "ticket_id": f"{prefix}-{manifest.get('target_store', 'HOU-05')}-{manifest.get('units_transferred', 1800)}",
                    "event_id": event_id,
                    "order_type": order_type,
                    "agent_name": "approval_agent",
                    "agent_card_url": f"{self.a2a_base_url}/.well-known/agent.json",
                    "a2a_task_state": "input-required",
                    "tool_invoked": "LongRunningFunctionTool(ask_for_approval)",
                    "status": "pending",
                    "store_id": manifest.get("target_store", "STORE-HOU-05"),
                    "donor_dc": manifest.get("selected_donor_dc", "FMCG-PLANT-TX01 (via DC-HOU-01)"),
                    "sku_id": manifest.get("sku_id", "SKU-4089-HYDRATE"),
                    "units": manifest.get("units_transferred", 1800),
                    "freight_cost": manifest.get("estimated_freight_cost", 1850.00),
                    "fmcg_po_merchandise_cost": manifest.get("fmcg_po_merchandise_cost", 15822.00),
                    "total_financial_commitment": manifest.get("total_financial_commitment", 17672.00),
                    "freight_mode": manifest.get("freight_mode", "FMCG_DIRECT_EXPEDITED_PO"),
                    "carrier": manifest.get("carrier_name", "HydroBoost Cold-Chain Direct Carrier (FMCG PO)"),
                    "reason": (
                        f"Serving DC (DC-HOU-01) lacked ATP stock (only 180 ATP vs 1,800 needed). "
                        f"Escalated to External FMCG PO (${manifest.get('total_financial_commitment', 17672.0):,.2f} total commitment / "
                        f"${manifest.get('estimated_freight_cost', 1850.0):,.2f} freight > $1,000 threshold). Handed over to RemoteA2aAgent."
                        if order_type == "PO_TO_FMCG"
                        else f"Freight cost (${manifest.get('estimated_freight_cost', 3500.0):,.2f}) exceeds $1,000 autonomy threshold. Handed over to RemoteA2aAgent."
                    ),
                    "created_at": manifest.get("created_at", "2026-11-06T12:45:00Z"),
                }
            )

        # Deduplicate by (store_id, sku_id) keeping the latest card so Header & Tab 5 counts always match
        deduped_by_store: Dict[str, Dict[str, Any]] = {}
        for card in raw_cards:
            store_key = f"{card.get('store_id', 'STORE-HOU-05')}_{card.get('sku_id', 'SKU-4089-HYDRATE')}"
            normalized = dict(card)
            normalized["carrier"] = normalized.get("carrier") or normalized.get("carrier_name") or "HydroBoost Direct Cold-Chain Carrier"
            normalized["created_at"] = normalized.get("created_at") or normalized.get("timestamp") or "2026-11-06T12:45:00Z"
            deduped_by_store[store_key] = normalized

        return list(deduped_by_store.values())

    async def ingest_market_signal(
        self,
        event: MarketSignalEvent,
        custom_prompt: Optional[str] = None,
        scenario_key: Optional[str] = None,
        broadcast_fn: Optional[Any] = None,
    ) -> ReplenishmentDecisionManifest:
        """Invoke the NexusTwin AI Multi-Agent System (`sensing_agent` -> `replenishment_agent` -> `logistics_agent`),
        produce the Standardized Common Multi-Agent Output (`MultiAgentCommonOutput`),
        evaluate the 4 Mandatory Mathematical Gate Checks, and execute the final ERP / A2A workflow.
        """
        import asyncio

        has_approval = (
            event.event_id in self.pending_approvals
            and self.pending_approvals[event.event_id].get("approved", False)
        )
        approver_token = self.pending_approvals.get(event.event_id, {}).get("approver_token")

        if broadcast_fn:
            await broadcast_fn({
                "type": "MULTI_AGENT_PROCESSING",
                "event_id": event.event_id,
                "scenario_key": scenario_key,
                "active_agent": "sensing_agent",
                "status_message": "NexusTwin AI Multi-Agent System Running: sensing_agent querying BigQuery Lakehouse & telemetry streams...",
            })

        # 1. Build prompt for NexusTwin AI Multi-Agent System
        prompt = custom_prompt or (
            f"Market signal `{event.event_id}` from `{event.signal_source}` at store `{event.store_id}` for SKU `{event.sku_id}`: "
            f"observed velocity {event.observed_velocity} units/hr (baseline {event.baseline_velocity} u/hr), "
            f"current store stock {event.current_store_stock} units, forecast horizon {event.forecast_horizon_days} days. "
            f"Context: {event.context_notes or 'Evaluate sensing, DC ATP replenishment, supplier negotiation, logistics rates, and 4-Rule Feasibility Gate.'}"
        )

        # 2. Query deployed NexusTwin AI Agent Engine (`projects/311231946335/locations/us-central1/reasoningEngines/6418419193229606912`)
        remote_res = await self.query_remote_agent(
            prompt=prompt,
            user_id=f"store_manager_{event.store_id.lower()}",
            session_state={
                "event_id": event.event_id,
                "store_id": event.store_id,
                "sku_id": event.sku_id,
                "signal_source": event.signal_source,
            },
        )

        if broadcast_fn:
            await broadcast_fn({
                "type": "MULTI_AGENT_PROCESSING",
                "event_id": event.event_id,
                "scenario_key": scenario_key,
                "active_agent": "replenishment_agent",
                "status_message": "replenishment_agent checking SAP ERP warehouse stock & negotiating supplier terms + logistics_agent quoting 3PL carrier lanes...",
            })
            await asyncio.sleep(0.35)

        # 3. Run multi-agent supervisor -> produces `common_agent_output` -> runs 4 Mandatory Mathematical Gate Checks
        manifest = await self.supervisor.run_resolution_cycle(
            event=event,
            has_human_approval=has_approval,
            approver_token=approver_token,
            scenario_key=scenario_key,
        )

        # Broadcast Common Multi-Agent Output Ready before Gate Check confirmation
        if broadcast_fn and manifest.common_agent_output:
            await broadcast_fn({
                "type": "COMMON_AGENT_OUTPUT_READY",
                "event_id": manifest.event_id,
                "scenario_key": scenario_key,
                "common_agent_output": manifest.common_agent_output.model_dump(mode="json"),
            })
            await asyncio.sleep(0.55)

        # Broadcast 4 Mandatory Mathematical Gate Checks Evaluated
        if broadcast_fn and manifest.gate_evaluation:
            await broadcast_fn({
                "type": "GATE_CHECKS_EVALUATED",
                "event_id": manifest.event_id,
                "scenario_key": scenario_key,
                "gate_evaluation": manifest.gate_evaluation.model_dump(mode="json"),
            })
            await asyncio.sleep(0.45)

        # 4. Merge live Vertex AI Agent Engine output & order IDs into the manifest
        manifest.agent_engine_resource_id = self.agent_engine_resource_id
        manifest.vertex_session_id = remote_res.get("vertex_session_id")
        manifest.remote_executed = bool(remote_res.get("remote_executed"))
        manifest.step_events = remote_res.get("step_events", [])

        remote_text = (remote_res.get("response_text") or "").strip()
        if remote_text:
            manifest.agent_response_text = remote_text
            # Extract live STO-SAP-... or PO-FMCG-... order ID if generated by remote Agent Engine MCP tool call
            sto_match = re.search(r"(STO-SAP-[A-Z0-9\-]+)", remote_text)
            po_match = re.search(r"(PO-FMCG-[A-Z0-9\-]+)", remote_text)
            if sto_match and not manifest.requires_human_approval:
                manifest.sap_transfer_order_id = sto_match.group(1)
            if po_match and not manifest.requires_human_approval:
                manifest.fmcg_purchase_order_id = po_match.group(1)
        else:
            manifest.agent_response_text = manifest.root_cause_explanation

        if manifest.gate_status == GateStatus.REFERRED_TO_HUMAN:
            self.pending_approvals[manifest.event_id] = {
                "manifest": manifest.model_dump(mode="json"),
                "event": event.model_dump(mode="json"),
                "status": "AWAITING_APPROVAL",
                "cost": manifest.estimated_freight_cost,
            }
            try:
                async with httpx.AsyncClient(timeout=3.0) as client:
                    await client.post(
                        f"{self.a2a_base_url}/",
                        json={
                            "id": manifest.event_id,
                            "params": {
                                "action": "ask_for_approval",
                                "event_id": manifest.event_id,
                                "purpose": f"{manifest.order_type}: Replenish {manifest.target_store} from {manifest.selected_donor_dc} ({manifest.sku_id})",
                                "amount": manifest.total_financial_commitment or manifest.estimated_freight_cost,
                                "target_store": manifest.target_store,
                                "donor_dc": manifest.selected_donor_dc,
                                "sku_id": manifest.sku_id,
                                "units": manifest.units_transferred,
                            },
                        },
                    )
            except Exception:
                pass
        elif manifest.gate_status == GateStatus.APPROVED:
            self._apply_inventory_change(manifest)
            self.pending_approvals.pop(manifest.event_id, None)

        manifest_dict = manifest.model_dump(mode="json")
        self.last_manifest = manifest_dict

        audit_entry = {
            "event_id": manifest.event_id,
            "timestamp": str(manifest.created_at),
            "signal_source": manifest.signal_source,
            "store_id": manifest.target_store,
            "sku_id": manifest.sku_id,
            "observed_velocity": event.observed_velocity,
            "root_cause_explanation": manifest.root_cause_explanation,
            "selected_donor_dc": manifest.selected_donor_dc,
            "order_type": manifest.order_type,
            "units_transferred": manifest.units_transferred,
            "freight_mode": manifest.freight_mode,
            "carrier_name": manifest.carrier_name,
            "estimated_freight_cost": manifest.estimated_freight_cost,
            "gate_status": manifest.gate_status.value,
            "requires_human_approval": manifest.requires_human_approval,
            "approver_name": (
                "VP Supply Chain Operations (A2A HITL)"
                if has_approval
                else f"Vertex AI Agent Engine ({self.agent_engine_resource_id.split('/')[-1]})"
            ),
            "sap_transfer_order_id": manifest.fmcg_purchase_order_id or manifest.sap_transfer_order_id,
            "agent_engine_resource_id": self.agent_engine_resource_id,
            "vertex_session_id": manifest.vertex_session_id,
            "remote_executed": manifest.remote_executed,
        }
        self.audit_records.append(audit_entry)
        bq_lakehouse.record_audit_entry_async(audit_entry)
        return manifest

    def _apply_inventory_change(self, manifest: ReplenishmentDecisionManifest):
        """Update DC, FMCG Plant, and Retail Store stock levels in the Digital Twin & BigQuery Lakehouse."""
        sku = manifest.sku_id
        store_id = manifest.target_store
        units = manifest.units_transferred

        if manifest.order_type == "PO_TO_FMCG":
            fmcg_node = "FMCG-PLANT-TX01"
            if fmcg_node in bq_lakehouse.inventory and sku in bq_lakehouse.inventory[fmcg_node]:
                item = bq_lakehouse.inventory[fmcg_node][sku]
                item["on_hand"] = max(0, item["on_hand"] - units)
                item["atp_surplus"] = max(0, item["on_hand"] - item["safety_buffer"])
        else:
            donor = manifest.selected_donor_dc
            if donor in bq_lakehouse.inventory and sku in bq_lakehouse.inventory[donor]:
                item = bq_lakehouse.inventory[donor][sku]
                item["on_hand"] = max(0, item["on_hand"] - units)
                item["atp_surplus"] = max(0, item["on_hand"] - item["safety_buffer"])

        # Credit inbound/reserved stock at target store
        if store_id in bq_lakehouse.inventory and sku in bq_lakehouse.inventory[store_id]:
            s_item = bq_lakehouse.inventory[store_id][sku]
            s_item["reserved"] = s_item.get("reserved", 0) + units

        bq_lakehouse.orders.append(
            {
                "order_id": manifest.fmcg_purchase_order_id or manifest.sap_transfer_order_id,
                "order_type": manifest.order_type,
                "source_node": manifest.selected_donor_dc,
                "target_store": manifest.target_store,
                "sku_id": sku,
                "units": units,
                "freight_cost": manifest.estimated_freight_cost,
                "total_commitment": manifest.total_financial_commitment,
                "signal_source": manifest.signal_source,
                "created_at": str(manifest.created_at),
            }
        )

    async def approve_transfer(self, req: ApprovalDecisionRequest) -> Dict[str, Any]:
        """Forward human approval to RemoteA2aAgent (Port 8001) and finalize SAP STO or FMCG PO."""
        a2a_result: Dict[str, Any] = {}
        item = self.pending_approvals.get(req.event_id)
        manifest_snapshot = item.get("manifest", {}) if item else {}

        try:
            async with httpx.AsyncClient(timeout=3.5) as client:
                resp = await client.post(
                    f"{self.a2a_base_url}/",
                    json={
                        "id": req.event_id,
                        "params": {
                            "action": "approve",
                            "event_id": req.event_id,
                            "approver_name": req.approver_name,
                            "purpose": f"VP Approved Event {req.event_id}",
                            "amount": manifest_snapshot.get("total_financial_commitment", 17672.0),
                            "sku_id": manifest_snapshot.get("sku_id", "SKU-4089-HYDRATE"),
                            "donor_dc": manifest_snapshot.get("selected_donor_dc", "FMCG-PLANT-TX01"),
                            "target_store": manifest_snapshot.get("target_store", "STORE-HOU-05"),
                            "units": manifest_snapshot.get("units_transferred", 1800),
                        },
                    },
                )
                if resp.status_code == 200:
                    a2a_result = resp.json().get("result", {})
        except Exception:
            pass

        if item:
            event_data = item["event"]
            event = MarketSignalEvent(**event_data)
            manifest = await self.supervisor.run_resolution_cycle(
                event=event,
                has_human_approval=req.approved,
                approver_token=f"SIG-{req.approver_name[:4].upper()}-{req.signed_at.strftime('%H%M%S')}",
            )
            manifest.agent_engine_resource_id = self.agent_engine_resource_id
            manifest.remote_executed = True

            order_id = (
                a2a_result.get("sap_transfer_order_id")
                or manifest.fmcg_purchase_order_id
                or manifest.sap_transfer_order_id
                or "PO-FMCG-99812"
            )
            if manifest.order_type == "PO_TO_FMCG":
                manifest.fmcg_purchase_order_id = order_id
            else:
                manifest.sap_transfer_order_id = order_id

            if req.approved:
                self.pending_approvals.pop(req.event_id, None)
                for k in list(self.pending_approvals.keys()):
                    if self.pending_approvals[k].get("manifest", {}).get("target_store") == manifest.target_store:
                        self.pending_approvals.pop(k, None)
                self._apply_inventory_change(manifest)

            audit_entry = {
                "event_id": manifest.event_id,
                "timestamp": str(manifest.created_at),
                "signal_source": manifest.signal_source,
                "store_id": manifest.target_store,
                "sku_id": manifest.sku_id,
                "observed_velocity": event.observed_velocity,
                "root_cause_explanation": f"[VP A2A APPROVED] {manifest.root_cause_explanation}",
                "selected_donor_dc": manifest.selected_donor_dc,
                "order_type": manifest.order_type,
                "units_transferred": manifest.units_transferred,
                "freight_mode": manifest.freight_mode,
                "carrier_name": manifest.carrier_name,
                "estimated_freight_cost": manifest.estimated_freight_cost,
                "gate_status": "APPROVED",
                "requires_human_approval": True,
                "approver_name": f"{req.approver_name} (RemoteA2aAgent Sign-Off)",
                "sap_transfer_order_id": order_id,
                "agent_engine_resource_id": self.agent_engine_resource_id,
            }
            self.audit_records.append(audit_entry)
            bq_lakehouse.record_audit_entry_async(audit_entry)

            result_dict = manifest.model_dump(mode="json")
            result_dict["erp_transfer_order_id"] = order_id
            result_dict["a2a_agent_response"] = a2a_result
            self.last_manifest = result_dict
            return result_dict

        fallback_order_id = a2a_result.get("sap_transfer_order_id", "PO-FMCG-99812")
        return {
            "event_id": req.event_id,
            "gate_status": "APPROVED",
            "erp_transfer_order_id": fallback_order_id,
            "a2a_agent_response": a2a_result,
            "agent_engine_resource_id": self.agent_engine_resource_id,
        }


twin_service = DigitalTwinService()
