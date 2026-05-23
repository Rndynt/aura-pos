import { offlineDb } from "./db";

const SEQ_PREFIX = "order_seq";

function todayYMD(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}${m}${day}`;
}

/**
 * Generate a local offline order number.
 * Format: OFF-{shortTerminalId}-{YYYYMMDD}-{seq:04}
 * Sequence is per-tenant-per-day, stored in sync_meta.
 * No duplicate local order numbers within the same terminal+day.
 */
export async function generateLocalOrderNumber(tenantId: string, terminalId: string): Promise<string> {
  const date = todayYMD();
  const key = `${SEQ_PREFIX}:${tenantId}:${date}`;
  const now = new Date().toISOString();

  const existing = await offlineDb.sync_meta.get(key);
  const nextSeq = existing ? parseInt(existing.value, 10) + 1 : 1;
  await offlineDb.sync_meta.put({ key, value: String(nextSeq), updatedAt: now });

  const shortTerminal = terminalId.slice(-6).toUpperCase();
  return `OFF-${shortTerminal}-${date}-${String(nextSeq).padStart(4, "0")}`;
}
