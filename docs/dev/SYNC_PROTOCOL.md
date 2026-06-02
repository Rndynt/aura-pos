# AuraPoS Sync Protocol

## Overview

The sync protocol defines how offline mutations created on a POS terminal are safely delivered to the server and how the client reconciles the results.

**Key guarantees:**
- Same request sent N times creates exactly 1 order (idempotency)
- 1 conflict in a batch does not abort the remaining items (partial batch)
- Sync never runs concurrently (mutex lock in `useSyncEngine`)
- Every sync event is auditable (server-side `sync_batches`, `sync_events` tables)

---

## Outbox Item Lifecycle

```
 local_only / pending_sync
    │
    │  runSyncEngine() picks it up
    ▼
 syncing
    │
    ├──[HTTP 200 / 201]──────────────────► synced
    │
    ├──[HTTP 409 / 422]──────────────────► conflict   (no retry — human review)
    │
    ├──[HTTP 5xx / network error]
    │  attempts < 8 ────────────────────► failed      (retried with backoff)
    │  attempts ≥ 8 ────────────────────► failed      (permanent, manual retry only)
    │
    └──[resetOutboxForManualRetry()]──────► pending    (user-initiated retry)
```

---

## Sync Trigger Conditions

Managed by `useSyncEngine` hook, which is mounted inside `SyncStatusWidget` (always present in `MainLayout`):

| Trigger | When |
|---------|------|
| App mount | Immediately on `SyncStatusWidget` mount |
| `window.online` event | Browser regains connectivity |
| 30-second interval | While online (prevents stale queue build-up) |
| Manual sync | User clicks `SyncStatusWidget` button |

