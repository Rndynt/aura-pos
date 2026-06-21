import type { POSPaymentMethod } from "@pos/domain/payments";
import { isPOSPaymentMethod } from "@pos/domain/payments";

export function assertPOSPaymentMethod(method: POSPaymentMethod): POSPaymentMethod {
  if (!isPOSPaymentMethod(method)) {
    throw new Error("Metode pembayaran tidak valid.");
  }
  return method;
}

export function createClientPaymentSessionId(prefix = "pospay"): string {
  const cryptoApi = globalThis.crypto;
  if (cryptoApi?.randomUUID) return `${prefix}_${cryptoApi.randomUUID()}`;
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}
