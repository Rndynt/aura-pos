import { dequeuePendingOutbox, markOutboxConflict, markOutboxFailed, markOutboxSynced, markOutboxSyncing } from "./outbox";
import { offlineDb } from "./db";
import type { SyncOutboxItem } from "./types";

export type SyncEngineResult = {
  processed: number;
  synced: number;
  failed: number;
  conflicts: number;
};

// ── Helpers ────────────────────────────────────────────────────────────────────

function nowIso() {
  return new Date().toISOString();
}

/** Shape expected by POST /api/sync/offline-orders for each order item */
interface BatchOrderPayload {
  local_order_id: string;
  local_order_number: string;
  idempotency_key: string;
  items: unknown[];
  order_type_id?: string;
  customer_name?: string;
  table_number?: string;
  notes?: string;
  tax_rate?: number;
  service_charge_rate?: number;
  amount: number;
  payment_method: string;
  transaction_ref?: string;
  payment_notes?: string;
  client_created_at?: string;
  source_terminal_id?: string;
}

interface BatchOrderResult {
  local_order_id: string;
  local_order_number: string;
  status: "synced" | "replayed" | "conflict" | "failed";
  server_order_id?: string;
  server_order_number?: string;
  error?: string;
}

interface BatchResponse {
  success: boolean;
  data: {
    batch_id: string;
    processed: number;
    synced: number;
    replayed: number;
    failed: number;
    conflicts: number;
    results: BatchOrderResult[];
  };
}

// ── Batch sync for offline orders ─────────────────────────────────────────────

async function syncOrderBatch(
  orderItems: SyncOutboxItem[],
  token?: string
): Promise<void> {
  if (orderItems.length === 0) return;

  // All items in one batch belong to the same tenant+terminal
  const tenantId = orderItems[0].tenantId;
  const terminalId = orderItems[0].terminalId;

  // Mark all as syncing
  await Promise.all(orderItems.map((item) => markOutboxSyncing(item.id)));

  // Build batch body
  const orders: BatchOrderPayload[] = orderItems.map((item) => {
    const p = (item.payload ?? {}) as Record<string, unknown>;
    return {
      local_order_id: (p.local_order_id as string) ?? item.localEntityId,
      local_order_number: (p.local_order_number as string) ?? item.localEntityId,
      idempotency_key: item.idempotencyKey,
      items: (p.items as unknown[]) ?? [],
      order_type_id: p.order_type_id as string | undefined,
      customer_name: p.customer_name as string | undefined,
      table_number: p.table_number as string | undefined,
      notes: p.notes as string | undefined,
      tax_rate: p.tax_rate as number | undefined,
      service_charge_rate: p.service_charge_rate as number | undefined,
      amount: (p.amount as number) ?? 0,
      payment_method: (p.payment_method as string) ?? "cash",
      transaction_ref: p.transaction_ref as string | undefined,
      payment_notes: p.payment_notes as string | undefined,
      client_created_at: p.client_created_at as string | undefined,
      source_terminal_id: (p.source_terminal_id as string) ?? terminalId,
    };
  });

  try {
    const res = await fetch("/api/sync/offline-orders", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-tenant-id": tenantId,
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ terminal_id: terminalId, orders }),
    });

    if (!res.ok) {
      const txt = await res.text();
      // Mark all as failed on HTTP error
      await Promise.all(orderItems.map((item) => markOutboxFailed(item.id, txt || `http:${res.status}`)));
      return;
    }

    const data: BatchResponse = await res.json();
    const results = data?.data?.results ?? [];
    const now = nowIso();

    // Process per-item results
    for (const itemResult of results) {
      const outboxItem = orderItems.find(
        (i) => {
          const p = (i.payload ?? {}) as Record<string, unknown>;
          return (p.local_order_id as string ?? i.localEntityId) === itemResult.local_order_id;
        }
      );
      if (!outboxItem) continue;

      if (itemResult.status === "synced" || itemResult.status === "replayed") {
        await markOutboxSynced(outboxItem.id);

        // Update local_orders with server IDs
        const localId = outboxItem.localEntityId;
        if (localId && (itemResult.server_order_id || itemResult.server_order_number)) {
          await offlineDb.local_orders
            .update(localId, {
              serverId: itemResult.server_order_id,
              serverOrderNumber: itemResult.server_order_number,
              syncStatus: "synced",
              syncedAt: now,
            })
            .catch(() => undefined);
        }
      } else if (itemResult.status === "conflict") {
        await markOutboxConflict(outboxItem.id, itemResult.error ?? "conflict");
        // Mark local order as conflict
        await offlineDb.local_orders
          .update(outboxItem.localEntityId, { syncStatus: "conflict" })
          .catch(() => undefined);
      } else {
        await markOutboxFailed(outboxItem.id, itemResult.error ?? "failed");
      }
    }

    // Handle any items not in results (shouldn't happen, but safety fallback)
    for (const item of orderItems) {
      const p = (item.payload ?? {}) as Record<string, unknown>;
      const localOrderId = (p.local_order_id as string) ?? item.localEntityId;
      const found = results.find((r) => r.local_order_id === localOrderId);
      if (!found) {
        await markOutboxFailed(item.id, "no_result_in_batch");
      }
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : "network_error";
    await Promise.all(orderItems.map((item) => markOutboxFailed(item.id, msg)));
  }
}

