import type { PaymentMethod } from "@/hooks/useCart";
import { calculateCashChange, calculateRemainingAmount, roundCurrency, type POSPaymentFlow, type POSPaymentKind } from "./posPaymentFlowService";

export type POSPaymentSubmissionMode = "fresh_cart" | "saved_order" | "active_order";

export type POSPaymentLineInput = {
  method: PaymentMethod;
  amount: number;
  receivedAmount?: number;
  splitId?: string;
  referenceNote?: string;
};

export type POSPaymentSubmissionInput = {
  mode: POSPaymentSubmissionMode;
  orderId?: string;
  orderNumber?: string;
  totalAmount: number;
  cartPayload?: Record<string, unknown>;
  paymentMethod: PaymentMethod;
  cashReceived?: number;
  partialAmount?: number;
  paymentDetails?: {
    flow?: POSPaymentFlow | "full_payment" | "partial_payment_dp" | unknown;
    paymentKind?: POSPaymentKind;
    lines?: POSPaymentLineInput[];
    splits?: Array<{ id?: string; label?: string; amountDue: number; amountPaid?: number }>;
  };
};

export type POSPaymentSubmissionDependencies = {
  createOrder: (payload: Record<string, unknown>) => Promise<any>;
  updateOrder?: (payload: { orderId: string } & Record<string, unknown>) => Promise<any>;
  recordPayment: (payload: {
    orderId: string;
    amount: number;
    payment_method: PaymentMethod;
    payment_flow: POSPaymentFlow;
    payment_kind: POSPaymentKind;
    received_amount?: number;
    change_amount?: number;
    split_id?: string;
    sequence?: number;
    reference_note?: string;
    metadata?: Record<string, unknown>;
  }) => Promise<any>;
  createAndPay?: (payload: Record<string, unknown>) => Promise<any>;
};

export type POSPaymentSubmissionResult = {
  orderId: string;
  orderNumber: string;
  paymentFlow: POSPaymentFlow;
  paidAmount: number;
  remainingAmount: number;
  status: "paid" | "partial" | "saved_needs_payment";
  shouldClearCart: boolean;
  shouldPrintReceipt: boolean;
  messageTitle: string;
  messageDescription: string;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function normalizePOSPaymentFlow(input: unknown, partialAmount?: number): POSPaymentFlow {
  if (input === "full_payment") return "full";
  if (input === "partial_payment_dp") return "dp";
  if (input === "full" || input === "dp" || input === "multi" || input === "split") return input;
  return partialAmount != null && partialAmount > 0 ? "dp" : "full";
}

export function toUserSafePaymentError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error ?? "");
  const technicalValidationPattern = new RegExp(["invalid_enum_value", "Invalid enum", "full_payment\\s*\\|\\s*partial_payment_dp", "\\[\\{.*code.*path"].join("|"), "i");
  if (technicalValidationPattern.test(message)) {
    return "Pembayaran gagal dicatat. Silakan coba lagi.";
  }
  return message || "Pembayaran gagal dicatat. Silakan coba lagi.";
}

function getOrderId(result: any, fallback?: string): string {
  return String(result?.order?.id ?? result?.id ?? fallback ?? "");
}

function getOrderNumber(result: any, fallback?: string): string {
  return String(result?.order?.order_number ?? result?.order?.orderNumber ?? result?.orderNumber ?? result?.order?.id ?? fallback ?? "");
}

function buildDefaultLine(input: POSPaymentSubmissionInput, flow: POSPaymentFlow): POSPaymentLineInput {
  const amount = roundCurrency(input.partialAmount ?? input.totalAmount);
  return { method: input.paymentMethod, amount, receivedAmount: input.cashReceived, splitId: input.paymentDetails?.lines?.[0]?.splitId };
}

