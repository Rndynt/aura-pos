export type POSPaymentBillStatus = "UNPAID" | "PARTIAL" | "PAID";

export type POSPaymentBill = {
  clientBillId: string;
  orderBillSplitId?: string;
  label: string;
  amountDue: number;
  amountPaid: number;
  status: POSPaymentBillStatus;
};

export type POSPaymentSession = {
  clientPaymentSessionId: string;
  source: "FRESH_CART" | "SAVED_ORDER" | "ACTIVE_ORDER";
  orderId?: string;
  orderNumber?: string;
  totalAmount: number;
  paidAmount: number;
  remainingAmount: number;
  bills: POSPaymentBill[];
  unassignedAmount: number;
  status: "OPEN" | "PARTIAL" | "PAID";
};
