import type { TransactionContext } from '../../shared/ports/UnitOfWorkPort';
import type { StockContext, StockItem } from '../../inventory/ports/StockMovementPort';

export interface OrderInventoryPort {
  deductStockForItems(tenantId: string, items: StockItem[], context?: StockContext, transaction?: TransactionContext): Promise<void>;
  reverseStockForItems(tenantId: string, items: StockItem[], context?: StockContext, transaction?: TransactionContext): Promise<void>;
}
