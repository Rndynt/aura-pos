import {
  listDueInventorySyncErrors,
  markInventorySyncErrorFailed,
  markInventorySyncErrorResolved,
  markInventorySyncErrorRetrying,
  type InventorySyncErrorPayload,
} from '@pos/application/inventory';
import { deductStockForItems, reverseStockForItems } from '@pos/application/inventory/stockMovements';

interface InventorySyncRetryJobOptions {
  intervalMs?: number;
  batchSize?: number;
  maxRetries?: number;
  retryDelayMs?: number;
}

const DEFAULT_INTERVAL_MS = Number(process.env.INVENTORY_SYNC_RETRY_INTERVAL_MS ?? 60_000);
const DEFAULT_BATCH_SIZE = Number(process.env.INVENTORY_SYNC_RETRY_BATCH_SIZE ?? 25);
const DEFAULT_MAX_RETRIES = Number(process.env.INVENTORY_SYNC_RETRY_MAX_RETRIES ?? 5);
const DEFAULT_RETRY_DELAY_MS = Number(process.env.INVENTORY_SYNC_RETRY_DELAY_MS ?? 5 * 60_000);

let timer: NodeJS.Timeout | null = null;
let running = false;

function parsePayload(payload: unknown): InventorySyncErrorPayload | null {
  if (!payload || typeof payload !== 'object') return null;
  const candidate = payload as InventorySyncErrorPayload;
  if (!Array.isArray(candidate.items) || !candidate.context || candidate.policy !== 'allow_negative') return null;
  if (candidate.operation !== 'deduct_sale' && candidate.operation !== 'reverse_return') return null;
  return candidate;
}

async function retryOne(record: Awaited<ReturnType<typeof listDueInventorySyncErrors>>[number]) {
  await markInventorySyncErrorRetrying(record.id);
  const payload = parsePayload(record.payload);

  if (!payload) {
    throw new Error(`Invalid inventory sync payload for error ${record.id}`);
  }

  const moveStock = payload.operation === 'deduct_sale' ? deductStockForItems : reverseStockForItems;
  await moveStock(record.tenantId, payload.items, payload.context, { allowNegativeStock: true });
  await markInventorySyncErrorResolved(record.id);

  console.info('[inventory-sync-retry] resolved failed inventory movement', {
    syncErrorId: record.id,
    tenantId: record.tenantId,
    orderId: record.orderId,
    operation: payload.operation,
  });
}

export async function runInventorySyncRetryOnce(options: InventorySyncRetryJobOptions = {}) {
  if (running) return { processed: 0, skipped: true };

  const resolvedOptions: Required<InventorySyncRetryJobOptions> = {
    intervalMs: options.intervalMs ?? DEFAULT_INTERVAL_MS,
    batchSize: options.batchSize ?? DEFAULT_BATCH_SIZE,
    maxRetries: options.maxRetries ?? DEFAULT_MAX_RETRIES,
    retryDelayMs: options.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS,
  };

  running = true;
  let processed = 0;
  try {
    const due = await listDueInventorySyncErrors(resolvedOptions.batchSize);
    for (const record of due) {
      try {
        await retryOne(record);
        processed += 1;
      } catch (error) {
        await markInventorySyncErrorFailed(
          record.id,
          error,
          resolvedOptions.retryDelayMs,
          resolvedOptions.maxRetries,
        );
        console.warn('[inventory-sync-retry] retry failed; alert inventory operator', {
          syncErrorId: record.id,
          tenantId: record.tenantId,
          orderId: record.orderId,
          retryCount: record.retryCount + 1,
          maxRetries: resolvedOptions.maxRetries,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
    return { processed, skipped: false };
  } finally {
    running = false;
  }
}

export function startInventorySyncRetryJob(options: InventorySyncRetryJobOptions = {}) {
  if (timer) return () => stopInventorySyncRetryJob();

  const intervalMs = options.intervalMs ?? DEFAULT_INTERVAL_MS;
  timer = setInterval(() => {
    runInventorySyncRetryOnce(options).catch((error) => {
      console.warn('[inventory-sync-retry] job tick failed; alert inventory operator', {
        error: error instanceof Error ? error.message : String(error),
      });
    });
  }, intervalMs);
  timer.unref?.();

  runInventorySyncRetryOnce(options).catch((error) => {
    console.warn('[inventory-sync-retry] initial run failed; alert inventory operator', {
      error: error instanceof Error ? error.message : String(error),
    });
  });

  console.info('[inventory-sync-retry] job started', { intervalMs });
  return () => stopInventorySyncRetryJob();
}

export function stopInventorySyncRetryJob() {
  if (!timer) return;
  clearInterval(timer);
  timer = null;
}
