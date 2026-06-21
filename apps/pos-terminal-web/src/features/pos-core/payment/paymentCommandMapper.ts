import type { POSPaymentMethod } from "@pos/domain/payments";

export type LegacyCartPaymentMethod = "cash" | "card" | "ewallet" | "other" | POSPaymentMethod;

export function toCanonicalPaymentMethod(method: LegacyCartPaymentMethod): POSPaymentMethod {
  if (method === "CASH" || method === "MANUAL_TRANSFER" || method === "MANUAL_QRIS") return method;
  if (method === "cash") return "CASH";
  if (method === "card") return "MANUAL_TRANSFER";
  if (method === "ewallet") return "MANUAL_QRIS";
  return "CASH";
}

export function createClientPaymentSessionId(prefix = "pospay"): string {
  const cryptoApi = globalThis.crypto;
  if (cryptoApi?.randomUUID) return `${prefix}_${cryptoApi.randomUUID()}`;
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}
