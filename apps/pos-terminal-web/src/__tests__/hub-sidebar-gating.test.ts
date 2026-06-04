/**
 * Hub & Sidebar gating tests
 *
 * Simulates the exact visibility logic used by:
 *  - home.tsx    (hub management grid)
 *  - Sidebar.tsx (desktop nav)
 *  - UnifiedBottomNav.tsx (mobile nav)
 *
 * Uses the same planAllows / MODULE_REQUIRED_PLAN / FEATURE_REQUIRED_PLAN
 * from featureCatalog.ts — tests are kept pure (no React, no network).
 *
 * Scenarios per plan + module config + feature list:
 *  - Hub: analytics dashboard, tables tile, kitchen tile, multi-location tile
 *  - Sidebar: Tables (Denah Meja) and Kitchen (Dapur) nav items
 *  - Mobile nav: same two items
 *  - Per-business-type initial state: correct tiles visible after registration
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

const {
  PLAN_RANK, planAllows,
  MODULE_CATALOG_DATA, MODULE_REQUIRED_PLAN,
  FEATURE_CATALOG_DATA, FEATURE_REQUIRED_PLAN,
} = await import('../lib/featureCatalog.js');

// ─── Pure simulations (mirrors the actual React component logic) ──────────────

type PlanTier = 'free' | 'growth' | 'pro';
type ModuleConfig = Record<string, boolean>;
type FeatureList = string[]; // active featureCodes

/** Mirrors TenantContext.hasModule() */
function hasModule(name: string, plan: PlanTier, config: ModuleConfig): boolean {
  const required = MODULE_REQUIRED_PLAN[name];
  if (required && PLAN_RANK[plan] < PLAN_RANK[required]) return false;
  return config[name] === true;
}

/** Mirrors useFeatures().hasFeature() */
function hasFeature(code: string, plan: PlanTier, activeFeatures: FeatureList): boolean {
  const required = FEATURE_REQUIRED_PLAN[code];
  if (required && PLAN_RANK[plan] < PLAN_RANK[required]) return false;
  return activeFeatures.includes(code);
}

/** Mirrors home.tsx management tile visibility */
function hubVisibility(plan: PlanTier, config: ModuleConfig, features: FeatureList) {
  return {
    dashboard:     hasFeature('analytics_dashboard', plan, features),
    tables:        hasModule('enable_table_management', plan, config),
    kitchen:       hasModule('enable_kitchen_ticket',   plan, config),
    multiLocation: hasModule('enable_multi_location',   plan, config),
  };
}

/** Mirrors Sidebar.tsx / UnifiedBottomNav.tsx item visibility */
function navVisibility(plan: PlanTier, config: ModuleConfig) {
  return {
    tables:  hasModule('enable_table_management', plan, config),
    kitchen: hasModule('enable_kitchen_ticket',   plan, config),
  };
}

// ─── Default configs per business type (mirrors BUSINESS_TYPE_TEMPLATES) ─────

const DEFAULT_FREE_CONFIG: ModuleConfig = {
  enable_table_management:   false,
  enable_kitchen_ticket:     false,
  enable_loyalty:            false,
  enable_delivery:           false,
  enable_inventory:          false,
  enable_inventory_advanced: false,
  enable_appointments:       false,
  enable_multi_location:     false,
};

const RETAIL_FREE_CONFIG: ModuleConfig = { ...DEFAULT_FREE_CONFIG, enable_inventory: true };

const FREE_FEATURES: FeatureList = [
  'product_variants','partial_payment','discounts','order_queue','receipt_printer','sales_reports',
];

const GROWTH_FEATURES: FeatureList = [
  ...FREE_FEATURES,
  'order_notifications','label_printer','barcode_scanner','analytics_dashboard',
  'accounting_sync','dark_mode','custom_branding',
  'kitchen_ticket','kitchen_display','kitchen_printer',
  'inventory_tracking','inventory_reports',
];

const PRO_FEATURES: FeatureList = [
  ...GROWTH_FEATURES, 'payment_gateway','api_integration','online_booking','calendar_sync',
];

