import { Manifest, RegionalDC, RetailStore, SKUInfo } from '../types';

export const FMCG_PLANT = {
  id: 'FMCG-PLANT-TX01',
  name: 'HydroBoost Texas Bottling & FMCG Plant',
  city: 'Waco',
  state: 'TX',
  wholesale_unit_cost: 8.79,
  moq_units: 1000,
  atp_surplus: 45000,
  on_hand: 50000,
};

export const INITIAL_DCS: RegionalDC[] = [
  { id: 'DC-ATX-02', name: 'Austin Central Distribution Center', city: 'Austin', state: 'TX', lat: 30.26, lng: -97.74, capacity_pallets: 12000, current_utilization: 0.72, role: 'SURPLUS_DONOR' },
  { id: 'DC-HOU-01', name: 'Houston Port Gateway DC (Low ATP)', city: 'Houston', state: 'TX', lat: 29.76, lng: -95.36, capacity_pallets: 18000, current_utilization: 0.88, role: 'LOW_ATP_CONSTRAINED' },
  { id: 'DC-SAT-03', name: 'San Antonio Logistics Hub', city: 'San Antonio', state: 'TX', lat: 29.42, lng: -98.49, capacity_pallets: 9500, current_utilization: 0.65, role: 'SECONDARY_DONOR' },
];

export const INITIAL_STORES: RetailStore[] = [
  { id: 'STORE-DAL-04', name: 'Shop 1: Dallas Supercenter #104', city: 'Dallas', state: 'TX', lat: 32.77, lng: -96.79, serving_dc: 'DC-ATX-02', tier: 'TIER_1_SUPERCENTER' },
  { id: 'STORE-HOU-05', name: 'Shop 2: Houston Galleria Superstore #55', city: 'Houston', state: 'TX', lat: 29.74, lng: -95.46, serving_dc: 'DC-HOU-01', tier: 'TIER_1_SUPERCENTER' },
  { id: 'STORE-PLANO-07', name: 'Shop 3: Plano North Galleria #19', city: 'Plano', state: 'TX', lat: 33.01, lng: -96.69, serving_dc: 'DC-ATX-02', tier: 'TIER_2_GROCERY' },
  { id: 'STORE-ARL-11', name: 'Shop 4: Arlington Stadium Center #44', city: 'Arlington', state: 'TX', lat: 32.73, lng: -97.10, serving_dc: 'DC-SAT-03', tier: 'TIER_1_SUPERCENTER' },
  { id: 'STORE-FW-02', name: 'Shop 5: Fort Worth Retail Plaza #82', city: 'Fort Worth', state: 'TX', lat: 32.75, lng: -97.33, serving_dc: 'DC-ATX-02', tier: 'TIER_1_SUPERCENTER' },
  { id: 'STORE-SAT-06', name: 'Shop 6: San Antonio Riverwalk Market #61', city: 'San Antonio', state: 'TX', lat: 29.42, lng: -98.48, serving_dc: 'DC-SAT-03', tier: 'TIER_2_GROCERY' },
];

export const INITIAL_SKUS: Record<string, SKUInfo> = {
  'SKU-4089-HYDRATE': { sku: 'SKU-4089-HYDRATE', name: 'HydroBoost Electro-Electrolyte 500ml 12-Pack', category: 'High-Velocity Beverage', retail_price: 14.99, cost_of_goods: 8.79, gross_margin: 6.20, pallet_units: 480, weight_per_unit_kg: 6.2 },
  'SKU-1022-PROTEIN': { sku: 'SKU-1022-PROTEIN', name: 'VitalWhey Clean Protein Isolate 1kg', category: 'FMCG Nutrition', retail_price: 32.99, cost_of_goods: 19.50, gross_margin: 13.49, pallet_units: 240, weight_per_unit_kg: 1.1 },
  'SKU-8821-SNACK': { sku: 'SKU-8821-SNACK', name: 'CrunchPro Organic Seed Cluster 250g', category: 'Packaged Snack', retail_price: 5.49, cost_of_goods: 2.80, gross_margin: 2.69, pallet_units: 600, weight_per_unit_kg: 0.3 },
};

export const INITIAL_MANIFEST: Manifest = {
  event_id: 'evt_shop1_pos_dc_sto',
  sku_id: 'SKU-4089-HYDRATE',
  target_store: 'STORE-DAL-04',
  selected_donor_dc: 'DC-ATX-02',
  units_transferred: 1500,
  freight_mode: 'LATERAL_GROUND_TRANSFER',
  carrier_name: 'Texas Fleet Logistics (Dedicated)',
  estimated_freight_cost: 750.00,
  root_cause_explanation: '[FAST POS SCANNER SURGE] Checkout velocity for SKU-4089-HYDRATE at Shop 1 (STORE-DAL-04) spiked to 215.0 u/hr (+348% over 48.0 u/hr baseline). Serving Austin DC (DC-ATX-02) has 3,600 ATP surplus units available for immediate internal STO transfer.',
  gate_status: 'APPROVED',
  requires_human_approval: false,
  sap_transfer_order_id: 'STO-SAP-99214',
  created_at: new Date().toISOString(),
};
