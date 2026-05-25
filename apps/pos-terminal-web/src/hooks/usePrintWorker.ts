/**
 * usePrintWorker — automatic background print worker.
 *
 * Runs every POLL_INTERVAL ms while the POS tab is active.
 * Picks up pending print jobs from IndexedDB and attempts to print them
 * via the active PrinterProvider (Bluetooth first, Browser fallback).
 *
 * Only one worker runs at a time (lockRef prevents overlap).
 */

import { useEffect, useRef } from "react";
import {
  getPendingPrintJobs,
  markPrinting,
  markPrinted,
  markPrintFailed,
} from "@pos/offline";
import type { LocalPrintJob } from "@pos/offline";
import { getActivePrinterProvider } from "@/lib/printerProvider";
import type { ReceiptPrintPayload } from "@/lib/receiptPrinter";
import { getActiveTenantId } from "@/lib/tenant";

const POLL_INTERVAL_MS = 8_000;   // 8 s — frequent enough to be fast, not so fast it spams
const MAX_AUTO_RETRY   = 3;       // stop auto-retrying after this many failures on a single job

interface UsePrintWorkerOptions {
  terminalId: string | null;
  enabled?: boolean;
}

export function usePrintWorker({ terminalId, enabled = true }: UsePrintWorkerOptions): void {
  const lockRef   = useRef(false);
  const timerRef  = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!enabled || !terminalId) return;

    const tenantId = getActiveTenantId();

    async function runWorker() {
      if (lockRef.current) return;
      lockRef.current = true;

      try {
        const pending = await getPendingPrintJobs(tenantId, terminalId!);
        if (pending.length === 0) return;

        const provider = getActivePrinterProvider();

        // No real printer paired — skip auto-print entirely (browser print disabled)
        if (!provider) return;

        for (const job of pending) {
          // Skip jobs that have already failed too many times (manual reprint required)
          if ((job.retryCount ?? 0) >= MAX_AUTO_RETRY) continue;

          await markPrinting(job.id);
          try {
            const raw = job.payload as ReceiptPrintPayload & { createdAt: string | Date };
            const payload: ReceiptPrintPayload = {
              ...raw,
              createdAt:
                raw.createdAt instanceof Date
                  ? raw.createdAt
                  : new Date(raw.createdAt as string),
            };
            await provider.print(payload);
            await markPrinted(job.id);
          } catch (err) {
            await markPrintFailed(
              job.id,
              err instanceof Error ? err.message : "Auto-print gagal"
            );
          }
        }
      } catch {
        // silently ignore — worker will retry next interval
      } finally {
        lockRef.current = false;
      }
    }

    function schedule() {
      timerRef.current = setTimeout(async () => {
        await runWorker();
        schedule(); // chain next tick
      }, POLL_INTERVAL_MS);
    }

    // run immediately on mount, then every POLL_INTERVAL_MS
    runWorker();
    schedule();

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      lockRef.current = false;
    };
  }, [terminalId, enabled]);
}

// Convenience: re-export so callers don't need to import LocalPrintJob separately
export type { LocalPrintJob };
