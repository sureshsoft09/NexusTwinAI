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
    badgeTone?: 'cerulean' | 'coral' | 'amber' | 'plum' | 'mint';
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
          badgeTone: 'cerulean',
        },
        {
          id: 'market_sensing_radar',
          label: '2. Demand & Weather Radar',
          subtitle: 'POS, 25-Day Weather & Social Buzz',
          icon: CloudSun,
          badge: '3 Feeds',
          badgeTone: 'coral',
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
          badgeTone: 'mint',
        },
        {
          id: 'what_if_simulator',
          label: '4. What-If Scenario Planner',
          subtitle: 'Stress-Test Demand & Freight Caps',
          icon: Sliders,
          badge: 'What-If',
          badgeTone: 'plum',
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
          badgeTone: pendingCount > 0 ? 'amber' : 'mint',
        },
        {
          id: 'systems_audit_ledger',
          label: '6. Order & Decision History',
          subtitle: 'Completed Transfers & Audit Log',
          icon: ClipboardList,
          badge: 'BigQuery',
          badgeTone: 'cerulean',
        },
      ],
    },
  ];

  const getBadgeStyle = (
    tone?: 'cerulean' | 'coral' | 'amber' | 'plum' | 'mint',
    isActive?: boolean
  ) => {
    if (isActive) {
      return 'bg-white/20 text-white border-white/30';
    }
    switch (tone) {
      case 'coral':
        return 'bg-[#FDF2F2] text-[#C93B2B] border-[#F8CACA]';
      case 'amber':
        return 'bg-[#FFFBEB] text-[#C27803] border-[#FDE68A]';
      case 'plum':
        return 'bg-[#F5F3FF] text-[#6D28D9] border-[#DDD6FE]';
      case 'mint':
        return 'bg-[#EEFBF6] text-[#0D7A5F] border-[#B8EAD8]';
      case 'cerulean':
      default:
        return 'bg-[#ECF5FC] text-[#0E5A8A] border-[#C2DFF3]';
    }
  };

  return (
    <aside className="w-72 bg-[#EBF1F8] border-r border-[#DCE4EE] flex flex-col justify-between shrink-0 select-none z-20">
      {/* Top Brand Header (Ocean Cerulean & Alabaster Pearl Retail Identity) */}
      <div>
        <div className="px-5 py-4 border-b border-[#DCE4EE] bg-[#E2EBF5]">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#0E5A8A] to-[#094266] flex items-center justify-center shadow-sm shrink-0">
              <span className="font-serif font-bold text-white text-lg tracking-tight">N</span>
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <h1 className="font-serif text-base font-bold tracking-tight text-[#14213D] leading-none">
                  NEXUSTWIN
                </h1>
                <span className="text-[9px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded bg-[#0E5A8A]/10 text-[#0E5A8A] border border-[#0E5A8A]/25">
                  Retail AI
                </span>
              </div>
              <p className="text-[11px] text-[#526582] font-medium mt-1 truncate">
                Omnichannel Supply Chain Twin
              </p>
            </div>
          </div>
        </div>

        {/* Categorized Navigation Workspaces */}
        <nav className="p-3 space-y-4 overflow-y-auto">
          {navGroups.map((group) => (
            <div key={group.group}>
              <div className="px-3 mb-1.5 text-[10px] font-bold uppercase tracking-wider text-[#647896]">
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
                          ? 'bg-[#0E5A8A] text-white shadow-sm'
                          : 'text-[#3B4E6B] hover:bg-[#DDE7F3] hover:text-[#14213D]'
                      }`}
                    >
                      <div className="flex items-start gap-2.5 min-w-0">
                        <Icon
                          className={`h-4 w-4 mt-0.5 shrink-0 ${
                            isActive ? 'text-white' : 'text-[#0E5A8A]'
                          }`}
                        />
                        <div className="min-w-0">
                          <div
                            className={`text-xs font-semibold truncate ${
                              isActive ? 'text-white' : 'text-[#14213D]'
                            }`}
                          >
                            {tab.label}
                          </div>
                          <div
                            className={`text-[10px] mt-0.5 truncate ${
                              isActive ? 'text-[#D6EAF8]' : 'text-[#526582]'
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
      <div className="p-3.5 border-t border-[#DCE4EE] bg-[#E2EBF5] space-y-2.5">
        <div className="px-3 py-2.5 rounded-xl border bg-[#ECF5FC] border-[#C2DFF3] text-[#094266] space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1.5 text-xs font-bold">
              <ShieldCheck className="w-4 h-4 text-[#0D7A5F]" />
              Autonomous Guardrails
            </span>
            <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-[#0D7A5F] text-white">
              Armed
            </span>
          </div>
          <p className="text-[11px] text-[#3B4E6B] leading-snug">
            <strong>&le; $1,000 Shipping:</strong> Auto-dispatches warehouse truck via SAP ERP.
          </p>
          <p className="text-[11px] text-[#3B4E6B] leading-snug">
            <strong>&gt; $1,000 / Factory PO:</strong> Pauses for VP approval in <strong>Tab 5</strong>.
          </p>
        </div>

        <div className="px-2.5 py-1.5 rounded-lg bg-white border border-[#DCE4EE] flex items-center justify-between text-[10px] text-[#3B4E6B]">
          <span className="flex items-center gap-1 font-medium">
            <Sparkles className="w-3 h-3 text-[#0E5A8A]" />
            SKU: HydroBoost 12-Pack
          </span>
          <span className="font-mono font-bold text-[#0D7A5F]">$14.99 Retail</span>
        </div>
      </div>
    </aside>
  );
};
