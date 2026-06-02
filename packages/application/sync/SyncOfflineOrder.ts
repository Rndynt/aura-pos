/**
 * SyncOfflineOrder Use Case (Sprint 4 + Sprint 5)
 *
 * Accepts a batch of offline orders from a terminal and processes each atomically
 * via CreateAndPayOrder. Returns per-item results so the terminal can update its
 * local IndexedDB (serverId, serverOrderNumber, syncStatus).
 *
 * Sprint 5 additions:
 *  - Phase 10.2: Price conflict detection (PRICE_CHANGED) — accepts offline price + audit note
 *  - Phase 10.3: Stock conflict detection (STOCK_INSUFFICIENT) — allows negative stock (configurable)
 *  - Inventory stock/ledger ownership stays in CreateAndPayOrder to avoid duplicate deductions
 */

import type { Database } from '@pos/infrastructure/database';
import { CreateAndPayOrder } from '../orders/CreateAndPayOrder';
import type { CreateAndPayOrderItemInput } from '../orders/CreateAndPayOrder';
import {
  syncBatches,
  syncEvents,
  serverSyncConflicts,
  orders,
  products,
  tables,
} from '../../../shared/schema';
import { eq, and, inArray, ne } from 'drizzle-orm';
import { ConflictType } from './conflictTypes';

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
  fulfillment_mode?: 'standard' | 'instant';
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
  warnings?: string[];
  error?: string;
}

export interface SyncBatchInput {
  tenant_id: string;
  terminal_id: string;
  outlet_id?: string | null;
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
    const { tenant_id, terminal_id, outlet_id, app_version, orders: orderInputs } = input;

    if (orderInputs.length === 0) {
      return { batch_id: 'empty', processed: 0, synced: 0, replayed: 0, failed: 0, conflicts: 0, results: [] };
    }

    // ── Create audit batch record ─────────────────────────────────────────────
    const [batch] = await this.db
      .insert(syncBatches)
      .values({ tenantId: tenant_id, outletId: outlet_id ?? null, terminalId: terminal_id, batchSize: orderInputs.length, appVersion: app_version })
      .returning();
    const batchId = batch?.id ?? 'unknown';

    // ── Pre-fetch current product prices + stock for conflict detection ───────
    const allProductIds = [...new Set(orderInputs.flatMap(o => o.items.map(i => i.product_id)))];
    const serverProducts = await this.db
      .select({ id: products.id, basePrice: products.basePrice, stockQty: products.stockQty, stockTrackingEnabled: products.stockTrackingEnabled, name: products.name })
      .from(products)
      .where(and(inArray(products.id, allProductIds), eq(products.tenantId, tenant_id)));

    const productMap = new Map(serverProducts.map(p => [p.id, p]));

    // ── Phase 15.2: Pre-fetch occupied tables for conflict detection ──────────
    const allTableNumbers = [...new Set(
      orderInputs.map(o => o.table_number).filter((t): t is string => !!t)
    )];
    const occupiedTableNumbers = new Set<string>();

    if (allTableNumbers.length > 0) {
      const occupiedTables = await this.db
        .select({ tableNumber: tables.tableNumber })
        .from(tables)
        .where(and(
          eq(tables.tenantId, tenant_id),
          inArray(tables.tableNumber, allTableNumbers),
          ne(tables.status, 'available'),
          ...(outlet_id ? [eq(tables.outletId, outlet_id)] : []),
        ));
      for (const t of occupiedTables) occupiedTableNumbers.add(t.tableNumber);
    }

    // ── Process each order independently ─────────────────────────────────────
    const results: SyncOrderItemResult[] = [];
    let synced = 0;
    let replayed = 0;
    let failed = 0;
    let conflicts = 0;

