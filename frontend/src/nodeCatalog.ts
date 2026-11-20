/**
 * Single Canonical Node Naming Registry for NexusTwin AI Frontend.
 *
 * Guarantees identical, unambiguous display names across:
 *   - Tab 1: 3-Tier SVG Network Map, Focused Store Telemetry, Live Stream Console, & Agent Cards
 *   - Tab 2: Demand & Weather Radar
 *   - Tab 3: Dynamic Replenishment & ROI
 *   - Tab 4: What-If Scenario Planner
 *   - Tab 5: Manager Sign-Off Queue
 *   - Tab 6: Order & Decision History (Audit Ledger)
 */

export interface NodeMeta {
  id: string;
  shortName: string;
  displayName: string;
  city: string;
  tier: 'FACTORY' | 'DC' | 'STORE';
  servingDc?: string;
}

export const NODE_CATALOG: Record<string, NodeMeta> = {
  'FMCG-PLANT-TX01': {
    id: 'FMCG-PLANT-TX01',
    shortName: 'Waco Bottling Factory',
    displayName: 'Waco Bottling Factory (FMCG-PLANT-TX01)',
    city: 'Waco, TX',
    tier: 'FACTORY',
  },
  'DC-ATX-02': {
    id: 'DC-ATX-02',
    shortName: 'Austin Warehouse',
    displayName: 'Austin Warehouse (DC-ATX-02)',
    city: 'Austin, TX',
    tier: 'DC',
  },
  'DC-HOU-01': {
    id: 'DC-HOU-01',
    shortName: 'Houston Warehouse',
    displayName: 'Houston Warehouse (DC-HOU-01)',
    city: 'Houston, TX',
    tier: 'DC',
  },
  'DC-SAT-03': {
    id: 'DC-SAT-03',
    shortName: 'San Antonio Warehouse',
    displayName: 'San Antonio Warehouse (DC-SAT-03)',
    city: 'San Antonio, TX',
    tier: 'DC',
  },
  'STORE-DAL-04': {
    id: 'STORE-DAL-04',
    shortName: 'Shop 1: Dallas',
    displayName: 'Shop 1: Dallas (STORE-DAL-04)',
    city: 'Dallas, TX',
    tier: 'STORE',
    servingDc: 'DC-ATX-02',
  },
  'STORE-HOU-05': {
    id: 'STORE-HOU-05',
    shortName: 'Shop 2: Houston',
    displayName: 'Shop 2: Houston (STORE-HOU-05)',
    city: 'Houston, TX',
    tier: 'STORE',
    servingDc: 'DC-HOU-01',
  },
  'STORE-PLANO-07': {
    id: 'STORE-PLANO-07',
    shortName: 'Shop 3: Plano',
    displayName: 'Shop 3: Plano (STORE-PLANO-07)',
    city: 'Plano, TX',
    tier: 'STORE',
    servingDc: 'DC-ATX-02',
  },
  'STORE-ARL-11': {
    id: 'STORE-ARL-11',
    shortName: 'Shop 4: Arlington',
    displayName: 'Shop 4: Arlington (STORE-ARL-11)',
    city: 'Arlington, TX',
    tier: 'STORE',
    servingDc: 'DC-SAT-03',
  },
  'STORE-FW-02': {
    id: 'STORE-FW-02',
    shortName: 'Shop 5: Fort Worth',
    displayName: 'Shop 5: Fort Worth (STORE-FW-02)',
    city: 'Fort Worth, TX',
    tier: 'STORE',
    servingDc: 'DC-ATX-02',
  },
  'STORE-SAT-06': {
    id: 'STORE-SAT-06',
    shortName: 'Shop 6: San Antonio',
    displayName: 'Shop 6: San Antonio (STORE-SAT-06)',
    city: 'San Antonio, TX',
    tier: 'STORE',
    servingDc: 'DC-SAT-03',
  },
};

export function getNodeDisplayName(nodeId?: string | null): string {
  if (!nodeId) return '';
  if (NODE_CATALOG[nodeId]) return NODE_CATALOG[nodeId].displayName;
  for (const [id, meta] of Object.entries(NODE_CATALOG)) {
    if (nodeId.startsWith(id)) return meta.displayName;
  }
  return nodeId;
}

export function getNodeShortName(nodeId?: string | null): string {
  if (!nodeId) return '';
  if (NODE_CATALOG[nodeId]) return NODE_CATALOG[nodeId].shortName;
  for (const [id, meta] of Object.entries(NODE_CATALOG)) {
    if (nodeId.startsWith(id)) return meta.shortName;
  }
  return nodeId;
}
