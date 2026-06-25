import type { CartItem } from "@/hooks/useCart";
import type { ExistingSplitBill } from "@/components/pos/PaymentMethodDialog";
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

function getOrderSplitBills(order?: POSLifecycleOrder | null): ExistingSplitBill[] {
  if (!order) return [];
  return (((order as any).billSplits ?? (order as any).splits ?? []) as ExistingSplitBill[]).filter((split) => split?.clientBillId);
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