    for (const item of orderInputs) {
      let result: SyncOrderItemResult;
      const warnings: string[] = [];

      try {
        // ── Phase 10.2: Price Conflict Detection ──────────────────────────────
        const priceConflicts: Array<{ productId: string; productName: string; offlinePrice: number; serverPrice: number }> = [];

        for (const orderItem of item.items) {
          const serverProduct = productMap.get(orderItem.product_id);
          if (!serverProduct) continue;
          const serverPrice = parseFloat(serverProduct.basePrice);
          const offlinePrice = orderItem.base_price;
          const diff = Math.abs(serverPrice - offlinePrice);
          // Flag if price differs by more than 1 unit (accounting for rounding)
          if (diff > 1) {
            priceConflicts.push({
              productId: orderItem.product_id,
              productName: orderItem.product_name,
              offlinePrice,
              serverPrice,
            });
          }
        }

        if (priceConflicts.length > 0) {
          const warningMsg = `Harga berubah untuk: ${priceConflicts.map(c => `${c.productName} (offline: ${c.offlinePrice}, server: ${c.serverPrice})`).join('; ')}`;
          warnings.push(warningMsg);
          // Default policy: accept offline price + log audit conflict (non-blocking)
          await this.db
            .insert(serverSyncConflicts)
            .values({
              tenantId: tenant_id,
              outletId: outlet_id ?? null,
              terminalId: terminal_id,
              localOrderId: item.local_order_id,
              conflictType: ConflictType.PRICE_CHANGED,
              message: warningMsg,
              conflictData: priceConflicts as any,
              resolution: 'auto_resolved',
              resolvedAt: new Date(),
            })
            .catch(() => undefined);
        }

        // ── Phase 10.3: Stock Conflict Detection ──────────────────────────────
        const stockConflicts: Array<{ productId: string; productName: string; requested: number; available: number }> = [];

        for (const orderItem of item.items) {
          const serverProduct = productMap.get(orderItem.product_id);
          if (!serverProduct || !serverProduct.stockTrackingEnabled) continue;
          const available = serverProduct.stockQty ?? 0;
          if (available < orderItem.quantity) {
            stockConflicts.push({
              productId: orderItem.product_id,
              productName: orderItem.product_name,
              requested: orderItem.quantity,
              available,
            });
          }
        }

        if (stockConflicts.length > 0) {
          const warningMsg = `Stok tidak cukup untuk: ${stockConflicts.map(c => `${c.productName} (diminta: ${c.requested}, tersedia: ${c.available})`).join('; ')}`;
          warnings.push(warningMsg);
          // Default policy: allow negative stock (offline sale goes through) + log warning
          await this.db
            .insert(serverSyncConflicts)
            .values({
              tenantId: tenant_id,
              outletId: outlet_id ?? null,
              terminalId: terminal_id,
              localOrderId: item.local_order_id,
              conflictType: ConflictType.STOCK_INSUFFICIENT,
              message: warningMsg,
              conflictData: stockConflicts as any,
              resolution: 'auto_resolved',
              resolvedAt: new Date(),
            })
            .catch(() => undefined);
        }

        // ── Phase 15.2: Table Availability Conflict Detection ─────────────────
        if (item.table_number && occupiedTableNumbers.has(item.table_number)) {
          const tableMsg = `Meja ${item.table_number} sedang terisi. Order offline tetap diproses — tinjau penugasan meja.`;
          warnings.push(tableMsg);
          await this.db
            .insert(serverSyncConflicts)
            .values({
              tenantId: tenant_id,
              outletId: outlet_id ?? null,
              terminalId: terminal_id,
              localOrderId: item.local_order_id,
              conflictType: ConflictType.TABLE_UNAVAILABLE,
              message: tableMsg,
              conflictData: { tableNumber: item.table_number } as any,
              resolution: 'pending',
            })
            .catch(() => undefined);
        }

        // ── Create order + payment ────────────────────────────────────────────
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
          warnings: warnings.length > 0 ? warnings : undefined,
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

        // Keep the pre-fetched stock snapshot current for later conflict checks
        // in this same batch. The actual stock update and movement ledger write
        // are owned by CreateAndPayOrder/deductStockForItems.
        if (!output.idempotent_replay) {
          for (const orderItem of item.items) {
            const serverProduct = productMap.get(orderItem.product_id);
            if (serverProduct?.stockTrackingEnabled) {
              serverProduct.stockQty = (serverProduct.stockQty ?? 0) - orderItem.quantity;
            }
          }
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

      // Audit: insert sync event (non-critical)
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

    // ── Update batch summary ──────────────────────────────────────────────────
    await this.db
      .update(syncBatches)
      .set({ syncedCount: synced, replayedCount: replayed, failedCount: failed, conflictCount: conflicts })
      .where(eq(syncBatches.id, batchId))
      .catch(() => undefined);

    return { batch_id: batchId, processed: orderInputs.length, synced, replayed, failed, conflicts, results };
  }

}
