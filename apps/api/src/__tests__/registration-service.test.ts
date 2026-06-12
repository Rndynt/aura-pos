import '../../register-paths';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

process.env.DATABASE_URL ||= 'postgres://user:pass@127.0.0.1:5432/aurapos_test';
process.env.BETTER_AUTH_SECRET ||= 'test-secret-with-at-least-32-characters';

const { registerTenantOwner } = await import('../services/registrationService');
const { ENTITLEMENT_CATALOG, getBusinessTypeDefaultEntitlements } = await import('@pos/application/entitlements');
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

type FakeRegistrationOptions = {
  missingOrderTypes?: boolean;
  availableOrderTypeCodes?: string[];
};

const baseInput = {
  slug: 'kopi-maju',
  businessName: 'Kopi Maju',
  businessType: 'CAFE_RESTAURANT' as const,
  ownerName: 'Owner Kopi',
  ownerEmail: 'owner@kopimaju.test',
  ownerPassword: 'Secret123!',
  ownerUsername: 'kopi_owner',
  timezone: 'Asia/Jakarta',
  currency: 'IDR',
  locale: 'id-ID',
};

const ALL_ORDER_TYPE_ROWS = [
  { id: 'ot-dine-in', code: 'DINE_IN' },
  { id: 'ot-take-away', code: 'TAKE_AWAY' },
  { id: 'ot-delivery', code: 'DELIVERY' },
  { id: 'ot-walk-in', code: 'WALK_IN' },
];

function createFakeDeps(options: FakeRegistrationOptions = {}) {
  const inserts: InsertOperation[] = [];
  const updates: UpdateOperation[] = [];
  const cleanupAuthUsers: string[] = [];
  const cleanupTenants: string[] = [];
  let idCounter = 0;
  const availableCodes = new Set(options.availableOrderTypeCodes ?? ['DINE_IN', 'TAKE_AWAY', 'DELIVERY']);

  const tx = {
    insert(table: unknown) {
      return {
        values(values: any) {
          inserts.push({ table, values });
          if (table === tenants) return { returning: async () => [{ id: values.id, slug: values.slug, name: values.name }] };
          if (table === outlets) return { returning: async () => [{ id: `outlet-${idCounter}`, ...values }] };
          if (table === productCategories) return { returning: async () => [{ id: `category-${idCounter}`, ...values }] };
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
              if (table !== orderTypes || options.missingOrderTypes) return [];
              return ALL_ORDER_TYPE_ROWS.filter((row) => availableCodes.has(row.code));
            },
          };
        },
      };
    },
  };

  const deps = {
    baseDomain: 'aurapos.test',
    generateId: () => {
      idCounter += 1;
      return `tenant-${idCounter}`;
    },
    runTransaction: async <T>(callback: (tx: any) => Promise<T>) => callback(tx),
    signUpOwner: async () => ({ user: { id: 'user-owner-1' } }),
    linkOwnerToTenant: async (userId: string, tenantId: string) => {
      updates.push({ table: authUser, set: { tenantId, role: 'owner', userId } });
    },
    cleanupAuthUser: async (userId: string) => { cleanupAuthUsers.push(userId); },
    cleanupTenant: async (tenantId: string) => { cleanupTenants.push(tenantId); },
  };

  return { deps, inserts, updates, cleanupAuthUsers, cleanupTenants };
}

// Tables that registration is allowed to write to. Legacy feature/module tables
// no longer exist, so this set proves registration never re-introduces them.
const ALLOWED_INSERT_TABLES = new Set<unknown>([
  tenants, outlets, productCategories, products, tenantOrderTypes, userOutletAssignments,
]);

describe('registerTenantOwner — SOT entitlement onboarding', () => {
  it('creates tenant, default outlet, order types, catalog, owner link, and no entitlement/feature/module inserts', async () => {
    const fake = createFakeDeps();
    const result = await registerTenantOwner(baseInput, fake.deps);

    const tenantInsert = fake.inserts.find((op) => op.table === tenants);
    assert.equal(tenantInsert?.values.planTier, 'starter');
    assert.equal(tenantInsert?.values.businessType, 'CAFE_RESTAURANT');
    assert.equal(tenantInsert?.values.subscriptionStatus, 'active');

    // Registration must NOT persist plan/business default entitlements anywhere.
    assert.equal(
      fake.inserts.some((op) => op.table === tenantEntitlements), false,
      'registration must not persist plan/business defaults as tenant_entitlements',
    );
    // Registration must only touch the allowed tables (no legacy feature/module tables).
    for (const op of fake.inserts) {
      assert.equal(ALLOWED_INSERT_TABLES.has(op.table), true, 'registration inserted into an unexpected table');
    }

    assert.equal(result.featureCodes.includes('inventory_basic_stock'), true);
    assert.equal(result.orderTypeCodes.join(','), 'DINE_IN,TAKE_AWAY,DELIVERY');
    assert.equal(fake.inserts.some((op) => op.table === tenantOrderTypes), true);
    assert.equal(fake.inserts.filter((op) => op.table === products).length > 0, true);
    assert.equal(fake.updates.some((op) => op.table === authUser), true);
  });

  for (const [businessType, catalogBusinessType] of Object.entries(ENTITLEMENT_CATALOG.businessTypes)) {
    it(`${businessType}: inserted tenant uses SOT defaultPlan and persists no entitlement rows`, async () => {
      const fake = createFakeDeps({ availableOrderTypeCodes: [...catalogBusinessType.orderTypes] });
      const result = await registerTenantOwner({ ...baseInput, businessType: businessType as any }, fake.deps);
      const tenantInsert = fake.inserts.find((op) => op.table === tenants);

      assert.equal(tenantInsert?.values.planTier, catalogBusinessType.defaultPlan);
      assert.equal(fake.inserts.some((op) => op.table === tenantEntitlements), false);
      assert.equal(result.featureCodes.includes('inventory_basic_stock'), true);
      assert.equal(
        getBusinessTypeDefaultEntitlements(businessType as any).includes('inventory_basic_stock'),
        true,
      );
    });
  }
});
