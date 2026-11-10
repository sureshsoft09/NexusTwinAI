import React from 'react';
import { TabType } from '../types';
import {
  Network,
  CloudSun,
  Truck,
  Sliders,
  UserCheck,
  ClipboardList,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';

interface SidebarProps {
  activeTab: TabType;
  setActiveTab: (tab: TabType) => void;
  pendingCount: number;
}

interface NavGroup {
  group: string;
  items: {
    id: TabType;
    label: string;
    subtitle: string;
    icon: React.FC<{ className?: string }>;
    badge: string | null;
    badgeTone?: 'sage' | 'clay' | 'gold' | 'berry';
  }[];
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  setActiveTab,
  pendingCount,
}) => {
  const navGroups: NavGroup[] = [
    {
      group: 'Network & Demand Control',
      items: [
        {
          id: 'digital_twin_map',
          label: '1. Live Supply Chain Map',
          subtitle: 'Store -> Warehouse -> Factory Flow',
          icon: Network,
          badge: 'Live Twin',
          badgeTone: 'sage',
        },
        {
          id: 'market_sensing_radar',
          label: '2. Demand & Weather Radar',
          subtitle: 'POS, 25-Day Weather & Social Buzz',
          icon: CloudSun,
          badge: '3 Feeds',
          badgeTone: 'clay',
        },
      ],
    },
    {
      group: 'Autonomous Planning',
      items: [
        {
          id: 'dynamic_replenishment',
          label: '3. Restocking & Profit ROI',
          subtitle: 'Warehouse Stock & Carrier Quotes',
          icon: Truck,
          badge: 'MCP + ERP',
          badgeTone: 'sage',
        },
        {
          id: 'what_if_simulator',
          label: '4. What-If Scenario Planner',
          subtitle: 'Stress-Test Demand & Freight Caps',
          icon: Sliders,
          badge: 'What-If',
          badgeTone: 'berry',
        },
      ],
    },
    {
      group: 'Trust & Governance',
      items: [
        {
          id: 'approvals_queue',
          label: '5. Manager Sign-Off Queue',
          subtitle: 'Approve Orders Over $1,000 Cap',
          icon: UserCheck,
          badge: pendingCount > 0 ? `${pendingCount} Action` : '0 Pending',
          badgeTone: pendingCount > 0 ? 'gold' : 'sage',
        },
        {
          id: 'systems_audit_ledger',
          label: '6. Order & Decision History',
          subtitle: 'Completed Transfers & Audit Log',
          icon: ClipboardList,
          badge: 'BigQuery',
          badgeTone: 'sage',
        },
      ],
    },
  ];

  const getBadgeStyle = (tone?: 'sage' | 'clay' | 'gold' | 'berry', isActive?: boolean) => {
    if (isActive) {
      return 'bg-white/20 text-white border-white/30';
    }
    switch (tone) {
      case 'clay':
        return 'bg-[#FDF3F1] text-[#B54834] border-[#F5C7BD]';
      case 'gold':
        return 'bg-[#FEF9EE] text-[#B7791F] border-[#F9DFAA]';
      case 'berry':
        return 'bg-[#FCF3F7] text-[#7B2D53] border-[#EEC4D8]';
      case 'sage':
      default:
        return 'bg-[#F2F8F4] text-[#2D6A4F] border-[#C3DFCD]';
    }
  };

  return (
    <aside className="w-72 bg-[#F7F3EB] border-r border-[#E8E2D6] flex flex-col justify-between shrink-0 select-none z-20">
      {/* Top Brand Header (VITRINE Editorial Style) */}
      <div>
        <div className="px-5 py-4 border-b border-[#E8E2D6] bg-[#F2EDE3]">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-[#2D6A4F] flex items-center justify-center shadow-sm shrink-0">
              <span className="font-serif font-bold text-white text-lg tracking-tight">N</span>
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <h1 className="font-serif text-base font-bold tracking-tight text-[#1C1917] leading-none">
                  NEXUSTWIN
                </h1>
                <span className="text-[9px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded bg-[#2D6A4F]/10 text-[#2D6A4F] border border-[#2D6A4F]/25">
                  Retail OS
                </span>
              </div>
              <p className="text-[11px] text-[#78716C] font-medium mt-1 truncate">
                Autonomous Supply Chain Twin
              </p>
            </div>
          </div>
        </div>

        {/* Categorized Navigation Workspaces */}
        <nav className="p-3 space-y-4 overflow-y-auto">
          {navGroups.map((group) => (
            <div key={group.group}>
              <div className="px-3 mb-1.5 text-[10px] font-bold uppercase tracking-wider text-[#8C857B]">
                {group.group}
              </div>
              <div className="space-y-1">
                {group.items.map((tab) => {
                  const Icon = tab.icon;
                  const isActive = activeTab === tab.id;
                  return (
                    <button
                      key={tab.id}
                      onClick={() => setActiveTab(tab.id)}
                      className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-left transition-all cursor-pointer ${
                        isActive
                          ? 'bg-[#2D6A4F] text-white shadow-sm'
                          : 'text-[#57534E] hover:bg-[#EAE4D7] hover:text-[#1C1917]'
                      }`}
                    >
                      <div className="flex items-start gap-2.5 min-w-0">
                        <Icon
                          className={`h-4 w-4 mt-0.5 shrink-0 ${
                            isActive ? 'text-white' : 'text-[#2D6A4F]'
                          }`}
                        />
                        <div className="min-w-0">
                          <div
                            className={`text-xs font-semibold truncate ${
                              isActive ? 'text-white' : 'text-[#1C1917]'
                            }`}
                          >
                            {tab.label}
                          </div>
                          <div
                            className={`text-[10px] mt-0.5 truncate ${
                              isActive ? 'text-[#DFF0E5]' : 'text-[#78716C]'
                            }`}
                          >
                            {tab.subtitle}
                          </div>
                        </div>
                      </div>
                      {tab.badge && (
                        <span
                          className={`text-[9px] font-bold px-1.5 py-0.5 rounded border shrink-0 ml-1.5 ${getBadgeStyle(
                            tab.badgeTone,
                            isActive
                          )}`}
                        >
                          {tab.badge}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>
      </div>

      {/* Bottom Pinned Commercial Safety & Guardrails Panel */}
      <div className="p-3.5 border-t border-[#E8E2D6] bg-[#F2EDE3] space-y-2.5">
        <div className="px-3 py-2.5 rounded-xl border bg-[#2D6A4F]/10 border-[#2D6A4F]/30 text-[#1E4D38] space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1.5 text-xs font-bold">
              <ShieldCheck className="w-4 h-4 text-[#2D6A4F]" />
              Autonomous Guardrails
            </span>
            <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-[#2D6A4F] text-white">
              Armed
            </span>
          </div>
          <p className="text-[11px] text-[#44403C] leading-snug">
            <strong>&le; $1,000 Shipping:</strong> Auto-dispatches warehouse truck via SAP ERP.
          </p>
          <p className="text-[11px] text-[#44403C] leading-snug">
            <strong>&gt; $1,000 / Factory PO:</strong> Pauses for VP approval in <strong>Tab 5</strong>.
          </p>
        </div>

        <div className="px-2.5 py-1.5 rounded-lg bg-[#FAF7F2] border border-[#E6E0D3] flex items-center justify-between text-[10px] text-[#57534E]">
          <span className="flex items-center gap-1 font-medium">
            <Sparkles className="w-3 h-3 text-[#B7791F]" />
            SKU: HydroBoost 12-Pack
          </span>
          <span className="font-mono font-bold text-[#2D6A4F]">$14.99 Retail</span>
        </div>
      </div>
    </aside>
  );
};
