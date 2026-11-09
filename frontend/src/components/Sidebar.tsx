import React from 'react';
import { TabType } from '../types';
import {
  MapPin,
  Radar,
  RefreshCw,
  Sliders,
  ShieldAlert,
  Database,
} from 'lucide-react';

interface SidebarProps {
  activeTab: TabType;
  setActiveTab: (tab: TabType) => void;
  pendingCount: number;
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  setActiveTab,
  pendingCount,
}) => {
  const tabs = [
    {
      id: 'digital_twin_map' as TabType,
      label: 'Digital Twin Map',
      icon: MapPin,
      badge: null,
    },
    {
      id: 'market_sensing_radar' as TabType,
      label: 'Market Sensing Radar',
      icon: Radar,
      badge: 'Surge +380%',
      badgeColor: 'bg-red-500/20 text-red-300 border-red-500/30',
    },
    {
      id: 'dynamic_replenishment' as TabType,
      label: 'Dynamic Replenishment',
      icon: RefreshCw,
      badge: null,
    },
    {
      id: 'what_if_simulator' as TabType,
      label: 'What-If Simulator',
      icon: Sliders,
      badge: null,
    },
    {
      id: 'approvals_queue' as TabType,
      label: 'Approvals Queue',
      icon: ShieldAlert,
      badge: pendingCount > 0 ? `${pendingCount} Req` : null,
      badgeColor: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
    },
    {
      id: 'systems_audit_ledger' as TabType,
      label: 'Audit Lakehouse',
      icon: Database,
      badge: null,
    },
  ];

  return (
    <aside className="w-64 border-r border-slate-800 bg-slate-900/50 flex flex-col p-4 justify-between shrink-0">
      <div className="space-y-1">
        <p className="px-3 text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-2">
          Control Center
        </p>
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-xs font-medium transition ${
                isActive
                  ? 'bg-teal-500/10 text-teal-400 border border-teal-500/30 font-semibold'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60 border border-transparent'
              }`}
            >
              <div className="flex items-center space-x-3">
                <Icon className={`h-4 w-4 ${isActive ? 'text-teal-400' : 'text-slate-400'}`} />
                <span>{tab.label}</span>
              </div>
              {tab.badge && (
                <span
                  className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${
                    tab.badgeColor || 'bg-slate-800 text-slate-300 border-slate-700'
                  }`}
                >
                  {tab.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>

      <div className="border-t border-slate-800/80 pt-4 space-y-2">
        <div className="bg-slate-950/60 border border-slate-800/60 rounded-lg p-3 text-[11px] space-y-1.5">
          <div className="flex items-center justify-between text-slate-400">
            <span>Core LLM</span>
            <span className="text-teal-400 font-mono">Gemini 2.5 Flash</span>
          </div>
          <div className="flex items-center justify-between text-slate-400">
            <span>Tool Protocol</span>
            <span className="text-teal-400 font-mono">FastMCP /mcp</span>
          </div>
          <div className="flex items-center justify-between text-slate-400">
            <span>Audit Lakehouse</span>
            <span className="text-teal-400 font-mono">BigQuery</span>
          </div>
        </div>
      </div>
    </aside>
  );
};
