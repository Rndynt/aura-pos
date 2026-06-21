import type { POSPaymentFlow } from "./PaymentFlow";
import type { POSPaymentStatus } from "./PaymentStatus";

export type POSPaymentResult = {
  orderId: string;
  orderNumber: string;
  flow: POSPaymentFlow;
  paidAmount: number;
  remainingAmount: number;
  status: POSPaymentStatus;
  shouldClearCart: boolean;
  shouldPrintReceipt: boolean;
};
