import React, { useState } from 'react';
import { Sliders, Play, RotateCcw, CheckCircle2, ShieldAlert } from 'lucide-react';
import { apiUrl } from '../apiConfig';

export const WhatIfSimulator: React.FC = () => {
  const [demandSurgePct, setDemandSurgePct] = useState<number>(380);
  const [freightCost, setFreightCost] = useState<number>(750);
  const [heatwaveDurationDays, setHeatwaveDurationDays] = useState<number>(3);
  const [austinStock, setAustinStock] = useState<number>(4800);
  const [evaluating, setEvaluating] = useState<boolean>(false);
  const [liveGateResult, setLiveGateResult] = useState<any>(null);

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
        apiUrl(
          `/api/v1/governance/gate/evaluate?store_stockout_runway_hours=${Math.max(18.0, runwayHours)}&has_human_approval=false`
        ),
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
      <div className="bg-white border border-[#DCE4EE] rounded-2xl p-5 shadow-enterprise flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="font-serif text-lg font-bold text-[#14213D]">
            What-If Supply Chain Scenario Planner
          </h1>
          <p className="text-xs text-[#526582] mt-1">
            Drag the sliders below to test how different customer demand spikes and trucking rates impact profit and the $1,000 Auto-Approval Policy.
          </p>
        </div>
        <div className="flex items-center space-x-2">
          <button
            onClick={runLiveBackendGateEvaluation}
            disabled={evaluating}
            className="flex items-center space-x-1.5 text-xs text-white font-bold bg-[#0E5A8A] hover:bg-[#094266] px-3.5 py-2 rounded-xl transition cursor-pointer shadow-xs"
          >
            <Play className="h-3.5 w-3.5" />
            <span>{evaluating ? 'Testing Policy...' : 'Test Against Live 4-Rule Policy'}</span>
          </button>
          <button
            onClick={handleReset}
            className="flex items-center space-x-1.5 text-xs text-[#14213D] hover:bg-[#ECF5FC] bg-[#F5F8FC] px-3.5 py-2 rounded-xl border border-[#DCE4EE] font-semibold transition cursor-pointer"
          >
            <RotateCcw className="h-3.5 w-3.5 text-[#0E5A8A]" />
            <span>Reset Sliders</span>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Controls Column */}
        <div className="bg-white border border-[#DCE4EE] rounded-2xl p-6 shadow-enterprise space-y-6">
          <div className="flex items-center space-x-2 border-b border-[#DCE4EE] pb-3">
            <Sliders className="h-4 w-4 text-[#0E5A8A]" />
            <h2 className="font-serif text-sm font-bold text-[#14213D]">
              Adjust Store &amp; Shipping Conditions
            </h2>
          </div>

          {/* Slider 1: Demand Surge % */}
          <div className="space-y-2">
            <div className="flex justify-between text-xs">
              <span className="font-semibold text-[#14213D]">1. Customer Checkout Demand Spike</span>
              <span className="font-mono text-[#C93B2B] font-bold">
                +{demandSurgePct}% ({currentVelocity} packs/hr)
              </span>
            </div>
            <input
              type="range"
              min="50"
              max="600"
              step="10"
              value={demandSurgePct}
              onChange={(e) => setDemandSurgePct(Number(e.target.value))}
              className="w-full accent-[#0E5A8A] cursor-pointer"
            />
          </div>

          {/* Slider 2: Expedited Freight Cost */}
          <div className="space-y-2">
            <div className="flex justify-between text-xs">
              <span className="font-semibold text-[#14213D]">2. Trucking Carrier Shipping Cost</span>
              <span className={`font-mono font-bold ${freightCost > 1000 ? 'text-[#C27803]' : 'text-[#0D7A5F]'}`}>
                ${freightCost.toLocaleString()}{' '}
                {freightCost > 1000 ? '(Over $1,000 -> Needs Manager Sign-Off)' : '(Under $1,000 -> Auto-Approved)'}
              </span>
            </div>
            <input
              type="range"
              min="400"
              max="4500"
              step="50"
              value={freightCost}
              onChange={(e) => setFreightCost(Number(e.target.value))}
              className="w-full accent-[#0E5A8A] cursor-pointer"
            />
          </div>

          {/* Slider 3: Austin DC Available Stock */}
          <div className="space-y-2">
            <div className="flex justify-between text-xs">
              <span className="font-semibold text-[#14213D]">3. Austin Regional Warehouse Stock</span>
              <span className="font-mono text-[#0E5A8A] font-bold">{austinStock.toLocaleString()} packs</span>
            </div>
            <input
              type="range"
              min="1500"
              max="8000"
              step="100"
              value={austinStock}
              onChange={(e) => setAustinStock(Number(e.target.value))}
              className="w-full accent-[#0E5A8A] cursor-pointer"
            />
          </div>

          {/* Slider 4: Heatwave Duration */}
          <div className="space-y-2">
            <div className="flex justify-between text-xs">
              <span className="font-semibold text-[#14213D]">4. Heatwave Duration</span>
              <span className="font-mono text-[#C27803] font-bold">{heatwaveDurationDays} Days</span>
            </div>
            <input
              type="range"
              min="1"
              max="7"
              step="1"
              value={heatwaveDurationDays}
              onChange={(e) => setHeatwaveDurationDays(Number(e.target.value))}
              className="w-full accent-[#0E5A8A] cursor-pointer"
            />
          </div>
        </div>

        {/* Live Simulation Outcomes */}
        <div className="bg-white border border-[#DCE4EE] rounded-2xl p-6 shadow-enterprise space-y-4 flex flex-col justify-between">
          <div className="space-y-4">
            <div className="flex items-center justify-between border-b border-[#DCE4EE] pb-3">
              <h2 className="font-serif text-sm font-bold text-[#14213D]">
                Simulated Decision &amp; Profit Outcome
              </h2>
              <span
                className={`text-[11px] font-bold px-3 py-0.5 rounded-full border ${
                  requiresHumanApproval
                    ? 'bg-[#FFFBEB] text-[#925802] border-[#FDE68A]'
                    : 'bg-[#EEFBF6] text-[#095C47] border-[#B8EAD8]'
                }`}
              >
                {requiresHumanApproval ? 'PAUSED FOR MANAGER APPROVAL' : 'AUTOMATICALLY APPROVED'}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="bg-[#F5F8FC] p-4 rounded-xl border border-[#DCE4EE]">
                <span className="text-[#526582] text-[11px] font-medium">Time Until Shelf Is Empty</span>
                <p className="font-serif text-xl font-bold text-[#C93B2B] mt-1">{runwayHours} Hours</p>
                <p className="text-[11px] text-[#526582] mt-0.5">At {currentVelocity} packs/hr buying speed</p>
              </div>

              <div className="bg-[#F5F8FC] p-4 rounded-xl border border-[#DCE4EE]">
                <span className="text-[#526582] text-[11px] font-medium">Recommended Restock Shipment</span>
                <p className="font-serif text-xl font-bold text-[#0E5A8A] mt-1">{unitsNeeded.toLocaleString()} packs</p>
                <p className="text-[11px] text-[#526582] mt-0.5">From Austin Regional Warehouse</p>
              </div>

              <div className="bg-[#F5F8FC] p-4 rounded-xl border border-[#DCE4EE]">
                <span className="text-[#526582] text-[11px] font-medium">Store Profit Protected</span>
                <p className="font-serif text-xl font-bold text-[#0D7A5F] mt-1">${protectedMargin.toLocaleString()}</p>
                <p className="text-[11px] text-[#526582] mt-0.5">@ $6.20 profit per pack</p>
              </div>

              <div className="bg-[#F5F8FC] p-4 rounded-xl border border-[#DCE4EE]">
                <span className="text-[#526582] text-[11px] font-medium">Net Profit After Shipping</span>
                <p className="font-serif text-xl font-bold text-[#14213D] mt-1">+${netValue.toLocaleString()}</p>
                <p className="text-[11px] text-[#526582] mt-0.5">After subtracting ${freightCost} shipping</p>
              </div>
            </div>

            {liveGateResult?.rules_evaluated && (
              <div className="bg-[#ECF5FC] p-3.5 rounded-xl border border-[#C2DFF3] space-y-1.5 text-xs">
                <span className="text-[11px] font-bold text-[#094266] block">
                  Live 4-Rule Policy Check Results:
                </span>
                {liveGateResult.rules_evaluated.map((r: any, idx: number) => (
                  <div key={idx} className="flex items-center justify-between text-[11px] font-medium">
                    <span className="text-[#3B4E6B]">{r.rule_name}</span>
                    <span className={r.passed ? 'text-[#0D7A5F] font-bold' : 'text-[#C27803] font-bold'}>
                      {r.passed ? '✅ PASSED' : '⚠️ NEEDS MANAGER SIGN-OFF'}
                    </span>
                  </div>
                ))}
              </div>
            )}

            <div
              className={`p-4 rounded-xl border text-xs space-y-1 ${
                requiresHumanApproval
                  ? 'bg-[#FFFBEB] border-[#FDE68A] text-[#925802]'
                  : 'bg-[#EEFBF6] border-[#B8EAD8] text-[#095C47]'
              }`}
            >
              <div className="flex items-center space-x-1.5 font-bold">
                {requiresHumanApproval ? (
                  <ShieldAlert className="h-4 w-4 text-[#C27803]" />
                ) : (
                  <CheckCircle2 className="h-4 w-4 text-[#0D7A5F]" />
                )}
                <span>
                  {requiresHumanApproval
                    ? 'Why This Order Requires Manager Approval:'
                    : 'Why This Order Ships Automatically:'}
                </span>
              </div>
              <p className="text-[#3B4E6B] leading-relaxed">
                {requiresHumanApproval
                  ? `Shipping cost of $${freightCost.toLocaleString()} is above the $1,000 automatic spending limit. The order is paused and sent to Tab 5 (Manager Sign-Off Queue).`
                  : `Shipping cost of $${freightCost.toLocaleString()} is under the $1,000 automatic limit. The truck is dispatched immediately without waiting for manual paperwork.`}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
