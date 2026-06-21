export type POSPaymentMethod = "CASH" | "MANUAL_TRANSFER" | "MANUAL_QRIS";

export const POS_PAYMENT_METHODS: POSPaymentMethod[] = ["CASH", "MANUAL_TRANSFER", "MANUAL_QRIS"];

export function isPOSPaymentMethod(value: string): value is POSPaymentMethod {
  return POS_PAYMENT_METHODS.includes(value as POSPaymentMethod);
}