// ── Main sync engine ───────────────────────────────────────────────────────────

export async function runSyncEngine(token?: string): Promise<SyncEngineResult> {
  const queue = await dequeuePendingOutbox(25);
  let synced = 0;
  let failed = 0;
  let conflicts = 0;

  if (queue.length === 0) {
    return { processed: 0, synced: 0, failed: 0, conflicts: 0 };
  }

  // ── Separate offline order-creates from other outbox items ────────────────
  const orderCreates = queue.filter(
    (i) => i.entityType === "order" && i.operation === "create"
  );
  const others = queue.filter(
    (i) => !(i.entityType === "order" && i.operation === "create")
  );

  // ── Batch sync for orders ─────────────────────────────────────────────────
  // Group by (tenantId, terminalId) — usually one group per session
  const orderGroups = new Map<string, SyncOutboxItem[]>();
  for (const item of orderCreates) {
    const key = `${item.tenantId}::${item.terminalId}`;
    if (!orderGroups.has(key)) orderGroups.set(key, []);
    orderGroups.get(key)!.push(item);
  }

  for (const group of orderGroups.values()) {
    // Send in sub-batches of max 25
    for (let i = 0; i < group.length; i += 25) {
      const chunk = group.slice(i, i + 25);
      await syncOrderBatch(chunk, token);
    }
  }

  // Count results from orderCreates
  for (const item of orderCreates) {
    const updated = await offlineDb.sync_outbox.get(item.id);
    if (updated?.status === "synced") synced++;
    else if (updated?.status === "conflict") conflicts++;
    else failed++;
  }

  // ── Individual sync for other outbox item types ───────────────────────────
  for (const item of others) {
    await markOutboxSyncing(item.id);
    try {
      const res = await fetch(item.endpoint, {
        method: item.method,
        headers: {
          "Content-Type": "application/json",
          "x-idempotency-key": item.idempotencyKey,
          "x-tenant-id": item.tenantId,
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: item.method === "DELETE" ? undefined : JSON.stringify(item.payload),
      });

      if (res.status === 200 || res.status === 201) {
        await markOutboxSynced(item.id);
        synced++;
      } else if (res.status === 409 || res.status === 422) {
        const txt = await res.text();
        await markOutboxConflict(item.id, txt || `conflict:${res.status}`);
        conflicts++;
      } else {
        const txt = await res.text();
        await markOutboxFailed(item.id, txt || `failed:${res.status}`);
        failed++;
      }
    } catch (error) {
      await markOutboxFailed(item.id, error instanceof Error ? error.message : "network_error");
      failed++;
    }
  }

  return { processed: queue.length, synced, failed, conflicts };
}
