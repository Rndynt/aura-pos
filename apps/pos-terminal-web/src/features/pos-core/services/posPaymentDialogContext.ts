import type { CartItem } from "@/hooks/useCart";
import type { ExistingSplitBill, ExistingSplitBillItem } from "@/components/pos/PaymentMethodDialog";
import type { POSPendingOrderPayment } from "../hooks/usePOSActiveOrderPayment";
import { getOrderRemainingAmount, getOrderTotalAmount, type POSLifecycleOrder } from "./posLifecycleService";

export type POSPaymentDialogContext = {
  orderId?: string;
  orderNumber?: string;
  totalAmount: number;
  cartItems: CartItem[];
  existingSplitBills: ExistingSplitBill[];
  source: "FRESH_CART" | "SAVED_ORDER" | "ACTIVE_ORDER";
};

type ResolvePOSPaymentDialogContextInput = {
  pendingOrderForPayment: POSPendingOrderPayment;
  continuedOrderForPayment?: POSLifecycleOrder | null;
  continueOrderId?: string | null;
  cartTotal: number;
  cartItems: CartItem[];
};

function getOrderItems(order?: POSLifecycleOrder | null): CartItem[] {
  if (!order) return [];
  return ((order.items ?? order.orderItems ?? []) as unknown[]) as CartItem[];
}

