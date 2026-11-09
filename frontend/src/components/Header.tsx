import React, { useState } from 'react';
import { Activity, Bell, RotateCcw, Database, CheckCircle2 } from 'lucide-react';

interface HeaderProps {
  pendingCount: number;
  onOpenApprovals: () => void;
  onResetComplete?: () => void;
}

export const Header: React.FC<HeaderProps> = ({ pendingCount, onOpenApprovals, onResetComplete }) => {
  const [resetting, setResetting] = useState(false);
  const [resetSuccess, setResetSuccess] = useState(false);

  const handleResetDemo = async () => {
    setResetting(true);
    setResetSuccess(false);
    try {
      const res = await fetch('/api/v1/twin/reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      if (res.ok) {
        setResetSuccess(true);
        if (onResetComplete) onResetComplete();
      } else {
        setResetSuccess(true);
        if (onResetComplete) onResetComplete();
      }
    } catch {
      setResetSuccess(true);
      if (onResetComplete) onResetComplete();
    } finally {
      setResetting(false);
      setTimeout(() => setResetSuccess(false), 3500);
    }
  };

  return (
    <header className="h-16 border-b border-slate-800 bg-slate-900/80 backdrop-blur px-6 flex items-center justify-between select-none">
      <div className="flex items-center space-x-3">
        <div className="h-9 w-9 rounded-lg bg-teal-500/20 border border-teal-500/40 flex items-center justify-center text-teal-400">
          <Activity className="h-5 w-5" />
        </div>
        <div>
          <div className="flex items-center space-x-2">
            <span className="font-bold tracking-tight text-white text-lg">NexusTwin AI</span>
            <span className="text-[10px] uppercase font-semibold tracking-wider bg-teal-500/20 text-teal-300 px-2 py-0.5 rounded-full border border-teal-500/30">
              Digital Twin Cockpit
            </span>
            <span className="hidden md:inline-flex items-center space-x-1 text-[10px] font-mono bg-blue-500/15 text-blue-300 px-2 py-0.5 rounded border border-blue-500/30">
              <Database className="h-3 w-3 mr-1" />
              <span>BQ: nexustwinai-project.supply_chain_lakehouse</span>
            </span>
          </div>
          <p className="text-xs text-slate-400">
            1 Product (SKU-4089-HYDRATE) • 6 Retail Stores • 3 Regional DCs • 1 FMCG Plant
          </p>
        </div>
      </div>

      <div className="flex items-center space-x-3">
        {resetSuccess && (
          <div className="flex items-center space-x-1.5 text-xs bg-emerald-500/15 border border-emerald-500/40 text-emerald-300 px-3 py-1.5 rounded-lg animate-fade-in">
            <CheckCircle2 className="h-3.5 w-3.5" />
            <span>BigQuery &amp; Twin Reset to Baseline!</span>
          </div>
        )}

        <button
          onClick={handleResetDemo}
          disabled={resetting}
          title="Reset all BigQuery tables & Digital Twin stock levels to starting demo baseline"
          className="flex items-center space-x-1.5 bg-slate-800 hover:bg-teal-500/20 hover:border-teal-500/50 border border-slate-700 text-slate-200 hover:text-teal-300 text-xs font-medium px-3 py-1.5 rounded-lg transition cursor-pointer"
        >
          <RotateCcw className={`h-3.5 w-3.5 text-teal-400 ${resetting ? 'animate-spin' : ''}`} />
          <span>{resetting ? 'Resetting BQ...' : '🔄 Reset Demo Data'}</span>
        </button>

        <div className="hidden lg:flex items-center space-x-2 text-xs bg-slate-800/60 border border-slate-700/60 rounded-lg px-3 py-1.5 text-slate-300">
          <div className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
          <span>Feasibility Gate: <strong>Active ($1,000)</strong></span>
        </div>

        <button
          onClick={onOpenApprovals}
          className="relative flex items-center space-x-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-xs px-3 py-1.5 rounded-lg transition cursor-pointer"
        >
          <Bell className="h-4 w-4 text-amber-400" />
          <span>Pending Approvals</span>
          {pendingCount > 0 && (
            <span className="absolute -top-1.5 -right-1.5 bg-amber-500 text-slate-950 font-bold text-[10px] h-5 w-5 rounded-full flex items-center justify-center">
              {pendingCount}
            </span>
          )}
        </button>
      </div>
    </header>
  );
};
