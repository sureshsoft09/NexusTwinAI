import React, { useState, useEffect, useRef } from 'react';
import { apiUrl, wsUrl } from '../apiConfig';
import {
  CheckCircle2,
  Factory,
  Zap,
  CloudSun,
  Users,
  ArrowRight,
  ShieldAlert,
  Package,
  Cpu,
  Calculator,
  Radio,
  ChevronDown,
  ChevronUp,
  Loader2,
  Database,
  Handshake,
  FileJson,
  BellRing,
} from 'lucide-react';

interface DigitalTwinMapProps {
  onOpenApprovals?: () => void;
  onScenarioCompleted?: () => void;
}

type ExecutionPhase =
  | 'IDLE'
  | 'STREAMING_TELEMETRY'
  | 'ALERT_TRIGGERED'
  | 'AGENT_PROCESSING'
  | 'COMMON_OUTPUT_READY'
  | 'GATE_CHECKING'
  | 'COMPLETED';

const CALM_BASELINE_INVENTORY: Record<
  string,
  { on_hand: number; safety_buffer: number; atp_surplus: number; current_velocity?: number; burn_rate_base?: number; reserved?: number }
> = {
  'FMCG-PLANT-TX01': { on_hand: 50000, safety_buffer: 5000, atp_surplus: 45000 },
  'DC-ATX-02': { on_hand: 4800, safety_buffer: 1200, atp_surplus: 3600 },
  'DC-HOU-01': { on_hand: 1680, safety_buffer: 1500, atp_surplus: 180 },
  'DC-SAT-03': { on_hand: 2500, safety_buffer: 900, atp_surplus: 1600 },
  'STORE-DAL-04': { on_hand: 480, safety_buffer: 250, atp_surplus: 230, current_velocity: 48.0, burn_rate_base: 48.0, reserved: 0 },
  'STORE-HOU-05': { on_hand: 460, safety_buffer: 250, atp_surplus: 210, current_velocity: 52.0, burn_rate_base: 52.0, reserved: 0 },
  'STORE-PLANO-07': { on_hand: 520, safety_buffer: 220, atp_surplus: 300, current_velocity: 40.0, burn_rate_base: 40.0, reserved: 0 },
  'STORE-ARL-11': { on_hand: 490, safety_buffer: 240, atp_surplus: 250, current_velocity: 44.0, burn_rate_base: 44.0, reserved: 0 },
  'STORE-FW-02': { on_hand: 640, safety_buffer: 250, atp_surplus: 390, current_velocity: 44.0, burn_rate_base: 42.0, reserved: 0 },
  'STORE-SAT-06': { on_hand: 590, safety_buffer: 200, atp_surplus: 390, current_velocity: 39.0, burn_rate_base: 38.0, reserved: 0 },
};

