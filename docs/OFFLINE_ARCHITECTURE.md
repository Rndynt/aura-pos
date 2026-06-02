# AuraPoS Offline Architecture

## Application Modes

| Mode | Condition | POS Behaviour |
|------|-----------|---------------|
| `online` | `navigator.onLine === true`, API reachable | Writes go directly to server; local DB is kept as mirror |
| `offline` | `navigator.onLine === false` or fetch throws | Writes saved to IndexedDB + outbox; UI shows Offline badge |
| `syncing` | Online **and** `sync_outbox` has pending items | Drain runs; UI shows Syncing badge with item count |
| `degraded` | Online but catalog/features cache is stale | POS usable with stale data; staleness banner shown |
| `conflict` | One or more outbox items in `conflict` status | Badge turns red; link to Sync Conflicts page shown |

The mode is derived by `useNetworkStatus` (frontend) from `navigator.onLine` + pending count. The mode is **never persisted** — it is computed on every render.

---

## Data Sources

```
Server PostgreSQL  ──► source of truth
       │
       │  Sync Engine (online)
       ▼
  IndexedDB          ──► local working store
  AuraPoSOfflineDB
       │
       │  POS reads/writes (always)
       ▼
  sync_outbox        ──► durable mutation queue
       │
       │  Sync Engine drains
       ▼
  Server PostgreSQL
```

**Rule:** The UI always reads from IndexedDB for catalog/config data. Online data is fetched from the server and immediately written to IndexedDB as a cache.

**Exception:** Real-time order queue and kitchen tickets use the server API directly (SSE / polling) because they need live multi-terminal updates.

---

## Core Principles

1. **Every offline order has `localId`** — `nanoid()` generated at creation time, before any network call.
2. **Every mutation has `idempotencyKey`** — format `{terminalId}:{Date.now()}:{nanoid(8)}`. Sent as `x-idempotency-key` header on every create-and-pay request.
3. **Printing goes through the print queue** — never fire-and-forget from payment handlers.
4. **UI treats an order as local until `syncStatus === "synced"`** — a local order is NOT a server order until confirmed.
5. **Cart cleared only after durable save** — `clearCartSession()` is called only after `createLocalOrder()` or server response succeeds.
6. **No mutation via service worker** — the service worker only caches GET responses. All POSTs/PATCHes go through the outbox queue.
7. **Local order number allocation is terminal-scoped and transactional** — `generateLocalOrderNumber()` increments the `sync_meta` sequence key `order_seq:{tenantId}:{terminalId}:{YYYYMMDD}` inside a Dexie transaction and checks `local_orders` for duplicates before returning.

---

## IndexedDB Schema (`AuraPoSOfflineDB`)

| Table | Key | Purpose |
|-------|-----|---------|
| `local_tenants` | `id` | Cached tenant profile |
| `local_features` | `id` | Cached feature flags |
| `local_products` | `id` | Product catalog cache |
| `local_categories` | `id` | Category cache |
| `local_order_types` | `id` | Order type cache |
| `local_tables` | `id` | Table list cache |
| `local_terminal` | `terminalId` | Terminal identity |
| `local_cart_sessions` | `id` | Active cart + held drafts (draft: prefix) |
| `local_orders` | `localId` | Local order records |
| `local_order_items` | `id` | Items per local order |
| `local_order_payments` | `id` | Payments per local order |
| `local_print_jobs` | `id` | Pending print jobs |
| `local_kitchen_tickets` | `id` | Offline kitchen display tickets |
| `sync_outbox` | `id` | Durable mutation queue |
| `sync_attempts` | `id` | Per-attempt audit log |
| `sync_conflicts` | `id` | Local conflict records |
| `sync_meta` | `key` | Sequence counters keyed by tenant/terminal/date, cache timestamps |

Database name: `AuraPoSOfflineDB`, current version: **2**

---

## Conflict Policy

| Conflict Type | Severity | Default Policy | UI Action |
|--------------|----------|----------------|-----------|
| `PRICE_CHANGED` | warning | `audit_note` — accept offline price, flag for review | Show in conflicts page |
| `STOCK_INSUFFICIENT` | warning | `audit_note` — allow negative stock, flag for review | Show in conflicts page |
| `PRODUCT_INACTIVE` | blocking | `discard` — order cannot be replayed | Manual resolution required |
| `PRODUCT_NOT_FOUND` | blocking | `discard` | Manual resolution required |
| `ORDER_DUPLICATE` | needs_review | `auto_accept` — idempotency replay | No action needed |
| `PAYMENT_DUPLICATE` | needs_review | `auto_accept` — idempotency replay | No action needed |
| `TENANT_FEATURE_DISABLED` | blocking | `discard` | Manual resolution required |
| `ORDER_TYPE_DISABLED` | blocking | `discard` | Manual resolution required |
| `TABLE_UNAVAILABLE` | warning | `audit_note` | Admin assigns or moves table |
| `TERMINAL_INACTIVE` | blocking | `discard` | Reactivate terminal from admin |
| `SYNC_CONFLICT` | needs_review | `manual_review` | Owner/manager action required |

All conflict records are stored in `server_sync_conflicts` (server) and `sync_conflicts` (local IndexedDB).

---

## Offline Operational Limits

| Limit | Recommended Value | Enforcement |
|-------|------------------|-------------|
| Max offline duration | 24 hours | Warning banner; no hard block |
| Max pending orders per terminal | 500 | Outbox size warning |
| Product cache max age | 24 hours (full); 6 hours (warning banner) | `isCatalogStale()` |
| Batch sync size | 50 orders per request | Enforced by `SyncOfflineOrder` |
| Sync retry max | 8 attempts per outbox item | Backoff up to 5 min; then manual-only |
| Stock-sensitive offline sell | Allowed with `audit_note` | Conflict logged on sync |
| Offline session expiry | 8 hours (cashier shift) | PIN re-entry prompt (planned Sprint 7) |

