import type { POSPaymentFlow, POSPaymentKind, POSPaymentMethod, POSPaymentSession } from "@pos/domain/payments";
import { calculateCashChange, calculateRemainingAmount, roundCurrency, isPOSPaymentFlow, isPOSPaymentMethod, isSelectedBillPayable } from "@pos/domain/payments";

export type POSPaymentSubmissionMode = "FRESH_CART" | "SAVED_ORDER" | "ACTIVE_ORDER";

export type POSPaymentLineInput = {
  method: POSPaymentMethod;
  amount: number;
  receivedAmount?: number;
  splitId?: string;
  referenceNote?: string;
};

export type POSPaymentSubmissionInput = {
  mode: POSPaymentSubmissionMode;
  clientPaymentSessionId: string;
  orderId?: string;
  orderNumber?: string;
  totalAmount: number;
  cartPayload?: Record<string, unknown>;
  paymentMethod: POSPaymentMethod;
  cashReceived?: number;
  partialAmount?: number;
  paymentSession?: POSPaymentSession;
  paymentDetails?: {
    flow: POSPaymentFlow;
    paymentKind?: POSPaymentKind;
    targetBillId?: string;
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
    payment_method: POSPaymentMethod;
    payment_flow: POSPaymentFlow;
    payment_kind: POSPaymentKind;
    client_payment_session_id: string;
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
  status: "PAID" | "PARTIAL" | "SAVED_NEEDS_PAYMENT";
  shouldClearCart: boolean;
  shouldPrintReceipt: boolean;
  messageTitle: string;
  messageDescription: string;
};

const paymentSessionOrderCache = new Map<string, { orderId: string; orderNumber: string }>();

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function toUserSafePaymentError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error ?? "");
  const technicalValidationPattern = new RegExp(["invalid_enum_value", "Invalid enum", "Expected.*FULL.*DOWN_PAYMENT", "\\[\\{.*code.*path"].join("|"), "i");
  if (technicalValidationPattern.test(message)) return "Pembayaran gagal dicatat. Silakan coba lagi.";
  return message || "Pembayaran gagal dicatat. Silakan coba lagi.";
}

function getOrderId(result: any, fallback?: string): string {
  return String(result?.order?.id ?? result?.id ?? fallback ?? "");
}

function getOrderNumber(result: any, fallback?: string): string {
  return String(result?.order?.order_number ?? result?.order?.orderNumber ?? result?.orderNumber ?? result?.order?.id ?? fallback ?? "");
}

function defaultKind(flow: POSPaymentFlow): POSPaymentKind {
  if (flow === "DOWN_PAYMENT") return "DOWN_PAYMENT";
  if (flow === "MULTI_PAYMENT") return "MULTI_PAYMENT_LINE";
  if (flow === "SPLIT_BILL") return "SPLIT_BILL_LINE";
  return "FULL_PAYMENT";
}

function buildDefaultLine(input: POSPaymentSubmissionInput): POSPaymentLineInput {
  const amount = roundCurrency(input.partialAmount ?? input.totalAmount);
  return { method: input.paymentMethod, amount, receivedAmount: input.cashReceived, splitId: input.paymentDetails?.targetBillId };
}

export function buildCanonicalPaymentCommand(input: POSPaymentSubmissionInput): { flow: POSPaymentFlow; paymentKind: POSPaymentKind; targetBillId?: string; lines: POSPaymentLineInput[]; lineTotal: number } {
  const flow = input.paymentDetails?.flow ?? (input.partialAmount != null && input.partialAmount > 0 ? "DOWN_PAYMENT" : "FULL");
  if (!isPOSPaymentFlow(flow)) throw new Error("Tipe pembayaran tidak valid.");
  const sourceLines = flow === "MULTI_PAYMENT" || flow === "SPLIT_BILL" ? (input.paymentDetails?.lines ?? []) : [buildDefaultLine(input)];
  const max = flow === "MULTI_PAYMENT" ? 2 : flow === "SPLIT_BILL" ? 4 : 1;
  if (sourceLines.length > max) throw new Error(flow === "MULTI_PAYMENT" ? "Multi payment maksimal 2 baris." : "Split bill maksimal 4 bill.");
  const lines = sourceLines.map((line) => ({ ...line, amount: roundCurrency(Number(line.amount || 0)) })).filter((line) => line.amount > 0);
  if (lines.some((line) => !isPOSPaymentMethod(line.method))) throw new Error("Metode pembayaran tidak valid.");
  const lineTotal = roundCurrency(lines.reduce((sum, line) => sum + line.amount, 0));
  if (flow === "MULTI_PAYMENT" && Math.abs(lineTotal - input.totalAmount) > 0.001) throw new Error("Total multi payment harus sama dengan total tagihan.");
  if (flow === "SPLIT_BILL") {
    const targetBillId = input.paymentDetails?.targetBillId ?? lines[0]?.splitId;
    const bill = input.paymentSession?.bills.find((b) => b.clientBillId === targetBillId || b.orderBillSplitId === targetBillId);
    if (bill && !isSelectedBillPayable({ billAmountDue: bill.amountDue, billAmountPaid: bill.amountPaid, lineTotal })) throw new Error("Bill yang dipilih sudah lunas atau jumlah pembayaran tidak sesuai.");
  }
  return { flow, paymentKind: input.paymentDetails?.paymentKind ?? defaultKind(flow), targetBillId: input.paymentDetails?.targetBillId, lines, lineTotal };
}

