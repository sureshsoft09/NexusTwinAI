import React, { useState } from 'react';
import { Sliders, Play, RotateCcw, CheckCircle, ShieldAlert } from 'lucide-react';

export const WhatIfSimulator: React.FC = () => {
  const [demandSurgePct, setDemandSurgePct] = useState<number>(380);
  const [freightCost, setFreightCost] = useState<number>(750);
  const [heatwaveDurationDays, setHeatwaveDurationDays] = useState<number>(3);
  const [austinStock, setAustinStock] = useState<number>(4800);
  const [evaluating, setEvaluating] = useState<boolean>(false);
  const [liveGateResult, setLiveGateResult] = useState<any>(null);

  // Dynamic calculations
  const baselineRate = 48.0;
  const currentVelocity = Math.round(baselineRate * (1 + demandSurgePct / 100));
  const storeStock = 180;
  const runwayHours = Math.max(1, Math.round((storeStock / currentVelocity) * 10) / 10);
  const unitsNeeded = Math.max(300, Math.min(austinStock - 1200, Math.round(currentVelocity * 7)));
  const protectedMargin = Math.round(unitsNeeded * 6.2);
  const netValue = protectedMargin - freightCost;
  const requiresHumanApproval = liveGateResult ? liveGateResult.requires_human_approval : freightCost > 1000;

  const handleReset = () => {
    setDemandSurgePct(380);
    setFreightCost(750);
    setHeatwaveDurationDays(3);
    setAustinStock(4800);
    setLiveGateResult(null);
  };

  const runLiveBackendGateEvaluation = async () => {
    setEvaluating(true);
    try {
      const proposal = {
        proposal_id: `prop_sim_${Date.now()}`,
        event_id: `evt_sim_${Date.now()}`,
        sku_id: 'SKU-4089-HYDRATE',
        target_store: 'STORE-DAL-04',
        selected_donor_dc: 'DC-ATX-02',
        order_type: 'STO_FROM_DC',
        units_to_transfer: unitsNeeded,
        donor_current_stock: austinStock,
        donor_safety_stock: 1200,
        donor_atp_surplus: Math.max(0, austinStock - 1200),
        dc_shortage_escalated_to_fmcg: false,
        fmcg_po_merchandise_cost: 0,
        unit_retail_price: 14.99,
        unit_gross_margin: 6.2,
        projected_protected_revenue: unitsNeeded * 14.99,
        selected_logistics: {
          carrier_name: freightCost > 1000 ? 'LoneStar Expedited Freight' : 'Texas Fleet Logistics (Dedicated)',
          freight_mode: freightCost > 1000 ? 'EXPEDITED_DIRECT' : 'LATERAL_GROUND_TRANSFER',
          origin_dc: 'DC-ATX-02',
          destination_store: 'STORE-DAL-04',
          transit_hours: 12.0,
          freight_cost: freightCost,
          eta_iso: new Date(Date.now() + 12 * 3600 * 1000).toISOString(),
          service_level: 'DEDICATED',
        },
      };

      const res = await fetch(
        `/api/v1/governance/gate/evaluate?store_stockout_runway_hours=${Math.max(18.0, runwayHours)}&has_human_approval=false`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(proposal),
        }
      );
      if (res.ok) {
        const data = await res.json();
        setLiveGateResult(data);
      }
    } catch {
      // Fallback to local calculation
    } finally {
      setEvaluating(false);
    }
  };

  return (
    <div className="h-full flex flex-col p-6 space-y-6 overflow-y-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-white">What-If Scenario Simulator</h1>
          <p className="text-xs text-slate-400 mt-1">
            Simulate volatile demand spikes, carrier spot rate fluctuations, and DC inventory constraints against the live 4-Rule Feasibility Gate API.
          </p>
        </div>
        <div className="flex items-center space-x-2">
          <button
            onClick={runLiveBackendGateEvaluation}
            disabled={evaluating}
            className="flex items-center space-x-1.5 text-xs text-slate-950 font-bold bg-teal-500 hover:bg-teal-400 px-3 py-1.5 rounded-lg transition cursor-pointer"
          >
            <Play className="h-3.5 w-3.5" />
            <span>{evaluating ? 'Evaluating...' : 'Evaluate on Backend Gate API'}</span>
          </button>
          <button
            onClick={handleReset}
            className="flex items-center space-x-1.5 text-xs text-slate-400 hover:text-slate-200 bg-slate-800 hover:bg-slate-700 px-3 py-1.5 rounded-lg border border-slate-700 transition cursor-pointer"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            <span>Reset Defaults</span>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Controls Column */}
        <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-5 space-y-5">
          <div className="flex items-center space-x-2 border-b border-slate-800 pb-3">
            <Sliders className="h-4 w-4 text-teal-400" />
            <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-300">
              Scenario Control Parameters
            </h2>
          </div>

          {/* Slider 1: Demand Surge % */}
          <div className="space-y-2">
            <div className="flex justify-between text-xs">
              <span className="text-slate-400">POS Demand Surge Ratio</span>
              <span className="font-mono text-red-400 font-bold">+{demandSurgePct}% ({currentVelocity} units/hr)</span>
            </div>
            <input
              type="range"
              min="50"
              max="600"
              step="10"
              value={demandSurgePct}
              onChange={(e) => setDemandSurgePct(Number(e.target.value))}
              className="w-full accent-teal-400 cursor-pointer"
            />
          </div>

          {/* Slider 2: Expedited Freight Cost */}
          <div className="space-y-2">
            <div className="flex justify-between text-xs">
              <span className="text-slate-400">Carrier Freight Cost Quote</span>
              <span className={`font-mono font-bold ${freightCost > 1000 ? 'text-amber-400' : 'text-emerald-400'}`}>
                ${freightCost.toLocaleString()} {freightCost > 1000 ? '(Requires Director Approval)' : '(Auto-Approved)'}
              </span>
            </div>
            <input
              type="range"
              min="400"
              max="4500"
              step="50"
              value={freightCost}
              onChange={(e) => setFreightCost(Number(e.target.value))}
              className="w-full accent-teal-400 cursor-pointer"
            />
          </div>

          {/* Slider 3: Austin DC Available Stock */}
          <div className="space-y-2">
            <div className="flex justify-between text-xs">
              <span className="text-slate-400">Austin Central DC Inventory</span>
              <span className="font-mono text-teal-300 font-bold">{austinStock.toLocaleString()} units</span>
            </div>
            <input
              type="range"
              min="1500"
              max="8000"
              step="100"
              value={austinStock}
              onChange={(e) => setAustinStock(Number(e.target.value))}
              className="w-full accent-teal-400 cursor-pointer"
            />
          </div>

          {/* Slider 4: Heatwave Duration */}
          <div className="space-y-2">
            <div className="flex justify-between text-xs">
              <span className="text-slate-400">Heatwave Forecast Duration</span>
              <span className="font-mono text-orange-400 font-bold">{heatwaveDurationDays} Days</span>
            </div>
            <input
              type="range"
              min="1"
              max="7"
              step="1"
              value={heatwaveDurationDays}
              onChange={(e) => setHeatwaveDurationDays(Number(e.target.value))}
              className="w-full accent-teal-400 cursor-pointer"
            />
          </div>
        </div>

        {/* Live Simulation Outcomes */}
        <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-5 space-y-4 flex flex-col justify-between">
          <div className="space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-300">
                Simulated Feasibility Gate Projection
              </h2>
              <span
                className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${
                  requiresHumanApproval
                    ? 'bg-amber-500/20 text-amber-300 border-amber-500/30'
                    : 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                }`}
              >
                {liveGateResult ? liveGateResult.gate_status : requiresHumanApproval ? 'REFERRED_TO_HUMAN' : 'AUTONOMOUS_APPROVED'}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="bg-slate-950 p-3 rounded-lg border border-slate-800">
                <span className="text-slate-400 text-[11px]">Store Stockout Runway</span>
                <p className="text-lg font-bold text-amber-400 mt-1">{runwayHours} Hours</p>
                <p className="text-[10px] text-slate-400 mt-0.5">Based on {currentVelocity} u/h burn rate</p>
              </div>

              <div className="bg-slate-950 p-3 rounded-lg border border-slate-800">
                <span className="text-slate-400 text-[11px]">Recommended Rebalance</span>
                <p className="text-lg font-bold text-teal-300 mt-1">{unitsNeeded.toLocaleString()} units</p>
                <p className="text-[10px] text-slate-400 mt-0.5">From Austin Central DC</p>
              </div>

              <div className="bg-slate-950 p-3 rounded-lg border border-slate-800">
                <span className="text-slate-400 text-[11px]">Protected Gross Margin</span>
                <p className="text-lg font-bold text-emerald-400 mt-1">${protectedMargin.toLocaleString()}</p>
                <p className="text-[10px] text-slate-400 mt-0.5">@ $6.20/unit gross margin</p>
              </div>

              <div className="bg-slate-950 p-3 rounded-lg border border-slate-800">
                <span className="text-slate-400 text-[11px]">Net Supply Chain ROI</span>
                <p className="text-lg font-bold text-white mt-1">+${netValue.toLocaleString()}</p>
                <p className="text-[10px] text-slate-400 mt-0.5">After subtracting ${freightCost} freight</p>
              </div>
            </div>

            {liveGateResult?.rules_evaluated && (
              <div className="bg-slate-950 p-3 rounded-lg border border-slate-800 space-y-1.5 text-xs">
                <span className="text-[10px] uppercase tracking-wider text-teal-400 font-semibold block">
                  Live Backend Gate Rules Evaluated (`/api/v1/governance/gate/evaluate`):
                </span>
                {liveGateResult.rules_evaluated.map((r: any, idx: number) => (
                  <div key={idx} className="flex items-center justify-between text-[11px] font-mono">
                    <span className="text-slate-300">{r.rule_name}</span>
                    <span className={r.passed ? 'text-emerald-400 font-bold' : 'text-amber-400 font-bold'}>
                      {r.passed ? 'PASS' : 'HITL / FAIL'}
                    </span>
                  </div>
                ))}
              </div>
            )}

            <div
              className={`p-3 rounded-lg border text-xs space-y-1 ${
                requiresHumanApproval
                  ? 'bg-amber-500/10 border-amber-500/30 text-amber-200'
                  : 'bg-teal-500/10 border-teal-500/30 text-teal-200'
              }`}
            >
              <div className="flex items-center space-x-1.5 font-semibold">
                {requiresHumanApproval ? <ShieldAlert className="h-4 w-4" /> : <CheckCircle className="h-4 w-4" />}
                <span>{requiresHumanApproval ? 'Autonomy Gate Triggered:' : 'Policy Verified:'}</span>
              </div>
              <p className="text-slate-300">
                {requiresHumanApproval
                  ? `Freight cost of $${freightCost.toLocaleString()} exceeds the $1,000 threshold. Order will be referred to Tab 5 (Approvals Queue).`
                  : `Freight cost of $${freightCost.toLocaleString()} is within policy. Order executes autonomously without manual delay.`}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