---

## Recovery Behaviour

| Scenario | What Happens |
|----------|-------------|
| Browser refresh | Cart recovered from `local_cart_sessions`; outbox resumes on next sync |
| Tab crash | Same as refresh — IndexedDB is durable |
| Device shutdown (graceful) | Same as tab crash |
| Printer failure | Print job stays in `local_print_jobs` with status `failed`; cashier can reprint |
| Partial sync failure | Succeeded items marked `synced`; failed items remain `pending` for retry with backoff |
| Sync conflict | Item marked `conflict` in outbox and `server_sync_conflicts`; requires manual review |
| Auth session expiry | Offline transactions preserved in IndexedDB; cashier must re-login before next sync |
| Device lost / stolen | Terminal can be deactivated from admin; backend rejects all future syncs from it |

---

## Data Flow: Cart to Sync

```
Cashier taps "Pay"
        │
        ▼
useOfflineOrderSubmit.submitOrder()
        │
        ├──[online]──► POST /api/orders/create-and-pay
        │              + x-idempotency-key header
        │              │
        │              ├──[200/201]──► mirrorServerOrderLocally()
        │              │              clearCartSession()
        │              │              return { isLocal: false }
        │              │
        │              ├──[400/422]──► throw validation error (NO local fallback)
        │              │
        │              └──[network/5xx]──► fallback to local
        │
        └──[offline / network fallback]──► createLocalOrder()
                                   ├── Generate localId (nanoid)
                                   ├── Generate idempotencyKey
                                   ├── Generate localOrderNumber (OFF-...) via sync_meta transaction
                                   ├── Compute pricing (subtotal + tax + service)
                                   ├── Dexie transaction:
                                   │   ├── local_orders.put(order)
                                   │   ├── local_order_items.bulkPut(items)
                                   │   └── local_order_payments.put(payment)
                                   ├── enqueueOutbox(orderPayload)
                                   └── clearCartSession()
                                       return { isLocal: true, order_number: "OFF-..." }

Later, when online:
        │
useSyncEngine.run() (triggered on: mount / window.online / 30s interval / manual)
        │
        ▼
runSyncEngine()
        ├── dequeuePendingOutbox(25) — filters nextRetryAt <= now
        ├── Group order-creates by (tenantId, terminalId)
        ├── POST /api/sync/offline-orders (batch ≤ 25)
        │   body: { terminal_id, orders: [{ local_order_id, idempotency_key, items, ... }] }
        │   │
        │   Per-item result:
        │   ├──[synced]──► markOutboxSynced(); local_orders.update(serverId, serverOrderNumber, syncStatus="synced")
        │   ├──[replayed]──► same as synced (idempotency hit — no duplicate)
        │   ├──[conflict]──► markOutboxConflict(); local_orders.update(syncStatus="conflict")
        │   └──[failed]──► markOutboxFailed(); exponential backoff applied
        │
        └── sync_meta.last_sync_at updated
```

---

## Print Flow

```
Order success (local or server)
        │
        ▼
enqueuePrintJob({ type: "receipt", payload: receiptData })
        │
        ▼
local_print_jobs  (IndexedDB, status: "pending")
        │
usePrintWorker (polls every 8s)
        │
        ├──[printer available]──► markPrinting → print() → markPrinted
        │
        └──[printer unavailable / error]──► markPrintFailed (retryCount++)
                                           after 3 auto-retries: manual-only
                                           cashier sees "X cetak gagal" in layout
                                           → click → /printers → reprint
```

---

## Service Worker Caching Strategy

| URL Pattern | Strategy | Fallback |
|-------------|----------|---------|
| Navigation (`request.mode === 'navigate'`) | NetworkFirst (3 s timeout) | `/index.html` |
| Static assets (`js`, `css`, `png`, `svg`, `woff2`) | CacheFirst | Cached version |
| `/api/*` GET | Not cached by SW | Frontend reads from IndexedDB |
| `/api/*` POST/PATCH/DELETE | Not intercepted | Goes to fetch; handled by outbox if offline |

The service worker **never intercepts mutation requests**. The outbox pattern handles all write durability.

---

## Multi-Terminal Considerations

When multiple terminals operate offline simultaneously on the same tenant:

- Each terminal has a unique `terminalId` → unique idempotency key space
- Local order numbers are per-terminal-per-day (`OFF-{terminal}-{date}-{seq}`)
- Table assignment can conflict (same table claimed by two offline terminals)
  - Detected as `TABLE_UNAVAILABLE` conflict during sync
  - Policy: `audit_note` — order is created, conflict stored for review
- Kitchen tickets from offline terminals are stored locally and sync independently
- No cross-terminal real-time sync in pure offline scenarios (expected limitation)

---

## Security Considerations

- All sync endpoints require valid tenant context (subdomain or `x-tenant-id` header)
- `x-tenant-id` header is disabled in production (`ALLOW_TENANT_HEADER=false`) — planned Sprint 7
- Terminal deactivation blocks all future syncs from that terminal's `terminalId`
- Idempotency keys prevent duplicate orders even from compromised/buggy terminals
- IndexedDB data is isolated per browser origin — no cross-tenant data leakage possible

---

## Known Limitations (Current Sprints 1–5)

- Table offline status not yet fully persisted/reconciled (schema exists, write logic pending)
- Inventory movement ledger not yet implemented (Phase 17)
- RBAC enforcement on backend routes not yet complete (Phase 16)
- Offline session PIN unlock not yet implemented (Phase 16)
- E2E automated tests not yet written (Phase 22)
