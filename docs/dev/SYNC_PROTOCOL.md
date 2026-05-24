# AuraPoS Sync Protocol

## Overview

The sync protocol defines how offline mutations created on a POS terminal are safely delivered to the server and how the client reconciles the results.

---

## Outbox Item Lifecycle

```
 pending
    │
    │  runSyncEngine() picks it up
    ▼
 syncing
    │
    ├──[200 / 201]──────────────────► synced
    │
    ├──[409 / 422]──────────────────► conflict
    │
    ├──[5xx / network error]
    │  attempts < 8 ────────────────► failed  (retried after backoff)
    │  attempts ≥ 8 ────────────────► failed  (permanent, manual retry only)
    │
    └──[manual resetOutboxForManualRetry()]──► pending
```

---

## Batch Sync Request

**Endpoint:** `POST /api/sync/offline-orders`

**Headers:**
```
Content-Type: application/json
x-tenant-id: {tenantId}
```

**Body:**
```json
{
  "terminal_id": "TERM-ABC123-XY9Z8W",
  "app_version": "1.2.0",
  "orders": [
    {
      "local_order_id": "abc123",
      "local_order_number": "OFF-XY9Z8W-20260524-0001",
      "idempotency_key": "TERM-ABC123-XY9Z8W:1716800000000:aBcD1234",
      "items": [
        {
          "product_id": "prod_001",
          "product_name": "Kopi Susu",
          "base_price": 25000,
          "quantity": 2,
          "variant_id": "var_hot",
          "variant_name": "Hot",
          "variant_price_delta": 0,
          "selected_options": [],
          "notes": ""
        }
      ],
      "order_type_id": "ot_dinein",
      "customer_name": "Budi",
      "table_number": "5",
      "tax_rate": 0.1,
      "service_charge_rate": 0.05,
      "amount": 55000,
      "payment_method": "cash",
      "client_created_at": "2026-05-24T10:30:00.000Z",
      "source_terminal_id": "TERM-ABC123-XY9Z8W"
    }
  ]
}
```

**Max batch size:** 50 orders per request.

---

## Batch Sync Response

```json
{
  "success": true,
  "data": {
    "batch_id": "batch_uuid",
    "processed": 1,
    "synced": 1,
    "replayed": 0,
    "failed": 0,
    "conflicts": 0,
    "results": [
      {
        "local_order_id": "abc123",
        "local_order_number": "OFF-XY9Z8W-20260524-0001",
        "status": "synced",
        "server_order_id": "srv_order_001",
        "server_order_number": "ORD-20260524-001",
        "warnings": []
      }
    ]
  }
}
```

**Per-item `status` values:**

| Status | Meaning | Client Action |
|--------|---------|---------------|
| `synced` | Created successfully | Update local_orders with serverId; mark outbox synced |
| `replayed` | Already created (idempotency hit) | Same as synced — use existing server IDs |
| `conflict` | Conflict detected (price, stock, inactive product, etc.) | Mark outbox conflict; store in sync_conflicts |
| `failed` | Validation or internal error | Mark outbox failed; show in SyncStatusWidget |

A batch **always** returns a result for every submitted order. If one order has a conflict, the others are not aborted.

---

## Client-Side Reconciliation

After receiving the batch response, `syncEngine.ts` performs the following for each result:

```
result.status === "synced" OR "replayed":
  → markOutboxSynced(outboxItem.id)
  → offlineDb.local_orders.update(localId, {
      serverId: result.server_order_id,
      serverOrderNumber: result.server_order_number,
      syncStatus: "synced",
      syncedAt: now,
    })

result.status === "conflict":
  → markOutboxConflict(outboxItem.id, result.error)
  → offlineDb.local_orders.update(localId, { syncStatus: "conflict" })
  → (server stores full conflict detail in server_sync_conflicts)

result.status === "failed":
  → markOutboxFailed(outboxItem.id, result.error)
  → (exponential backoff applied; item retried on next sync)
```

---

## Retry and Backoff

| Attempt | Delay |
|---------|-------|
| 1 | 2 s |
| 2 | 4 s |
| 3 | 8 s |
| 4 | 16 s |
| 5 | 32 s |
| 6 | 64 s |
| 7 | 128 s (~2 min) |
| 8 | 300 s (5 min, max) |
| > 8 | Permanent failure; manual retry only |

Backoff uses `nextRetryAt` timestamp stored on the outbox item. `dequeuePendingOutbox()` filters out items whose `nextRetryAt` is in the future.

---

## Sync Trigger Events

Managed by `useSyncEngine`:

1. **App mount** — runs immediately on component mount
2. **`window.online` event** — runs when browser regains connectivity
3. **30-second interval** — runs every 30 s while online
4. **Manual trigger** — `SyncStatusWidget` button calls `useSyncEngine().run()`

A mutex (`lockRef`) prevents concurrent sync runs. If sync is already running, additional triggers are silently ignored.

---

## Sync Audit (Backend)

Every batch creates records in:

- `sync_batches` — one row per `POST /api/sync/offline-orders` call
- `sync_events` — one row per order item (synced/replayed/conflict/failed)
- `server_sync_conflicts` — detailed record for each conflict

Accessible via:
- `GET /api/sync/batches` — recent batch history
- `GET /api/sync/events` — per-item event log
- `GET /api/sync/conflicts` — conflict list with resolution status

---

## Error Response Codes

| HTTP Code | Meaning | Client Behaviour |
|-----------|---------|-----------------|
| 200 | Batch processed (may include per-item conflicts/failures) | Parse `results[]` |
| 400 | Malformed request body | Do not retry; log error |
| 401 | Not authenticated | Re-login required |
| 403 | Tenant mismatch or terminal inactive | Do not retry |
| 422 | Validation error | Do not retry; show error |
| 429 | Rate limited | Retry with backoff |
| 500/503 | Server error | Retry with backoff |
| Network error | fetch() throws | Retry with backoff |
