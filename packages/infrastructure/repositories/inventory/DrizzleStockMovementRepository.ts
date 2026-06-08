import type { StockContext, StockItem, StockMovementPort } from '@pos/application/inventory/ports';
import { deductStockForItems, reverseStockForItems } from '@pos/application/inventory/stockMovements';
import type { TransactionContext } from '@pos/application/shared/ports';
import { DrizzleUnitOfWork } from '../../unit-of-work';

export class DrizzleStockMovementRepository implements StockMovementPort {
  async deductStockForItems(
    tenantId: string,
    items: StockItem[],
    context: StockContext = {},
    transaction?: TransactionContext,
  ): Promise<void> {
    return deductStockForItems(tenantId, items, context, { tx: DrizzleUnitOfWork.fromContext(transaction) });
  }

  async reverseStockForItems(
    tenantId: string,
    items: StockItem[],
    context: StockContext = {},
    transaction?: TransactionContext,
  ): Promise<void> {
    return reverseStockForItems(tenantId, items, context, { tx: DrizzleUnitOfWork.fromContext(transaction) });
  }
}