// ─── Hub visibility ───────────────────────────────────────────────────────────

describe('Hub tile visibility', () => {
  describe('free plan (all modules off, free features only)', () => {
    const hub = hubVisibility('free', DEFAULT_FREE_CONFIG, FREE_FEATURES);

    it('hides analytics dashboard (growth feature)', () => assert.equal(hub.dashboard, false));
    it('hides Tables tile',                           () => assert.equal(hub.tables, false));
    it('hides Kitchen tile',                          () => assert.equal(hub.kitchen, false));
    it('hides Multi-Location tile',                   () => assert.equal(hub.multiLocation, false));
  });

  describe('free plan — stale DB data (paid modules = true in DB)', () => {
    const staleConfig: ModuleConfig = {
      enable_table_management: true, enable_kitchen_ticket: true,
      enable_loyalty: true, enable_delivery: true, enable_inventory: true,
      enable_inventory_advanced: true, enable_appointments: true, enable_multi_location: true,
    };
    const hub = hubVisibility('free', staleConfig, GROWTH_FEATURES);

    it('still hides Tables tile (plan ceiling overrides stale DB)', () => assert.equal(hub.tables, false));
    it('still hides Kitchen tile (plan ceiling overrides stale DB)', () => assert.equal(hub.kitchen, false));
    it('still hides Multi-Location tile',                            () => assert.equal(hub.multiLocation, false));
    it('still hides analytics dashboard',                            () => assert.equal(hub.dashboard, false));
  });

  describe('growth plan — modules all ON', () => {
    const allOn: ModuleConfig = { ...DEFAULT_FREE_CONFIG,
      enable_table_management: true, enable_kitchen_ticket: true,
      enable_loyalty: true, enable_delivery: true,
      enable_inventory_advanced: true, enable_appointments: true,
    };
    const hub = hubVisibility('growth', allOn, GROWTH_FEATURES);

    it('shows Tables tile',          () => assert.equal(hub.tables, true));
    it('shows Kitchen tile',         () => assert.equal(hub.kitchen, true));
    it('shows analytics dashboard',  () => assert.equal(hub.dashboard, true));
    it('still hides Multi-Location (pro only)', () => assert.equal(hub.multiLocation, false));
  });

  describe('growth plan — modules all OFF (subscribed but not activated)', () => {
    const hub = hubVisibility('growth', DEFAULT_FREE_CONFIG, GROWTH_FEATURES);

    it('hides Tables tile (module disabled)', () => assert.equal(hub.tables, false));
    it('hides Kitchen tile (module disabled)', () => assert.equal(hub.kitchen, false));
    it('shows analytics dashboard (feature, not a module)', () => assert.equal(hub.dashboard, true));
  });

  describe('growth plan — only kitchen module ON', () => {
    const config: ModuleConfig = { ...DEFAULT_FREE_CONFIG, enable_kitchen_ticket: true };
    const hub = hubVisibility('growth', config, GROWTH_FEATURES);

    it('shows Kitchen tile',  () => assert.equal(hub.kitchen, true));
    it('hides Tables tile',   () => assert.equal(hub.tables, false));
  });

  describe('pro plan — all modules ON', () => {
    const allOn: ModuleConfig = {
      enable_table_management: true, enable_kitchen_ticket: true,
      enable_loyalty: true, enable_delivery: true, enable_inventory: true,
      enable_inventory_advanced: true, enable_appointments: true, enable_multi_location: true,
    };
    const hub = hubVisibility('pro', allOn, PRO_FEATURES);

    it('shows Tables tile',         () => assert.equal(hub.tables, true));
    it('shows Kitchen tile',        () => assert.equal(hub.kitchen, true));
    it('shows analytics dashboard', () => assert.equal(hub.dashboard, true));
    it('shows Multi-Location tile', () => assert.equal(hub.multiLocation, true));
  });

  describe('pro plan — multi_location OFF in DB', () => {
    const config: ModuleConfig = { ...DEFAULT_FREE_CONFIG, enable_table_management: true, enable_kitchen_ticket: true };
    const hub = hubVisibility('pro', config, PRO_FEATURES);

    it('hides Multi-Location tile (module disabled in DB)', () => assert.equal(hub.multiLocation, false));
    it('shows Tables tile', () => assert.equal(hub.tables, true));
  });
});

