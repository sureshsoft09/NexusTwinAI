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
      <div className="bg-white border border-[#E6E0D3] rounded-2xl p-5 shadow-enterprise flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="font-serif text-lg font-bold text-[#1C1917]">
            Smart Warehouse Selection, Trucking Quotes &amp; Profit ROI
          </h1>
          <p className="text-xs text-[#78716C] mt-1">
            See how the AI selects the best warehouse (or factory), compares trucking rates, and calculates net store profit protected.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => triggerLiveScenario('shop1_pos_dc_replenish')}
            disabled={loading}
            className="flex items-center space-x-1.5 text-xs bg-[#2D6A4F] hover:bg-[#1E4D38] text-white px-3.5 py-2 rounded-xl font-bold transition cursor-pointer shadow-xs"
          >
            <Play className="h-3.5 w-3.5" />
            <span>Test Warehouse Transfer (Shop 1)</span>
          </button>
          <button
            onClick={() => triggerLiveScenario('shop2_dc_shortage_fmcg_po')}
            disabled={loading}
            className="flex items-center space-x-1.5 text-xs bg-[#B7791F] hover:bg-[#925E14] text-white px-3.5 py-2 rounded-xl font-bold transition cursor-pointer shadow-xs"
          >
            <Play className="h-3.5 w-3.5" />
            <span>Test Factory Escalation (Shop 2)</span>
          </button>
          <button
            onClick={fetchLiveState}
            disabled={loading}
            className="flex items-center space-x-1 text-xs bg-[#FAF7F2] hover:bg-[#F3EFE6] text-[#1C1917] border border-[#E6E0D3] px-3 py-2 rounded-xl font-semibold transition cursor-pointer"
          >
            <RefreshCw className={`h-3.5 w-3.5 text-[#2D6A4F] ${loading ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Column 1: Warehouse Spare Stock Comparison */}
        <div className="bg-white border border-[#E6E0D3] rounded-2xl p-5 shadow-enterprise space-y-4">
          <div className="flex items-center justify-between border-b border-[#E6E0D3] pb-3">
            <span className="font-serif text-xs font-bold text-[#1C1917] flex items-center space-x-2">
              <Warehouse className="h-4 w-4 text-[#2D6A4F]" />
              <span>1. Regional Warehouse Spare Stock</span>
            </span>
            <span className="text-[10px] font-bold text-[#1E4D38] bg-[#F2F8F4] px-2.5 py-0.5 rounded-full border border-[#C3DFCD]">
              Live Stock Check
            </span>
          </div>

          <div className="space-y-3 text-xs">
            <div
              className={`p-3.5 rounded-xl border ${
                manifest.selected_donor_dc?.includes('DC-ATX-02')
                  ? 'bg-[#F2F8F4] border-[#C3DFCD]'
                  : 'bg-[#FAF7F2] border-[#E6E0D3]'
              }`}
            >
              <div className="flex justify-between items-center mb-1">
                <span className="font-bold text-[#1C1917]">Austin Regional Warehouse</span>
                {manifest.selected_donor_dc?.includes('DC-ATX-02') && (
                  <span className="text-[10px] bg-[#2D6A4F] text-white px-2 py-0.5 rounded-full font-bold">
                    SELECTED SOURCE
                  </span>
                )}
              </div>
              <div className="grid grid-cols-2 gap-2 mt-2 text-[11px]">
                <div>
                  <span className="text-[#78716C]">Total Stock:</span>
                  <span className="ml-1 text-[#1C1917] font-bold">{atx.on_hand?.toLocaleString()} packs</span>
                </div>
                <div>
                  <span className="text-[#78716C]">Safety Reserve:</span>
                  <span className="ml-1 text-[#44403C] font-semibold">{atx.safety_buffer?.toLocaleString()} packs</span>
                </div>
                <div className="col-span-2 pt-1">
                  <div className="flex justify-between text-[11px] font-bold text-[#2D6A4F] mb-1">
                    <span>Available Spare Stock:</span>
                    <span>{atx.atp_surplus?.toLocaleString()} packs</span>
                  </div>
                  <div className="w-full bg-[#E6E0D3] h-2 rounded-full overflow-hidden">
                    <div
                      className="bg-[#2D6A4F] h-full rounded-full"
                      style={{ width: `${Math.min(100, Math.round(((atx.atp_surplus || 0) / 4000) * 100))}%` }}
                    />
                  </div>
                </div>
              </div>
            </div>

            <div
              className={`p-3.5 rounded-xl border ${
                manifest.selected_donor_dc?.includes('DC-HOU-01')
                  ? 'bg-[#FEF9EE] border-[#F9DFAA]'
                  : 'bg-[#FDF3F1]/70 border-[#F5C7BD]'
              }`}
            >
              <div className="flex justify-between items-center mb-1">
                <span className="font-bold text-[#1C1917]">Houston Port Warehouse</span>
                <span className="text-[10px] bg-[#FDF3F1] text-[#B54834] border border-[#F5C7BD] px-2 py-0.5 rounded-full font-bold">
                  LOW SPARE: {hou.atp_surplus?.toLocaleString()} packs
                </span>
              </div>
              <p className="text-[11px] text-[#57534E] mt-1">
                Total: {hou.on_hand?.toLocaleString()} packs • Safety Reserve: {hou.safety_buffer?.toLocaleString()} packs.
                <strong className="text-[#925E14] block mt-1">
                  Cannot fulfill 1,800-pack order &rarr; Escalates to Waco Factory ({fmcg.atp_surplus?.toLocaleString()} spare).
                </strong>
              </p>
            </div>

            <div
              className={`p-3.5 rounded-xl border ${
                manifest.selected_donor_dc?.includes('DC-SAT-03')
                  ? 'bg-[#F2F8F4] border-[#C3DFCD]'
                  : 'bg-[#FAF7F2] border-[#E6E0D3]'
              }`}
            >
              <div className="flex justify-between items-center mb-1">
                <span className="font-bold text-[#1C1917]">San Antonio Warehouse</span>
                <span className="text-[10px] text-[#2D6A4F] font-bold">
                  Spare: {sat.atp_surplus?.toLocaleString()} packs
                </span>
              </div>
              <p className="text-[11px] text-[#57534E]">
                Total: {sat.on_hand?.toLocaleString()} packs • Safety Reserve: {sat.safety_buffer?.toLocaleString()} packs
              </p>
            </div>
          </div>
        </div>

        {/* Column 2: Carrier Freight & Delivery Speed Comparison */}
        <div className="bg-white border border-[#E6E0D3] rounded-2xl p-5 shadow-enterprise space-y-4">
          <div className="flex items-center justify-between border-b border-[#E6E0D3] pb-3">
            <span className="font-serif text-xs font-bold text-[#1C1917] flex items-center space-x-2">
              <Truck className="h-4 w-4 text-[#2D6A4F]" />
              <span>2. Trucking Carrier Comparison</span>
            </span>
            <span className="text-[10px] font-bold text-[#1E4D38] bg-[#F2F8F4] px-2.5 py-0.5 rounded-full border border-[#C3DFCD]">
              Best Rate Chosen
            </span>
          </div>

          <div className="space-y-3 text-xs">
            {/* Selected Carrier Option */}
            <div className="p-4 bg-[#F2F8F4] border border-[#C3DFCD] rounded-xl space-y-2">
              <div className="flex justify-between items-center">
                <span className="font-bold text-[#1C1917]">{manifest.carrier_name}</span>
                <span className="text-[10px] bg-[#2D6A4F] text-white px-2 py-0.5 rounded-full font-bold">
                  SELECTED CARRIER
                </span>
              </div>
              <div className="flex justify-between text-[11px]">
                <span className="text-[#57534E]">Shipping Cost:</span>
                <span className="text-[#2D6A4F] font-mono font-bold">${freight.toLocaleString()}</span>
              </div>
              <div className="flex justify-between text-[11px]">
                <span className="text-[#57534E]">Route:</span>
                <span className="text-[#1C1917] font-semibold">
                  {manifest.selected_donor_dc} &rarr; {manifest.target_store}
                </span>
              </div>
              <p className="text-[11px] text-[#1E4D38] bg-white p-2 rounded-lg border border-[#C3DFCD]">
                Arrives well before shelves empty while keeping shipping cost low.
              </p>
            </div>

            {/* Rejected Expensive Air Option */}
            <div className="p-4 bg-[#FAF7F2] border border-[#E6E0D3] rounded-xl space-y-1.5 opacity-85">
              <div className="flex justify-between items-center">
                <span className="font-bold text-[#44403C]">LoneStar Emergency Air Cargo</span>
                <span className="text-[10px] bg-[#FDF3F1] text-[#B54834] border border-[#F5C7BD] px-2 py-0.5 rounded-full font-bold">
                  Rejected (Too Expensive)
                </span>
              </div>
              <div className="flex justify-between text-[11px]">
                <span className="text-[#78716C]">Transit: 7.5 Hours</span>
                <span className="text-[#B54834] font-mono font-bold">$4,200.00 Shipping</span>
              </div>
              <p className="text-[11px] text-[#78716C]">
                Rejected by AI because Ground Truck already arrives before stockout for 82% less cost.
              </p>
            </div>
          </div>
        </div>

        {/* Column 3: Financial Profit Protection Breakdown */}
        <div className="bg-white border border-[#E6E0D3] rounded-2xl p-5 shadow-enterprise space-y-4 flex flex-col justify-between">
          <div className="space-y-3">
            <div className="flex items-center justify-between border-b border-[#E6E0D3] pb-3">
              <span className="font-serif text-xs font-bold text-[#1C1917] flex items-center space-x-2">
                <DollarSign className="h-4 w-4 text-[#2D6A4F]" />
                <span>3. Store Profit Protected</span>
              </span>
              <span className="text-[11px] text-[#1E4D38] bg-[#DFF0E5] px-2.5 py-0.5 rounded-full font-bold">
                +{roiPct.toLocaleString()}% Return
              </span>
            </div>

            <div className="bg-[#FAF7F2] p-4 rounded-xl border border-[#E6E0D3] space-y-2.5 text-xs">
              <div className="flex justify-between">
                <span className="text-[#57534E]">Restock Volume:</span>
                <span className="text-[#1C1917] font-mono font-bold">{units.toLocaleString()} packs</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#57534E]">Retail Shelf Price:</span>
                <span className="text-[#44403C] font-mono">$14.99 / pack</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#57534E]">Store Profit per Pack:</span>
                <span className="text-[#44403C] font-mono">$6.20 / pack</span>
              </div>
              <div className="flex justify-between border-t border-[#E6E0D3] pt-2">
                <span className="text-[#1C1917] font-semibold">Gross Store Profit Saved:</span>
                <span className="text-[#2D6A4F] font-mono font-bold">${protectedMargin.toLocaleString()}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#57534E]">Less Trucking Cost:</span>
                <span className="text-[#B54834] font-mono font-semibold">-${freight.toLocaleString()}</span>
              </div>
              <div className="flex justify-between border-t border-[#E6E0D3] pt-2.5">
                <span className="text-[#1C1917] font-bold text-sm">Net Profit Protected:</span>
                <span className="text-[#2D6A4F] font-mono font-bold text-base">
                  +${netValue.toLocaleString()}
                </span>
              </div>
            </div>
          </div>

          <div
            className={`p-3.5 rounded-xl text-xs space-y-1 border ${
              manifest.requires_human_approval
                ? 'bg-[#FEF9EE] border-[#F9DFAA] text-[#925E14]'
                : 'bg-[#F2F8F4] border-[#C3DFCD] text-[#1E4D38]'
            }`}
          >
            <span className="font-bold flex items-center space-x-1.5">
              {manifest.requires_human_approval ? (
                <ShieldAlert className="h-4 w-4 text-[#B7791F]" />
              ) : (
                <CheckCircle2 className="h-4 w-4 text-[#2D6A4F]" />
              )}
              <span>
                {manifest.requires_human_approval
                  ? 'Over $1,000 Policy Limit -> Sent to Manager Queue'
                  : 'Under $1,000 Policy Limit -> Automatically Approved'}
              </span>
            </span>
            <p className="text-[#44403C] text-[11px] leading-relaxed">
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
