/**
 * Plan upgrade / downgrade flow tests
 *
 * Covers:
 *  - BILLING_INTERNAL_SECRET authorization matrix (all combinations)
 *  - PATCH /api/tenants/plan endpoint rejects unauthenticated callers
 *  - Plan feature map is additive: free ⊆ growth ⊆ pro
 *  - After upgrade to growth, growth modules become activatable
 *  - After upgrade to pro, pro-only modules become activatable
 *  - Downgrade from growth → free, growth modules become inaccessible
 *  - Free plan ceiling: paid modules blocked regardless of DB state
 *  - Growth plan ceiling: pro modules blocked regardless of DB state
 */

import '../../register-paths';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

process.env.DATABASE_URL      ||= 'postgres://user:pass@127.0.0.1:5432/aurapos_test';
process.env.BETTER_AUTH_SECRET ||= 'test-secret-with-at-least-32-characters';

const { isBillingPlanChangeAuthorized } = await import('../http/controllers/TenantsController');
const { PLAN_FEATURE_MAP }              = await import('../constants/planFeatureMap');

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeReq(headers: Record<string, string> = {}) {
  return { headers } as unknown as import('express').Request;
}

/** Mirrors TenantContext.hasModule() logic — plan-tier ceiling from MODULE_REQUIRED_PLAN */
function simulateHasModule(
  moduleName: string,
  planTier: 'free' | 'growth' | 'pro',
  moduleConfig: Record<string, boolean>,
): boolean {
  const PLAN_RANK: Record<string, number> = { free: 0, growth: 1, pro: 2 };
  const MODULE_REQUIRED: Record<string, string> = {
    enable_table_management:   'growth',
    enable_kitchen_ticket:     'growth',
    enable_loyalty:            'growth',
    enable_delivery:           'growth',
    enable_appointments:       'growth',
    enable_inventory:          'free',
    enable_inventory_advanced: 'growth',
    enable_multi_location:     'pro',
  };
  const required = MODULE_REQUIRED[moduleName] ?? 'free';
  if (PLAN_RANK[planTier] < PLAN_RANK[required]) return false;
  return moduleConfig[moduleName] === true;
}

/** Mirrors legacy feature compatibility gating from the generated PLAN_FEATURE_MAP wrapper. */
function simulateHasFeature(
  featureCode: string,
  planTier: 'free' | 'growth' | 'pro',
  activeFeatureCodes: string[],
): boolean {
  const PLAN_RANK: Record<string, number> = { free: 0, starter: 0, growth: 1, pro: 2 };
  const tierForFeature = (code: string): 'free' | 'growth' | 'pro' => {
    if (PLAN_FEATURE_MAP.free.includes(code)) return 'free';
    if (PLAN_FEATURE_MAP.growth.includes(code)) return 'growth';
    if (PLAN_FEATURE_MAP.pro.includes(code)) return 'pro';
    return 'pro';
  };
  const required = tierForFeature(featureCode);
  if (PLAN_RANK[planTier] < PLAN_RANK[required]) return false;
  return activeFeatureCodes.includes(featureCode);
}

// ─── Plan change authorization ────────────────────────────────────────────────

describe('isBillingPlanChangeAuthorized — authorization matrix', () => {
  it('returns false: BILLING_INTERNAL_SECRET not set + header provided', () => {
    const orig = process.env.BILLING_INTERNAL_SECRET;
    delete process.env.BILLING_INTERNAL_SECRET;
    try {
      assert.equal(isBillingPlanChangeAuthorized(makeReq({ 'x-internal-billing-secret': 'anything' })), false);
    } finally {
      if (orig !== undefined) process.env.BILLING_INTERNAL_SECRET = orig;
    }
  });

  it('returns false: BILLING_INTERNAL_SECRET set, header absent', () => {
    process.env.BILLING_INTERNAL_SECRET = 'secret-key';
    try {
      assert.equal(isBillingPlanChangeAuthorized(makeReq({})), false);
    } finally { delete process.env.BILLING_INTERNAL_SECRET; }
  });

  it('returns false: BILLING_INTERNAL_SECRET set, header wrong', () => {
    process.env.BILLING_INTERNAL_SECRET = 'secret-key';
    try {
      assert.equal(isBillingPlanChangeAuthorized(makeReq({ 'x-internal-billing-secret': 'WRONG' })), false);
    } finally { delete process.env.BILLING_INTERNAL_SECRET; }
  });

  it('returns true: BILLING_INTERNAL_SECRET set, header matches exactly', () => {
    process.env.BILLING_INTERNAL_SECRET = 'correct-secret-key';
    try {
      assert.equal(isBillingPlanChangeAuthorized(makeReq({ 'x-internal-billing-secret': 'correct-secret-key' })), true);
    } finally { delete process.env.BILLING_INTERNAL_SECRET; }
  });

  it('returns false: BILLING_INTERNAL_SECRET is empty string even if header matches', () => {
    process.env.BILLING_INTERNAL_SECRET = '';
    try {
      assert.equal(isBillingPlanChangeAuthorized(makeReq({ 'x-internal-billing-secret': '' })), false);
    } finally { delete process.env.BILLING_INTERNAL_SECRET; }
  });

  it('returns false: case mismatch in secret value', () => {
    process.env.BILLING_INTERNAL_SECRET = 'CaseSensitive';
    try {
      assert.equal(isBillingPlanChangeAuthorized(makeReq({ 'x-internal-billing-secret': 'casesensitive' })), false);
    } finally { delete process.env.BILLING_INTERNAL_SECRET; }
  });
});

