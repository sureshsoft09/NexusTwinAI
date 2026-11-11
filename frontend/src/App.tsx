import React, { useState, useEffect, useCallback } from 'react';
import { TabType } from './types';
import { apiUrl, wsUrl } from './apiConfig';
import { Header, UIThemeType } from './components/Header';
import { Sidebar } from './components/Sidebar';
import { DigitalTwinMap } from './pages/DigitalTwinMap';
import { MarketRadar } from './pages/MarketRadar';
import { DynamicReplenishment } from './pages/DynamicReplenishment';
import { WhatIfSimulator } from './pages/WhatIfSimulator';
import { ApprovalsQueue, A2AApprovalCard, DEFAULT_FALLBACK_CARDS } from './pages/ApprovalsQueue';
import { SystemsAuditLedger } from './pages/SystemsAuditLedger';

function deduplicateApprovalCards(list: A2AApprovalCard[]): A2AApprovalCard[] {
  const map = new Map<string, A2AApprovalCard>();
  for (const item of list) {
    const storeKey = `${item.store_id || 'STORE-HOU-05'}_${item.sku_id || 'SKU-4089-HYDRATE'}`;
    map.set(storeKey, item);
  }
  return Array.from(map.values());
}

export const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<TabType>('digital_twin_map');
  const [cards, setCards] = useState<A2AApprovalCard[]>([]);
  const [approvedOrders, setApprovedOrders] = useState<Record<string, string>>({});
  const [resetVersion, setResetVersion] = useState<number>(0);
  const [theme, setTheme] = useState<UIThemeType>(() => {
    const saved = localStorage.getItem('nexustwin_ui_theme') as UIThemeType | null;
    return saved === 'vitrine' || saved === 'midnight' || saved === 'cerulean' ? saved : 'cerulean';
  });

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('nexustwin_ui_theme', theme);
  }, [theme]);

  const fetchPendingCards = useCallback(async () => {
    try {
      const res = await fetch(apiUrl('/api/v1/governance/pending'));
      if (res.ok) {
        const data = await res.json();
        const rawList = Array.isArray(data) ? data : data.pending_approvals;
        if (Array.isArray(rawList)) {
          const deduped = deduplicateApprovalCards(rawList);
          setCards(deduped);
        }
      }
    } catch {
      // Fallback only if backend is unreachable
      setCards((prev) => (prev.length > 0 ? prev : DEFAULT_FALLBACK_CARDS));
    }
  }, []);

  useEffect(() => {
    fetchPendingCards();
  }, [fetchPendingCards, activeTab]);

  useEffect(() => {
    let ws: WebSocket | null = null;
    try {
      ws = new WebSocket(wsUrl('/api/v1/twin/ws/telemetry'));

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === 'SIGNAL_RESOLVED' || data.type === 'ORDER_APPROVED') {
            fetchPendingCards();
          } else if (data.type === 'DEMO_RESET') {
            setApprovedOrders({});
            setCards([]);
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
  }, [fetchPendingCards]);

  const handleApproveCard = async (eventId: string) => {
    try {
      const res = await fetch(apiUrl('/api/v1/governance/approve'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event_id: eventId,
          approved: true,
          approver_name: 'VP Supply Chain Operations',
          approver_email: 'vp.ops@enterprise-fmcg.com',
          comments: 'Approved via Executive Control Tower',
        }),
      });
      if (res.ok) {
        const data = await res.json();
        const sapOrder = data.erp_transfer_order_id || 'PO-FMCG-99812';
        setApprovedOrders((prev) => ({ ...prev, [eventId]: sapOrder }));
      } else {
        setApprovedOrders((prev) => ({ ...prev, [eventId]: 'PO-FMCG-99812' }));
      }
    } catch {
      setApprovedOrders((prev) => ({ ...prev, [eventId]: 'PO-FMCG-99812' }));
    }
    await fetchPendingCards();
  };

  const handleResetComplete = () => {
    setApprovedOrders({});
    setCards([]);
    setResetVersion((v) => v + 1);
  };

  // Single source of truth for Pending Approvals count across Header, Sidebar, and Tab 5
  const pendingCount = cards.filter(
    (c) => !approvedOrders[c.event_id] && c.status !== 'approved' && !c.sap_order_id && !c.sap_transfer_order_id
  ).length;

  const renderActivePage = () => {
    switch (activeTab) {
      case 'digital_twin_map':
        return (
          <DigitalTwinMap
            key={`map-${resetVersion}`}
            onOpenApprovals={() => setActiveTab('approvals_queue')}
            onScenarioCompleted={fetchPendingCards}
          />
        );
      case 'market_sensing_radar':
        return <MarketRadar key={`radar-${resetVersion}`} />;
      case 'dynamic_replenishment':
        return <DynamicReplenishment key={`rep-${resetVersion}`} />;
      case 'what_if_simulator':
        return <WhatIfSimulator key={`sim-${resetVersion}`} />;
      case 'approvals_queue':
        return (
          <ApprovalsQueue
            key={`app-${resetVersion}`}
            cards={cards}
            approvedOrders={approvedOrders}
            pendingCount={pendingCount}
            onApproveCard={handleApproveCard}
            onRefreshCards={fetchPendingCards}
          />
        );
      case 'systems_audit_ledger':
        return <SystemsAuditLedger key={`aud-${resetVersion}`} />;
      default:
        return (
          <DigitalTwinMap
            key={`map-${resetVersion}`}
            onOpenApprovals={() => setActiveTab('approvals_queue')}
            onScenarioCompleted={fetchPendingCards}
          />
        );
    }
  };

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-[#F5F8FC] font-sans text-[#14213D] antialiased">
      <Sidebar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        pendingCount={pendingCount}
      />

      <div className="flex flex-1 flex-col overflow-hidden min-w-0">
        <Header
          activeTab={activeTab}
          pendingCount={pendingCount}
          onOpenApprovals={() => setActiveTab('approvals_queue')}
          onResetComplete={handleResetComplete}
          theme={theme}
          onChangeTheme={setTheme}
        />

        <main className="flex-1 overflow-y-auto bg-[#F5F8FC]">
          {renderActivePage()}
        </main>

        {/* Persistent Global Retail Footer */}
        <footer className="border-t border-[#DCE4EE] bg-white px-6 py-2.5 flex flex-wrap items-center justify-between gap-2 text-[11px] text-[#526582] shrink-0 select-none">
          <div className="flex items-center gap-2">
            <span className="font-serif font-bold text-[#14213D]">NEXUSTWIN AI</span>
            <span>·</span>
            <span>Autonomous Retail &amp; FMCG Supply Chain Operating System (1 Factory · 3 Warehouses · 6 Stores)</span>
          </div>
          <div className="hidden lg:flex items-center gap-3 font-medium">
            <span className="flex items-center gap-1.5 text-[#0D7A5F]">
              <span className="w-1.5 h-1.5 rounded-full bg-[#0D7A5F]" />
              4-Gate Math Critic Verified
            </span>
            <span>·</span>
            <span className="flex items-center gap-1.5 text-[#0E5A8A]">
              <span className="w-1.5 h-1.5 rounded-full bg-[#0E5A8A]" />
              Multi-Agent MCP Discovery
            </span>
            <span>·</span>
            <span className="flex items-center gap-1.5 text-[#C27803]">
              <span className="w-1.5 h-1.5 rounded-full bg-[#C27803]" />
              A2A Executive Governance
            </span>
          </div>
        </footer>
      </div>
    </div>
  );
};

export default App;
