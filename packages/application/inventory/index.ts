export {
  deductStockForItems,
  reverseStockForItems,
  InsufficientStockError,
  configureStockMovementPort,
  type StockContext,
  type StockItem,
  type StockMovementOptions,
} from './stockMovements';
export {
  resolveInventoryPolicy,
  configureInventoryPolicyPort,
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
  configureInventorySyncErrorPort,
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
  InventoryMovementWriterPort,
  RecordMovementInput,
  MovementRecord,
} from './ports';
export {
  createOpname,
  updateOpnameItem,
  submitOpname,
  approveOpname,
  cancelOpname,
  OpnameNotFoundError,
  OpnameStatusError,
  type OpnameDeps,
} from './opname';
export {
  createTransfer,
  submitTransfer,
  receiveTransfer,
  cancelTransfer,
  TransferNotFoundError,
  TransferStatusError,
  TransferSameOutletError,
  InsufficientTransferStockError,
  type TransferDeps,
} from './transfer';
