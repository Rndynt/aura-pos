import type { Database } from '../../database';
import { CreateAndPayOrder } from '@pos/application/orders/CreateAndPayOrder';
import type { CreateAndPayOrderItemInput } from '@pos/application/orders/CreateAndPayOrder';
import { syncBatches, syncEvents, serverSyncConflicts, orders } from '@pos/infrastructure/db/schema';
import { eq, and, desc, type SQL } from 'drizzle-orm';
import type { AnyPgColumn } from 'drizzle-orm/pg-core';
import { ConflictType } from '@pos/application/sync/conflictTypes';
import type { SyncBatchInput, SyncBatchOutput, SyncItemStatus, SyncOrderItemResult } from '@pos/application/sync/SyncOfflineOrder';
import type { PullTenantChangesInput, PushOfflineOrdersInput, ResolveSyncConflictInput, ResolveSyncConflictOutput, SyncRepositoryPort } from '@pos/application/sync/ports/SyncRepositoryPort';
import { DrizzleCreateAndPayOrderRepository } from '../orders/DrizzleCreateAndPayOrderRepository';
import { DrizzleUnitOfWork } from '../../unit-of-work';

type CanonicalOfflinePaymentMethod = 'CASH' | 'MANUAL_TRANSFER' | 'MANUAL_QRIS';

type CanonicalSyncOrderItemInput = {
  local_order_id: string;
  local_order_number: string;
  idempotency_key: string;
  items: CreateAndPayOrderItemInput[];
  order_type_id?: string;
  customer_name?: string;
  table_number?: string;
  notes?: string;
  tax_rate?: number;
  service_charge_rate?: number;
  amount: number;
  payment_method: CanonicalOfflinePaymentMethod;
  transaction_ref?: string;
  payment_notes?: string;
  fulfillment_mode?: 'standard' | 'instant';
  client_created_at?: string;
  source_terminal_id?: string;
};

function classifyError(error: unknown): { status: SyncItemStatus; message: string } {
  const msg = error instanceof Error ? error.message : String(error);
  if (msg.includes('not found or inactive') || msg.includes('inactive') || msg.includes('FEATURE_DISABLED') || msg.includes('ORDER_TYPE_')) {
    return { status: 'conflict', message: msg };
  }
  if (msg.includes('duplicate key') || msg.includes('unique constraint')) {
    return { status: 'replayed', message: msg };
  }
  return { status: 'failed', message: msg };
}

export class DrizzleSyncOfflineOrderRepository implements SyncRepositoryPort {
  private readonly createAndPay: CreateAndPayOrder;

  constructor(private readonly db: Database, unitOfWork?: DrizzleUnitOfWork) {
    this.createAndPay = new CreateAndPayOrder(new DrizzleCreateAndPayOrderRepository(db, unitOfWork));
  }

  async pushOfflineOrders(input: PushOfflineOrdersInput): Promise<SyncBatchOutput> {
    return this.syncOfflineOrder(input);
  }

  async listSyncBatches(input: PullTenantChangesInput): Promise<unknown[]> {
    return this.db
      .select()
      .from(syncBatches)
      .where(and(...this.scopedConditions(syncBatches, input.tenant_id, input.outlet_id)))
      .orderBy(desc(syncBatches.createdAt))
      .limit(Math.min(input.limit ?? 20, 100));
  }

  async listSyncConflicts(input: PullTenantChangesInput): Promise<unknown[]> {
    return this.db
      .select()
      .from(serverSyncConflicts)
      .where(and(...this.scopedConditions(serverSyncConflicts, input.tenant_id, input.outlet_id)))
      .orderBy(desc(serverSyncConflicts.createdAt))
      .limit(Math.min(input.limit ?? 20, 100));
  }

  async listSyncEvents(input: PullTenantChangesInput): Promise<unknown[]> {
    return this.db
      .select()
      .from(syncEvents)
      .where(and(...this.scopedConditions(syncEvents, input.tenant_id, input.outlet_id)))
      .orderBy(desc(syncEvents.createdAt))
      .limit(Math.min(input.limit ?? 50, 200));
  }

  async resolveSyncConflict(input: ResolveSyncConflictInput): Promise<ResolveSyncConflictOutput> {
    const where = and(eq(serverSyncConflicts.id, input.conflict_id), ...this.scopedConditions(serverSyncConflicts, input.tenant_id, input.outlet_id));
    const existing = await this.db.select({ id: serverSyncConflicts.id }).from(serverSyncConflicts).where(where).limit(1);

    if (!existing.length) {
      throw new Error('SYNC_CONFLICT_NOT_FOUND');
    }

    const [conflict] = await this.db
      .update(serverSyncConflicts)
      .set({
        resolution: input.resolution,
        resolvedAt: input.resolution !== 'pending' ? new Date() : null,
        resolvedBy: input.resolved_by ?? null,
      })
      .where(where)
      .returning();

    return { conflict };
  }

