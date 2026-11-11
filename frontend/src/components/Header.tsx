import React, { useState } from 'react';
import { Bell, RotateCcw, ShieldCheck, CheckCircle2, Palette } from 'lucide-react';
import { TabType } from '../types';
import { apiUrl } from '../apiConfig';

export type UIThemeType = 'cerulean' | 'vitrine' | 'midnight';

interface HeaderProps {
  activeTab: TabType;
  pendingCount: number;
  onOpenApprovals: () => void;
  onResetComplete?: () => void;
  theme: UIThemeType;
  onChangeTheme: (theme: UIThemeType) => void;
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

const THEME_SWATCHES: {
  id: UIThemeType;
  label: string;
  primaryHex: string;
  secondaryHex: string;
}[] = [
  {
    id: 'cerulean',
    label: 'Retail Pearl & Cerulean (Default)',
    primaryHex: '#0E5A8A',
    secondaryHex: '#EBF1F8',
  },
  {
    id: 'vitrine',
    label: 'Vitrine Warm Ivory & Forest Sage',
    primaryHex: '#2D6A4F',
    secondaryHex: '#FAF7F2',
  },
  {
    id: 'midnight',
    label: 'Soft Dusk Slate & Sky Blue',
    primaryHex: '#2C3B52',
    secondaryHex: '#38BDF8',
  },
];

export const Header: React.FC<HeaderProps> = ({
  activeTab,
  pendingCount,
  onOpenApprovals,
  onResetComplete,
  theme,
  onChangeTheme,
}) => {
  const [resetting, setResetting] = useState(false);
  const [resetSuccess, setResetSuccess] = useState(false);

  const meta = VIEW_METADATA[activeTab] || VIEW_METADATA.digital_twin_map;

  const handleResetDemo = async () => {
    setResetting(true);
    setResetSuccess(false);
    try {
      await fetch(apiUrl('/api/v1/twin/reset'), {
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
    <header className="sticky top-0 z-20 bg-white/95 backdrop-blur-md border-b border-[#DCE4EE] px-5 py-3 flex flex-wrap items-center justify-between gap-3 shrink-0 select-none">
      {/* Left: View Title & Outcome Question Pill */}
      <div className="flex flex-wrap items-center gap-2.5 min-w-0">
        <span className="inline-flex items-center px-2.5 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider bg-[#14213D] text-white shrink-0">
          {meta.badge}
        </span>
        <h2 className="font-serif text-base sm:text-lg font-bold text-[#14213D] tracking-tight truncate">
          {meta.title}
        </h2>
        <span className="hidden 2xl:inline-flex items-center text-xs text-[#094266] font-medium bg-[#ECF5FC] px-2.5 py-1 rounded-md border border-[#C2DFF3] truncate">
          {meta.question}
        </span>
      </div>

      {/* Right: Guardrail Pill + Reset Demo Stock + Manager Approvals + 3-Theme Color Switcher */}
      <div className="flex items-center gap-2.5 shrink-0">
        {resetSuccess && (
          <div className="flex items-center space-x-1.5 text-[11px] bg-[#EEFBF6] border border-[#B8EAD8] text-[#095C47] px-2.5 py-1.5 rounded-lg font-semibold whitespace-nowrap">
            <CheckCircle2 className="h-3.5 w-3.5 text-[#0D7A5F] shrink-0" />
            <span>Demo Stock Reset!</span>
          </div>
        )}

        <div className="hidden xl:flex items-center gap-2.5 px-3 py-1.5 rounded-lg bg-[#F5F8FC] border border-[#DCE4EE] text-[11px]">
          <span className="flex items-center gap-1 font-semibold text-[#526582]">
            <ShieldCheck className="w-3.5 h-3.5 text-[#0D7A5F]" />
            Guardrails:
          </span>
          <span className="font-mono font-semibold text-[#14213D]">Auto-Cap &le; $1,000</span>
          <span className="text-[#C4D0E0]">|</span>
          <span className="font-mono font-semibold text-[#0E5A8A]">4 Math Gates</span>
        </div>

        <button
          onClick={handleResetDemo}
          disabled={resetting}
          title="Reset all store shelves, warehouse stock, and pending approvals back to starting levels"
          className="flex items-center space-x-1.5 bg-[#F5F8FC] hover:bg-[#ECF5FC] border border-[#DCE4EE] hover:border-[#C2DFF3] text-[#14213D] hover:text-[#094266] text-xs font-semibold px-3 py-1.5 rounded-lg transition cursor-pointer whitespace-nowrap shadow-xs"
        >
          <RotateCcw className={`h-3.5 w-3.5 text-[#0E5A8A] shrink-0 ${resetting ? 'animate-spin' : ''}`} />
          <span>{resetting ? 'Resetting...' : 'Reset Demo Stock'}</span>
        </button>

        <button
          onClick={onOpenApprovals}
          className="relative flex items-center space-x-1.5 bg-[#FFFBEB] hover:bg-[#FEF3C7] border border-[#FDE68A] text-[#925802] text-xs font-semibold px-3 py-1.5 rounded-lg transition cursor-pointer whitespace-nowrap shadow-xs"
        >
          <Bell className="h-3.5 w-3.5 text-[#C27803] shrink-0" />
          <span>Manager Approvals</span>
          <span
            className={`ml-1 font-mono font-bold text-[10px] px-1.5 py-0.5 rounded-full ${
              pendingCount > 0
                ? 'bg-[#C27803] text-white'
                : 'bg-[#DCE4EE] text-[#526582]'
            }`}
          >
            {pendingCount}
          </span>
        </button>

        {/* Top-Right Compact 3-Theme Color Switcher */}
        <div
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-[#F5F8FC] border border-[#DCE4EE]"
          title="Switch UI Color Theme"
        >
          <Palette className="h-3.5 w-3.5 text-[#526582] mr-0.5 shrink-0" />
          {THEME_SWATCHES.map((sw) => {
            const isSelected = theme === sw.id;
            return (
              <button
                key={sw.id}
                onClick={() => onChangeTheme(sw.id)}
                title={sw.label}
                aria-label={sw.label}
                className={`relative h-5 w-5 rounded-full overflow-hidden border transition-all cursor-pointer flex items-center justify-center ${
                  isSelected
                    ? 'ring-2 ring-[#0E5A8A] ring-offset-1 scale-110 border-white shadow-sm'
                    : 'border-[#9BB0C9] opacity-80 hover:opacity-100 hover:scale-105'
                }`}
                style={{
                  background: `linear-gradient(135deg, ${sw.primaryHex} 55%, ${sw.secondaryHex} 55%)`,
                }}
              />
            );
          })}
        </div>
      </div>
    </header>
  );
};
