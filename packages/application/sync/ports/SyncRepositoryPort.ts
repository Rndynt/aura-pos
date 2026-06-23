import type { SyncBatchInput, SyncBatchOutput } from '../SyncOfflineOrder';

export type SyncActorContext =
  | { kind: 'cashier_session'; cashier_user_id: string }
  | { kind: 'terminal_token'; terminal_token_id: string };

export interface SyncScope {
  tenant_id: string;
  outlet_id?: string | null;
}

export interface SyncOfflineBatchInput extends SyncBatchInput {
  actor: SyncActorContext;
}

export interface PullTenantChangesInput extends SyncScope {
  limit?: number;
}

export interface PullTenantChangesOutput {
  batches: unknown[];
  conflicts: unknown[];
  events: unknown[];
}

export interface ResolveSyncConflictInput extends SyncScope {
  conflict_id: string;
  resolution: 'resolved' | 'ignored' | 'pending';
  resolved_by?: string | null;
}

export interface ResolveSyncConflictOutput {
  conflict: unknown;
}

export interface PushOfflineOrdersInput extends SyncBatchInput {
  actor?: SyncActorContext;
}

export interface SyncRepositoryPort {
  pushOfflineOrders(input: PushOfflineOrdersInput): Promise<SyncBatchOutput>;
  listSyncBatches(input: PullTenantChangesInput): Promise<unknown[]>;
  listSyncConflicts(input: PullTenantChangesInput): Promise<unknown[]>;
  listSyncEvents(input: PullTenantChangesInput): Promise<unknown[]>;
  resolveSyncConflict(input: ResolveSyncConflictInput): Promise<ResolveSyncConflictOutput>;
}
