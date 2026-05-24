# AuraPoS — Production Grade Offline POS Task List

> **Last updated:** May 2026
> **Legend:** `[x]` = implemented & merged, `[~]` = partially / stub only, `[ ]` = not yet started.

---

## 0. Goal

Make AuraPoS a production-grade offline-first POS PWA that remains usable by cashiers when the internet is down, and safely synchronizes back to the server when the connection returns.

**Final target:**

- POS terminal can open without internet.
- Products, categories, order types, tables, and tenant features are available offline.
- Cashiers can create orders, payments, drafts, and print receipts while offline.
- Offline data is stored safely in IndexedDB.
- All offline transactions are added to a sync queue.
- Sync is safe from duplicate orders and duplicate payments using idempotency keys.
- There is conflict handling for price changes, stock, inactive products, and payments.
- There is a print queue for receipts and kitchen tickets.
- There is a clear sync status UI for cashiers.
- Backend is ready to receive retries from multiple terminals without creating duplicates.
- There are unit tests, integration tests, E2E tests, and recovery tests.

---

## 1. Current Codebase Baseline

### 1.1 Existing Strength

- [x] TypeScript monorepo: `apps/pos-terminal-web`, `apps/api`, `packages/domain`, `packages/application`, `packages/infrastructure`, `shared/schema.ts`.
- [x] POS terminal: product browsing, cart, mobile drawer, desktop cart panel, product option dialog, payment dialog, partial payment, save draft, continue order, order queue, kitchen status action.
- [x] Backend: order schema, order items, modifiers, payment, kitchen ticket, tables, tenant features.
- [x] `CreateAndPayOrder` uses DB transaction (create order + insert payment + update status).
- [x] `RecordPayment` uses transaction + row lock `FOR UPDATE` for concurrent safety.
- [x] Web Bluetooth receipt printer (reconnect, pairing, ESC/POS, chunk writing).
- [x] POS page uses `useCreateAndPay`, `useRecordPayment`, `useCreateKitchenTicket`, `useOrders`.

### 1.2 Gap Status (Sprint 5 complete)

- [x] PWA service worker via `vite-plugin-pwa` — configured with NetworkFirst + navigateFallback.
- [x] `dexie ^4.0.8` in `packages/offline` and `apps/pos-terminal-web`.
- [x] `nanoid ^5.1.6` in `packages/offline`.
- [x] Cart saved to IndexedDB via `cartStore.ts` (with legacy sessionStorage migration).
- [x] Frontend uses `useOfflineOrderSubmit` — local-first with outbox queue.
- [x] `sync_outbox`, `local_orders`, `local_payments`, `print_jobs` — IndexedDB schema v2.
- [x] Sync engine — `runSyncEngine()` in `packages/offline/src/syncEngine.ts`.
- [x] Offline conflict types — `conflictTypes.ts` frontend + backend mirror.
- [x] Cashier sync status — `SyncStatusWidget.tsx` wired into `MainLayout` header.
- [x] Backend sync endpoint — `POST /api/sync/offline-orders` (batch, per-item result).
- [x] Terminal registry — `POST /api/terminals/register`, heartbeat endpoint.
- [x] Print queue — `packages/offline/src/printQueue.ts` + `usePrintWorker` background worker.
- [x] Kitchen queue offline — `packages/offline/src/kitchenQueue.ts` + `LocalKitchenTicket` IndexedDB table.
- [x] Draft orders — `packages/offline/src/draftOrders.ts`.
- [x] Local orders page — `/local-orders` with filter, retry, reprint.
- [x] Sync conflicts page — `/sync-conflicts` with severity filter, resolve/ignore actions.
- [x] Sync audit tables — `sync_batches`, `sync_events`, `server_sync_conflicts` in schema.

---

## Phase 1 — Define Offline Architecture ✅ COMPLETE

### 1.1 Create Offline Architecture Document

