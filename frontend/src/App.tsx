import React, { useState, useEffect } from 'react';
import { TabType } from './types';
import { Header } from './components/Header';
import { Sidebar } from './components/Sidebar';
import { DigitalTwinMap } from './pages/DigitalTwinMap';
import { MarketRadar } from './pages/MarketRadar';
import { DynamicReplenishment } from './pages/DynamicReplenishment';
import { WhatIfSimulator } from './pages/WhatIfSimulator';
import { ApprovalsQueue } from './pages/ApprovalsQueue';
import { SystemsAuditLedger } from './pages/SystemsAuditLedger';

export const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<TabType>('digital_twin_map');
  const [pendingCount, setPendingCount] = useState<number>(1);
  const [resetVersion, setResetVersion] = useState<number>(0);

  useEffect(() => {
    let ws: WebSocket | null = null;
    try {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${window.location.host}/api/v1/twin/ws/telemetry`;
      ws = new WebSocket(wsUrl);

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === 'SIGNAL_RESOLVED' && data.manifest?.requires_human_approval) {
            setPendingCount((prev) => prev + 1);
          } else if (data.type === 'DEMO_RESET') {
            setPendingCount(0);
            setResetVersion((v) => v + 1);
          }
        } catch {
          // ignore
        }
      };
    } catch {
      // ignore
    }

    return () => {
      if (ws) ws.close();
    };
  }, []);

  const handleResetComplete = () => {
    setPendingCount(0);
    setResetVersion((v) => v + 1);
  };

  const renderActivePage = () => {
    switch (activeTab) {
      case 'digital_twin_map':
        return <DigitalTwinMap key={`map-${resetVersion}`} onOpenApprovals={() => setActiveTab('approvals_queue')} />;
      case 'market_sensing_radar':
        return <MarketRadar key={`radar-${resetVersion}`} />;
      case 'dynamic_replenishment':
        return <DynamicReplenishment key={`rep-${resetVersion}`} />;
      case 'what_if_simulator':
        return <WhatIfSimulator key={`sim-${resetVersion}`} />;
      case 'approvals_queue':
        return <ApprovalsQueue key={`app-${resetVersion}`} />;
      case 'systems_audit_ledger':
        return <SystemsAuditLedger key={`aud-${resetVersion}`} />;
      default:
        return <DigitalTwinMap key={`map-${resetVersion}`} onOpenApprovals={() => setActiveTab('approvals_queue')} />;
    }
  };

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-slate-950 font-sans text-slate-100 antialiased">
      <Sidebar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        pendingCount={pendingCount}
      />

      <div className="flex flex-1 flex-col overflow-hidden">
        <Header
          pendingCount={pendingCount}
          onOpenApprovals={() => setActiveTab('approvals_queue')}
          onResetComplete={handleResetComplete}
        />

        <main className="flex-1 overflow-y-auto bg-slate-950">
          {renderActivePage()}
        </main>
      </div>
    </div>
  );
};

export default App;
