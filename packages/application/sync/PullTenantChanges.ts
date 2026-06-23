import type { PullTenantChangesInput, PullTenantChangesOutput, ResolveSyncConflictInput, ResolveSyncConflictOutput, SyncRepositoryPort } from './ports/SyncRepositoryPort';

export class PullTenantChanges {
  constructor(private readonly repository: SyncRepositoryPort) {}

  async execute(input: PullTenantChangesInput): Promise<PullTenantChangesOutput> {
    const [batches, conflicts, events] = await Promise.all([
      this.repository.listSyncBatches(input),
      this.repository.listSyncConflicts(input),
      this.repository.listSyncEvents(input),
    ]);

    return { batches, conflicts, events };
  }

  async listBatches(input: PullTenantChangesInput): Promise<unknown[]> {
    return this.repository.listSyncBatches(input);
  }

  async listConflicts(input: PullTenantChangesInput): Promise<unknown[]> {
    return this.repository.listSyncConflicts(input);
  }

  async listEvents(input: PullTenantChangesInput): Promise<unknown[]> {
    return this.repository.listSyncEvents(input);
  }

  async resolveConflict(input: ResolveSyncConflictInput): Promise<ResolveSyncConflictOutput> {
    return this.repository.resolveSyncConflict(input);
  }
}
