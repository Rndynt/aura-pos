/**
 * Transaction-aware stock movement helpers.
 *
 * These helpers keep product stock updates and inventory_movements ledger rows in
 * the same database client/transaction. When no transaction is supplied, the
 * exported functions open one so SELECT ... FOR UPDATE, product updates, and
 * ledger inserts are still atomic as a unit.
 */

import type { DbClient } from '@pos/infrastructure/database';
import { db } from '@pos/infrastructure/database';
import { inventoryMovements, products } from '../../../shared/schema';
import { and, eq, inArray, sql, gte } from 'drizzle-orm';

export interface StockItem {
  productId: string;
  quantity: number;
}

export interface StockContext {
  orderId?: string;
  orderNumber?: string;
  /** Tag movement to a specific outlet for per-outlet reporting (global pool remains shared) */
  outletId?: string | null;
  /** Optional terminal/device source metadata for synced/offline movements. */
  terminalId?: string | null;
}

export interface StockMovementOptions {
  /** Reuse the caller's transaction so order/payment/stock changes commit atomically. */
  tx?: DbClient;
  /** Defaults to false for online order flows to prevent overselling tracked products. */
  allowNegativeStock?: boolean;
}

export class InsufficientStockError extends Error {
  readonly code = 'INSUFFICIENT_STOCK';
  readonly statusCode = 409;

  constructor(
    readonly productId: string,
    readonly availableQuantity: number,
    readonly requestedQuantity: number,
  ) {
    super(
      `Insufficient stock for product ${productId}. Available: ${availableQuantity}, requested: ${requestedQuantity}`,
    );
    this.name = 'InsufficientStockError';
  }
}

async function withStockClient<T>(
  tx: DbClient | undefined,
  work: (client: DbClient) => Promise<T>,
): Promise<T> {
  if (tx) return work(tx);
  return db.transaction(async (transaction) => work(transaction));
}

function aggregateQuantities(items: StockItem[]): Record<string, number> {
  const qtyMap: Record<string, number> = {};
  for (const item of items) {
    if (!item.productId) continue;
    qtyMap[item.productId] = (qtyMap[item.productId] ?? 0) + item.quantity;
  }
  return qtyMap;
}

/**
 * Deducts stock for tracked products and writes SALE inventory movements.
 * The lock, stock update, and movement insert all use the same transaction.
 */
export async function deductStockForItems(
  tenantId: string,
  items: StockItem[],
  ctx: StockContext = {},
  options: StockMovementOptions = {},
): Promise<void> {
  const { orderId, orderNumber, outletId, terminalId } = ctx;
  const { allowNegativeStock = false } = options;
  if (!items.length) return;

  const productIds = [...new Set(items.map((i) => i.productId).filter(Boolean))];
  if (!productIds.length) return;

  await withStockClient(options.tx, async (client) => {
    const lockedProducts = await client
      .select({ id: products.id, stockQty: products.stockQty })
      .from(products)
      .where(
        and(
          eq(products.tenantId, tenantId),
          inArray(products.id, productIds),
          eq(products.stockTrackingEnabled, true),
        ),
      )
      .for('update');

    if (!lockedProducts.length) return;

    const soldQtyMap = aggregateQuantities(items);

    for (const product of lockedProducts) {
      const soldQty = soldQtyMap[product.id] ?? 0;
      if (soldQty === 0) continue;

      const before = product.stockQty ?? 0;
      const after = before - soldQty;

      if (!allowNegativeStock && before < soldQty) {
        // This mirrors the conditional UPDATE guard below and gives callers a
        // deterministic domain error before any ledger row is inserted.
        throw new InsufficientStockError(product.id, before, soldQty);
      }

      const updateWhere = allowNegativeStock
        ? and(eq(products.id, product.id), eq(products.tenantId, tenantId))
        : and(
            eq(products.id, product.id),
            eq(products.tenantId, tenantId),
            gte(products.stockQty, soldQty),
          );

      const updatedProducts = await client
        .update(products)
        .set({
          stockQty: sql`${products.stockQty} - ${soldQty}`,
          updatedAt: new Date(),
        })
        .where(updateWhere)
        .returning({ stockQty: products.stockQty });

      if (!updatedProducts[0]) {
        throw new InsufficientStockError(product.id, before, soldQty);
      }

      const quantityAfter = updatedProducts[0].stockQty ?? after;
      if (quantityAfter < 0 && allowNegativeStock) {
        console.warn(
          `[stockDeduction] Stock went negative for product ${product.id}: ${before} - ${soldQty} = ${quantityAfter}`,
        );
      }

      await client.insert(inventoryMovements).values({
        tenantId,
        productId: product.id,
        orderId: orderId ?? null,
        outletId: outletId ?? null,
        terminalId: terminalId ?? null,
        movementType: 'SALE',
        quantityDelta: -soldQty,
        quantityBefore: before,
        quantityAfter,
        notes: orderNumber ? `Penjualan — Order ${orderNumber}` : 'Penjualan',
      });
    }
  });
}

/**
 * Restores stock for tracked products and writes RETURN inventory movements.
 * The lock, stock update, and movement insert all use the same transaction.
 */
export async function reverseStockForItems(
  tenantId: string,
  items: StockItem[],
  ctx: StockContext = {},
  options: StockMovementOptions = {},
): Promise<void> {
  const { orderId, orderNumber, outletId, terminalId } = ctx;
  if (!items.length) return;

  const productIds = [...new Set(items.map((i) => i.productId).filter(Boolean))];
  if (!productIds.length) return;

  await withStockClient(options.tx, async (client) => {
    const lockedProducts = await client
      .select({ id: products.id, stockQty: products.stockQty })
      .from(products)
      .where(
        and(
          eq(products.tenantId, tenantId),
          inArray(products.id, productIds),
          eq(products.stockTrackingEnabled, true),
        ),
      )
      .for('update');

    if (!lockedProducts.length) return;

    const returnQtyMap = aggregateQuantities(items);

    for (const product of lockedProducts) {
      const returnQty = returnQtyMap[product.id] ?? 0;
      if (returnQty === 0) continue;

      const before = product.stockQty ?? 0;
      const updatedProducts = await client
        .update(products)
        .set({
          stockQty: sql`${products.stockQty} + ${returnQty}`,
          updatedAt: new Date(),
        })
        .where(and(eq(products.id, product.id), eq(products.tenantId, tenantId)))
        .returning({ stockQty: products.stockQty });

      const quantityAfter = updatedProducts[0]?.stockQty ?? before + returnQty;

      await client.insert(inventoryMovements).values({
        tenantId,
        productId: product.id,
        orderId: orderId ?? null,
        outletId: outletId ?? null,
        terminalId: terminalId ?? null,
        movementType: 'RETURN',
        quantityDelta: returnQty,
        quantityBefore: before,
        quantityAfter,
        notes: orderNumber ? `Pembatalan — Order ${orderNumber}` : 'Pembatalan order',
      });
    }
  });
}
