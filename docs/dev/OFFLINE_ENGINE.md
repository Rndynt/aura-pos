# AuraPoS Offline Engine — Developer Guide

## Overview

The offline engine is contained in `packages/offline/`. It provides:

- **IndexedDB** storage via Dexie (local orders, catalog cache, outbox)
- **Terminal identity** (persistent `terminalId` per browser/device)
- **Cart persistence** (survives refresh and crash)
- **Local order creation** (atomic IndexedDB transaction)
- **Sync outbox** (durable mutation queue with exponential backoff)
- **Sync engine** (drain outbox when online)
- **Print queue** (durable receipt/kitchen ticket print jobs)
- **Kitchen queue** (offline kitchen display tickets)
- **Conflict types** (severity + resolution policy)

The package is imported by `apps/pos-terminal-web` and has **no Node.js dependencies** — it runs entirely in the browser.

---

## Package Structure

```
packages/offline/src/
├── db.ts                — Dexie database class + singleton instance (offlineDb)
├── schema.ts            — DB name ("AuraPoSOfflineDB") and version constants
├── types.ts             — All TypeScript types (SyncStatus, LocalOrder, LocalPrintJob, etc.)
├── index.ts             — Re-exports everything public
│
├── terminal.ts          — getOrCreateTerminalIdentity(tenantId)
├── idempotency.ts       — generateIdempotencyKey(terminalId)
├── orderNumber.ts       — generateLocalOrderNumber(tenantId, terminalId)
│
├── cartStore.ts         — loadCartSession / saveCartSession / clearCartSession / migrateLegacySession
├── draftOrders.ts       — listLocalDraftOrders / saveLocalDraftOrder / deleteLocalDraftOrder
│
├── catalogCache.ts      — saveCachedProducts / getCachedProducts / saveCachedCategories / getCachedCategories
├── tenantCache.ts       — saveCachedOrderTypes / getCachedOrderTypes / saveCachedFeatures / getCachedFeatures
│
├── localOrderService.ts — createLocalOrder() / mirrorServerOrderLocally()
├── outbox.ts            — enqueueOutbox / dequeuePendingOutbox / markOutboxSyncing/Synced/Failed/Conflict
├── syncEngine.ts        — runSyncEngine() — main sync entry point
│
├── printQueue.ts        — enqueuePrintJob / getPendingPrintJobs / markPrinting/Printed/Failed / retryPrintJob
├── kitchenQueue.ts      — enqueueLocalKitchenTicket / getLocalKitchenTickets / updateLocalKitchenTicketStatus
│
└── conflictTypes.ts     — ConflictType enum, severity/policy maps, helpers
```

---

## Database (`db.ts`)

```typescript
import { offlineDb } from "@pos/offline";

// All tables:
offlineDb.local_tenants
offlineDb.local_features
offlineDb.local_products
offlineDb.local_categories
offlineDb.local_order_types
offlineDb.local_tables
offlineDb.local_terminal
offlineDb.local_cart_sessions
offlineDb.local_orders
offlineDb.local_order_items
offlineDb.local_order_payments
offlineDb.local_print_jobs
offlineDb.local_kitchen_tickets  // added in v2
offlineDb.sync_outbox
offlineDb.sync_attempts
offlineDb.sync_conflicts
offlineDb.sync_meta
```

The database is versioned. **Never modify existing version blocks** — add a new `this.version(N+1).stores({...})` call.

### Adding a New Table

```typescript
// 1. schema.ts — increment version
export const OFFLINE_DB_VERSION = 3; // was 2

// 2. db.ts — add new version block
this.version(3).stores({
  // copy ALL existing stores from v2, plus:
  new_table: "id, tenantId, status, createdAt",
});

// 3. types.ts — add TypeScript type for the new table

// 4. db.ts — add typed Table<> property on AuraPosOfflineDb
new_table!: Table<NewTableType, string>;
```

---

## Terminal Identity (`terminal.ts`)

Every browser/device gets a unique `terminalId` that persists across sessions.

