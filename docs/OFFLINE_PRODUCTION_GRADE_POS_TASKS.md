# AuraPoS — Production Grade Offline POS Task List

> **Last updated:** May 2026  
> **Legend:** `[x]` = implemented & merged, `[~]` = partially / stub only, `[ ]` = not yet started.

---

## Baseline Strengths (Already in Codebase)

- [x] TypeScript monorepo: `apps/pos-terminal-web`, `apps/api`, `packages/domain`, `packages/application`, `packages/infrastructure`, `shared/schema.ts`
- [x] POS terminal: product browsing, cart, mobile drawer, desktop cart panel, product option dialog, payment dialog, partial payment, save draft, continue order, order queue, kitchen status
- [x] Backend: order schema, order items, modifiers, payment, kitchen ticket, tables, tenant features
- [x] `CreateAndPayOrder` uses DB transaction (create order + insert payment + update status)
- [x] `RecordPayment` uses transaction + row lock `FOR UPDATE` to prevent concurrent race
- [x] Web Bluetooth receipt printer manager (reconnect, pairing, ESC/POS, chunk writing)
- [x] POS page uses `useCreateAndPay`, `useRecordPayment`, `useCreateKitchenTicket`, `useOrders`

---

## Sprint 1 — Offline Foundation ✅ COMPLETE

### Phase 2.1 — PWA Foundation

- [x] `vite-plugin-pwa` installed and configured in `apps/pos-terminal-web/vite.config.ts`
- [x] `manifest.webmanifest` created (`standalone`, `landscape`, blue theme, `/pos` start URL)
- [x] PWA icon: `icon.svg` (`purpose: "any maskable"`, `sizes: "any"`)
- [x] Service worker registered with `registerType: "prompt"`
- [x] Workbox config: `navigateFallback: "/index.html"`, NetworkFirst pages cache
- [x] `devOptions.enabled: true` for dev testing
- [ ] PWA icons: explicit `192x192` and `512x512` PNG files (SVG is sufficient for modern browsers)
- [ ] "New version available" update prompt shown to user
- [ ] Dedicated offline fallback page (currently redirects to index.html)

### Phase 2.2 — Offline Detection

- [x] `useNetworkStatus.ts` — tracks `navigator.onLine`, `lastOnlineAt`, `lastOfflineAt`, derives `mode: online|offline|syncing`
- [x] `NetworkStatusBadge.tsx` — shows Online / Offline / Syncing with icon + count
- [x] `SyncStatusWidget.tsx` — pending/failed/conflict counts, last sync time, color-coded, manual sync trigger
- [x] Both components integrated in `MainLayout`
- [x] `OfflineCacheBanner.tsx` — shows cache age and stale warning in offline mode

---

## Sprint 2 — Local Catalog and Cart ✅ COMPLETE

### Phase 3 — `@pos/offline` Package & IndexedDB

- [x] Package `packages/offline/` with `package.json`, `tsconfig.json`, `index.ts`
- [x] Dexie-based `AuraPosOfflineDb` in `db.ts` — DB name: `AuraPoSOfflineDB`
- [x] All required tables defined with indexes:
  - `local_tenants`, `local_features`, `local_products`, `local_categories`
  - `local_order_types`, `local_tables`, `local_terminal`, `local_cart_sessions`
  - `local_orders`, `local_order_items`, `local_order_payments`, `local_print_jobs`
  - `sync_outbox`, `sync_attempts`, `sync_conflicts`, `sync_meta`
- [x] All entity types defined in `types.ts`: `SyncStatus`, `LocalOrder`, `LocalOrderItem`, `LocalPayment`, `LocalPrintJob`, `SyncOutboxItem`, `SyncConflict`, `TerminalIdentity`

### Phase 4.1 — Terminal Identity

- [x] `terminal.ts`: `getOrCreateTerminalIdentity(tenantId)` — persists in IndexedDB + localStorage
- [x] Terminal ID format: `TERM-{shortTenantId}-{nanoid(6)}`
- [x] `useTerminalIdentity.ts` hook
- [x] Terminal name defaults to "Cashier 1"
- [ ] UI setting to rename terminal (e.g. "Front Cashier", "Bar Tablet")

