import { nanoid } from "nanoid";

/**
 * Generate a collision-resistant idempotency key.
 * Format: {terminalId}:{timestamp}:{random}
 * Safe to use for both online (sent as header) and offline (stored in IndexedDB).
 */
export function generateIdempotencyKey(terminalId: string): string {
  return `${terminalId}:${Date.now()}:${nanoid(8)}`;
}
