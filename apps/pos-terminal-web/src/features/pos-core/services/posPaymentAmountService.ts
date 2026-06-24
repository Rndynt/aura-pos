import {
  canPayActiveOrder,
  getOrderPaymentStatus,
  getOrderRemainingAmount,
  getOrderTotalAmount,
  type POSLifecycleOrder,
} from "./posLifecycleService";

export type POSActiveOrderPaymentAmountResult =
  | { ok: true; amount: number; orderNumber: string }
  | { ok: false; amount: 0; reason: string };

export function getPOSOrderDisplayNumber(order: POSLifecycleOrder): string {
  return String(order.order_number ?? order.orderNumber ?? order.id);
}

export function resolvePOSActiveOrderPaymentAmount(
  order: POSLifecycleOrder,
): POSActiveOrderPaymentAmountResult {
  const paymentStatus = getOrderPaymentStatus(order);
  if (paymentStatus === "paid") {
    return { ok: false, amount: 0, reason: "Tagihan aktif ini sudah lunas." };
  }

  if (!canPayActiveOrder(order)) {
    return { ok: false, amount: 0, reason: "Order ini tidak dapat dibayar dari POS." };
  }

  const remainingAmount = getOrderRemainingAmount(order);
  if (remainingAmount === null || !Number.isFinite(remainingAmount)) {
    return {
      ok: false,
      amount: 0,
      reason: "Sisa pembayaran tidak dapat dihitung dari data order.",
    };
  }

  if (remainingAmount <= 0) {
    return { ok: false, amount: 0, reason: "Tagihan aktif ini sudah lunas." };
  }

  const total = getOrderTotalAmount(order);
  if (total !== null && Number.isFinite(total) && remainingAmount > total) {
    return {
      ok: false,
      amount: 0,
      reason: "Sisa pembayaran melebihi total order dan diblokir untuk mencegah overpayment.",
    };
  }

  return { ok: true, amount: remainingAmount, orderNumber: getPOSOrderDisplayNumber(order) };
}