// ─── Sidebar & mobile nav visibility ─────────────────────────────────────────

describe('Sidebar (desktop) nav visibility', () => {
  it('free plan: Tables and Kitchen items hidden', () => {
    const nav = navVisibility('free', DEFAULT_FREE_CONFIG);
    assert.equal(nav.tables,  false);
    assert.equal(nav.kitchen, false);
  });

  it('growth plan, modules off: items hidden', () => {
    const nav = navVisibility('growth', DEFAULT_FREE_CONFIG);
    assert.equal(nav.tables,  false);
    assert.equal(nav.kitchen, false);
  });

  it('growth plan, enable_table_management ON: Tables shown', () => {
    const config: ModuleConfig = { ...DEFAULT_FREE_CONFIG, enable_table_management: true };
    const nav = navVisibility('growth', config);
    assert.equal(nav.tables, true);
    assert.equal(nav.kitchen, false);
  });

  it('growth plan, enable_kitchen_ticket ON: Kitchen shown', () => {
    const config: ModuleConfig = { ...DEFAULT_FREE_CONFIG, enable_kitchen_ticket: true };
    const nav = navVisibility('growth', config);
    assert.equal(nav.tables,  false);
    assert.equal(nav.kitchen, true);
  });

  it('growth plan, both modules ON: both shown', () => {
    const config: ModuleConfig = { ...DEFAULT_FREE_CONFIG, enable_table_management: true, enable_kitchen_ticket: true };
    const nav = navVisibility('growth', config);
    assert.equal(nav.tables,  true);
    assert.equal(nav.kitchen, true);
  });

  it('free plan with stale DB (both modules = true): both hidden', () => {
    const staleConfig: ModuleConfig = { ...DEFAULT_FREE_CONFIG, enable_table_management: true, enable_kitchen_ticket: true };
    const nav = navVisibility('free', staleConfig);
    assert.equal(nav.tables,  false, 'free plan ceiling must block tables even with stale DB');
    assert.equal(nav.kitchen, false, 'free plan ceiling must block kitchen even with stale DB');
  });

  it('pro plan with both modules ON: both shown', () => {
    const config: ModuleConfig = { ...DEFAULT_FREE_CONFIG, enable_table_management: true, enable_kitchen_ticket: true };
    const nav = navVisibility('pro', config);
    assert.equal(nav.tables,  true);
    assert.equal(nav.kitchen, true);
  });
});

describe('Mobile bottom nav visibility (same logic as Sidebar)', () => {
  it('free plan: Tables button hidden', () => {
    assert.equal(hasModule('enable_table_management', 'free', DEFAULT_FREE_CONFIG), false);
  });
  it('free plan: Kitchen button hidden', () => {
    assert.equal(hasModule('enable_kitchen_ticket', 'free', DEFAULT_FREE_CONFIG), false);
  });
  it('growth plan + modules on: both buttons shown', () => {
    const config: ModuleConfig = { ...DEFAULT_FREE_CONFIG, enable_table_management: true, enable_kitchen_ticket: true };
    assert.equal(hasModule('enable_table_management', 'growth', config), true);
    assert.equal(hasModule('enable_kitchen_ticket',   'growth', config), true);
  });
});

// ─── Per-business-type initial state ─────────────────────────────────────────

