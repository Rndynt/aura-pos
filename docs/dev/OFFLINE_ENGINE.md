# AuraPoS Offline Engine — Developer Guide

## Overview

The offline engine is contained in `packages/offline/`. It provides:

- **IndexedDB** storage via Dexie (local orders, catalog cache, outbox)
- **Terminal identity** (persistent `terminalId` per browser/device)
- **Cart persistence** (survives refresh and crash)
- **Local order creation** (atomic IndexedDB transaction)
- **Sync outbox** (durable mutation queue with backoff)
- **Sync engine** (drain outbox when online)
- **Conflict types** (severity + resolution policy)

The package is imported by `apps/pos-terminal-web` and has **no Node.js dependencies** — it runs entirely in the browser.

---

## Package Structure

```
packages/offline/src/
├── db.ts              — Dexie database class + singleton instance
├── schema.ts          — DB name and version constants
├── types.ts           — All TypeScript types (SyncStatus, LocalOrder, etc.)
├── terminal.ts        — getOrCreateTerminalIdentity()
├── cartStore.ts       — loadCartSession / saveCartSession / clearCartSession
├── draftOrders.ts     — listLocalDraftOrders / saveLocalDraftOrder / deleteLocalDraftOrder
├── catalogCache.ts    — saveCachedProducts / getCachedProducts / cache age helpers
├── tenantCache.ts     — saveCachedOrderTypes / saveCachedFeatures / cache age helpers
├── idempotency.ts     — generateIdempotencyKey()
├── orderNumber.ts     — generateLocalOrderNumber()
├── localOrderService.ts — createLocalOrder() / mirrorServerOrderLocally()
├── outbox.ts          — enqueueOutbox / dequeue / markSyncing/Synced/Failed/Conflict
├── syncEngine.ts      — runSyncEngine() — main entry point for sync
├── conflictTypes.ts   — ConflictType enum, severity, policy, labels
└── index.ts           — re-exports everything
```

---

## Database (`db.ts`)

```typescript
import { offlineDb } from "@pos/offline";

// All tables available on offlineDb:
offlineDb.local_orders
offlineDb.local_order_items
offlineDb.local_order_payments
offlineDb.local_print_jobs
offlineDb.sync_outbox
offlineDb.sync_conflicts
offlineDb.sync_meta
// ... (see db.ts for complete list)
```

The database is versioned. When adding a new table or index:
1. Increment `OFFLINE_DB_VERSION` in `schema.ts`
2. Add the new store to the `version(N).stores({...})` call in `db.ts`
3. **Do not modify existing version blocks** — add a new `this.version(N+1).stores({...})` call

---

## Terminal Identity (`terminal.ts`)

Every browser/device gets a unique `terminalId` that persists across sessions.

```typescript
import { getOrCreateTerminalIdentity } from "@pos/offline";

const identity = await getOrCreateTerminalIdentity(tenantId);
// identity.terminalId  → "TERM-ABC123-XY9Z8W"
// identity.terminalName → "Cashier 1"
```

**Storage:** IndexedDB `local_terminal` table + `localStorage["aurapos_terminal_id"]` fallback.

**Format:** `TERM-{shortTenantId}-{nanoid(6).toUpperCase()}`

The terminal identity is used in:
- Idempotency key generation
- Local order number generation
- Outbox items (for server-side terminal attribution)
- Heartbeat registration (`useTerminalHeartbeat`)

---

## Idempotency Key (`idempotency.ts`)

```typescript
import { generateIdempotencyKey } from "@pos/offline";

const key = generateIdempotencyKey(terminalId);
// "TERM-ABC123-XY9Z8W:1716800000000:aBcD1234"
```

**Format:** `{terminalId}:{Date.now()}:{nanoid(8)}`

**Scope:** Unique per terminal per millisecond. Safe to use as `x-idempotency-key` HTTP header.

**Rules:**
- Generate the key **before** the first network attempt
- Reuse the **same key** on all retries for the same operation
- Never reuse a key for a different logical operation

---

## Local Order Number (`orderNumber.ts`)

```typescript
import { generateLocalOrderNumber } from "@pos/offline";

const number = await generateLocalOrderNumber(tenantId, terminalId);
// "OFF-XY9Z8W-20260524-0001"
```

**Format:** `OFF-{shortTerminal}-{YYYYMMDD}-{seq:04}`

Sequence is per-tenant-per-day, stored in `sync_meta`. Safe from collisions within the same terminal+day.

---

## Cart Store (`cartStore.ts`)

