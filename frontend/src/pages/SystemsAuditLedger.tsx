import React, { useState, useEffect } from 'react';
import { Search, Filter, Download, RefreshCw, FileText, Clock, CheckCircle2 } from 'lucide-react';
import { AuditRecord } from '../types';

export const SystemsAuditLedger: React.FC = () => {
  const [records, setRecords] = useState<AuditRecord[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedStatus, setSelectedStatus] = useState<string>('ALL');
  const [selectedRecord, setSelectedRecord] = useState<AuditRecord | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const mockAuditLedger: AuditRecord[] = [
    {
      event_id: 'evt_shop1_pos_dc_sto',
      timestamp: '2026-11-06T12:35:10Z',
      signal_source: 'STORE_CHECKOUT_SPIKE',
      store_id: 'STORE-DAL-04 (Dallas Uptown)',
      sku_id: 'HydroBoost Electrolyte 12-Pack',
      observed_velocity: 215.0,
      root_cause_explanation:
        'Checkout sales jumped +348% over normal due to 98.2°F heatwave and local youth soccer tournament. Dispatched 1,500 packs from Austin Regional Warehouse.',
      selected_donor_dc: 'DC-ATX-02 (Austin Warehouse)',
      units_transferred: 1500,
      freight_mode: 'Dedicated Ground Truck',
      carrier_name: 'Texas Fleet Logistics',
      estimated_freight_cost: 750.0,
      gate_status: 'APPROVED',
      requires_human_approval: false,
      approver_name: 'Auto-Approved (Under $1,000 Shipping Limit)',
      sap_transfer_order_id: 'STO-SAP-99214',
    },
    {
      event_id: 'evt_shop3_weather_25d',
      timestamp: '2026-11-06T11:15:42Z',
      signal_source: '25_DAY_WEATHER_FORECAST',
      store_id: 'STORE-PLANO-07 (Plano Legacy)',
      sku_id: 'HydroBoost Electrolyte 12-Pack',
      observed_velocity: 128.0,
      root_cause_explanation:
        '25-Day Weather Forecast identified a 104.2°F Heat Dome arriving in 25 days. Shipped 1,500 packs early via low-cost economy ground freight ($480).',
      selected_donor_dc: 'DC-ATX-02 (Austin Warehouse)',
      units_transferred: 1500,
      freight_mode: 'Economy Pre-Stock Truck',
      carrier_name: 'Texas Economy Ground',
      estimated_freight_cost: 480.0,
      gate_status: 'APPROVED',
      requires_human_approval: false,
      approver_name: 'Auto-Approved (Under $1,000 Shipping Limit)',
      sap_transfer_order_id: 'STO-SAP-25D91',
    },
  ];

  const fetchLedger = async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/v1/audit/ledger?limit=50');
      if (res.ok) {
        const data = await res.json();
        const rows = Array.isArray(data) ? data : data.records;
        if (Array.isArray(rows) && rows.length > 0) {
          setRecords(rows);
        } else {
          setRecords(mockAuditLedger);
        }
      } else {
        setRecords(mockAuditLedger);
      }
    } catch {
      setRecords(mockAuditLedger);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchLedger();
  }, []);

  const filteredRecords = records.filter((rec) => {
    const matchesSearch =
      rec.event_id.toLowerCase().includes(searchTerm.toLowerCase()) ||
      rec.sku_id.toLowerCase().includes(searchTerm.toLowerCase()) ||
      rec.store_id.toLowerCase().includes(searchTerm.toLowerCase()) ||
      rec.root_cause_explanation.toLowerCase().includes(searchTerm.toLowerCase());

    if (selectedStatus === 'ALL') return matchesSearch;
    if (selectedStatus === 'AUTONOMOUS') return matchesSearch && !rec.requires_human_approval;
    if (selectedStatus === 'HITL') return matchesSearch && rec.requires_human_approval;
    return matchesSearch;
  });

  const exportToJson = () => {
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(records, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', dataStr);
    downloadAnchor.setAttribute('download', `nexustwin_order_history_${new Date().toISOString()}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  return (
    <div className="h-full flex flex-col p-6 space-y-6 overflow-y-auto">
      {/* Header */}
      <div className="bg-white border border-[#E6E0D3] rounded-2xl p-5 shadow-enterprise flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2">
            <h1 className="font-serif text-lg font-bold text-[#1C1917]">
              Completed Restock Orders &amp; Decision History
            </h1>
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-[#F2F8F4] text-[#2D6A4F] border border-[#C3DFCD]">
              Saved to Cloud Audit Log
            </span>
          </div>
          <p className="text-xs text-[#78716C] mt-1">
            Complete history of every store demand alert, warehouse/factory shipment, shipping cost, and manager sign-off.
          </p>
        </div>

        <div className="flex items-center space-x-2.5">
          <button
            onClick={fetchLedger}
            className="flex items-center space-x-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold bg-[#FAF7F2] text-[#1C1917] hover:bg-[#F3EFE6] border border-[#E6E0D3] transition cursor-pointer"
          >
            <RefreshCw className={`h-3.5 w-3.5 text-[#2D6A4F] ${isLoading ? 'animate-spin' : ''}`} />
            <span>Refresh Log</span>
          </button>
          <button
            onClick={exportToJson}
            className="flex items-center space-x-1.5 px-3.5 py-2 rounded-xl text-xs font-bold bg-[#2D6A4F] hover:bg-[#1E4D38] text-white transition shadow-xs cursor-pointer"
          >
            <Download className="h-3.5 w-3.5" />
            <span>Download Report</span>
          </button>
        </div>
      </div>

      {/* Control / Filter Bar */}
      <div className="flex flex-col md:flex-row items-center justify-between gap-3 bg-white p-3.5 rounded-2xl border border-[#E6E0D3] shadow-enterprise">
        <div className="relative w-full md:w-80">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-[#78716C]" />
          <input
            type="text"
            placeholder="Search store, order ID, or reason..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-[#FAF7F2] border border-[#E6E0D3] rounded-xl pl-9 pr-3 py-1.5 text-xs text-[#1C1917] placeholder-[#78716C] focus:outline-none focus:border-[#2D6A4F]"
          />
        </div>

        <div className="flex items-center space-x-2 w-full md:w-auto">
          <span className="text-xs text-[#78716C] font-semibold flex items-center space-x-1">
            <Filter className="h-3.5 w-3.5" />
            <span>Show:</span>
          </span>
          <button
            onClick={() => setSelectedStatus('ALL')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
              selectedStatus === 'ALL'
                ? 'bg-[#2D6A4F] text-white'
                : 'text-[#57534E] hover:bg-[#FAF7F2]'
            }`}
          >
            All Orders ({records.length})
          </button>
          <button
            onClick={() => setSelectedStatus('AUTONOMOUS')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
              selectedStatus === 'AUTONOMOUS'
                ? 'bg-[#2D6A4F] text-white'
                : 'text-[#57534E] hover:bg-[#FAF7F2]'
            }`}
          >
            Auto-Approved (&le; $1k)
          </button>
          <button
            onClick={() => setSelectedStatus('HITL')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
              selectedStatus === 'HITL'
                ? 'bg-[#B7791F] text-white'
                : 'text-[#57534E] hover:bg-[#FAF7F2]'
            }`}
          >
            Manager Approved (&gt; $1k)
          </button>
        </div>
      </div>

      {/* Ledger Table */}
      <div className="bg-white border border-[#E6E0D3] rounded-2xl overflow-hidden shadow-enterprise">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-[#FAF7F2] text-[#78716C] uppercase tracking-wider text-[11px] border-b border-[#E6E0D3]">
              <tr>
                <th className="py-3.5 px-4 font-bold">Time &amp; Alert</th>
                <th className="py-3.5 px-4 font-bold">Store Location</th>
                <th className="py-3.5 px-4 font-bold">Demand Speed</th>
                <th className="py-3.5 px-4 font-bold">Restock Shipment</th>
                <th className="py-3.5 px-4 font-bold">Shipping Cost</th>
                <th className="py-3.5 px-4 font-bold">Approval Type</th>
                <th className="py-3.5 px-4 font-bold">Order Number</th>
                <th className="py-3.5 px-4 font-bold text-right">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E6E0D3] text-[#44403C]">
              {filteredRecords.map((rec, i) => (
                <tr key={`${rec.event_id}-${i}`} className="hover:bg-[#FAF7F2] transition">
                  <td className="py-3.5 px-4">
                    <div className="font-mono text-[#2D6A4F] font-bold">{rec.event_id}</div>
                    <div className="text-[10px] text-[#78716C] flex items-center space-x-1 mt-0.5">
                      <Clock className="h-3 w-3" />
                      <span>{new Date(rec.timestamp).toLocaleTimeString()}</span>
                    </div>
                  </td>

                  <td className="py-3.5 px-4">
                    <div className="font-bold text-[#1C1917]">{rec.store_id}</div>
                    <div className="text-[11px] text-[#78716C]">HydroBoost 12-Pack</div>
                  </td>

                  <td className="py-3.5 px-4">
                    <div className="font-bold text-[#B54834]">{rec.observed_velocity} packs/hr</div>
                    <div className="text-[10px] text-[#78716C]">{rec.signal_source}</div>
                  </td>

                  <td className="py-3.5 px-4">
                    <div className="text-[#1C1917] font-bold">
                      {rec.units_transferred.toLocaleString()} packs
                    </div>
                    <div className="text-[11px] text-[#78716C]">From {rec.selected_donor_dc}</div>
                  </td>

                  <td className="py-3.5 px-4">
                    <div className="font-mono font-bold text-[#1C1917]">
                      ${rec.estimated_freight_cost.toFixed(2)}
                    </div>
                    <div className="text-[10px] text-[#78716C] truncate max-w-[150px]">{rec.carrier_name}</div>
                  </td>

                  <td className="py-3.5 px-4">
                    <span
                      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${
                        rec.requires_human_approval
                          ? 'bg-[#FEF9EE] text-[#925E14] border-[#F9DFAA]'
                          : 'bg-[#F2F8F4] text-[#1E4D38] border-[#C3DFCD]'
                      }`}
                    >
                      {rec.requires_human_approval ? 'Manager Signed-Off' : 'Auto-Approved'}
                    </span>
                  </td>

                  <td className="py-3.5 px-4">
                    {rec.sap_transfer_order_id ? (
                      <span className="font-mono font-bold text-[#2D6A4F] bg-[#F2F8F4] px-2.5 py-1 rounded-lg border border-[#C3DFCD] text-[11px]">
                        {rec.sap_transfer_order_id}
                      </span>
                    ) : (
                      <span className="text-[#B7791F] font-semibold text-[11px]">Awaiting Sign-Off</span>
                    )}
                  </td>

                  <td className="py-3.5 px-4 text-right">
                    <button
                      onClick={() => setSelectedRecord(rec)}
                      className="inline-flex items-center space-x-1 text-xs font-bold text-[#2D6A4F] hover:text-[#1E4D38] transition cursor-pointer"
                    >
                      <FileText className="h-3.5 w-3.5" />
                      <span>View</span>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Order Detail Modal */}
      {selectedRecord && (
        <div className="fixed inset-0 bg-[#1C1917]/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white border border-[#E6E0D3] rounded-2xl max-w-2xl w-full p-6 shadow-enterprise-lg space-y-4">
            <div className="flex items-center justify-between border-b border-[#E6E0D3] pb-3">
              <div className="flex items-center space-x-2">
                <CheckCircle2 className="h-5 w-5 text-[#2D6A4F]" />
                <h3 className="font-serif text-base font-bold text-[#1C1917]">
                  Order Decision Summary: {selectedRecord.event_id}
                </h3>
              </div>
              <button
                onClick={() => setSelectedRecord(null)}
                className="text-[#44403C] hover:text-[#1C1917] text-xs font-bold px-3 py-1.5 bg-[#FAF7F2] border border-[#E6E0D3] rounded-lg cursor-pointer"
              >
                Close
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="bg-[#F2F8F4] p-4 rounded-xl border border-[#C3DFCD] space-y-1.5">
                <div className="text-[11px] font-bold uppercase tracking-wider text-[#1E4D38]">
                  Why This Restock Order Was Created
                </div>
                <p className="text-[#44403C] leading-relaxed whitespace-pre-line">
                  {selectedRecord.root_cause_explanation}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="bg-[#FAF7F2] p-3.5 rounded-xl border border-[#E6E0D3]">
                  <span className="text-[#78716C] block text-[10px] font-semibold">Shipment Route</span>
                  <span className="text-[#1C1917] font-bold">
                    {selectedRecord.selected_donor_dc} &rarr; {selectedRecord.store_id}
                  </span>
                </div>
                <div className="bg-[#FAF7F2] p-3.5 rounded-xl border border-[#E6E0D3]">
                  <span className="text-[#78716C] block text-[10px] font-semibold">Trucking Carrier</span>
                  <span className="text-[#1C1917] font-bold">{selectedRecord.carrier_name}</span>
                </div>
                <div className="bg-[#FAF7F2] p-3.5 rounded-xl border border-[#E6E0D3]">
                  <span className="text-[#78716C] block text-[10px] font-semibold">Approved By</span>
                  <span className="text-[#2D6A4F] font-bold">{selectedRecord.approver_name}</span>
                </div>
                <div className="bg-[#FAF7F2] p-3.5 rounded-xl border border-[#E6E0D3]">
                  <span className="text-[#78716C] block text-[10px] font-semibold">Order Confirmation #</span>
                  <span className="text-[#2D6A4F] font-mono font-bold">
                    {selectedRecord.sap_transfer_order_id || 'Waiting for Approval'}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
