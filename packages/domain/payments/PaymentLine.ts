import type { POSPaymentMethod } from "./PaymentMethod";

export type POSPaymentLineKind =
  | "FULL_PAYMENT"
  | "DOWN_PAYMENT"
  | "REMAINING_PAYMENT"
  | "MULTI_PAYMENT_LINE"
  | "SPLIT_BILL_LINE";

export type POSPaymentLine = {
  method: POSPaymentMethod;
  amount: number;
  receivedAmount?: number;
  referenceNote?: string;
};

export type POSPaymentKind = POSPaymentLineKind;