```typescript
import { loadCartSession, saveCartSession, clearCartSession, migrateLegacySession } from "@pos/offline";

// On mount — migrate from sessionStorage and load
const cart = await migrateLegacySession<CartState>(tenantId)
  ?? await loadCartSession<CartState>(tenantId);

// On every cart change
await saveCartSession(tenantId, cartState);

// After successful payment
await clearCartSession();
```

TTL: 24 hours. Expired sessions are deleted on next load.

---

## Local Order Service (`localOrderService.ts`)

`createLocalOrder()` is the offline equivalent of `POST /api/orders/create-and-pay`. It writes atomically to IndexedDB and enqueues for sync.

```typescript
import { createLocalOrder } from "@pos/offline";

const result = await createLocalOrder({
  tenantId,
  terminalId,
  items: [{ product_id, product_name, base_price, quantity, ... }],
  amount,
  payment_method: "cash",
  // ... optional fields
});

result.order.order_number  // "OFF-XY9Z8W-20260524-0001"
result.order.isLocal       // true
result.idempotencyKey      // used for server sync later
```

**What it does:**
1. Generates `localId`, `idempotencyKey`, `localOrderNumber`
2. Computes pricing (subtotal, tax, service charge)
3. Writes `local_orders`, `local_order_items`, `local_order_payments` in a single Dexie transaction
4. Enqueues to `sync_outbox` with the full order payload

---

## Outbox (`outbox.ts`)

The outbox is a durable queue of pending server mutations.

```typescript
import { enqueueOutbox, dequeuePendingOutbox, markOutboxSynced, markOutboxFailed } from "@pos/offline";

// Add item
await enqueueOutbox({
  tenantId, terminalId,
  entityType: "order",
  operation: "create",
  localEntityId: localId,
  endpoint: "/api/orders/create-and-pay",
  method: "POST",
  payload: { ... },
  idempotencyKey,
});

// Fetch pending items (with backoff filtering)
const items = await dequeuePendingOutbox(25);

// Update status
await markOutboxSynced(id);
await markOutboxFailed(id, errorMessage);  // applies exponential backoff
await markOutboxConflict(id, errorMessage);
```

**Backoff:** `min(2^attempts * 1000ms, 5 * 60 * 1000ms)`. Max 8 attempts.

**Manual retry:**
```typescript
import { resetOutboxForManualRetry } from "@pos/offline";
await resetOutboxForManualRetry(id);
```

---

## Sync Engine (`syncEngine.ts`)

`runSyncEngine()` is the main entry point. It should only be called from `useSyncEngine` in the frontend.

```typescript
import { runSyncEngine } from "@pos/offline";

const result = await runSyncEngine();
// { processed: 10, synced: 8, failed: 1, conflicts: 1 }
```

**Algorithm:**
1. `dequeuePendingOutbox(25)` — fetch up to 25 pending items
2. Separate `order-creates` from other entity types
3. Batch order-creates by `(tenantId, terminalId)` → `POST /api/sync/offline-orders`
4. Sync other items individually (order_status, table_status, etc.)
5. Update `local_orders` with `serverId` and `serverOrderNumber` on success
6. Write `sync_meta.last_sync_at`

**Trigger conditions** (managed by `useSyncEngine`):
- App opens
- `window` fires `online` event
- User clicks manual sync in `SyncStatusWidget`
- 30-second interval while online

---

## Conflict Types (`conflictTypes.ts`)

```typescript
import { ConflictType, getSeverity, getPolicy, conflictLabel, isAutoResolvable } from "@pos/offline";

getSeverity("PRICE_CHANGED")      // "warning"
getSeverity("PRODUCT_INACTIVE")   // "blocking"
getPolicy("ORDER_DUPLICATE")      // "auto_accept"
getPolicy("PRODUCT_INACTIVE")     // "discard"
conflictLabel("PRICE_CHANGED")    // "Harga Berubah"
isAutoResolvable("PRICE_CHANGED") // true
```

See `packages/offline/src/conflictTypes.ts` for the full enum and policy matrix.

---

## Adding a New Outbox Entity Type

1. Add the new type to `SyncOutboxItem.entityType` union in `types.ts`
2. Add the corresponding endpoint and method
3. In `syncEngine.ts`, add handling in the `others` loop (or create a new batch group)
4. Add the conflict type to `conflictTypes.ts` if it can produce conflicts

---

## Upgrading the IndexedDB Schema

```typescript
// packages/offline/src/schema.ts
export const OFFLINE_DB_VERSION = 2; // increment

// packages/offline/src/db.ts
this.version(1).stores({ /* existing */ });
this.version(2).stores({
  ...existingStores,
  new_table: "id, tenantId, status",
});
```

**Never remove or rename existing tables/indexes in older version blocks** — that would corrupt existing user data. Always add a new version block.
