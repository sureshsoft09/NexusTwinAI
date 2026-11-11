import React, { useState, useEffect } from 'react';
import { RefreshCw, Warehouse, Truck, DollarSign, CheckCircle2, ShieldAlert, Play } from 'lucide-react';
import { apiUrl } from '../apiConfig';

export const DynamicReplenishment: React.FC = () => {
  const [twinState, setTwinState] = useState<any>(null);
  const [loading, setLoading] = useState<boolean>(false);

  const fetchLiveState = async () => {
    setLoading(true);
    try {
      const res = await fetch(apiUrl('/api/v1/twin/state'));
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
      const res = await fetch(apiUrl(`/api/v1/signals/scenario/${scenarioKey}`), { method: 'POST' });
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
    carrier_name: 'Texas Fleet Logistics (Dedicated Ground)',
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
      <div className="bg-white border border-[#DCE4EE] rounded-2xl p-5 shadow-enterprise flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="font-serif text-lg font-bold text-[#14213D]">
            Smart Warehouse Selection, Trucking Quotes &amp; Profit ROI
          </h1>
          <p className="text-xs text-[#526582] mt-1">
            See how the AI selects the best warehouse (or factory), compares trucking rates, and calculates net store profit protected.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => triggerLiveScenario('shop1_pos_dc_replenish')}
            disabled={loading}
            className="flex items-center space-x-1.5 text-xs bg-[#0E5A8A] hover:bg-[#094266] text-white px-3.5 py-2 rounded-xl font-bold transition cursor-pointer shadow-xs"
          >
            <Play className="h-3.5 w-3.5" />
            <span>Test Warehouse Transfer (Shop 1)</span>
          </button>
          <button
            onClick={() => triggerLiveScenario('shop2_dc_shortage_fmcg_po')}
            disabled={loading}
            className="flex items-center space-x-1.5 text-xs bg-[#C27803] hover:bg-[#925802] text-white px-3.5 py-2 rounded-xl font-bold transition cursor-pointer shadow-xs"
          >
            <Play className="h-3.5 w-3.5" />
            <span>Test Factory Escalation (Shop 2)</span>
          </button>
          <button
            onClick={fetchLiveState}
            disabled={loading}
            className="flex items-center space-x-1 text-xs bg-[#F5F8FC] hover:bg-[#ECF5FC] text-[#14213D] border border-[#DCE4EE] px-3 py-2 rounded-xl font-semibold transition cursor-pointer"
          >
            <RefreshCw className={`h-3.5 w-3.5 text-[#0E5A8A] ${loading ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Column 1: Warehouse Spare Stock Comparison */}
        <div className="bg-white border border-[#DCE4EE] rounded-2xl p-5 shadow-enterprise space-y-4">
          <div className="flex items-center justify-between border-b border-[#DCE4EE] pb-3">
            <span className="font-serif text-xs font-bold text-[#14213D] flex items-center space-x-2">
              <Warehouse className="h-4 w-4 text-[#0E5A8A]" />
              <span>1. Regional Warehouse Spare Stock</span>
            </span>
            <span className="text-[10px] font-bold text-[#094266] bg-[#ECF5FC] px-2.5 py-0.5 rounded-full border border-[#C2DFF3]">
              Live Stock Check
            </span>
          </div>

          <div className="space-y-3 text-xs">
            <div
              className={`p-3.5 rounded-xl border ${
                manifest.selected_donor_dc?.includes('DC-ATX-02')
                  ? 'bg-[#EEFBF6] border-[#B8EAD8]'
                  : 'bg-[#F5F8FC] border-[#DCE4EE]'
              }`}
            >
              <div className="flex justify-between items-center mb-1">
                <span className="font-bold text-[#14213D]">Austin Regional Warehouse</span>
                {manifest.selected_donor_dc?.includes('DC-ATX-02') && (
                  <span className="text-[10px] bg-[#0D7A5F] text-white px-2 py-0.5 rounded-full font-bold">
                    SELECTED SOURCE
                  </span>
                )}
              </div>
              <div className="grid grid-cols-2 gap-2 mt-2 text-[11px]">
                <div>
                  <span className="text-[#526582]">Total Stock:</span>
                  <span className="ml-1 text-[#14213D] font-bold">{atx.on_hand?.toLocaleString()} packs</span>
                </div>
                <div>
                  <span className="text-[#526582]">Safety Reserve:</span>
                  <span className="ml-1 text-[#3B4E6B] font-semibold">{atx.safety_buffer?.toLocaleString()} packs</span>
                </div>
                <div className="col-span-2 pt-1">
                  <div className="flex justify-between text-[11px] font-bold text-[#0D7A5F] mb-1">
                    <span>Available Spare Stock:</span>
                    <span>{atx.atp_surplus?.toLocaleString()} packs</span>
                  </div>
                  <div className="w-full bg-[#DCE4EE] h-2 rounded-full overflow-hidden">
                    <div
                      className="bg-[#0D7A5F] h-full rounded-full"
                      style={{ width: `${Math.min(100, Math.round(((atx.atp_surplus || 0) / 4000) * 100))}%` }}
                    />
                  </div>
                </div>
              </div>
            </div>

            <div
              className={`p-3.5 rounded-xl border ${
                manifest.selected_donor_dc?.includes('DC-HOU-01')
                  ? 'bg-[#FFFBEB] border-[#FDE68A]'
                  : 'bg-[#FDF2F2]/70 border-[#F8CACA]'
              }`}
            >
              <div className="flex justify-between items-center mb-1">
                <span className="font-bold text-[#14213D]">Houston Port Warehouse</span>
                <span className="text-[10px] bg-[#FDF2F2] text-[#C93B2B] border border-[#F8CACA] px-2 py-0.5 rounded-full font-bold">
                  LOW SPARE: {hou.atp_surplus?.toLocaleString()} packs
                </span>
              </div>
              <p className="text-[11px] text-[#3B4E6B] mt-1">
                Total: {hou.on_hand?.toLocaleString()} packs • Safety Reserve: {hou.safety_buffer?.toLocaleString()} packs.
                <strong className="text-[#925802] block mt-1">
                  Cannot fulfill 1,800-pack order &rarr; Escalates to Waco Factory ({fmcg.atp_surplus?.toLocaleString()} spare).
                </strong>
              </p>
            </div>

            <div
              className={`p-3.5 rounded-xl border ${
                manifest.selected_donor_dc?.includes('DC-SAT-03')
                  ? 'bg-[#EEFBF6] border-[#B8EAD8]'
                  : 'bg-[#F5F8FC] border-[#DCE4EE]'
              }`}
            >
              <div className="flex justify-between items-center mb-1">
                <span className="font-bold text-[#14213D]">San Antonio Warehouse</span>
                <span className="text-[10px] text-[#0D7A5F] font-bold">
                  Spare: {sat.atp_surplus?.toLocaleString()} packs
                </span>
              </div>
              <p className="text-[11px] text-[#3B4E6B]">
                Total: {sat.on_hand?.toLocaleString()} packs • Safety Reserve: {sat.safety_buffer?.toLocaleString()} packs
              </p>
            </div>
          </div>
        </div>

        {/* Column 2: Carrier Freight & Delivery Speed Comparison */}
        <div className="bg-white border border-[#DCE4EE] rounded-2xl p-5 shadow-enterprise space-y-4">
          <div className="flex items-center justify-between border-b border-[#DCE4EE] pb-3">
            <span className="font-serif text-xs font-bold text-[#14213D] flex items-center space-x-2">
              <Truck className="h-4 w-4 text-[#0E5A8A]" />
              <span>2. Trucking Carrier Comparison</span>
            </span>
            <span className="text-[10px] font-bold text-[#094266] bg-[#ECF5FC] px-2.5 py-0.5 rounded-full border border-[#C2DFF3]">
              Best Rate Chosen
            </span>
          </div>

          <div className="space-y-3 text-xs">
            {/* Selected Carrier Option */}
            <div className="p-4 bg-[#EEFBF6] border border-[#B8EAD8] rounded-xl space-y-2">
              <div className="flex justify-between items-center">
                <span className="font-bold text-[#14213D]">{manifest.carrier_name}</span>
                <span className="text-[10px] bg-[#0D7A5F] text-white px-2 py-0.5 rounded-full font-bold">
                  SELECTED CARRIER
                </span>
              </div>
              <div className="flex justify-between text-[11px]">
                <span className="text-[#3B4E6B]">Shipping Cost:</span>
                <span className="text-[#0D7A5F] font-mono font-bold">${freight.toLocaleString()}</span>
              </div>
              <div className="flex justify-between text-[11px]">
                <span className="text-[#3B4E6B]">Route:</span>
                <span className="text-[#14213D] font-semibold">
                  {manifest.selected_donor_dc} &rarr; {manifest.target_store}
                </span>
              </div>
              <p className="text-[11px] text-[#095C47] bg-white p-2 rounded-lg border border-[#B8EAD8]">
                Arrives well before shelves empty while keeping shipping cost low.
              </p>
            </div>

            {/* Rejected Expensive Air Option */}
            <div className="p-4 bg-[#F5F8FC] border border-[#DCE4EE] rounded-xl space-y-1.5 opacity-85">
              <div className="flex justify-between items-center">
                <span className="font-bold text-[#3B4E6B]">LoneStar Emergency Air Cargo</span>
                <span className="text-[10px] bg-[#FDF2F2] text-[#C93B2B] border border-[#F8CACA] px-2 py-0.5 rounded-full font-bold">
                  Rejected (Too Expensive)
                </span>
              </div>
              <div className="flex justify-between text-[11px]">
                <span className="text-[#526582]">Transit: 7.5 Hours</span>
                <span className="text-[#C93B2B] font-mono font-bold">$4,200.00 Shipping</span>
              </div>
              <p className="text-[11px] text-[#526582]">
                Rejected by AI because Ground Truck already arrives before stockout for 82% less cost.
              </p>
            </div>
          </div>
        </div>

        {/* Column 3: Financial Profit Protection Breakdown */}
        <div className="bg-white border border-[#DCE4EE] rounded-2xl p-5 shadow-enterprise space-y-4 flex flex-col justify-between">
          <div className="space-y-3">
            <div className="flex items-center justify-between border-b border-[#DCE4EE] pb-3">
              <span className="font-serif text-xs font-bold text-[#14213D] flex items-center space-x-2">
                <DollarSign className="h-4 w-4 text-[#0D7A5F]" />
                <span>3. Store Profit Protected</span>
              </span>
              <span className="text-[11px] text-[#095C47] bg-[#D5F5E9] px-2.5 py-0.5 rounded-full font-bold">
                +{roiPct.toLocaleString()}% Return
              </span>
            </div>

            <div className="bg-[#F5F8FC] p-4 rounded-xl border border-[#DCE4EE] space-y-2.5 text-xs">
              <div className="flex justify-between">
                <span className="text-[#526582]">Restock Volume:</span>
                <span className="text-[#14213D] font-mono font-bold">{units.toLocaleString()} packs</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#526582]">Retail Shelf Price:</span>
                <span className="text-[#3B4E6B] font-mono">$14.99 / pack</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#526582]">Store Profit per Pack:</span>
                <span className="text-[#3B4E6B] font-mono">$6.20 / pack</span>
              </div>
              <div className="flex justify-between border-t border-[#DCE4EE] pt-2">
                <span className="text-[#14213D] font-semibold">Gross Store Profit Saved:</span>
                <span className="text-[#0D7A5F] font-mono font-bold">${protectedMargin.toLocaleString()}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#526582]">Less Trucking Cost:</span>
                <span className="text-[#C93B2B] font-mono font-semibold">-${freight.toLocaleString()}</span>
              </div>
              <div className="flex justify-between border-t border-[#DCE4EE] pt-2.5">
                <span className="text-[#14213D] font-bold text-sm">Net Profit Protected:</span>
                <span className="text-[#0D7A5F] font-mono font-bold text-base">
                  +${netValue.toLocaleString()}
                </span>
              </div>
            </div>
          </div>

          <div
            className={`p-3.5 rounded-xl text-xs space-y-1 border ${
              manifest.requires_human_approval
                ? 'bg-[#FFFBEB] border-[#FDE68A] text-[#925802]'
                : 'bg-[#EEFBF6] border-[#B8EAD8] text-[#095C47]'
            }`}
          >
            <span className="font-bold flex items-center space-x-1.5">
              {manifest.requires_human_approval ? (
                <ShieldAlert className="h-4 w-4 text-[#C27803]" />
              ) : (
                <CheckCircle2 className="h-4 w-4 text-[#0D7A5F]" />
              )}
              <span>
                {manifest.requires_human_approval
                  ? 'Over $1,000 Policy Limit -> Sent to Manager Queue'
                  : 'Under $1,000 Policy Limit -> Automatically Approved'}
              </span>
            </span>
            <p className="text-[#3B4E6B] text-[11px] leading-relaxed">
              {manifest.requires_human_approval
                ? `Shipping ($${freight.toLocaleString()}) and Factory PO ($${(manifest.total_financial_commitment || freight).toLocaleString()}) exceed the $1,000 auto-limit. Routed to Tab 5 for VP approval.`
                : `Shipping cost ($${freight.toLocaleString()}) is within the $1,000 auto-approval policy. Dispatched as Order #${manifest.sap_transfer_order_id || 'STO-SAP-99214'}.`}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
