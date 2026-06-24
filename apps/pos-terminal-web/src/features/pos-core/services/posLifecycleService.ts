import type { OrderLifecycleDto } from "@pos/domain/orders";

export type POSLifecycleOrder = OrderLifecycleDto & {
  id: string;
  orderNumber?: string;
  order_number?: string;
  tableNumber?: string;
  table_number?: string;
  customerName?: string;
  customer_name?: string;
  total?: string | number;
  total_amount?: string | number;
  paidAmount?: string | number;
  paid_amount?: string | number;
  status?: string;
  paymentStatus?: string;
  payment_status?: string;
  items?: Array<{ status?: string }>;
  orderItems?: Array<{ status?: string }>;
  hasKitchenTicket?: boolean;
  isEditableDraft?: boolean;
  isActiveOrder?: boolean;
  isKitchenLocked?: boolean;
  allowedActions?: string[];
};

const ACTIVE_STATUSES = new Set(["confirmed", "preparing", "ready", "served"]);
const FIRED_ITEM_STATUSES = new Set(["preparing", "ready", "delivered"]);

export function getOrderPaymentStatus(order: POSLifecycleOrder): string {
  return String(
    order.paymentStatus ?? order.payment_status ?? "unpaid",
  ).toLowerCase();
}

export function hasFiredKitchenItems(order: POSLifecycleOrder): boolean {
  const items = order.items ?? order.orderItems ?? [];
  return items.some((item) =>
    FIRED_ITEM_STATUSES.has(String(item.status ?? "").toLowerCase()),
  );
}

export function isKitchenLocked(order: POSLifecycleOrder): boolean {
  return (
    order.isKitchenLocked === true ||
    order.hasKitchenTicket === true ||
    hasFiredKitchenItems(order)
  );
}

export function isTrueServerDraft(order: POSLifecycleOrder): boolean {
  return (
    order.isEditableDraft === true ||
    (String(order.status ?? "").toLowerCase() === "draft" &&
      getOrderPaymentStatus(order) === "unpaid" &&
      !isKitchenLocked(order))
  );
}

export function isActivePOSOrder(order: POSLifecycleOrder): boolean {
  if (order.isActiveOrder === true) return true;
  const status = String(order.status ?? "").toLowerCase();
  const paymentStatus = getOrderPaymentStatus(order);
  return (
    ACTIVE_STATUSES.has(status) &&
    (paymentStatus === "unpaid" || paymentStatus === "partial")
  );
}

export function getActiveOrderStatusLabel(order: POSLifecycleOrder): string {
  if (isKitchenLocked(order)) return "Sedang diproses dapur";
  switch (String(order.status ?? "").toLowerCase()) {
    case "ready":
      return "Siap disajikan";
    case "served":
      return "Sudah disajikan";
    default:
      return "Tagihan aktif";
  }
}

export function orderAllowsAction(order: POSLifecycleOrder, action: string): boolean {
  return Array.isArray(order.allowedActions) && order.allowedActions.includes(action);
}

export function canContinueServerDraft(order: POSLifecycleOrder): boolean {
  return orderAllowsAction(order, "CONTINUE_DRAFT") || isTrueServerDraft(order);
}

export function canCancelServerDraft(order: POSLifecycleOrder): boolean {
  return orderAllowsAction(order, "CANCEL_DRAFT") || isTrueServerDraft(order);
}

export function canPayActiveOrder(order: POSLifecycleOrder): boolean {
  return orderAllowsAction(order, "PAY_ACTIVE_ORDER") || isActivePOSOrder(order);
}

export function readOrderAmount(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const amount = Number(value);
  return Number.isFinite(amount) ? amount : null;
}

export function getOrderTotalAmount(order: POSLifecycleOrder): number | null {
  return readOrderAmount(order.total ?? order.total_amount);
}

export function getOrderPaidAmount(order: POSLifecycleOrder): number {
  return readOrderAmount(order.paidAmount ?? order.paid_amount) ?? 0;
}

export function getOrderRemainingAmount(order: POSLifecycleOrder): number | null {
  const hasExplicitRemaining =
    order.remainingAmount !== undefined ||
    order.remaining_amount !== undefined;
  const explicit = hasExplicitRemaining
    ? readOrderAmount(order.remainingAmount ?? order.remaining_amount)
    : null;
  if (hasExplicitRemaining) return explicit === null ? null : Math.max(0, explicit);
  const total = getOrderTotalAmount(order);
  if (total === null) return null;
  return Math.max(0, total - getOrderPaidAmount(order));
}