### Phase 5.1 — Catalog Cache

- [x] `catalogCache.ts`: `saveCachedProducts`, `getCachedProducts`, `saveCachedCategories`, `getCachedCategories`
- [x] `updateCatalogCachedAt` / `getCatalogCachedAt` / `isCatalogStale`
- [x] Cache stale threshold: 6 h banner, 24 h full stale
- [ ] Checksum/version-based cache invalidation
- [ ] Inactive products blocked from cart when local cache knows they are inactive

### Phase 5.2 — Tenant Features and Order Types Cache

- [x] `tenantCache.ts`: `saveCachedOrderTypes`, `getCachedOrderTypes`, `saveCachedFeatures`, `getCachedFeatures`
- [x] `updateTenantCachedAt` / `getTenantCachedAt` / `isTenantCacheStale`
- [x] Feature gates still work offline using cached config
- [ ] Table list cached to IndexedDB (offline table selection)
- [ ] Tax/service charge config cached separately

### Phase 6.1 — Cart Persistence (IndexedDB)

- [x] `cartStore.ts`: `loadCartSession`, `saveCartSession`, `clearCartSession`
- [x] `migrateLegacySession` — migrates from `sessionStorage` to IndexedDB
- [x] Cart TTL: 24 h with auto-expiry
- [x] `useCart.ts` updated to load from IndexedDB on mount

### Phase 6.2 — Local Drafts / Held Orders

- [x] `draftOrders.ts`: `listLocalDraftOrders`, `saveLocalDraftOrder`, `deleteLocalDraftOrder`
- [x] Draft stored in `local_cart_sessions` with `draft:` prefix
- [ ] `LocalDraftOrdersSheet.tsx` UI (resume/delete held orders panel)

---

## Sprint 3 — Offline Order and Payment ✅ COMPLETE

### Phase 7.1 — Local Order Service

- [x] `localOrderService.ts`: `createLocalOrder` — full atomic Dexie transaction
- [x] Saves `local_orders`, `local_order_items`, `local_order_payments` in one transaction
- [x] Enqueues to `sync_outbox` with correct shape
- [x] `mirrorServerOrderLocally` — mirrors online order to local DB for local orders page
- [x] `idempotency.ts`: `generateIdempotencyKey(terminalId)` — format `{terminalId}:{ts}:{random}`
- [x] `orderNumber.ts`: `generateLocalOrderNumber` — format `OFF-{shortTerminal}-{YYYYMMDD}-{seq:04}`
- [x] Day sequence stored in `sync_meta`; no duplicates within terminal+day

### Phase 7.2 — POS Charge Flow (Offline-Aware)

- [x] `useOfflineOrderSubmit.ts` hook:
  - Online: POSTs to `/api/orders/create-and-pay` with `x-idempotency-key` header
  - Offline: saves to local DB + outbox
  - Network/5xx error: falls back to local (cart not lost)
  - Validation error (400/422): throws immediately, no fallback
- [x] Double-submit guard: `inFlightRef` prevents concurrent payment
- [x] Cart cleared only after local/server order is successfully saved
- [x] `isLocal: true` flag returned for local orders

---

## Sprint 4 — Sync Engine ✅ COMPLETE

### Phase 8.1 — Outbox Table and Service

- [x] `outbox.ts`: `enqueueOutbox`, `dequeuePendingOutbox`, `markOutboxSyncing`, `markOutboxSynced`, `markOutboxFailed`, `markOutboxConflict`
- [x] Exponential backoff: `2^attempts * 1000ms`, capped at 5 minutes
- [x] `resetOutboxForManualRetry` — manual retry from UI
- [x] Max 8 attempts before permanent failure

### Phase 8.2 — Sync Engine

- [x] `syncEngine.ts`: `runSyncEngine` — processes pending outbox items
- [x] Order-creates batched and sent to `/api/sync/offline-orders` (≤ 25 per chunk)
- [x] Other outbox items synced individually
- [x] Handles: 200/201 (synced), 409/422 (conflict), 5xx (retry), network error (retry)
- [x] `useSyncEngine.ts` hook: auto-runs on app open, online event, 30 s interval
- [x] Manual trigger via `SyncStatusWidget`
- [x] Local→server ID mapping updated on sync