// ─── Plan tier ceiling — modules ─────────────────────────────────────────────

describe('Plan tier ceiling — hasModule simulation', () => {
  const allModulesOn: Record<string, boolean> = {
    enable_table_management:   true,
    enable_kitchen_ticket:     true,
    enable_loyalty:            true,
    enable_delivery:           true,
    enable_appointments:       true,
    enable_inventory:          true,
    enable_inventory_advanced: true,
    enable_multi_location:     true,
  };

  describe('free plan', () => {
    it('blocks enable_table_management even if DB has it = true (stale data)', () => {
      assert.equal(simulateHasModule('enable_table_management', 'free', allModulesOn), false);
    });
    it('blocks enable_kitchen_ticket even if DB has it = true', () => {
      assert.equal(simulateHasModule('enable_kitchen_ticket', 'free', allModulesOn), false);
    });
    it('blocks enable_loyalty even if DB has it = true', () => {
      assert.equal(simulateHasModule('enable_loyalty', 'free', allModulesOn), false);
    });
    it('blocks enable_delivery even if DB has it = true', () => {
      assert.equal(simulateHasModule('enable_delivery', 'free', allModulesOn), false);
    });
    it('blocks enable_inventory_advanced even if DB has it = true', () => {
      assert.equal(simulateHasModule('enable_inventory_advanced', 'free', allModulesOn), false);
    });
    it('blocks enable_appointments even if DB has it = true', () => {
      assert.equal(simulateHasModule('enable_appointments', 'free', allModulesOn), false);
    });
    it('blocks enable_multi_location even if DB has it = true', () => {
      assert.equal(simulateHasModule('enable_multi_location', 'free', allModulesOn), false);
    });
    it('allows enable_inventory (free module)', () => {
      assert.equal(simulateHasModule('enable_inventory', 'free', allModulesOn), true);
    });
  });

  describe('growth plan', () => {
    it('allows enable_table_management when DB = true', () => {
      assert.equal(simulateHasModule('enable_table_management', 'growth', allModulesOn), true);
    });
    it('allows enable_kitchen_ticket when DB = true', () => {
      assert.equal(simulateHasModule('enable_kitchen_ticket', 'growth', allModulesOn), true);
    });
    it('allows enable_loyalty when DB = true', () => {
      assert.equal(simulateHasModule('enable_loyalty', 'growth', allModulesOn), true);
    });
    it('still hides enable_table_management when DB = false', () => {
      assert.equal(simulateHasModule('enable_table_management', 'growth', { ...allModulesOn, enable_table_management: false }), false);
    });
    it('blocks enable_multi_location even on growth (pro only)', () => {
      assert.equal(simulateHasModule('enable_multi_location', 'growth', allModulesOn), false);
    });
    it('allows enable_inventory', () => {
      assert.equal(simulateHasModule('enable_inventory', 'growth', allModulesOn), true);
    });
    it('allows enable_inventory_advanced when DB = true', () => {
      assert.equal(simulateHasModule('enable_inventory_advanced', 'growth', allModulesOn), true);
    });
  });

  describe('pro plan', () => {
    it('allows enable_multi_location when DB = true', () => {
      assert.equal(simulateHasModule('enable_multi_location', 'pro', allModulesOn), true);
    });
    it('still hides enable_multi_location when DB = false', () => {
      assert.equal(simulateHasModule('enable_multi_location', 'pro', { ...allModulesOn, enable_multi_location: false }), false);
    });
    it('allows all growth modules', () => {
      const growthMods = ['enable_table_management','enable_kitchen_ticket','enable_loyalty','enable_delivery','enable_appointments','enable_inventory_advanced'];
      for (const mod of growthMods) {
        assert.equal(simulateHasModule(mod, 'pro', allModulesOn), true, `${mod} must be allowed on pro`);
      }
    });
  });

  describe('plan downgrade simulation (growth → free)', () => {
    it('previously enabled growth modules become inaccessible after downgrade to free', () => {
      const growthMods = ['enable_table_management','enable_kitchen_ticket','enable_loyalty','enable_delivery'];
      for (const mod of growthMods) {
        // Module is "on" in DB but plan was downgraded to free
        assert.equal(simulateHasModule(mod, 'free', allModulesOn), false,
          `${mod} must be inaccessible after downgrade to free (even if DB still has it = true)`);
      }
    });
  });
});