  private scopedConditions<T extends { tenantId: AnyPgColumn; outletId?: AnyPgColumn }>(table: T, tenantId: string, outletId?: string | null): SQL[] {
    const conditions: SQL[] = [eq(table.tenantId, tenantId)];
    if (outletId && table.outletId) {
      conditions.push(eq(table.outletId, outletId));
    }
    return conditions;
  }

  async syncOfflineOrder(input: SyncBatchInput): Promise<SyncBatchOutput> {
    const { tenant_id, terminal_id, outlet_id, app_version } = input;
    const orderInputs = input.orders as CanonicalSyncOrderItemInput[];

    if (orderInputs.length === 0) {
      return { batch_id: 'empty', processed: 0, synced: 0, replayed: 0, failed: 0, conflicts: 0, results: [] };
    }

    const [batch] = await this.db
      .insert(syncBatches)
      .values({ tenantId: tenant_id, outletId: outlet_id ?? null, terminalId: terminal_id, batchSize: orderInputs.length, appVersion: app_version })
      .returning();

    const batchId = batch?.id ?? 'unknown';
    const results: SyncOrderItemResult[] = [];
    let synced = 0;
    let replayed = 0;
    let failed = 0;
    let conflicts = 0;

    for (const item of orderInputs) {
      let result: SyncOrderItemResult;

      try {
        const output = await this.createAndPay.execute({
          tenant_id,
          outlet_id: outlet_id ?? null,
          items: item.items,
          order_type_id: item.order_type_id,
          customer_name: item.customer_name,
          table_number: item.table_number,
          notes: item.notes,
          tax_rate: item.tax_rate,
          service_charge_rate: item.service_charge_rate,
          amount: item.amount,
          payment_method: item.payment_method,
          transaction_ref: item.transaction_ref ?? item.idempotency_key,
          payment_notes: item.payment_notes,
          idempotency_key: item.idempotency_key,
          fulfillment_mode: item.fulfillment_mode,
          inventory_terminal_id: item.source_terminal_id ?? terminal_id,
        });

        const status: SyncItemStatus = output.idempotent_replay ? 'replayed' : 'synced';
        result = {
          local_order_id: item.local_order_id,
          local_order_number: item.local_order_number,
          status,
          server_order_id: output.order?.id,
          server_order_number: output.order?.orderNumber,
        };

        if (status === 'replayed') replayed++;
        else synced++;

        if (output.order?.id) {
          await this.db
            .update(orders)
            .set({
              sourceTerminalId: item.source_terminal_id ?? terminal_id,
              localOrderId: item.local_order_id,
              clientCreatedAt: item.client_created_at ? new Date(item.client_created_at) : undefined,
            })
            .where(and(eq(orders.id, output.order.id), eq(orders.tenantId, tenant_id)))
            .catch(() => undefined);
        }
      } catch (err) {
        const { status, message } = classifyError(err);
        result = {
          local_order_id: item.local_order_id,
          local_order_number: item.local_order_number,
          status,
          error: message,
        };

        if (status === 'conflict') {
          conflicts++;
          await this.db
            .insert(serverSyncConflicts)
            .values({
              tenantId: tenant_id,
              outletId: outlet_id ?? null,
              terminalId: terminal_id,
              localOrderId: item.local_order_id,
              conflictType: ConflictType.SYNC_CONFLICT,
              message,
              resolution: 'pending',
            })
            .catch(() => undefined);
        } else {
          failed++;
        }
      }

      results.push(result);

      await this.db
        .insert(syncEvents)
        .values({
          tenantId: tenant_id,
          outletId: outlet_id ?? null,
          terminalId: terminal_id,
          batchId,
          entityType: 'order',
          localEntityId: result.local_order_id,
          serverEntityId: result.server_order_id,
          localOrderNumber: result.local_order_number,
          serverOrderNumber: result.server_order_number,
          status: result.status,
          error: result.error,
        })
        .catch(() => undefined);
    }

    await this.db
      .update(syncBatches)
      .set({ syncedCount: synced, replayedCount: replayed, failedCount: failed, conflictCount: conflicts })
      .where(eq(syncBatches.id, batchId))
      .catch(() => undefined);

    return { batch_id: batchId, processed: orderInputs.length, synced, replayed, failed, conflicts, results };
  }
}
