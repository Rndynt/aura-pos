import type { DbClient } from '@pos/infrastructure/database';
import { db } from '@pos/infrastructure/database';
import { inventorySyncErrors } from '../../../shared/schema';
import { and, asc, eq, isNull, lte, sql } from 'drizzle-orm';
import type { StockContext, StockItem } from './stockMovements';

export type InventorySyncOperation = 'deduct_sale' | 'reverse_return';
export type InventorySyncErrorStatus = 'pending' | 'retrying' | 'resolved' | 'failed';

export interface InventorySyncErrorPayload {
  operation: InventorySyncOperation;
  items: StockItem[];
  context: StockContext;
  policy: 'allow_negative';
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

export function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return typeof error === 'string' ? error : 'Unknown inventory sync error';
}

export async function recordInventorySyncError(
  input: RecordInventorySyncErrorInput,
  client: DbClient = db,
) {
  const [record] = await client
    .insert(inventorySyncErrors)
    .values({
      tenantId: input.tenantId,
      outletId: input.outletId ?? null,
      orderId: input.orderId ?? null,
      productId: input.productId ?? null,
      operation: input.operation,
      status: 'pending',
      payload: input.payload as any,
      lastError: errorMessage(input.error),
      retryCount: 0,
      nextRetryAt: input.nextRetryAt ?? new Date(),
    })
    .returning();

  return record;
}

export async function markInventorySyncErrorRetrying(id: string, client: DbClient = db) {
  const [record] = await client
    .update(inventorySyncErrors)
    .set({ status: 'retrying', updatedAt: new Date() })
    .where(eq(inventorySyncErrors.id, id))
    .returning();
  return record;
}

export async function markInventorySyncErrorResolved(id: string, client: DbClient = db) {
  const [record] = await client
    .update(inventorySyncErrors)
    .set({ status: 'resolved', resolvedAt: new Date(), updatedAt: new Date() })
    .where(eq(inventorySyncErrors.id, id))
    .returning();
  return record;
}

export async function markInventorySyncErrorFailed(
  id: string,
  error: unknown,
  retryDelayMs: number,
  maxRetries: number,
  client: DbClient = db,
) {
  const message = errorMessage(error);
  const [record] = await client
    .update(inventorySyncErrors)
    .set({
      status: sql`CASE WHEN ${inventorySyncErrors.retryCount} + 1 >= ${maxRetries} THEN 'failed' ELSE 'pending' END` as any,
      retryCount: sql`${inventorySyncErrors.retryCount} + 1` as any,
      lastError: message,
      nextRetryAt: new Date(Date.now() + retryDelayMs),
      updatedAt: new Date(),
    })
    .where(eq(inventorySyncErrors.id, id))
    .returning();
  return record;
}

export async function listDueInventorySyncErrors(limit: number, client: DbClient = db) {
  return client
    .select()
    .from(inventorySyncErrors)
    .where(
      and(
        eq(inventorySyncErrors.status, 'pending'),
        lte(inventorySyncErrors.nextRetryAt, new Date()),
        isNull(inventorySyncErrors.resolvedAt),
      ),
    )
    .orderBy(asc(inventorySyncErrors.createdAt))
    .limit(limit);
}