### Phase 4.2 — Backend Terminal Registry

- [x] `terminals` table in `shared/schema.ts`
- [x] `TerminalsController.ts`: `registerTerminal`, `heartbeatTerminal`, `listTerminals`, `deactivateTerminal`
- [x] Routes: `POST /api/terminals/register`, `GET /api/terminals`, `PATCH /api/terminals/:id/heartbeat`, `PATCH /api/terminals/:id/deactivate`
- [x] `useTerminalHeartbeat.ts` — registers on mount, heartbeat every 5 minutes
- [ ] Admin UI to list/deactivate terminals
- [ ] Inactive terminal blocked from syncing in `SyncController`

### Phase 9.1 — Backend Idempotency

- [x] `idempotency_key` unique index on `orders(tenant_id, idempotency_key)`
- [x] `CreateAndPayOrder` handles duplicate key as replay (200)
- [x] `x-idempotency-key` header sent from frontend on every create-and-pay
- [ ] `source_terminal_id` and `local_order_id` stored as audit columns on server order
- [ ] Explicit `idempotent_replay: true` flag in response

### Phase 9.2 — Offline Sync Endpoint

- [x] `SyncController.ts`: `syncOfflineOrders`, `listSyncBatches`, `listSyncConflicts`, `resolveConflict`, `listSyncEvents`
- [x] Routes: `POST /api/sync/offline-orders`, `GET /api/sync/batches`, `GET /api/sync/conflicts`, `PATCH /api/sync/conflicts/:id/resolve`, `GET /api/sync/events`
- [x] Batch of up to 50 orders; partial success supported
- [x] `SyncOfflineOrder` use case in `packages/application/sync/`

### Phase 9.3 — Sync Audit Tables

- [x] `sync_batches` table — one row per batch
- [x] `sync_events` table — per-item audit
- [x] `server_sync_conflicts` table — server-side conflict records
- [x] Migrations: `0008_offline_sync_engine.sql`, `0009_sprint5_conflicts.sql`
- [ ] Admin UI for sync batch history
- [ ] Admin UI for per-terminal sync health dashboard

---

## Sprint 5 — Conflict Handling ✅ COMPLETE

### Phase 10.1 — Conflict Types

- [x] `conflictTypes.ts` (frontend + backend): `ConflictType`, `ConflictSeverity`, `ResolverPolicy`
- [x] Severity: `warning`, `needs_review`, `blocking`
- [x] Policy: `auto_accept`, `audit_note`, `manual_review`, `retry`, `discard`
- [x] `conflictLabel()` — Indonesian labels for each conflict type

### Phase 10.2 — Price Conflict Policy

- [x] `SyncOfflineOrder` detects price delta on sync
- [x] Default policy: `audit_note` — accept offline price, flag for review
- [x] Conflict data stored in `server_sync_conflicts`
- [ ] Tenant-configurable price acceptance policy (strict vs lenient)

### Phase 10.3 — Stock Conflict Policy

- [x] `SyncOfflineOrder` detects stock shortfall
- [x] Default policy: `audit_note` — allow negative stock, flag for review
- [x] Conflict data stored in `server_sync_conflicts`
- [ ] Inventory movement ledger written on every sync (Sprint 8)

### Conflict Resolution UI

- [x] `sync-conflicts.tsx` page — full conflict management UI
- [x] `ConflictCard` component — severity badge, resolution actions, expandable conflict data
- [x] Filters: by resolution status, severity, conflict type
- [x] Resolve / Ignore actions per conflict
- [x] Summary counts: pending, blocking, total
- [x] TypeScript errors fixed: `apiRequest` signature, `unknown` ReactNode casts
- [ ] Route registered in navigation (sidebar / settings menu)
- [ ] Link from `SyncStatusWidget` when `conflictCount > 0`

---

## Sprint 6 — Print Queue [ ] TODO

### Phase 11.1 — Local Print Job Queue

