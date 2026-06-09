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
  paymentId?: string | null;
  referenceType?: string | null;
  referenceId?: string | null;
  metadata?: Record<string, unknown> | null;
}

export interface StockMovementPortOptions {
  transaction?: TransactionContext;
  allowNegativeStock?: boolean;
}

export interface StockMovementPort {
  deductStockForItems(
    tenantId: string,
    items: StockItem[],
    context?: StockContext,
    options?: StockMovementPortOptions,
  ): Promise<void>;
  reverseStockForItems(
    tenantId: string,
    items: StockItem[],
    context?: StockContext,
    options?: StockMovementPortOptions,
  ): Promise<void>;
}
