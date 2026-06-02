import { offlineDb } from "./db";

const SEQ_PREFIX = "order_seq";
const MAX_FALLBACK_RETRIES = 5;

function todayYMD(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}${m}${day}`;
}

function normalizeTerminalKey(terminalId: string): string {
  return terminalId.trim() || "unknown-terminal";
}

function formatLocalOrderNumber(terminalId: string, date: string, seq: number, suffix?: string): string {
  const normalizedTerminal = normalizeTerminalKey(terminalId);
  const shortTerminal = normalizedTerminal.slice(-6).toUpperCase();
  const baseNumber = `OFF-${shortTerminal}-${date}-${String(seq).padStart(4, "0")}`;
  return suffix ? `${baseNumber}-${suffix}` : baseNumber;
}

function randomFallbackSuffix(): string {
  const bytes = new Uint8Array(3);

  if (typeof globalThis.crypto?.getRandomValues === "function") {
    globalThis.crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i += 1) {
      bytes[i] = Math.floor(Math.random() * 256);
    }
  }

  return Array.from(bytes)
    .map((byte) => byte.toString(36).padStart(2, "0"))
    .join("")
    .slice(0, 6)
    .toUpperCase();
}

async function localOrderNumberExists(tenantId: string, terminalId: string, localOrderNumber: string): Promise<boolean> {
  const duplicate = await offlineDb.local_orders
    .where("tenantId")
    .equals(tenantId)
    .filter((order) => order.terminalId === terminalId && order.localOrderNumber === localOrderNumber)
    .first();

  return Boolean(duplicate);
}

/**
 * Generate a local offline order number.
 * Format: OFF-{shortTerminalId}-{YYYYMMDD}-{seq:04}[-fallback]
 * Sequence is per-tenant-per-terminal-per-day, stored in sync_meta.
 * No duplicate local order numbers within the same tenant+terminal+day scope.
 */
export async function generateLocalOrderNumber(tenantId: string, terminalId: string): Promise<string> {
  const date = todayYMD();
  const terminalKey = normalizeTerminalKey(terminalId);
  const key = `${SEQ_PREFIX}:${tenantId}:${terminalKey}:${date}`;

  return offlineDb.transaction("rw", [offlineDb.sync_meta, offlineDb.local_orders], async () => {
    const now = new Date().toISOString();
    const existing = await offlineDb.sync_meta.get(key);
    const currentSeq = existing ? Number.parseInt(existing.value, 10) : 0;
    const nextSeq = Number.isFinite(currentSeq) && currentSeq > 0 ? currentSeq + 1 : 1;
    const candidate = formatLocalOrderNumber(terminalId, date, nextSeq);

    await offlineDb.sync_meta.put({ key, value: String(nextSeq), updatedAt: now });

    if (!(await localOrderNumberExists(tenantId, terminalId, candidate))) {
      return candidate;
    }

    for (let attempt = 0; attempt < MAX_FALLBACK_RETRIES; attempt += 1) {
      const fallbackNumber = formatLocalOrderNumber(terminalId, date, nextSeq, randomFallbackSuffix());

      if (!(await localOrderNumberExists(tenantId, terminalId, fallbackNumber))) {
        return fallbackNumber;
      }
    }

    return formatLocalOrderNumber(terminalId, date, nextSeq, `${Date.now().toString(36).toUpperCase()}`);
  });
}