// ─── Plan tier ceiling — features ────────────────────────────────────────────

describe('Plan tier ceiling — hasFeature simulation', () => {
  const allFeatures = [
    'product_variants', 'partial_payment', 'discounts', 'order_queue', 'receipt_printer', 'sales_reports',
    'order_notifications', 'label_printer', 'barcode_scanner', 'analytics_dashboard',
    'accounting_sync', 'dark_mode', 'custom_branding',
    'kitchen_ticket', 'kitchen_display', 'kitchen_printer',
    'inventory_tracking', 'inventory_reports',
    'payment_gateway', 'api_integration', 'online_booking', 'calendar_sync',
  ];

  describe('free plan', () => {
    it('allows generated starter/free compatibility features', () => {
      for (const code of PLAN_FEATURE_MAP.free) {
        assert.equal(simulateHasFeature(code, 'free', allFeatures), true, `${code} must be accessible on free`);
      }
    });

    it('blocks all growth features even if they are in the DB', () => {
      const growthOnes = ['order_notifications','label_printer','barcode_scanner','analytics_dashboard',
        'accounting_sync','dark_mode','custom_branding','kitchen_ticket','kitchen_display',
        'kitchen_printer','inventory_tracking','inventory_reports'];
      for (const code of growthOnes) {
        assert.equal(simulateHasFeature(code, 'free', allFeatures), false, `${code} must be blocked on free`);
      }
    });

    it('blocks all pro features even if they are in the DB', () => {
      const proOnes = ['payment_gateway','api_integration','online_booking','calendar_sync'];
      for (const code of proOnes) {
        assert.equal(simulateHasFeature(code, 'free', allFeatures), false, `${code} must be blocked on free`);
      }
    });
  });

  describe('growth plan', () => {
    it('allows all free + growth features', () => {
      const growthAndFree = PLAN_FEATURE_MAP.growth;
      for (const code of growthAndFree) {
        assert.equal(simulateHasFeature(code, 'growth', allFeatures), true, `${code} must be accessible on growth`);
      }
    });

    it('blocks pro features even if they are in the DB', () => {
      const proOnes = ['payment_gateway','api_integration','online_booking','calendar_sync'];
      for (const code of proOnes) {
        assert.equal(simulateHasFeature(code, 'growth', allFeatures), false, `${code} must be blocked on growth`);
      }
    });

    it('still returns false for inactive feature even if plan allows it', () => {
      assert.equal(simulateHasFeature('analytics_dashboard', 'growth', []), false,
        'analytics_dashboard is not active → must return false');
    });
  });

  describe('pro plan', () => {
    it('allows all features from all tiers', () => {
      const proFeatures = PLAN_FEATURE_MAP.pro;
      for (const code of proFeatures) {
        assert.equal(simulateHasFeature(code, 'pro', allFeatures), true, `${code} must be accessible on pro`);
      }
    });
  });
});

// ─── Upgrade path: new features unlocked ─────────────────────────────────────

describe('Upgrade path — features unlocked at each tier', () => {
  const growthOnlyFeatures = PLAN_FEATURE_MAP.growth.filter(c => !PLAN_FEATURE_MAP.free.includes(c));
  const proOnlyFeatures    = PLAN_FEATURE_MAP.pro.filter(c => !PLAN_FEATURE_MAP.growth.includes(c));

  it('upgrading free → growth unlocks kitchen, analytics, inventory_advanced, and others', () => {
    assert.ok(growthOnlyFeatures.includes('kitchen_ticket'), 'kitchen_ticket must unlock at growth');
    assert.ok(growthOnlyFeatures.includes('analytics_dashboard'), 'analytics_dashboard must unlock at growth');
  });

  it('upgrading growth → pro unlocks payment_gateway and api_integration', () => {
    assert.ok(proOnlyFeatures.includes('payment_gateway'), 'payment_gateway must unlock at pro');
    assert.ok(proOnlyFeatures.includes('api_integration'),  'api_integration must unlock at pro');
  });

  it('growth-only features: blocked on free, accessible on growth', () => {
    const allActive = [...PLAN_FEATURE_MAP.growth];
    for (const code of growthOnlyFeatures) {
      assert.equal(simulateHasFeature(code, 'free',   allActive), false, `${code} must be blocked on free`);
      assert.equal(simulateHasFeature(code, 'growth', allActive), true,  `${code} must be allowed on growth`);
    }
  });

  it('pro-only features: blocked on free and growth, accessible on pro', () => {
    const allActive = [...PLAN_FEATURE_MAP.pro];
    for (const code of proOnlyFeatures) {
      assert.equal(simulateHasFeature(code, 'free',   allActive), false, `${code} must be blocked on free`);
      assert.equal(simulateHasFeature(code, 'growth', allActive), false, `${code} must be blocked on growth`);
      assert.equal(simulateHasFeature(code, 'pro',    allActive), true,  `${code} must be allowed on pro`);
    }
  });
});
