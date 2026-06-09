import type {
  StockContext,
  StockItem,
  StockMovementPort,
  StockMovementPortOptions,
} from '@pos/application/inventory/ports';
import { InsufficientStockError } from '@pos/application/inventory/stockMovements';
import { and, eq, gte, inArray, sql } from 'drizzle-orm';
import { inventoryMovements, products } from '@pos/infrastructure/db/schema';
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
          paymentId: paymentId ?? null,
          referenceType: referenceType ?? 'sale',
          referenceId: referenceId ?? paymentId ?? orderId ?? null,
          metadata: metadata ?? null,
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
          paymentId: paymentId ?? null,
          referenceType: referenceType ?? 'return',
          referenceId: referenceId ?? paymentId ?? orderId ?? null,
          metadata: metadata ?? null,
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
}
