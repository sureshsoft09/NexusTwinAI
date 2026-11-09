export type TabType =
  | 'digital_twin_map'
  | 'market_sensing_radar'
  | 'dynamic_replenishment'
  | 'what_if_simulator'
  | 'approvals_queue'
  | 'systems_audit_ledger';

export interface RegionalDC {
  id: string;
  name: string;
  city: string;
  state: string;
  lat: number;
  lng: number;
  capacity_pallets: number;
  current_utilization: number;
  role: string;
}

export interface RetailStore {
  id: string;
  name: string;
  city: string;
  state: string;
  lat: number;
  lng: number;
  serving_dc: string;
  tier: string;
}

export interface SKUInfo {
  sku: string;
  name: string;
  category: string;
  retail_price: number;
  cost_of_goods: number;
  gross_margin: number;
  pallet_units: number;
  weight_per_unit_kg: number;
}

export interface InventoryItem {
  on_hand: number;
  safety_buffer: number;
  burn_rate?: number;
  atp_surplus?: number;
}

export interface GateRuleResult {
  rule_name: string;
  passed: boolean;
  threshold: any;
  actual_value: any;
  message: string;
}

export interface Manifest {
  event_id: string;
  sku_id: string;
  target_store: string;
  selected_donor_dc: string;
  units_transferred: number;
  freight_mode: string;
  carrier_name: string;
  estimated_freight_cost: number;
  root_cause_explanation: string;
  gate_status: 'APPROVED' | 'REFERRED_TO_HUMAN' | 'REJECTED';
  requires_human_approval: boolean;
  sap_transfer_order_id?: string | null;
  created_at: string;
}

export interface AuditRecord {
  event_id: string;
  timestamp: string;
  signal_source: string;
  store_id: string;
  sku_id: string;
  observed_velocity: number;
  root_cause_explanation: string;
  selected_donor_dc: string;
  units_transferred: number;
  freight_mode: string;
  carrier_name: string;
  estimated_freight_cost: number;
  gate_status: string;
  requires_human_approval: boolean;
  approver_name?: string | null;
  sap_transfer_order_id?: string | null;
}
