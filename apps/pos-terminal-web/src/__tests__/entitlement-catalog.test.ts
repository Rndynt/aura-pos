/**
 * Entitlement catalog integrity tests
 *
 * Pure-logic tests for featureCatalog.ts — the single source of truth
 * for plan-tier gating on the frontend. No React, no network, no DB.
 *
 * Covers:
 *  - planAllows() correctness across all tier combinations
 *  - PLAN_RANK ordering (free < growth < pro)
 *  - No duplicate moduleKey / featureCode in catalogs
 *  - All entries have a valid PlanTier value
 *  - Free-tier modules: only enable_inventory
 *  - Pro-tier modules: only enable_multi_location
 *  - Growth modules include all expected POS modules
 *  - Free features match the API's PLAN_FEATURE_MAP.free
 *  - MODULE_REQUIRED_PLAN and FEATURE_REQUIRED_PLAN lookups are correct
 *  - Every marketplace.tsx module key appears in MODULE_CATALOG_DATA
 *  - Every marketplace.tsx feature code appears in FEATURE_CATALOG_DATA
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { register } from 'tsconfig-paths';

// ─── Path setup (resolve @/ alias for frontend source) ───────────────────────
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir   = path.resolve(__dirname, '../../../../../');
register({
  baseUrl: rootDir,
  paths: {
    '@pos/core':           ['packages/core'],
    '@pos/core/*':         ['packages/core/*'],
    '@pos/domain':         ['packages/domain'],
    '@pos/domain/*':       ['packages/domain/*'],
    '@pos/application':    ['packages/application'],
    '@pos/application/*':  ['packages/application/*'],
    '@pos/infrastructure': ['packages/infrastructure'],
    '@pos/infrastructure/*':['packages/infrastructure/*'],
  },
});

// Import using relative path (no @/ alias needed — same package)
const {
  PLAN_RANK, planAllows,
  MODULE_CATALOG_DATA, MODULE_REQUIRED_PLAN,
  FEATURE_CATALOG_DATA, FEATURE_REQUIRED_PLAN,
} = await import('../lib/featureCatalog.js');

const VALID_TIERS = new Set(['free', 'growth', 'pro']);

// ─── planAllows() ─────────────────────────────────────────────────────────────

describe('planAllows()', () => {
  const cases: [string, string, boolean][] = [
    ['free',   'free',   true],
    ['free',   'growth', false],
    ['free',   'pro',    false],
    ['growth', 'free',   true],
    ['growth', 'growth', true],
    ['growth', 'pro',    false],
    ['pro',    'free',   true],
    ['pro',    'growth', true],
    ['pro',    'pro',    true],
  ];
  for (const [tenant, required, expected] of cases) {
    it(`planAllows(${tenant}, ${required}) → ${expected}`, () => {
      assert.equal(planAllows(tenant as any, required as any), expected);
    });
  }
});

// ─── PLAN_RANK ordering ───────────────────────────────────────────────────────

describe('PLAN_RANK ordering', () => {
  it('free < growth < pro', () => {
    assert.ok(PLAN_RANK.free < PLAN_RANK.growth, 'free must rank lower than growth');
    assert.ok(PLAN_RANK.growth < PLAN_RANK.pro,  'growth must rank lower than pro');
  });

  it('all three tiers have distinct ranks', () => {
    const ranks = [PLAN_RANK.free, PLAN_RANK.growth, PLAN_RANK.pro];
    assert.equal(new Set(ranks).size, 3, 'all three tier ranks must be distinct');
  });
});

// ─── MODULE_CATALOG_DATA integrity ───────────────────────────────────────────

describe('MODULE_CATALOG_DATA integrity', () => {
  it('has at least one entry', () => {
    assert.ok(MODULE_CATALOG_DATA.length > 0);
  });

  it('no duplicate moduleKey', () => {
    const seen = new Set<string>();
    for (const entry of MODULE_CATALOG_DATA) {
      assert.ok(!seen.has(entry.moduleKey), `duplicate moduleKey: '${entry.moduleKey}'`);
      seen.add(entry.moduleKey);
    }
  });

  it('all requiredPlan values are valid PlanTier strings', () => {
    for (const entry of MODULE_CATALOG_DATA) {
      assert.ok(VALID_TIERS.has(entry.requiredPlan),
        `moduleKey '${entry.moduleKey}' has invalid requiredPlan: '${entry.requiredPlan}'`);
    }
  });

  it('enable_inventory is the only free-tier module', () => {
    const freeModules = MODULE_CATALOG_DATA.filter(m => m.requiredPlan === 'free');
    assert.equal(freeModules.length, 1, `expected exactly 1 free module, got ${freeModules.length}: ${freeModules.map(m => m.moduleKey).join(', ')}`);
    assert.equal(freeModules[0].moduleKey, 'enable_inventory');
  });

  it('enable_multi_location is the only pro-tier module', () => {
    const proModules = MODULE_CATALOG_DATA.filter(m => m.requiredPlan === 'pro');
    assert.equal(proModules.length, 1, `expected exactly 1 pro module, got ${proModules.length}: ${proModules.map(m => m.moduleKey).join(', ')}`);
    assert.equal(proModules[0].moduleKey, 'enable_multi_location');
  });

  it('growth modules include the expected POS modules', () => {
    const growthKeys = new Set(MODULE_CATALOG_DATA.filter(m => m.requiredPlan === 'growth').map(m => m.moduleKey));
    const expected = [
      'enable_table_management', 'enable_kitchen_ticket', 'enable_loyalty',
      'enable_delivery', 'enable_appointments', 'enable_inventory_advanced',
    ];
    for (const key of expected) {
      assert.ok(growthKeys.has(key), `expected growth module '${key}' is missing from MODULE_CATALOG_DATA`);
    }
  });

  it('every moduleKey has a corresponding moduleConfigKey', () => {
    for (const entry of MODULE_CATALOG_DATA) {
      assert.ok(entry.moduleConfigKey && entry.moduleConfigKey.length > 0,
        `moduleKey '${entry.moduleKey}' is missing moduleConfigKey`);
    }
  });

  it('moduleConfigKey values are camelCase (no underscores)', () => {
    for (const entry of MODULE_CATALOG_DATA) {
      assert.ok(!entry.moduleConfigKey.includes('_'),
        `moduleConfigKey '${entry.moduleConfigKey}' should be camelCase (no underscores)`);
    }
  });
});

// ─── FEATURE_CATALOG_DATA integrity ──────────────────────────────────────────

describe('FEATURE_CATALOG_DATA integrity', () => {
  it('has at least one entry', () => {
    assert.ok(FEATURE_CATALOG_DATA.length > 0);
  });

  it('no duplicate featureCode', () => {
    const seen = new Set<string>();
    for (const entry of FEATURE_CATALOG_DATA) {
      assert.ok(!seen.has(entry.featureCode), `duplicate featureCode: '${entry.featureCode}'`);
      seen.add(entry.featureCode);
    }
  });

  it('all requiredPlan values are valid PlanTier strings', () => {
    for (const entry of FEATURE_CATALOG_DATA) {
      assert.ok(VALID_TIERS.has(entry.requiredPlan),
        `featureCode '${entry.featureCode}' has invalid requiredPlan: '${entry.requiredPlan}'`);
    }
  });

  it('contains the 6 core free features', () => {
    const freeCodes = new Set(FEATURE_CATALOG_DATA.filter(f => f.requiredPlan === 'free').map(f => f.featureCode));
    const expected = ['product_variants','partial_payment','discounts','order_queue','receipt_printer','sales_reports'];
    for (const code of expected) {
      assert.ok(freeCodes.has(code), `expected free feature '${code}' is missing from FEATURE_CATALOG_DATA`);
    }
  });

  it('contains growth features from the marketplace', () => {
    const growthCodes = new Set(FEATURE_CATALOG_DATA.filter(f => f.requiredPlan === 'growth').map(f => f.featureCode));
    const expected = [
      'order_notifications', 'label_printer', 'barcode_scanner', 'analytics_dashboard',
      'accounting_sync', 'dark_mode', 'custom_branding',
      'kitchen_ticket', 'kitchen_display', 'kitchen_printer',
      'inventory_tracking', 'inventory_reports',
    ];
    for (const code of expected) {
      assert.ok(growthCodes.has(code), `expected growth feature '${code}' is missing from FEATURE_CATALOG_DATA`);
    }
  });

  it('contains pro features from the marketplace', () => {
    const proCodes = new Set(FEATURE_CATALOG_DATA.filter(f => f.requiredPlan === 'pro').map(f => f.featureCode));
    const expected = ['payment_gateway','api_integration','online_booking','calendar_sync'];
    for (const code of expected) {
      assert.ok(proCodes.has(code), `expected pro feature '${code}' is missing from FEATURE_CATALOG_DATA`);
    }
  });
});

// ─── MODULE_REQUIRED_PLAN lookup ─────────────────────────────────────────────

describe('MODULE_REQUIRED_PLAN lookup', () => {
  it('returns growth for enable_table_management', () => {
    assert.equal(MODULE_REQUIRED_PLAN['enable_table_management'], 'growth');
  });
  it('returns growth for enable_kitchen_ticket', () => {
    assert.equal(MODULE_REQUIRED_PLAN['enable_kitchen_ticket'], 'growth');
  });
  it('returns free for enable_inventory', () => {
    assert.equal(MODULE_REQUIRED_PLAN['enable_inventory'], 'free');
  });
  it('returns pro for enable_multi_location', () => {
    assert.equal(MODULE_REQUIRED_PLAN['enable_multi_location'], 'pro');
  });
  it('covers every moduleKey in MODULE_CATALOG_DATA', () => {
    for (const entry of MODULE_CATALOG_DATA) {
      assert.equal(MODULE_REQUIRED_PLAN[entry.moduleKey], entry.requiredPlan,
        `MODULE_REQUIRED_PLAN['${entry.moduleKey}'] should be '${entry.requiredPlan}'`);
    }
  });
});

// ─── FEATURE_REQUIRED_PLAN lookup ────────────────────────────────────────────

describe('FEATURE_REQUIRED_PLAN lookup', () => {
  it('returns free for product_variants', () => {
    assert.equal(FEATURE_REQUIRED_PLAN['product_variants'], 'free');
  });
  it('returns free for receipt_printer', () => {
    assert.equal(FEATURE_REQUIRED_PLAN['receipt_printer'], 'free');
  });
  it('returns growth for analytics_dashboard', () => {
    assert.equal(FEATURE_REQUIRED_PLAN['analytics_dashboard'], 'growth');
  });
  it('returns growth for kitchen_ticket', () => {
    assert.equal(FEATURE_REQUIRED_PLAN['kitchen_ticket'], 'growth');
  });
  it('returns pro for payment_gateway', () => {
    assert.equal(FEATURE_REQUIRED_PLAN['payment_gateway'], 'pro');
  });
  it('covers every featureCode in FEATURE_CATALOG_DATA', () => {
    for (const entry of FEATURE_CATALOG_DATA) {
      assert.equal(FEATURE_REQUIRED_PLAN[entry.featureCode], entry.requiredPlan,
        `FEATURE_REQUIRED_PLAN['${entry.featureCode}'] should be '${entry.requiredPlan}'`);
    }
  });
});

// ─── Cross-check: catalog vs API planFeatureMap ───────────────────────────────
// featureCatalog.ts is the frontend source of truth.
// Its free-tier features must match the API's PLAN_FEATURE_MAP.free
// (the API uses PLAN_FEATURE_MAP for server-side validation).

const API_FREE_FEATURES = new Set([
  'product_variants', 'partial_payment', 'discounts',
  'order_queue', 'receipt_printer', 'sales_reports',
]);

describe('Cross-check: free features in catalog match API PLAN_FEATURE_MAP.free', () => {
  const catalogFreeCodes = new Set(
    FEATURE_CATALOG_DATA.filter(f => f.requiredPlan === 'free').map(f => f.featureCode),
  );

  it('every API free feature is in the frontend catalog as free', () => {
    for (const code of API_FREE_FEATURES) {
      assert.ok(catalogFreeCodes.has(code),
        `API PLAN_FEATURE_MAP.free has '${code}' but featureCatalog.ts does not mark it as free`);
    }
  });

  it('every catalog free feature is in the API free list', () => {
    for (const code of catalogFreeCodes) {
      assert.ok(API_FREE_FEATURES.has(code),
        `featureCatalog.ts marks '${code}' as free but it is NOT in API PLAN_FEATURE_MAP.free`);
    }
  });
});
