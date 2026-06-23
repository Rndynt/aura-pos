import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { GetCurrentAuthUserProfile, type AuthUserProfileReaderPort } from '../GetCurrentAuthUserProfile';

function createUseCase(profile: Awaited<ReturnType<AuthUserProfileReaderPort['findById']>>) {
  return new GetCurrentAuthUserProfile({
    findById: async () => profile,
  });
}

describe('GetCurrentAuthUserProfile', () => {
  it('returns unauthenticated when no session user exists', async () => {
    const useCase = createUseCase(null);

    const result = await useCase.execute(null);

    assert.deepEqual(result, { success: false, reason: 'unauthenticated' });
  });

  it('keeps compatible null custom fields when user has no persisted profile fields', async () => {
    const useCase = createUseCase(null);

    const result = await useCase.execute({ id: 'user-1', name: 'Owner', email: 'owner@example.com' });

    assert.equal(result.success, true);
    if (!result.success) return;
    assert.deepEqual(result.profile, {
      id: 'user-1',
      name: 'Owner',
      email: 'owner@example.com',
      username: null,
      tenantId: null,
      role: null,
    });
  });

  it('returns tenant, role, and username when persisted profile fields exist', async () => {
    const useCase = createUseCase({ username: 'owner', tenantId: 'tenant-1', role: 'owner' });

    const result = await useCase.execute({ id: 'user-1', name: 'Owner', email: 'owner@example.com' });

    assert.equal(result.success, true);
    if (!result.success) return;
    assert.deepEqual(result.profile, {
      id: 'user-1',
      name: 'Owner',
      email: 'owner@example.com',
      username: 'owner',
      tenantId: 'tenant-1',
      role: 'owner',
    });
  });
});
