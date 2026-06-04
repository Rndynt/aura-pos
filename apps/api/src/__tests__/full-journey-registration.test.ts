/**
 * Full-journey registration tests
 *
 * Covers the complete onboarding flow from "user submits registration form"
 * to "tenant + owner + features + modules are written to the DB".
 *
 * Scenarios:
 *  - All 5 business types complete the journey successfully
 *  - Each type gets the correct order types from its template
 *  - Each type gets only free-plan features seeded
 *  - Each type has every paid module disabled
 *  - Output shape (tenant URL, featureCodes, orderTypeCodes, catalogSeed)
 *  - Slug normalisation (uppercase → lowercase)
 *  - Auth link failure after user creation triggers cleanup
 *  - Template order types not in DB abort the flow with an error
 *  - PLAN_FEATURE_MAP tier structure: free ⊆ growth ⊆ pro
 *  - Template ↔ PLAN_FEATURE_MAP.free consistency per business type
 */

import '../../register-paths';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

process.env.DATABASE_URL      ||= 'postgres://user:pass@127.0.0.1:5432/aurapos_test';
process.env.BETTER_AUTH_SECRET ||= 'test-secret-with-at-least-32-characters';

const { registerTenantOwner, RegistrationError } = await import('../services/registrationService');
const { BUSINESS_TYPE_TEMPLATES }                 = await import('@pos/application/tenants/businessTypeTemplates');
const { PLAN_FEATURE_MAP }                        = await import('../constants/planFeatureMap');
const {
  outlets, productCategories, products, tenantFeatures,
  tenantModuleConfigs, tenantOrderTypes, tenants,
  userOutletAssignments, orderTypes,
} = await import('@shared/schema');
const { user: authUser } = await import('../lib/auth-schema');

// ─── Fake deps (exact interface mirror of RegistrationDeps) ──────────────────

type InsertOperation = { table: unknown; values: any };
type UpdateOperation = { table: unknown; set: any };

const ALL_ORDER_TYPE_ROWS = [
  { id: 'ot-1', code: 'DINE_IN'   },
  { id: 'ot-2', code: 'TAKE_AWAY' },
  { id: 'ot-3', code: 'DELIVERY'  },
  { id: 'ot-4', code: 'WALK_IN'   },
];

function createFake(availableCodes: string[], opts: { failAuthLink?: boolean } = {}) {
  const inserts: InsertOperation[] = [];
  const updates: UpdateOperation[] = [];
  const cleanupAuthUsers: string[] = [];
  const cleanupTenants: string[] = [];
  const transactionCalls: string[] = [];
  const availableSet = new Set(availableCodes);
  let idCounter = 0;

  const tx = {
    insert(table: unknown) {
      return {
        values(values: any) {
          inserts.push({ table, values });

          if (table === tenants) {
            return { returning: async () => [{ id: values.id, slug: values.slug, name: values.name }] };
          }
          if (table === outlets) {
            return { returning: async () => [{ id: `outlet-${++idCounter}`, ...values }] };
          }
          if (table === productCategories) {
            return { returning: async () => [{ id: `cat-${++idCounter}`, ...values }] };
          }
          if (table === tenantModuleConfigs || table === tenantFeatures || table === tenantOrderTypes || table === products) {
            return Promise.resolve({ rowCount: Array.isArray(values) ? values.length : 1 });
          }
          if (table === userOutletAssignments) {
            return { onConflictDoUpdate: async () => ({ rowCount: 1 }) };
          }
          return { returning: async () => [{ ...values }] };
        },
      };
    },
    select() {
      return {
        from(table: unknown) {
          return {
            where: async () => {
              if (table !== orderTypes) return [];
              return ALL_ORDER_TYPE_ROWS.filter(r => availableSet.has(r.code));
            },
          };
        },
      };
    },
    update(table: unknown) {
      return {
        set(setValues: any) {
          updates.push({ table, set: setValues });
          return { where: async () => ({ rowCount: 1 }) };
        },
      };
    },
  };

  const deps = {
    baseDomain: 'aurapos.test',
    generateId: () => `tenant-${++idCounter}`,
    runTransaction: async <T>(callback: (tx: any) => Promise<T>) => {
      transactionCalls.push('begin');
      try {
        const result = await callback(tx);
        transactionCalls.push('commit');
        return result;
      } catch (err) {
        transactionCalls.push('rollback');
        throw err;
      }
    },
    signUpOwner: async () => ({ user: { id: 'auth-user-1' } }),
    linkOwnerToTenant: async (_userId: string, _tenantId: string) => {
      updates.push({ table: authUser, set: { tenantId: _tenantId, role: 'owner' } });
      if (opts.failAuthLink) throw new Error('simulated auth link failure');
    },
    cleanupAuthUser: async (userId: string) => { cleanupAuthUsers.push(userId); },
    cleanupTenant:   async (tenantId: string) => { cleanupTenants.push(tenantId); },
  };

  return { deps, inserts, updates, cleanupAuthUsers, cleanupTenants, transactionCalls };
}