- [x] `docs/OFFLINE_ARCHITECTURE.md` created.
- [x] Application modes: `online`, `offline`, `syncing`, `degraded`, `conflict`.
- [x] Data sources: Server PostgreSQL → source of truth, IndexedDB → local working DB, Outbox → mutation queue.
- [x] Core principles: `localId`, `idempotencyKey`, print queue, sync status semantics.
- [x] Conflict policy matrix: price, product, stock, payment, order, tenant config, table.
- [x] Offline limits defined (24h catalog cache, 8 retry attempts, 50 orders per batch).
- [x] Recovery behavior defined (browser refresh, crash, printer failure, partial sync failure).
- [x] Data flow diagram: Cart → createLocalOrder → outbox → runSyncEngine → server.
- [x] Print flow diagram: enqueuePrintJob → usePrintWorker → printer.
- [x] Service worker caching strategy table.
- [x] Multi-terminal considerations.
- [x] Security considerations.

---

## Phase 2 — PWA Foundation ✅ COMPLETE

### 2.1 Install PWA Dependencies

- [x] `dexie ^4.0.8` in `packages/offline/package.json`.
- [x] `nanoid ^5.1.6` in `packages/offline/package.json`.
- [x] `vite-plugin-pwa ^0.21.2` in `apps/pos-terminal-web/package.json`.
- [x] `VitePWA` configured in `vite.config.ts`: workbox, NetworkFirst cache, navigateFallback.
- [x] `manifest.webmanifest` — standalone, landscape orientation, blue theme, `/pos` start URL.
- [x] PWA icons: `icon.svg` (any/maskable), `icon-192.png` (192×192), `icon-512.png` (512×512).

### 2.2 PWA Update and Install Prompts

- [x] `PwaUpdatePrompt.tsx` — "Versi baru tersedia. Perbarui aplikasi?" toast with reload button.
- [x] `PwaInstallPrompt.tsx` — install prompt for Android/desktop browsers.
- [x] Both prompts wired into `App.tsx`.

### 2.3 Add Offline Detection

- [x] `useNetworkStatus.ts` hook — `navigator.onLine`, `lastOnlineAt`, `lastOfflineAt`, `NetworkMode`.
- [x] `NetworkStatusBadge.tsx` — Online / Syncing (N) / Offline badge with animated spinner.
- [x] `SyncStatusWidget.tsx` — color-coded widget with pending/failed/conflict counts + manual sync button.
- [x] `OfflineCacheBanner.tsx` — shows catalog age when offline; warns if stale (>6h).
- [x] `SyncStatusWidget` wired into `MainLayout` top status strip (always visible, alongside print alert).
- [x] `OfflineCacheBanner` wired into POS page header (shows only when offline).

---

## Phase 3 — Local Database / IndexedDB ✅ COMPLETE

### 3.1 Create Offline Package

- [x] `packages/offline/package.json` — `@pos/offline` workspace package.
- [x] `packages/offline/src/db.ts` — `AuraPosOfflineDb extends Dexie`, versioned schema v1→v2.
- [x] `packages/offline/src/schema.ts` — DB name `"AuraPoSOfflineDB"` and version constants.
- [x] `packages/offline/src/types.ts` — all TypeScript types.
- [x] `packages/offline/src/index.ts` — re-exports all public API.
- [x] `packages/offline/tsconfig.json` — extends `tsconfig.base.json`, composite, declaration.

**IndexedDB Tables (v2 schema):**
- [x] `local_tenants`
- [x] `local_features`
- [x] `local_products`
- [x] `local_categories`
- [x] `local_order_types`
- [x] `local_tables`
- [x] `local_terminal`
- [x] `local_cart_sessions` (doubles as draft order storage with `draft:` prefix)
- [x] `local_orders`
- [x] `local_order_items`
- [x] `local_order_payments`
- [x] `local_print_jobs`
- [x] `local_kitchen_tickets` ← added in v2
- [x] `sync_outbox`
- [x] `sync_attempts`
- [x] `sync_conflicts`
- [x] `sync_meta`

### 3.2 Define Local Entity Types

- [x] `SyncStatus` union type: `"local_only" | "pending_sync" | "syncing" | "synced" | "failed" | "conflict" | "cancelled"`.
- [x] `TerminalIdentity` — `terminalId`, `terminalName`, `tenantId`, `createdAt`, `updatedAt`.
- [x] `LocalProduct` — with `rawData` field.
- [x] `LocalOrder` — `localId`, `serverId`, `idempotencyKey`, `syncStatus`, `localOrderNumber`, `serverOrderNumber`.
- [x] `LocalOrderItem`.
- [x] `LocalPayment`.
- [x] `LocalPrintJob` — `status`, `retryCount`, `lastError`, `printedAt`.
- [x] `SyncOutboxItem` — `attemptCount`, `nextRetryAt`, `idempotencyKey`.
- [x] `SyncConflict`.
- [x] `LocalKitchenTicket` + `LocalKitchenItem`.
- [x] `KitchenTicketStatus`.
- [x] `LocalDraftOrder`.

