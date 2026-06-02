import '../../register-paths';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

process.env.DATABASE_URL ||= 'postgres://user:pass@127.0.0.1:5432/aurapos_test';
process.env.BETTER_AUTH_SECRET ||= 'test-secret-with-at-least-32-characters';

const { TenantFeatureRepository } = await import('@pos/infrastructure/repositories/tenants/TenantFeatureRepository');
const { tenantFeatures } = await import('@shared/schema');

type CapturedUpsert = {
  values?: any;
  conflict?: any;
};

function createRepositoryHarness(returningOverride: Record<string, any> = {}) {
  const captured: CapturedUpsert = {};
  const row = {
    id: 'feature-row-1',
    tenantId: 'tenant-1',
    featureCode: 'partial_payment',
    activatedAt: new Date('2026-06-02T00:00:00.000Z'),
    expiresAt: null,
    source: 'purchase',
    isActive: true,
    config: null,
    createdAt: new Date('2026-06-02T00:00:00.000Z'),
    updatedAt: new Date('2026-06-02T00:00:00.000Z'),
    ...returningOverride,
  };

  const db = {
    insert(table: unknown) {
      assert.equal(table, tenantFeatures);
      return {
        values(values: any) {
          captured.values = values;
          return {
            onConflictDoUpdate(conflict: any) {
              captured.conflict = conflict;
              return {
                returning: async () => [row],
              };
            },
          };
        },
      };
    },
  };

  return {
    captured,
    repo: new TenantFeatureRepository(db as any),
  };
}

describe('TenantFeatureRepository duplicate prevention', () => {
  it('upserts duplicate purchase rows on the tenant/feature unique target', async () => {
    const activatedAt = new Date('2026-06-02T01:02:03.000Z');
    const { captured, repo } = createRepositoryHarness({ activatedAt });

    const result = await repo.create({
      tenantId: 'tenant-1',
      featureCode: 'partial_payment',
      activatedAt,
      source: 'purchase',
      isActive: true,
    } as any);

    assert.equal(result.tenant_id, 'tenant-1');
    assert.equal(result.feature_code, 'partial_payment');
    assert.equal(result.is_active, true);
    assert.deepEqual(captured.conflict?.target, [tenantFeatures.tenantId, tenantFeatures.featureCode]);
    assert.equal(captured.conflict?.set.source, 'purchase');
    assert.equal(captured.conflict?.set.isActive, true);
    assert.equal(captured.conflict?.set.activatedAt, activatedAt);
    assert.equal(captured.values?.tenantId, 'tenant-1');
    assert.equal(captured.values?.featureCode, 'partial_payment');
  });

  it('upserts duplicate toggle activation requests instead of inserting a second row', async () => {
    const { captured, repo } = createRepositoryHarness({
      featureCode: 'receipt_printer',
      source: 'manual_grant',
      isActive: true,
    });

    const result = await repo.upsertByTenantAndFeature({
      tenantId: 'tenant-1',
      featureCode: 'receipt_printer',
      source: 'manual_grant',
      isActive: true,
    } as any);

    assert.equal(result.feature_code, 'receipt_printer');
    assert.equal(result.source, 'manual_grant');
    assert.equal(result.is_active, true);
    assert.deepEqual(captured.conflict?.target, [tenantFeatures.tenantId, tenantFeatures.featureCode]);
    assert.equal(captured.conflict?.set.source, 'manual_grant');
    assert.equal(captured.conflict?.set.isActive, true);
    assert.equal(captured.values?.featureCode, 'receipt_printer');
  });
});