- [x] `local_print_jobs` table defined in IndexedDB schema
- [x] `LocalPrintJob` type with all required fields
- [ ] `printQueue.ts` service: `enqueuePrintJob`, `getPendingPrintJobs`, `markPrinted`, `markPrintFailed`, `retryPrintJob`
- [ ] Print jobs enqueued automatically after every successful order (local or server)
- [ ] `PrintQueuePanel.tsx` UI: list pending/failed jobs, reprint, mark printed
- [ ] Kitchen ticket print job support

### Phase 11.2 — Printer Provider Abstraction

- [x] `BluetoothPrinterManager` exists (ESC/POS, reconnect, chunk writing)
- [ ] `PrinterProvider` interface: `connect()`, `print(payload)`, `disconnect()`
- [ ] `BluetoothPrinterProvider` wrapping existing manager
- [ ] `BrowserPrintProvider` (fallback: `window.print()` or iframe)
- [ ] `usePrinter` hook with active provider selection

---

## Sprint 7 — Security and Production [ ] TODO

### Phase 16.1 — Tenant Header Hardening

- [x] Subdomain resolution: `{slug}.aurapos.my.id`
- [x] CORS allows `*.aurapos.my.id` and Replit domains
- [ ] `ALLOW_TENANT_HEADER=false` env flag for production
- [ ] Tenant resolved from authenticated session/JWT in production
- [ ] Terminal registration required before sync (auth gate)

### Phase 16.2 — RBAC

- [ ] Roles: `owner`, `manager`, `cashier`, `kitchen`, `viewer`
- [ ] Cashier: create order/payment only
- [ ] Kitchen: update fulfillment status only
- [ ] Manager: resolve conflict, refund, void
- [ ] Owner: manage terminals, tenant settings
- [ ] Role stored in `user.role` (Better Auth `admin` plugin present)

### Phase 16.3 — Offline Session Policy

- [ ] Offline session token with expiry
- [ ] Local cashier PIN unlock
- [ ] Cashier ID stored in every local order

### Phase 21 — Observability and Audit

- [ ] `audit_logs` table: every order/payment/refund/void/sync action
- [ ] Actor: `userId`, `terminalId`, `tenantId`
- [ ] Frontend offline log export (support bundle JSON)

---

## Sprint 8 — Inventory Production Grade [ ] TODO

### Phase 17.1 — Inventory Ledger

- [ ] `inventory_movements` table: `id`, `tenant_id`, `product_id`, `quantity_delta`, `movement_type`, `order_id`, `actor_id`, `created_at`
- [ ] Movement types: `sale`, `return`, `adjustment`, `reservation`, `offline_sale`
- [ ] Stock decrement in transaction on every order (online and sync)
- [ ] Offline sale sync writes `offline_sale` movement

### Phase 17.2 — Stock Reservation (Optional)

- [ ] Soft reservation per terminal in IndexedDB
- [ ] Hard reservation confirmed during sync
- [ ] Oversell conflict marked for admin review

---

## Sprint 9 — Refund and Void [ ] TODO

### Phase 18.1 — Void Flow

- [ ] Void local unsynced order (`syncStatus: "cancelled"`)
- [ ] Void synced order requires manager permission + reason
- [ ] Void creates audit log entry

### Phase 18.2 — Refund Flow

- [ ] `refunds` table: full/partial/item-level refund
- [ ] Refund creates reverse payment and stock movements
- [ ] Manager approval required

---

## Sprint 10 — Offline Kitchen Display [ ] TODO

### Phase 20.1 — Local KDS Queue

- [ ] Kitchen display reads local orders not yet synced
- [ ] POS sends local kitchen ticket to local queue
- [ ] KDS status updates enter outbox

---

## Sprint 11 — Testing [ ] TODO

### Phase 22.1 — Unit Tests

- [ ] Idempotency key generator
- [ ] Local order number generator (sequence, daily reset)
- [ ] Cart persistence (load, save, expiry, migration)
- [ ] Outbox enqueue/dequeue/backoff
- [ ] Sync engine retry logic
- [ ] Price/stock conflict resolver

### Phase 22.2 — Backend Integration Tests

- [ ] `createAndPay` idempotency (duplicate key → 200 replay)
- [ ] Batch offline sync (50 orders)
- [ ] Tenant isolation (cross-tenant → 403)
- [ ] Inactive terminal rejected
- [ ] Concurrent payment double-submit (row lock)