---

## Phase 4 — Terminal Identity ✅ COMPLETE

### 4.1 Create Terminal Registration (Client)

- [x] `packages/offline/src/terminal.ts` — `getOrCreateTerminalIdentity(tenantId)`.
- [x] Terminal ID format: `TERM-{shortTenantId6}-{nanoid(6).toUpperCase()}`.
- [x] Persisted in IndexedDB (`local_terminal`) + `localStorage` fallback.
- [x] `useTerminalIdentity.ts` hook — reads terminal from IndexedDB on mount.
- [x] `useTerminalHeartbeat.ts` hook — registers on mount, sends heartbeat every 5 min.

### 4.2 Backend Terminal Registry

- [x] `terminals` table in `shared/schema.ts`.
- [x] `POST /api/terminals/register` — register or update existing terminal.
- [x] `PATCH /api/terminals/:id/heartbeat` — update `last_seen_at`.
- [x] `GET /api/terminals` — list terminals for tenant.
- [x] `PATCH /api/terminals/:id/deactivate` — deactivate terminal.
- [x] Tenant isolation enforced in all endpoints.

---

## Phase 5 — Local Catalog Cache ✅ COMPLETE

### 5.1 Cache Products Locally

- [x] `packages/offline/src/catalogCache.ts` — `saveCachedProducts`, `getCachedProducts`, `updateCatalogCachedAt`, `getCatalogCachedAt`, `isCatalogStale`.
- [x] `saveCachedCategories` / `getCachedCategories`.
- [x] `rawData` field stores full server product object.
- [x] Cache age tracked in `sync_meta`.
- [x] Stale threshold: 24h for background, 6h for `OfflineCacheBanner` warning.

### 5.2 Cache Tenant Features and Order Types

- [x] `packages/offline/src/tenantCache.ts` — `saveCachedOrderTypes`, `getCachedOrderTypes`, `saveCachedFeatures`, `getCachedFeatures`.
- [x] Order types and features cached as raw server objects.
- [x] `getTenantCachedAt` / `isTenantCacheStale` helpers.

---

## Phase 6 — Replace Cart Persistence ✅ COMPLETE

### 6.1 Move Cart from sessionStorage to IndexedDB

- [x] `packages/offline/src/cartStore.ts` — `loadCartSession`, `saveCartSession`, `clearCartSession`.
- [x] 24h TTL on cart session.
- [x] `migrateLegacySession` — migrates from `sessionStorage` key `pos_cart_session`.
- [x] Cart cleared only after successful `createLocalOrder()` or server confirmation.

### 6.2 Add Held Orders / Local Drafts

- [x] `packages/offline/src/draftOrders.ts` — `listLocalDraftOrders`, `saveLocalDraftOrder`, `deleteLocalDraftOrder`.
- [x] Drafts stored in `local_cart_sessions` with `draft:` id prefix.
- [x] `LocalDraftOrder` type — customer name, table number, items, total.
- [x] Drafts survive reload and crash (IndexedDB persistence).

---

## Phase 7 — Offline Order Creation ✅ COMPLETE

### 7.1 Create Local Order Service

- [x] `packages/offline/src/localOrderService.ts` — `createLocalOrder`, `mirrorServerOrderLocally`.
- [x] Local order number: `OFF-{shortTerminalId6}-{YYYYMMDD}-{seq:04}`.
- [x] `localOrderId` — `nanoid()`.
- [x] `idempotencyKey` — `generateIdempotencyKey(terminalId)`.
- [x] Atomic IndexedDB transaction: order + items + payment saved together.
- [x] Immediately enqueues sync outbox item after save.

### 7.2 Idempotency Key Generation

- [x] `packages/offline/src/idempotency.ts` — `generateIdempotencyKey(terminalId)`.
- [x] Format: `{terminalId}:{Date.now()}:{nanoid(8)}`.
- [x] Generated before first network attempt.
- [x] Reused on all retries (stored in outbox item).

### 7.3 Local Order Number Generation