const BASE = {
  businessName: 'Test Biz',
  ownerName:    'Owner Test',
  ownerEmail:   'owner@test.com',
  ownerPassword:'Secret123!',
  ownerUsername:'test_owner',
  timezone:     'Asia/Jakarta',
  currency:     'IDR',
  locale:       'id-ID',
};

const FREE_FEATURES = new Set(PLAN_FEATURE_MAP.free);

const PAID_MODULE_KEYS_CAMEL = [
  'enableTableManagement', 'enableKitchenTicket', 'enableLoyalty',
  'enableDelivery', 'enableInventoryAdvanced', 'enableAppointments',
  'enableMultiLocation',
];

const BUSINESS_CONFIG: Record<string, string[]> = {
  CAFE_RESTAURANT:     ['DINE_IN', 'TAKE_AWAY', 'DELIVERY'],
  RETAIL_MINIMARKET:   ['WALK_IN'],
  LAUNDRY:             ['WALK_IN'],
  SERVICE_APPOINTMENT: ['WALK_IN'],
  DIGITAL_PPOB:        ['WALK_IN'],
};

// ─── Full journey per business type ──────────────────────────────────────────

describe('Full registration journey — all business types', () => {
  for (const [biz, orderTypeCodes] of Object.entries(BUSINESS_CONFIG)) {
    const businessType = biz as any;

    describe(biz, () => {
      it('completes without throwing and returns a tenant with a URL', async () => {
        const { deps } = createFake(orderTypeCodes);
        const result = await registerTenantOwner({ ...BASE, slug: `ok-${biz.toLowerCase()}`, businessType }, deps);
        assert.ok(result.tenant.id,   'tenant id must be set');
        assert.ok(result.tenant.url,  'tenant URL must be set');
        assert.ok(result.ownerUserId, 'ownerUserId must be set');
        assert.ok(result.defaultOutletId, 'defaultOutletId must be set');
      });

      it('tenant URL uses baseDomain from deps', async () => {
        const { deps } = createFake(orderTypeCodes);
        const result = await registerTenantOwner({ ...BASE, slug: `url-${biz.toLowerCase()}`, businessType }, deps);
        assert.ok(result.tenant.url.includes('aurapos.test'), `URL must contain baseDomain, got: ${result.tenant.url}`);
      });

      it('starts on free plan — planTier = free, subscriptionStatus = active, no trial', async () => {
        const { inserts, deps } = createFake(orderTypeCodes);
        await registerTenantOwner({ ...BASE, slug: `free-${biz.toLowerCase()}`, businessType }, deps);
        const t = inserts.find(op => op.table === tenants);
        assert.ok(t, 'tenants insert must exist');
        assert.equal(t!.values.planTier,           'free',   'must onboard as free plan');
        assert.equal(t!.values.subscriptionStatus, 'active', 'subscriptionStatus must be active');
        assert.equal(t!.values.trialEndsAt,         undefined, 'no trial date for new signups');
      });

      it('seeds only free-plan features (strict subset of PLAN_FEATURE_MAP.free)', async () => {
        const { deps } = createFake(orderTypeCodes);
        const result = await registerTenantOwner({ ...BASE, slug: `feat-${biz.toLowerCase()}`, businessType }, deps);
        assert.ok(result.featureCodes.length > 0, 'must seed at least one feature');
        for (const code of result.featureCodes) {
          assert.ok(FREE_FEATURES.has(code), `feature '${code}' is NOT in PLAN_FEATURE_MAP.free`);
        }
      });

      it('has every paid module disabled in the inserted module config', async () => {
        const { inserts, deps } = createFake(orderTypeCodes);
        await registerTenantOwner({ ...BASE, slug: `mod-${biz.toLowerCase()}`, businessType }, deps);
        const mc = inserts.find(op => op.table === tenantModuleConfigs);
        assert.ok(mc, 'module config insert must exist');
        for (const key of PAID_MODULE_KEYS_CAMEL) {
          assert.equal(mc!.values[key], false, `paid module '${key}' must be false at registration`);
        }
      });

      it('inserts the correct order types from the business type template', async () => {
        const { deps } = createFake(orderTypeCodes);
        const result = await registerTenantOwner({ ...BASE, slug: `ot-${biz.toLowerCase()}`, businessType }, deps);
        const templateOrderTypes = BUSINESS_TYPE_TEMPLATES[businessType].orderTypes;
        assert.deepEqual(
          [...result.orderTypeCodes].sort(),
          [...templateOrderTypes].sort(),
          `${biz} must get order types: ${templateOrderTypes.join(', ')}`,
        );
      });

      it('returns catalogSeed with categories and products counts', async () => {
        const { deps } = createFake(orderTypeCodes);
        const result = await registerTenantOwner({ ...BASE, slug: `seed-${biz.toLowerCase()}`, businessType }, deps);
        assert.ok(typeof result.catalogSeed.categories === 'number', 'catalogSeed.categories must be number');
        assert.ok(typeof result.catalogSeed.products   === 'number', 'catalogSeed.products must be number');
        assert.ok(result.catalogSeed.categories > 0,  'must seed at least one category');
        assert.ok(result.catalogSeed.products   > 0,  'must seed at least one product');
      });

      it('runs all DB writes inside a single transaction (begin → commit)', async () => {
        const { deps, transactionCalls } = createFake(orderTypeCodes);
        await registerTenantOwner({ ...BASE, slug: `tx-${biz.toLowerCase()}`, businessType }, deps);
        assert.deepEqual(transactionCalls, ['begin', 'commit']);
      });
    });
  }
});