### Phase 22.3 — E2E Offline Tests (Playwright)

- [ ] Load app online, cache app, go offline, open `/pos`
- [ ] Create order offline → reload → order persists
- [ ] Go online → sync succeeds → no duplicate
- [ ] Go offline during payment → fallback to local, cart not lost
- [ ] Price conflict scenario
- [ ] Stock conflict scenario
- [ ] Printer failed → reprint later

---

## Sprint 12 — Production Deployment [ ] TODO

### Phase 23.1 — CI

- [ ] Type-check + lint + unit test in CI pipeline
- [ ] Integration tests in CI
- [ ] Build PWA with service worker verification
- [ ] Playwright E2E

### Phase 23.2 — Database Migration

- [x] Migration `0008_offline_sync_engine.sql` — terminals + sync tables
- [x] Migration `0009_sprint5_conflicts.sql` — server_sync_conflicts
- [ ] Migration for `inventory_movements`, `refunds`, `audit_logs`

### Phase 23.3 — Feature Flag Rollout

- [ ] Offline mode behind feature flag: `offline_pos_v1`
- [ ] Enable for dev tenant only first
- [ ] Monitor: pending count, failed count, conflict rate, duplicate replay count
- [ ] Enable globally after stable pilot

---

## Sprint 13 — UX Polish [ ] TODO

### Phase 24 — Offline Warning UX

- [x] `OfflineCacheBanner` — cache age, stale warning
- [x] `NetworkStatusBadge` — Online / Offline / Syncing
- [x] `SyncStatusWidget` — pending/failed/conflict counts with manual sync
- [ ] Full offline mode banner: "Offline mode is active. Transactions will sync when internet returns."
- [ ] "A new version is available. Refresh?" update prompt (PWA service worker update flow)
- [ ] Safe checkout button: clear loading state + local order number before server number

---

## Sprint 14 — Documentation [ ] TODO

### Phase 25 — Documentation

- [x] `docs/OFFLINE_ARCHITECTURE.md` — complete architecture document
- [x] `docs/dev/OFFLINE_ENGINE.md` — complete developer guide
- [x] `docs/dev/SYNC_PROTOCOL.md` — complete sync protocol spec
- [x] `docs/dev/IDEMPOTENCY.md` — complete idempotency guide
- [x] `docs/dev/CONFLICT_RESOLUTION.md` — complete conflict resolution guide
- [x] `docs/OFFLINE_PRODUCTION_GRADE_POS_TASKS.md` — this file (master task list)
- [ ] `docs/user/OFFLINE_MODE_GUIDE.md` — cashier user guide
- [ ] `docs/user/PRINTER_GUIDE.md` — Bluetooth printer pairing and reprint
- [ ] `docs/user/SYNC_ERROR_GUIDE.md` — retry sync, resolve conflict steps

---

## Definition of Done — Production Grade Offline POS

- [x] App can be installed as PWA (manifest + service worker)
- [x] `/pos` can be opened and refreshed offline (Workbox app shell)
- [x] Products/categories/order types/features available offline (IndexedDB cache)
- [x] Cart does not disappear after refresh/crash (IndexedDB persistence)
- [x] Offline order can be created (`createLocalOrder`)
- [x] Offline payment recorded in local DB
- [ ] Receipt can be printed or added to print queue (Sprint 6)
- [x] All offline transactions enter outbox (`enqueueOutbox`)
- [x] Sync safe from duplicate order/payment (idempotency key + unique DB index)
- [x] Idempotency key sent from frontend (`x-idempotency-key` header)
- [x] Price/stock/product conflicts handled (conflict types + policies + UI)
- [x] Cashier can see pending/failed/conflict sync (`SyncStatusWidget`)
- [x] Admin can audit sync (`sync-conflicts.tsx` page)
- [x] Tenant isolation safe (tenant middleware on all routes)
- [x] Terminal can be registered/deactivated (`TerminalsController`)
- [ ] Inventory uses movement ledger (Sprint 8)
- [ ] Refund/void has audit trail (Sprint 9)
- [ ] Offline E2E tests pass (Sprint 11)
- [ ] Rollout uses feature flag (Sprint 12)
- [ ] User documentation complete (Sprint 14)
