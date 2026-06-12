import '../../register-paths';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

process.env.DATABASE_URL ||= 'postgres://user:pass@127.0.0.1:5432/aurapos_test';
process.env.BETTER_AUTH_SECRET ||= 'test-secret-with-at-least-32-characters';

const { registerTenantOwner, RegistrationError } = await import('../services/registrationService');
const {
  ENTITLEMENT_CATALOG,
  getPlanIncludedEntitlements,
} = await import('@pos/application/entitlements');
const {
  orderTypes,
  outlets,
  productCategories,
  products,
  tenantEntitlements,
  tenantOrderTypes,
  tenants,
  userOutletAssignments,
} = await import('@pos/infrastructure/db/schema');
const { user: authUser } = await import('../lib/auth-schema');

type InsertOperation = { table: unknown; values: any };
type UpdateOperation = { table: unknown; set: any };

const ALL_ORDER_TYPE_ROWS = [
  { id: 'ot-1', code: 'DINE_IN' },
  { id: 'ot-2', code: 'TAKE_AWAY' },
  { id: 'ot-3', code: 'DELIVERY' },
  { id: 'ot-4', code: 'WALK_IN' },
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
          if (table === tenants) return { returning: async () => [{ id: values.id, slug: values.slug, name: values.name }] };
          if (table === outlets) return { returning: async () => [{ id: `outlet-${++idCounter}`, ...values }] };
          if (table === productCategories) return { returning: async () => [{ id: `cat-${++idCounter}`, ...values }] };
          if (table === userOutletAssignments) return { onConflictDoUpdate: async () => ({ rowCount: 1 }) };
          return Promise.resolve({ rowCount: Array.isArray(values) ? values.length : 1 });
        },
      };
    },
    select() {
      return {
        from(table: unknown) {
          return {
            where: async () => {
              if (table !== orderTypes) return [];
              return ALL_ORDER_TYPE_ROWS.filter((row) => availableSet.has(row.code));
            },
          };
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
      } catch (error) {
        transactionCalls.push('rollback');
        throw error;
      }
    },
    signUpOwner: async () => ({ user: { id: 'auth-user-1' } }),
    linkOwnerToTenant: async (_userId: string, tenantId: string) => {
      updates.push({ table: authUser, set: { tenantId, role: 'owner' } });
      if (opts.failAuthLink) throw new Error('simulated auth link failure');
    },
    cleanupAuthUser: async (userId: string) => { cleanupAuthUsers.push(userId); },
    cleanupTenant: async (tenantId: string) => { cleanupTenants.push(tenantId); },
  };

  return { deps, inserts, updates, cleanupAuthUsers, cleanupTenants, transactionCalls };
}

const BASE = {
  businessName: 'Test Biz',
  ownerName: 'Owner Test',
  ownerEmail: 'owner@test.com',
  ownerPassword: 'Secret123!',
  ownerUsername: 'test_owner',
  timezone: 'Asia/Jakarta',
  currency: 'IDR',
  locale: 'id-ID',
};

// Tables that registration is allowed to write to. Legacy feature/module tables
// no longer exist, so this set proves registration never re-introduces them.
const ALLOWED_INSERT_TABLES = new Set<unknown>([
  tenants, outlets, productCategories, products, tenantOrderTypes, userOutletAssignments,
]);

describe('Full registration journey — SOT entitlement onboarding', () => {
  for (const [businessType, catalogBusinessType] of Object.entries(ENTITLEMENT_CATALOG.businessTypes)) {
    it(`${businessType}: completes registration using SOT defaults without entitlement/feature/module inserts`, async () => {
      const fake = createFake([...catalogBusinessType.orderTypes]);
      const result = await registerTenantOwner({ ...BASE, slug: businessType.toLowerCase().replaceAll('_', '-'), businessType: businessType as any }, fake.deps);
      const tenantInsert = fake.inserts.find((op) => op.table === tenants);

      assert.equal(tenantInsert?.values.planTier, catalogBusinessType.defaultPlan);
      assert.equal(tenantInsert?.values.subscriptionStatus, 'active');
      assert.equal(fake.inserts.some((op) => op.table === tenantEntitlements), false);
      for (const op of fake.inserts) {
        assert.equal(ALLOWED_INSERT_TABLES.has(op.table), true, 'registration inserted into an unexpected table');
      }
      assert.deepEqual(result.orderTypeCodes, [...catalogBusinessType.orderTypes]);
      assert.equal(result.featureCodes.includes('inventory_basic_stock'), true);
      assert.equal(fake.inserts.some((op) => op.table === tenantOrderTypes), true);
      assert.equal(fake.inserts.some((op) => op.table === products), true);
      assert.equal(result.catalogSeed.categories > 0, true);
      assert.equal(result.catalogSeed.products > 0, true);
      assert.deepEqual(fake.transactionCalls, ['begin', 'commit']);
    });
  }

  it('auth link failure triggers cleanup after tenant creation', async () => {
    const fake = createFake(['DINE_IN', 'TAKE_AWAY', 'DELIVERY'], { failAuthLink: true });
    await assert.rejects(
      registerTenantOwner({ ...BASE, slug: 'cleanup-test', businessType: 'CAFE_RESTAURANT' }, fake.deps),
      RegistrationError,
    );
    assert.deepEqual(fake.cleanupAuthUsers, ['auth-user-1']);
    assert.deepEqual(fake.cleanupTenants, ['tenant-1']);
    assert.deepEqual(fake.transactionCalls, ['begin', 'rollback']);
  });

  it('missing order type seed aborts before auth user creation', async () => {
    const fake = createFake([]);
    await assert.rejects(
      registerTenantOwner({ ...BASE, slug: 'missing-order', businessType: 'CAFE_RESTAURANT' }, fake.deps),
      /Required order types are not seeded/,
    );
    assert.deepEqual(fake.cleanupAuthUsers, []);
  });
});

describe('Entitlement SOT cumulative plan inclusion', () => {
  it('higher plans include every entitlement of lower plans (cumulative)', () => {
    const starter = getPlanIncludedEntitlements('starter');
    const growth = getPlanIncludedEntitlements('growth');
    const pro = getPlanIncludedEntitlements('pro');
    for (const code of starter) assert.equal(growth.includes(code), true);
    for (const code of growth) assert.equal(pro.includes(code), true);
  });
});
