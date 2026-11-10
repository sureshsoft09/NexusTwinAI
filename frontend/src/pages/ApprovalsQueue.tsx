import React, { useState } from 'react';
import { CheckCircle2, UserCheck, Clock, RefreshCw, ShieldCheck, Factory } from 'lucide-react';

export interface A2AApprovalCard {
  ticket_id: string;
  event_id: string;
  agent_name: string;
  agent_card_url: string;
  a2a_task_state: string;
  tool_invoked: string;
  status: string;
  store_id: string;
  donor_dc?: string;
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
}

export const DEFAULT_FALLBACK_CARDS: A2AApprovalCard[] = [
  {
    ticket_id: 'PO-REQ-HOU-1800',
    event_id: 'evt_shop2_fmcg_po_hitl',
    agent_name: 'VP Supply Chain Approval Gate',
    agent_card_url: 'http://localhost:8001/a2a/human_in_loop/.well-known/agent.json',
    a2a_task_state: 'Awaiting Manager Signature',
    tool_invoked: 'Factory Purchase Order Approval',
    status: 'pending',
    store_id: 'STORE-HOU-05',
    donor_dc: 'FMCG-PLANT-TX01 (via DC-HOU-01)',
    sku_id: 'SKU-4089-HYDRATE',
    units: 1800,
    freight_cost: 1850.0,
    fmcg_po_merchandise_cost: 15822.0,
    total_financial_commitment: 17672.0,
    freight_mode: 'Direct Factory Cold-Chain Truck ($15,822 Product + $1,850 Shipping)',
    carrier: 'HydroBoost Direct Cold-Chain Carrier',
    reason:
      'Houston Warehouse (DC-HOU-01) only has 180 spare packs—not enough for Houston Galleria Store’s 1,800-pack surge. The AI prepared a direct Factory Purchase Order to Waco Bottling Factory ($17,672 total / $1,850 shipping) which requires VP approval because it exceeds the $1,000 automatic limit.',
    created_at: '2026-11-06T12:45:00Z',
  },
];

interface ApprovalsQueueProps {
  cards: A2AApprovalCard[];
  approvedOrders: Record<string, string>;
  pendingCount: number;
  onApproveCard: (eventId: string) => Promise<void>;
  onRefreshCards: () => Promise<void>;
}

const STORE_FRIENDLY_NAME: Record<string, string> = {
  'STORE-HOU-05': 'Shop 2: Houston Galleria Store (STORE-HOU-05)',
  'STORE-DAL-04': 'Shop 1: Dallas Uptown Store (STORE-DAL-04)',
  'STORE-PLANO-07': 'Shop 3: Plano Legacy Store (STORE-PLANO-07)',
  'STORE-ARL-11': 'Shop 4: Arlington Stadium Store (STORE-ARL-11)',
};