```typescript
import { getOrCreateTerminalIdentity } from "@pos/offline";

const identity = await getOrCreateTerminalIdentity(tenantId);
// identity.terminalId   → "TERM-ABC123-XY9Z8W"
// identity.terminalName → "Cashier 1"
// identity.tenantId     → "demo-tenant"
```

**Storage:** IndexedDB `local_terminal` table (primary) + `localStorage["aurapos_terminal_id"]` (fallback).

**Format:** `TERM-{shortTenantId6}-{nanoid(6).toUpperCase()}`

**Used in:**
- Idempotency key generation (`{terminalId}:{ts}:{random}`)
- Local order number generation (`OFF-{shortTerminal}-{date}-{seq}`)
- Outbox items — `terminalId` field for server-side attribution
- Heartbeat registration (`useTerminalHeartbeat`)
- `SyncOfflineOrder` — terminal validation on backend

**Frontend hook:**
```typescript
import { useTerminalIdentity } from "@/hooks/useTerminalIdentity";
const terminal = useTerminalIdentity(); // null while loading
```

---

## Idempotency Key (`idempotency.ts`)

```typescript
import { generateIdempotencyKey } from "@pos/offline";

const key = generateIdempotencyKey(terminalId);
// Example: "TERM-ABC123-XY9Z8W:1716800000000:aBcD1234"
```

**Format:** `{terminalId}:{Date.now()}:{nanoid(8)}`

**Rules:**
1. Generate the key **before** the first network attempt
2. Reuse the **same key** on all retries of the same outbox item
3. Never generate a new key for a retry — that would create a duplicate
4. Never reuse a key for a different logical operation

See `docs/dev/IDEMPOTENCY.md` for the full specification.

---

## Local Order Number (`orderNumber.ts`)

```typescript
import { generateLocalOrderNumber } from "@pos/offline";

const number = await generateLocalOrderNumber(tenantId, terminalId);
// "OFF-XY9Z8W-20260524-0001"
```

**Format:** `OFF-{shortTerminal6}-{YYYYMMDD}-{seq:04}`

**Sequence:** Per-tenant per-day, stored in `sync_meta` key `order_seq:{tenantId}:{YYYYMMDD}`. Safe from collisions within the same terminal+day. Different terminals on the same day will have different shortTerminal values.

---

## Cart Store (`cartStore.ts`)

```typescript
import { loadCartSession, saveCartSession, clearCartSession, migrateLegacySession } from "@pos/offline";

// On mount — migrate from legacy sessionStorage and load from IndexedDB
const cart = await migrateLegacySession<CartState>(tenantId)
  ?? await loadCartSession<CartState>(tenantId);

// On every cart change
await saveCartSession(tenantId, cartState);

// After successful payment (local or server)
await clearCartSession();
```

**TTL:** 24 hours. Expired sessions are deleted on next `loadCartSession()` call.

**Legacy migration:** If `sessionStorage["pos_cart_session"]` exists, it is migrated to IndexedDB on first load. The sessionStorage key is NOT cleared (fallback in case IDB fails).

---

## Draft Orders (`draftOrders.ts`)

Held orders (parked mid-transaction) stored in `local_cart_sessions` with `draft:` id prefix.

```typescript
import { listLocalDraftOrders, saveLocalDraftOrder, deleteLocalDraftOrder } from "@pos/offline";

// List all drafts for a tenant
const drafts = await listLocalDraftOrders(tenantId);

// Save/update a draft
const draft = await saveLocalDraftOrder({
  tenantId,
  customerName: "Budi",
  tableNumber: "5",
  items: [...],
  total: 55000,
});

// Delete when resumed or abandoned
await deleteLocalDraftOrder(tenantId, draft.id);
```

---

## Catalog Cache (`catalogCache.ts`)