- [x] `packages/offline/src/orderNumber.ts` — `generateLocalOrderNumber(tenantId, terminalId)`.
- [x] Per-tenant-per-day sequence stored in `sync_meta`.
- [x] No duplicate local order numbers within same terminal+day.

### 7.4 Modify POS Charge Flow

- [x] `apps/pos-terminal-web/src/hooks/useOfflineOrderSubmit.ts`.
- [x] Online path: POST to `/api/orders/create-and-pay` with `x-idempotency-key` header.
- [x] Validation error (400/422): thrown directly — no local fallback.
- [x] Network/5xx error: falls back to `createLocalOrder()`.
- [x] Double-submit lock via `inFlightRef`.
- [x] Cart cleared only after durable save (local or server).
- [x] Server order mirrored locally via `mirrorServerOrderLocally()`.

---

## Phase 8 — Sync Outbox Engine ✅ COMPLETE

### 8.1 Create Outbox Table and Service

- [x] `packages/offline/src/outbox.ts` — `enqueueOutbox`, `dequeuePendingOutbox`, `markOutboxSyncing`, `markOutboxSynced`, `markOutboxConflict`, `markOutboxFailed`, `resetOutboxForManualRetry`.
- [x] Exponential backoff: `min(2^attempt * 1000, 5 * 60 * 1000)` ms, max 5 min.
- [x] Max 8 retries; beyond that, permanent failure (manual retry required).
- [x] `nextRetryAt` stored on item; `dequeuePendingOutbox` filters by it.

### 8.2 Implement Sync Engine

- [x] `packages/offline/src/syncEngine.ts` — `runSyncEngine(token?)`.
- [x] Dequeues up to 25 pending/failed items with `nextRetryAt <= now`.
- [x] Groups order-creates by `(tenantId, terminalId)`; sends as batch to `/api/sync/offline-orders`.
- [x] Per-item result processing: `synced/replayed` → markSynced + update local_orders; `conflict` → markConflict; `failed` → markFailed.
- [x] Other outbox types (order_status, table_status) processed individually.
- [x] `useSyncEngine.ts` hook — runs on mount, on `window.online`, every 30s; mutex prevents overlap.
- [x] Manual sync via `SyncStatusWidget` button.

---

## Phase 9 — Backend Idempotency and Offline APIs ✅ COMPLETE

### 9.1 Standardize Idempotency Key

- [x] `x-idempotency-key` header accepted on `POST /api/orders/create-and-pay`.
- [x] `idempotency_key` stored on `orders` table.
- [x] Unique index `(tenant_id, idempotency_key)` enforced at DB level.
- [x] Replay response returns same order data as original.
- [~] `source_terminal_id` accepted in batch sync payload (stored in `sync_events`; not yet on `orders` table).
- [ ] `client_created_at` not yet stored on the `orders` table (only in `sync_events`).

### 9.2 Create Offline Sync Endpoint

- [x] `POST /api/sync/offline-orders` — accepts batch up to 50 orders.
- [x] Per-item result: `synced`, `replayed`, `conflict`, `failed`.
- [x] Partial batch failure — 1 conflict does not abort the rest.
- [x] Emits SSE `orderQueueChanged` event after successful syncs.
- [x] `SyncOfflineOrder` use case in `packages/application/sync/`.

### 9.3 Add Sync Audit Tables

- [x] `sync_batches` table — one row per batch request.
- [x] `sync_events` table — one row per order item in batch.
- [x] `server_sync_conflicts` table — detailed per-item conflict record with `conflict_data` jsonb.
- [x] `GET /api/sync/batches`, `GET /api/sync/events`, `GET /api/sync/conflicts` endpoints.
- [x] `PATCH /api/sync/conflicts/:id/resolve` — mark resolved/ignored.

---

## Phase 10 — Conflict Handling ✅ COMPLETE (frontend) / [~] backend partial

### 10.1 Define Conflict Types

- [x] `ConflictType` const enum in `packages/offline/src/conflictTypes.ts`.
- [x] `ConflictSeverity`: `warning`, `needs_review`, `blocking`.
- [x] `ResolverPolicy`: `auto_accept`, `audit_note`, `manual_review`, `retry`, `discard`.
- [x] `CONFLICT_SEVERITY` and `CONFLICT_RESOLVER_POLICY` maps.
- [x] `getSeverity`, `getPolicy`, `isAutoResolvable`, `conflictLabel` helpers.
- [x] Backend mirror in `packages/application/sync/conflictTypes.ts`.

