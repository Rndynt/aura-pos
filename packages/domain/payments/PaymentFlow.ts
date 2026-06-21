export type POSPaymentFlow = "FULL" | "DOWN_PAYMENT" | "MULTI_PAYMENT" | "SPLIT_BILL";

export const POS_PAYMENT_FLOWS: POSPaymentFlow[] = ["FULL", "DOWN_PAYMENT", "MULTI_PAYMENT", "SPLIT_BILL"];

export function isPOSPaymentFlow(value: string): value is POSPaymentFlow {
  return POS_PAYMENT_FLOWS.includes(value as POSPaymentFlow);
}
