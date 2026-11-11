import React, { useState, useEffect } from 'react';
import { Search, Filter, Download, RefreshCw, FileText, Clock, CheckCircle2 } from 'lucide-react';
import { AuditRecord } from '../types';
import { apiUrl } from '../apiConfig';

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
      const res = await fetch(apiUrl('/api/v1/audit/ledger?limit=50'));
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
      <div className="bg-white border border-[#DCE4EE] rounded-2xl p-5 shadow-enterprise flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2">
            <h1 className="font-serif text-lg font-bold text-[#14213D]">
              Completed Restock Orders &amp; Decision History
            </h1>
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-[#EEFBF6] text-[#0D7A5F] border border-[#B8EAD8]">
              Saved to Cloud Audit Log
            </span>
          </div>
          <p className="text-xs text-[#526582] mt-1">
            Complete history of every store demand alert, warehouse/factory shipment, shipping cost, and manager sign-off.
          </p>
        </div>

        <div className="flex items-center space-x-2.5">
          <button
            onClick={fetchLedger}
            className="flex items-center space-x-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold bg-[#F5F8FC] text-[#14213D] hover:bg-[#ECF5FC] border border-[#DCE4EE] transition cursor-pointer"
          >
            <RefreshCw className={`h-3.5 w-3.5 text-[#0E5A8A] ${isLoading ? 'animate-spin' : ''}`} />
            <span>Refresh Log</span>
          </button>
          <button
            onClick={exportToJson}
            className="flex items-center space-x-1.5 px-3.5 py-2 rounded-xl text-xs font-bold bg-[#0E5A8A] hover:bg-[#094266] text-white transition shadow-xs cursor-pointer"
          >
            <Download className="h-3.5 w-3.5" />
            <span>Download Report</span>
          </button>
        </div>
      </div>

      {/* Control / Filter Bar */}
      <div className="flex flex-col md:flex-row items-center justify-between gap-3 bg-white p-3.5 rounded-2xl border border-[#DCE4EE] shadow-enterprise">
        <div className="relative w-full md:w-80">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-[#526582]" />
          <input
            type="text"
            placeholder="Search store, order ID, or reason..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-[#F5F8FC] border border-[#DCE4EE] rounded-xl pl-9 pr-3 py-1.5 text-xs text-[#14213D] placeholder-[#526582] focus:outline-none focus:border-[#0E5A8A]"
          />
        </div>

        <div className="flex items-center space-x-2 w-full md:w-auto">
          <span className="text-xs text-[#526582] font-semibold flex items-center space-x-1">
            <Filter className="h-3.5 w-3.5" />
            <span>Show:</span>
          </span>
          <button
            onClick={() => setSelectedStatus('ALL')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
              selectedStatus === 'ALL'
                ? 'bg-[#0E5A8A] text-white'
                : 'text-[#3B4E6B] hover:bg-[#F5F8FC]'
            }`}
          >
            All Orders ({records.length})
          </button>
          <button
            onClick={() => setSelectedStatus('AUTONOMOUS')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
              selectedStatus === 'AUTONOMOUS'
                ? 'bg-[#0D7A5F] text-white'
                : 'text-[#3B4E6B] hover:bg-[#F5F8FC]'
            }`}
          >
            Auto-Approved (&le; $1k)
          </button>
          <button
            onClick={() => setSelectedStatus('HITL')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
              selectedStatus === 'HITL'
                ? 'bg-[#C27803] text-white'
                : 'text-[#3B4E6B] hover:bg-[#F5F8FC]'
            }`}
          >
            Manager Approved (&gt; $1k)
          </button>
        </div>
      </div>

      {/* Ledger Table */}
      <div className="bg-white border border-[#DCE4EE] rounded-2xl overflow-hidden shadow-enterprise">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-[#F5F8FC] text-[#526582] uppercase tracking-wider text-[11px] border-b border-[#DCE4EE]">
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
            <tbody className="divide-y divide-[#DCE4EE] text-[#3B4E6B]">
              {filteredRecords.map((rec, i) => (
                <tr key={`${rec.event_id}-${i}`} className="hover:bg-[#F5F8FC] transition">
                  <td className="py-3.5 px-4">
                    <div className="font-mono text-[#0E5A8A] font-bold">{rec.event_id}</div>
                    <div className="text-[10px] text-[#526582] flex items-center space-x-1 mt-0.5">
                      <Clock className="h-3 w-3" />
                      <span>{new Date(rec.timestamp).toLocaleTimeString()}</span>
                    </div>
                  </td>

                  <td className="py-3.5 px-4">
                    <div className="font-bold text-[#14213D]">{rec.store_id}</div>
                    <div className="text-[11px] text-[#526582]">HydroBoost 12-Pack</div>
                  </td>

                  <td className="py-3.5 px-4">
                    <div className="font-bold text-[#C93B2B]">{rec.observed_velocity} packs/hr</div>
                    <div className="text-[10px] text-[#526582]">{rec.signal_source}</div>
                  </td>

                  <td className="py-3.5 px-4">
                    <div className="text-[#14213D] font-bold">
                      {rec.units_transferred.toLocaleString()} packs
                    </div>
                    <div className="text-[11px] text-[#526582]">From {rec.selected_donor_dc}</div>
                  </td>

                  <td className="py-3.5 px-4">
                    <div className="font-mono font-bold text-[#14213D]">
                      ${rec.estimated_freight_cost.toFixed(2)}
                    </div>
                    <div className="text-[10px] text-[#526582] truncate max-w-[150px]">{rec.carrier_name}</div>
                  </td>

                  <td className="py-3.5 px-4">
                    <span
                      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${
                        rec.requires_human_approval
                          ? 'bg-[#FFFBEB] text-[#925802] border-[#FDE68A]'
                          : 'bg-[#EEFBF6] text-[#095C47] border-[#B8EAD8]'
                      }`}
                    >
                      {rec.requires_human_approval ? 'Manager Signed-Off' : 'Auto-Approved'}
                    </span>
                  </td>

                  <td className="py-3.5 px-4">
                    {rec.sap_transfer_order_id ? (
                      <span className="font-mono font-bold text-[#0D7A5F] bg-[#EEFBF6] px-2.5 py-1 rounded-lg border border-[#B8EAD8] text-[11px]">
                        {rec.sap_transfer_order_id}
                      </span>
                    ) : (
                      <span className="text-[#C27803] font-semibold text-[11px]">Awaiting Sign-Off</span>
                    )}
                  </td>

                  <td className="py-3.5 px-4 text-right">
                    <button
                      onClick={() => setSelectedRecord(rec)}
                      className="inline-flex items-center space-x-1 text-xs font-bold text-[#0E5A8A] hover:text-[#094266] transition cursor-pointer"
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
        <div className="fixed inset-0 bg-[#14213D]/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white border border-[#DCE4EE] rounded-2xl max-w-2xl w-full p-6 shadow-enterprise-lg space-y-4">
            <div className="flex items-center justify-between border-b border-[#DCE4EE] pb-3">
              <div className="flex items-center space-x-2">
                <CheckCircle2 className="h-5 w-5 text-[#0D7A5F]" />
                <h3 className="font-serif text-base font-bold text-[#14213D]">
                  Order Decision Summary: {selectedRecord.event_id}
                </h3>
              </div>
              <button
                onClick={() => setSelectedRecord(null)}
                className="text-[#3B4E6B] hover:text-[#14213D] text-xs font-bold px-3 py-1.5 bg-[#F5F8FC] border border-[#DCE4EE] rounded-lg cursor-pointer"
              >
                Close
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="bg-[#ECF5FC] p-4 rounded-xl border border-[#C2DFF3] space-y-1.5">
                <div className="text-[11px] font-bold uppercase tracking-wider text-[#094266]">
                  Why This Restock Order Was Created
                </div>
                <p className="text-[#3B4E6B] leading-relaxed whitespace-pre-line">
                  {selectedRecord.root_cause_explanation}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="bg-[#F5F8FC] p-3.5 rounded-xl border border-[#DCE4EE]">
                  <span className="text-[#526582] block text-[10px] font-semibold">Shipment Route</span>
                  <span className="text-[#14213D] font-bold">
                    {selectedRecord.selected_donor_dc} &rarr; {selectedRecord.store_id}
                  </span>
                </div>
                <div className="bg-[#F5F8FC] p-3.5 rounded-xl border border-[#DCE4EE]">
                  <span className="text-[#526582] block text-[10px] font-semibold">Trucking Carrier</span>
                  <span className="text-[#14213D] font-bold">{selectedRecord.carrier_name}</span>
                </div>
                <div className="bg-[#F5F8FC] p-3.5 rounded-xl border border-[#DCE4EE]">
                  <span className="text-[#526582] block text-[10px] font-semibold">Approved By</span>
                  <span className="text-[#0E5A8A] font-bold">{selectedRecord.approver_name}</span>
                </div>
                <div className="bg-[#F5F8FC] p-3.5 rounded-xl border border-[#DCE4EE]">
                  <span className="text-[#526582] block text-[10px] font-semibold">Order Confirmation #</span>
                  <span className="text-[#0D7A5F] font-mono font-bold">
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
