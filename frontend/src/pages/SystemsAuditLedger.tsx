import React, { useState, useEffect } from 'react';
import { Database, Search, Filter, ShieldCheck, Download, RefreshCw, FileText, CheckCircle, Clock, ExternalLink } from 'lucide-react';
import { AuditRecord } from '../types';

export const SystemsAuditLedger: React.FC = () => {
  const [records, setRecords] = useState<AuditRecord[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedStatus, setSelectedStatus] = useState<string>('ALL');
  const [selectedRecord, setSelectedRecord] = useState<AuditRecord | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const mockAuditLedger: AuditRecord[] = [
    {
      event_id: 'evt_tx_9921',
      timestamp: '2026-10-29T12:35:10Z',
      signal_source: 'POS_CHECKOUT_STREAM',
      store_id: 'STORE-DAL-04',
      sku_id: 'SKU-4089-HYDRATE',
      observed_velocity: 85.0,
      root_cause_explanation: 'Demand surge (+380% over baseline) confirmed authentic consumer pull. Driven by an ambient 98.2°F heatwave coinciding with North Texas Youth Soccer Cup (12,000 attendees within 1.8 mi).',
      selected_donor_dc: 'DC-ATX-02',
      units_transferred: 1500,
      freight_mode: 'LATERAL_GROUND_TRANSFER',
      carrier_name: 'Texas Fleet Logistics (Dedicated)',
      estimated_freight_cost: 750.00,
      gate_status: 'APPROVED',
      requires_human_approval: false,
      approver_name: 'NexusTwin Autonomous Agent Swarm (Cost < $1,000)',
      sap_transfer_order_id: 'STO-SAP-99214',
    },
    {
      event_id: 'evt_tx_9922',
      timestamp: '2026-10-29T11:15:42Z',
      signal_source: 'POS_CHECKOUT_STREAM',
      store_id: 'STORE-FW-02',
      sku_id: 'SKU-8821-SNACK',
      observed_velocity: 42.5,
      root_cause_explanation: 'Promotion-driven velocity spike (+120%) due to local weekend tailgate promotion. Validated against store inventory threshold.',
      selected_donor_dc: 'DC-SAT-03',
      units_transferred: 800,
      freight_mode: 'LATERAL_GROUND_TRANSFER',
      carrier_name: 'LoneStar Freight Express',
      estimated_freight_cost: 420.00,
      gate_status: 'APPROVED',
      requires_human_approval: false,
      approver_name: 'NexusTwin Autonomous Agent Swarm (Cost < $1,000)',
      sap_transfer_order_id: 'STO-SAP-99215',
    },
    {
      event_id: 'evt_tx_9923_high_val',
      timestamp: '2026-10-29T10:45:00Z',
      signal_source: 'POS_CHECKOUT_STREAM',
      store_id: 'STORE-DAL-04',
      sku_id: 'SKU-1022-PROTEIN',
      observed_velocity: 64.0,
      root_cause_explanation: 'Regional fitness expo created sudden stocking void. Expedited replenishment requested to maintain shelf presence.',
      selected_donor_dc: 'DC-HOU-01',
      units_transferred: 2400,
      freight_mode: 'EXPEDITED_AIR_FREIGHT',
      carrier_name: 'LoneStar Expedited Air Cargo',
      estimated_freight_cost: 3500.00,
      gate_status: 'APPROVED',
      requires_human_approval: true,
      approver_name: 'VP Supply Chain Operations (Manual Approval)',
      sap_transfer_order_id: 'STO-SAP-99216',
    },
    {
      event_id: 'evt_tx_9918',
      timestamp: '2026-10-28T18:22:15Z',
      signal_source: 'SAP_ERP_INVENTORY_DELTA',
      store_id: 'STORE-PLANO-07',
      sku_id: 'SKU-4089-HYDRATE',
      observed_velocity: 38.0,
      root_cause_explanation: 'Standard distribution buffer balancing. Lead time analysis shows 18 hours buffer remaining.',
      selected_donor_dc: 'DC-ATX-02',
      units_transferred: 600,
      freight_mode: 'LATERAL_GROUND_TRANSFER',
      carrier_name: 'Texas Fleet Logistics (Dedicated)',
      estimated_freight_cost: 380.00,
      gate_status: 'APPROVED',
      requires_human_approval: false,
      approver_name: 'NexusTwin Autonomous Agent Swarm (Cost < $1,000)',
      sap_transfer_order_id: 'STO-SAP-99210',
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
    downloadAnchor.setAttribute('download', `nexustwin_audit_ledger_${new Date().toISOString()}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  return (
    <div className="h-full flex flex-col p-6 space-y-6 overflow-y-auto">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2">
            <h1 className="text-xl font-bold tracking-tight text-white">Systems Audit Ledger</h1>
            <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold bg-teal-500/20 text-teal-300 border border-teal-500/30">
              BigQuery Lakehouse Sink
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Immutable supply chain decision trace log: signal ingest $\rightarrow$ multi-agent deliberation $\rightarrow$ 4-Rule Feasibility Gate $\rightarrow$ SAP STO creation.
          </p>
        </div>

        <div className="flex items-center space-x-3">
          <button
            onClick={fetchLedger}
            className="flex items-center space-x-1 px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white border border-slate-700 transition"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>
          <button
            onClick={exportToJson}
            className="flex items-center space-x-1 px-3 py-1.5 rounded-lg text-xs font-semibold bg-teal-500 hover:bg-teal-400 text-slate-950 transition shadow-sm"
          >
            <Download className="h-3.5 w-3.5" />
            <span>Export Lakehouse JSON</span>
          </button>
        </div>
      </div>

      {/* Control / Filter Bar */}
      <div className="flex flex-col md:flex-row items-center justify-between gap-3 bg-slate-900/60 p-3 rounded-xl border border-slate-800">
        <div className="relative w-full md:w-80">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-500" />
          <input
            type="text"
            placeholder="Search event ID, SKU, store or cause..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-9 pr-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-teal-500"
          />
        </div>

        <div className="flex items-center space-x-2 w-full md:w-auto">
          <span className="text-xs text-slate-400 flex items-center space-x-1">
            <Filter className="h-3.5 w-3.5" />
            <span>Filter:</span>
          </span>
          <button
            onClick={() => setSelectedStatus('ALL')}
            className={`px-2.5 py-1 rounded text-xs transition ${
              selectedStatus === 'ALL'
                ? 'bg-teal-500/20 text-teal-300 border border-teal-500/40 font-semibold'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            All Traces ({records.length})
          </button>
          <button
            onClick={() => setSelectedStatus('AUTONOMOUS')}
            className={`px-2.5 py-1 rounded text-xs transition ${
              selectedStatus === 'AUTONOMOUS'
                ? 'bg-teal-500/20 text-teal-300 border border-teal-500/40 font-semibold'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            Autonomous (&lt; $1k)
          </button>
          <button
            onClick={() => setSelectedStatus('HITL')}
            className={`px-2.5 py-1 rounded text-xs transition ${
              selectedStatus === 'HITL'
                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 font-semibold'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            HITL Escalated
          </button>
        </div>
      </div>

      {/* Ledger Table */}
      <div className="bg-slate-900/60 border border-slate-800 rounded-xl overflow-hidden shadow-lg">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-950/80 text-slate-400 uppercase tracking-wider text-[11px] border-b border-slate-800">
              <tr>
                <th className="py-3 px-4 font-semibold">Event ID & Timestamp</th>
                <th className="py-3 px-4 font-semibold">Store / SKU</th>
                <th className="py-3 px-4 font-semibold">Velocity</th>
                <th className="py-3 px-4 font-semibold">Transfer Details</th>
                <th className="py-3 px-4 font-semibold">Freight & Cost</th>
                <th className="py-3 px-4 font-semibold">Gate & Approver</th>
                <th className="py-3 px-4 font-semibold">SAP Order</th>
                <th className="py-3 px-4 font-semibold text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 text-slate-300">
              {filteredRecords.map((rec) => (
                <tr key={rec.event_id} className="hover:bg-slate-800/40 transition">
                  <td className="py-3 px-4">
                    <div className="font-mono text-teal-300 font-bold">{rec.event_id}</div>
                    <div className="text-[10px] text-slate-500 flex items-center space-x-1 mt-0.5">
                      <Clock className="h-3 w-3" />
                      <span>{new Date(rec.timestamp).toLocaleTimeString()}</span>
                    </div>
                  </td>

                  <td className="py-3 px-4">
                    <div className="font-medium text-white">{rec.store_id}</div>
                    <div className="text-[11px] text-slate-400 font-mono">{rec.sku_id}</div>
                  </td>

                  <td className="py-3 px-4">
                    <div className="font-semibold text-emerald-400">{rec.observed_velocity} u/hr</div>
                    <div className="text-[10px] text-slate-500">{rec.signal_source}</div>
                  </td>

                  <td className="py-3 px-4">
                    <div className="text-white font-medium">
                      {rec.units_transferred.toLocaleString()} units
                    </div>
                    <div className="text-[11px] text-slate-400">from {rec.selected_donor_dc}</div>
                  </td>

                  <td className="py-3 px-4">
                    <div className="font-mono font-bold text-amber-300">
                      ${rec.estimated_freight_cost.toFixed(2)}
                    </div>
                    <div className="text-[10px] text-slate-400 truncate max-w-[140px]">{rec.carrier_name}</div>
                  </td>

                  <td className="py-3 px-4">
                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold ${
                        rec.requires_human_approval
                          ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                          : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                      }`}
                    >
                      {rec.requires_human_approval ? 'HITL Approved' : 'Autonomous Gate'}
                    </span>
                    <div className="text-[10px] text-slate-400 truncate max-w-[150px] mt-1">
                      {rec.approver_name}
                    </div>
                  </td>

                  <td className="py-3 px-4">
                    {rec.sap_transfer_order_id ? (
                      <span className="font-mono text-emerald-400 bg-emerald-950/40 px-2 py-0.5 rounded border border-emerald-800/40 text-[11px]">
                        {rec.sap_transfer_order_id}
                      </span>
                    ) : (
                      <span className="text-slate-500 font-mono text-[11px]">—</span>
                    )}
                  </td>

                  <td className="py-3 px-4 text-right">
                    <button
                      onClick={() => setSelectedRecord(rec)}
                      className="inline-flex items-center space-x-1 text-xs text-teal-400 hover:text-teal-300 transition"
                    >
                      <FileText className="h-3.5 w-3.5" />
                      <span>Trace</span>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Trace Detail Modal */}
      {selectedRecord && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-2xl w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center space-x-2">
                <Database className="h-5 w-5 text-teal-400" />
                <h3 className="text-sm font-bold text-white">
                  Lakehouse Audit Manifest: {selectedRecord.event_id}
                </h3>
              </div>
              <button
                onClick={() => setSelectedRecord(null)}
                className="text-slate-400 hover:text-white text-xs font-semibold px-2 py-1 bg-slate-800 rounded"
              >
                Close
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800 space-y-2">
                <div className="text-[11px] font-semibold uppercase tracking-wider text-teal-400">
                  Root Cause Explanation (Sensing Agent)
                </div>
                <p className="text-slate-300 leading-relaxed">{selectedRecord.root_cause_explanation}</p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="bg-slate-950 p-3 rounded-lg border border-slate-800">
                  <span className="text-slate-500 block text-[10px]">Source & Target</span>
                  <span className="text-white font-semibold">
                    {selectedRecord.selected_donor_dc} $\rightarrow$ {selectedRecord.store_id}
                  </span>
                </div>
                <div className="bg-slate-950 p-3 rounded-lg border border-slate-800">
                  <span className="text-slate-500 block text-[10px]">Carrier & Freight Mode</span>
                  <span className="text-white font-semibold">
                    {selectedRecord.carrier_name} ({selectedRecord.freight_mode})
                  </span>
                </div>
                <div className="bg-slate-950 p-3 rounded-lg border border-slate-800">
                  <span className="text-slate-500 block text-[10px]">Governance Approver</span>
                  <span className="text-teal-300 font-semibold">{selectedRecord.approver_name}</span>
                </div>
                <div className="bg-slate-950 p-3 rounded-lg border border-slate-800">
                  <span className="text-slate-500 block text-[10px]">SAP S/4HANA Order ID</span>
                  <span className="text-emerald-400 font-mono font-bold">
                    {selectedRecord.sap_transfer_order_id || 'PENDING_APPROVAL'}
                  </span>
                </div>
              </div>

              <div>
                <span className="text-slate-500 block text-[10px] mb-1">
                  Raw BigQuery Lakehouse Schema Payload
                </span>
                <pre className="bg-slate-950 p-3 rounded-lg border border-slate-800 text-[11px] font-mono text-slate-300 overflow-x-auto max-h-48">
                  {JSON.stringify(selectedRecord, null, 2)}
                </pre>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
