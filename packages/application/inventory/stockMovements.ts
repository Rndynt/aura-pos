/**
 * Transaction-aware stock movement contracts and compatibility helpers.
 *
 * Persistence, row locks, stock updates, and inventory movement ledger writes
 * are implemented by an infrastructure adapter behind StockMovementPort.
 */

import type { TransactionContext } from '../shared/ports/UnitOfWorkPort';
import type { StockMovementPort } from './ports/StockMovementPort';

export interface StockItem {
  productId: string;
  quantity: number;
}

export interface StockContext {
  orderId?: string;
  orderNumber?: string;
  /** Tag movement to a specific outlet for per-outlet reporting (global pool remains shared) */
  outletId?: string | null;
  /** Optional terminal/device source metadata for synced/offline movements. */
  terminalId?: string | null;
  /** Payment row that caused this movement, when available. */
  paymentId?: string | null;
  /** Stable reference category for operational traceability. */
  referenceType?: string | null;
  /** External or internal reference value, such as payment transaction ref. */
  referenceId?: string | null;
  /** Additional JSON-safe traceability details for audits/retries. */
  metadata?: Record<string, unknown> | null;
}

export interface StockMovementOptions {
  /** Reuse the caller's transaction so order/payment/stock changes commit atomically. */
  tx?: TransactionContext;
  /** Defaults to false for online order flows to prevent overselling tracked products. */
  allowNegativeStock?: boolean;
}

export class InsufficientStockError extends Error {
  readonly code = 'INSUFFICIENT_STOCK';
  readonly statusCode = 409;

  constructor(
    readonly productId: string,
    readonly availableQuantity: number,
    readonly requestedQuantity: number,
  ) {
    super(
      `Insufficient stock for product ${productId}. Available: ${availableQuantity}, requested: ${requestedQuantity}`,
    );
    this.name = 'InsufficientStockError';
  }
}

let defaultStockMovementPort: StockMovementPort | undefined;

export function configureStockMovementPort(port: StockMovementPort): void {
  defaultStockMovementPort = port;
}

function getStockMovementPort(): StockMovementPort {
  if (!defaultStockMovementPort) {
    throw new Error('Stock movement port has not been configured');
  }
  return defaultStockMovementPort;
}

export async function deductStockForItems(
  tenantId: string,
  items: StockItem[],
  ctx: StockContext = {},
  options: StockMovementOptions = {},
): Promise<void> {
  return getStockMovementPort().deductStockForItems(tenantId, items, ctx, {
    transaction: options.tx,
    allowNegativeStock: options.allowNegativeStock,
  });
}

export async function reverseStockForItems(
  tenantId: string,
  items: StockItem[],
  ctx: StockContext = {},
  options: StockMovementOptions = {},
): Promise<void> {
  return getStockMovementPort().reverseStockForItems(tenantId, items, ctx, {
    transaction: options.tx,
    allowNegativeStock: options.allowNegativeStock,
  });
}
