import '../../register-paths';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

process.env.DATABASE_URL ||= 'postgres://user:pass@127.0.0.1:5432/aurapos_test';
process.env.BETTER_AUTH_SECRET ||= 'test-secret-with-at-least-32-characters';

const schema = await import('@pos/infrastructure/db/schema');
const { TenantFeatureRepository } = await import('@pos/infrastructure/repositories/tenants/TenantFeatureRepository');

describe('legacy tenant feature repository removal', () => {
  it('does not export the removed legacy table from the active schema barrel', () => {
    assert.equal('tenantFeatures' in schema, false);
  });

  it('does not write legacy feature rows through the compatibility repository', async () => {
    const repo = new TenantFeatureRepository({} as any);
    await assert.rejects(
      repo.create({ tenantId: 'tenant-1', featureCode: 'partial_payment', source: 'purchase', isActive: true } as any),
      /removed/,
    );
  });
});