### 10.2 Implement Price Conflict Policy

- [~] Backend detects price delta during sync (implemented in `SyncOfflineOrder`).
- [~] `PRICE_CHANGED` conflict stored in `server_sync_conflicts` with `conflict_data`.
- [ ] Per-tenant configurable policy (planned Sprint 7).

### 10.3 Implement Stock Conflict Policy

- [~] Stock check during sync — if `stock_tracking_enabled` and qty < 0.
- [~] `STOCK_INSUFFICIENT` conflict stored; order still created (audit_note policy).
- [ ] `inventory_movements` ledger not yet implemented (Phase 17).

---

## Phase 11 — Print Queue ✅ COMPLETE

### 11.1 Create Local Print Job Queue

- [x] `packages/offline/src/printQueue.ts` — `enqueuePrintJob`, `getPendingPrintJobs`, `getAllPrintJobs`, `markPrinting`, `markPrinted`, `markPrintFailed`, `retryPrintJob`, `cancelPrintJob`, `deletePrintJob`, `getPrintJobStats`.
- [x] `local_print_jobs` IndexedDB table.
- [x] Print job enqueued after every order (online + offline paths).
- [x] `usePrintWorker.ts` — background worker polls every 8s, picks pending jobs, auto-prints via active provider.
- [x] Max 3 auto-retries; beyond that, manual reprint required.
- [x] `PrintQueuePanel.tsx` — list all jobs, reprint/retry/cancel/delete actions.
- [x] Print alert strip in `MainLayout` — badge when pending/failed jobs exist.
- [x] `getPrintJobStats` polled every 10s in `MainLayout`.

### 11.2 Printer Provider Abstraction

- [x] `PrinterProvider` interface abstraction in `apps/pos-terminal-web/src/lib/printerProvider.ts`.
- [x] `BluetoothPrinterProvider` — via existing `bluetoothReceiptPrinter`.
- [x] `BrowserPrintProvider` — fallback via browser print dialog.
- [x] `getActivePrinterProvider()` — selects active provider.

---

## Phase 12 — Offline Order Queue UI ✅ COMPLETE

### 12.1 Add Local Orders Page

- [x] `/local-orders` route in `App.tsx`.
- [x] `LocalOrderList.tsx` — shows all local orders with filter by sync status.
- [x] Search by order number.
- [x] Per-order retry sync, view payment details.
- [x] `StatusBadge` with colored variants per sync status.
- [x] Polling every 4s for live updates.

### 12.2 Add Sync Status Widget

- [x] `SyncStatusWidget.tsx` — online/offline, pending/failed/conflict counts, last sync time.
- [x] Clicking widget triggers manual sync.
- [x] Color: green (synced) / yellow (pending) / red (failed/conflict) / gray (offline).
- [x] Wired into `MainLayout` top status strip alongside print alert.
- [x] `useTerminalHeartbeat` running inside `SyncStatusWidget`.

---

## Phase 13 — Service Worker Caching Strategy ✅ COMPLETE

### 13.1 App Shell Cache

- [x] `vite-plugin-pwa` with workbox `generateSW`.
- [x] `globPatterns: ["**/*.{js,css,html,png,svg,woff2}"]` — app shell cached.
- [x] `navigateFallback: "/index.html"` — SPA offline fallback.
- [x] `devOptions.enabled: true` — SW active in dev for testing.

### 13.2 API Cache Strategy

- [x] Navigate requests: `NetworkFirst` with 3s timeout, fallback to cache.
- [x] Mutations: NOT intercepted by SW — routed through outbox/local service.
- [x] GET catalog/features: fetched online → written to IndexedDB; read from IndexedDB offline.

---

## Phase 14 — Backend Order Lifecycle Hardening [~] PARTIAL

- [x] Order status flow: `DRAFT` → `CONFIRMED` → `IN_PROGRESS` → `COMPLETED`.
- [x] Payment status: `unpaid`, `partial`, `paid`, `refunded`.
- [~] `pending_sync` status for offline-origin orders — tracked in `syncStatus` field (not on `orders.status`).
- [ ] Transition guard tests not yet written (Phase 22).
- [ ] `closed_at` timestamp not yet added to schema.

