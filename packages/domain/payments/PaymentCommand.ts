import type { POSPaymentFlow } from "./PaymentFlow";
import type { POSPaymentLine } from "./PaymentLine";

export type POSPaymentSource = "FRESH_CART" | "SAVED_ORDER" | "ACTIVE_ORDER";

export type POSPaymentCommandLine = POSPaymentLine;

export type POSPaymentCommand = {
  source: POSPaymentSource;
  orderId?: string;
  clientPaymentSessionId: string;
  flow: POSPaymentFlow;
  targetBillId?: string;
  lines: POSPaymentCommandLine[];
};
