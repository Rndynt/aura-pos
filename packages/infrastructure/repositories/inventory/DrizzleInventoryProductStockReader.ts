import type { ProductStockReaderPort, TrackedProductStockRecord, OutletContextPort } from '@pos/application/inventory';
import type { TransactionContext } from '@pos/application/shared/ports/UnitOfWorkPort';
import { and, asc, eq } from 'drizzle-orm';
import { outlets, products } from '@pos/infrastructure/db/schema';
import { db, type DbClient } from '../../database';
import { DrizzleUnitOfWork } from '../../unit-of-work';

function getClient(ctx?: TransactionContext): DbClient {
  return DrizzleUnitOfWork.fromContext(ctx) ?? db;
}

export class DrizzleInventoryProductStockReader implements ProductStockReaderPort {
  async getTrackedProductStock(tenantId: string, productId: string, ctx?: TransactionContext): Promise<TrackedProductStockRecord | null> {
    const client = getClient(ctx);
    const [row] = await client
      .select({ id: products.id, tenantId: products.tenantId, stockTrackingEnabled: products.stockTrackingEnabled })
      .from(products)
      .where(and(eq(products.id, productId), eq(products.tenantId, tenantId), eq(products.stockTrackingEnabled, true)))
      .limit(1);
    return row ?? null;
  }

  async listTrackedProductStocks(tenantId: string, ctx?: TransactionContext): Promise<TrackedProductStockRecord[]> {
    const client = getClient(ctx);
    return client
      .select({ id: products.id, tenantId: products.tenantId, stockTrackingEnabled: products.stockTrackingEnabled })
      .from(products)
      .where(and(eq(products.tenantId, tenantId), eq(products.stockTrackingEnabled, true)))
      .orderBy(asc(products.category), asc(products.name));
  }
}

export class DrizzleOutletContextRepository implements OutletContextPort {
  async isDefaultOutlet(tenantId: string, outletId: string, ctx?: TransactionContext): Promise<boolean> {
    const client = getClient(ctx);
    const [row] = await client
      .select({ isDefault: outlets.isDefault })
      .from(outlets)
      .where(and(eq(outlets.id, outletId), eq(outlets.tenantId, tenantId), eq(outlets.isActive, true)))
      .limit(1);
    return row?.isDefault ?? false;
  }
}