---

## Phase 15 — Table Management Offline [~] PARTIAL

- [x] `local_tables` table schema exists in IndexedDB (v2).
- [x] `TABLE_UNAVAILABLE` conflict type defined with `audit_note` policy.
- [ ] Offline table status write logic not yet wired (schema exists, mutations not yet persisted).
- [ ] Table conflict detection in `SyncOfflineOrder` not yet implemented.

---

## Phase 16 — Auth, Tenant, and RBAC Hardening [ ] NOT STARTED

- [ ] `ALLOW_TENANT_HEADER=false` env flag for production.
- [ ] RBAC: owner / manager / cashier / kitchen / viewer roles.
- [ ] Permission guards on backend routes.
- [ ] Offline session expiry + local cashier PIN unlock.
- [ ] Terminal deactivation blocks all sync from that terminal.

---

## Phase 17 — Inventory Production Grade [ ] NOT STARTED

- [ ] `inventory_movements` ledger table.
- [ ] Every sale creates a movement record.
- [ ] `offline_sale` movement type for synced offline orders.
- [ ] `inventory_stock_snapshots` table.
- [ ] Refund/void creates reverse movement.

---

## Phase 18 — Refund, Void, and Correction [ ] NOT STARTED

- [ ] `refunds` table.
- [ ] Void order flow (local unsynced + synced).
- [ ] Full / partial / item-level refund.
- [ ] Manager approval required.
- [ ] Audit trail for all void/refund actions.

---

## Phase 19 — Customer Display Offline ✅ COMPLETE

- [x] Customer display uses `BroadcastChannel` / `localStorage` events from POS page.
- [x] Does not depend on server for local display updates.
- [x] Cart, payment, and completion states broadcast to `/display` route.

---

## Phase 20 — Kitchen Display Offline ✅ COMPLETE

- [x] `packages/offline/src/kitchenQueue.ts` — offline local kitchen ticket queue.
- [x] `local_kitchen_tickets` IndexedDB table.
- [x] `enqueueLocalKitchenTicket`, `getLocalKitchenTickets`, `updateLocalKitchenTicketStatus`, `markKitchenTicketSynced`.
- [x] `purgeServedKitchenTickets` — cleans tickets older than 2h.
- [x] Status flow: `confirmed` → `preparing` → `ready` → `served`.
- [x] KDS can read local tickets while offline.

---

## Phase 21 — Observability and Audit [~] PARTIAL

- [x] `sync_batches` / `sync_events` / `server_sync_conflicts` — server-side sync audit.
- [x] `GET /api/sync/batches`, `/events`, `/conflicts` admin endpoints.
- [x] Sync conflicts page (`/sync-conflicts`) — filter, resolve, ignore.
- [ ] Frontend offline log export ("Support bundle") — not yet implemented.
- [ ] `audit_logs` table for cashier actions (create order, payment, refund, void) — not yet.
- [ ] Conflict rate monitoring / alerting — not yet.

---

## Phase 22 — Testing [ ] NOT STARTED

- [ ] Unit tests: idempotency key, local order number, outbox enqueue/dequeue, sync retry/backoff, conflict resolver.
  - Tooling: Vitest + `fake-indexeddb`.
- [ ] Backend integration tests: create-and-pay idempotency, duplicate key, batch sync, tenant isolation.
  - Tooling: Vitest + test DB.
- [ ] E2E offline tests (Playwright): offline POS flow, reload recovery, sync on reconnect, duplicate prevention.
- [ ] Recovery tests: crash mid-sync, printer failure, partial batch failure.

---

## Phase 23 — Production Deployment [ ] NOT STARTED

- [ ] CI pipeline: type-check, lint, unit test, build PWA, E2E.
- [ ] Migration scripts for all new tables with rollback scripts.
- [ ] Feature flag `offline_pos_v1` for controlled rollout.
- [ ] Monitoring: pending sync count, failed sync count, conflict rate, print failure rate.
- [ ] Runbook: how to clear stuck outbox, how to recover from sync failure, how to deactivate a terminal.

---

## Phase 24 — UI/UX Production Details [~] PARTIAL