// ─── Slug handling (service layer) ───────────────────────────────────────────
// NOTE: slug normalisation (toLowerCase) is the route layer's responsibility.
// The service stores exactly the slug it receives — tests below confirm this.
// Route-level normalisation is tested in registration-route-e2e.test.ts.

describe('Slug handling at service layer', () => {
  it('stores the slug exactly as received', async () => {
    const { inserts, deps } = createFake(['DINE_IN', 'TAKE_AWAY', 'DELIVERY']);
    await registerTenantOwner({ ...BASE, slug: 'kopi-maju', businessType: 'CAFE_RESTAURANT' }, deps);
    const t = inserts.find(op => op.table === tenants);
    assert.equal(t!.values.slug, 'kopi-maju');
  });

  it('slug appears in the returned tenant URL', async () => {
    const { deps } = createFake(['WALK_IN']);
    const result = await registerTenantOwner({ ...BASE, slug: 'toko-abc', businessType: 'RETAIL_MINIMARKET' }, deps);
    assert.ok(result.tenant.url.includes('toko-abc'), `URL must contain the slug, got: ${result.tenant.url}`);
  });

  it('returned tenant.slug matches input slug', async () => {
    const { deps } = createFake(['WALK_IN']);
    const result = await registerTenantOwner({ ...BASE, slug: 'laundry-shop', businessType: 'LAUNDRY' }, deps);
    assert.equal(result.tenant.slug, 'laundry-shop');
  });
});

// ─── Missing order types → abort ─────────────────────────────────────────────

