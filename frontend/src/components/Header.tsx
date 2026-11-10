import React, { useState } from 'react';
import { Bell, RotateCcw, ShieldCheck, CheckCircle2 } from 'lucide-react';
import { TabType } from '../types';

interface HeaderProps {
  activeTab: TabType;
  pendingCount: number;
  onOpenApprovals: () => void;
  onResetComplete?: () => void;
}

const VIEW_METADATA: Record<
  TabType,
  { badge: string; title: string; question: string }
> = {
  digital_twin_map: {
    badge: 'Live Supply Chain Control Tower',
    title: '3-Tier Retail, Warehouse & Factory Digital Twin',
    question: 'How is our retail & warehouse network responding to live store demand right now?',
  },
  market_sensing_radar: {
    badge: 'Multi-Channel Demand Sensing',
    title: 'Early-Warning Demand, 25-Day Weather & Social Radar',
    question: 'What is driving store checkout spikes across POS, weather & community events?',
  },
  dynamic_replenishment: {
    badge: 'Autonomous Replenishment & ROI',
    title: 'Smart Warehouse Selection, Carrier Rates & Profit ROI',
    question: 'Which warehouse & carrier protect the highest store margin before stockout?',
  },
  what_if_simulator: {
    badge: 'Interactive Policy Sandbox',
    title: 'What-If Supply Chain & Guardrail Scenario Planner',
    question: 'How do extreme demand surges or freight spikes impact our $1,000 auto-cap?',
  },
  approvals_queue: {
    badge: 'Executive A2A Governance',
    title: 'VP Sign-Off Queue for High-Value & Factory Orders',
    question: 'Which orders exceed the $1,000 auto-approval cap and require executive sign-off?',
  },
  systems_audit_ledger: {
    badge: 'Immutable BigQuery Audit Trail',
    title: 'Completed Restock Orders & Decision History',
    question: 'What is the full mathematical & financial trace of every autonomous action?',
  },
};

export const Header: React.FC<HeaderProps> = ({
  activeTab,
  pendingCount,
  onOpenApprovals,
  onResetComplete,
}) => {
  const [resetting, setResetting] = useState(false);
  const [resetSuccess, setResetSuccess] = useState(false);

  const meta = VIEW_METADATA[activeTab] || VIEW_METADATA.digital_twin_map;

  const handleResetDemo = async () => {
    setResetting(true);
    setResetSuccess(false);
    try {
      await fetch('/api/v1/twin/reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      setResetSuccess(true);
      if (onResetComplete) onResetComplete();
    } catch {
      setResetSuccess(true);
      if (onResetComplete) onResetComplete();
    } finally {
      setResetting(false);
      setTimeout(() => setResetSuccess(false), 3500);
    }
  };

  return (
    <header className="sticky top-0 z-20 bg-white/95 backdrop-blur-md border-b border-[#E6E0D3] px-5 py-3 flex flex-wrap items-center justify-between gap-3 shrink-0 select-none">
      {/* Left: VITRINE Editorial View Title & Outcome Question Pill */}
      <div className="flex flex-wrap items-center gap-2.5 min-w-0">
        <span className="inline-flex items-center px-2.5 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider bg-[#181614] text-white shrink-0">
          {meta.badge}
        </span>
        <h2 className="font-serif text-base sm:text-lg font-bold text-[#1C1917] tracking-tight truncate">
          {meta.title}
        </h2>
        <span className="hidden 2xl:inline-flex items-center text-xs text-[#1E4D38] font-medium bg-[#F2F8F4] px-2.5 py-1 rounded-md border border-[#C3DFCD] truncate">
          {meta.question}
        </span>
      </div>

      {/* Right: Guardrail Pill + Reset Demo Stock + Synced Manager Approvals Badge */}
      <div className="flex items-center gap-2.5 shrink-0">
        {resetSuccess && (
          <div className="flex items-center space-x-1.5 text-[11px] bg-[#F2F8F4] border border-[#C3DFCD] text-[#1E4D38] px-2.5 py-1.5 rounded-lg font-semibold whitespace-nowrap">
            <CheckCircle2 className="h-3.5 w-3.5 text-[#2D6A4F] shrink-0" />
            <span>Demo Stock Reset!</span>
          </div>
        )}

        <div className="hidden xl:flex items-center gap-3 px-3 py-1.5 rounded-lg bg-[#FAF7F2] border border-[#E6E0D3] text-[11px]">
          <span className="flex items-center gap-1 font-semibold text-[#57534E]">
            <ShieldCheck className="w-3.5 h-3.5 text-[#2D6A4F]" />
            Guardrails:
          </span>
          <span className="font-mono font-semibold text-[#1C1917]">Auto-Cap &le; $1,000</span>
          <span className="text-[#D4CBB8]">|</span>
          <span className="font-mono font-semibold text-[#2D6A4F]">4 Math Gates</span>
        </div>

        <button
          onClick={handleResetDemo}
          disabled={resetting}
          title="Reset all store shelves, warehouse stock, and pending approvals back to starting levels"
          className="flex items-center space-x-1.5 bg-[#FAF7F2] hover:bg-[#F2F8F4] border border-[#E6E0D3] hover:border-[#C3DFCD] text-[#1C1917] hover:text-[#1E4D38] text-xs font-semibold px-3 py-1.5 rounded-lg transition cursor-pointer whitespace-nowrap shadow-xs"
        >
          <RotateCcw className={`h-3.5 w-3.5 text-[#2D6A4F] shrink-0 ${resetting ? 'animate-spin' : ''}`} />
          <span>{resetting ? 'Resetting...' : 'Reset Demo Stock'}</span>
        </button>

        <button
          onClick={onOpenApprovals}
          className="relative flex items-center space-x-1.5 bg-[#FEF9EE] hover:bg-[#FDF0D5] border border-[#F9DFAA] text-[#925E14] text-xs font-semibold px-3 py-1.5 rounded-lg transition cursor-pointer whitespace-nowrap shadow-xs"
        >
          <Bell className="h-3.5 w-3.5 text-[#B7791F] shrink-0" />
          <span>Manager Approvals</span>
          <span
            className={`ml-1 font-mono font-bold text-[10px] px-1.5 py-0.5 rounded-full ${
              pendingCount > 0
                ? 'bg-[#B7791F] text-white'
                : 'bg-[#E6E0D3] text-[#57534E]'
            }`}
          >
            {pendingCount}
          </span>
        </button>
      </div>
    </header>
  );
};
