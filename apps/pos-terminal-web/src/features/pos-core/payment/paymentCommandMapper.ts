import type { POSPaymentMethod } from "@pos/domain/payments";
import { isPOSPaymentMethod } from "@pos/domain/payments";

const PAYMENT_METHOD_ALIAS_MAP: Record<string, POSPaymentMethod> = {
  // lowercase UI aliases → canonical
  cash: "CASH",
  ewallet: "MANUAL_QRIS",
  qris: "MANUAL_QRIS",
  card: "MANUAL_TRANSFER",
  transfer: "MANUAL_TRANSFER",
  // canonical passthrough
  CASH: "CASH",
  MANUAL_QRIS: "MANUAL_QRIS",
  MANUAL_TRANSFER: "MANUAL_TRANSFER",
};

export function toCanonicalPaymentMethod(method: string): POSPaymentMethod {
  const canonical = PAYMENT_METHOD_ALIAS_MAP[method];
  if (canonical) return canonical;
  if (isPOSPaymentMethod(method)) return method as POSPaymentMethod;
  throw new Error(`Metode pembayaran tidak dikenal: ${method}`);
}

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
