import React, { useState, useEffect, useRef } from 'react';
import { apiUrl, wsUrl } from '../apiConfig';
import { NODE_CATALOG, getNodeDisplayName, getNodeShortName } from '../nodeCatalog';
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
  Activity,
  Gauge,
  AlertTriangle,
  Sparkles,
} from 'lucide-react';

interface DigitalTwinMapProps {
  isActive?: boolean;
  approvedOrders?: Record<string, string>;
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

interface StreamPacket {
  tick: number;
  total_ticks?: number;
  timestamp?: string;
  store_id: string;
  store_display_name?: string;
  signal_source?: string;
  units_sold?: number;
  on_hand: number;
  safety_buffer?: number;
  velocity: number;
  baseline_velocity?: number;
  spike_ratio?: number;
  threshold_breached?: boolean;
  forecast_day?: string;
  temp_f?: number;
  buzz_score?: number;
  note: string;
}

interface AgentStepEvent {
  step_seq: number;
  agent: string;
  stage?: string;
  stage_label?: string;
  phase?: string;
  tools?: string[];
  message: string;
  vertex_session_id?: string;
  timestamp?: string;
}

const HEALTHY_FALLBACK_INVENTORY: Record<
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
  'STORE-FW-02': { on_hand: 640, safety_buffer: 250, atp_surplus: 390, current_velocity: 42.0, burn_rate_base: 42.0, reserved: 0 },
  'STORE-SAT-06': { on_hand: 590, safety_buffer: 200, atp_surplus: 390, current_velocity: 38.0, burn_rate_base: 38.0, reserved: 0 },
};

const PIPELINE_STAGES = [
  { id: 'sensing', label: '1. Sensing MCP' },
  { id: 'replenishment', label: '2. ERP / FMCG MCP' },
  { id: 'logistics', label: '3. 3PL Rates MCP' },
  { id: 'gate_guardrail', label: '4. 4-Gate Guardrail' },
  { id: 'execution_a2a', label: '5. ERP STO / A2A' },
];

function flattenInventoryFromState(stateInventory: any) {
  const flatInv: any = { ...HEALTHY_FALLBACK_INVENTORY };
  if (!stateInventory) return flatInv;
  Object.keys(stateInventory).forEach((nodeId) => {
    const skuData = stateInventory[nodeId]?.['SKU-4089-HYDRATE'];
    if (skuData) {
      flatInv[nodeId] = {
        ...(flatInv[nodeId] || {}),
        ...skuData,
        atp_surplus:
          skuData.atp_surplus ??
          Math.max(0, (skuData.on_hand || 0) - (skuData.safety_buffer || 0)),
      };
    }
  });
  return flatInv;
}

