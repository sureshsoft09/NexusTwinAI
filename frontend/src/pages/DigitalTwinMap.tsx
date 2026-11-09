import React, { useState, useEffect } from 'react';
import {
  MapPin,
  Warehouse,
  Truck,
  AlertTriangle,
  CheckCircle,
  Factory,
  Store,
  Zap,
  CloudSun,
  MessageSquare,
  Play,
  ArrowRight,
  ShieldAlert,
} from 'lucide-react';
import { INITIAL_DCS, INITIAL_STORES, FMCG_PLANT } from '../store/twinStore';

interface DigitalTwinMapProps {
  onOpenApprovals?: () => void;
}

const DEFAULT_INVENTORY: Record<string, { on_hand: number; safety_buffer: number; atp_surplus: number; current_velocity?: number; burn_rate_base?: number; reserved?: number }> = {
  'FMCG-PLANT-TX01': { on_hand: 50000, safety_buffer: 5000, atp_surplus: 45000 },
  'DC-ATX-02': { on_hand: 4800, safety_buffer: 1200, atp_surplus: 3600 },
  'DC-HOU-01': { on_hand: 1680, safety_buffer: 1500, atp_surplus: 180 },
  'DC-SAT-03': { on_hand: 2500, safety_buffer: 900, atp_surplus: 1600 },
  'STORE-DAL-04': { on_hand: 180, safety_buffer: 250, atp_surplus: 0, current_velocity: 215.0, burn_rate_base: 48.0, reserved: 0 },
  'STORE-HOU-05': { on_hand: 140, safety_buffer: 250, atp_surplus: 0, current_velocity: 230.0, burn_rate_base: 52.0, reserved: 0 },
  'STORE-PLANO-07': { on_hand: 520, safety_buffer: 220, atp_surplus: 300, current_velocity: 42.0, burn_rate_base: 40.0, reserved: 0 },
  'STORE-ARL-11': { on_hand: 310, safety_buffer: 240, atp_surplus: 70, current_velocity: 165.0, burn_rate_base: 44.0, reserved: 0 },
  'STORE-FW-02': { on_hand: 640, safety_buffer: 250, atp_surplus: 390, current_velocity: 44.0, burn_rate_base: 42.0, reserved: 0 },
  'STORE-SAT-06': { on_hand: 590, safety_buffer: 200, atp_surplus: 390, current_velocity: 39.0, burn_rate_base: 38.0, reserved: 0 },
};