describe('Registration aborted — template order types missing from DB', () => {
  it('throws when none of the template order types exist in the DB', async () => {
    const { deps } = createFake([]); // no order types available
    await assert.rejects(
      () => registerTenantOwner({ ...BASE, slug: 'no-order-types', businessType: 'CAFE_RESTAURANT' }, deps),
      (err: any) => {
        assert.ok(err instanceof Error);
        return true;
      },
    );
  });

  it('rolls back the transaction when order types are missing', async () => {
    const { deps, transactionCalls } = createFake([]);
    await assert.rejects(
      () => registerTenantOwner({ ...BASE, slug: 'rollback-ot', businessType: 'CAFE_RESTAURANT' }, deps),
    );
    assert.ok(transactionCalls.includes('rollback'), 'transaction must be rolled back on failure');
  });
});

// ─── Auth link failure → cleanup ─────────────────────────────────────────────

describe('Registration cleanup — auth link fails after user creation', () => {
  it('calls cleanupAuthUser when linkOwnerToTenant throws', async () => {
    const { deps, cleanupAuthUsers } = createFake(['DINE_IN', 'TAKE_AWAY', 'DELIVERY'], { failAuthLink: true });
    await assert.rejects(
      () => registerTenantOwner({ ...BASE, slug: 'auth-fail', businessType: 'CAFE_RESTAURANT' }, deps),
    );
    assert.ok(cleanupAuthUsers.length > 0, 'cleanupAuthUser must be called on auth link failure');
  });
});

// ─── Template ↔ PLAN_FEATURE_MAP.free consistency ────────────────────────────

describe('Template ↔ PLAN_FEATURE_MAP.free consistency', () => {
  for (const [biz, template] of Object.entries(BUSINESS_TYPE_TEMPLATES)) {
    it(`${biz}: plan_tier is exactly 'free'`, () => {
      assert.equal(template.tenantDefaults.plan_tier, 'free');
    });

    it(`${biz}: every seeded feature is in PLAN_FEATURE_MAP.free`, () => {
      for (const f of template.features) {
        assert.ok(FREE_FEATURES.has(f.feature_code),
          `${biz} seeds '${f.feature_code}' which is NOT in PLAN_FEATURE_MAP.free`);
      }
    });
  }
});

// ─── PLAN_FEATURE_MAP tier structure ─────────────────────────────────────────

describe('PLAN_FEATURE_MAP tier structure', () => {
  it('free ⊆ growth: every free feature is also in growth', () => {
    for (const code of PLAN_FEATURE_MAP.free) {
      assert.ok(PLAN_FEATURE_MAP.growth.includes(code), `growth plan must include free feature '${code}'`);
    }
  });

  it('growth ⊆ pro: every growth feature is also in pro', () => {
    for (const code of PLAN_FEATURE_MAP.growth) {
      assert.ok(PLAN_FEATURE_MAP.pro.includes(code), `pro plan must include growth feature '${code}'`);
    }
  });

  it('growth adds value over free (has features not in free)', () => {
    const freeSet = new Set(PLAN_FEATURE_MAP.free);
    assert.ok(PLAN_FEATURE_MAP.growth.some(c => !freeSet.has(c)), 'growth must have at least one feature beyond free');
  });

  it('pro adds value over growth (has features not in growth)', () => {
    const growthSet = new Set(PLAN_FEATURE_MAP.growth);
    assert.ok(PLAN_FEATURE_MAP.pro.some(c => !growthSet.has(c)), 'pro must have at least one feature beyond growth');
  });

  it('no duplicate feature codes within any tier', () => {
    for (const [tier, codes] of Object.entries(PLAN_FEATURE_MAP)) {
      const seen = new Set<string>();
      for (const code of codes) {
        assert.ok(!seen.has(code), `duplicate feature code '${code}' in ${tier} plan`);
        seen.add(code);
      }
    }
  });

  it('kitchen_ticket is a growth feature (not free)', () => {
    assert.ok(!PLAN_FEATURE_MAP.free.includes('kitchen_ticket'),   'kitchen_ticket must NOT be in free plan');
    assert.ok( PLAN_FEATURE_MAP.growth.includes('kitchen_ticket'), 'kitchen_ticket must be in growth plan');
  });

  it('payment_gateway is a pro feature (not growth)', () => {
    assert.ok(!PLAN_FEATURE_MAP.growth.includes('payment_gateway'), 'payment_gateway must NOT be in growth plan');
    assert.ok( PLAN_FEATURE_MAP.pro.includes('payment_gateway'),    'payment_gateway must be in pro plan');
  });
});
