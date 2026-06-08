import type {
  InventorySyncErrorPort,
  InventorySyncErrorRecord,
  RecordInventorySyncErrorInput,
} from '@pos/application/inventory/ports';
import {
  listDueInventorySyncErrors,
  markInventorySyncErrorFailed,
  markInventorySyncErrorResolved,
  markInventorySyncErrorRetrying,
  recordInventorySyncError,
} from '@pos/application/inventory/inventorySyncErrors';
import type { TransactionContext } from '@pos/application/shared/ports';
import { DrizzleUnitOfWork } from '../../unit-of-work';

function toInventorySyncErrorRecord(record: unknown): InventorySyncErrorRecord {
  return record as InventorySyncErrorRecord;
}

export class DrizzleInventorySyncErrorRepository implements InventorySyncErrorPort {
  async recordInventorySyncError(
    input: RecordInventorySyncErrorInput,
    context?: TransactionContext,
  ): Promise<InventorySyncErrorRecord> {
    return toInventorySyncErrorRecord(
      await recordInventorySyncError(input, DrizzleUnitOfWork.fromContext(context)),
    );
  }

  async markInventorySyncErrorRetrying(
    id: string,
    context?: TransactionContext,
  ): Promise<InventorySyncErrorRecord | undefined> {
    const record = await markInventorySyncErrorRetrying(id, DrizzleUnitOfWork.fromContext(context));
    return record ? toInventorySyncErrorRecord(record) : undefined;
  }

  async markInventorySyncErrorResolved(
    id: string,
    context?: TransactionContext,
  ): Promise<InventorySyncErrorRecord | undefined> {
    const record = await markInventorySyncErrorResolved(id, DrizzleUnitOfWork.fromContext(context));
    return record ? toInventorySyncErrorRecord(record) : undefined;
  }

  async markInventorySyncErrorFailed(
    id: string,
    error: unknown,
    retryDelayMs: number,
    maxRetries: number,
    context?: TransactionContext,
  ): Promise<InventorySyncErrorRecord | undefined> {
    const record = await markInventorySyncErrorFailed(
      id,
      error,
      retryDelayMs,
      maxRetries,
      DrizzleUnitOfWork.fromContext(context),
    );
    return record ? toInventorySyncErrorRecord(record) : undefined;
  }

  async listDueInventorySyncErrors(
    limit: number,
    context?: TransactionContext,
  ): Promise<InventorySyncErrorRecord[]> {
    const records = await listDueInventorySyncErrors(limit, DrizzleUnitOfWork.fromContext(context));
    return records.map(toInventorySyncErrorRecord);
  }
}
