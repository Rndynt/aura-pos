import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { PullTenantChanges } from '../PullTenantChanges';
import { PushOfflineOrders } from '../PushOfflineOrders';
import type { SyncBatchOutput } from '../SyncOfflineOrder';
import type { PullTenantChangesInput, PushOfflineOrdersInput, ResolveSyncConflictInput, SyncRepositoryPort } from '../ports/SyncRepositoryPort';

function emptyBatch(overrides: Partial<SyncBatchOutput> = {}): SyncBatchOutput {
  return { batch_id: 'batch-1', processed: 0, synced: 0, replayed: 0, failed: 0, conflicts: 0, results: [], ...overrides };
}

class FakeSyncRepository implements SyncRepositoryPort {
  pushes: PushOfflineOrdersInput[] = [];
  pulls: PullTenantChangesInput[] = [];
  resolves: ResolveSyncConflictInput[] = [];

  constructor(private readonly pushResult: SyncBatchOutput = emptyBatch()) {}

  async pushOfflineOrders(input: PushOfflineOrdersInput): Promise<SyncBatchOutput> {
    this.pushes.push(input);
    return this.pushResult;
  }

  async listSyncBatches(input: PullTenantChangesInput): Promise<unknown[]> {
    this.pulls.push(input);
    return [{ id: 'batch-tenant', tenant_id: input.tenant_id, outlet_id: input.outlet_id }];
  }

  async listSyncConflicts(input: PullTenantChangesInput): Promise<unknown[]> {
    this.pulls.push(input);
    return [{ id: 'conflict-tenant', resolution: 'pending', tenant_id: input.tenant_id, outlet_id: input.outlet_id }];
  }

  async listSyncEvents(input: PullTenantChangesInput): Promise<unknown[]> {
    this.pulls.push(input);
    return [{ id: 'event-tenant', status: 'failed', error: 'retryable network timeout', tenant_id: input.tenant_id, outlet_id: input.outlet_id }];
  }

  async resolveSyncConflict(input: ResolveSyncConflictInput): Promise<{ conflict: unknown }> {
    this.resolves.push(input);
    return { conflict: { id: input.conflict_id, tenant_id: input.tenant_id, outlet_id: input.outlet_id, resolution: input.resolution } };
  }
}

describe('sync application use cases', () => {
  it('keeps cashier session and terminal token actors distinct when pushing offline orders', async () => {
    const repo = new FakeSyncRepository();
    const useCase = new PushOfflineOrders(repo);

    await useCase.execute({ tenant_id: 'tenant-1', outlet_id: 'outlet-1', terminal_id: 'term-1', orders: [], actor: { kind: 'cashier_session', cashier_user_id: 'user-1' } });
    await useCase.execute({ tenant_id: 'tenant-1', outlet_id: 'outlet-1', terminal_id: 'term-1', orders: [], actor: { kind: 'terminal_token', terminal_token_id: 'token-1' } });

    assert.equal(repo.pushes[0].actor?.kind, 'cashier_session');
    assert.equal(repo.pushes[0].actor?.cashier_user_id, 'user-1');
    assert.equal(repo.pushes[1].actor?.kind, 'terminal_token');
    assert.equal(repo.pushes[1].actor?.terminal_token_id, 'token-1');
  });

  it('passes tenant and outlet scope to pull and resolve repository operations', async () => {
    const repo = new FakeSyncRepository();
    const useCase = new PullTenantChanges(repo);

    const output = await useCase.execute({ tenant_id: 'tenant-a', outlet_id: 'outlet-a', limit: 25 });
    const resolved = await useCase.resolveConflict({ tenant_id: 'tenant-a', outlet_id: 'outlet-a', conflict_id: 'conflict-1', resolution: 'resolved', resolved_by: 'manager-1' });

    assert.equal(output.batches.length, 1);
    assert.equal(output.conflicts.length, 1);
    assert.equal(output.events.length, 1);
    assert.equal(repo.pulls.length, 3);
    assert.ok(repo.pulls.every((pull) => pull.tenant_id === 'tenant-a' && pull.outlet_id === 'outlet-a'));
    assert.deepEqual(repo.resolves[0], { tenant_id: 'tenant-a', outlet_id: 'outlet-a', conflict_id: 'conflict-1', resolution: 'resolved', resolved_by: 'manager-1' });
    assert.deepEqual(resolved.conflict, { id: 'conflict-1', tenant_id: 'tenant-a', outlet_id: 'outlet-a', resolution: 'resolved' });
  });

  it('preserves retry/error state results for failed offline order pushes', async () => {
    const repo = new FakeSyncRepository(emptyBatch({
      processed: 1,
      failed: 1,
      results: [{ local_order_id: 'local-1', local_order_number: 'L-1', status: 'failed', error: 'retryable inventory write failed' }],
    }));
    const useCase = new PushOfflineOrders(repo);

    const output = await useCase.execute({ tenant_id: 'tenant-1', terminal_id: 'term-1', orders: [], actor: { kind: 'cashier_session', cashier_user_id: 'cashier-1' } });

    assert.equal(output.failed, 1);
    assert.equal(output.results[0].status, 'failed');
    assert.match(output.results[0].error ?? '', /retryable/);
  });
});
