import React, { useState, useEffect } from 'react';
import { Search, Filter, Download, RefreshCw, FileText, Clock, CheckCircle2 } from 'lucide-react';
import { AuditRecord } from '../types';
import { apiUrl } from '../apiConfig';
import { getNodeDisplayName } from '../nodeCatalog';

export const SystemsAuditLedger: React.FC = () => {
  const [records, setRecords] = useState<AuditRecord[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedStatus, setSelectedStatus] = useState<string>('ALL');
  const [selectedRecord, setSelectedRecord] = useState<AuditRecord | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const fetchLedger = async () => {
    setIsLoading(true);
    try {
      const res = await fetch(apiUrl('/api/v1/audit/ledger?limit=50'));
      if (res.ok) {
        const data = await res.json();
        const rawRows = Array.isArray(data) ? data : data.records;
        if (Array.isArray(rawRows)) {
          const cleanRows = rawRows.filter(
            (r: any) =>
              r.event_id !== 'evt_tx_baseline_init' &&
              r.signal_source !== 'LAKEHOUSE_BASELINE_INIT' &&
              r.signal_source !== 'BIGQUERY_LAKEHOUSE_INIT' &&
              r.order_type !== 'NONE'
          );
          // Deduplicate by event_id — prefer the finalized row with a real STO/PO order ID over an earlier Pending row
          const byEvent = new Map<string, any>();
          for (const row of cleanRows) {
            const existing = byEvent.get(row.event_id);
            const rowHasOrder = Boolean(row.sap_transfer_order_id && String(row.sap_transfer_order_id).trim());
            const existingHasOrder = Boolean(
              existing?.sap_transfer_order_id && String(existing.sap_transfer_order_id).trim()
            );
            if (
              !existing ||
              (rowHasOrder && !existingHasOrder) ||
              (rowHasOrder === existingHasOrder && String(row.timestamp || '') >= String(existing.timestamp || ''))
            ) {
              byEvent.set(row.event_id, row);
            }
          }
          const deduped = Array.from(byEvent.values()).sort((a, b) =>
            String(b.timestamp || '').localeCompare(String(a.timestamp || ''))
          );
          setRecords(deduped);
        } else {
          setRecords([]);
        }
      }
    } catch {
      // Keep current records if offline
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
              {filteredRecords.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-10 px-4 text-center text-xs text-[#526582]">
                    No restock orders recorded in BigQuery <code className="font-mono">audit_ledger</code> yet. Run any scenario on Tab 1 to see real autonomous STOs and VP-approved B2B FMCG POs appear here.
                  </td>
                </tr>
              ) : (
                filteredRecords.map((rec, i) => {
                  const hasOrderId = Boolean(rec.sap_transfer_order_id && rec.sap_transfer_order_id.trim());
                  const isPendingVp = rec.requires_human_approval && !hasOrderId;
                  return (
                    <tr key={`${rec.event_id}-${i}`} className="hover:bg-[#F5F8FC] transition">
                      <td className="py-3.5 px-4">
                        <div className="font-mono text-[#0E5A8A] font-bold">{rec.event_id}</div>
                        <div className="text-[10px] text-[#526582] flex items-center space-x-1 mt-0.5">
                          <Clock className="h-3 w-3" />
                          <span>{new Date(rec.timestamp).toLocaleTimeString()}</span>
                        </div>
                      </td>

                      <td className="py-3.5 px-4">
                        <div className="font-bold text-[#14213D]">{getNodeDisplayName(rec.store_id)}</div>
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
                        <div className="text-[11px] text-[#526582]">From {getNodeDisplayName(rec.selected_donor_dc)}</div>
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
                            isPendingVp
                              ? 'bg-[#FFFBEB] text-[#925802] border-[#FDE68A]'
                              : rec.requires_human_approval
                              ? 'bg-[#ECF5FC] text-[#094266] border-[#C2DFF3]'
                              : 'bg-[#EEFBF6] text-[#095C47] border-[#B8EAD8]'
                          }`}
                        >
                          {isPendingVp
                            ? 'Pending VP Sign-Off'
                            : rec.requires_human_approval
                            ? 'VP Approved (> $1k)'
                            : 'Auto-Approved (<= $1k)'}
                        </span>
                      </td>

                      <td className="py-3.5 px-4">
                        {hasOrderId ? (
                          <span className="font-mono font-bold text-[#0D7A5F] bg-[#EEFBF6] px-2.5 py-1 rounded-lg border border-[#B8EAD8] text-[11px]">
                            {rec.sap_transfer_order_id}
                          </span>
                        ) : isPendingVp ? (
                          <span className="text-[#C27803] font-semibold text-[11px]">Awaiting VP Sign-Off</span>
                        ) : (
                          <span className="text-[#526582] font-mono text-[11px]">—</span>
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
                  );
                })
              )}
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
                    {getNodeDisplayName(selectedRecord.selected_donor_dc)} &rarr; {getNodeDisplayName(selectedRecord.store_id)}
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
