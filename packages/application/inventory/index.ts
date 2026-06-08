export {
  deductStockForItems,
  reverseStockForItems,
  InsufficientStockError,
  type StockContext,
  type StockItem,
  type StockMovementOptions,
} from './stockMovements';
export {
  resolveInventoryPolicy,
  type InventoryPolicyResult,
  type InventoryStockPolicy,
} from './inventoryPolicy';
export {
  errorMessage,
  listDueInventorySyncErrors,
  markInventorySyncErrorFailed,
  markInventorySyncErrorResolved,
  markInventorySyncErrorRetrying,
  recordInventorySyncError,
  type InventorySyncErrorPayload,
  type InventorySyncErrorStatus,
  type InventorySyncOperation,
} from './inventorySyncErrors';
export type {
  InventoryPolicyPort,
  InventorySyncErrorPort,
  InventorySyncErrorRecord,
  RecordInventorySyncErrorInput,
  StockContext as InventoryPortStockContext,
  StockItem as InventoryPortStockItem,
  StockMovementPort,
} from './ports';