export function normalizePOSPaymentLines(input: POSPaymentSubmissionInput): { flow: POSPaymentFlow; paymentKind: POSPaymentKind; lines: POSPaymentLineInput[]; lineTotal: number } {
  const flow = normalizePOSPaymentFlow(input.paymentDetails?.flow, input.partialAmount);
  const defaultKind: POSPaymentKind = flow === "dp" ? "down_payment" : flow === "multi" ? "multi_line" : flow === "split" ? "split_line" : "full_payment";
  const paymentKind = input.paymentDetails?.paymentKind ?? defaultKind;
  const sourceLines = flow === "multi" || flow === "split" ? (input.paymentDetails?.lines ?? []) : [buildDefaultLine(input, flow)];
  const max = flow === "multi" ? 2 : flow === "split" ? 4 : 1;
  const lines = sourceLines.slice(0, max).map((line) => ({ ...line, amount: roundCurrency(Number(line.amount || 0)) })).filter((line) => line.amount > 0);
  const lineTotal = roundCurrency(lines.reduce((sum, line) => sum + line.amount, 0));
  return { flow, paymentKind, lines, lineTotal };
}

function buildPaymentPayload(input: POSPaymentSubmissionInput, flow: POSPaymentFlow, paymentKind: POSPaymentKind, line: POSPaymentLineInput, index: number) {
  const isUuidSplitId = line.splitId ? UUID_RE.test(line.splitId) : false;
  const metadata = flow === "split" && (!isUuidSplitId || input.paymentDetails?.splits)
    ? { ...(isUuidSplitId ? {} : { session_split_id: line.splitId }), splits: input.paymentDetails?.splits }
    : undefined;
  return {
    amount: line.amount,
    payment_method: line.method,
    payment_flow: flow,
    payment_kind: flow === "dp" ? (line.amount >= input.totalAmount - 0.001 ? "remaining_payment" as const : "down_payment" as const) : paymentKind,
    received_amount: line.receivedAmount,
    change_amount: line.method === "cash" ? calculateCashChange(line.amount, line.receivedAmount) : undefined,
    split_id: isUuidSplitId ? line.splitId : undefined,
    sequence: index + 1,
    reference_note: line.referenceNote,
    metadata,
  };
}

async function recordPaymentRows(orderId: string, input: POSPaymentSubmissionInput, deps: POSPaymentSubmissionDependencies, flow: POSPaymentFlow, paymentKind: POSPaymentKind, lines: POSPaymentLineInput[]) {
  for (let index = 0; index < lines.length; index += 1) {
    await deps.recordPayment({ orderId, ...buildPaymentPayload(input, flow, paymentKind, lines[index], index) });
  }
}

export async function submitPOSPayment(input: POSPaymentSubmissionInput, deps: POSPaymentSubmissionDependencies): Promise<POSPaymentSubmissionResult> {
  const normalized = normalizePOSPaymentLines(input);
  const { flow, paymentKind, lines, lineTotal } = normalized;
  if (!lines.length) throw new Error("Pembayaran gagal dicatat. Silakan coba lagi.");

  let orderId = input.orderId ?? "";
  let orderNumber = input.orderNumber ?? "";

  if (input.mode === "fresh_cart" && (flow === "full" || flow === "dp") && deps.createAndPay) {
    const line = lines[0];
    const result = await deps.createAndPay({ ...(input.cartPayload ?? {}), ...buildPaymentPayload(input, flow, paymentKind, line, 0) });
    orderId = getOrderId(result, orderId);
    orderNumber = getOrderNumber(result, orderNumber || orderId);
  } else {
    if (input.mode === "fresh_cart") {
      const result = await deps.createOrder(input.cartPayload ?? {});
      orderId = getOrderId(result, orderId);
      orderNumber = getOrderNumber(result, orderNumber || orderId);
    }
    if (!orderId) throw new Error("Order berhasil dibuat, tetapi ID order tidak ditemukan untuk mencatat pembayaran.");
    await recordPaymentRows(orderId, input, deps, flow, paymentKind, lines);
  }

  const paidAmount = lineTotal;
  const remainingAmount = calculateRemainingAmount(input.totalAmount, paidAmount);
  const status = remainingAmount <= 0.001 ? "paid" : "partial";
  const partial = status !== "paid";
  return {
    orderId,
    orderNumber: orderNumber || orderId,
    paymentFlow: flow,
    paidAmount,
    remainingAmount,
    status,
    shouldClearCart: true,
    shouldPrintReceipt: status === "paid",
    messageTitle: partial ? "Pembayaran sebagian tersimpan" : "Pembayaran berhasil",
    messageDescription: partial
      ? `Order #${orderNumber || orderId} tersimpan. Pembayaran yang dipilih sudah dicatat, sisa tagihan dapat dilunasi dari order aktif.`
      : `Order #${orderNumber || orderId} dilunasi.`,
  };
}
