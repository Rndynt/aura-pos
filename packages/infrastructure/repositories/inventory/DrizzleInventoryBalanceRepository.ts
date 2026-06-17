import type {
  InventoryBalanceRecord,
  InventoryBalanceRepositoryPort,
  UpsertBalanceInput,
  SetBalanceInput,
} from '@pos/application/inventory/ports';
import { and, eq, sql } from 'drizzle-orm';
import { inventoryBalances, products } from '@pos/infrastructure/db/schema';
import { db, type DbClient } from '../../database';
import { DrizzleUnitOfWork } from '../../unit-of-work';
import type { TransactionContext } from '@pos/application/shared/ports/UnitOfWorkPort';

const DEFAULT_LOW_STOCK_THRESHOLD = 10;

function mapRow(row: typeof inventoryBalances.$inferSelect): InventoryBalanceRecord {
  return {
    id: row.id,
    tenantId: row.tenantId,
    outletId: row.outletId,
    productId: row.productId,
    quantity: row.quantity,
    reservedQuantity: row.reservedQuantity,
    lowStockThreshold: row.lowStockThreshold ?? null,
    lastMovementId: row.lastMovementId ?? null,
    lastCountedAt: row.lastCountedAt ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function getClient(ctx?: TransactionContext): DbClient {
  return DrizzleUnitOfWork.fromContext(ctx) ?? db;
}

/**
 * Keep products.stock_qty in sync with inventory_balances.quantity for
 * backward compatibility with basic stock (which reads products.stock_qty).
 */
async function syncProductStockQty(
  client: DbClient,
  tenantId: string,
  productId: string,
  quantity: number,
): Promise<void> {
  await client
    .update(products)
    .set({ stockQty: quantity, updatedAt: new Date() })
    .where(and(eq(products.id, productId), eq(products.tenantId, tenantId)));
}

export class DrizzleInventoryBalanceRepository implements InventoryBalanceRepositoryPort {
  async getBalance(
    tenantId: string,
    outletId: string,
    productId: string,
    ctx?: TransactionContext,
  ): Promise<InventoryBalanceRecord | null> {
    const client = getClient(ctx);
    const [row] = await client
      .select()
      .from(inventoryBalances)
      .where(
        and(
          eq(inventoryBalances.tenantId, tenantId),
          eq(inventoryBalances.outletId, outletId),
          eq(inventoryBalances.productId, productId),
        ),
      )
      .limit(1);
    return row ? mapRow(row) : null;
  }

  async listBalances(
    tenantId: string,
    outletId: string,
    ctx?: TransactionContext,
  ): Promise<InventoryBalanceRecord[]> {
    const client = getClient(ctx);
    const rows = await client
      .select()
      .from(inventoryBalances)
      .where(
        and(
          eq(inventoryBalances.tenantId, tenantId),
          eq(inventoryBalances.outletId, outletId),
        ),
      );
    return rows.map(mapRow);
  }

  async applyDelta(
    input: UpsertBalanceInput,
    ctx?: TransactionContext,
  ): Promise<InventoryBalanceRecord> {
    const { tenantId, outletId, productId, quantityDelta, lastMovementId } = input;

    const work = async (client: DbClient): Promise<InventoryBalanceRecord> => {
      const existing = await client
        .select()
        .from(inventoryBalances)
        .where(
          and(
            eq(inventoryBalances.tenantId, tenantId),
            eq(inventoryBalances.outletId, outletId),
            eq(inventoryBalances.productId, productId),
          ),
        )
        .for('update')
        .limit(1);

      let result: InventoryBalanceRecord;

      if (existing.length === 0) {
        const [inserted] = await client
          .insert(inventoryBalances)
          .values({
            tenantId,
            outletId,
            productId,
            quantity: Math.max(0, quantityDelta),
            lastMovementId: lastMovementId ?? null,
            updatedAt: new Date(),
          })
          .returning();
        result = mapRow(inserted);
      } else {
        const newQty = existing[0].quantity + quantityDelta;
        const [updated] = await client
          .update(inventoryBalances)
          .set({
            quantity: newQty,
            lastMovementId: lastMovementId ?? existing[0].lastMovementId,
            updatedAt: new Date(),
          })
          .where(eq(inventoryBalances.id, existing[0].id))
          .returning();
        result = mapRow(updated);
      }

      await syncProductStockQty(client, tenantId, productId, result.quantity);
      return result;
    };

    const txClient = DrizzleUnitOfWork.fromContext(ctx);
    if (txClient) return work(txClient);
    return db.transaction(work);
  }

  async setQuantity(
    input: SetBalanceInput,
    ctx?: TransactionContext,
  ): Promise<InventoryBalanceRecord> {
    const { tenantId, outletId, productId, quantity, lastMovementId, lastCountedAt } = input;

    const work = async (client: DbClient): Promise<InventoryBalanceRecord> => {
      const [upserted] = await client
        .insert(inventoryBalances)
        .values({
          tenantId,
          outletId,
          productId,
          quantity,
          lastMovementId: lastMovementId ?? null,
          lastCountedAt: lastCountedAt ?? null,
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: [inventoryBalances.tenantId, inventoryBalances.outletId, inventoryBalances.productId],
          set: {
            quantity,
            lastMovementId: lastMovementId ?? sql`excluded.last_movement_id`,
            lastCountedAt: lastCountedAt ?? sql`excluded.last_counted_at`,
            updatedAt: new Date(),
          },
        })
        .returning();

      const result = mapRow(upserted);
      await syncProductStockQty(client, tenantId, productId, result.quantity);
      return result;
    };

    const txClient = DrizzleUnitOfWork.fromContext(ctx);
    if (txClient) return work(txClient);
    return db.transaction(work);
  }

  async setThreshold(
    tenantId: string,
    outletId: string,
    productId: string,
    threshold: number | null,
    ctx?: TransactionContext,
  ): Promise<InventoryBalanceRecord | null> {
    const client = getClient(ctx);

    const existing = await client
      .select({ id: inventoryBalances.id })
      .from(inventoryBalances)
      .where(
        and(
          eq(inventoryBalances.tenantId, tenantId),
          eq(inventoryBalances.outletId, outletId),
          eq(inventoryBalances.productId, productId),
        ),
      )
      .limit(1);

    if (existing.length === 0) {
      const [inserted] = await client
        .insert(inventoryBalances)
        .values({
          tenantId,
          outletId,
          productId,
          quantity: 0,
          lowStockThreshold: threshold,
          updatedAt: new Date(),
        })
        .returning();
      return mapRow(inserted);
    }

    const [updated] = await client
      .update(inventoryBalances)
      .set({ lowStockThreshold: threshold, updatedAt: new Date() })
      .where(eq(inventoryBalances.id, existing[0].id))
      .returning();
    return updated ? mapRow(updated) : null;
  }

  async listLowStock(
    tenantId: string,
    outletId: string,
    defaultThreshold = DEFAULT_LOW_STOCK_THRESHOLD,
    ctx?: TransactionContext,
  ): Promise<InventoryBalanceRecord[]> {
    const client = getClient(ctx);
    const rows = await client
      .select()
      .from(inventoryBalances)
      .where(
        and(
          eq(inventoryBalances.tenantId, tenantId),
          eq(inventoryBalances.outletId, outletId),
          sql`${inventoryBalances.quantity} <= COALESCE(${inventoryBalances.lowStockThreshold}, ${defaultThreshold})`,
        ),
      );
    return rows.map(mapRow);
  }
}
