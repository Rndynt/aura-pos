import { ORDER_ACTION_IDS, type OrderActionId } from '@pos/domain/business-flows/businessFlowActions';
import type { OrderLifecycleDto, OrderLifecycleDtoFields, OrderLifecycleKind, OrderLifecycleLockState } from '@pos/domain/orders';
export type { OrderLifecycleDtoFields, OrderLifecycleKind, OrderLifecycleLockState } from '@pos/domain/orders';

const ACTIVE_STATUSES = new Set(['confirmed', 'preparing', 'ready', 'served']);
const PAID_OR_CLOSED_PAYMENT_STATUSES = new Set(['paid', 'refunded', 'voided']);
const ACTIVE_PAYMENT_STATUSES = new Set(['unpaid', 'partial']);
const FIRED_ITEM_STATUSES = new Set(['preparing', 'ready', 'delivered']);
const KITCHEN_FULFILLMENT_STATUSES = new Set(['pending', 'preparing', 'ready', 'served']);
function normalize(value: unknown, fallback = ''): string { return String(value ?? fallback).toLowerCase(); }
function readPaymentStatus(order: OrderLifecycleDto): string { return normalize(order.paymentStatus ?? order.payment_status, 'unpaid'); }
function hasFiredItemsFromOrder(order: OrderLifecycleDto): boolean {
  const items = order.items ?? order.orderItems ?? [];
  return items.some((item) => FIRED_ITEM_STATUSES.has(normalize(item.status)));
}
function hasKitchenFulfillmentStarted(order: OrderLifecycleDto): boolean {
  return KITCHEN_FULFILLMENT_STATUSES.has(normalize(order.fulfillmentStatus ?? order.fulfillment_status ?? order.kitchenStatus ?? order.kitchen_status));
}
export function getOrderLifecycleDtoFields(order: OrderLifecycleDto, lockState: OrderLifecycleLockState = {}): OrderLifecycleDtoFields {
  const status = normalize(order.status);
  const paymentStatus = readPaymentStatus(order);
  const hasKitchenTicket = lockState.hasKitchenTicket ?? order.hasKitchenTicket === true;
  const hasFiredKitchenItems = lockState.hasFiredKitchenItems ?? hasFiredItemsFromOrder(order);
  const isKitchenLocked = hasKitchenTicket || hasFiredKitchenItems || hasKitchenFulfillmentStarted(order);
  const isEditableDraft = status === 'draft' && !PAID_OR_CLOSED_PAYMENT_STATUSES.has(paymentStatus) && !isKitchenLocked;
  const isActiveOrder = ACTIVE_STATUSES.has(status) && ACTIVE_PAYMENT_STATUSES.has(paymentStatus);
  let lifecycleKind: OrderLifecycleKind = 'unknown';
  if (status === 'cancelled') lifecycleKind = 'cancelled';
  else if (paymentStatus === 'paid' || status === 'completed') lifecycleKind = 'paid_completed';
  else if (isEditableDraft) lifecycleKind = 'server_draft';
  else if (isActiveOrder && isKitchenLocked) lifecycleKind = 'active_kitchen_order';
  else if (isActiveOrder) lifecycleKind = 'active_order';
  const allowedActions: OrderActionId[] = [];
  if (isEditableDraft) allowedActions.push(ORDER_ACTION_IDS.CONTINUE_DRAFT, ORDER_ACTION_IDS.UPDATE_DRAFT_ITEMS, ORDER_ACTION_IDS.CANCEL_DRAFT, ORDER_ACTION_IDS.VIEW_DRAFT, ORDER_ACTION_IDS.SEND_TO_KITCHEN);
  else if (isActiveOrder) allowedActions.push(ORDER_ACTION_IDS.PAY_ACTIVE_ORDER, ORDER_ACTION_IDS.VIEW_ACTIVE_ORDER);
  const labels: Record<OrderLifecycleKind, string> = { server_draft: 'Draft server', active_order: 'Tagihan aktif', active_kitchen_order: 'Pesanan aktif dapur', paid_completed: 'Lunas/selesai', cancelled: 'Dibatalkan', unknown: 'Status tidak dikenal' };
  return { isEditableDraft, isActiveOrder, isKitchenLocked, hasKitchenTicket, hasFiredKitchenItems, allowedActions, lifecycleKind, lifecycleLabel: labels[lifecycleKind] };
}
export function withOrderLifecycleDtoFields<T extends OrderLifecycleDto>(order: T, lockState?: OrderLifecycleLockState): T & OrderLifecycleDtoFields {
  return { ...order, ...getOrderLifecycleDtoFields(order, lockState) };
}