describe('Hub initial state per business type (right after free-plan registration)', () => {
  describe('CAFE_RESTAURANT', () => {
    // Template: all modules false, free features only
    const hub = hubVisibility('free', DEFAULT_FREE_CONFIG, FREE_FEATURES);
    it('Tables hidden (Tables module off, free plan)', () => assert.equal(hub.tables, false));
    it('Kitchen hidden (Kitchen module off, free plan)', () => assert.equal(hub.kitchen, false));
    it('Dashboard hidden (growth feature, free plan)', () => assert.equal(hub.dashboard, false));
    it('Multi-Location hidden', () => assert.equal(hub.multiLocation, false));
  });

  describe('RETAIL_MINIMARKET', () => {
    // Template: enable_inventory = true, all others false, free features only
    const hub = hubVisibility('free', RETAIL_FREE_CONFIG, FREE_FEATURES);
    it('Tables hidden', () => assert.equal(hub.tables, false));
    it('Kitchen hidden', () => assert.equal(hub.kitchen, false));
    it('Dashboard hidden', () => assert.equal(hub.dashboard, false));
  });

  describe('LAUNDRY', () => {
    const hub = hubVisibility('free', DEFAULT_FREE_CONFIG, FREE_FEATURES);
    it('Tables hidden', () => assert.equal(hub.tables, false));
    it('Kitchen hidden', () => assert.equal(hub.kitchen, false));
  });

  describe('SERVICE_APPOINTMENT', () => {
    const hub = hubVisibility('free', DEFAULT_FREE_CONFIG, FREE_FEATURES);
    it('Tables hidden', () => assert.equal(hub.tables, false));
    it('Kitchen hidden', () => assert.equal(hub.kitchen, false));
  });

  describe('DIGITAL_PPOB', () => {
    const hub = hubVisibility('free', DEFAULT_FREE_CONFIG, FREE_FEATURES);
    it('Tables hidden', () => assert.equal(hub.tables, false));
    it('Kitchen hidden', () => assert.equal(hub.kitchen, false));
  });
});

// ─── CAFE_RESTAURANT after growth upgrade ────────────────────────────────────

describe('CAFE_RESTAURANT after upgrade to growth plan', () => {
  describe('owner has not yet activated any modules', () => {
    const hub = hubVisibility('growth', DEFAULT_FREE_CONFIG, GROWTH_FEATURES);
    it('Tables still hidden (module not yet activated)', () => assert.equal(hub.tables, false));
    it('Kitchen still hidden (module not yet activated)', () => assert.equal(hub.kitchen, false));
    it('Dashboard now visible (it is a feature, always on for growth)', () => assert.equal(hub.dashboard, true));
  });

  describe('owner activates Tables module in Marketplace', () => {
    const config: ModuleConfig = { ...DEFAULT_FREE_CONFIG, enable_table_management: true };
    const hub = hubVisibility('growth', config, GROWTH_FEATURES);
    it('Tables now visible', () => assert.equal(hub.tables, true));
    it('Kitchen still hidden (not yet activated)', () => assert.equal(hub.kitchen, false));
  });

  describe('owner activates both Tables and Kitchen modules', () => {
    const config: ModuleConfig = { ...DEFAULT_FREE_CONFIG, enable_table_management: true, enable_kitchen_ticket: true };
    const hub     = hubVisibility('growth', config, GROWTH_FEATURES);
    const sidebar = navVisibility('growth', config);
    it('hub: Tables visible',  () => assert.equal(hub.tables, true));
    it('hub: Kitchen visible', () => assert.equal(hub.kitchen, true));
    it('sidebar: Tables item visible',  () => assert.equal(sidebar.tables, true));
    it('sidebar: Kitchen item visible', () => assert.equal(sidebar.kitchen, true));
  });
});

// ─── Analytics dashboard — feature (not module) gating ───────────────────────

describe('Analytics dashboard gating (feature, not module)', () => {
  it('free plan: hidden even if in DB feature list', () => {
    assert.equal(hasFeature('analytics_dashboard', 'free', [...FREE_FEATURES, 'analytics_dashboard']), false);
  });
  it('growth plan + feature active: shown', () => {
    assert.equal(hasFeature('analytics_dashboard', 'growth', GROWTH_FEATURES), true);
  });
  it('growth plan + feature NOT in list: hidden', () => {
    assert.equal(hasFeature('analytics_dashboard', 'growth', FREE_FEATURES), false);
  });
  it('pro plan + feature active: shown', () => {
    assert.equal(hasFeature('analytics_dashboard', 'pro', PRO_FEATURES), true);
  });
});
