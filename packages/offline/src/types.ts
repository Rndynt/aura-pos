export type SyncStatus = "local_only" | "pending_sync" | "syncing" | "synced" | "failed" | "conflict" | "cancelled";

export type TerminalIdentity = {
  terminalId: string;
  tenantId: string;
  terminalName: string;
  createdAt: string;
  updatedAt: string;
};

export type LocalProduct = { id: string; tenantId: string; name: string; basePrice: number; isActive: boolean; syncStatus: SyncStatus; updatedAt: string };
export type LocalOrder = { localId: string; serverId?: string; tenantId: string; terminalId: string; localOrderNumber: string; serverOrderNumber?: string; status: string; paymentStatus: string; syncStatus: SyncStatus; idempotencyKey: string; createdAtLocal: string; syncedAt?: string };
export type LocalOrderItem = { id: string; localOrderId: string; tenantId: string; productId: string; productName: string; quantity: number; unitPrice: number; syncStatus: SyncStatus };
export type LocalPayment = { id: string; localOrderId: string; tenantId: string; amount: number; method: "CASH" | "MANUAL_TRANSFER" | "MANUAL_QRIS"; idempotencyKey: string; syncStatus: SyncStatus; createdAtLocal: string };
export type LocalPrintJob = { id: string; tenantId: string; terminalId: string; localOrderId?: string; serverOrderId?: string; orderNumber?: string; type: "receipt" | "kitchen"; payload: unknown; syncStatus: SyncStatus; status: "pending" | "printing" | "printed" | "failed" | "cancelled"; retryCount: number; lastError?: string; printedAt?: string; createdAt: string; updatedAt: string };
export type SyncOutboxItem = { id: string; tenantId: string; terminalId: string; entityType: "order" | "payment" | "order_status" | "print_job" | "table_status"; operation: "create" | "update" | "delete"; localEntityId: string; endpoint: string; method: "POST" | "PATCH" | "PUT" | "DELETE"; payload: unknown; idempotencyKey: string; status: "pending" | "syncing" | "synced" | "failed" | "conflict"; attemptCount: number; lastError?: string; createdAt: string; updatedAt: string; nextRetryAt?: string };
export type SyncConflict = { id: string; tenantId: string; localEntityId: string; conflictType: string; message: string; syncStatus: SyncStatus; createdAt: string };

export type LocalTable = {
  id: string;
  tenantId: string;
  tableNumber: string;
  tableName?: string;
  floor?: string;
  capacity?: number;
  status: "available" | "occupied" | "reserved" | "unknown";
  currentOrderId?: string;
  syncStatus: SyncStatus;
  updatedAt: string;
  rawData?: unknown;
};

export type KitchenTicketStatus = "confirmed" | "preparing" | "ready" | "served";

export type LocalKitchenItem = {
  productId: string;
  name: string;
  quantity: number;
  variantName?: string;
  notes?: string;
};

export type LocalKitchenTicket = {
  id: string;
  tenantId: string;
  terminalId: string;
  localOrderId: string;
  serverOrderId?: string;
  orderNumber: string;
  status: KitchenTicketStatus;
  syncStatus: SyncStatus;
  items: LocalKitchenItem[];
  customerName?: string;
  tableNumber?: string;
  orderTypeName?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
};