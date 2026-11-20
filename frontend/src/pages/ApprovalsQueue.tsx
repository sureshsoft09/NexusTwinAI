import React, { useState } from 'react';
import { CheckCircle2, UserCheck, Clock, RefreshCw, ShieldCheck, Factory } from 'lucide-react';
import { getNodeDisplayName } from '../nodeCatalog';

export interface A2AApprovalCard {
  ticket_id: string;
  event_id: string;
  order_type?: string;
  agent_name: string;
  agent_card_url: string;
  a2a_task_state: string;
  tool_invoked: string;
  status: string;
  store_id: string;
  store_display_name?: string;
  donor_dc?: string;
  donor_display_name?: string;
  sku_id: string;
  units: number;
  freight_cost: number;
  fmcg_po_merchandise_cost?: number;
  total_financial_commitment?: number;
  freight_mode: string;
  carrier: string;
  reason: string;
  created_at: string;
  sap_order_id?: string;
  sap_transfer_order_id?: string;
  vertex_session_id?: string;
  vp_approval_token?: string;
  a2a_resume_response?: string;
  gate_rules_verified?: Array<{
    rule_name: string;
    passed: boolean;
    formula_expression?: string;
    message?: string;
  }>;
}

interface ApprovalsQueueProps {
  cards: A2AApprovalCard[];
  approvedOrders: Record<string, string>;
  pendingCount: number;
  onApproveCard: (eventId: string) => Promise<void>;
  onRefreshCards: () => Promise<void>;
}

