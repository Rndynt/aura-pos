import '../../register-paths';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

process.env.DATABASE_URL ||= 'postgres://user:pass@127.0.0.1:5432/aurapos_test';
process.env.BETTER_AUTH_SECRET ||= 'test-secret-with-at-least-32-characters';

const { registerTenantOwner, RegistrationError } = await import('../services/registrationService');
const {
  orderTypes,
  outlets,
  productCategories,
  products,
  tenantFeatures,
  tenantModuleConfigs,
  tenantOrderTypes,
  tenants,
  userOutletAssignments,
} = await import('@shared/schema');
const { user: authUser } = await import('../lib/auth-schema');

type InsertOperation = {
  table: unknown;
  values: any;
};

type UpdateOperation = {
  table: unknown;
  set: any;
};

type FakeRegistrationOptions = {
  tenantInsertError?: unknown;
  duplicateEmailError?: unknown;
  failAuthLinkAfterUserCreated?: boolean;
  missingOrderTypes?: boolean;
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

function createFakeDeps(options: FakeRegistrationOptions = {}) {
  const inserts: InsertOperation[] = [];
  const updates: UpdateOperation[] = [];
  const cleanupAuthUsers: string[] = [];
  const cleanupTenants: string[] = [];
  const transactionCalls: string[] = [];
  let idCounter = 0;

  const tx = {
    insert(table: unknown) {
      return {
        values(values: any) {
          inserts.push({ table, values });

          if (table === tenants && options.tenantInsertError) {
            return {
              returning: async () => {
                throw options.tenantInsertError;
              },
            };
          }

          if (table === tenants) {
            return {
              returning: async () => [
                {
                  id: values.id,
                  slug: values.slug,
                  name: values.name,
                },
              ],
            };
          }

          if (table === outlets) {
            return {
              returning: async () => [
                {
                  id: `outlet-${idCounter}`,
                  ...values,
                },
              ],
            };
          }

          if (table === tenantModuleConfigs || table === tenantFeatures || table === tenantOrderTypes || table === products) {
            return Promise.resolve({ rowCount: Array.isArray(values) ? values.length : 1 });
          }

          if (table === productCategories) {
            return {
              returning: async () => [
                {
                  id: `category-${idCounter}-${inserts.filter((op) => op.table === productCategories).length}`,
                  ...values,
                },
              ],
            };
          }

          if (table === userOutletAssignments) {
            return {
              onConflictDoUpdate: async () => ({ rowCount: 1 }),
            };
          }

          return {
            returning: async () => [{ ...values }],
          };
        },
      };
    },
    select() {
      return {
        from(table: unknown) {
          return {
            where: async () => {
              if (table !== orderTypes || options.missingOrderTypes) return [];
              return [
                { id: 'order-type-dine-in', code: 'DINE_IN' },
                { id: 'order-type-take-away', code: 'TAKE_AWAY' },
                { id: 'order-type-delivery', code: 'DELIVERY' },
              ];
            },
          };
        },
      };
    },
    update(table: unknown) {
      return {
        set(setValues: any) {
          updates.push({ table, set: setValues });
          return {
            where: async () => {
              if (table === authUser && options.failAuthLinkAfterUserCreated) {
                throw new Error('simulated auth link failure');
              }
              return { rowCount: 1 };
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
    signUpOwner: async () => {
      if (options.duplicateEmailError) throw options.duplicateEmailError;
      return { user: { id: 'user-owner-1' } };
    },
    cleanupAuthUser: async (userId: string) => {
      cleanupAuthUsers.push(userId);
    },
    cleanupTenant: async (tenantId: string) => {
      cleanupTenants.push(tenantId);
    },
  };

  return { deps, inserts, updates, cleanupAuthUsers, cleanupTenants, transactionCalls };
}

describe('registerTenantOwner', () => {
  it('creates tenant, default outlet, module config, owner link, and owner outlet assignment in one transaction flow', async () => {
    const fake = createFakeDeps();

    const result = await registerTenantOwner(baseInput, fake.deps);

    assert.deepEqual(fake.transactionCalls, ['begin', 'commit']);
    assert.equal(result.tenant.id, 'tenant-1');
    assert.equal(result.tenant.slug, 'kopi-maju');
    assert.equal(result.tenant.url, 'https://kopi-maju.aurapos.test');
    assert.equal(result.defaultOutletId, 'outlet-1');

    const tenantInsert = fake.inserts.find((op) => op.table === tenants);
    assert.equal(tenantInsert?.values.slug, 'kopi-maju');
    assert.equal(tenantInsert?.values.businessType, 'CAFE_RESTAURANT');

    const outletInsert = fake.inserts.find((op) => op.table === outlets);
    assert.equal(outletInsert?.values.tenantId, 'tenant-1');
    assert.equal(outletInsert?.values.slug, 'main');
    assert.equal(outletInsert?.values.isDefault, true);

    const moduleInsert = fake.inserts.find((op) => op.table === tenantModuleConfigs);
    assert.equal(moduleInsert?.values.tenantId, 'tenant-1');
    assert.equal(moduleInsert?.values.enableTableManagement, true);
    assert.equal(moduleInsert?.values.enableKitchenTicket, true);
    assert.equal(moduleInsert?.values.enableMultiLocation, false);

    const authUpdate = fake.updates.find((op) => op.table === authUser);
    assert.equal(authUpdate?.set.tenantId, 'tenant-1');
    assert.equal(authUpdate?.set.role, 'owner');

    const featureInsert = fake.inserts.find((op) => op.table === tenantFeatures);
    assert.equal(featureInsert?.values.length, 10);
    assert.ok(featureInsert?.values.some((feature: any) => feature.featureCode === 'receipt_printer'));
    assert.deepEqual(result.featureCodes, [
      'kitchen_ticket',
      'kitchen_printer',
      'kitchen_display',
      'receipt_printer',
      'order_notifications',
      'order_queue',
      'product_variants',
      'partial_payment',
      'discounts',
      'sales_reports',
    ]);

    const orderTypeInsert = fake.inserts.find((op) => op.table === tenantOrderTypes);
    assert.equal(orderTypeInsert?.values.length, 3);
    assert.deepEqual(result.orderTypeCodes, ['DINE_IN', 'TAKE_AWAY', 'DELIVERY']);

    const categoryInserts = fake.inserts.filter((op) => op.table === productCategories);
    assert.equal(categoryInserts.length, 2);
    const productInserts = fake.inserts.filter((op) => op.table === products);
    assert.equal(productInserts.reduce((count, op) => count + op.values.length, 0), 6);
    assert.deepEqual(result.catalogSeed, { categories: 2, products: 6 });

    const outletAssignment = fake.inserts.find((op) => op.table === userOutletAssignments);
    assert.equal(outletAssignment?.values.userId, 'user-owner-1');
    assert.equal(outletAssignment?.values.outletId, 'outlet-1');
    assert.equal(outletAssignment?.values.role, 'owner');
  });

  it('maps duplicate tenant slug from the database unique constraint and does not rely only on pre-checks', async () => {
    const uniqueError = Object.assign(new Error('duplicate key value violates unique constraint "tenants_slug_unique"'), {
      code: '23505',
      constraint: 'tenants_slug_unique',
    });
    const fake = createFakeDeps({ tenantInsertError: uniqueError });

    await assert.rejects(
      () => registerTenantOwner(baseInput, fake.deps),
      (error: unknown) => {
        assert.ok(error instanceof RegistrationError);
        assert.equal(error.code, 'DUPLICATE_SLUG');
        assert.equal(error.status, 409);
        return true;
      },
    );

    assert.deepEqual(fake.transactionCalls, ['begin', 'rollback']);
    assert.deepEqual(fake.cleanupAuthUsers, []);
    assert.deepEqual(fake.cleanupTenants, []);
  });

  it('fails and compensates tenant resources when required order types are not seeded', async () => {
    const fake = createFakeDeps({ missingOrderTypes: true });

    await assert.rejects(
      () => registerTenantOwner(baseInput, fake.deps),
      (error: unknown) => {
        assert.ok(error instanceof RegistrationError);
        assert.equal(error.code, 'REGISTRATION_FAILED');
        assert.equal(error.status, 500);
        return true;
      },
    );

    assert.deepEqual(fake.transactionCalls, ['begin', 'rollback']);
    assert.deepEqual(fake.cleanupAuthUsers, []);
    assert.deepEqual(fake.cleanupTenants, ['tenant-1']);
  });

  it('maps duplicate owner email from Better Auth and compensates tenant/default data', async () => {
    const duplicateEmailError = Object.assign(new Error('email already exists'), { code: 'USER_ALREADY_EXISTS' });
    const fake = createFakeDeps({ duplicateEmailError });

    await assert.rejects(
      () => registerTenantOwner(baseInput, fake.deps),
      (error: unknown) => {
        assert.ok(error instanceof RegistrationError);
        assert.equal(error.code, 'DUPLICATE_EMAIL');
        assert.equal(error.status, 409);
        return true;
      },
    );

    assert.deepEqual(fake.transactionCalls, ['begin', 'rollback']);
    assert.deepEqual(fake.cleanupAuthUsers, []);
    assert.deepEqual(fake.cleanupTenants, ['tenant-1']);
  });

  it('cleans Better Auth user rows and tenant resources when a failure happens after owner user creation', async () => {
    const fake = createFakeDeps({ failAuthLinkAfterUserCreated: true });

    await assert.rejects(
      () => registerTenantOwner(baseInput, fake.deps),
      (error: unknown) => {
        assert.ok(error instanceof RegistrationError);
        assert.equal(error.code, 'REGISTRATION_FAILED');
        assert.equal(error.status, 500);
        return true;
      },
    );

    assert.deepEqual(fake.transactionCalls, ['begin', 'rollback']);
    assert.deepEqual(fake.cleanupAuthUsers, ['user-owner-1']);
    assert.deepEqual(fake.cleanupTenants, ['tenant-1']);
  });
});
