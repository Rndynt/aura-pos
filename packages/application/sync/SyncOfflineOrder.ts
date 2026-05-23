/**
 * SyncOfflineOrder Use Case (Sprint 4)
 *
 * Accepts a batch of offline orders from a terminal and processes each atomically
 * via CreateAndPayOrder. Returns per-item results so the terminal can update its
 * local IndexedDB (serverId, serverOrderNumber, syncStatus).
 *
 * Error classification:
 *  - 'synced'   — created successfully on server for the first time
 *  - 'replayed' — idempotent replay of a previously synced order
 *  - 'conflict' — business rule violation (inactive product, etc.)
 *  - 'failed'   — unexpected server error (will be retried by the sync engine)
 */

import type { Database } from '@pos/infrastructure/database';
import { CreateAndPayOrder } from '../orders/CreateAndPayOrder';
import type { CreateAndPayOrderItemInput } from '../orders/CreateAndPayOrder';
import { syncBatches, syncEvents, serverSyncConflicts, orders } from '../../../shared/schema';
import { eq, and } from 'drizzle-orm';

// ── Types ──────────────────────────────────────────────────────────────────────

export interface SyncOrderItemInput {
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
  payment_method: 'cash' | 'card' | 'ewallet' | 'other';
  transaction_ref?: string;
  payment_notes?: string;
  client_created_at?: string;
  source_terminal_id?: string;
}

export type SyncItemStatus = 'synced' | 'replayed' | 'conflict' | 'failed';

export interface SyncOrderItemResult {
  local_order_id: string;
  local_order_number: string;
  status: SyncItemStatus;
  server_order_id?: string;
  server_order_number?: string;
  error?: string;
}

export interface SyncBatchInput {
  tenant_id: string;
  terminal_id: string;
  app_version?: string;
  orders: SyncOrderItemInput[];
}

export interface SyncBatchOutput {
  batch_id: string;
  processed: number;
  synced: number;
  replayed: number;
  failed: number;
  conflicts: number;
  results: SyncOrderItemResult[];
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function classifyError(error: unknown): { status: SyncItemStatus; message: string } {
  const msg = error instanceof Error ? error.message : String(error);
  if (
    msg.includes('not found or inactive') ||
    msg.includes('inactive') ||
    msg.includes('FEATURE_DISABLED') ||
    msg.includes('ORDER_TYPE_')
  ) {
    return { status: 'conflict', message: msg };
  }
  if (msg.includes('duplicate key') || msg.includes('unique constraint')) {
    return { status: 'replayed', message: msg };
  }
  return { status: 'failed', message: msg };
}

// ── Use Case ───────────────────────────────────────────────────────────────────

export class SyncOfflineOrder {
  private readonly createAndPay: CreateAndPayOrder;

  constructor(private readonly db: Database) {
    this.createAndPay = new CreateAndPayOrder(db);
  }

  async execute(input: SyncBatchInput): Promise<SyncBatchOutput> {
    const { tenant_id, terminal_id, app_version, orders: orderInputs } = input;

    if (orderInputs.length === 0) {
      return { batch_id: 'empty', processed: 0, synced: 0, replayed: 0, failed: 0, conflicts: 0, results: [] };
    }

    // ── Create audit batch record ─────────────────────────────────────────────
    const [batch] = await this.db
      .insert(syncBatches)
      .values({ tenantId: tenant_id, terminalId: terminal_id, batchSize: orderInputs.length, appVersion: app_version })
      .returning();
    const batchId = batch?.id ?? 'unknown';

    // ── Process each order independently ─────────────────────────────────────
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

        // Stamp offline metadata onto the server order
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
            .values({ tenantId: tenant_id, terminalId: terminal_id, localOrderId: item.local_order_id, conflictType: 'SYNC_CONFLICT', message })
            .catch(() => undefined);
        } else {
          failed++;
        }
      }

      results.push(result);

      // Audit: insert sync event (non-critical)
      await this.db
        .insert(syncEvents)
        .values({
          tenantId: tenant_id,
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

    // ── Update batch summary ──────────────────────────────────────────────────
    await this.db
      .update(syncBatches)
      .set({ syncedCount: synced, replayedCount: replayed, failedCount: failed, conflictCount: conflicts })
      .where(eq(syncBatches.id, batchId))
      .catch(() => undefined);

    return { batch_id: batchId, processed: orderInputs.length, synced, replayed, failed, conflicts, results };
  }
}
