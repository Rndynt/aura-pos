import type { POSPaymentFlow, POSPaymentKind, POSPaymentMethod, POSPaymentSession } from "@pos/domain/payments";
import { roundCurrency, isPOSPaymentFlow, isPOSPaymentMethod, isSelectedBillPayable } from "@pos/domain/payments";

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
  submitPayment: (payload: SubmitPOSPaymentRequest) => Promise<SubmitPOSPaymentApiResult>;
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

export type SubmitPOSPaymentRequest = {
  source: POSPaymentSubmissionMode;
  clientPaymentSessionId: string;
  orderId?: string;
  orderNumber?: string;
  order?: Record<string, unknown>;
  payment: {
    flow: POSPaymentFlow;
    paymentKind?: POSPaymentKind;
    targetBillId?: string;
    lines: Array<{
      method: POSPaymentMethod;
      amount: number;
      receivedAmount?: number;
      referenceNote?: string;
      clientBillId?: string;
      orderBillSplitId?: string;
    }>;
    splits?: Array<{
      clientBillId: string;
      label: string;
      splitNo: number;
      amountDue: number;
      amountPaid?: number;
      status?: "UNPAID" | "PARTIAL" | "PAID";
    }>;
  };
};

export type SubmitPOSPaymentApiResult = POSPaymentSubmissionResult & {
  order?: unknown;
  payments?: unknown[];
  splits?: unknown[];
};

export function toUserSafePaymentError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error ?? "");
  const technicalValidationPattern = new RegExp(["invalid_enum_value", "Invalid enum", "Expected.*FULL.*DOWN_PAYMENT", "\\[\\{.*code.*path"].join("|"), "i");
  if (technicalValidationPattern.test(message)) return "Pembayaran gagal dicatat. Silakan coba lagi.";
  return message || "Pembayaran gagal dicatat. Silakan coba lagi.";
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

function buildBackendOrderPayload(cartPayload?: Record<string, unknown>): Record<string, unknown> | undefined {
  if (!cartPayload) return undefined;
  return {
    items: cartPayload.items,
    order_type_id: cartPayload.order_type_id,
    customer_name: cartPayload.customer_name,
    table_number: cartPayload.table_number,
    notes: cartPayload.notes,
    tax_rate: cartPayload.tax_rate,
    service_charge_rate: cartPayload.service_charge_rate,
    fulfillment_mode: cartPayload.fulfillment_mode,
  };
}

function buildSplitPayload(input: POSPaymentSubmissionInput): SubmitPOSPaymentRequest["payment"]["splits"] | undefined {
  return input.paymentDetails?.splits?.map((split, index) => ({
    clientBillId: split.id ?? `bill-${index + 1}`,
    label: split.label ?? `Bill ${index + 1}`,
    splitNo: index + 1,
    amountDue: roundCurrency(split.amountDue),
    amountPaid: roundCurrency(split.amountPaid ?? 0),
    status: (split.amountPaid ?? 0) >= split.amountDue - 0.001 ? "PAID" : (split.amountPaid ?? 0) > 0 ? "PARTIAL" : "UNPAID",
  }));
}

export function buildSubmitPOSPaymentRequest(input: POSPaymentSubmissionInput): SubmitPOSPaymentRequest {
  const { flow, paymentKind, lines } = buildCanonicalPaymentCommand(input);
  return {
    source: input.mode,
    clientPaymentSessionId: input.clientPaymentSessionId,
    orderId: input.paymentSession?.orderId ?? input.orderId,
    orderNumber: input.paymentSession?.orderNumber ?? input.orderNumber,
    order: input.mode === "FRESH_CART" ? buildBackendOrderPayload(input.cartPayload) : undefined,
    payment: {
      flow,
      paymentKind,
      targetBillId: input.paymentDetails?.targetBillId ?? lines[0]?.splitId,
      lines: lines.map((line) => ({
        method: line.method,
        amount: line.amount,
        receivedAmount: line.receivedAmount,
        referenceNote: line.referenceNote,
        clientBillId: line.splitId,
      })),
      splits: buildSplitPayload(input),
    },
  };
}

export async function submitPOSPayment(input: POSPaymentSubmissionInput, deps: POSPaymentSubmissionDependencies): Promise<POSPaymentSubmissionResult> {
  const result = await deps.submitPayment(buildSubmitPOSPaymentRequest(input));
  return {
    orderId: result.orderId,
    orderNumber: result.orderNumber,
    paymentFlow: result.paymentFlow,
    paidAmount: result.paidAmount,
    remainingAmount: result.remainingAmount,
    status: result.status,
    shouldClearCart: result.shouldClearCart === true,
    shouldPrintReceipt: result.shouldPrintReceipt === true,
    messageTitle: result.messageTitle,
    messageDescription: result.messageDescription,
  };
}
