/**
 * Stock Deduction Helper
 *
 * Centralises the logic for reducing / restoring stockQty on the products table
 * when an order is confirmed or cancelled.
 *
 * Design rules:
 *   - Stock decreases when an order transitions DRAFT → CONFIRMED
 *   - Stock is restored when a confirmed (or later) order is CANCELLED
 *   - Payment status has no bearing on stock — that is a financial concern
 *   - Only products with stockTrackingEnabled = true are touched
 *   - Movements are recorded for audit (best-effort, non-fatal)
 */

import { db } from '@pos/infrastructure/database';
import { products, inventoryMovements } from '@shared/schema';
import { eq, and, inArray } from 'drizzle-orm';

export interface StockItem {
  productId: string;
  quantity: number;
}

/**
 * Deducts stock for each tracked item.
 * Call after order is confirmed.
 */
export async function deductStockForItems(
  tenantId: string,
  items: StockItem[],
  orderId?: string,
  orderNumber?: string,
): Promise<void> {
  if (!items.length) return;

  const productIds = [...new Set(items.map((i) => i.productId).filter(Boolean))];
  if (!productIds.length) return;

  const trackedProducts = await db
    .select({ id: products.id, stockQty: products.stockQty })
    .from(products)
    .where(
      and(
        eq(products.tenantId, tenantId),
        inArray(products.id, productIds),
        eq(products.stockTrackingEnabled, true),
      ),
    );

  if (!trackedProducts.length) return;

  const soldQtyMap: Record<string, number> = {};
  for (const item of items) {
    if (item.productId) {
      soldQtyMap[item.productId] = (soldQtyMap[item.productId] ?? 0) + item.quantity;
    }
  }

  for (const product of trackedProducts) {
    const soldQty = soldQtyMap[product.id] ?? 0;
    if (soldQty === 0) continue;

    const before = product.stockQty ?? 0;
    const after = before - soldQty;

    await db
      .update(products)
      .set({ stockQty: after, updatedAt: new Date() })
      .where(and(eq(products.id, product.id), eq(products.tenantId, tenantId)));

    await db.insert(inventoryMovements).values({
      tenantId,
      productId: product.id,
      orderId: orderId ?? null,
      movementType: 'SALE',
      quantityDelta: -soldQty,
      quantityBefore: before,
      quantityAfter: after,
      notes: orderNumber ? `Penjualan — Order ${orderNumber}` : 'Penjualan',
    }).catch(() => {});
  }
}

/**
 * Restores stock for each tracked item.
 * Call after order is cancelled (only when the order was already in a
 * post-confirmation state so stock was previously deducted).
 */
export async function reverseStockForItems(
  tenantId: string,
  items: StockItem[],
  orderId?: string,
  orderNumber?: string,
): Promise<void> {
  if (!items.length) return;

  const productIds = [...new Set(items.map((i) => i.productId).filter(Boolean))];
  if (!productIds.length) return;

  const trackedProducts = await db
    .select({ id: products.id, stockQty: products.stockQty })
    .from(products)
    .where(
      and(
        eq(products.tenantId, tenantId),
        inArray(products.id, productIds),
        eq(products.stockTrackingEnabled, true),
      ),
    );

  if (!trackedProducts.length) return;

  const qtyMap: Record<string, number> = {};
  for (const item of items) {
    if (item.productId) {
      qtyMap[item.productId] = (qtyMap[item.productId] ?? 0) + item.quantity;
    }
  }

  for (const product of trackedProducts) {
    const returnQty = qtyMap[product.id] ?? 0;
    if (returnQty === 0) continue;

    const before = product.stockQty ?? 0;
    const after = before + returnQty;

    await db
      .update(products)
      .set({ stockQty: after, updatedAt: new Date() })
      .where(and(eq(products.id, product.id), eq(products.tenantId, tenantId)));

    await db.insert(inventoryMovements).values({
      tenantId,
      productId: product.id,
      orderId: orderId ?? null,
      movementType: 'RETURN',
      quantityDelta: returnQty,
      quantityBefore: before,
      quantityAfter: after,
      notes: orderNumber ? `Pembatalan Order ${orderNumber}` : 'Pembatalan order',
    }).catch(() => {});
  }
}

/**
 * States where stock has already been deducted.
 * If a cancellation originates from one of these states, stock must be reversed.
 */
export const STOCK_DEDUCTED_STATES = new Set([
  'confirmed',
  'in_progress',
  'preparing',
  'ready',
  'served',
]);