export const DigitalTwinMap: React.FC<DigitalTwinMapProps> = ({ onOpenApprovals, onScenarioCompleted }) => {
  const [selectedNode, setSelectedNode] = useState<string>('STORE-DAL-04');
  const [inventory, setInventory] = useState(CALM_BASELINE_INVENTORY);
  const [activeScenario, setActiveScenario] = useState<string | null>(null);
  const [phase, setPhase] = useState<ExecutionPhase>('IDLE');
  const [telemetryTickNote, setTelemetryTickNote] = useState<string>('');
  const [liveAlertBanner, setLiveAlertBanner] = useState<string>('');
  const [agentStatusMsg, setAgentStatusMsg] = useState<string>('');
  const [lastDecision, setLastDecision] = useState<any>(null);
  const [showCommonJson, setShowCommonJson] = useState<boolean>(false);
  const [showRawTrace, setShowRawTrace] = useState<boolean>(false);
  const phaseTimersRef = useRef<number[]>([]);

  const clearPhaseTimers = () => {
    phaseTimersRef.current.forEach((id) => window.clearTimeout(id));
    phaseTimersRef.current = [];
  };

  useEffect(() => {
    return () => clearPhaseTimers();
  }, []);

  // Connect to live WebSocket telemetry & agent progress events from backend
  useEffect(() => {
    let ws: WebSocket | null = null;
    try {
      ws = new WebSocket(wsUrl('/api/v1/twin/ws/telemetry'));

      ws.onmessage = (ev) => {
        try {
          const msg = JSON.parse(ev.data);
          if (msg.type === 'TELEMETRY_STREAM_TICK') {
            setPhase('STREAMING_TELEMETRY');
            setTelemetryTickNote(msg.note || '');
            if (msg.store_id) {
              setInventory((prev) => ({
                ...prev,
                [msg.store_id]: {
                  ...(prev[msg.store_id] || CALM_BASELINE_INVENTORY[msg.store_id]),
                  current_velocity: msg.velocity,
                  on_hand: msg.on_hand,
                },
              }));
            }
          } else if (msg.type === 'LIVE_ALERT_NOTIFICATION') {
            setPhase('ALERT_TRIGGERED');
            setLiveAlertBanner(msg.alert_message || '');
          } else if (msg.type === 'MULTI_AGENT_PROCESSING') {
            setPhase('AGENT_PROCESSING');
            setAgentStatusMsg(msg.status_message || 'NexusTwin AI Multi-Agent System analyzing...');
          } else if (msg.type === 'COMMON_AGENT_OUTPUT_READY') {
            setPhase('COMMON_OUTPUT_READY');
            if (msg.common_agent_output) {
              setLastDecision((prev: any) => ({
                ...(prev || {}),
                common_agent_output: msg.common_agent_output,
              }));
            }
          } else if (msg.type === 'GATE_CHECKS_EVALUATED') {
            setPhase('GATE_CHECKING');
            if (msg.gate_evaluation) {
              setLastDecision((prev: any) => ({
                ...(prev || {}),
                gate_evaluation: msg.gate_evaluation,
              }));
            }
          } else if (msg.type === 'DEMO_RESET') {
            clearPhaseTimers();
            setInventory(CALM_BASELINE_INVENTORY);
            setActiveScenario(null);
            setPhase('IDLE');
            setTelemetryTickNote('');
            setLiveAlertBanner('');
            setAgentStatusMsg('');
            setLastDecision(null);
          }
        } catch {
          // ignore parse errors
        }
      };
    } catch {
      // ignore ws errors
    }

    return () => {
      if (ws) ws.close();
    };
  }, []);

  const triggerLiveScenario = async (scenarioKey: string, focusStore: string) => {
    clearPhaseTimers();
    setActiveScenario(scenarioKey);
    setSelectedNode(focusStore);
    setLastDecision(null);
    setPhase('STREAMING_TELEMETRY');
    setTelemetryTickNote('Connecting to live store telemetry feed...');
    setLiveAlertBanner('');
    setAgentStatusMsg('Waiting for telemetry threshold breach...');

    try {
      const res = await fetch(apiUrl(`/api/v1/signals/scenario/${scenarioKey}`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      if (res.ok) {
        const manifest = await res.json();
        setLastDecision(manifest);

        // Sync inventory from backend after resolution
        const stateRes = await fetch(apiUrl('/api/v1/twin/state'));
        if (stateRes.ok) {
          const stateData = await stateRes.json();
          if (stateData.inventory) {
            const flatInv: any = { ...CALM_BASELINE_INVENTORY };
            Object.keys(stateData.inventory).forEach((nodeId) => {
              const skuData = stateData.inventory[nodeId]?.['SKU-4089-HYDRATE'];
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
        }

        // Ensure smooth progression from Common Output -> 4 Gate Checks -> Final Output
        setPhase('COMMON_OUTPUT_READY');
        const t1 = window.setTimeout(() => setPhase('GATE_CHECKING'), 600);
        const t2 = window.setTimeout(() => {
          setPhase('COMPLETED');
          if (onScenarioCompleted) onScenarioCompleted();
        }, 1250);
        phaseTimersRef.current.push(t1, t2);
      }
    } catch {
      setPhase('IDLE');
    }
  };

  const commonOut = lastDecision?.common_agent_output;
  const sensingOut = commonOut?.sensing_agent_output;
  const repOut = commonOut?.replenishment_agent_output;
  const logOut = commonOut?.logistics_agent_output;
  const gateEval = lastDecision?.gate_evaluation;

  const isRunning =
    phase === 'STREAMING_TELEMETRY' || phase === 'ALERT_TRIGGERED' || phase === 'AGENT_PROCESSING';
  const hasCommonOutput =
    (phase === 'COMMON_OUTPUT_READY' || phase === 'GATE_CHECKING' || phase === 'COMPLETED') && Boolean(commonOut);
  const hasGateChecked = (phase === 'GATE_CHECKING' || phase === 'COMPLETED') && Boolean(gateEval);
  const isCompleted = phase === 'COMPLETED' && Boolean(lastDecision);

  const isFactoryPO =
    lastDecision?.order_type === 'PO_TO_FMCG' || repOut?.order_type === 'PO_TO_FMCG';
  const targetStoreId = lastDecision?.target_store || sensingOut?.store_id || selectedNode;
  const targetStoreInv = inventory[targetStoreId] || CALM_BASELINE_INVENTORY['STORE-DAL-04'];
  const unitsTransferred = lastDecision?.units_transferred || repOut?.requested_units || 0;
  const freightCost = lastDecision?.estimated_freight_cost || logOut?.freight_cost_usd || 0;
  const totalCommitment = lastDecision?.total_financial_commitment || logOut?.total_commitment_usd || 0;
  const grossMarginSaved = repOut?.protected_margin_usd || Math.round(unitsTransferred * 6.2);
  const netProfitProtected = Math.round(grossMarginSaved - freightCost);
  const factorySpare = inventory['FMCG-PLANT-TX01']?.atp_surplus ?? 45000;

  // Coordinates for the 3-Tier Swimlane SVG Diagram
  const factoryPos = { x: 460, y: 68 };
  const dcPositions: Record<string, { x: number; y: number; shortName: string; city: string }> = {
    'DC-ATX-02': { x: 190, y: 198, shortName: 'Austin Warehouse', city: 'Austin, TX' },
    'DC-HOU-01': { x: 460, y: 198, shortName: 'Houston Warehouse', city: 'Houston, TX' },
    'DC-SAT-03': { x: 730, y: 198, shortName: 'San Antonio Warehouse', city: 'San Antonio, TX' },
  };
  const storePositions: Record<
    string,
    { x: number; y: number; shopLabel: string; servingDc: string; scenarioKey?: string }
  > = {
    'STORE-DAL-04': { x: 92, y: 348, shopLabel: 'Shop 1: Dallas', servingDc: 'DC-ATX-02', scenarioKey: 'shop1_pos_dc_replenish' },
    'STORE-PLANO-07': { x: 238, y: 348, shopLabel: 'Shop 3: Plano', servingDc: 'DC-ATX-02', scenarioKey: 'shop3_weather_25day_prediction' },
    'STORE-FW-02': { x: 384, y: 348, shopLabel: 'Fort Worth #2', servingDc: 'DC-ATX-02' },
    'STORE-HOU-05': { x: 530, y: 348, shopLabel: 'Shop 2: Houston', servingDc: 'DC-HOU-01', scenarioKey: 'shop2_dc_shortage_fmcg_po' },
    'STORE-ARL-11': { x: 676, y: 348, shopLabel: 'Shop 4: Arlington', servingDc: 'DC-SAT-03', scenarioKey: 'shop4_social_media_event_spike' },
    'STORE-SAT-06': { x: 822, y: 348, shopLabel: 'San Antonio #6', servingDc: 'DC-SAT-03' },
  };

  const activeDonorDcId = hasCommonOutput
    ? isFactoryPO
      ? 'DC-HOU-01'
      : repOut?.serving_dc_id || 'DC-ATX-02'
    : null;

  return (
    <div className="h-full flex flex-col p-5 space-y-4 overflow-y-auto">
      {/* 1. Scenario Stream Launcher Bar (Retail Cerulean & Alabaster Pearl Card) */}
      <div className="bg-white border border-[#DCE4EE] rounded-2xl p-4 shadow-enterprise flex flex-col xl:flex-row xl:items-center justify-between gap-3">
        <div>
          <div className="flex items-center space-x-2">
            <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-[#ECF5FC] text-[#0E5A8A] border border-[#C2DFF3] uppercase tracking-wider">
              Live Telemetry Streamer
            </span>
            <h1 className="font-serif text-sm sm:text-base font-bold text-[#14213D]">
              Start a Live Store Telemetry Stream to Trigger NexusTwin AI Multi-Agent System
            </h1>
          </div>
          <p className="text-xs text-[#526582] mt-0.5">
            Run any scenario below (then click <strong>Reset Demo Stock</strong> in the top bar to reset BigQuery and run the next scenario):
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 shrink-0">
          <button
            onClick={() => triggerLiveScenario('shop1_pos_dc_replenish', 'STORE-DAL-04')}
            disabled={isRunning}
            className={`flex items-center space-x-2 text-left text-xs px-3 py-2 rounded-xl border font-semibold transition cursor-pointer disabled:opacity-60 ${
              activeScenario === 'shop1_pos_dc_replenish'
                ? 'bg-[#0E5A8A] border-[#0E5A8A] text-white shadow-sm'
                : 'bg-[#F5F8FC] border-[#DCE4EE] text-[#14213D] hover:bg-[#ECF5FC] hover:border-[#C2DFF3]'
            }`}
          >
            <Zap className={`h-4 w-4 shrink-0 ${activeScenario === 'shop1_pos_dc_replenish' ? 'text-[#FEF3C7]' : 'text-[#0E5A8A]'}`} />
            <div>
              <div className="font-bold">1. Run Shop 1 POS Stream</div>
              <div className={`text-[10px] ${activeScenario === 'shop1_pos_dc_replenish' ? 'text-[#D6EAF8]' : 'text-[#526582]'}`}>
                Dallas Checkout Surge
              </div>
            </div>
          </button>

          <button
            onClick={() => triggerLiveScenario('shop2_dc_shortage_fmcg_po', 'STORE-HOU-05')}
            disabled={isRunning}
            className={`flex items-center space-x-2 text-left text-xs px-3 py-2 rounded-xl border font-semibold transition cursor-pointer disabled:opacity-60 ${
              activeScenario === 'shop2_dc_shortage_fmcg_po'
                ? 'bg-[#C27803] border-[#C27803] text-white shadow-sm'
                : 'bg-[#F5F8FC] border-[#DCE4EE] text-[#14213D] hover:bg-[#FFFBEB] hover:border-[#FDE68A]'
            }`}
          >
            <Factory className={`h-4 w-4 shrink-0 ${activeScenario === 'shop2_dc_shortage_fmcg_po' ? 'text-white' : 'text-[#C27803]'}`} />
            <div>
              <div className="font-bold">2. Run Shop 2 POS Stream</div>
              <div className={`text-[10px] ${activeScenario === 'shop2_dc_shortage_fmcg_po' ? 'text-[#FEF3C7]' : 'text-[#526582]'}`}>
                DC Shortage &rarr; Factory PO
              </div>
            </div>
          </button>

          <button
            onClick={() => triggerLiveScenario('shop3_weather_25day_prediction', 'STORE-PLANO-07')}
            disabled={isRunning}
            className={`flex items-center space-x-2 text-left text-xs px-3 py-2 rounded-xl border font-semibold transition cursor-pointer disabled:opacity-60 ${
              activeScenario === 'shop3_weather_25day_prediction'
                ? 'bg-[#C93B2B] border-[#C93B2B] text-white shadow-sm'
                : 'bg-[#F5F8FC] border-[#DCE4EE] text-[#14213D] hover:bg-[#FDF2F2] hover:border-[#F8CACA]'
            }`}
          >
            <CloudSun className={`h-4 w-4 shrink-0 ${activeScenario === 'shop3_weather_25day_prediction' ? 'text-[#FEF3C7]' : 'text-[#C93B2B]'}`} />
            <div>
              <div className="font-bold">3. Run 25d Weather Stream</div>
              <div className={`text-[10px] ${activeScenario === 'shop3_weather_25day_prediction' ? 'text-[#FCE4E4]' : 'text-[#526582]'}`}>
                Plano 104°F Heatwave
              </div>
            </div>
          </button>

          <button
            onClick={() => triggerLiveScenario('shop4_social_media_event_spike', 'STORE-ARL-11')}
            disabled={isRunning}
            className={`flex items-center space-x-2 text-left text-xs px-3 py-2 rounded-xl border font-semibold transition cursor-pointer disabled:opacity-60 ${
              activeScenario === 'shop4_social_media_event_spike'
                ? 'bg-[#6D28D9] border-[#6D28D9] text-white shadow-sm'
                : 'bg-[#F5F8FC] border-[#DCE4EE] text-[#14213D] hover:bg-[#F5F3FF] hover:border-[#DDD6FE]'
            }`}
          >
            <Users className={`h-4 w-4 shrink-0 ${activeScenario === 'shop4_social_media_event_spike' ? 'text-[#EDE9FE]' : 'text-[#6D28D9]'}`} />
            <div>
              <div className="font-bold">4. Run Social Event Stream</div>
              <div className={`text-[10px] ${activeScenario === 'shop4_social_media_event_spike' ? 'text-[#EDE9FE]' : 'text-[#526582]'}`}>
                Arlington 18.5k Marathon
              </div>
            </div>
          </button>
        </div>
      </div>

      {/* 2. Live Telemetry Tick Bar OR Live Spike Alert Notification Banner */}
      {(telemetryTickNote || liveAlertBanner) && (
        <div
          className={`rounded-2xl p-3.5 border shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition-all ${
            liveAlertBanner
              ? 'bg-[#FDF2F2] border-[#F8CACA] text-[#9E2B1E]'
              : 'bg-[#ECF5FC] border-[#C2DFF3] text-[#094266]'
          }`}
        >
          <div className="flex items-center space-x-3">
            <div
              className={`p-2 rounded-xl text-white shrink-0 ${
                liveAlertBanner ? 'bg-[#C93B2B] animate-pulse' : 'bg-[#0E5A8A]'
              }`}
            >
              {liveAlertBanner ? <BellRing className="h-4 w-4" /> : <Radio className="h-4 w-4 animate-spin" />}
            </div>
            <div>
              <div className="text-xs font-bold">
                {liveAlertBanner || telemetryTickNote}
              </div>
              {telemetryTickNote && liveAlertBanner && (
                <div className="text-[11px] text-[#C93B2B] mt-0.5 font-medium">
                  Latest Telemetry Packet: {telemetryTickNote}
                </div>
              )}
            </div>
          </div>

          {isRunning && (
            <div className="flex items-center space-x-2 text-xs font-bold bg-white px-3 py-1.5 rounded-xl border border-[#DCE4EE] text-[#094266] shrink-0">
              <Loader2 className="h-4 w-4 animate-spin text-[#0E5A8A]" />
              <span>NexusTwin AI Multi-Agent System Active...</span>
            </div>
          )}
        </div>
      )}

      {/* 3. Parallel Synchronized Grid: 3-Tier Map (Left 7 Cols) + Multi-Agent & 4 Math Checks (Right 5 Cols) */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-5 flex-1">
        {/* LEFT COLUMN (7 Cols): Live 3-Tier Supply Chain Network Map */}
        <div className="xl:col-span-7 bg-white border border-[#DCE4EE] rounded-2xl p-4 shadow-enterprise flex flex-col justify-between space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[#DCE4EE] pb-2.5">
            <div>
              <h2 className="font-serif text-sm font-bold text-[#14213D]">
                Live 3-Tier Supply Chain Network Map (Factory &rarr; Warehouses &rarr; Retail Stores)
              </h2>
              <p className="text-[11px] text-[#526582]">
                {phase === 'IDLE'
                  ? 'All 6 retail stores operating at healthy baseline stock. Start a scenario stream above to watch a live spike.'
                  : `Live Scenario Active on ${targetStoreId} • Current Phase: ${phase.replace(/_/g, ' ')}`}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3 text-[11px] font-semibold">
              <span className="flex items-center space-x-1.5 text-[#095C47]">
                <span className="h-2.5 w-2.5 rounded-full bg-[#0D7A5F] inline-block" />
                <span>Warehouse Transfer</span>
              </span>
              <span className="flex items-center space-x-1.5 text-[#925802]">
                <span className="h-2.5 w-2.5 rounded-full bg-[#C27803] inline-block" />
                <span>Factory PO Escalation</span>
              </span>
              <span className="flex items-center space-x-1.5 text-[#9E2B1E]">
                <span className="h-2.5 w-2.5 rounded-full bg-[#C93B2B] inline-block" />
                <span>Store Spike Alert</span>
              </span>
            </div>
          </div>

          {/* Interactive SVG Network Flow Diagram with Retail Swimlane Tier Headers */}
          <div className="w-full bg-[#F5F8FC] border border-[#DCE4EE] rounded-2xl p-2.5 overflow-x-auto">
            <svg viewBox="0 0 920 410" className="w-full h-auto min-w-[660px] select-none">
              <defs>
                <marker id="arrow-mint" markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto">
                  <path d="M0,0 L8,4 L0,8 Z" fill="#0D7A5F" />
                </marker>
                <marker id="arrow-amber" markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto">
                  <path d="M0,0 L8,4 L0,8 Z" fill="#C27803" />
                </marker>
              </defs>

              {/* Swimlane Background Bands & Dedicated Non-Overlapping Tier Header Pills */}
              <rect x="8" y="6" width="904" height="98" rx="12" fill="#FFFBEB" fillOpacity="0.85" stroke="#FDE68A" strokeWidth="1" />
              <rect x="16" y="12" width="248" height="20" rx="6" fill="#FEF3C7" stroke="#D97706" strokeWidth="1" />
              <text x="26" y="25.5" className="text-[10px] font-bold fill-[#925802] uppercase tracking-wider">
                TIER 1: UPSTREAM BOTTLING FACTORY
              </text>

              <rect x="8" y="132" width="904" height="106" rx="12" fill="#ECF5FC" fillOpacity="0.85" stroke="#C2DFF3" strokeWidth="1" />
              <rect x="16" y="138" width="272" height="20" rx="6" fill="#D6EAF8" stroke="#0E5A8A" strokeWidth="1" />
              <text x="26" y="151.5" className="text-[10px] font-bold fill-[#094266] uppercase tracking-wider">
                TIER 2: REGIONAL WAREHOUSES (3 DCs)
              </text>

              <rect x="8" y="268" width="904" height="134" rx="12" fill="#EBF1F8" fillOpacity="0.7" stroke="#DCE4EE" strokeWidth="1" />
              <rect x="16" y="274" width="250" height="20" rx="6" fill="#DCE4EE" stroke="#9BB0C9" strokeWidth="1" />
              <text x="26" y="287.5" className="text-[10px] font-bold fill-[#14213D] uppercase tracking-wider">
                TIER 3: RETAIL STORES (6 TEXAS SHOPS)
              </text>

              {/* Connections: Factory -> 3 Warehouses */}
              {Object.entries(dcPositions).map(([dcId, dcPos]) => {
                const isFactoryActiveLink = hasCommonOutput && isFactoryPO && dcId === 'DC-HOU-01';
                return (
                  <g key={`fmcg-${dcId}`}>
                    <path
                      d={`M ${factoryPos.x} ${factoryPos.y + 26} C ${factoryPos.x} 125, ${dcPos.x} 125, ${dcPos.x} ${dcPos.y - 30}`}
                      fill="none"
                      stroke={isFactoryActiveLink ? '#C27803' : '#C4D0E0'}
                      strokeWidth={isFactoryActiveLink ? 4 : 1.5}
                      strokeDasharray={isFactoryActiveLink ? undefined : '4 4'}
                      className={isFactoryActiveLink ? 'animate-flow-line' : ''}
                      markerEnd={isFactoryActiveLink ? 'url(#arrow-amber)' : undefined}
                    />
                    {isFactoryActiveLink && (
                      <g transform={`translate(${(factoryPos.x + dcPos.x) / 2 - 84}, 108)`}>
                        <rect width="168" height="21" rx="10" fill="#FFFBEB" stroke="#C27803" strokeWidth="1.5" />
                        <text x="84" y="14" textAnchor="middle" className="text-[10px] font-bold fill-[#925802]">
                          Factory PO: 1,800 Packs ($8.79)
                        </text>
                      </g>
                    )}
                  </g>
                );
              })}

              {/* Connections: 3 Warehouses -> 6 Retail Stores */}
              {Object.entries(storePositions).map(([storeId, stPos]) => {
                const dcPos = dcPositions[stPos.servingDc];
                const isActiveTarget = hasCommonOutput && targetStoreId === storeId;
                const strokeColor = isActiveTarget
                  ? isFactoryPO
                    ? '#C27803'
                    : '#0D7A5F'
                  : '#C4D0E0';

                return (
                  <g key={`dc-store-${storeId}`}>
                    <path
                      d={`M ${dcPos.x} ${dcPos.y + 30} C ${dcPos.x} 265, ${stPos.x} 265, ${stPos.x} ${stPos.y - 36}`}
                      fill="none"
                      stroke={strokeColor}
                      strokeWidth={isActiveTarget ? 4.5 : 1.5}
                      className={isActiveTarget && isCompleted ? 'animate-flow-line' : ''}
                      markerEnd={
                        isActiveTarget
                          ? isFactoryPO
                            ? 'url(#arrow-amber)'
                            : 'url(#arrow-mint)'
                          : undefined
                      }
                    />
                    {isActiveTarget && isCompleted && (
                      <g transform={`translate(${(dcPos.x + stPos.x) / 2 - 72}, 244)`}>
                        <rect
                          width="144"
                          height="21"
                          rx="10"
                          fill={isFactoryPO ? '#FFFBEB' : '#EEFBF6'}
                          stroke={isFactoryPO ? '#C27803' : '#0D7A5F'}
                          strokeWidth="1.5"
                        />
                        <text
                          x="72"
                          y="14"
                          textAnchor="middle"
                          className={`text-[10px] font-bold ${isFactoryPO ? 'fill-[#925802]' : 'fill-[#095C47]'}`}
                        >
                          🚚 +{unitsTransferred.toLocaleString()} Packs (${freightCost})
                        </text>
                      </g>
                    )}
                  </g>
                );
              })}

              {/* Tier 1 Node: Waco Bottling Factory */}
              <g
                transform={`translate(${factoryPos.x - 140}, ${factoryPos.y - 25})`}
                onClick={() => setSelectedNode('FMCG-PLANT-TX01')}
                className="cursor-pointer"
              >
                <rect
                  width="280"
                  height="50"
                  rx="12"
                  fill={hasCommonOutput && isFactoryPO ? '#FFFBEB' : '#FFFFFF'}
                  stroke={hasCommonOutput && isFactoryPO ? '#C27803' : '#9BB0C9'}
                  strokeWidth={hasCommonOutput && isFactoryPO ? 3 : 1.75}
                />
                <circle cx="26" cy="25" r="15" fill={hasCommonOutput && isFactoryPO ? '#C27803' : '#FEF3C7'} />
                <text x="26" y="30" textAnchor="middle" className="text-sm">
                  🏭
                </text>
                <text x="50" y="21" className="text-[12px] font-bold fill-[#14213D]">
                  Waco Bottling Factory (Manufacturer)
                </text>
                <text x="50" y="37" className="text-[10px] font-bold fill-[#0D7A5F]">
                  Spare Stock: {factorySpare.toLocaleString()} packs ($8.79/pack wholesale)
                </text>
              </g>

              {/* Tier 2 Nodes: 3 Regional Warehouses */}
              {Object.entries(dcPositions).map(([dcId, dcPos]) => {
                const dcInv = inventory[dcId] || CALM_BASELINE_INVENTORY[dcId];
                const isLow = dcInv.atp_surplus < 500;
                const isActiveDc = activeDonorDcId === dcId;

                return (
                  <g
                    key={dcId}
                    transform={`translate(${dcPos.x - 108}, ${dcPos.y - 28})`}
                    onClick={() => setSelectedNode(dcId)}
                    className="cursor-pointer"
                  >
                    <rect
                      width="216"
                      height="58"
                      rx="12"
                      fill={isLow && activeScenario === 'shop2_dc_shortage_fmcg_po' ? '#FDF2F2' : isActiveDc ? '#EEFBF6' : '#FFFFFF'}
                      stroke={isLow && activeScenario === 'shop2_dc_shortage_fmcg_po' ? '#C93B2B' : isActiveDc ? '#0D7A5F' : '#9BB0C9'}
                      strokeWidth={isActiveDc || (isLow && activeScenario === 'shop2_dc_shortage_fmcg_po') ? 2.75 : 1.5}
                    />
                    <text x="14" y="21" className="text-[12px] font-bold fill-[#14213D]">
                      🏢 {dcPos.shortName}
                    </text>
                    <text
                      x="14"
                      y="38"
                      className={`text-[11px] font-bold ${isLow ? 'fill-[#C27803]' : 'fill-[#0D7A5F]'}`}
                    >
                      {isLow
                        ? `⚠️ Only ${dcInv.atp_surplus} Spare Packs`
                        : `✅ ${dcInv.atp_surplus.toLocaleString()} Spare Packs`}
                    </text>
                    <text x="14" y="51" className="text-[9px] font-medium fill-[#526582]">
                      On-Hand: {dcInv.on_hand.toLocaleString()} • Reserve: {dcInv.safety_buffer.toLocaleString()}
                    </text>
                  </g>
                );
              })}

              {/* Tier 3 Nodes: 6 Retail Stores */}
              {Object.entries(storePositions).map(([storeId, stPos]) => {
                const stInv = inventory[storeId] || CALM_BASELINE_INVENTORY[storeId];
                const isActiveSpikeStore = activeScenario !== null && targetStoreId === storeId;
                const vel = stInv.current_velocity || stInv.burn_rate_base || 45;

                return (
                  <g
                    key={storeId}
                    transform={`translate(${stPos.x - 66}, ${stPos.y - 34})`}
                    onClick={() => {
                      setSelectedNode(storeId);
                      if (stPos.scenarioKey && !isRunning) {
                        triggerLiveScenario(stPos.scenarioKey, storeId);
                      }
                    }}
                    className="cursor-pointer"
                  >
                    {isActiveSpikeStore && (
                      <rect
                        x="-4"
                        y="-4"
                        width="140"
                        height="80"
                        rx="14"
                        fill="none"
                        stroke="#C93B2B"
                        strokeWidth="2.5"
                        strokeDasharray="5 3"
                      />
                    )}
                    <rect
                      width="132"
                      height="72"
                      rx="11"
                      fill={isActiveSpikeStore ? '#FDF2F2' : '#FFFFFF'}
                      stroke={isActiveSpikeStore ? '#C93B2B' : '#9BB0C9'}
                      strokeWidth={isActiveSpikeStore ? 2.5 : 1.5}
                    />
                    <text x="66" y="19" textAnchor="middle" className="text-[11px] font-bold fill-[#14213D]">
                      🏪 {stPos.shopLabel}
                    </text>
                    <text
                      x="66"
                      y="35"
                      textAnchor="middle"
                      className={`text-[10px] font-bold ${isActiveSpikeStore ? 'fill-[#C93B2B]' : 'fill-[#0D7A5F]'}`}
                    >
                      {isActiveSpikeStore ? `🔥 ${vel}/hr Spike!` : `Normal (${vel}/hr)`}
                    </text>
                    <text x="66" y="50" textAnchor="middle" className="text-[10px] font-semibold fill-[#3B4E6B]">
                      Shelf: {stInv.on_hand} packs
                    </text>
                    {isCompleted && isActiveSpikeStore && !isFactoryPO ? (
                      <text x="66" y="64" textAnchor="middle" className="text-[9px] font-bold fill-[#0D7A5F]">
                        +{unitsTransferred} Dispatched
                      </text>
                    ) : isCompleted && isActiveSpikeStore && isFactoryPO ? (
                      <text x="66" y="64" textAnchor="middle" className="text-[9px] font-bold fill-[#C27803]">
                        ⏳ In VP Queue
                      </text>
                    ) : (
                      <text x="66" y="64" textAnchor="middle" className="text-[9px] fill-[#526582]">
                        Click to stream
                      </text>
                    )}
                  </g>
                );
              })}
            </svg>
          </div>

          {/* Bottom of Left Column: Live Store Shelf Stock & Velocity Status */}
          <div className="bg-[#F5F8FC] border border-[#DCE4EE] rounded-xl p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center space-x-2">
                <Package className="h-4 w-4 text-[#0E5A8A]" />
                <span className="text-xs font-bold text-[#14213D]">
                  Focused Store Telemetry: {targetStoreId}
                </span>
              </div>
              <p className="text-[11px] text-[#3B4E6B]">
                Checkout Velocity:{' '}
                <strong className={activeScenario ? 'text-[#C93B2B]' : 'text-[#0D7A5F]'}>
                  {targetStoreInv.current_velocity || 48} packs/hr
                </strong>{' '}
                (Baseline: {targetStoreInv.burn_rate_base || 48}/hr) • Current Shelf:{' '}
                <strong className="text-[#14213D]">{targetStoreInv.on_hand} packs</strong> (Safety Reserve: {targetStoreInv.safety_buffer} packs)
              </p>
            </div>

            {isCompleted && (
              <div className="flex items-center space-x-3 shrink-0">
                <div className="text-right">
                  <div className="text-[10px] uppercase font-bold text-[#526582]">After Replenishment</div>
                  <div className="text-xs font-mono font-bold text-[#0D7A5F]">
                    {(targetStoreInv.on_hand + unitsTransferred).toLocaleString()} Packs • +${netProfitProtected.toLocaleString()} Profit Protected
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* RIGHT COLUMN (5 Cols): Live NexusTwin AI Multi-Agent System & 4 Mandatory Mathematical Checks */}
        <div className="xl:col-span-5 bg-white border border-[#DCE4EE] rounded-2xl p-4 shadow-enterprise flex flex-col justify-between space-y-3">
          {/* Right Panel Header */}
          <div className="flex items-center justify-between border-b border-[#DCE4EE] pb-2.5">
            <div className="flex items-center space-x-2.5">
              <div className="h-8 w-8 rounded-lg bg-[#0E5A8A] text-white flex items-center justify-center shrink-0">
                <Cpu className="h-4 w-4" />
              </div>
              <div>
                <h2 className="font-serif text-sm font-bold text-[#14213D]">
                  NexusTwin AI Multi-Agent &amp; 4-Gate Execution
                </h2>
                <p className="text-[11px] text-[#526582]">
                  Live Telemetry &rarr; Multi-Agent Common Output &rarr; 4 Math Checks &rarr; ERP/A2A
                </p>
              </div>
            </div>

            {hasCommonOutput && (
              <button
                onClick={() => setShowCommonJson((prev) => !prev)}
                className="flex items-center space-x-1 text-[11px] font-semibold bg-[#F5F8FC] hover:bg-[#ECF5FC] text-[#0E5A8A] border border-[#DCE4EE] px-2.5 py-1.5 rounded-lg transition cursor-pointer shrink-0"
              >
                <FileJson className="h-3.5 w-3.5" />
                <span>{showCommonJson ? 'Hide Common JSON' : 'Common Output JSON'}</span>
              </button>
            )}
          </div>

          {/* IDLE STATE: Clean Standby View Before Any Scenario Is Triggered */}
          {phase === 'IDLE' && (
            <div className="flex-1 flex flex-col items-center justify-center text-center p-6 bg-[#F5F8FC] border border-dashed border-[#C4D0E0] rounded-xl space-y-3">
              <div className="h-12 w-12 rounded-2xl bg-[#ECF5FC] text-[#0E5A8A] border border-[#C2DFF3] flex items-center justify-center">
                <Radio className="h-6 w-6" />
              </div>
              <div className="space-y-1 max-w-sm">
                <h3 className="font-serif text-sm font-bold text-[#14213D]">
                  System Standby — Monitoring Live Store Streams
                </h3>
                <p className="text-xs text-[#3B4E6B] leading-relaxed">
                  Click any of the <strong>4 Scenario Stream buttons</strong> at the top (or click a store on the map) to stream live POS, Weather, or Social data.
                </p>
              </div>
              <div className="w-full max-w-md bg-white border border-[#DCE4EE] rounded-xl p-3 text-left text-[11px] text-[#3B4E6B] space-y-1.5">
                <div className="font-bold text-[#14213D] uppercase tracking-wider text-[10px]">
                  What Happens When a Spike Is Detected:
                </div>
                <div>1. <strong>Live Alert Notification</strong> fires when shelf stock or velocity crosses threshold.</div>
                <div>2. <strong>NexusTwin AI Multi-Agent System</strong> queries BigQuery, SAP ERP &amp; negotiates with Suppliers/Carriers to produce the <strong>Common Output</strong>.</div>
                <div>3. <strong>4 Mandatory Mathematical Gate Checks</strong> verify the Common Output.</div>
                <div>4. <strong>Final Workflow</strong> dispatches the SAP STO (&le; $1,000) or routes to VP Queue (&gt; $1,000).</div>
              </div>
            </div>
          )}

          {/* WAITING STATE: While Telemetry Is Streaming or Multi-Agent System Is Processing */}
          {isRunning && (
            <div className="flex-1 flex flex-col justify-center p-5 bg-[#ECF5FC]/70 border border-[#C2DFF3] rounded-xl space-y-4">
              <div className="flex items-center space-x-3">
                <Loader2 className="h-7 w-7 text-[#0E5A8A] animate-spin shrink-0" />
                <div>
                  <h3 className="font-serif text-sm font-bold text-[#14213D]">
                    {phase === 'STREAMING_TELEMETRY'
                      ? 'Step 1: Receiving Live Store Telemetry Stream...'
                      : 'Step 2: NexusTwin AI Multi-Agent System Processing...'}
                  </h3>
                  <p className="text-xs text-[#094266] font-medium mt-0.5">
                    {phase === 'STREAMING_TELEMETRY' ? telemetryTickNote : agentStatusMsg}
                  </p>
                </div>
              </div>

              <div className="space-y-2 text-xs bg-white p-3.5 rounded-xl border border-[#DCE4EE]">
                <div className="flex items-center space-x-2 text-[#3B4E6B]">
                  <Database className="h-4 w-4 text-[#0E5A8A] shrink-0" />
                  <span>
                    <strong>sensing_agent:</strong> Querying BigQuery Lakehouse (`pos_sales_stream`, `weather_forecast_25d`, `social_media_signals`)...
                  </span>
                </div>
                <div className="flex items-center space-x-2 text-[#3B4E6B]">
                  <Handshake className="h-4 w-4 text-[#C27803] shrink-0" />
                  <span>
                    <strong>replenishment_agent:</strong> Checking SAP S/4HANA ERP warehouse ATP stock &amp; negotiating supplier/factory batch pricing...
                  </span>
                </div>
                <div className="flex items-center space-x-2 text-[#3B4E6B]">
                  <Calculator className="h-4 w-4 text-[#0D7A5F] shrink-0" />
                  <span>
                    <strong>logistics_agent:</strong> Polling 3PL carrier rate tables &amp; preparing Standardized Common Output for the 4 Gate Checks...
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* OPTIONAL: Standardized Common Multi-Agent Output JSON Inspector */}
          {hasCommonOutput && showCommonJson && (
            <div className="bg-[#14213D] text-[#D5F5E9] p-3 rounded-xl text-[10px] font-mono max-h-48 overflow-y-auto">
              <div className="text-[#9BB0C9] font-bold mb-1">
                // Standardized MultiAgentCommonOutput JSON (Input to 4 Gate Checks)
              </div>
              <pre className="whitespace-pre-wrap">{JSON.stringify(commonOut, null, 2)}</pre>
            </div>
          )}

          {/* POPULATED STATE: Actual Common Multi-Agent Output -> 4 Gate Checks -> Final Output */}
          {hasCommonOutput && (
            <div className="space-y-2.5 flex-1">
              {/* AGENT 1 OUTPUT: Market Sensing Agent */}
              <div className="rounded-xl border border-[#DCE4EE] bg-[#F5F8FC] p-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <span className="h-5 w-5 rounded-full bg-[#0E5A8A] text-white text-[10px] font-bold flex items-center justify-center">
                      1
                    </span>
                    <span className="text-xs font-bold text-[#14213D]">
                      Market Sensing Agent (<code className="text-[#0E5A8A] font-mono">{sensingOut.agent_name}</code>)
                    </span>
                  </div>
                  <span className="text-[10px] font-bold bg-[#ECF5FC] text-[#0E5A8A] border border-[#C2DFF3] px-2 py-0.5 rounded-full">
                    BigQuery Telemetry MCP
                  </span>
                </div>
                <div className="mt-1.5 pl-7 space-y-1 text-[11px]">
                  <div className="bg-white border border-[#DCE4EE] rounded-lg px-2.5 py-1.5 font-mono text-[11px] text-[#14213D] flex flex-wrap items-center justify-between gap-2">
                    <span>
                      Spike = <strong>{sensingOut.observed_velocity_hr}/hr</strong> &divide;{' '}
                      {sensingOut.baseline_velocity_hr}/hr ={' '}
                      <strong className="text-[#C93B2B]">{sensingOut.velocity_spike_ratio}x</strong>
                    </span>
                    <span className="text-[#C93B2B] font-bold">
                      Shelf: {sensingOut.current_shelf_stock} packs ({sensingOut.stockout_runway_hours}h runway)
                    </span>
                  </div>
                  <ul className="list-disc list-inside text-[10px] text-[#526582] space-y-0.5">
                    {(sensingOut.activities_performed || []).map((act: string, i: number) => (
                      <li key={i}>{act}</li>
                    ))}
                  </ul>
                </div>
              </div>

              {/* AGENT 2 OUTPUT: Stock & Replenishment Agent (Includes ERP & Supplier Negotiation) */}
              <div
                className={`rounded-xl border p-3 ${
                  isFactoryPO ? 'bg-[#FFFBEB] border-[#FDE68A]' : 'bg-[#F5F8FC] border-[#DCE4EE]'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <span className="h-5 w-5 rounded-full bg-[#0E5A8A] text-white text-[10px] font-bold flex items-center justify-center">
                      2
                    </span>
                    <span className="text-xs font-bold text-[#14213D]">
                      Replenishment &amp; Supplier Agent (<code className="text-[#0E5A8A] font-mono">{repOut.agent_name}</code>)
                    </span>
                  </div>
                  <span
                    className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                      isFactoryPO
                        ? 'bg-[#FEF3C7] text-[#925802] border-[#FDE68A]'
                        : 'bg-[#EEFBF6] text-[#095C47] border-[#B8EAD8]'
                    }`}
                  >
                    {isFactoryPO ? 'SAP ERP + Factory Negotiation' : 'SAP ERP Warehouse ATP'}
                  </span>
                </div>
                <div className="mt-1.5 pl-7 space-y-1 text-[11px]">
                  <div className="bg-white border border-[#DCE4EE] rounded-lg px-2.5 py-1.5 text-[#14213D]">
                    <div>{repOut.finding_summary}</div>
                    <div className="mt-1 text-[10px] text-[#094266] bg-[#ECF5FC] px-2 py-1 rounded border border-[#C2DFF3] font-medium">
                      🤝 <strong>Supplier / Inventory Action:</strong> {repOut.supplier_negotiation_summary}
                    </div>
                  </div>
                </div>
              </div>

              {/* AGENT 3 OUTPUT: Carrier & Logistics Agent (Includes 3PL Rate Negotiation) */}
              <div className="rounded-xl border border-[#DCE4EE] bg-[#F5F8FC] p-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <span className="h-5 w-5 rounded-full bg-[#0E5A8A] text-white text-[10px] font-bold flex items-center justify-center">
                      3
                    </span>
                    <span className="text-xs font-bold text-[#14213D]">
                      Carrier &amp; Logistics Agent (<code className="text-[#0E5A8A] font-mono">{logOut.agent_name}</code>)
                    </span>
                  </div>
                  <span className="text-[10px] font-mono font-bold bg-[#EBF1F8] text-[#14213D] border border-[#DCE4EE] px-2 py-0.5 rounded-full">
                    Transit: {logOut.transit_hours}h • Ship: ${logOut.freight_cost_usd.toLocaleString()}
                  </span>
                </div>
                <div className="mt-1.5 pl-7 space-y-1 text-[11px] text-[#3B4E6B]">
                  <div>{logOut.finding_summary}</div>
                  <div className="text-[10px] text-[#095C47] bg-[#EEFBF6] px-2 py-1 rounded border border-[#B8EAD8] font-medium">
                    🚚 <strong>3PL Rate Negotiation:</strong> {logOut.carrier_negotiation_summary}
                  </div>
                </div>
              </div>

              {/* STAGE 4: THE 4 MANDATORY MATHEMATICAL GATE CHECKS */}
              {hasGateChecked && (
                <div className="rounded-xl border border-[#C2DFF3] bg-[#ECF5FC]/70 p-3">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center space-x-2">
                      <span className="h-5 w-5 rounded-full bg-[#094266] text-white text-[10px] font-bold flex items-center justify-center">
                        4
                      </span>
                      <span className="text-xs font-bold text-[#14213D] flex items-center gap-1">
                        <Calculator className="h-3.5 w-3.5 text-[#0E5A8A]" />
                        <span>4 Mandatory Mathematical Gate Checks (on Common Output)</span>
                      </span>
                    </div>
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                        isFactoryPO
                          ? 'bg-[#FFFBEB] text-[#925802] border-[#FDE68A]'
                          : 'bg-[#EEFBF6] text-[#095C47] border-[#B8EAD8]'
                      }`}
                    >
                      {isFactoryPO ? '3 PASS • CHECK 4 -> VP SIGN-OFF' : 'ALL 4 MATH CHECKS PASSED'}
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 text-[11px]">
                    {(gateEval.rules_evaluated || []).map((rule: any, idx: number) => {
                      const shortTitles = [
                        '1. Spare Stock ATP',
                        '2. Delivery SLA',
                        '3. Profit Margin ROI',
                        '4. $1,000 Auto-Cap',
                      ];
                      return (
                        <div
                          key={rule.rule_name}
                          className={`rounded-lg p-2 border flex flex-col justify-between ${
                            rule.passed ? 'bg-white border-[#B8EAD8]' : 'bg-[#FFFBEB] border-[#FDE68A]'
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-bold text-[#14213D]">{shortTitles[idx] || rule.rule_name}</span>
                            <span
                              className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                                rule.passed ? 'bg-[#EEFBF6] text-[#0D7A5F]' : 'bg-[#FEF3C7] text-[#925802]'
                              }`}
                            >
                              {rule.passed ? 'PASS ✓' : 'VP QUEUE ⏳'}
                            </span>
                          </div>
                          <div className="font-mono text-[10px] text-[#3B4E6B] mt-0.5">
                            {rule.formula_expression || rule.message}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* STAGE 5: FINAL WORKFLOW EXECUTION */}
              {isCompleted && (
                <div
                  className={`rounded-xl border p-3.5 ${
                    isFactoryPO ? 'bg-[#FFFBEB] border-[#FDE68A]' : 'bg-[#EEFBF6] border-[#B8EAD8]'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      <span
                        className={`h-5 w-5 rounded-full text-white text-[10px] font-bold flex items-center justify-center ${
                          isFactoryPO ? 'bg-[#C27803]' : 'bg-[#0D7A5F]'
                        }`}
                      >
                        5
                      </span>
                      <span className="text-xs font-bold text-[#14213D]">
                        {isFactoryPO
                          ? 'Final Step: Handed Over to VP Approval Queue (:8001)'
                          : 'Final Step: SAP Stock Transfer Order Dispatched'}
                      </span>
                    </div>
                    <span
                      className={`text-[11px] font-mono font-bold px-2.5 py-0.5 rounded-lg border ${
                        isFactoryPO
                          ? 'bg-white text-[#925802] border-[#FDE68A]'
                          : 'bg-white text-[#095C47] border-[#B8EAD8]'
                      }`}
                    >
                      {isFactoryPO ? 'PENDING VP SIGN-OFF' : lastDecision?.sap_transfer_order_id}
                    </span>
                  </div>

                  <div className="mt-2.5 pl-7 flex flex-wrap items-center justify-between gap-2">
                    {isFactoryPO && onOpenApprovals ? (
                      <button
                        onClick={onOpenApprovals}
                        className="flex items-center space-x-1.5 bg-[#C27803] hover:bg-[#925802] text-white text-xs font-bold px-3.5 py-2 rounded-xl shadow-xs transition cursor-pointer"
                      >
                        <ShieldAlert className="h-4 w-4" />
                        <span>Open Tab 5: Approve Factory Order (${totalCommitment.toLocaleString()})</span>
                        <ArrowRight className="h-3.5 w-3.5" />
                      </button>
                    ) : (
                      <div className="flex items-center space-x-1.5 text-[11px] font-bold text-[#095C47]">
                        <CheckCircle2 className="h-4 w-4 text-[#0D7A5F]" />
                        <span>
                          BigQuery Inventory Updated • Net Profit Protected: +${netProfitProtected.toLocaleString()}
                        </span>
                      </div>
                    )}

                    <button
                      onClick={() => setShowRawTrace((prev) => !prev)}
                      className="text-[11px] font-semibold text-[#0E5A8A] hover:text-[#094266] flex items-center space-x-1 cursor-pointer"
                    >
                      <span>{showRawTrace ? 'Hide Agent Trace' : 'View Agent Trace'}</span>
                      {showRawTrace ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                    </button>
                  </div>

                  {showRawTrace && (
                    <div className="mt-2 ml-7 p-2.5 bg-white border border-[#DCE4EE] rounded-lg text-[11px] font-mono text-[#3B4E6B] max-h-32 overflow-y-auto whitespace-pre-wrap">
                      {lastDecision?.agent_response_text || lastDecision?.root_cause_explanation}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
