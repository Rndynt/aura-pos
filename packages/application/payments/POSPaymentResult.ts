/**
 * SubmitPOSPaymentResult
 *
 * Canonical result returned by the SubmitPOSPayment use case.
 */

import type { POSPaymentFlow } from "@pos/domain/payments";

export type SubmitPOSPaymentResultSplit = {
  id: string;
  clientBillId?: string;
  label: string;
  splitNo: number;
  amountDue: number;
  amountPaid: number;
  status: "unpaid" | "partial" | "paid";
  items?: Array<{ orderItemId: string; quantity: number; amount: number }>;
};

export type SubmitPOSPaymentResult = {
  orderId: string;
  orderNumber: string;
  paymentFlow: POSPaymentFlow;
  paidAmount: number;
  remainingAmount: number;
  status: "PAID" | "PARTIAL" | "SAVED_NEEDS_PAYMENT";
  shouldClearCart: boolean;
  shouldPrintReceipt: boolean;
  order: unknown;
  payments: unknown[];
  splits?: SubmitPOSPaymentResultSplit[];
  messageTitle: string;
  messageDescription: string;
};