const SOURCE_FRIENDLY_NAME: Record<string, string> = {
  'FMCG-PLANT-TX01': 'Waco Bottling Factory (FMCG-PLANT-TX01)',
  'FMCG-PLANT-TX01 (via DC-HOU-01)': 'Waco Bottling Factory (because Houston Warehouse only has 180 spare packs)',
  'DC-ATX-02': 'Austin Regional Warehouse (DC-ATX-02)',
  'DC-HOU-01': 'Houston Regional Warehouse (DC-HOU-01)',
  'DC-SAT-03': 'San Antonio Regional Warehouse (DC-SAT-03)',
};

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
      <div className="bg-white border border-[#E6E0D3] rounded-2xl p-5 shadow-enterprise flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="font-serif text-lg font-bold text-[#1C1917]">
            Manager Sign-Off Queue (Orders Over $1,000 Auto-Approval Cap)
          </h1>
          <p className="text-xs text-[#78716C] mt-1">
            Routine warehouse transfers &le; $1,000 ship automatically. Larger orders or direct Factory Purchase Orders pause here for 1-click VP approval.
          </p>
        </div>
        <div className="flex items-center space-x-3 shrink-0">
          <button
            onClick={handleRefreshClick}
            className="flex items-center space-x-1.5 text-xs text-[#1C1917] hover:bg-[#F3EFE6] bg-[#FAF7F2] border border-[#E6E0D3] px-3.5 py-2 rounded-xl font-semibold transition cursor-pointer"
          >
            <RefreshCw className={`h-3.5 w-3.5 text-[#2D6A4F] ${refreshing ? 'animate-spin' : ''}`} />
            <span>Refresh Queue</span>
          </button>
          <div className="flex items-center space-x-2 text-xs text-[#925E14] bg-[#FEF9EE] border border-[#F9DFAA] px-3.5 py-2 rounded-xl font-bold">
            <Clock className="h-4 w-4 text-[#B7791F]" />
            <span>Waiting for Sign-Off: {pendingCount}</span>
          </div>
        </div>
      </div>

      {/* 4 Mathematical Feasibility Gate Rules Summary */}
      <div className="bg-white border border-[#E6E0D3] rounded-2xl p-5 shadow-enterprise">
        <div className="flex items-center space-x-2 mb-3">
          <ShieldCheck className="h-4 w-4 text-[#2D6A4F]" />
          <h2 className="font-serif text-sm font-bold text-[#1C1917]">
            The 4 Mathematical Safety Checks Verified Before Any Order Reaches This Queue
          </h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3 text-xs">
          <div className="bg-[#FAF7F2] p-3.5 rounded-xl border border-[#E6E0D3] space-y-1">
            <span className="text-[#2D6A4F] font-bold">Math Check 1 • Spare Stock</span>
            <p className="font-bold text-[#1C1917]">Available Spare &ge; Order Qty</p>
            <p className="text-[11px] text-[#78716C]">Never dips into a warehouse’s emergency safety reserve.</p>
          </div>
          <div className="bg-[#FAF7F2] p-3.5 rounded-xl border border-[#E6E0D3] space-y-1">
            <span className="text-[#2D6A4F] font-bold">Math Check 2 • Delivery SLA</span>
            <p className="font-bold text-[#1C1917]">Transit Hours &le; Stockout Window</p>
            <p className="text-[11px] text-[#78716C]">Confirms carrier delivery beats the store’s stockout timer.</p>
          </div>
          <div className="bg-[#FAF7F2] p-3.5 rounded-xl border border-[#E6E0D3] space-y-1">
            <span className="text-[#2D6A4F] font-bold">Math Check 3 • Profit ROI</span>
            <p className="font-bold text-[#1C1917]">Protected Margin &gt; Shipping Cost</p>
            <p className="text-[11px] text-[#78716C]">Ensures gross profit saved ($6.20/pack) exceeds freight cost.</p>
          </div>
          <div className="bg-[#FEF9EE] p-3.5 rounded-xl border border-[#F9DFAA] space-y-1">
            <span className="text-[#B7791F] font-bold">Math Check 4 • Auto-Cap</span>
            <p className="font-bold text-[#1C1917]">Total Commitment &le; $1,000.00</p>
            <p className="text-[11px] text-[#57534E]">Orders over $1,000 pause here for manager approval.</p>
          </div>
        </div>
      </div>

      {/* Pending Approval Cards List */}
      {cards.length === 0 ? (
        <div className="bg-white border border-[#E6E0D3] rounded-2xl p-10 text-center space-y-2 shadow-enterprise">
          <CheckCircle2 className="h-10 w-10 text-[#2D6A4F] mx-auto" />
          <h3 className="font-serif text-base font-bold text-[#1C1917]">All High-Value Orders Have Been Reviewed!</h3>
          <p className="text-xs text-[#78716C]">
            There are 0 orders waiting for manager sign-off. Run Scenario 2 on Tab 1 to simulate a Warehouse Shortage &amp; Factory Purchase Order escalation.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {cards.map((item) => {
            const sapOrder = approvedOrders[item.event_id] || item.sap_order_id || item.sap_transfer_order_id;
            const isApproved = Boolean(sapOrder) || item.status === 'approved';
            const isFactory = (item.donor_dc || '').toUpperCase().includes('FMCG') || (item.donor_dc || '').toUpperCase().includes('WACO');
            const freightVal = isFactory && item.freight_cost > 2000 ? 1850.0 : item.freight_cost;
            const totalCommitment =
              item.total_financial_commitment || (isFactory && item.freight_cost <= 2000 ? item.freight_cost + 15822.0 : item.freight_cost);
            const storeDisplay = STORE_FRIENDLY_NAME[item.store_id] || item.store_id;
            const sourceDisplay = SOURCE_FRIENDLY_NAME[item.donor_dc || ''] || item.donor_dc || 'Waco Bottling Factory';

            return (
              <div
                key={item.event_id}
                className={`p-6 rounded-2xl border transition shadow-enterprise ${
                  isApproved
                    ? 'bg-[#F2F8F4] border-[#C3DFCD]'
                    : 'bg-white border-[#F9DFAA]'
                }`}
              >
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
                  <div className="space-y-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`text-[11px] font-bold px-3 py-1 rounded-full border ${
                          isApproved
                            ? 'bg-[#2D6A4F] text-white border-[#2D6A4F]'
                            : 'bg-[#FEF9EE] text-[#925E14] border-[#F9DFAA]'
                        }`}
                      >
                        {isApproved
                          ? '✅ APPROVED BY MANAGER • FACTORY ORDER DISPATCHED'
                          : '⏳ WAITING FOR VP MANAGER SIGNATURE'}
                      </span>
                      <span className="text-xs font-mono font-semibold text-[#1E4D38] bg-[#F2F8F4] px-2.5 py-0.5 rounded-lg border border-[#C3DFCD]">
                        Request #{item.ticket_id}
                      </span>
                    </div>

                    <div className="flex items-center space-x-2">
                      <Factory className="h-5 w-5 text-[#B7791F] shrink-0" />
                      <h3 className="font-serif text-base font-bold text-[#1C1917]">
                        Restock {storeDisplay} &larr; {sourceDisplay}
                      </h3>
                    </div>

                    <p className="text-xs text-[#44403C]">
                      Product: <strong className="text-[#1C1917]">HydroBoost Electrolyte 12-Pack ({item.sku_id})</strong> • Quantity:{' '}
                      <strong className="text-[#2D6A4F]">{item.units.toLocaleString()} packs</strong> • Carrier:{' '}
                      <strong className="text-[#1C1917]">{item.carrier || 'HydroBoost Direct Cold-Chain Carrier'}</strong>
                    </p>

                    <div className="p-3.5 bg-[#FEF9EE] border border-[#F9DFAA] rounded-xl text-xs text-[#925E14] leading-relaxed">
                      <strong>Why Manager Approval Is Needed (Math Check 4):</strong> {item.reason}
                    </div>
                  </div>

                  <div className="flex flex-col lg:items-end justify-between space-y-4 shrink-0 bg-[#FAF7F2] p-4 rounded-xl border border-[#E6E0D3] min-w-[250px]">
                    <div className="lg:text-right space-y-1">
                      <span className="text-[11px] font-semibold text-[#78716C] block">
                        Total Order Commitment (Product + Shipping)
                      </span>
                      <p className="font-serif text-2xl font-bold text-[#1C1917]">
                        ${totalCommitment.toLocaleString()}
                      </p>
                      <span className="text-[11px] text-[#B7791F] font-semibold block">
                        Includes ${freightVal.toLocaleString()} Express Cold-Chain Shipping
                      </span>
                    </div>

                    {!isApproved ? (
                      <button
                        onClick={() => handleApproveClick(item.event_id)}
                        disabled={loadingItem === item.event_id}
                        className="w-full flex items-center justify-center space-x-2 bg-[#2D6A4F] hover:bg-[#1E4D38] text-white text-xs font-bold px-5 py-3 rounded-xl shadow-sm transition disabled:opacity-50 cursor-pointer"
                      >
                        <UserCheck className="h-4 w-4" />
                        <span>
                          {loadingItem === item.event_id
                            ? 'Approving & Sending Order...'
                            : 'Approve & Dispatch Order'}
                        </span>
                      </button>
                    ) : (
                      <div className="w-full flex items-center justify-center space-x-1.5 text-xs text-[#1E4D38] font-bold bg-[#DFF0E5] border border-[#C3DFCD] px-4 py-2.5 rounded-xl">
                        <CheckCircle2 className="h-4 w-4 text-[#2D6A4F]" />
                        <span>Order #{sapOrder} Sent!</span>
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
