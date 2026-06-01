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

export interface StockContext {
  orderId?: string;
  orderNumber?: string;
  /** Tag movement to a specific outlet for per-outlet reporting (global pool remains shared) */
  outletId?: string | null;
}

/**
 * Deducts stock for each tracked item.
 * Call after order is confirmed.
 * outletId is recorded on the movement for per-outlet sales reporting,
 * but stock itself is a global shared pool across all outlets.
 */
export async function deductStockForItems(
  tenantId: string,
  items: StockItem[],
  ctx: StockContext = {},
): Promise<void> {
  const { orderId, orderNumber, outletId } = ctx;
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

  // Batch lock all tracked products in a single SELECT FOR UPDATE
  const productIdsForLock = trackedProducts.map(p => p.id);
  const lockedProducts = await db
    .select({ id: products.id, stockQty: products.stockQty })
    .from(products)
    .where(and(
      eq(products.tenantId, tenantId),
      inArray(products.id, productIdsForLock),
    ))
    .for('update');

  const lockedMap = new Map(lockedProducts.map(p => [p.id, p]));

  for (const product of trackedProducts) {
    const soldQty = soldQtyMap[product.id] ?? 0;
    if (soldQty === 0) continue;

    const locked = lockedMap.get(product.id);
    if (!locked) continue;

    const before = locked.stockQty ?? 0;
    const after = before - soldQty;

    if (after < 0) {
      console.warn(`[stockDeduction] Stock would go negative for product ${product.id}: ${before} - ${soldQty} = ${after}. Proceeding with deduction.`);
    }

    await db
      .update(products)
      .set({ stockQty: after, updatedAt: new Date() })
      .where(and(eq(products.id, product.id), eq(products.tenantId, tenantId)));

    await db.insert(inventoryMovements).values({
      tenantId,
      productId: product.id,
      orderId: orderId ?? null,
      outletId: outletId ?? null,
      movementType: 'SALE',
      quantityDelta: -soldQty,
      quantityBefore: before,
      quantityAfter: after,
      notes: orderNumber ? `Penjualan — Order ${orderNumber}` : 'Penjualan',
    }).catch((err) => {
      console.error(`[stockDeduction] Failed to record inventory movement for product ${product.id}:`, err);
    });
  }
}

/**
 * Restores stock for each tracked item.
 * Call after order is cancelled (only when the order was already in a
 * post-confirmation state so stock was previously deducted).
 * outletId is tagged on the movement for reporting consistency.
 */
export async function reverseStockForItems(
  tenantId: string,
  items: StockItem[],
  ctx: StockContext = {},
): Promise<void> {
  const { orderId, orderNumber, outletId } = ctx;
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

  // Batch lock all tracked products in a single SELECT FOR UPDATE
  const productIdsForLock = trackedProducts.map(p => p.id);
  const lockedProducts = await db
    .select({ id: products.id, stockQty: products.stockQty })
    .from(products)
    .where(and(
      eq(products.tenantId, tenantId),
      inArray(products.id, productIdsForLock),
    ))
    .for('update');

  const lockedMap = new Map(lockedProducts.map(p => [p.id, p]));

  for (const product of trackedProducts) {
    const returnQty = qtyMap[product.id] ?? 0;
    if (returnQty === 0) continue;

    const locked = lockedMap.get(product.id);
    if (!locked) continue;

    const before = locked.stockQty ?? 0;
    const after = before + returnQty;

    await db
      .update(products)
      .set({ stockQty: after, updatedAt: new Date() })
      .where(and(eq(products.id, product.id), eq(products.tenantId, tenantId)));

    await db.insert(inventoryMovements).values({
      tenantId,
      productId: product.id,
      orderId: orderId ?? null,
      outletId: outletId ?? null,
      movementType: 'RETURN',
      quantityDelta: returnQty,
      quantityBefore: before,
      quantityAfter: after,
      notes: orderNumber ? `Pembatalan Order ${orderNumber}` : 'Pembatalan order',
    }).catch((err) => {
      console.error(`[stockDeduction] Failed to record return movement for product ${product.id}:`, err);
    });
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
  'completed',
]);
