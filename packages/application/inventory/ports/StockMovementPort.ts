import type { TransactionContext } from '../../shared/ports/UnitOfWorkPort';

export interface StockItem {
  productId: string;
  quantity: number;
}

export interface StockContext {
  orderId?: string;
  orderNumber?: string;
  outletId?: string | null;
  terminalId?: string | null;
}

export interface StockMovementPort {
  deductStockForItems(tenantId: string, items: StockItem[], context?: StockContext, transaction?: TransactionContext): Promise<void>;
  reverseStockForItems(tenantId: string, items: StockItem[], context?: StockContext, transaction?: TransactionContext): Promise<void>;
}