```typescript
import { saveCachedProducts, getCachedProducts, saveCachedCategories, getCachedCategories,
         updateCatalogCachedAt, getCatalogCachedAt, isCatalogStale } from "@pos/offline";

// On fetch from server (when online)
await saveCachedProducts(tenantId, productsFromServer);
await saveCachedCategories(tenantId, categoriesFromServer);
await updateCatalogCachedAt(tenantId);

// On read (always — prefer cache)
const products = await getCachedProducts(tenantId);
const categories = await getCachedCategories(tenantId);

// Check staleness
const cachedAt = await getCatalogCachedAt(tenantId);
const isStale = isCatalogStale(cachedAt, 24 * 60 * 60 * 1000); // 24h
```

Products are stored with their full `rawData` field (original server object) for schema-forward compatibility.

---

## Tenant Cache (`tenantCache.ts`)

```typescript
import { saveCachedOrderTypes, getCachedOrderTypes, saveCachedFeatures, getCachedFeatures } from "@pos/offline";

// Order types
await saveCachedOrderTypes(tenantId, orderTypesFromServer);
const orderTypes = await getCachedOrderTypes(tenantId);

// Feature flags
await saveCachedFeatures(tenantId, featuresFromServer);
const features = await getCachedFeatures(tenantId);
```

---

## Local Order Service (`localOrderService.ts`)

`createLocalOrder()` is the offline equivalent of `POST /api/orders/create-and-pay`. It writes atomically to IndexedDB and enqueues for sync.

```typescript
import { createLocalOrder } from "@pos/offline";

const result = await createLocalOrder({
  tenantId,
  terminalId,
  items: [
    {
      product_id: "prod_001",
      product_name: "Kopi Susu",
      base_price: 25000,
      quantity: 2,
      variant_price_delta: 0,
    }
  ],
  order_type_id: "ot_dinein",
  customer_name: "Budi",
  table_number: "5",
  tax_rate: 0.1,
  service_charge_rate: 0.05,
  amount: 55000,
  payment_method: "cash",
});

result.order.order_number   // "OFF-XY9Z8W-20260524-0001"
result.order.isLocal        // true
result.idempotencyKey       // used for server sync later
result.pricing.subtotal     // 50000
result.pricing.tax_amount   // 5000
```

**What it does atomically:**
1. Generates `localId`, `idempotencyKey`, `localOrderNumber`
2. Computes `pricing` (subtotal, tax, service charge, total)
3. Writes `local_orders`, `local_order_items`, `local_order_payments` in a single Dexie transaction
4. Enqueues to `sync_outbox` with the full order payload

**Mirror server order after online success:**
```typescript
import { mirrorServerOrderLocally } from "@pos/offline";

await mirrorServerOrderLocally(tenantId, terminalId, serverId, serverOrderNumber, idempotencyKey);
// Creates or updates local_orders record with serverId and syncStatus = "synced"
```

---

## Outbox (`outbox.ts`)

The outbox is a durable queue of pending server mutations. Survives browser refresh and crash.

```typescript
import {
  enqueueOutbox, dequeuePendingOutbox,
  markOutboxSyncing, markOutboxSynced, markOutboxFailed, markOutboxConflict,
  resetOutboxForManualRetry,
} from "@pos/offline";

// Enqueue a mutation
await enqueueOutbox({
  tenantId, terminalId,
  entityType: "order",          // "order" | "payment" | "order_status" | "print_job" | "table_status"
  operation: "create",          // "create" | "update" | "delete"
  localEntityId: localOrderId,
  endpoint: "/api/orders/create-and-pay",
  method: "POST",
  payload: { ... },
  idempotencyKey,
});

// Fetch pending items for sync (respects nextRetryAt backoff)
const items = await dequeuePendingOutbox(25);

// Status transitions
await markOutboxSyncing(id);
await markOutboxSynced(id);                    // removes nextRetryAt, clears lastError
await markOutboxFailed(id, errorMessage);      // increments attemptCount, sets nextRetryAt
await markOutboxConflict(id, errorMessage);    // terminal failure, manual review required

// Manual retry reset (resets status to "pending", clears nextRetryAt)
await resetOutboxForManualRetry(id);
```

**Backoff schedule:**

