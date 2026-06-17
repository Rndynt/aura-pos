import type {
  StockContext,
  StockItem,
  StockMovementPort,
  StockMovementPortOptions,
} from '@pos/application/inventory/ports';
import { InsufficientStockError } from '@pos/application/inventory/stockMovements';
import { and, eq, inArray } from 'drizzle-orm';
import { inventoryBalances, inventoryMovements, products } from '@pos/infrastructure/db/schema';
import { db, type DbClient } from '../../database';
import { DrizzleUnitOfWork } from '../../unit-of-work';

function aggregateQuantities(items: StockItem[]): Record<string, number> {
  const qtyMap: Record<string, number> = {};
  for (const item of items) {
    if (!item.productId) continue;
    qtyMap[item.productId] = (qtyMap[item.productId] ?? 0) + item.quantity;
  }
  return qtyMap;
}

export class MissingOutletContextError extends Error {
  readonly code = 'OUTLET_CONTEXT_REQUIRED';
  readonly statusCode = 400;

  constructor(readonly productId: string) {
    super(`Outlet context is required for stock-tracked product ${productId}`);
    this.name = 'MissingOutletContextError';
  }
}

export class DrizzleStockMovementRepository implements StockMovementPort {
  constructor(private readonly database = db) {}

  private async withStockClient<T>(
    options: StockMovementPortOptions | undefined,
    work: (client: DbClient) => Promise<T>,
  ): Promise<T> {
    const transaction = DrizzleUnitOfWork.fromContext(options?.transaction);
    if (transaction) return work(transaction);
    return this.database.transaction(async (tx) => work(tx));
  }

  async deductStockForItems(
    tenantId: string,
    items: StockItem[],
    ctx: StockContext = {},
    options: StockMovementPortOptions = {},
  ): Promise<void> {
    const { orderId, orderNumber, outletId, terminalId, paymentId, referenceType, referenceId, metadata } = ctx;
    const { allowNegativeStock = false } = options;
    if (!items.length) return;

    const productIds = [...new Set(items.map((i) => i.productId).filter(Boolean))];
    if (!productIds.length) return;

    await this.withStockClient(options, async (client) => {
      const trackedProducts = await client
        .select({ id: products.id })
        .from(products)
        .where(
          and(
            eq(products.tenantId, tenantId),
            inArray(products.id, productIds),
            eq(products.stockTrackingEnabled, true),
          ),
        );

      if (!trackedProducts.length) return;

      if (!outletId) {
        throw new MissingOutletContextError(trackedProducts[0].id);
      }

      const soldQtyMap = aggregateQuantities(items);

      for (const product of trackedProducts) {
        const soldQty = soldQtyMap[product.id] ?? 0;
        if (soldQty === 0) continue;

        const existing = await client
          .select()
          .from(inventoryBalances)
          .where(
            and(
              eq(inventoryBalances.tenantId, tenantId),
              eq(inventoryBalances.outletId, outletId),
              eq(inventoryBalances.productId, product.id),
            ),
          )
          .for('update')
          .limit(1);

        const before = existing[0]?.quantity ?? 0;
        const after = before - soldQty;

        if (!allowNegativeStock && before < soldQty) {
          throw new InsufficientStockError(product.id, before, soldQty);
        }

        if (existing[0]) {
          await client
            .update(inventoryBalances)
            .set({ quantity: after, updatedAt: new Date() })
            .where(eq(inventoryBalances.id, existing[0].id));
        } else {
          await client
            .insert(inventoryBalances)
            .values({
              tenantId,
              outletId,
              productId: product.id,
              quantity: after,
              updatedAt: new Date(),
            });
        }

        if (after < 0 && allowNegativeStock) {
          console.warn(
            `[stockDeduction] Stock went negative for product ${product.id} at outlet ${outletId}: ${before} - ${soldQty} = ${after}`,
          );
        }

        await client.insert(inventoryMovements).values({
          tenantId,
          productId: product.id,
          orderId: orderId ?? null,
          paymentId: paymentId ?? null,
          referenceType: referenceType ?? 'sale',
          referenceId: referenceId ?? paymentId ?? orderId ?? null,
          metadata: metadata ?? null,
          outletId,
          terminalId: terminalId ?? null,
          movementType: 'SALE',
          quantityDelta: -soldQty,
          quantityBefore: before,
          quantityAfter: after,
          notes: orderNumber ? `Penjualan — Order ${orderNumber}` : 'Penjualan',
        });
      }
    });
  }

  async reverseStockForItems(
    tenantId: string,
    items: StockItem[],
    ctx: StockContext = {},
    options: StockMovementPortOptions = {},
  ): Promise<void> {
    const { orderId, orderNumber, outletId, terminalId, paymentId, referenceType, referenceId, metadata } = ctx;
    if (!items.length) return;

    const productIds = [...new Set(items.map((i) => i.productId).filter(Boolean))];
    if (!productIds.length) return;

    await this.withStockClient(options, async (client) => {
      const trackedProducts = await client
        .select({ id: products.id })
        .from(products)
        .where(
          and(
            eq(products.tenantId, tenantId),
            inArray(products.id, productIds),
            eq(products.stockTrackingEnabled, true),
          ),
        );

      if (!trackedProducts.length) return;

      if (!outletId) {
        throw new MissingOutletContextError(trackedProducts[0].id);
      }

      const returnQtyMap = aggregateQuantities(items);

      for (const product of trackedProducts) {
        const returnQty = returnQtyMap[product.id] ?? 0;
        if (returnQty === 0) continue;

        const existing = await client
          .select()
          .from(inventoryBalances)
          .where(
            and(
              eq(inventoryBalances.tenantId, tenantId),
              eq(inventoryBalances.outletId, outletId),
              eq(inventoryBalances.productId, product.id),
            ),
          )
          .for('update')
          .limit(1);

        const before = existing[0]?.quantity ?? 0;
        const after = before + returnQty;

        if (existing[0]) {
          await client
            .update(inventoryBalances)
            .set({ quantity: after, updatedAt: new Date() })
            .where(eq(inventoryBalances.id, existing[0].id));
        } else {
          await client
            .insert(inventoryBalances)
            .values({
              tenantId,
              outletId,
              productId: product.id,
              quantity: after,
              updatedAt: new Date(),
            });
        }

        await client.insert(inventoryMovements).values({
          tenantId,
          productId: product.id,
          orderId: orderId ?? null,
          paymentId: paymentId ?? null,
          referenceType: referenceType ?? 'return',
          referenceId: referenceId ?? paymentId ?? orderId ?? null,
          metadata: metadata ?? null,
          outletId,
          terminalId: terminalId ?? null,
          movementType: 'RETURN',
          quantityDelta: returnQty,
          quantityBefore: before,
          quantityAfter: after,
          notes: orderNumber ? `Pembatalan — Order ${orderNumber}` : 'Pembatalan order',
        });
      }
    });
  }
}