export const DigitalTwinMap: React.FC<DigitalTwinMapProps> = ({
  isActive = true,
  approvedOrders = {},
  onOpenApprovals,
  onScenarioCompleted,
}) => {
  const [selectedNode, setSelectedNode] = useState<string>('STORE-DAL-04');
  const [inventory, setInventory] = useState(HEALTHY_FALLBACK_INVENTORY);
  const [dbMeta, setDbMeta] = useState<{ firestore?: boolean; bigquery?: boolean }>({});
  const [streamSpeed, setStreamSpeed] = useState<number>(1.0);
  const [activeScenario, setActiveScenario] = useState<string | null>(null);
  const [phase, setPhase] = useState<ExecutionPhase>('IDLE');
  const [streamPackets, setStreamPackets] = useState<StreamPacket[]>([]);
  const [showStreamConsole, setShowStreamConsole] = useState<boolean>(true);
  const [liveAlertBanner, setLiveAlertBanner] = useState<string>('');
  const [agentStatusMsg, setAgentStatusMsg] = useState<string>('');
  const [liveSteps, setLiveSteps] = useState<AgentStepEvent[]>([]);
  const [activePipelineStage, setActivePipelineStage] = useState<string>('');
  const [completedStages, setCompletedStages] = useState<string[]>([]);
  const [lastDecision, setLastDecision] = useState<any>(null);
  const [showCommonJson, setShowCommonJson] = useState<boolean>(false);
  const [showRawTrace, setShowRawTrace] = useState<boolean>(false);
  const streamEndRef = useRef<HTMLDivElement | null>(null);

  const fetchLiveDbState = async (hydrateLastManifest = false) => {
    try {
      const res = await fetch(apiUrl('/api/v1/twin/state'));
      if (res.ok) {
        const data = await res.json();
        if (data.inventory) {
          setInventory(flattenInventoryFromState(data.inventory));
        }
        setDbMeta({
          firestore: data.firestore_connected,
          bigquery: data.bigquery_connected,
        });
        // Restore persisted executed flow across browser refresh until Reset Demo Stock clears it
        if (hydrateLastManifest && data.last_manifest && data.last_manifest.common_agent_output) {
          const m = data.last_manifest;
          setLastDecision(m);
          setActiveScenario(m.common_agent_output?.scenario_key || null);
          if (m.target_store) setSelectedNode(m.target_store);
          if (Array.isArray(m.live_stream_packets) && m.live_stream_packets.length > 0) {
            setStreamPackets(m.live_stream_packets);
            setShowStreamConsole(false);
          }
          if (Array.isArray(m.step_events) && m.step_events.length > 0) {
            setLiveSteps(m.step_events);
          }
          setCompletedStages(PIPELINE_STAGES.map((s) => s.id));
          setPhase('COMPLETED');
        }
      }
    } catch {
      // Keep healthy fallback when offline
    }
  };

  // Load REAL live stock (+ any existing executed manifest) from Firestore / BigQuery on mount
  useEffect(() => {
    fetchLiveDbState(true);
  }, []);

  // Refresh live DB stock whenever returning to Tab 1 (without clearing executed flow)
  useEffect(() => {
    if (isActive) {
      fetchLiveDbState(false);
    }
  }, [isActive]);

  // Reflect VP Approval done in Tab 5 immediately inside Tab 1's preserved flow
  useEffect(() => {
    if (!lastDecision?.event_id) return;
    const confirmedOrder = approvedOrders[lastDecision.event_id];
    if (confirmedOrder && lastDecision.gate_status !== 'APPROVED') {
      setLastDecision((prev: any) =>
        prev
          ? {
              ...prev,
              gate_status: 'APPROVED',
              requires_human_approval: false,
              a2a_task_state: 'completed',
              fmcg_purchase_order_id: prev.order_type === 'PO_TO_FMCG' ? confirmedOrder : prev.fmcg_purchase_order_id,
              sap_transfer_order_id: confirmedOrder,
            }
          : prev
      );
      fetchLiveDbState(false);
    }
  }, [approvedOrders, lastDecision?.event_id, lastDecision?.gate_status]);

  // Auto-scroll live stream feed as ticks arrive
  useEffect(() => {
    if (streamEndRef.current && phase === 'STREAMING_TELEMETRY') {
      streamEndRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [streamPackets, phase]);

  // Connect to live WebSocket telemetry & real-time Vertex AI Agent Engine step events
  useEffect(() => {
    let ws: WebSocket | null = null;
    try {
      ws = new WebSocket(wsUrl('/api/v1/twin/ws/telemetry'));

      ws.onmessage = (ev) => {
        try {
          const msg = JSON.parse(ev.data);
          if (msg.type === 'INITIAL_SNAPSHOT' && msg.state?.inventory) {
            setInventory(flattenInventoryFromState(msg.state.inventory));
            setDbMeta({
              firestore: msg.state.firestore_connected,
              bigquery: msg.state.bigquery_connected,
            });
          } else if (msg.type === 'TELEMETRY_STREAM_TICK') {
            setPhase('STREAMING_TELEMETRY');
            setShowStreamConsole(true);
            const pkt: StreamPacket = msg.packet || {
              tick: msg.tick || 1,
              total_ticks: msg.total_ticks || 5,
              store_id: msg.store_id,
              store_display_name: msg.store_display_name || getNodeDisplayName(msg.store_id),
              on_hand: msg.on_hand,
              velocity: msg.velocity,
              note: msg.note || '',
              timestamp: new Date().toISOString(),
            };
            setStreamPackets((prev) => {
              const filtered = prev.filter((p) => !(p.tick === pkt.tick && p.store_id === pkt.store_id));
              return [...filtered, pkt];
            });
            if (msg.store_id) {
              setInventory((prev) => ({
                ...prev,
                [msg.store_id]: {
                  ...(prev[msg.store_id] || HEALTHY_FALLBACK_INVENTORY[msg.store_id]),
                  current_velocity: msg.velocity,
                  on_hand: msg.on_hand,
                  atp_surplus: Math.max(
                    0,
                    (msg.on_hand ?? 0) - ((prev[msg.store_id] || HEALTHY_FALLBACK_INVENTORY[msg.store_id])?.safety_buffer || 250)
                  ),
                },
              }));
            }
          } else if (msg.type === 'SPIKE_THRESHOLD_BREACHED' || msg.type === 'LIVE_ALERT_NOTIFICATION') {
            setPhase('ALERT_TRIGGERED');
            setLiveAlertBanner(msg.alert_message || '');
          } else if (msg.type === 'MULTI_AGENT_PROCESSING') {
            setPhase('AGENT_PROCESSING');
            setAgentStatusMsg(msg.status_message || 'Vertex AI Agent Engine Swarm Active...');
          } else if (msg.type === 'AGENT_STEP_EVENT' && msg.step) {
            setPhase('AGENT_PROCESSING');
            const st: AgentStepEvent = msg.step;
            setLiveSteps((prev) => [...prev.slice(-24), st]);
            if (st.stage && st.stage !== 'supervisor') {
              setActivePipelineStage((prevStage) => {
                if (prevStage && prevStage !== st.stage) {
                  setCompletedStages((done) => (done.includes(prevStage) ? done : [...done, prevStage]));
                }
                return st.stage || prevStage;
              });
            }
            setAgentStatusMsg(st.message || st.stage_label || 'Executing live MCP tool...');
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
          } else if (msg.type === 'SIGNAL_RESOLVED' && msg.state?.inventory) {
            setInventory(flattenInventoryFromState(msg.state.inventory));
          } else if (msg.type === 'ORDER_APPROVED' && msg.state?.inventory) {
            setInventory(flattenInventoryFromState(msg.state.inventory));
            if (msg.manifest?.erp_transfer_order_id) {
              setLastDecision((prev: any) =>
                prev
                  ? {
                      ...prev,
                      gate_status: 'APPROVED',
                      requires_human_approval: false,
                      a2a_task_state: 'completed',
                      fmcg_purchase_order_id: msg.manifest.fmcg_purchase_order_id || msg.manifest.erp_transfer_order_id,
                      sap_transfer_order_id: msg.manifest.erp_transfer_order_id,
                      a2a_agent_response: msg.manifest.a2a_resume_response || prev.a2a_agent_response,
                    }
                  : prev
              );
            }
          } else if (msg.type === 'DEMO_RESET') {
            setInventory(msg.state?.inventory ? flattenInventoryFromState(msg.state.inventory) : HEALTHY_FALLBACK_INVENTORY);
            setActiveScenario(null);
            setPhase('IDLE');
            setStreamPackets([]);
            setLiveSteps([]);
            setActivePipelineStage('');
            setCompletedStages([]);
            setLiveAlertBanner('');
            setAgentStatusMsg('');
            setLastDecision(null);
            setShowCommonJson(false);
            setShowRawTrace(false);
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
    setActiveScenario(scenarioKey);
    setSelectedNode(focusStore);
    setLastDecision(null);
    setStreamPackets([]);
    setLiveSteps([]);
    setActivePipelineStage('');
    setCompletedStages([]);
    setShowStreamConsole(true);
    setPhase('STREAMING_TELEMETRY');
    setLiveAlertBanner('');
    setAgentStatusMsg('Streaming live telemetry ticks into Cloud Firestore...');

    try {
      const res = await fetch(apiUrl(`/api/v1/signals/scenario/${scenarioKey}?speed=${streamSpeed}`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      if (res.ok) {
        const manifest = await res.json();
        setLastDecision(manifest);
        if (Array.isArray(manifest.live_stream_packets) && manifest.live_stream_packets.length > 0) {
          setStreamPackets(manifest.live_stream_packets);
        }
        if (Array.isArray(manifest.step_events) && manifest.step_events.length > 0) {
          setLiveSteps(manifest.step_events);
        }
        setCompletedStages(PIPELINE_STAGES.map((s) => s.id));
        setActivePipelineStage('');
        setShowStreamConsole(false); // Collapse stream console neatly once agent results arrive (still expandable!)
        await fetchLiveDbState();
        setPhase('COMPLETED');
        if (onScenarioCompleted) onScenarioCompleted();
      } else {
        setPhase('IDLE');
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
  const isPendingApproval =
    lastDecision?.gate_status === 'REFERRED_TO_HUMAN' ||
    (lastDecision?.requires_human_approval && !lastDecision?.fmcg_purchase_order_id && !lastDecision?.sap_transfer_order_id);

  // Focused node for bottom bar (allows inspecting ANY store/DC/factory directly from live DB!)
  const focusedNodeId = selectedNode || lastDecision?.target_store || 'STORE-DAL-04';
  const focusedNodeDisplay = getNodeDisplayName(focusedNodeId);
  const focusedInv = inventory[focusedNodeId] || HEALTHY_FALLBACK_INVENTORY['STORE-DAL-04'];
  const activeScenarioStoreId = lastDecision?.target_store || sensingOut?.store_id || (activeScenario ? selectedNode : '');

  const unitsTransferred = lastDecision?.units_transferred || repOut?.requested_units || 0;
  const freightCost = lastDecision?.estimated_freight_cost || logOut?.freight_cost_usd || 0;
  const totalCommitment = lastDecision?.total_financial_commitment || logOut?.total_commitment_usd || 0;
  const grossMarginSaved = repOut?.protected_margin_usd || Math.round(unitsTransferred * 6.2);
  const netProfitProtected = Math.round(grossMarginSaved - freightCost);
  const factorySpare = inventory['FMCG-PLANT-TX01']?.atp_surplus ?? 45000;

  const latestPacket = streamPackets.length > 0 ? streamPackets[streamPackets.length - 1] : null;

  // Coordinates for the 3-Tier Swimlane SVG Diagram (Unified Canonical Names from NODE_CATALOG)
  const factoryPos = { x: 460, y: 68 };
  const dcPositions: Record<string, { x: number; y: number; shortName: string }> = {
    'DC-ATX-02': { x: 190, y: 198, shortName: NODE_CATALOG['DC-ATX-02'].shortName },
    'DC-HOU-01': { x: 460, y: 198, shortName: NODE_CATALOG['DC-HOU-01'].shortName },
    'DC-SAT-03': { x: 730, y: 198, shortName: NODE_CATALOG['DC-SAT-03'].shortName },
  };
  const storePositions: Record<
    string,
    { x: number; y: number; shopLabel: string; servingDc: string }
  > = {
    'STORE-DAL-04': { x: 92, y: 348, shopLabel: NODE_CATALOG['STORE-DAL-04'].shortName, servingDc: 'DC-ATX-02' },
    'STORE-PLANO-07': { x: 238, y: 348, shopLabel: NODE_CATALOG['STORE-PLANO-07'].shortName, servingDc: 'DC-ATX-02' },
    'STORE-FW-02': { x: 384, y: 348, shopLabel: NODE_CATALOG['STORE-FW-02'].shortName, servingDc: 'DC-ATX-02' },
    'STORE-HOU-05': { x: 530, y: 348, shopLabel: NODE_CATALOG['STORE-HOU-05'].shortName, servingDc: 'DC-HOU-01' },
    'STORE-ARL-11': { x: 676, y: 348, shopLabel: NODE_CATALOG['STORE-ARL-11'].shortName, servingDc: 'DC-SAT-03' },
    'STORE-SAT-06': { x: 822, y: 348, shopLabel: NODE_CATALOG['STORE-SAT-06'].shortName, servingDc: 'DC-SAT-03' },
  };

  const activeDonorDcId = hasCommonOutput
    ? isFactoryPO
      ? 'DC-HOU-01'
      : repOut?.serving_dc_id || 'DC-ATX-02'
    : null;

  return (
    <div className="h-full flex flex-col p-4 space-y-3 overflow-y-auto">
      {/* 1. Compact Scenario Stream Launcher Bar + Simulation Speed Control */}
      <div className="bg-white border border-[#DCE4EE] rounded-xl px-3.5 py-2 shadow-enterprise space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
          <div className="flex items-center gap-2 min-w-0">
            <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-[#ECF5FC] text-[#0E5A8A] border border-[#C2DFF3] uppercase tracking-wider whitespace-nowrap shrink-0">
              Live Telemetry Streamer
            </span>
            <h1 className="font-serif text-xs sm:text-[13px] font-bold text-[#14213D] truncate">
              Stream Live Store Data (Firestore &rarr; BigQuery) &amp; Trigger Vertex AI Multi-Agent System
            </h1>
          </div>

          {/* Stream Speed Control + Reset Hint */}
          <div className="flex items-center gap-2.5 shrink-0">
            <div className="flex items-center gap-1 bg-[#F5F8FC] border border-[#DCE4EE] rounded-lg px-2 py-0.5 text-[10px]">
              <Gauge className="h-3 w-3 text-[#0E5A8A]" />
              <span className="font-semibold text-[#526582] mr-0.5">Speed:</span>
              {[
                { val: 0.5, label: '0.5x' },
                { val: 1.0, label: '1x' },
                { val: 2.0, label: '2x' },
              ].map((opt) => (
                <button
                  key={opt.val}
                  onClick={() => setStreamSpeed(opt.val)}
                  disabled={isRunning}
                  title={opt.val === 0.5 ? 'Slow Presenter Speed' : opt.val === 1.0 ? 'Normal Demo Speed' : 'Fast Simulation Speed'}
                  className={`px-1.5 py-0.5 rounded font-mono font-bold transition cursor-pointer disabled:opacity-60 ${
                    streamSpeed === opt.val
                      ? 'bg-[#0E5A8A] text-white'
                      : 'text-[#3B4E6B] hover:bg-[#ECF5FC]'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            <p className="hidden 2xl:block text-[11px] text-[#526582] whitespace-nowrap">
              Click <strong>Reset Demo Stock</strong> above between runs
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
          <button
            onClick={() => triggerLiveScenario('shop1_pos_dc_replenish', 'STORE-DAL-04')}
            disabled={isRunning}
            className={`flex items-center gap-2 text-left px-2.5 py-1.5 rounded-lg border font-semibold transition cursor-pointer disabled:opacity-60 min-w-0 ${
              activeScenario === 'shop1_pos_dc_replenish'
                ? 'bg-[#0E5A8A] border-[#0E5A8A] text-white shadow-sm'
                : 'bg-[#F5F8FC] border-[#DCE4EE] text-[#14213D] hover:bg-[#ECF5FC] hover:border-[#C2DFF3]'
            }`}
          >
            <Zap className={`h-3.5 w-3.5 shrink-0 ${activeScenario === 'shop1_pos_dc_replenish' ? 'text-[#FEF3C7]' : 'text-[#0E5A8A]'}`} />
            <div className="min-w-0 leading-tight">
              <div className="text-[11px] font-bold truncate">1. Shop 1: Dallas POS Stream</div>
              <div className={`text-[10px] truncate ${activeScenario === 'shop1_pos_dc_replenish' ? 'text-[#D6EAF8]' : 'text-[#526582]'}`}>
                Checkout Surge &rarr; Auto STO
              </div>
            </div>
          </button>

          <button
            onClick={() => triggerLiveScenario('shop2_dc_shortage_fmcg_po', 'STORE-HOU-05')}
            disabled={isRunning}
            className={`flex items-center gap-2 text-left px-2.5 py-1.5 rounded-lg border font-semibold transition cursor-pointer disabled:opacity-60 min-w-0 ${
              activeScenario === 'shop2_dc_shortage_fmcg_po'
                ? 'bg-[#C27803] border-[#C27803] text-white shadow-sm'
                : 'bg-[#F5F8FC] border-[#DCE4EE] text-[#14213D] hover:bg-[#FFFBEB] hover:border-[#FDE68A]'
            }`}
          >
            <Factory className={`h-3.5 w-3.5 shrink-0 ${activeScenario === 'shop2_dc_shortage_fmcg_po' ? 'text-white' : 'text-[#C27803]'}`} />
            <div className="min-w-0 leading-tight">
              <div className="text-[11px] font-bold truncate">2. Shop 2: Houston POS Stream</div>
              <div className={`text-[10px] truncate ${activeScenario === 'shop2_dc_shortage_fmcg_po' ? 'text-[#FEF3C7]' : 'text-[#526582]'}`}>
                DC Shortage &rarr; B2B FMCG PO
              </div>
            </div>
          </button>

          <button
            onClick={() => triggerLiveScenario('shop3_weather_25day_prediction', 'STORE-PLANO-07')}
            disabled={isRunning}
            className={`flex items-center gap-2 text-left px-2.5 py-1.5 rounded-lg border font-semibold transition cursor-pointer disabled:opacity-60 min-w-0 ${
              activeScenario === 'shop3_weather_25day_prediction'
                ? 'bg-[#C93B2B] border-[#C93B2B] text-white shadow-sm'
                : 'bg-[#F5F8FC] border-[#DCE4EE] text-[#14213D] hover:bg-[#FDF2F2] hover:border-[#F8CACA]'
            }`}
          >
            <CloudSun className={`h-3.5 w-3.5 shrink-0 ${activeScenario === 'shop3_weather_25day_prediction' ? 'text-[#FEF3C7]' : 'text-[#C93B2B]'}`} />
            <div className="min-w-0 leading-tight">
              <div className="text-[11px] font-bold truncate">3. Shop 3: Plano 25d Weather</div>
              <div className={`text-[10px] truncate ${activeScenario === 'shop3_weather_25day_prediction' ? 'text-[#FCE4E4]' : 'text-[#526582]'}`}>
                104.2°F Heat Dome Forecast
              </div>
            </div>
          </button>

          <button
            onClick={() => triggerLiveScenario('shop4_social_media_event_spike', 'STORE-ARL-11')}
            disabled={isRunning}
            className={`flex items-center gap-2 text-left px-2.5 py-1.5 rounded-lg border font-semibold transition cursor-pointer disabled:opacity-60 min-w-0 ${
              activeScenario === 'shop4_social_media_event_spike'
                ? 'bg-[#6D28D9] border-[#6D28D9] text-white shadow-sm'
                : 'bg-[#F5F8FC] border-[#DCE4EE] text-[#14213D] hover:bg-[#F5F3FF] hover:border-[#DDD6FE]'
            }`}
          >
            <Users className={`h-3.5 w-3.5 shrink-0 ${activeScenario === 'shop4_social_media_event_spike' ? 'text-[#EDE9FE]' : 'text-[#6D28D9]'}`} />
            <div className="min-w-0 leading-tight">
              <div className="text-[11px] font-bold truncate">4. Shop 4: Arlington Social</div>
              <div className={`text-[10px] truncate ${activeScenario === 'shop4_social_media_event_spike' ? 'text-[#EDE9FE]' : 'text-[#526582]'}`}>
                18.5k Marathon Viral Buzz
              </div>
            </div>
          </button>
        </div>
      </div>

      {/* 2. Parallel Synchronized Grid: 3-Tier Map (Left 7 Cols) + Live Stream & Multi-Agent Panel (Right 5 Cols) */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 flex-1">
        {/* LEFT COLUMN (7 Cols): Live 3-Tier Supply Chain Network Map (Top-anchored, never shifts down) */}
        <div className="xl:col-span-7 xl:self-start bg-white border border-[#DCE4EE] rounded-2xl p-4 shadow-enterprise flex flex-col justify-start space-y-3.5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[#DCE4EE] pb-2.5">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="font-serif text-sm font-bold text-[#14213D]">
                  Live 3-Tier Supply Chain Network Map (Factory &rarr; Warehouses &rarr; Retail Shops)
                </h2>
                {(dbMeta.firestore || dbMeta.bigquery) && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-bold bg-[#EEFBF6] text-[#095C47] border border-[#B8EAD8]">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#0D7A5F]" />
                    Live DB Synced
                  </span>
                )}
              </div>
              <p className="text-[11px] text-[#526582]">
                {phase === 'IDLE'
                  ? 'All stock numbers loaded live from Firestore & BigQuery. Click any shop/warehouse to inspect live DB stock, or run a stream above.'
                  : `Active Stream on ${getNodeDisplayName(activeScenarioStoreId)} • Phase: ${phase.replace(/_/g, ' ')}`}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3 text-[11px] font-semibold">
              <span className="flex items-center space-x-1.5 text-[#095C47]">
                <span className="h-2.5 w-2.5 rounded-full bg-[#0D7A5F] inline-block" />
                <span>Retail STO</span>
              </span>
              <span className="flex items-center space-x-1.5 text-[#925802]">
                <span className="h-2.5 w-2.5 rounded-full bg-[#C27803] inline-block" />
                <span>B2B FMCG PO</span>
              </span>
              <span className="flex items-center space-x-1.5 text-[#9E2B1E]">
                <span className="h-2.5 w-2.5 rounded-full bg-[#C93B2B] inline-block" />
                <span>Spike Alert</span>
              </span>
            </div>
          </div>

          {/* Interactive SVG Network Flow Diagram with Retail Swimlane Tier Headers */}
          <div className="w-full bg-[#F5F8FC] border border-[#DCE4EE] rounded-2xl p-2.5 overflow-x-auto">
            <svg viewBox="0 0 920 416" className="w-full h-auto min-w-[660px] select-none">
              <defs>
                <marker id="arrow-mint" markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto">
                  <path d="M0,0 L8,4 L0,8 Z" fill="#0D7A5F" />
                </marker>
                <marker id="arrow-amber" markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto">
                  <path d="M0,0 L8,4 L0,8 Z" fill="#C27803" />
                </marker>
              </defs>

              {/* Swimlane Background Bands */}
              <rect x="8" y="6" width="904" height="98" rx="12" fill="#FFFBEB" fillOpacity="0.85" stroke="#FDE68A" strokeWidth="1" />
              <rect x="16" y="12" width="320" height="20" rx="6" fill="#FEF3C7" stroke="#D97706" strokeWidth="1" />
              <text x="26" y="25.5" className="text-[10px] font-bold fill-[#925802] uppercase tracking-wider">
                TIER 1: FMCG MANUFACTURER (BIGQUERY FMCG ERP)
              </text>

              <rect x="8" y="132" width="904" height="106" rx="12" fill="#ECF5FC" fillOpacity="0.85" stroke="#C2DFF3" strokeWidth="1" />
              <rect x="16" y="138" width="322" height="20" rx="6" fill="#D6EAF8" stroke="#0E5A8A" strokeWidth="1" />
              <text x="26" y="151.5" className="text-[10px] font-bold fill-[#094266] uppercase tracking-wider">
                TIER 2: RETAIL WAREHOUSES (BIGQUERY RETAIL ERP)
              </text>

              <rect x="8" y="268" width="904" height="140" rx="12" fill="#EBF1F8" fillOpacity="0.7" stroke="#DCE4EE" strokeWidth="1" />
              <rect x="16" y="274" width="318" height="20" rx="6" fill="#DCE4EE" stroke="#9BB0C9" strokeWidth="1" />
              <text x="26" y="287.5" className="text-[10px] font-bold fill-[#14213D] uppercase tracking-wider">
                TIER 3: RETAIL SHOPS (FIRESTORE LIVE SHELF)
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
                      <g transform={`translate(${(factoryPos.x + dcPos.x) / 2 - 90}, 108)`}>
                        <rect width="180" height="21" rx="10" fill="#FFFBEB" stroke="#C27803" strokeWidth="1.5" />
                        <text x="90" y="14" textAnchor="middle" className="text-[10px] font-bold fill-[#925802]">
                          B2B FMCG PO: {unitsTransferred.toLocaleString()} Packs ($8.79)
                        </text>
                      </g>
                    )}
                  </g>
                );
              })}

              {/* Connections: 3 Warehouses -> 6 Retail Shops */}
              {Object.entries(storePositions).map(([storeId, stPos]) => {
                const dcPos = dcPositions[stPos.servingDc];
                const isActiveTarget = hasCommonOutput && activeScenarioStoreId === storeId;
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
                      <g transform={`translate(${(dcPos.x + stPos.x) / 2 - 74}, 244)`}>
                        <rect
                          width="148"
                          height="21"
                          rx="10"
                          fill={isFactoryPO ? '#FFFBEB' : '#EEFBF6'}
                          stroke={isFactoryPO ? '#C27803' : '#0D7A5F'}
                          strokeWidth="1.5"
                        />
                        <text
                          x="74"
                          y="14"
                          textAnchor="middle"
                          className={`text-[10px] font-bold ${isFactoryPO ? 'fill-[#925802]' : 'fill-[#095C47]'}`}
                        >
                          +{unitsTransferred.toLocaleString()} Packs (${freightCost})
                        </text>
                      </g>
                    )}
                  </g>
                );
              })}

              {/* Tier 1 Node: Waco Bottling Factory */}
              <g
                transform={`translate(${factoryPos.x - 150}, ${factoryPos.y - 25})`}
                onClick={() => setSelectedNode('FMCG-PLANT-TX01')}
                className="cursor-pointer"
              >
                <rect
                  width="300"
                  height="52"
                  rx="12"
                  fill={hasCommonOutput && isFactoryPO ? '#FFFBEB' : '#FFFFFF'}
                  stroke={
                    selectedNode === 'FMCG-PLANT-TX01'
                      ? '#0E5A8A'
                      : hasCommonOutput && isFactoryPO
                      ? '#C27803'
                      : '#9BB0C9'
                  }
                  strokeWidth={selectedNode === 'FMCG-PLANT-TX01' || (hasCommonOutput && isFactoryPO) ? 2.75 : 1.5}
                />
                <circle cx="26" cy="26" r="15" fill={hasCommonOutput && isFactoryPO ? '#C27803' : '#FEF3C7'} />
                <text x="26" y="31" textAnchor="middle" className="text-sm">
                  🏭
                </text>
                <text x="50" y="21" className="text-[11.5px] font-bold fill-[#14213D]">
                  Waco Bottling Factory (FMCG-PLANT-TX01)
                </text>
                <text x="50" y="38" className="text-[10px] font-bold fill-[#0D7A5F]">
                  Spare ATP: {factorySpare.toLocaleString()} packs ($8.79/pack wholesale)
                </text>
              </g>

              {/* Tier 2 Nodes: 3 Regional Warehouses */}
              {Object.entries(dcPositions).map(([dcId, dcPos]) => {
                const dcInv = inventory[dcId] || HEALTHY_FALLBACK_INVENTORY[dcId];
                const isLow = dcInv.atp_surplus < 500;
                const isActiveDc = activeDonorDcId === dcId;
                const isSelected = selectedNode === dcId;

                return (
                  <g
                    key={dcId}
                    transform={`translate(${dcPos.x - 110}, ${dcPos.y - 28})`}
                    onClick={() => setSelectedNode(dcId)}
                    className="cursor-pointer"
                  >
                    <rect
                      width="220"
                      height="60"
                      rx="12"
                      fill={isLow && activeScenario === 'shop2_dc_shortage_fmcg_po' ? '#FDF2F2' : isActiveDc ? '#EEFBF6' : '#FFFFFF'}
                      stroke={
                        isSelected
                          ? '#0E5A8A'
                          : isLow && activeScenario === 'shop2_dc_shortage_fmcg_po'
                          ? '#C93B2B'
                          : isActiveDc
                          ? '#0D7A5F'
                          : '#9BB0C9'
                      }
                      strokeWidth={isSelected || isActiveDc || (isLow && activeScenario === 'shop2_dc_shortage_fmcg_po') ? 2.75 : 1.5}
                    />
                    <text x="12" y="19" className="text-[11px] font-bold fill-[#14213D]">
                      🏢 {dcPos.shortName} ({dcId})
                    </text>
                    <text
                      x="12"
                      y="36"
                      className={`text-[10.5px] font-bold ${isLow ? 'fill-[#C27803]' : 'fill-[#0D7A5F]'}`}
                    >
                      {isLow
                        ? `⚠️ Only ${dcInv.atp_surplus.toLocaleString()} Spare ATP`
                        : `✅ ${dcInv.atp_surplus.toLocaleString()} Spare ATP`}
                    </text>
                    <text x="12" y="50" className="text-[9px] font-medium fill-[#526582]">
                      On-Hand: {dcInv.on_hand.toLocaleString()} • Reserve: {dcInv.safety_buffer.toLocaleString()}
                    </text>
                  </g>
                );
              })}

              {/* Tier 3 Nodes: 6 Retail Shops (Unified Shop 1..6 Naming + Live DB Stock) */}
              {Object.entries(storePositions).map(([storeId, stPos]) => {
                const stInv = inventory[storeId] || HEALTHY_FALLBACK_INVENTORY[storeId];
                const isActiveSpikeStore = activeScenario !== null && activeScenarioStoreId === storeId;
                const isSelected = selectedNode === storeId;
                const vel = stInv.current_velocity || stInv.burn_rate_base || 45;
                const inbound = stInv.reserved || 0;

                return (
                  <g
                    key={storeId}
                    transform={`translate(${stPos.x - 67}, ${stPos.y - 36})`}
                    onClick={() => setSelectedNode(storeId)}
                    className="cursor-pointer"
                  >
                    {isActiveSpikeStore && (
                      <rect
                        x="-4"
                        y="-4"
                        width="142"
                        height="86"
                        rx="14"
                        fill="none"
                        stroke="#C93B2B"
                        strokeWidth="2.5"
                        strokeDasharray="5 3"
                      />
                    )}
                    <rect
                      width="134"
                      height="78"
                      rx="11"
                      fill={isActiveSpikeStore ? '#FDF2F2' : isSelected ? '#ECF5FC' : '#FFFFFF'}
                      stroke={isActiveSpikeStore ? '#C93B2B' : isSelected ? '#0E5A8A' : '#9BB0C9'}
                      strokeWidth={isActiveSpikeStore || isSelected ? 2.5 : 1.5}
                    />
                    <text x="67" y="17" textAnchor="middle" className="text-[10.5px] font-bold fill-[#14213D]">
                      🏪 {stPos.shopLabel}
                    </text>
                    <text x="67" y="29" textAnchor="middle" className="text-[8.5px] font-mono fill-[#526582]">
                      {storeId}
                    </text>
                    <text
                      x="67"
                      y="44"
                      textAnchor="middle"
                      className={`text-[10px] font-bold ${isActiveSpikeStore ? 'fill-[#C93B2B]' : 'fill-[#0D7A5F]'}`}
                    >
                      {isActiveSpikeStore ? `🔥 ${vel}/hr Spike` : `Normal (${vel}/hr)`}
                    </text>
                    <text x="67" y="58" textAnchor="middle" className="text-[10px] font-semibold fill-[#3B4E6B]">
                      Shelf: {stInv.on_hand} packs
                    </text>
                    {inbound > 0 ? (
                      <text x="67" y="71" textAnchor="middle" className="text-[9px] font-bold fill-[#0D7A5F]">
                        +{inbound.toLocaleString()} Inbound
                      </text>
                    ) : isCompleted && isActiveSpikeStore && isPendingApproval ? (
                      <text x="67" y="71" textAnchor="middle" className="text-[9px] font-bold fill-[#C27803]">
                        ⏳ In VP A2A Queue
                      </text>
                    ) : (
                      <text x="67" y="71" textAnchor="middle" className="text-[8.5px] fill-[#526582]">
                        Click to inspect DB
                      </text>
                    )}
                  </g>
                );
              })}
            </svg>
          </div>

          {/* Bottom of Left Column: Live DB Inspector for Selected Node (Identical Canonical Name!) */}
          <div className="bg-[#F5F8FC] border border-[#DCE4EE] rounded-xl p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="space-y-1">
              <div className="flex items-center space-x-2">
                <Package className="h-4 w-4 text-[#0E5A8A]" />
                <span className="text-xs font-bold text-[#14213D]">
                  Live DB Stock — {focusedNodeDisplay}
                </span>
                <span className="text-[9px] font-mono font-bold px-1.5 py-0.5 rounded bg-white border border-[#DCE4EE] text-[#0E5A8A]">
                  {focusedNodeId.startsWith('STORE-')
                    ? 'Firestore: store_live_shelf'
                    : focusedNodeId.startsWith('FMCG-')
                    ? 'BigQuery: fmcg_factory_inventory'
                    : 'BigQuery: retail_erp_inventory'}
                </span>
              </div>
              {focusedNodeId.startsWith('STORE-') ? (
                <p className="text-[11px] text-[#3B4E6B]">
                  Checkout Velocity:{' '}
                  <strong
                    className={
                      (focusedInv.current_velocity || 48) >= (focusedInv.burn_rate_base || 48) * 1.8
                        ? 'text-[#C93B2B]'
                        : 'text-[#0D7A5F]'
                    }
                  >
                    {focusedInv.current_velocity || 48} packs/hr
                  </strong>{' '}
                  (Baseline: {focusedInv.burn_rate_base || 48}/hr) • Live Shelf:{' '}
                  <strong className="text-[#14213D]">{focusedInv.on_hand} packs</strong> (Safety Reserve:{' '}
                  {focusedInv.safety_buffer} packs)
                  {(focusedInv.reserved || 0) > 0 && (
                    <>
                      {' '}• Inbound Order:{' '}
                      <strong className="text-[#0D7A5F]">+{focusedInv.reserved?.toLocaleString()} packs</strong>
                    </>
                  )}
                </p>
              ) : (
                <p className="text-[11px] text-[#3B4E6B]">
                  On-Hand Stock: <strong className="text-[#14213D]">{focusedInv.on_hand.toLocaleString()} packs</strong> •
                  Safety Reserve: <strong>{focusedInv.safety_buffer.toLocaleString()} packs</strong> • Available Spare ATP:{' '}
                  <strong className={focusedInv.atp_surplus < 500 ? 'text-[#C27803]' : 'text-[#0D7A5F]'}>
                    {focusedInv.atp_surplus.toLocaleString()} packs
                  </strong>
                </p>
              )}
            </div>

            {isCompleted && activeScenarioStoreId === focusedNodeId && (
              <div className="flex items-center space-x-3 shrink-0">
                <div className="text-right">
                  <div className="text-[10px] uppercase font-bold text-[#526582]">
                    {isPendingApproval ? 'Pending VP Authorization' : 'After Replenishment'}
                  </div>
                  <div className="text-xs font-mono font-bold text-[#0D7A5F]">
                    {(focusedInv.on_hand + unitsTransferred).toLocaleString()} Packs • +${netProfitProtected.toLocaleString()} Net Profit
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* RIGHT COLUMN (5 Cols): Live Telemetry Stream Console + Multi-Agent & 4-Gate Execution */}
        <div className="xl:col-span-5 bg-white border border-[#DCE4EE] rounded-2xl p-4 shadow-enterprise flex flex-col justify-start space-y-3">
          {/* Right Panel Header */}
          <div className="flex items-center justify-between border-b border-[#DCE4EE] pb-2.5">
            <div className="flex items-center space-x-2.5 min-w-0">
              <div className="h-8 w-8 rounded-lg bg-[#0E5A8A] text-white flex items-center justify-center shrink-0">
                <Cpu className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <h2 className="font-serif text-sm font-bold text-[#14213D] truncate">
                    NexusTwin AI Multi-Agent &amp; 4-Gate Execution
                  </h2>
                  {lastDecision?.remote_executed && (
                    <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded bg-[#EEFBF6] text-[#095C47] border border-[#B8EAD8] shrink-0">
                      Live Agent Engine
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-[#526582] truncate">
                  Live Stream &rarr; Spike Trigger &rarr; MCP Agents &rarr; 4-Gate Guardrail &rarr; ERP / A2A
                </p>
              </div>
            </div>

            {hasCommonOutput && (
              <button
                onClick={() => setShowCommonJson((prev) => !prev)}
                className="flex items-center space-x-1 text-[11px] font-semibold bg-[#F5F8FC] hover:bg-[#ECF5FC] text-[#0E5A8A] border border-[#DCE4EE] px-2.5 py-1 rounded-lg transition cursor-pointer shrink-0"
              >
                <FileJson className="h-3.5 w-3.5" />
                <span>{showCommonJson ? 'Hide JSON' : 'Real JSON'}</span>
              </button>
            )}
          </div>

          {/* LIVE TELEMETRY STREAM CONSOLE (Always shown when streaming; collapsible summary once done) */}
          {streamPackets.length > 0 && (
            <div className="rounded-xl border border-[#C2DFF3] bg-[#F5F8FC] overflow-hidden">
              <button
                onClick={() => setShowStreamConsole((prev) => !prev)}
                className="w-full px-3 py-2 bg-[#ECF5FC] border-b border-[#C2DFF3] flex items-center justify-between text-left cursor-pointer"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <Activity
                    className={`h-3.5 w-3.5 shrink-0 ${
                      phase === 'STREAMING_TELEMETRY' ? 'text-[#0E5A8A] animate-pulse' : 'text-[#0D7A5F]'
                    }`}
                  />
                  <span className="text-[11px] font-bold text-[#094266] truncate">
                    Live Telemetry Stream ({streamPackets.length}/{latestPacket?.total_ticks || 5} packets)
                    {latestPacket?.store_id ? ` · ${getNodeShortName(latestPacket.store_id)}` : ''}
                  </span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {latestPacket && (
                    <span
                      className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded-full border ${
                        latestPacket.threshold_breached
                          ? 'bg-[#FDF2F2] text-[#C93B2B] border-[#F8CACA]'
                          : 'bg-white text-[#0E5A8A] border-[#C2DFF3]'
                      }`}
                    >
                      {latestPacket.temp_f
                        ? `${latestPacket.temp_f}°F (${latestPacket.forecast_day})`
                        : latestPacket.buzz_score
                        ? `Buzz ${latestPacket.buzz_score}/100`
                        : `${latestPacket.velocity}/hr · Shelf ${latestPacket.on_hand}`}
                    </span>
                  )}
                  {showStreamConsole ? (
                    <ChevronUp className="h-3.5 w-3.5 text-[#526582]" />
                  ) : (
                    <ChevronDown className="h-3.5 w-3.5 text-[#526582]" />
                  )}
                </div>
              </button>

              {showStreamConsole && (
                <div className="p-2.5 space-y-2">
                  {/* Live Threshold Bar */}
                  {latestPacket && (
                    <div className="space-y-1">
                      <div className="flex justify-between text-[10px] font-semibold text-[#526582]">
                        <span>
                          {latestPacket.temp_f
                            ? `25-Day Peak Forecast Progress (Trigger >= 100°F)`
                            : latestPacket.buzz_score
                            ? `Viral Social Buzz Score (Trigger >= 85/100)`
                            : `Checkout Velocity vs Spike Threshold (Trigger >= 2.0x / Shelf < ${latestPacket.safety_buffer || 250})`}
                        </span>
                        <span className={latestPacket.threshold_breached ? 'text-[#C93B2B] font-bold' : 'text-[#0E5A8A] font-bold'}>
                          {latestPacket.threshold_breached
                            ? 'THRESHOLD BREACHED!'
                            : latestPacket.spike_ratio
                            ? `${latestPacket.spike_ratio}x baseline`
                            : 'Monitoring...'}
                        </span>
                      </div>
                      <div className="w-full h-1.5 bg-[#DCE4EE] rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all duration-300 ${
                            latestPacket.threshold_breached
                              ? 'bg-[#C93B2B]'
                              : (latestPacket.spike_ratio || 1) >= 1.8
                              ? 'bg-[#C27803]'
                              : 'bg-[#0E5A8A]'
                          }`}
                          style={{
                            width: `${Math.min(
                              100,
                              latestPacket.temp_f
                                ? Math.round(((latestPacket.temp_f - 65) / 42) * 100)
                                : latestPacket.buzz_score
                                ? Math.round(latestPacket.buzz_score)
                                : Math.round(((latestPacket.spike_ratio || 1) / 4.5) * 100)
                            )}%`,
                          }}
                        />
                      </div>
                    </div>
                  )}

                  {/* Scrolling Live Packets */}
                  <div className="max-h-36 overflow-y-auto space-y-1 pr-0.5 font-mono text-[10px]">
                    {streamPackets.map((pkt, idx) => (
                      <div
                        key={`${pkt.tick}-${idx}`}
                        className={`px-2 py-1.5 rounded-lg border flex items-center justify-between gap-2 ${
                          pkt.threshold_breached
                            ? 'bg-[#FDF2F2] border-[#F8CACA] text-[#9E2B1E] font-bold'
                            : 'bg-white border-[#DCE4EE] text-[#3B4E6B]'
                        }`}
                      >
                        <div className="min-w-0 truncate">
                          <span className="text-[#526582] mr-1.5">
                            [#{pkt.tick}]
                          </span>
                          <span>{pkt.note}</span>
                        </div>
                        <span className="shrink-0 font-bold text-[#14213D]">
                          {pkt.units_sold ? `-${pkt.units_sold} → ` : ''}Shelf {pkt.on_hand}
                        </span>
                      </div>
                    ))}
                    <div ref={streamEndRef} />
                  </div>
                </div>
              )}
            </div>
          )}

          {/* SPIKE TRIGGERED -> ANIMATED MULTI-AGENT EXECUTION STEPPER */}
          {(phase === 'ALERT_TRIGGERED' || phase === 'AGENT_PROCESSING' || isCompleted) && (
            <div className="rounded-xl border border-[#DCE4EE] bg-[#F5F8FC] p-2.5 space-y-2">
              {liveAlertBanner && (phase === 'ALERT_TRIGGERED' || phase === 'AGENT_PROCESSING') && (
                <div className="flex items-start gap-2 bg-[#FDF2F2] border border-[#F8CACA] text-[#9E2B1E] rounded-lg px-2.5 py-2 text-[11px] font-bold">
                  <BellRing className="h-4 w-4 text-[#C93B2B] animate-pulse shrink-0 mt-0.5" />
                  <span>{liveAlertBanner}</span>
                </div>
              )}

              {/* 5-Stage Live Stepper Pills */}
              <div className="grid grid-cols-5 gap-1">
                {PIPELINE_STAGES.map((st) => {
                  const isDone = isCompleted || completedStages.includes(st.id);
                  const isActive = !isCompleted && activePipelineStage === st.id;
                  const isA2APause = isCompleted && st.id === 'execution_a2a' && isPendingApproval;
                  return (
                    <div
                      key={st.id}
                      className={`px-1.5 py-1.5 rounded-lg border text-center transition-all ${
                        isA2APause
                          ? 'bg-[#FFFBEB] border-[#FDE68A] text-[#925802]'
                          : isDone
                          ? 'bg-[#EEFBF6] border-[#B8EAD8] text-[#095C47]'
                          : isActive
                          ? 'bg-[#ECF5FC] border-[#0E5A8A] text-[#094266] ring-1 ring-[#0E5A8A]/30'
                          : 'bg-white border-[#DCE4EE] text-[#647896]'
                      }`}
                    >
                      <div className="flex items-center justify-center mb-0.5">
                        {isActive ? (
                          <Loader2 className="h-3 w-3 animate-spin text-[#0E5A8A]" />
                        ) : isA2APause ? (
                          <AlertTriangle className="h-3 w-3 text-[#C27803]" />
                        ) : isDone ? (
                          <CheckCircle2 className="h-3 w-3 text-[#0D7A5F]" />
                        ) : (
                          <span className="h-2 w-2 rounded-full bg-[#C4D0E0]" />
                        )}
                      </div>
                      <div className="text-[9px] font-bold leading-tight truncate">{st.label}</div>
                    </div>
                  );
                })}
              </div>

              {/* Live Streaming Vertex AI Agent Engine Activity Line */}
              {phase === 'AGENT_PROCESSING' && (
                <div className="flex items-center justify-between gap-2 bg-white border border-[#C2DFF3] rounded-lg px-2.5 py-1.5 text-[11px] text-[#094266]">
                  <div className="flex items-center gap-2 min-w-0">
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-[#0E5A8A] shrink-0" />
                    <span className="font-semibold truncate">{agentStatusMsg}</span>
                  </div>
                  <span className="text-[9px] font-mono text-[#526582] shrink-0">
                    {liveSteps.length} live events
                  </span>
                </div>
              )}
            </div>
          )}

          {/* IDLE STATE: Clean Standby View Before Any Scenario Is Triggered */}
          {phase === 'IDLE' && (
            <div className="flex-1 flex flex-col items-center justify-center text-center p-6 bg-[#F5F8FC] border border-dashed border-[#C4D0E0] rounded-xl space-y-3">
              <div className="h-12 w-12 rounded-2xl bg-[#ECF5FC] text-[#0E5A8A] border border-[#C2DFF3] flex items-center justify-center">
                <Radio className="h-6 w-6" />
              </div>
              <div className="space-y-1 max-w-sm">
                <h3 className="font-serif text-sm font-bold text-[#14213D]">
                  Control Tower Standby — Live DB Connected
                </h3>
                <p className="text-xs text-[#3B4E6B] leading-relaxed">
                  Choose a streaming speed (<strong>0.5x / 1x / 2x</strong>) and start any of the{' '}
                  <strong>4 Scenario Streams</strong> above to watch live sales decrement Firestore stock and trigger the Vertex AI Multi-Agent Swarm.
                </p>
              </div>
              <div className="w-full max-w-md bg-white border border-[#DCE4EE] rounded-xl p-3 text-left text-[11px] text-[#3B4E6B] space-y-1.5">
                <div className="font-bold text-[#14213D] uppercase tracking-wider text-[10px]">
                  Zero-Trust Retail ↔ FMCG Execution Flow:
                </div>
                <div>1. <strong>Live Telemetry Stream:</strong> Decrements real Firestore shelf stock &amp; syncs BigQuery Retail ERP on spike breach.</div>
                <div>2. <strong>3 MCP Agents:</strong> Query <code>bigquery-telemetry-mcp</code>, <code>erp-inventory-mcp</code> (isolated Retail vs FMCG tables), &amp; <code>logistics-rates-mcp</code>.</div>
                <div>3. <strong>In-Loop 4-Gate Guardrail:</strong> Verifies ATP, Delivery SLA, Margin ROI &amp; $1,000 B2B Cap <em>before</em> execution.</div>
                <div>4. <strong>ERP STO / Cloud Run Remote A2A:</strong> Auto-executes &le; $1k STO, or pauses &gt; $1k FMCG PO via <code>approval_agent</code> until VP resumes in Tab 5.</div>
              </div>
            </div>
          )}

          {/* OPTIONAL: Real Standardized JSON Inspector */}
          {hasCommonOutput && showCommonJson && (
            <div className="bg-[#14213D] text-[#D5F5E9] p-3 rounded-xl text-[10px] font-mono max-h-52 overflow-y-auto">
              <div className="text-[#9BB0C9] font-bold mb-1">
                // Real MultiAgentCommonOutput + 4-Gate Verification (Session: {lastDecision?.vertex_session_id || 'local'})
              </div>
              <pre className="whitespace-pre-wrap">
                {JSON.stringify({ common_agent_output: commonOut, gate_evaluation: gateEval }, null, 2)}
              </pre>
            </div>
          )}

          {/* POPULATED STATE: Real Multi-Agent Outputs -> 4-Gate Guardrail -> Final ERP / A2A Status */}
          {hasCommonOutput && (
            <div className="space-y-2.5 flex-1">
              {/* AGENT 1 OUTPUT: Market Sensing Agent */}
              <div className="rounded-xl border border-[#DCE4EE] bg-[#F5F8FC] p-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center space-x-2 min-w-0">
                    <span className="h-5 w-5 rounded-full bg-[#0E5A8A] text-white text-[10px] font-bold flex items-center justify-center shrink-0">
                      1
                    </span>
                    <span className="text-xs font-bold text-[#14213D] truncate">
                      Market Sensing (<code className="text-[#0E5A8A] font-mono">{sensingOut.agent_name}</code>)
                    </span>
                  </div>
                  <span className="text-[10px] font-bold bg-[#ECF5FC] text-[#0E5A8A] border border-[#C2DFF3] px-2 py-0.5 rounded-full shrink-0">
                    bigquery-telemetry-mcp
                  </span>
                </div>
                <div className="mt-1.5 pl-7 space-y-1 text-[11px]">
                  <div className="bg-white border border-[#DCE4EE] rounded-lg px-2.5 py-1.5 font-mono text-[11px] text-[#14213D] flex flex-wrap items-center justify-between gap-2">
                    <span>
                      {getNodeShortName(sensingOut.store_id)}: <strong>{sensingOut.observed_velocity_hr}/hr</strong> &divide;{' '}
                      {sensingOut.baseline_velocity_hr}/hr ={' '}
                      <strong className="text-[#C93B2B]">{sensingOut.velocity_spike_ratio}x</strong>
                    </span>
                    <span className="text-[#C93B2B] font-bold">
                      DB Shelf: {sensingOut.current_shelf_stock} packs (Res: {sensingOut.safety_buffer})
                    </span>
                  </div>
                  <p className="text-[11px] text-[#3B4E6B] leading-snug">{sensingOut.finding_summary}</p>
                </div>
              </div>

              {/* AGENT 2 OUTPUT: Stock & Replenishment Agent (Retail ERP + Isolated FMCG B2B) */}
              <div
                className={`rounded-xl border p-3 ${
                  isFactoryPO ? 'bg-[#FFFBEB] border-[#FDE68A]' : 'bg-[#F5F8FC] border-[#DCE4EE]'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center space-x-2 min-w-0">
                    <span className="h-5 w-5 rounded-full bg-[#0E5A8A] text-white text-[10px] font-bold flex items-center justify-center shrink-0">
                      2
                    </span>
                    <span className="text-xs font-bold text-[#14213D] truncate">
                      Replenishment (<code className="text-[#0E5A8A] font-mono">{repOut.agent_name}</code>)
                    </span>
                  </div>
                  <span
                    className={`text-[10px] font-bold px-2 py-0.5 rounded-full border shrink-0 ${
                      isFactoryPO
                        ? 'bg-[#FEF3C7] text-[#925802] border-[#FDE68A]'
                        : 'bg-[#EEFBF6] text-[#095C47] border-[#B8EAD8]'
                    }`}
                  >
                    {isFactoryPO ? 'Retail ERP -> FMCG B2B MCP' : 'Retail ERP BigQuery MCP'}
                  </span>
                </div>
                <div className="mt-1.5 pl-7 space-y-1 text-[11px]">
                  <div className="bg-white border border-[#DCE4EE] rounded-lg px-2.5 py-1.5 text-[#14213D]">
                    <div>{repOut.finding_summary}</div>
                    {repOut.supplier_negotiation_summary && (
                      <div className="mt-1 text-[10px] text-[#094266] bg-[#ECF5FC] px-2 py-1 rounded border border-[#C2DFF3] font-medium">
                        🤝 <strong>Source &amp; Terms:</strong> {repOut.supplier_negotiation_summary}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* AGENT 3 OUTPUT: Carrier & Logistics Agent */}
              <div className="rounded-xl border border-[#DCE4EE] bg-[#F5F8FC] p-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center space-x-2 min-w-0">
                    <span className="h-5 w-5 rounded-full bg-[#0E5A8A] text-white text-[10px] font-bold flex items-center justify-center shrink-0">
                      3
                    </span>
                    <span className="text-xs font-bold text-[#14213D] truncate">
                      Logistics (<code className="text-[#0E5A8A] font-mono">{logOut.agent_name}</code>)
                    </span>
                  </div>
                  <span className="text-[10px] font-mono font-bold bg-[#EBF1F8] text-[#14213D] border border-[#DCE4EE] px-2 py-0.5 rounded-full shrink-0">
                    {logOut.transit_hours}h &le; {logOut.sla_window_hours}h • ${logOut.freight_cost_usd.toLocaleString()}
                  </span>
                </div>
                <div className="mt-1.5 pl-7 space-y-1 text-[11px] text-[#3B4E6B]">
                  <div>{logOut.finding_summary}</div>
                  {logOut.carrier_negotiation_summary && (
                    <div className="text-[10px] text-[#095C47] bg-[#EEFBF6] px-2 py-1 rounded border border-[#B8EAD8] font-medium">
                      🚚 <strong>3PL Carrier Selection:</strong> {logOut.carrier_negotiation_summary}
                    </div>
                  )}
                </div>
              </div>

              {/* STAGE 4: IN-LOOP DETERMINISTIC 4-GATE GUARDRAIL */}
              {hasGateChecked && (
                <div className="rounded-xl border border-[#C2DFF3] bg-[#ECF5FC]/70 p-3">
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <div className="flex items-center space-x-2 min-w-0">
                      <span className="h-5 w-5 rounded-full bg-[#094266] text-white text-[10px] font-bold flex items-center justify-center shrink-0">
                        4
                      </span>
                      <span className="text-xs font-bold text-[#14213D] flex items-center gap-1 truncate">
                        <Calculator className="h-3.5 w-3.5 text-[#0E5A8A] shrink-0" />
                        <span className="truncate">4-Gate Mathematical Guardrail (Verified Pre-Action)</span>
                      </span>
                    </div>
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded-full border shrink-0 ${
                        isPendingApproval
                          ? 'bg-[#FFFBEB] text-[#925802] border-[#FDE68A]'
                          : 'bg-[#EEFBF6] text-[#095C47] border-[#B8EAD8]'
                      }`}
                    >
                      {isPendingApproval ? 'GATES 1-3 PASS • GATE 4 VP PAUSE' : 'ALL 4 GATES PASSED'}
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 text-[11px]">
                    {(gateEval.rules_evaluated || []).map((rule: any, idx: number) => {
                      const shortTitles = [
                        '1. ATP Integrity',
                        '2. Delivery SLA',
                        '3. Margin ROI',
                        '4. $1k / B2B Authority',
                      ];
                      const isGate4ApprovedLater = idx === 3 && !isPendingApproval && lastDecision?.gate_status === 'APPROVED';
                      const passedDisplay = rule.passed || isGate4ApprovedLater;
                      return (
                        <div
                          key={rule.rule_name}
                          className={`rounded-lg p-2 border flex flex-col justify-between ${
                            passedDisplay ? 'bg-white border-[#B8EAD8]' : 'bg-[#FFFBEB] border-[#FDE68A]'
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-bold text-[#14213D]">{shortTitles[idx] || rule.rule_name}</span>
                            <span
                              className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                                passedDisplay ? 'bg-[#EEFBF6] text-[#0D7A5F]' : 'bg-[#FEF3C7] text-[#925802]'
                              }`}
                            >
                              {passedDisplay ? 'PASS ✓' : 'A2A PAUSE ⏳'}
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

              {/* STAGE 5: FINAL VERIFIED ERP EXECUTION OR REMOTE A2A WAITING RESPONSE */}
              {isCompleted && (
                <div
                  className={`rounded-xl border p-3.5 ${
                    isPendingApproval ? 'bg-[#FFFBEB] border-[#FDE68A]' : 'bg-[#EEFBF6] border-[#B8EAD8]'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center space-x-2 min-w-0">
                      <span
                        className={`h-5 w-5 rounded-full text-white text-[10px] font-bold flex items-center justify-center shrink-0 ${
                          isPendingApproval ? 'bg-[#C27803]' : 'bg-[#0D7A5F]'
                        }`}
                      >
                        5
                      </span>
                      <span className="text-xs font-bold text-[#14213D] truncate">
                        {isPendingApproval
                          ? 'Remote A2A Agent Paused (State: input-required)'
                          : isFactoryPO
                          ? 'VP Resumed A2A Session -> B2B FMCG PO Dispatched'
                          : 'Autonomous SAP STO Executed via ERP MCP'}
                      </span>
                    </div>
                    <span
                      className={`text-[11px] font-mono font-bold px-2.5 py-0.5 rounded-lg border shrink-0 ${
                        isPendingApproval
                          ? 'bg-white text-[#925802] border-[#FDE68A]'
                          : 'bg-white text-[#095C47] border-[#B8EAD8]'
                      }`}
                    >
                      {isPendingApproval
                        ? lastDecision?.a2a_ticket_id || 'AWAITING VP'
                        : lastDecision?.fmcg_purchase_order_id || lastDecision?.sap_transfer_order_id}
                    </span>
                  </div>

                  {isPendingApproval && lastDecision?.a2a_agent_response && (
                    <div className="mt-2 ml-7 p-2 bg-white/90 border border-[#FDE68A] rounded-lg text-[11px] text-[#925802] leading-snug">
                      <strong>Remote A2A Response:</strong> {lastDecision.a2a_agent_response}
                    </div>
                  )}

                  <div className="mt-2.5 pl-7 flex flex-wrap items-center justify-between gap-2">
                    {isPendingApproval && onOpenApprovals ? (
                      <button
                        onClick={onOpenApprovals}
                        className="flex items-center space-x-1.5 bg-[#C27803] hover:bg-[#925802] text-white text-xs font-bold px-3.5 py-2 rounded-xl shadow-xs transition cursor-pointer"
                      >
                        <ShieldAlert className="h-4 w-4" />
                        <span>Open Tab 5: Approve &amp; Resume A2A (${totalCommitment.toLocaleString()})</span>
                        <ArrowRight className="h-3.5 w-3.5" />
                      </button>
                    ) : (
                      <div className="flex items-center space-x-1.5 text-[11px] font-bold text-[#095C47]">
                        <CheckCircle2 className="h-4 w-4 text-[#0D7A5F] shrink-0" />
                        <span>
                          BigQuery ERP &amp; Firestore Updated • Net Profit: +${netProfitProtected.toLocaleString()}
                        </span>
                      </div>
                    )}

                    <button
                      onClick={() => setShowRawTrace((prev) => !prev)}
                      className="text-[11px] font-semibold text-[#0E5A8A] hover:text-[#094266] flex items-center space-x-1 cursor-pointer"
                    >
                      <Sparkles className="h-3 w-3" />
                      <span>{showRawTrace ? 'Hide Live Agent Trace' : 'View Live Agent Trace'}</span>
                      {showRawTrace ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                    </button>
                  </div>

                  {showRawTrace && (
                    <div className="mt-2.5 ml-7 space-y-2">
                      {liveSteps.length > 0 && (
                        <div className="p-2 bg-white border border-[#DCE4EE] rounded-lg text-[10px] font-mono text-[#3B4E6B] max-h-32 overflow-y-auto space-y-1">
                          <div className="font-bold text-[#0E5A8A] uppercase">
                            Live ADK &amp; MCP Execution Trace ({liveSteps.length} steps • Session: {lastDecision?.vertex_session_id || 'local'}):
                          </div>
                          {liveSteps.map((st, idx) => (
                            <div key={idx} className="truncate">
                              <span className="text-[#526582]">#{st.step_seq}</span>{' '}
                              <strong className="text-[#14213D]">[{st.agent}]</strong> {st.message}
                            </div>
                          ))}
                        </div>
                      )}
                      <div className="p-2.5 bg-white border border-[#DCE4EE] rounded-lg text-[11px] font-mono text-[#3B4E6B] max-h-40 overflow-y-auto whitespace-pre-wrap">
                        {lastDecision?.agent_response_text || lastDecision?.root_cause_explanation}
                      </div>
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