| Attempt | Delay |
|---------|-------|
| 1 | 2 s |
| 2 | 4 s |
| 3 | 8 s |
| 4 | 16 s |
| 5 | 32 s |
| 6 | 64 s |
| 7 | 128 s |
| 8+ | 300 s (5 min, permanent failure) |

After 8 attempts, the item remains `status: "failed"` with no `nextRetryAt` — only manual retry can unstick it.

---

## Sync Engine (`syncEngine.ts`)

`runSyncEngine()` is the main entry point. Call it only from `useSyncEngine`.

```typescript
import { runSyncEngine } from "@pos/offline";

const result = await runSyncEngine();
// { processed: 10, synced: 8, failed: 1, conflicts: 1 }
```

**Algorithm:**
1. `dequeuePendingOutbox(25)` — fetch up to 25 items where `nextRetryAt <= now`
2. Separate `entityType === "order" && operation === "create"` from other types
3. Group order-creates by `(tenantId, terminalId)` → send as batch to `POST /api/sync/offline-orders`
4. Process other outbox types individually (order_status, table_status, print_job)
5. Update `local_orders` with `serverId` and `serverOrderNumber` on success
6. Write `sync_meta["last_sync_at"]`

**Frontend hook:**
```typescript
import { useSyncEngine } from "@/hooks/useSyncEngine";

const { run, isSyncing, lastResult } = useSyncEngine();
// Runs automatically on: mount, window.online, 30s interval
// Manual trigger: run()
```

A `lockRef` mutex prevents concurrent sync runs. Additional triggers while syncing are silently ignored.

---

## Print Queue (`printQueue.ts`)

```typescript
import {
  enqueuePrintJob, getPendingPrintJobs, getAllPrintJobs, getPrintJobStats,
  markPrinting, markPrinted, markPrintFailed, retryPrintJob, cancelPrintJob, deletePrintJob,
} from "@pos/offline";

// Enqueue after every order (always, online and offline)
await enqueuePrintJob({
  tenantId, terminalId,
  localOrderId: "local_abc",
  serverOrderId: "srv_xyz",        // optional, may be filled in after sync
  orderNumber: "OFF-...",
  type: "receipt",                 // "receipt" | "kitchen"
  payload: receiptPrintPayload,
});

// Background worker polls this
const pending = await getPendingPrintJobs(tenantId, terminalId);

// Stats for the layout badge
const stats = await getPrintJobStats(tenantId, terminalId);
// { pending: 2, printing: 0, printed: 45, failed: 1, cancelled: 0, total: 48 }
```

**Background worker:** `usePrintWorker` polls every 8 s, attempts up to 3 auto-retries per job, then requires manual reprint.

---

## Kitchen Queue (`kitchenQueue.ts`)

```typescript
import {
  enqueueLocalKitchenTicket, getLocalKitchenTickets,
  updateLocalKitchenTicketStatus, markKitchenTicketSynced,
  purgeServedKitchenTickets,
} from "@pos/offline";

// Enqueue when order is paid (offline)
await enqueueLocalKitchenTicket({
  tenantId, terminalId,
  localOrderId: "local_abc",
  orderNumber: "OFF-...",
  items: [{ productId, name, quantity }],
  customerName: "Budi",
  tableNumber: "5",
});

// KDS reads active tickets
const active = await getLocalKitchenTickets(tenantId, ["confirmed", "preparing", "ready"]);

// KDS updates status
await updateLocalKitchenTicketStatus(ticketId, "preparing");

// Cleanup old served tickets (call periodically)
await purgeServedKitchenTickets(tenantId, 120); // older than 120 minutes
```

---

## Conflict Types (`conflictTypes.ts`)

```typescript
import {
  ConflictType, ConflictSeverity, ResolverPolicy,
  getSeverity, getPolicy, isAutoResolvable, conflictLabel,
} from "@pos/offline";

getSeverity("PRICE_CHANGED")      // "warning"
getSeverity("PRODUCT_INACTIVE")   // "blocking"
getPolicy("ORDER_DUPLICATE")      // "auto_accept"
getPolicy("PRODUCT_INACTIVE")     // "discard"
getPolicy("SYNC_CONFLICT")        // "manual_review"
conflictLabel("PRICE_CHANGED")    // "Harga Berubah"  (Indonesian label)
isAutoResolvable("PRICE_CHANGED") // true  (audit_note policy)
isAutoResolvable("PRODUCT_INACTIVE") // false (discard policy)
```

