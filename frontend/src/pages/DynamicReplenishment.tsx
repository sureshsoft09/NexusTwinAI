import React, { useState, useEffect } from 'react';
import { RefreshCw, Warehouse, Truck, DollarSign, CheckCircle2, ShieldAlert, Play } from 'lucide-react';

export const DynamicReplenishment: React.FC = () => {
  const [twinState, setTwinState] = useState<any>(null);
  const [loading, setLoading] = useState<boolean>(false);

  const fetchLiveState = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/v1/twin/state');
      if (res.ok) {
        const data = await res.json();
        setTwinState(data);
      }
    } catch {
      // Fallback to default values
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLiveState();
  }, []);

  const triggerLiveScenario = async (scenarioKey: string) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/v1/signals/scenario/${scenarioKey}`, { method: 'POST' });
      if (res.ok) {
        await fetchLiveState();
      }
    } catch {
      // Ignore error
    } finally {
      setLoading(false);
    }
  };

  const inv = twinState?.inventory || {};
  const atx = inv['DC-ATX-02']?.['SKU-4089-HYDRATE'] || { on_hand: 4800, safety_buffer: 1200, atp_surplus: 3600 };
  const hou = inv['DC-HOU-01']?.['SKU-4089-HYDRATE'] || { on_hand: 1680, safety_buffer: 1500, atp_surplus: 180 };
  const sat = inv['DC-SAT-03']?.['SKU-4089-HYDRATE'] || { on_hand: 2500, safety_buffer: 900, atp_surplus: 1600 };
  const fmcg = inv['FMCG-PLANT-TX01']?.['SKU-4089-HYDRATE'] || { on_hand: 50000, safety_buffer: 5000, atp_surplus: 45000 };

  const manifest = twinState?.last_manifest || {
    selected_donor_dc: 'DC-ATX-02',
    target_store: 'STORE-DAL-04',
    order_type: 'STO_FROM_DC',
    units_transferred: 1500,
    carrier_name: 'Texas Fleet Logistics (Dedicated)',
    freight_mode: 'LATERAL_GROUND_TRANSFER',
    estimated_freight_cost: 750.0,
    fmcg_po_merchandise_cost: 0,
    total_financial_commitment: 750.0,
    requires_human_approval: false,
    sap_transfer_order_id: 'STO-SAP-99214',
    gate_status: 'APPROVED',
  };

  const units = manifest.units_transferred || 1500;
  const freight = manifest.estimated_freight_cost || 750.0;
  const protectedMargin = Math.round(units * 6.2 * 100) / 100;
  const netValue = Math.round((protectedMargin - freight) * 100) / 100;
  const roiPct = freight > 0 ? Math.round((netValue / freight) * 100) : 1140;

  return (
    <div className="h-full flex flex-col p-6 space-y-6 overflow-y-auto">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-white">Autonomous Dynamic Replenishment</h1>
          <p className="text-xs text-slate-400 mt-1">
            Live Google ADK Replenishment and Logistics Agents connected to Cloud Run FastMCP servers and Vertex AI Agent Engine.
          </p>
        </div>
        <div className="flex items-center space-x-2">
          <button
            onClick={() => triggerLiveScenario('shop1_pos_dc_replenish')}
            disabled={loading}
            className="flex items-center space-x-1.5 text-xs bg-teal-500/20 hover:bg-teal-500/30 text-teal-300 border border-teal-500/40 px-3 py-1.5 rounded-lg font-semibold transition cursor-pointer"
          >
            <Play className="h-3.5 w-3.5" />
            <span>Run DC STO (Shop 1)</span>
          </button>
          <button
            onClick={() => triggerLiveScenario('shop2_dc_shortage_fmcg_po')}
            disabled={loading}
            className="flex items-center space-x-1.5 text-xs bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 px-3 py-1.5 rounded-lg font-semibold transition cursor-pointer"
          >
            <Play className="h-3.5 w-3.5" />
            <span>Run FMCG PO (Shop 2)</span>
          </button>
          <button
            onClick={fetchLiveState}
            disabled={loading}
            className="flex items-center space-x-1 text-xs bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 px-3 py-1.5 rounded-lg transition cursor-pointer"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Sync State</span>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Donor DC Available-to-Promise (ATP) Evaluation */}
        <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <span className="text-xs font-semibold text-slate-300 flex items-center space-x-2">
              <Warehouse className="h-4 w-4 text-teal-400" />
              <span>Donor DC &amp; FMCG Allocation (Live ATP)</span>
            </span>
            <span className="text-[10px] text-teal-400 bg-teal-500/10 px-2 py-0.5 rounded border border-teal-500/20">
              erp_inventory_mcp
            </span>
          </div>

          <div className="space-y-3 text-xs">
            <div className={`p-3 rounded-lg border ${manifest.selected_donor_dc?.includes('DC-ATX-02') ? 'bg-teal-500/10 border-teal-500/30' : 'bg-slate-950 border-slate-800'}`}>
              <div className="flex justify-between items-center mb-1">
                <span className="font-bold text-teal-300">DC-ATX-02 (Austin Central)</span>
                {manifest.selected_donor_dc?.includes('DC-ATX-02') && (
                  <span className="text-[10px] bg-teal-500/20 text-teal-300 px-1.5 py-0.5 rounded font-semibold">ACTIVE DONOR</span>
                )}
              </div>
              <div className="grid grid-cols-2 gap-2 mt-2 text-[11px]">
                <div>
                  <span className="text-slate-400">On-Hand:</span>
                  <span className="ml-1 text-white font-mono font-bold">{atx.on_hand?.toLocaleString()} u</span>
                </div>
                <div>
                  <span className="text-slate-400">Safety Buffer:</span>
                  <span className="ml-1 text-slate-300 font-mono">{atx.safety_buffer?.toLocaleString()} u</span>
                </div>
                <div>
                  <span className="text-slate-400">ATP Surplus:</span>
                  <span className="ml-1 text-emerald-400 font-mono font-bold">{atx.atp_surplus?.toLocaleString()} u</span>
                </div>
                <div>
                  <span className="text-slate-400">Target Store:</span>
                  <span className="ml-1 text-amber-300 font-mono font-bold">{manifest.target_store}</span>
                </div>
              </div>
            </div>

            <div className={`p-3 rounded-lg border ${manifest.selected_donor_dc?.includes('DC-HOU-01') ? 'bg-amber-500/10 border-amber-500/30' : 'bg-slate-950 border-slate-800'}`}>
              <div className="flex justify-between items-center mb-1">
                <span className="font-semibold text-slate-300">DC-HOU-01 (Houston Port)</span>
                <span className="text-[10px] text-red-400 font-semibold">ATP: {hou.atp_surplus?.toLocaleString()} u</span>
              </div>
              <p className="text-[11px] text-slate-400">
                On-Hand: {hou.on_hand?.toLocaleString()} u • Safety: {hou.safety_buffer?.toLocaleString()} u (Escalates to FMCG Plant {fmcg.atp_surplus?.toLocaleString()} ATP)
              </p>
            </div>

            <div className={`p-3 rounded-lg border ${manifest.selected_donor_dc?.includes('DC-SAT-03') ? 'bg-teal-500/10 border-teal-500/30' : 'bg-slate-950 border-slate-800'}`}>
              <div className="flex justify-between items-center mb-1">
                <span className="font-semibold text-slate-300">DC-SAT-03 (San Antonio)</span>
                <span className="text-[10px] text-emerald-400 font-semibold">ATP: {sat.atp_surplus?.toLocaleString()} u</span>
              </div>
              <p className="text-[11px] text-slate-400">
                On-Hand: {sat.on_hand?.toLocaleString()} u • Safety: {sat.safety_buffer?.toLocaleString()} u
              </p>
            </div>
          </div>
        </div>

        {/* Carrier Freight & Route Evaluation */}
        <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <span className="text-xs font-semibold text-slate-300 flex items-center space-x-2">
              <Truck className="h-4 w-4 text-blue-400" />
              <span>Multi-Carrier Route Comparison</span>
            </span>
            <span className="text-[10px] text-teal-400 bg-teal-500/10 px-2 py-0.5 rounded border border-teal-500/20">
              logistics_rates_mcp
            </span>
          </div>

          <div className="space-y-3 text-xs">
            {/* Selected Carrier Option */}
            <div className="p-3 bg-teal-500/10 border border-teal-500/30 rounded-lg space-y-1.5">
              <div className="flex justify-between items-center">
                <span className="font-bold text-teal-300">{manifest.carrier_name}</span>
                <span className="text-[10px] bg-teal-500/20 text-teal-300 px-1.5 py-0.5 rounded font-semibold">SELECTED ROUTE</span>
              </div>
              <div className="flex justify-between text-[11px]">
                <span className="text-slate-400">Mode: {manifest.freight_mode}</span>
                <span className="text-emerald-400 font-mono font-bold">${freight.toLocaleString()} Freight</span>
              </div>
              <div className="flex justify-between text-[11px]">
                <span className="text-slate-400">Source: {manifest.selected_donor_dc}</span>
                <span className="text-teal-300 font-mono">Dest: {manifest.target_store}</span>
              </div>
            </div>

            {/* Expedited Air Option (Rejected) */}
            <div className="p-3 bg-slate-950 border border-slate-800 rounded-lg space-y-1 opacity-70">
              <div className="flex justify-between items-center">
                <span className="font-semibold text-slate-300">LoneStar Air Cargo</span>
                <span className="text-[10px] text-red-400">Rejected (High Cost)</span>
              </div>
              <div className="flex justify-between text-[11px]">
                <span className="text-slate-400">Transit: 7.5 Hours</span>
                <span className="text-red-400 font-mono">$4,200.00 Freight</span>
              </div>
              <p className="text-[10px] text-slate-500">Unnecessary freight premium degrades product gross margin.</p>
            </div>
          </div>
        </div>

        {/* Financial ROI Margin Protection */}
        <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-5 space-y-4 flex flex-col justify-between">
          <div className="space-y-3">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <span className="text-xs font-semibold text-slate-300 flex items-center space-x-2">
                <DollarSign className="h-4 w-4 text-emerald-400" />
                <span>Financial Margin Protection</span>
              </span>
              <span className="text-[10px] text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded font-semibold">
                ROI Margin: +{roiPct.toLocaleString()}%
              </span>
            </div>

            <div className="bg-slate-950 p-3 rounded-lg border border-slate-800 space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-slate-400">Rebalanced Volume</span>
                <span className="text-white font-mono font-bold">{units.toLocaleString()} units</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Unit Retail Price</span>
                <span className="text-slate-300 font-mono">$14.99 / unit</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Unit Gross Margin</span>
                <span className="text-slate-300 font-mono">$6.20 / unit</span>
              </div>
              <div className="flex justify-between border-t border-slate-800 pt-2">
                <span className="text-slate-400">Protected Shelf Gross Margin</span>
                <span className="text-emerald-400 font-mono font-bold">${protectedMargin.toLocaleString()}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Dedicated Freight Cost</span>
                <span className="text-slate-300 font-mono">-${freight.toLocaleString()}</span>
              </div>
              <div className="flex justify-between border-t border-slate-800 pt-2">
                <span className="text-white font-semibold">Net Protected Value</span>
                <span className="text-emerald-400 font-mono font-bold text-sm">+${netValue.toLocaleString()}</span>
              </div>
            </div>
          </div>

          <div
            className={`p-3 rounded-lg text-xs space-y-1 border ${
              manifest.requires_human_approval
                ? 'bg-amber-500/10 border-amber-500/30 text-amber-200'
                : 'bg-teal-500/10 border-teal-500/20 text-teal-200'
            }`}
          >
            <span className="font-semibold flex items-center space-x-1">
              {manifest.requires_human_approval ? (
                <ShieldAlert className="h-4 w-4 text-amber-400" />
              ) : (
                <CheckCircle2 className="h-4 w-4 text-teal-400" />
              )}
              <span>{manifest.requires_human_approval ? 'Escalated to RemoteA2aAgent HITL' : 'Autonomy Policy Satisfied'}</span>
            </span>
            <p className="text-slate-300">
              {manifest.requires_human_approval
                ? `Freight ($${freight.toLocaleString()}) / Total Commitment ($${(manifest.total_financial_commitment || freight).toLocaleString()}) exceeds $1,000 limit. Routed to VP Approvals Queue.`
                : `Freight cost ($${freight.toLocaleString()}) is within the $1,000 threshold. Order auto-approved (${manifest.sap_transfer_order_id || 'STO-SAP-99214'}).`}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