function kindForLine(input: POSPaymentSubmissionInput, flow: POSPaymentFlow, paymentKind: POSPaymentKind, line: POSPaymentLineInput): POSPaymentKind {
  if (flow === "DOWN_PAYMENT") return line.amount >= input.totalAmount - 0.001 ? "REMAINING_PAYMENT" : "DOWN_PAYMENT";
  return paymentKind;
}

function buildPaymentPayload(input: POSPaymentSubmissionInput, flow: POSPaymentFlow, paymentKind: POSPaymentKind, line: POSPaymentLineInput, index: number) {
  const isUuidSplitId = line.splitId ? UUID_RE.test(line.splitId) : false;
  const metadata = flow === "SPLIT_BILL" && (!isUuidSplitId || input.paymentDetails?.splits)
    ? { ...(isUuidSplitId ? {} : { session_split_id: line.splitId }), splits: input.paymentDetails?.splits }
    : undefined;
  return {
    amount: line.amount,
    payment_method: line.method,
    payment_flow: flow,
    payment_kind: kindForLine(input, flow, paymentKind, line),
    client_payment_session_id: input.clientPaymentSessionId,
    received_amount: line.receivedAmount,
    change_amount: line.method === "CASH" ? calculateCashChange(line.amount, line.receivedAmount) : undefined,
    split_id: isUuidSplitId ? line.splitId : undefined,
    sequence: index + 1,
    reference_note: line.referenceNote,
    metadata,
  };
}

async function recordRows(orderId: string, input: POSPaymentSubmissionInput, deps: POSPaymentSubmissionDependencies, flow: POSPaymentFlow, paymentKind: POSPaymentKind, lines: POSPaymentLineInput[]) {
  for (let index = 0; index < lines.length; index += 1) await deps.recordPayment({ orderId, ...buildPaymentPayload(input, flow, paymentKind, lines[index], index) });
}

export async function submitPOSPayment(input: POSPaymentSubmissionInput, deps: POSPaymentSubmissionDependencies): Promise<POSPaymentSubmissionResult> {
  const { flow, paymentKind, lines, lineTotal } = buildCanonicalPaymentCommand(input);
  if (!lines.length) throw new Error("Pembayaran gagal dicatat. Silakan coba lagi.");
  const cachedSession = paymentSessionOrderCache.get(input.clientPaymentSessionId);
  let orderId = input.paymentSession?.orderId ?? input.orderId ?? cachedSession?.orderId ?? "";
  let orderNumber = input.paymentSession?.orderNumber ?? input.orderNumber ?? cachedSession?.orderNumber ?? "";
  if (input.mode === "FRESH_CART" && !orderId && (flow === "FULL" || flow === "DOWN_PAYMENT") && deps.createAndPay) {
    const result = await deps.createAndPay({ ...(input.cartPayload ?? {}), ...buildPaymentPayload(input, flow, paymentKind, lines[0], 0) });
    orderId = getOrderId(result, orderId);
    orderNumber = getOrderNumber(result, orderNumber || orderId);
  } else {
    if (input.mode === "FRESH_CART" && !orderId) {
      const result = await deps.createOrder({ ...(input.cartPayload ?? {}), client_payment_session_id: input.clientPaymentSessionId });
      orderId = getOrderId(result, orderId);
      orderNumber = getOrderNumber(result, orderNumber || orderId);
      if (orderId) paymentSessionOrderCache.set(input.clientPaymentSessionId, { orderId, orderNumber: orderNumber || orderId });
    }
    if (!orderId) throw new Error("Order berhasil dibuat, tetapi ID order tidak ditemukan untuk mencatat pembayaran.");
    await recordRows(orderId, input, deps, flow, paymentKind, lines);
  }
  const paidAmount = roundCurrency((input.paymentSession?.paidAmount ?? 0) + lineTotal);
  const remainingAmount = calculateRemainingAmount(input.totalAmount, paidAmount);
  const status = remainingAmount <= 0.001 ? "PAID" : "PARTIAL";
  return {
    orderId,
    orderNumber: orderNumber || orderId,
    paymentFlow: flow,
    paidAmount,
    remainingAmount,
    status,
    shouldClearCart: status === "PAID",
    shouldPrintReceipt: status === "PAID",
    messageTitle: status === "PARTIAL" ? "Pembayaran sebagian tersimpan" : "Pembayaran berhasil",
    messageDescription: status === "PARTIAL"
      ? `Order #${orderNumber || orderId} tersimpan. Pembayaran yang dipilih sudah dicatat, sisa tagihan dapat dilunasi dari order aktif.`
      : `Order #${orderNumber || orderId} dilunasi.`,
  };
}