function numberFrom(value: unknown, fallback = 0): number {
  const numeric = Number(value ?? fallback);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function billIdFromSplitNo(splitNo: unknown, fallbackIndex: number): string {
  const numericSplitNo = Math.max(1, Math.floor(numberFrom(splitNo, fallbackIndex + 1)));
  return String.fromCharCode(64 + Math.min(numericSplitNo, 26));
}

function normalizeStatus(rawStatus: unknown, amountDue: number, amountPaid: number): ExistingSplitBill["status"] {
  const status = String(rawStatus ?? "").toUpperCase();
  if (status === "PAID" || status === "PARTIAL" || status === "UNPAID") return status;
  if (amountPaid >= amountDue && amountDue > 0) return "PAID";
  if (amountPaid > 0) return "PARTIAL";
  return "UNPAID";
}

function normalizeSplitItems(items: unknown, clientBillId: string): ExistingSplitBillItem[] {
  if (!Array.isArray(items)) return [];
  return items
    .map((item: any) => ({
      orderItemId: String(item?.orderItemId ?? item?.order_item_id ?? ""),
      clientBillId: String(item?.clientBillId ?? item?.client_bill_id ?? clientBillId),
      quantity: numberFrom(item?.quantity, 0),
      amount: numberFrom(item?.amount, 0),
    }))
    .filter((item) => item.orderItemId && item.quantity > 0);
}

function normalizeSplitBill(rawSplit: any, index: number): ExistingSplitBill | null {
  if (!rawSplit) return null;
  const splitNo = rawSplit.splitNo ?? rawSplit.split_no ?? index + 1;
  const clientBillId = String(rawSplit.clientBillId ?? rawSplit.client_bill_id ?? billIdFromSplitNo(splitNo, index));
  const amountDue = numberFrom(rawSplit.amountDue ?? rawSplit.amount_due, 0);
  const amountPaid = numberFrom(rawSplit.amountPaid ?? rawSplit.amount_paid, 0);

  return {
    id: String(rawSplit.id ?? rawSplit.orderBillSplitId ?? rawSplit.order_bill_split_id ?? ""),
    clientBillId,
    label: String(rawSplit.label ?? rawSplit.splitLabel ?? rawSplit.split_label ?? `Bill ${clientBillId}`),
    amountDue,
    amountPaid,
    status: normalizeStatus(rawSplit.status, amountDue, amountPaid),
    items: normalizeSplitItems(rawSplit.items ?? rawSplit.splitItems ?? rawSplit.split_items, clientBillId),
  };
}

function getOrderPaidAmount(order?: POSLifecycleOrder | null): number {
  if (!order) return 0;
  const raw = order as any;
  return numberFrom(raw.paidAmount ?? raw.paid_amount, 0);
}

function hasSplitPaymentEvidence(order?: POSLifecycleOrder | null): boolean {
  if (!order) return false;
  const raw = order as any;
  const payments = (raw.payments ?? raw.orderPayments ?? raw.order_payments ?? []) as any[];
  if (payments.some((payment) => String(payment?.paymentFlow ?? payment?.payment_flow ?? "").toUpperCase() === "SPLIT_BILL")) return true;
  const status = String(raw.paymentStatus ?? raw.payment_status ?? "").toLowerCase();
  return status === "partial" && getOrderPaidAmount(order) > 0;
}

function getOrderItemId(item: any): string {
  return String(item?.id ?? item?.orderItemId ?? item?.order_item_id ?? item?.clientItemId ?? item?.client_item_id ?? "");
}

function getOrderItemQuantity(item: any): number {
  return Math.max(1, numberFrom(item?.quantity, 1));
}

function getOrderItemAmount(item: any): number {
  const explicit = numberFrom(
    item?.itemSubtotal ?? item?.item_subtotal ?? item?.totalPrice ?? item?.total_price ?? item?.lineTotal ?? item?.line_total,
    NaN,
  );
  if (Number.isFinite(explicit)) return explicit;
  const unit = numberFrom(item?.unitPrice ?? item?.unit_price ?? item?.price ?? item?.basePrice ?? item?.base_price, 0);
  return unit * getOrderItemQuantity(item);
}

function synthesizePaidItemsFromOrder(order: POSLifecycleOrder | null | undefined, clientBillId: string, paidAmount: number): ExistingSplitBillItem[] {
  const items = getOrderItems(order);
  const result: ExistingSplitBillItem[] = [];
  let remaining = Math.max(0, paidAmount);

  for (const item of items as any[]) {
    const orderItemId = getOrderItemId(item);
    const quantity = getOrderItemQuantity(item);
    const lineAmount = getOrderItemAmount(item);
    const unitAmount = quantity > 0 ? lineAmount / quantity : lineAmount;
    if (!orderItemId || quantity <= 0 || unitAmount <= 0 || remaining <= 0) continue;

    const fullQty = lineAmount <= remaining + 1 ? quantity : Math.floor((remaining + 1) / unitAmount);
    const assignedQty = Math.max(0, Math.min(quantity, fullQty));
    if (assignedQty <= 0) continue;

    const amount = Math.round(unitAmount * assignedQty * 100) / 100;
    result.push({ orderItemId, clientBillId, quantity: assignedQty, amount });
    remaining -= amount;
  }

  return result;
}

function synthesizePaidSplitFromOrder(order?: POSLifecycleOrder | null): ExistingSplitBill[] {
  const paidAmount = getOrderPaidAmount(order);
  if (!hasSplitPaymentEvidence(order) || paidAmount <= 0) return [];
  return [{
    id: "synthetic-paid-bill-a",
    clientBillId: "A",
    label: "Bill A",
    amountDue: paidAmount,
    amountPaid: paidAmount,
    status: "PAID",
    items: synthesizePaidItemsFromOrder(order, "A", paidAmount),
  }];
}

function getOrderSplitBills(order?: POSLifecycleOrder | null): ExistingSplitBill[] {
  if (!order) return [];
  const rawSplits = ((order as any).billSplits ?? (order as any).bill_splits ?? (order as any).splits ?? []) as unknown[];
  const normalized = rawSplits
    .map((split, index) => normalizeSplitBill(split, index))
    .filter((split): split is ExistingSplitBill => Boolean(split?.clientBillId));

  if (normalized.length === 0) return synthesizePaidSplitFromOrder(order);

  return normalized.map((bill, index) => {
    if (bill.status !== "PAID" || (bill.items?.length ?? 0) > 0) return bill;
    const paidAmount = bill.amountPaid || bill.amountDue || getOrderPaidAmount(order);
    return {
      ...bill,
      items: synthesizePaidItemsFromOrder(order, bill.clientBillId || billIdFromSplitNo(index + 1, index), paidAmount),
    };
  });
}

function getOrderNumber(order?: POSLifecycleOrder | null): string | undefined {
  if (!order) return undefined;
  return order.orderNumber ?? order.order_number;
}

function getPaymentTotal(order: POSLifecycleOrder | null | undefined, fallback: number): number {
  if (!order) return fallback;
  return getOrderRemainingAmount(order) ?? getOrderTotalAmount(order) ?? fallback;
}

export function resolvePOSPaymentDialogContext(input: ResolvePOSPaymentDialogContextInput): POSPaymentDialogContext {
  if (input.pendingOrderForPayment) {
    const order = input.pendingOrderForPayment.order;
    const orderItems = getOrderItems(order);
    return {
      orderId: input.pendingOrderForPayment.orderId,
      orderNumber: input.pendingOrderForPayment.orderNumber,
      totalAmount: input.pendingOrderForPayment.totalAmount,
      cartItems: orderItems.length ? orderItems : input.cartItems,
      existingSplitBills: getOrderSplitBills(order),
      source: "ACTIVE_ORDER",
    };
  }

  if (input.continuedOrderForPayment || input.continueOrderId) {
    const order = input.continuedOrderForPayment;
    const orderItems = getOrderItems(order);
    return {
      orderId: order?.id ?? input.continueOrderId ?? undefined,
      orderNumber: getOrderNumber(order),
      totalAmount: getPaymentTotal(order, input.cartTotal),
      cartItems: orderItems.length ? orderItems : input.cartItems,
      existingSplitBills: getOrderSplitBills(order),
      source: "SAVED_ORDER",
    };
  }

  return {
    totalAmount: input.cartTotal,
    cartItems: input.cartItems,
    existingSplitBills: [],
    source: "FRESH_CART",
  };
}