export const ApprovalsQueue: React.FC<ApprovalsQueueProps> = ({
  cards,
  approvedOrders,
  pendingCount,
  onApproveCard,
  onRefreshCards,
}) => {
  const [loadingItem, setLoadingItem] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState<boolean>(false);

  const handleApproveClick = async (eventId: string) => {
    setLoadingItem(eventId);
    try {
      await onApproveCard(eventId);
    } finally {
      setLoadingItem(null);
    }
  };

  const handleRefreshClick = async () => {
    setRefreshing(true);
    try {
      await onRefreshCards();
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <div className="h-full flex flex-col p-6 space-y-6 overflow-y-auto">
      <div className="bg-white border border-[#DCE4EE] rounded-2xl p-5 shadow-enterprise flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="font-serif text-lg font-bold text-[#14213D]">
            Manager Sign-Off Queue — Cloud Run Remote A2A Governance (Firestore Queue)
          </h1>
          <p className="text-xs text-[#526582] mt-1">
            Internal Retail STOs &le; $1,000 execute autonomously. High-value or External B2B FMCG Purchase Orders pause via <strong>RemoteA2aAgent</strong> (`input-required`) after Gates 1–3 pass, then <strong>resume the exact paused Vertex AI session</strong> upon VP sign-off.
          </p>
        </div>
        <div className="flex items-center space-x-3 shrink-0">
          <button
            onClick={handleRefreshClick}
            className="flex items-center space-x-1.5 text-xs text-[#14213D] hover:bg-[#ECF5FC] bg-[#F5F8FC] border border-[#DCE4EE] px-3.5 py-2 rounded-xl font-semibold transition cursor-pointer"
          >
            <RefreshCw className={`h-3.5 w-3.5 text-[#0E5A8A] ${refreshing ? 'animate-spin' : ''}`} />
            <span>Refresh Queue</span>
          </button>
          <div className="flex items-center space-x-2 text-xs text-[#925802] bg-[#FFFBEB] border border-[#FDE68A] px-3.5 py-2 rounded-xl font-bold">
            <Clock className="h-4 w-4 text-[#C27803]" />
            <span>Waiting for Sign-Off: {pendingCount}</span>
          </div>
        </div>
      </div>

      {/* 4 Mathematical Feasibility Gate Rules Summary */}
      <div className="bg-white border border-[#DCE4EE] rounded-2xl p-5 shadow-enterprise">
        <div className="flex items-center space-x-2 mb-3">
          <ShieldCheck className="h-4 w-4 text-[#0E5A8A]" />
          <h2 className="font-serif text-sm font-bold text-[#14213D]">
            In-Loop 4-Gate Guardrail Verified BEFORE Any Order Reaches VP Sign-Off
          </h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3 text-xs">
          <div className="bg-[#EEFBF6] p-3.5 rounded-xl border border-[#B8EAD8] space-y-1">
            <span className="text-[#095C47] font-bold">Gate 1 • ATP Integrity ✓</span>
            <p className="font-bold text-[#14213D]">Available Spare &ge; Order Qty</p>
            <p className="text-[11px] text-[#3B4E6B]">Verified live against BigQuery Retail / FMCG ERP.</p>
          </div>
          <div className="bg-[#EEFBF6] p-3.5 rounded-xl border border-[#B8EAD8] space-y-1">
            <span className="text-[#095C47] font-bold">Gate 2 • Delivery SLA ✓</span>
            <p className="font-bold text-[#14213D]">Transit ETA &le; Delivery Window</p>
            <p className="text-[11px] text-[#3B4E6B]">Verified live against 3PL Logistics Rates MCP.</p>
          </div>
          <div className="bg-[#EEFBF6] p-3.5 rounded-xl border border-[#B8EAD8] space-y-1">
            <span className="text-[#095C47] font-bold">Gate 3 • Profit ROI ✓</span>
            <p className="font-bold text-[#14213D]">Protected Margin &gt; Shipping</p>
            <p className="text-[11px] text-[#3B4E6B]">Confirms strictly net-positive retail profit ($6.20/pk).</p>
          </div>
          <div className="bg-[#FFFBEB] p-3.5 rounded-xl border border-[#FDE68A] space-y-1">
            <span className="text-[#C27803] font-bold">Gate 4 • $1k / B2B Cap ⏳</span>
            <p className="font-bold text-[#14213D]">Internal STO &le; $1,000 or VP Token</p>
            <p className="text-[11px] text-[#3B4E6B]">Cross-company FMCG POs require signed VP token.</p>
          </div>
        </div>
      </div>

      {/* Pending Approval Cards List */}
      {cards.length === 0 ? (
        <div className="bg-white border border-[#DCE4EE] rounded-2xl p-10 text-center space-y-2 shadow-enterprise">
          <CheckCircle2 className="h-10 w-10 text-[#0D7A5F] mx-auto" />
          <h3 className="font-serif text-base font-bold text-[#14213D]">No Orders Waiting for VP Sign-Off</h3>
          <p className="text-xs text-[#526582]">
            Cloud Firestore `a2a_approval_queue` currently has 0 pending tickets. Run <strong>2. Shop 2: Houston POS Stream</strong> on Tab 1 to trigger a real Retail DC Shortage &rarr; External B2B FMCG Purchase Order escalation via RemoteA2aAgent.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {cards.map((item) => {
            const sapOrder = approvedOrders[item.event_id] || item.sap_order_id || item.sap_transfer_order_id;
            const isApproved = Boolean(sapOrder) || item.status === 'approved';
            const isFactory = (item.donor_dc || '').toUpperCase().includes('FMCG') || item.order_type === 'PO_TO_FMCG';
            const freightVal = item.freight_cost || 1850.0;
            const merchVal = item.fmcg_po_merchandise_cost || (isFactory ? Math.round(item.units * 8.79) : 0);
            const totalCommitment = item.total_financial_commitment || Math.round((freightVal + merchVal) * 100) / 100;
            const storeDisplay = item.store_display_name || getNodeDisplayName(item.store_id);
            const sourceDisplay = item.donor_display_name || getNodeDisplayName(item.donor_dc || 'FMCG-PLANT-TX01');

            return (
              <div
                key={item.event_id}
                className={`p-6 rounded-2xl border transition shadow-enterprise ${
                  isApproved
                    ? 'bg-[#EEFBF6] border-[#B8EAD8]'
                    : 'bg-white border-[#FDE68A]'
                }`}
              >
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
                  <div className="space-y-3 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`text-[11px] font-bold px-3 py-1 rounded-full border ${
                          isApproved
                            ? 'bg-[#0D7A5F] text-white border-[#0D7A5F]'
                            : 'bg-[#FFFBEB] text-[#925802] border-[#FDE68A]'
                        }`}
                      >
                        {isApproved
                          ? '✅ APPROVED BY VP • A2A SESSION RESUMED & PO DISPATCHED'
                          : `⏳ A2A STATE: ${item.a2a_task_state || 'input-required'} • WAITING FOR VP`}
                      </span>
                      <span className="text-xs font-mono font-semibold text-[#094266] bg-[#ECF5FC] px-2.5 py-0.5 rounded-lg border border-[#C2DFF3]">
                        Ticket #{item.ticket_id}
                      </span>
                      {item.vertex_session_id && (
                        <span className="text-[10px] font-mono text-[#526582] bg-[#F5F8FC] px-2 py-0.5 rounded border border-[#DCE4EE]">
                          Session: {item.vertex_session_id.slice(0, 14)}...
                        </span>
                      )}
                    </div>

                    <div className="flex items-center space-x-2">
                      <Factory className="h-5 w-5 text-[#C27803] shrink-0" />
                      <h3 className="font-serif text-base font-bold text-[#14213D]">
                        Restock {storeDisplay} &larr; {sourceDisplay}
                      </h3>
                    </div>

                    <p className="text-xs text-[#3B4E6B]">
                      Product: <strong className="text-[#14213D]">HydroBoost Electrolyte 12-Pack ({item.sku_id})</strong> • Quantity:{' '}
                      <strong className="text-[#0E5A8A]">{item.units.toLocaleString()} packs</strong> • Carrier:{' '}
                      <strong className="text-[#14213D]">{item.carrier}</strong>
                    </p>

                    {/* Pre-Verified Gates 1-3 + Gate 4 */}
                    {Array.isArray(item.gate_rules_verified) && item.gate_rules_verified.length > 0 && (
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 text-[10px]">
                        {item.gate_rules_verified.map((r, rIdx) => {
                          const passedNow = r.passed || (isApproved && rIdx === 3);
                          return (
                            <div
                              key={r.rule_name}
                              className={`px-2 py-1.5 rounded-lg border font-mono ${
                                passedNow
                                  ? 'bg-[#EEFBF6] border-[#B8EAD8] text-[#095C47]'
                                  : 'bg-[#FFFBEB] border-[#FDE68A] text-[#925802]'
                              }`}
                            >
                              <div className="font-bold">
                                Gate {rIdx + 1}: {passedNow ? 'PASS ✓' : 'VP SIGN ⏳'}
                              </div>
                              <div className="truncate text-[9px]">{r.formula_expression}</div>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    <div className="p-3 bg-[#FFFBEB] border border-[#FDE68A] rounded-xl text-xs text-[#925802] leading-relaxed">
                      <strong>Gate 4 Governance Policy:</strong> {item.reason}
                    </div>

                    {isApproved && item.a2a_resume_response && (
                      <div className="p-3 bg-white border border-[#B8EAD8] rounded-xl text-[11px] text-[#095C47] leading-relaxed">
                        <strong>Resumed RemoteA2aAgent Response ({item.vp_approval_token || 'VP Signed'}):</strong>{' '}
                        {item.a2a_resume_response}
                      </div>
                    )}
                  </div>

                  <div className="flex flex-col lg:items-end justify-between space-y-4 shrink-0 bg-[#F5F8FC] p-4 rounded-xl border border-[#DCE4EE] min-w-[260px]">
                    <div className="lg:text-right space-y-1">
                      <span className="text-[11px] font-semibold text-[#526582] block">
                        Total B2B Order Commitment
                      </span>
                      <p className="font-serif text-2xl font-bold text-[#14213D]">
                        ${totalCommitment.toLocaleString()}
                      </p>
                      <span className="text-[11px] text-[#C27803] font-semibold block">
                        {merchVal > 0 ? `$${merchVal.toLocaleString()} Wholesale + ` : ''}${freightVal.toLocaleString()} Shipping
                      </span>
                    </div>

                    {!isApproved ? (
                      <button
                        onClick={() => handleApproveClick(item.event_id)}
                        disabled={loadingItem === item.event_id}
                        className="w-full flex items-center justify-center space-x-2 bg-[#0E5A8A] hover:bg-[#094266] text-white text-xs font-bold px-5 py-3 rounded-xl shadow-sm transition disabled:opacity-50 cursor-pointer"
                      >
                        <UserCheck className="h-4 w-4" />
                        <span>
                          {loadingItem === item.event_id
                            ? 'Resuming A2A Agent & Issuing PO...'
                            : 'Approve & Resume Remote A2A Agent'}
                        </span>
                      </button>
                    ) : (
                      <div className="w-full flex items-center justify-center space-x-1.5 text-xs text-[#095C47] font-bold bg-[#D5F5E9] border border-[#B8EAD8] px-4 py-2.5 rounded-xl">
                        <CheckCircle2 className="h-4 w-4 text-[#0D7A5F]" />
                        <span>PO #{sapOrder} Dispatched!</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