- [x] Offline banner — `OfflineCacheBanner` in POS page when offline.
- [x] Sync status widget — color-coded badge in MainLayout header.
- [x] Double-submit lock — `inFlightRef` in `useOfflineOrderSubmit`.
- [x] Local order number shown in POS success dialog when offline.
- [x] Print alert strip — badge when pending/failed print jobs exist.
- [ ] "N transactions not synced" persistent banner — pending.
- [ ] Wording audit for cashier-friendly language.
- [ ] Tablet layout — verify SyncStatusWidget visible without overlap.

---

## Phase 25 — Documentation ✅ COMPLETE

- [x] `docs/OFFLINE_PRODUCTION_GRADE_POS_TASKS.md` — this file (master task list, 25 phases).
- [x] `docs/OFFLINE_ARCHITECTURE.md` — data flow, modes, principles, conflict policy, limits, multi-terminal.
- [x] `docs/dev/OFFLINE_ENGINE.md` — package structure, DB schema, API reference, all modules.
- [x] `docs/dev/SYNC_PROTOCOL.md` — outbox lifecycle, batch request/response, retry backoff, audit.
- [x] `docs/dev/IDEMPOTENCY.md` — key format, frontend/backend usage, DB constraint, debugging.
- [x] `docs/dev/CONFLICT_RESOLUTION.md` — conflict types, severity matrix, detection, resolution UI.
- [ ] `docs/user/OFFLINE_MODE_GUIDE.md` — end-user guide for cashiers (planned).
- [ ] `docs/user/PRINTER_GUIDE.md` — printer pairing and troubleshooting (planned).
- [ ] `docs/user/SYNC_ERROR_GUIDE.md` — how to handle sync errors (planned).

---

# Recommended Implementation Order (Next Steps)

## Sprint 6 — Inventory Ledger + Void/Refund (Next)

- [ ] Add `inventory_movements` table to schema + migration.
- [ ] Create movement on every sale sync (`offline_sale` type).
- [ ] Add `refunds` table and basic void flow.
- [ ] Manager approval gate for voids.

## Sprint 7 — RBAC + Security Hardening

- [ ] Add role-based permission checks on backend routes.
- [ ] `ALLOW_TENANT_HEADER=false` env flag.
- [ ] Offline session expiry + local PIN unlock.
- [ ] Terminal deactivation blocks sync.

## Sprint 8 — Testing and CI

- [ ] Unit tests for offline engine core functions (fake-indexeddb + Vitest).
- [ ] Backend integration tests for idempotency and batch sync.
- [ ] Playwright E2E for offline create → reload → sync flow.
- [ ] CI pipeline with all checks + PWA build verification.

## Sprint 9 — Production Rollout

- [ ] Feature flag `offline_pos_v1`.
- [ ] Monitoring dashboard for sync metrics.
- [ ] Pilot tenant validation.
- [ ] User documentation for cashiers.

---

# Definition of Done — Production Grade Offline POS

AuraPoS can only be considered production-grade offline POS when **all** of these are true:

**PWA Basics:**
- [x] App can be installed as PWA on Android/desktop.
- [x] `/pos` can be opened and refreshed while offline.
- [x] App shell loads from service worker cache without network.

**Data Availability Offline:**
- [x] Products/categories/order types/features are available offline (cached in IndexedDB).
- [x] Cart and draft do not disappear after refresh or crash.

**Offline Transaction Flow:**
- [x] Offline order can be created with local order number (`OFF-...`).
- [x] Offline payment can be recorded.
- [x] Receipt added to print queue; auto-printed when printer available.
- [x] All offline transactions enter outbox.

**Sync Safety:**
- [x] Sync is safe from duplicate order/payment (idempotency key).
- [x] Idempotency key sent from frontend on every mutation.
- [x] Price/stock/product/table conflict types defined with severity + policy.
- [x] Cashier can see pending/failed/conflict sync (SyncStatusWidget).

**Admin Observability:**
- [x] Admin can audit sync (sync_batches, sync_events, sync_conflicts pages).
- [x] Tenant isolation enforced on all sync endpoints.
- [x] Terminal can be registered and deactivated.

**Production Ready (pending):**
- [ ] Inventory uses movement ledger (Phase 17).
- [ ] Refund/void has audit trail (Phase 18).
- [ ] Offline E2E tests pass (Phase 22).
- [ ] Rollout uses feature flag (Phase 23).
- [ ] Cashier user documentation exists (Phase 25 user guides).