---

## Adding a New Outbox Entity Type

1. Add the new type to `SyncOutboxItem.entityType` union in `types.ts`
2. Add a corresponding `enqueueOutbox(...)` call where the mutation originates
3. In `syncEngine.ts`, add handling in the `others` loop (individual sync) or create a new batch group
4. If the new entity type can produce conflicts, add to `conflictTypes.ts`

---

## Upgrading the IndexedDB Schema

```typescript
// Step 1: schema.ts
export const OFFLINE_DB_VERSION = 3; // increment

// Step 2: db.ts — add new version block, copy ALL existing stores
this.version(3).stores({
  // All v2 stores (unchanged)
  local_tenants: "id, tenantId, syncStatus",
  local_features: "id, tenantId, code, syncStatus",
  local_products: "id, tenantId, syncStatus, updatedAt",
  local_categories: "id, tenantId, syncStatus",
  local_order_types: "id, tenantId, syncStatus",
  local_tables: "id, tenantId, status, syncStatus",
  local_terminal: "terminalId, tenantId, updatedAt",
  local_cart_sessions: "id, tenantId, updatedAt",
  local_orders: "localId, tenantId, terminalId, syncStatus, idempotencyKey, createdAtLocal",
  local_order_items: "id, localOrderId, tenantId, syncStatus",
  local_order_payments: "id, localOrderId, tenantId, syncStatus, idempotencyKey",
  local_print_jobs: "id, tenantId, terminalId, localOrderId, status, syncStatus",
  local_kitchen_tickets: "id, tenantId, terminalId, localOrderId, status, syncStatus, createdAt",
  sync_outbox: "id, tenantId, terminalId, entityType, status, createdAt",
  sync_attempts: "id, outboxId, status, createdAt",
  sync_conflicts: "id, tenantId, localEntityId, conflictType, createdAt",
  sync_meta: "key, updatedAt",
  // New table:
  new_table: "id, tenantId, status, createdAt",
});

// Step 3: db.ts — add typed property
new_table!: Table<NewTableType, string>;

// Step 4: types.ts — add type
export type NewTableType = { id: string; tenantId: string; status: string; createdAt: string };

// Step 5: index.ts — export new functions if applicable
```

**Never remove or rename existing tables/indexes in older version blocks** — that would cause a Dexie schema upgrade error for users with existing data.

---

## Testing the Offline Engine

Since the package is browser-only (Dexie uses IndexedDB), tests require a browser-like environment.

**Recommended approach:**
- Use Vitest with `fake-indexeddb` for unit tests of pure logic
- Use Playwright for E2E tests of the full offline flow

```typescript
// vitest unit test example (future Sprint 8)
import "fake-indexeddb/auto";
import { createLocalOrder } from "@pos/offline";

test("createLocalOrder generates idempotency key", async () => {
  const result = await createLocalOrder({ tenantId: "t1", terminalId: "TERM-T1-ABC", ... });
  expect(result.idempotencyKey).toMatch(/^TERM-T1-ABC:\d+:/);
  expect(result.order.isLocal).toBe(true);
});
```

---

## Common Issues

| Issue | Cause | Fix |
|-------|-------|-----|
| `IDBKeyRange is not defined` | Running in Node.js | Use `fake-indexeddb` in tests |
| `VersionError: The requested version (N) is less than the existing version` | Downgraded DB version | Increment version, never decrement |
| Cart not recovering after refresh | `migrateLegacySession` not called | Call on mount before `loadCartSession` |
| Duplicate local order numbers | Clock skew + same terminal same ms | `nanoid(8)` in idempotency key prevents this |
| Outbox never drains | `useSyncEngine` not mounted | Ensure `SyncStatusWidget` (which mounts it) is in layout |
