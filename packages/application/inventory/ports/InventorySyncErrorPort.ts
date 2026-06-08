import type { TransactionContext } from '../../shared/ports/UnitOfWorkPort';
import type { InventorySyncErrorPayload, InventorySyncErrorStatus, InventorySyncOperation } from '../inventorySyncErrors';

export interface InventorySyncErrorRecord {
  id: string;
  tenantId: string;
  outletId?: string | null;
  orderId?: string | null;
  productId?: string | null;
  operation: InventorySyncOperation;
  status: InventorySyncErrorStatus;
  payload: InventorySyncErrorPayload;
  lastError: string;
  retryCount: number;
  nextRetryAt: Date;
  resolvedAt?: Date | null;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface RecordInventorySyncErrorInput {
  tenantId: string;
  outletId?: string | null;
  orderId?: string | null;
  productId?: string | null;
  operation: InventorySyncOperation;
  payload: InventorySyncErrorPayload;
  error: unknown;
  nextRetryAt?: Date;
}

export interface InventorySyncErrorPort {
  recordInventorySyncError(input: RecordInventorySyncErrorInput, context?: TransactionContext): Promise<InventorySyncErrorRecord>;
  markInventorySyncErrorRetrying(id: string, context?: TransactionContext): Promise<InventorySyncErrorRecord | undefined>;
  markInventorySyncErrorResolved(id: string, context?: TransactionContext): Promise<InventorySyncErrorRecord | undefined>;
  markInventorySyncErrorFailed(id: string, error: unknown, retryDelayMs: number, maxRetries: number, context?: TransactionContext): Promise<InventorySyncErrorRecord | undefined>;
  listDueInventorySyncErrors(limit: number, context?: TransactionContext): Promise<InventorySyncErrorRecord[]>;
}