A `lockRef` mutex prevents concurrent sync runs. Additional triggers while syncing are silently ignored.

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
      "local_order_id": "nanoid-abc123",
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
      "notes": "",
      "tax_rate": 0.1,
      "service_charge_rate": 0.05,
      "amount": 55000,
      "payment_method": "cash",
      "transaction_ref": null,
      "payment_notes": null,
      "client_created_at": "2026-05-24T10:30:00.000Z",
      "source_terminal_id": "TERM-ABC123-XY9Z8W"
    }
  ]
}
```

**Constraints:**
- Max batch size: **50 orders** per request
- `idempotency_key` must be 8–128 characters
- `items` must have at least 1 item with `quantity >= 1`
- `amount` must be positive

---

## Batch Sync Response

**Success (HTTP 200):**
```json
{
  "success": true,
  "data": {
    "batch_id": "batch_uuid",
    "processed": 3,
    "synced": 2,
    "replayed": 0,
    "failed": 0,
    "conflicts": 1,
    "results": [
      {
        "local_order_id": "nanoid-abc123",
        "local_order_number": "OFF-XY9Z8W-20260524-0001",
        "status": "synced",
        "server_order_id": "srv_order_001",
        "server_order_number": "ORD-20260524-001",
        "warnings": []
      },
      {
        "local_order_id": "nanoid-def456",
        "local_order_number": "OFF-XY9Z8W-20260524-0002",
        "status": "replayed",
        "server_order_id": "srv_order_002",
        "server_order_number": "ORD-20260524-002"
      },
      {
        "local_order_id": "nanoid-ghi789",
        "local_order_number": "OFF-XY9Z8W-20260524-0003",
        "status": "conflict",
        "error": "PRODUCT_INACTIVE: Product 'Kopi Arabica' is no longer active"
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
| `conflict` | Conflict detected | Mark outbox conflict; store in sync_conflicts; badge turns red |
| `failed` | Validation or internal error | Mark outbox failed; exponential backoff; retry later |

A batch **always** returns a result for every submitted order. If one order has a conflict, the others proceed normally.

**Error responses:**

| HTTP | Body | Meaning |
|------|------|---------|
| 400 | `{ "error": "VALIDATION_ERROR", "message": "..." }` | Malformed request |
| 401 | `{ "error": "UNAUTHORIZED" }` | Session expired |
| 403 | `{ "error": "FORBIDDEN" }` | Tenant mismatch or terminal inactive |
| 429 | `{ "error": "RATE_LIMITED" }` | Too many requests |
| 500 | `{ "error": "INTERNAL_ERROR" }` | Server error |

---

## Client-Side Reconciliation

After receiving the batch response, `syncEngine.ts` performs the following per result:

```typescript
// synced or replayed:
await markOutboxSynced(outboxItem.id);
await offlineDb.local_orders.update(localId, {
  serverId: result.server_order_id,
  serverOrderNumber: result.server_order_number,
  syncStatus: "synced",
  syncedAt: new Date().toISOString(),
});

// conflict:
await markOutboxConflict(outboxItem.id, result.error);
await offlineDb.local_orders.update(localId, { syncStatus: "conflict" });
// server has already stored full detail in server_sync_conflicts

// failed:
await markOutboxFailed(outboxItem.id, result.error);
// exponential backoff applied — item retried after nextRetryAt
```

---

## Exponential Backoff

| Attempt | Delay | Human |
|---------|-------|-------|
| 1 | 2,000 ms | 2 s |
| 2 | 4,000 ms | 4 s |
| 3 | 8,000 ms | 8 s |
| 4 | 16,000 ms | 16 s |
| 5 | 32,000 ms | 32 s |
| 6 | 64,000 ms | ~1 min |
| 7 | 128,000 ms | ~2 min |
| 8+ | 300,000 ms | 5 min (max; then manual-only) |

Formula: `min(2^attempts * 1000, 5 * 60 * 1000)` ms.

`dequeuePendingOutbox()` filters out items whose `nextRetryAt > now`. After 8 attempts, `nextRetryAt` is null and status stays `"failed"` — only `resetOutboxForManualRetry()` can restart it.

---

## Individual Item Sync (Non-Order Outbox Types)

Outbox items with `entityType !== "order"` are synced individually (not batched):

```typescript
await fetch(item.endpoint, {
  method: item.method,
  headers: {
    "Content-Type": "application/json",
    "x-idempotency-key": item.idempotencyKey,
    "x-tenant-id": item.tenantId,
  },
  body: JSON.stringify(item.payload),
});
// HTTP 200/201 → markOutboxSynced
// HTTP 409/422 → markOutboxConflict
// HTTP 5xx / network → markOutboxFailed (with backoff)
```

---

## Online Path (Direct API — No Outbox)

When online, `useOfflineOrderSubmit` submits directly to the API:

```
useOfflineOrderSubmit.submitOrder()
  │
  ├─[online]─► POST /api/orders/create-and-pay
  │            headers: x-idempotency-key, x-tenant-id, Content-Type
  │
  │            HTTP 200/201 ─► mirrorServerOrderLocally() ─► clearCartSession() ─► success
  │            HTTP 400/422 ─► throw validation error (NO local fallback)
  │            HTTP 5xx     ─► fallback to createLocalOrder() + enqueueOutbox()
  │            NetworkError ─► fallback to createLocalOrder() + enqueueOutbox()
  │
  └─[offline / fallback]─► createLocalOrder() ─► enqueueOutbox() ─► success
```

The idempotency key is generated **before** the first attempt. If the server received the request but the response was lost in transit, the subsequent outbox sync will be a no-op `replayed` result.

---

## Server-Side Audit Tables

Every batch sync creates records in three tables:

### `sync_batches` — one row per batch call
```sql
id, tenant_id, outlet_id, terminal_id, batch_size, synced, replayed, failed, conflicts, app_version, created_at
```

### `sync_events` — one row per order item in batch
```sql
id, tenant_id, outlet_id, batch_id, terminal_id, local_order_id, local_order_number,
server_order_id, server_order_number, status, conflict_type, error_message, created_at
```

### `server_sync_conflicts` — full detail per conflict
```sql
id, tenant_id, outlet_id, terminal_id, local_order_id, server_order_id,
conflict_type, message, conflict_data (jsonb),
resolution (pending|resolved|ignored|auto_resolved),
resolved_at, resolved_by, created_at
```

**Admin API:**
```
GET  /api/sync/batches              — list recent batches (default limit 20, max 100)
GET  /api/sync/events               — per-item audit log (default limit 50, max 200)
GET  /api/sync/conflicts            — conflict list with resolution (default limit 20, max 100)
PATCH /api/sync/conflicts/:id/resolve — mark resolved or ignored
```

For authenticated POS users, sync audit lists and conflict resolution are scoped to the active outlet resolved by `req.outletId`. Non-owner users must have an active `user_outlet_assignments` row for that outlet; otherwise the API returns `OUTLET_ACCESS_DENIED`. Offline sync batches also stamp `outlet_id` on batches, per-item events, server-side conflicts, orders, and inventory movement ledger entries when an outlet context is present.

---

## HTTP Error Handling Matrix

| HTTP | Meaning | Client Behaviour |
|------|---------|-----------------|
| 200 | Batch processed | Parse `results[]`; some items may be conflict/failed |
| 400 | Malformed request | Do not retry; fix client code; log error |
| 401 | Not authenticated | Re-login required; preserve outbox items |
| 403 | Tenant mismatch / terminal inactive | Do not retry; contact admin |
| 422 | Validation error | Do not retry; log as permanent failure |
| 429 | Rate limited | Retry with exponential backoff |
| 500 | Server error | Retry with exponential backoff |
| 503 | Service unavailable | Retry with exponential backoff |
| `TypeError` (network) | Offline / DNS fail | Retry with exponential backoff |

---

## Debugging Sync Issues

### Check outbox state
Browser DevTools → Application → IndexedDB → AuraPoSOfflineDB → sync_outbox

| Look for | Meaning |
|----------|---------|
| `status: "failed"`, `attemptCount >= 8` | Permanent failure; needs manual retry from `/local-orders` |
| `status: "conflict"` | Admin review needed on `/sync-conflicts` page |
| `status: "syncing"` (stale) | Sync interrupted; will auto-reset on next run |
| `nextRetryAt` in the future | Normal backoff — will retry automatically |

### Check server sync audit
```http
GET /api/sync/batches?limit=20
GET /api/sync/events?limit=50
GET /api/sync/conflicts?limit=20
```

### Investigate a suspected duplicate order
1. Search `orders` by `idempotency_key` — should return exactly 1 row
2. Check `sync_events` for the `local_order_id` — look for multiple `synced` events
3. Check `sync_batches` for the terminal's full batch history
4. Verify unique index `orders_tenant_idempotency_key_unique` is present in DB