export const DigitalTwinMap: React.FC<DigitalTwinMapProps> = ({ onOpenApprovals }) => {
  const [selectedNode, setSelectedNode] = useState<string>('STORE-DAL-04');
  const [inventory, setInventory] = useState(DEFAULT_INVENTORY);
  const [activeScenario, setActiveScenario] = useState<string>('shop1_pos_dc_replenish');
  const [runningScenario, setRunningScenario] = useState<string | null>(null);
  const [agentResourceId, setAgentResourceId] = useState<string>(
    'projects/311231946335/locations/us-central1/reasoningEngines/6418419193229606912'
  );
  const [customPrompt, setCustomPrompt] = useState<string>('');
  const [queryingAgent, setQueryingAgent] = useState<boolean>(false);
  const [lastDecision, setLastDecision] = useState<any>({
    event_id: 'evt_shop1_pos_dc_sto',
    order_type: 'STO_FROM_DC',
    signal_source: 'POS_SCANNER',
    target_store: 'STORE-DAL-04',
    selected_donor_dc: 'DC-ATX-02',
    units_transferred: 1500,
    freight_mode: 'LATERAL_GROUND_TRANSFER',
    carrier_name: 'Texas Fleet Logistics (Dedicated)',
    estimated_freight_cost: 750.0,
    total_financial_commitment: 750.0,
    gate_status: 'APPROVED',
    requires_human_approval: false,
    sap_transfer_order_id: 'STO-SAP-99214',
    agent_engine_resource_id: 'projects/311231946335/locations/us-central1/reasoningEngines/6418419193229606912',
    remote_executed: true,
    root_cause_explanation:
      '[FAST POS SCANNER SURGE] Checkout velocity for SKU-4089-HYDRATE at Shop 1 (STORE-DAL-04) spiked to 215.0 u/hr (+348% over baseline). Serving Austin DC (DC-ATX-02) has 3,600 ATP surplus units -> Auto-dispatched Internal STO.',
  });

  const fetchTwinState = async () => {
    try {
      const res = await fetch('/api/v1/twin/state');
      if (res.ok) {
        const data = await res.json();
        if (data.agent_engine_resource_id) {
          setAgentResourceId(data.agent_engine_resource_id);
        }
        if (data.inventory) {
          const flatInv: any = { ...DEFAULT_INVENTORY };
          Object.keys(data.inventory).forEach((nodeId) => {
            const skuData = data.inventory[nodeId]?.['SKU-4089-HYDRATE'];
            if (skuData) {
              flatInv[nodeId] = {
                ...flatInv[nodeId],
                ...skuData,
                atp_surplus: skuData.atp_surplus ?? Math.max(0, (skuData.on_hand || 0) - (skuData.safety_buffer || 0)),
              };
            }
          });
          setInventory(flatInv);
        }
        if (data.last_manifest) {
          setLastDecision(data.last_manifest);
        }
      }
    } catch {
      // Fallback to local state if backend not running
    }
  };

  useEffect(() => {
    fetchTwinState();
  }, []);

  const handleDirectAgentQuery = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customPrompt.trim() || queryingAgent) return;
    setQueryingAgent(true);
    try {
      const res = await fetch('/api/v1/signals/query-agent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: customPrompt, user_id: 'supply_chain_planner_01' }),
      });
      if (res.ok) {
        const data = await res.json();
        setLastDecision((prev: any) => ({
          ...prev,
          agent_engine_resource_id: data.agent_engine_resource_id || agentResourceId,
          vertex_session_id: data.vertex_session_id,
          remote_executed: data.remote_executed,
          agent_response_text: data.response_text,
          step_events: data.step_events || [],
          root_cause_explanation: data.response_text || prev.root_cause_explanation,
        }));
        await fetchTwinState();
      }
    } catch {
      // Ignore error
    } finally {
      setQueryingAgent(false);
    }
  };

  const triggerScenario = async (scenarioKey: string, focusStore: string) => {
    setRunningScenario(scenarioKey);
    setActiveScenario(scenarioKey);
    setSelectedNode(focusStore);
    try {
      const res = await fetch(`/api/v1/signals/scenario/${scenarioKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      if (res.ok) {
        const manifest = await res.json();
        setLastDecision(manifest);
        await fetchTwinState();
      } else {
        applyLocalFallbackScenario(scenarioKey);
      }
    } catch {
      applyLocalFallbackScenario(scenarioKey);
    } finally {
      setRunningScenario(null);
    }
  };

  const applyLocalFallbackScenario = (scenarioKey: string) => {
    if (scenarioKey === 'shop1_pos_dc_replenish') {
      setLastDecision({
        event_id: 'evt_shop1_pos_dc_sto',
        order_type: 'STO_FROM_DC',
        signal_source: 'POS_SCANNER',
        target_store: 'STORE-DAL-04',
        selected_donor_dc: 'DC-ATX-02',
        units_transferred: 1500,
        freight_mode: 'LATERAL_GROUND_TRANSFER',
        carrier_name: 'Texas Fleet Logistics (Dedicated)',
        estimated_freight_cost: 750.0,
        total_financial_commitment: 750.0,
        gate_status: 'APPROVED',
        requires_human_approval: false,
        sap_transfer_order_id: 'STO-SAP-88412',
        root_cause_explanation:
          '[FAST POS SCANNER SURGE] Shop 1 (STORE-DAL-04) POS velocity spiked to 215 u/hr (+348%). Serving DC (DC-ATX-02) has 3,600 ATP surplus -> Auto-executed Internal Stock Transfer Order (STO).',
      });
    } else if (scenarioKey === 'shop2_dc_shortage_fmcg_po') {
      setLastDecision({
        event_id: 'evt_shop2_fmcg_po_hitl',
        order_type: 'PO_TO_FMCG',
        signal_source: 'POS_SCANNER',
        target_store: 'STORE-HOU-05',
        selected_donor_dc: 'FMCG-PLANT-TX01 (via DC-HOU-01)',
        units_transferred: 1800,
        freight_mode: 'FMCG_DIRECT_EXPEDITED_PO',
        carrier_name: 'HydroBoost Cold-Chain Direct Carrier (FMCG PO)',
        estimated_freight_cost: 1850.0,
        fmcg_po_merchandise_cost: 15822.0,
        total_financial_commitment: 17672.0,
        gate_status: 'REFERRED_TO_HUMAN',
        requires_human_approval: true,
        sap_transfer_order_id: null,
        root_cause_explanation:
          '[POS SURGE + DC SHORTAGE] Shop 2 (STORE-HOU-05) surged to 230 u/hr, needing 1,800 units. Serving Houston DC (DC-HOU-01) has only 180 ATP surplus above safety buffer! Escalated upstream to HydroBoost FMCG Bottling Plant (FMCG-PLANT-TX01) via External PO ($17,672 total / $1,850 freight > $1,000 limit) -> Routed to RemoteA2aAgent HITL Queue.',
      });
    } else if (scenarioKey === 'shop3_weather_25day_prediction') {
      setLastDecision({
        event_id: 'evt_shop3_weather_25d',
        order_type: 'STO_FROM_DC',
        signal_source: 'WEATHER_FORECAST_25D',
        target_store: 'STORE-PLANO-07',
        selected_donor_dc: 'DC-ATX-02',
        units_transferred: 1500,
        freight_mode: 'SCHEDULED_ECONOMY_PREPOSITION',
        carrier_name: 'Texas Rail & Ground Economy (25-Day Pre-Position)',
        estimated_freight_cost: 480.0,
        total_financial_commitment: 480.0,
        gate_status: 'APPROVED',
        requires_human_approval: false,
        sap_transfer_order_id: 'STO-SAP-25D91',
        root_cause_explanation:
          '[25-DAY WEATHER API PREDICTION] Open-Meteo & Ensemble Weather API detected a 104.2°F Extreme Heat Dome arriving at Shop 3 (STORE-PLANO-07) in T+25 Days. System predicted +220% beverage spike and pre-positioned 1,500 units via low-cost economy ground ($480 vs $3,500 emergency air).',
      });
    } else if (scenarioKey === 'shop4_social_media_event_spike') {
      setLastDecision({
        event_id: 'evt_shop4_social_event',
        order_type: 'STO_FROM_DC',
        signal_source: 'SOCIAL_MEDIA_MONITOR',
        target_store: 'STORE-ARL-11',
        selected_donor_dc: 'DC-SAT-03',
        units_transferred: 1200,
        freight_mode: 'LATERAL_GROUND_TRANSFER',
        carrier_name: 'Alamo Regional Dedicated Express',
        estimated_freight_cost: 680.0,
        total_financial_commitment: 680.0,
        gate_status: 'APPROVED',
        requires_human_approval: false,
        sap_transfer_order_id: 'STO-SAP-SOC44',
        root_cause_explanation:
          '[SOCIAL MEDIA & FORUM MONITOR] Reddit (r/arlington) & X viral buzz (Score 94.5/100) identified 18,500 runners at Arlington Stadium Charity Marathon within 1.2 mi of Shop 4 (STORE-ARL-11). Auto-dispatched 1,200 units from San Antonio DC (DC-SAT-03).',
      });
    }
  };

  const selectedStoreObj = INITIAL_STORES.find((s) => s.id === selectedNode);
  const selectedDcObj = INITIAL_DCS.find((d) => d.id === selectedNode);
  const nodeInv = inventory[selectedNode] || DEFAULT_INVENTORY['STORE-DAL-04'];

  return (
    <div className="h-full flex flex-col p-6 space-y-5 overflow-y-auto">
      {/* Top Header + 4-Act Demo Scenario Trigger Bar */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-slate-900/70 border border-slate-800 rounded-xl p-4">
        <div>
          <div className="flex items-center space-x-2">
            <h1 className="text-lg font-bold tracking-tight text-white">
              Enterprise Multi-Echelon Digital Twin (SKU-4089-HYDRATE)
            </h1>
            <span className="text-[10px] bg-teal-500/20 text-teal-300 border border-teal-500/30 px-2 py-0.5 rounded font-semibold">
              1 FMCG Plant • 3 DCs • 6 Retail Stores
            </span>
            <span className="text-[10px] font-mono bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 px-2 py-0.5 rounded">
              Agent Engine: {agentResourceId.split('/').slice(-2).join('/')}
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-0.5">
            Click any of the 4 Live Demo Flows below to invoke Vertex AI Agent Engine ({agentResourceId}), Cloud Run MCP Servers, and 4-Rule Governance:
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => triggerScenario('shop1_pos_dc_replenish', 'STORE-DAL-04')}
            disabled={runningScenario !== null}
            className={`flex items-center space-x-1.5 text-xs px-3 py-2 rounded-lg border font-medium transition cursor-pointer ${
              activeScenario === 'shop1_pos_dc_replenish'
                ? 'bg-teal-500/20 border-teal-400 text-teal-200 shadow-sm'
                : 'bg-slate-950 border-slate-800 text-slate-300 hover:border-teal-500/50'
            }`}
          >
            <Zap className="h-3.5 w-3.5 text-teal-400" />
            <span>1. Shop 1 POS $\rightarrow$ DC STO</span>
          </button>

          <button
            onClick={() => triggerScenario('shop2_dc_shortage_fmcg_po', 'STORE-HOU-05')}
            disabled={runningScenario !== null}
            className={`flex items-center space-x-1.5 text-xs px-3 py-2 rounded-lg border font-medium transition cursor-pointer ${
              activeScenario === 'shop2_dc_shortage_fmcg_po'
                ? 'bg-amber-500/20 border-amber-400 text-amber-200 shadow-sm'
                : 'bg-slate-950 border-slate-800 text-slate-300 hover:border-amber-500/50'
            }`}
          >
            <Factory className="h-3.5 w-3.5 text-amber-400" />
            <span>2. Shop 2 DC Short $\rightarrow$ FMCG PO</span>
          </button>

          <button
            onClick={() => triggerScenario('shop3_weather_25day_prediction', 'STORE-PLANO-07')}
            disabled={runningScenario !== null}
            className={`flex items-center space-x-1.5 text-xs px-3 py-2 rounded-lg border font-medium transition cursor-pointer ${
              activeScenario === 'shop3_weather_25day_prediction'
                ? 'bg-blue-500/20 border-blue-400 text-blue-200 shadow-sm'
                : 'bg-slate-950 border-slate-800 text-slate-300 hover:border-blue-500/50'
            }`}
          >
            <CloudSun className="h-3.5 w-3.5 text-blue-400" />
            <span>3. Shop 3 Weather (T+25d)</span>
          </button>

          <button
            onClick={() => triggerScenario('shop4_social_media_event_spike', 'STORE-ARL-11')}
            disabled={runningScenario !== null}
            className={`flex items-center space-x-1.5 text-xs px-3 py-2 rounded-lg border font-medium transition cursor-pointer ${
              activeScenario === 'shop4_social_media_event_spike'
                ? 'bg-purple-500/20 border-purple-400 text-purple-200 shadow-sm'
                : 'bg-slate-950 border-slate-800 text-slate-300 hover:border-purple-500/50'
            }`}
          >
            <MessageSquare className="h-3.5 w-3.5 text-purple-400" />
            <span>4. Shop 4 Social Event</span>
          </button>
        </div>
      </div>

      {/* Main Grid: 3-Tier Network Topology (Left 2 Cols) + Node & Decision Inspector (Right 1 Col) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 flex-1">
        {/* Left 2 Columns: Full 3-Tier Supply Chain Topology (1 FMCG -> 3 DCs -> 6 Retail Stores) */}
        <div className="lg:col-span-2 bg-slate-900/60 border border-slate-800 rounded-xl p-5 flex flex-col justify-between space-y-5">
          {/* Tier 1: Upstream FMCG Manufacturer Plant */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wider text-amber-400 flex items-center space-x-1.5">
                <Factory className="h-3.5 w-3.5" />
                <span>Tier 1: Upstream FMCG Manufacturer (External PO Source when DCs Lack Stock)</span>
              </span>
              <span className="text-[10px] font-mono text-slate-400">EDI 850 / FastMCP :8081</span>
            </div>

            <button
              onClick={() => setSelectedNode(FMCG_PLANT.id)}
              className={`w-full p-3.5 rounded-xl border text-left transition flex flex-col md:flex-row md:items-center justify-between gap-2 cursor-pointer ${
                selectedNode === FMCG_PLANT.id || lastDecision?.order_type === 'PO_TO_FMCG'
                  ? 'bg-amber-500/15 border-amber-400 text-amber-200 shadow-lg shadow-amber-500/10'
                  : 'bg-slate-950 border-slate-800 text-slate-300 hover:border-slate-700'
              }`}
            >
              <div className="flex items-center space-x-3">
                <div className="p-2 rounded-lg bg-amber-500/20 border border-amber-500/40 text-amber-300">
                  <Factory className="h-5 w-5" />
                </div>
                <div>
                  <div className="flex items-center space-x-2">
                    <span className="font-bold text-xs text-white">{FMCG_PLANT.id} — {FMCG_PLANT.name}</span>
                    {lastDecision?.order_type === 'PO_TO_FMCG' && (
                      <span className="text-[10px] bg-amber-500 text-slate-950 font-bold px-2 py-0.5 rounded-full">
                        ACTIVE EXTERNAL PO ({lastDecision.units_transferred} units)
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-slate-400">
                    Waco, TX • Wholesale Cost: <strong>$8.79/unit</strong> • MOQ: 1,000 units • Direct Cold-Chain SLA: 12h
                  </p>
                </div>
              </div>
              <div className="text-right font-mono text-xs">
                <div className="text-emerald-400 font-bold">
                  ATP: {(inventory['FMCG-PLANT-TX01']?.atp_surplus ?? 45000).toLocaleString()} units
                </div>
                <div className="text-[10px] text-slate-400">
                  On-Hand: {(inventory['FMCG-PLANT-TX01']?.on_hand ?? 50000).toLocaleString()} u
                </div>
              </div>
            </button>
          </div>

          {/* Tier 2: 3 Regional Distribution Centers (DCs) */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wider text-teal-400 flex items-center space-x-1.5">
                <Warehouse className="h-3.5 w-3.5" />
                <span>Tier 2: Regional Distribution Centers (3 DCs) — Internal STO Fulfillment</span>
              </span>
              <span className="text-[10px] font-mono text-slate-400">SAP S/4HANA ATP Check</span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {INITIAL_DCS.map((dc) => {
                const dcInv = inventory[dc.id] || DEFAULT_INVENTORY[dc.id];
                const isLowAtp = dcInv.atp_surplus < 500;
                const isSelected = selectedNode === dc.id;
                const isActiveDonor = lastDecision?.selected_donor_dc?.includes(dc.id);

                return (
                  <button
                    key={dc.id}
                    onClick={() => setSelectedNode(dc.id)}
                    className={`p-3 rounded-xl border text-left transition cursor-pointer ${
                      isSelected
                        ? 'bg-teal-500/20 border-teal-400 shadow-lg shadow-teal-500/10'
                        : isActiveDonor
                        ? 'bg-slate-900 border-teal-500/50'
                        : 'bg-slate-950 border-slate-800 hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-xs text-white flex items-center space-x-1.5">
                        <Warehouse className={`h-4 w-4 ${isLowAtp ? 'text-amber-400' : 'text-teal-400'}`} />
                        <span>{dc.id}</span>
                      </span>
                      <span
                        className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${
                          isLowAtp
                            ? 'bg-red-500/20 text-red-300 border border-red-500/30'
                            : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                        }`}
                      >
                        {isLowAtp ? 'LOW ATP (SHORT)' : 'HEALTHY ATP'}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-400 mt-1 truncate">{dc.name}</p>
                    <div className="mt-2 pt-2 border-t border-slate-800/80 flex justify-between text-[11px] font-mono">
                      <span className="text-slate-400">On-Hand: {dcInv.on_hand.toLocaleString()}</span>
                      <span className={isLowAtp ? 'text-red-400 font-bold' : 'text-emerald-400 font-bold'}>
                        ATP: {dcInv.atp_surplus.toLocaleString()}
                      </span>
                    </div>
                    <div className="text-[10px] text-slate-500 font-mono mt-0.5">
                      Safety Buffer: {dcInv.safety_buffer.toLocaleString()} units
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Tier 3: 6 Retail Stores */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wider text-blue-400 flex items-center space-x-1.5">
                <Store className="h-3.5 w-3.5" />
                <span>Tier 3: Retail Store Network (6 Stores) — POS, Weather (T+25d) &amp; Social Signals</span>
              </span>
              <span className="text-[10px] font-mono text-slate-400">Click any store to inspect</span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {INITIAL_STORES.map((store) => {
                const stInv = inventory[store.id] || DEFAULT_INVENTORY[store.id];
                const isSelected = selectedNode === store.id;
                const isTarget = lastDecision?.target_store === store.id;

                let badgeText = 'HEALTHY BASELINE';
                let badgeClass = 'bg-slate-800 text-slate-300';
                if (store.id === 'STORE-DAL-04') {
                  badgeText = 'POS SURGE -> DC STO';
                  badgeClass = 'bg-red-500/20 text-red-300 border border-red-500/30';
                } else if (store.id === 'STORE-HOU-05') {
                  badgeText = 'DC SHORT -> FMCG PO';
                  badgeClass = 'bg-amber-500/20 text-amber-300 border border-amber-500/30';
                } else if (store.id === 'STORE-PLANO-07') {
                  badgeText = 'T+25D HEATWAVE API';
                  badgeClass = 'bg-blue-500/20 text-blue-300 border border-blue-500/30';
                } else if (store.id === 'STORE-ARL-11') {
                  badgeText = 'SOCIAL EVENT SPIKE';
                  badgeClass = 'bg-purple-500/20 text-purple-300 border border-purple-500/30';
                }

                return (
                  <button
                    key={store.id}
                    onClick={() => setSelectedNode(store.id)}
                    className={`p-3 rounded-xl border text-left transition cursor-pointer ${
                      isSelected
                        ? 'bg-blue-500/15 border-blue-400 shadow-lg shadow-blue-500/10'
                        : isTarget
                        ? 'bg-slate-900 border-teal-400/60'
                        : 'bg-slate-950 border-slate-800 hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-1">
                      <span className="font-bold text-xs text-white truncate">{store.name}</span>
                    </div>
                    <div className="mt-1 flex items-center justify-between">
                      <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${badgeClass}`}>{badgeText}</span>
                      <span className="text-[10px] font-mono text-slate-400">DC: {store.serving_dc}</span>
                    </div>
                    <div className="mt-2 pt-2 border-t border-slate-800/80 flex justify-between text-[11px] font-mono">
                      <span className="text-slate-300">Stock: {stInv.on_hand} u</span>
                      <span
                        className={
                          (stInv.current_velocity || 45) > 100 ? 'text-red-400 font-bold' : 'text-emerald-400'
                        }
                      >
                        {stInv.current_velocity || 42} u/hr
                      </span>
                    </div>
                    {stInv.reserved ? (
                      <div className="text-[10px] font-mono text-teal-300 mt-0.5">
                        +{stInv.reserved} units inbound
                      </div>
                    ) : null}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Right Column: Active Swarm Resolution & Node Telemetry Inspector */}
        <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-5 flex flex-col justify-between space-y-4">
          <div className="space-y-4">
            <div className="border-b border-slate-800 pb-3 flex items-center justify-between">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-300">
                Active ADK Swarm Resolution
              </h2>
              <span
                className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                  lastDecision?.order_type === 'PO_TO_FMCG'
                    ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                    : 'bg-teal-500/20 text-teal-300 border-teal-500/40'
                }`}
              >
                {lastDecision?.order_type === 'PO_TO_FMCG' ? 'EXTERNAL FMCG PO' : 'INTERNAL DC STO'}
              </span>
            </div>

            {/* Active Scenario Outcome Box */}
            <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800 space-y-2.5 text-xs">
              <div className="flex justify-between items-center">
                <span className="text-slate-400">Signal Source</span>
                <span className="font-mono font-bold text-teal-300">{lastDecision?.signal_source}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-400">Target Store</span>
                <span className="font-mono font-bold text-white">{lastDecision?.target_store}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-400">Fulfillment Source</span>
                <span className="font-mono text-amber-300 font-semibold">{lastDecision?.selected_donor_dc}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-400">Order Volume</span>
                <span className="font-mono text-white font-bold">
                  {lastDecision?.units_transferred?.toLocaleString()} units
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-400">Freight Cost</span>
                <span className="font-mono text-emerald-400 font-bold">
                  ${lastDecision?.estimated_freight_cost?.toLocaleString()}
                </span>
              </div>
              {lastDecision?.fmcg_po_merchandise_cost > 0 && (
                <div className="flex justify-between items-center">
                  <span className="text-slate-400">FMCG Merchandise ($8.79/u)</span>
                  <span className="font-mono text-amber-300 font-bold">
                    ${lastDecision?.fmcg_po_merchandise_cost?.toLocaleString()}
                  </span>
                </div>
              )}
              <div className="flex justify-between items-center border-t border-slate-800 pt-2">
                <span className="text-slate-400">Feasibility Gate Status</span>
                <span
                  className={`font-mono font-bold ${
                    lastDecision?.requires_human_approval ? 'text-amber-400' : 'text-emerald-400'
                  }`}
                >
                  {lastDecision?.gate_status}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-400">ERP / FMCG Order ID</span>
                <span className="font-mono text-teal-300 font-bold">
                  {lastDecision?.fmcg_purchase_order_id ||
                    lastDecision?.sap_transfer_order_id ||
                    'AWAITING_A2A_HITL'}
                </span>
              </div>
            </div>

            {/* Root Cause & Live Vertex AI Agent Engine Output Box */}
            <div className="p-3 bg-slate-950/90 border border-slate-800 rounded-xl text-xs space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-teal-300">
                  Vertex AI Agent Engine Reasoning Trace:
                </span>
                <span className="text-[10px] font-mono text-emerald-400">
                  {lastDecision?.vertex_session_id
                    ? `Session: ${String(lastDecision.vertex_session_id).slice(0, 12)}`
                    : 'Live ADK Swarm'}
                </span>
              </div>
              <p className="text-slate-300 leading-relaxed text-[11px] whitespace-pre-line max-h-40 overflow-y-auto">
                {lastDecision?.agent_response_text || lastDecision?.root_cause_explanation}
              </p>
              {lastDecision?.step_events && lastDecision.step_events.length > 0 && (
                <div className="pt-2 border-t border-slate-800/80 space-y-1">
                  <span className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold block">
                    Remote Agent Engine Step Events ({lastDecision.step_events.length}):
                  </span>
                  <div className="max-h-28 overflow-y-auto space-y-1">
                    {lastDecision.step_events.map((st: any, i: number) => (
                      <div key={i} className="text-[10px] font-mono text-slate-400 bg-slate-900/80 px-2 py-1 rounded">
                        <span className="text-teal-400 font-semibold">[{st.agent}]</span>{' '}
                        {st.tools && st.tools.length > 0 ? `Tools: ${st.tools.join(', ')}` : st.phase}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Direct Prompt Input for Deployed Agent Engine */}
            <form onSubmit={handleDirectAgentQuery} className="flex items-center gap-2">
              <input
                type="text"
                value={customPrompt}
                onChange={(e) => setCustomPrompt(e.target.value)}
                placeholder="Ask deployed Agent Engine (6418419193229606912)..."
                className="flex-1 bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-teal-500"
              />
              <button
                type="submit"
                disabled={queryingAgent || runningScenario !== null}
                className="px-3 py-1.5 rounded-lg bg-teal-500 hover:bg-teal-400 text-slate-950 font-bold text-xs transition disabled:opacity-50 cursor-pointer"
              >
                {queryingAgent ? 'Querying...' : 'Ask Agent'}
              </button>
            </form>

            {lastDecision?.requires_human_approval && onOpenApprovals && (
              <button
                onClick={onOpenApprovals}
                className="w-full py-2.5 px-3 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs flex items-center justify-center space-x-2 transition cursor-pointer shadow-lg shadow-amber-500/10"
              >
                <ShieldAlert className="h-4 w-4" />
                <span>Open RemoteA2aAgent Approvals Queue to Sign PO</span>
                <ArrowRight className="h-3.5 w-3.5" />
              </button>
            )}

            {/* Selected Node Inspector */}
            <div className="border-t border-slate-800 pt-3 space-y-2 text-xs">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 block">
                Selected Node Telemetry: <strong className="text-white">{selectedNode}</strong>
              </span>
              <div className="bg-slate-950 p-3 rounded-lg border border-slate-800 space-y-1.5">
                <div className="flex justify-between">
                  <span className="text-slate-400">Node Name</span>
                  <span className="text-white font-medium">
                    {selectedStoreObj?.name || selectedDcObj?.name || FMCG_PLANT.name}
                  </span>
                </div>
                {selectedStoreObj && (
                  <div className="flex justify-between">
                    <span className="text-slate-400">Primary Serving DC</span>
                    <span className="font-mono text-teal-300">{selectedStoreObj.serving_dc}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-slate-400">On-Hand Stock (SKU-4089)</span>
                  <span className="font-mono text-white font-bold">{nodeInv.on_hand?.toLocaleString()} units</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Safety Stock Buffer</span>
                  <span className="font-mono text-slate-300">{nodeInv.safety_buffer?.toLocaleString()} units</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
