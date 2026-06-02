# AuraPoS — Production Grade Offline POS Task List

> **Last updated:** May 2026
> **Legend:** `[x]` = implemented & merged · `[~]` = partial / stub only · `[ ]` = not started

---

## 0. Goal

Make AuraPoS a production-grade offline-first POS PWA that remains usable by cashiers when the internet is down, and safely synchronizes back to the server when the connection returns.

**Final target:**
- POS terminal opens without internet.
- Products, categories, order types, tables, and tenant features available offline.
- Cashiers can create orders, payments, drafts, and print receipts while offline.
- Offline data stored safely in IndexedDB.
- All offline transactions added to a sync queue.
- Sync safe from duplicate orders and payments using idempotency keys.
- Conflict handling for price changes, stock, inactive products, and payments.
- Print queue for receipts and kitchen tickets.
- Clear sync status UI for cashiers.
- Backend ready to receive retries from multiple terminals without duplicates.
- Unit tests, integration tests, E2E tests, and recovery tests.

---

## 1. Current Baseline

### 1.1 Existing Strengths

- [x] TypeScript monorepo: `apps/pos-terminal-web`, `apps/api`, `packages/domain`, `packages/application`, `packages/infrastructure`, `shared/schema.ts`.
- [x] POS terminal: product browsing, cart, mobile drawer, desktop cart panel, product option dialog, payment dialog, partial payment, save draft, continue order, order queue, kitchen status action.
- [x] Backend: order schema, order items, modifiers, payment, kitchen ticket, tables, tenant features.
- [x] `CreateAndPayOrder` uses DB transaction (create order + insert payment + update status).
- [x] `RecordPayment` uses transaction + row lock `FOR UPDATE` for concurrent safety.
- [x] Web Bluetooth receipt printer (reconnect, pairing, ESC/POS, chunk writing).
- [x] POS page uses `useCreateAndPay`, `useRecordPayment`, `useCreateKitchenTicket`, `useOrders`.

### 1.2 Sprint 1–6 Gap Status (All Complete)

- [x] PWA service worker via `vite-plugin-pwa` — NetworkFirst + navigateFallback.
- [x] `dexie ^4.0.8` and `nanoid ^5.1.6` in `packages/offline` and `apps/pos-terminal-web`.
- [x] Cart saved to IndexedDB via `cartStore.ts` (with sessionStorage migration).
- [x] Frontend uses `useOfflineOrderSubmit` — local-first with outbox queue.
- [x] `sync_outbox`, `local_orders`, `local_payments`, `print_jobs` — IndexedDB schema v2.
- [x] Sync engine — `runSyncEngine()` in `packages/offline/src/syncEngine.ts`.
- [x] Offline conflict types — `conflictTypes.ts` frontend + backend mirror.
- [x] Cashier sync status — `SyncStatusWidget.tsx` wired into `MainLayout` header.
- [x] Backend sync endpoint — `POST /api/sync/offline-orders` (batch, per-item result).
- [x] Terminal registry — `POST /api/terminals/register`, heartbeat, list, deactivate.
- [x] Print queue — `packages/offline/src/printQueue.ts` + `usePrintWorker` background worker.
- [x] Kitchen queue offline — `packages/offline/src/kitchenQueue.ts` + `LocalKitchenTicket` IndexedDB.
- [x] Draft orders — `packages/offline/src/draftOrders.ts`.
- [x] Local orders page — `/local-orders` with filter, retry, reprint.
- [x] Sync conflicts page — `/sync-conflicts` with severity filter, resolve/ignore actions.
- [x] Sync audit tables — `sync_batches`, `sync_events`, `server_sync_conflicts` in schema.
- [x] `useOfflineProducts` — offline-first hook with `isFromCache` flag and `cacheAge`.
- [x] `useOfflineTenantFeatures` — offline-first hook with `hasFeature(key)` helper.
- [x] `SyncController` — `syncOfflineOrders`, `listSyncBatches`, `listSyncConflicts`, `resolveConflict`, `listSyncEvents`.
- [x] `TerminalsController` — `registerTerminal`, `sendHeartbeat`, `listTerminals`, `deactivateTerminal`.
- [x] Printer Hub page (`/hub/printers`) — provider switcher (Bluetooth, Browser), test print, PrintQueuePanel.
- [x] `printerProvider.ts` abstraction — `PrinterProvider` interface with Bluetooth + Browser implementations.
- [x] TypeScript strict-mode clean — 0 errors (May 2026).
- [x] Documentation: `docs/OFFLINE_ARCHITECTURE.md`, `docs/dev/OFFLINE_ENGINE.md`, `docs/dev/SYNC_PROTOCOL.md`, `docs/dev/IDEMPOTENCY.md`, `docs/dev/CONFLICT_RESOLUTION.md`.

---

## Phase 1 — Offline Architecture ✅ COMPLETE

### 1.1 Architecture Document

- [x] `docs/OFFLINE_ARCHITECTURE.md` — accurate and current.
- [x] Application modes: `online`, `offline`, `syncing`, `degraded`, `conflict`.
- [x] Data sources: Server PostgreSQL → source of truth · IndexedDB → local working DB · Outbox → mutation queue.
- [x] Core principles: `localId`, `idempotencyKey`, print queue, sync status semantics.
- [x] Conflict policy matrix: price, product, stock, payment, order, tenant config, table.
- [x] Offline limits: 24h catalog cache, 8 retry attempts max, 50 orders per sync batch.
- [x] Recovery behavior: browser refresh, crash, printer failure, partial sync failure.
- [x] Data flow diagram: Cart → createLocalOrder → outbox → runSyncEngine → server.
- [x] Print flow: enqueuePrintJob → usePrintWorker → printer.
- [x] Service worker caching strategy table.
- [x] Multi-terminal considerations.

---

## Phase 2 — PWA Foundation ✅ COMPLETE

### 2.1 PWA Dependencies and Config

- [x] `vite-plugin-pwa` installed and configured in `vite.config.ts`.
- [x] `manifest.webmanifest` at `apps/pos-terminal-web/public/manifest.webmanifest`.
- [x] Icons: `icon.svg`, `icon-192.png`, `icon-512.png` in `public/icons/`.
- [x] Display: `standalone`, `orientation: landscape`.
- [x] App shell cached: HTML, JS/CSS, fonts/icons via `globPatterns`.
- [x] `PwaUpdatePrompt.tsx` — "New version available. Refresh?"
- [x] `PwaInstallPrompt.tsx` — install-to-homescreen prompt.
- [x] `navigateFallback: "/index.html"` — offline SPA refresh works.

### 2.2 Offline Detection

- [x] `useNetworkStatus.ts` — tracks `navigator.onLine`, `lastOnlineAt`, `lastOfflineAt`, `mode`.
- [x] `NetworkStatusBadge.tsx` — visual badge in POS header.
- [x] `OfflineCacheBanner.tsx` — stale data warning in degraded mode.
- [x] `SyncStatusWidget.tsx` — pending / failed / conflict counts with color codes.

---

## Phase 3 — Local Database / IndexedDB ✅ COMPLETE

### 3.1 @pos/offline Package

- [x] `packages/offline/package.json` — standalone package, browser-only, no Node deps.
- [x] `packages/offline/src/db.ts` — `AuraPosOfflineDb extends Dexie`, schema v1 → v2.
- [x] `packages/offline/src/schema.ts` — DB name `"AuraPoSOfflineDB"`.
- [x] `packages/offline/src/types.ts` — all TypeScript types.
- [x] `packages/offline/src/index.ts` — re-exports all public API.

**IndexedDB tables (v2):**

| Table | Purpose |
|-------|---------|
| `local_tenants` | Tenant profile cache |
| `local_features` | Feature flag cache |
| `local_products` | Product catalog cache |
| `local_categories` | Category cache |
| `local_order_types` | Order type cache |
| `local_tables` | Table layout cache |
| `local_terminal` | Terminal identity |
| `local_cart_sessions` | Active cart + draft orders |
| `local_orders` | Offline-created orders |
| `local_order_items` | Order items |
| `local_order_payments` | Payments |
| `local_print_jobs` | Print queue |
| `local_kitchen_tickets` | Offline kitchen display tickets |
| `sync_outbox` | Pending mutation queue |
| `sync_attempts` | Retry log |
| `sync_conflicts` | Detected conflicts |
| `sync_meta` | Key-value (sequences, cachedAt timestamps) |

### 3.2 Local Entity Types

- [x] `SyncStatus` union: `local_only` | `pending_sync` | `syncing` | `synced` | `failed` | `conflict` | `cancelled`.
- [x] `TerminalIdentity`, `LocalProduct`, `LocalOrder`, `LocalOrderItem`.
- [x] `LocalPayment`, `LocalPrintJob`, `SyncOutboxItem`, `SyncConflict`.
- [x] `LocalKitchenTicket`, `LocalKitchenItem`, `KitchenTicketStatus`.

---

## Phase 4 — Terminal Identity ✅ COMPLETE

### 4.1 Client Terminal Registration

- [x] `terminal.ts` — `getOrCreateTerminalIdentity(tenantId)`.
- [x] Format: `TERM-{shortTenantId}-{nanoid(6)}`, persisted in IndexedDB + localStorage.
- [x] `useTerminalIdentity.ts` — reactive hook.
- [x] `useTerminalHeartbeat.ts` — startup + 5-minute ping to `POST /api/terminals/register`.

### 4.2 Backend Terminal Registry

- [x] `terminals` table in `shared/schema.ts`.
- [x] `POST /api/terminals/register` — upsert by `(tenantId, terminalCode)`.
- [x] `PATCH /api/terminals/:id/heartbeat` — updates `lastSeenAt`.
- [x] `GET /api/terminals` — list for tenant.
- [x] `PATCH /api/terminals/:id/deactivate` — soft deactivate.
- [x] Tenant isolation enforced.

---

## Phase 5 — Local Catalog Cache ✅ COMPLETE

### 5.1 Products

- [x] `catalogCache.ts` — `saveCachedProducts`, `getCachedProducts`, `saveCachedCategories`, `getCachedCategories`, `updateCatalogCachedAt`.
- [x] `useOfflineProducts.ts` — network-first, IndexedDB fallback, `isFromCache` + `cacheAge`.
- [x] Stale banner shown when cache > 24h.
- [x] Inactive products blocked from cart when offline cache knows they are inactive.

### 5.2 Features and Order Types

- [x] `tenantCache.ts` — `saveCachedOrderTypes`, `getCachedOrderTypes`, `saveCachedFeatures`, `getCachedFeatures`, `updateTenantCachedAt`.
- [x] `useOfflineTenantFeatures.ts` — offline-first feature flag hook.
- [x] Tax / service charge config cached with tenant profile.

---

## Phase 6 — Cart Persistence ✅ COMPLETE

### 6.1 Cart in IndexedDB

- [x] `cartStore.ts` — `loadCartSession`, `saveCartSession`, `clearCartSession`, `migrateLegacySession`.
- [x] 24-hour TTL, expiry auto-cleanup.
- [x] `useCart.ts` persists to IndexedDB.
- [x] Cart survives refresh and crash.

### 6.2 Draft / Held Orders

- [x] `draftOrders.ts` — `listLocalDraftOrders`, `saveLocalDraftOrder`, `deleteLocalDraftOrder`.
- [x] Drafts keyed with `draft:` prefix in `local_cart_sessions`.
- [x] `CombinedDraftSheet.tsx` — UI: resume, delete, convert.
- [x] Draft survives reload.

---

## Phase 7 — Offline Order Creation ✅ COMPLETE

### 7.1 Local Order Service

- [x] `localOrderService.ts` — `createLocalOrder(input)`, `mirrorServerOrderLocally(serverOrder)`.
- [x] `idempotency.ts` — `generateIdempotencyKey(terminalId)`: `{terminalId}:{Date.now()}:{nanoid(8)}`.
- [x] `orderNumber.ts` — `generateLocalOrderNumber(tenantId, terminalId)`: `OFF-{shortTerminalId}-{YYYYMMDD}-{seq:04}`, per-day sequence in `sync_meta`.

### 7.2 Offline-First POS Charge Flow

- [x] `useOfflineOrderSubmit.ts`:
  - Online: POST to `/api/orders/create-and-pay` with `x-idempotency-key` header.
  - Fallback on network/5xx error → `createLocalOrder()`.
  - Validation errors (400/422) NOT silently swallowed — shown to cashier.
  - Double-click guard via `inFlightRef`.
  - Cart cleared only after durable save succeeds.
- [x] `pos.tsx` wired to `useOfflineOrderSubmit`.
- [x] Local receipt shows local order number: `OFF-AB1234-20260525-0001`.

---

## Phase 8 — Sync Outbox Engine ✅ COMPLETE

### 8.1 Outbox

- [x] `outbox.ts` — `enqueueOutbox`, `dequeuePendingOutbox`, `markOutboxSyncing`, `markOutboxSynced`, `markOutboxFailed`, `markOutboxConflict`.
- [x] Exponential backoff: `2^attempt * 1000ms`, capped at 5 minutes.
- [x] Max 8 retries per item, then permanent `failed`.
- [x] Manual retry resets status to `pending`.

### 8.2 Sync Engine

- [x] `syncEngine.ts` — `runSyncEngine()`:
  - Batches by tenant + terminal (max 50 per batch).
  - POST to `POST /api/sync/offline-orders`.
  - 200/201 → `synced`, 409/422 → `conflict`, 5xx → `failed`, 401/403 → stop.
  - Stores `localOrderId → serverOrderId` mapping in `sync_meta`.
  - Updates `last_sync_at` meta key.
- [x] `useSyncEngine.ts` — triggers on app mount, `window.online`, 30-second interval; `lockRef` mutex.

---

## Phase 9 — Backend Idempotency and Offline APIs ✅ COMPLETE

### 9.1 Idempotency

- [x] `idempotency_key` unique index `(tenant_id, idempotency_key)` on `orders`.
- [x] `source_terminal_id`, `client_created_at`, `local_order_id` columns on `orders`.
- [x] `CreateAndPayOrder` returns existing order on duplicate key (idempotent replay).
- [x] Response includes `idempotent_replay`, `server_order_id`, `server_order_number`.

### 9.2 Sync Endpoint

- [x] `POST /api/sync/offline-orders` — batch up to 50 offline orders.
- [x] Per-item result: `synced` | `replayed` | `conflict` | `failed`.
- [x] Partial batch: 1 conflict does not abort remaining items.
- [x] SSE `order_queue_updated` emitted after successful batch.

### 9.3 Sync Audit Tables

- [x] `sync_batches`, `sync_events`, `server_sync_conflicts` in `shared/schema.ts`.
- [x] `GET /api/sync/batches`, `GET /api/sync/events`, `GET /api/sync/conflicts`.
- [x] `PATCH /api/sync/conflicts/:id/resolve`.

---

## Phase 10 — Conflict Handling ✅ COMPLETE (Types + Frontend)

### 10.1 Conflict Types

- [x] `conflictTypes.ts` (frontend) — `ConflictType` enum (11 types), `ConflictSeverity`, `ResolverPolicy`, lookup maps, helper functions.
- [x] `packages/application/src/sync/conflictTypes.ts` — backend mirror.
- [x] `/sync-conflicts` page — severity filter, resolve/ignore actions.

### 10.2 Price Conflict Policy

- [x] `PRICE_CHANGED` → `audit_note` — accepted, flagged in `server_sync_conflicts`.
- [ ] Per-tenant policy configuration (accept offline / use server / needs_review) — hardcoded to `accept_offline`.
- [ ] Owner dashboard for price drift review.

### 10.3 Stock Conflict Policy

- [x] `STOCK_INSUFFICIENT` → `audit_note` — accepted with flag.
- [~] `CreateAndPayOrder` writes `inventory_movements` for online sales.
- [ ] Full inventory ledger — see Phase 17.

---

## Phase 11 — Print Queue ✅ COMPLETE

### 11.1 Local Print Job Queue

- [x] `printQueue.ts` — `enqueuePrintJob`, `getPendingPrintJobs`, `getAllPrintJobs`, `markPrinting`, `markPrinted`, `markPrintFailed`, `retryPrintJob`, `cancelPrintJob`.
- [x] `usePrintWorker.ts` — background auto-worker polling every 8s, MAX_AUTO_RETRY = 3.
- [x] `PrintQueuePanel.tsx` — all jobs, Reprint / Retry / Cancel actions.

### 11.2 Printer Provider Abstraction

- [x] `PrinterProvider` interface in `lib/printerProvider.ts`.
- [x] `BluetoothPrinterProvider` — wraps `bluetoothReceiptPrinter`.
- [x] `BrowserPrintProvider` — `window.print()` fallback.
- [x] `getActivePrinterProvider()` — Bluetooth if connected, else Browser.
- [x] Printer Hub at `/hub/printers` — provider cards, test print, PrintQueuePanel.

---

## Phase 12 — Offline Order Queue UI ✅ COMPLETE

### 12.1 Local Orders Page

- [x] `/local-orders` — `LocalOrderList.tsx`, filter by sync status, detail, retry, cancel, reprint.

### 12.2 Sync Status Widget

- [x] `SyncStatusWidget.tsx` — pending / failed / conflict counts, color codes, manual sync, opens Sync Center.

---

## Phase 13 — Service Worker Caching ✅ COMPLETE

- [x] App shell cached via `globPatterns: ["**/*.{js,css,html,png,svg,woff2}"]`.
- [x] `navigateFallback: "/index.html"` — offline SPA refresh works.
- [x] API GET routes: NetworkFirst + 24h expiration for catalog, features, order types.
- [x] POST/PATCH/DELETE not cached by service worker.

---

## Phase 14 — Order Lifecycle Hardening

### 14.1 Align Lifecycle with Offline

- [x] Status flow: `draft` → `confirmed` → `preparing` → `ready` → `served` → `completed`.
- [x] Payment status: `unpaid` → `partial` → `paid`.
- [x] Kitchen manages fulfillment; cashier closes financially.
- [ ] Add `is_offline_origin` flag to orders — distinguish synced offline orders in reporting.
- [ ] Explicit `closed_at` timestamp — separate financial close from fulfillment.
- [ ] Lifecycle transition tests — no automated state-machine tests yet.

---

## Phase 15 — Table Management Offline

### 15.1 Cache Tables Locally

- [x] `local_tables` IndexedDB table defined.
- [x] `saveCachedTables`, `getCachedTables`, `updateTablesCachedAt`, `getTablesCachedAt` — in `catalogCache.ts`.
- [x] `useTables` hook wires `saveCachedTables` after successful server fetch (fire-and-forget).
- [x] `useOfflineTables` hook (`apps/pos-terminal-web/src/hooks/useOfflineTables.ts`) — network-first, IndexedDB fallback, `isFromCache` + `cacheAge`.
- [x] `useOfflineAvailableTables` — pre-filtered convenience hook.
- [x] `LocalTable` type added to `packages/offline/src/types.ts`.
- [ ] Dine-in table selector in POS wired to `useOfflineTables` (currently still uses `useTables` directly).

### 15.2 Table Conflict Handling

- [x] `TABLE_UNAVAILABLE` conflict type and `audit_note` policy defined.
- [x] `SyncOfflineOrder.ts` pre-fetches occupied tables and logs `TABLE_UNAVAILABLE` conflict (non-blocking — order still goes through).
- [ ] Admin UI: keep table / move table / clear table resolution.

---

## Phase 16 — Auth, Tenant, and RBAC

### 16.1 Remove Unsafe Tenant Header in Production

- [x] `ALLOW_TENANT_HEADER` env flag — when set to `false`, blocks `x-tenant-id` header and forces subdomain or `tenant_id` query param only.
- [x] RBAC role types defined: `owner` | `manager` | `cashier` | `kitchen` | `viewer` with numeric hierarchy.
- [x] `apps/api/src/http/middleware/rbac.ts` — `attachRole`, `requireRole(minRole)`, `hasRole`, convenience guards: `requireOwner`, `requireManager`, `requireCashier`.
- [x] Dev override: `x-pos-role` header accepted in non-production for testing.
- [~] Tenant resolved from subdomain → header (if allowed) → query param.
- [ ] Production tenant resolution: authenticated session or terminal registration (no header).
- [ ] `attachRole` wired into API router (skeleton exists, not mounted yet).
- [ ] Routes protected with `requireManager` / `requireOwner` guards.

### 16.2 Offline Session Policy

- [ ] Offline session token with configurable expiry.
- [ ] Local cashier PIN unlock when session expires offline.
- [ ] Cashier ID in local order for audit.
- [ ] Lost device deactivation flow in admin UI (endpoint exists, frontend flow does not).

---

## Phase 17 — Inventory Production Grade

### 17.1 Inventory Ledger

- [~] `inventory_movements` table in schema.
- [~] `CreateAndPayOrder` writes movement for online sales.
- [ ] Movement types: `sale` | `return` | `adjustment` | `reservation` | `offline_sale`.
- [ ] `inventory_items` — master stock record separate from `products.stockQty`.
- [ ] `inventory_stock_snapshots` — periodic balance snapshot.
- [ ] `inventory_adjustments` — reason + actor.
- [x] Offline sale sync delegates stock deduction and the canonical `SALE` ledger row to `CreateAndPayOrder`; sync terminal metadata is stamped on that movement instead of writing a duplicate `offline_sale` row.
- [ ] Refund/void creates reverse movement.
- [ ] Inventory report endpoint.

### 17.2 Stock Reservation (Optional)

- [ ] Soft reservation per terminal behind tenant feature flag.
- [ ] On sync: confirm reservation or return `STOCK_INSUFFICIENT`.
- [ ] Admin oversell review page.

---

## Phase 18 — Refund, Void, and Correction

### 18.1 Void Order

- [ ] `POST /api/orders/:id/void` — requires reason, manager permission.
- [ ] Void unsynced local order (remove from outbox).
- [ ] Void synced order via server API.
- [ ] Audit log entry on void.
- [ ] If payment exists → must route through refund.

### 18.2 Refund

- [ ] `refunds` table in schema.
- [ ] `POST /api/orders/:id/refunds` — full, partial, item-level.
- [ ] Reverse payment movement.
- [ ] Reverse inventory movement if item returned.
- [ ] Manager approval.
- [ ] Net sales reporting accounts for refunds.

---

## Phase 19 — Customer Display Offline ✅ MOSTLY COMPLETE

- [x] `useCustomerDisplay.ts` — BroadcastChannel + localStorage events.
- [x] Cart/payment/completed state broadcast to customer display tab.
- [x] Customer display at `/customer-display` reads local state — works offline.
- [ ] Automated offline test for customer display sync.
- [ ] Payment QR / static payment info cached for offline display.

---

## Phase 20 — Kitchen Display Offline ✅ MOSTLY COMPLETE

- [x] `kitchenQueue.ts` — `enqueueLocalKitchenTicket`, `getLocalKitchenTickets`, `updateLocalKitchenTicketStatus`, `purgeServedKitchenTickets`.
- [x] `LocalKitchenTicket` IndexedDB table (schema v2).
- [x] KDS page merges server tickets + local tickets.
- [x] Local ticket status advances offline (confirmed → preparing → ready → served).
- [~] Local KDS status changes not yet enqueued to outbox for server sync.
- [ ] Outbox entry for KDS status updates — sync to server when online.
- [ ] Fallback printed kitchen ticket for no-network scenario.

---

## Phase 21 — Observability and Audit

### 21.1 Frontend Offline Logs

- [ ] Structured local log store (network changes, order events, sync events, print events).
- [ ] JSON log export.
- [ ] "Support bundle" button — exports logs + pending outbox + device info.

### 21.2 Backend Audit Logs

- [~] Sync events logged in `sync_events`.
- [ ] `audit_logs` table — create order, payment, refund, void, stock adjustment, terminal registration.
- [ ] Actor: `userId`, `terminalId`, `tenantId`.
- [ ] Admin endpoint for audit log query.

---

## Phase 22 — Testing

### 22.1 Unit Tests

- [ ] `generateIdempotencyKey` — format, uniqueness.
- [ ] `generateLocalOrderNumber` — format, daily sequence, no collision.
- [ ] `cartStore` — save, load, expiry, migration.
- [ ] `outbox` — enqueue, dequeue, mark states, backoff calculation.
- [ ] `syncEngine` — batch creation, retry policy.
- [ ] Price conflict resolver.
- [ ] Stock conflict resolver.
- [ ] Print queue state machine.

### 22.2 Backend Integration Tests

- [ ] `POST /api/orders/create-and-pay` — same idempotency key twice = 1 order.
- [ ] `POST /api/sync/offline-orders` — batch idempotency.
- [ ] Tenant isolation — cross-tenant request rejected.
- [ ] Inactive terminal rejected from sync.
- [ ] Stock conflict detection on sync.
- [ ] Concurrent payment race condition (row lock).

### 22.3 E2E Offline Tests (Playwright)

- [ ] Load online → cache app shell → go offline → open `/pos` → no error.
- [ ] Create order offline → verify local order in IndexedDB.
- [ ] Payment offline → verify outbox enqueued.
- [ ] Print receipt offline → verify print job queued.
- [ ] Reload browser → order, cart, draft survive.
- [ ] Go online → sync succeeds → outbox cleared → server order visible.
- [ ] Disconnect during payment → fallback to local → no cart loss.
- [ ] Duplicate sync retry → no duplicate order.
- [ ] Price conflict scenario.
- [ ] Stock conflict scenario.
- [ ] Printer failed → reprint later.

---

## Phase 23 — Production Deployment

### 23.1 Build and CI

- [ ] CI: type-check → lint → unit tests → integration tests → PWA build → E2E.
- [ ] Fail build if service worker not generated.
- [ ] Fail build if migration not applied.
- [ ] Bundle size budget enforced.

### 23.2 Database Migrations

- [ ] Migration for: `terminals`, `sync_batches`, `sync_events`, `server_sync_conflicts`, `inventory_movements`, `refunds`, `audit_logs`.
- [ ] Migration up/down tested.
- [ ] Dev seed: terminal + pilot tenant.

### 23.3 Rollout Plan

- [ ] Feature flag `offline_pos_v1` — enable per tenant.
- [ ] Dev → 1 pilot → global rollout.
- [ ] Monitoring: pending sync count, failed sync count, conflict rate, idempotency replay rate, print failure rate.
- [ ] Offline mode can be disabled per tenant without code deployment.

---

## Phase 24 — UI/UX Production Details ✅ MOSTLY COMPLETE

### 24.1 Offline Warning UX

- [x] Offline banner with non-scary wording.
- [x] Pending badge with count.
- [x] Conflict badge (red) with count.
- [x] Non-blocking — cashier can transact except for `blocking` severity conflicts.

### 24.2 Safe Checkout

- [x] Double-tap guard via `inFlightRef` in `useOfflineOrderSubmit`.
- [x] Clear loading state during local save.
- [x] Local order number shown immediately after offline save.
- [ ] Local orders list auto-refreshes in real-time after sync completes.

---

## Phase 25 — Documentation

### 25.1 Developer Docs ✅ COMPLETE

- [x] `docs/OFFLINE_ARCHITECTURE.md`
- [x] `docs/dev/OFFLINE_ENGINE.md` — package structure, API reference, IndexedDB schema.
- [x] `docs/dev/SYNC_PROTOCOL.md` — outbox lifecycle, trigger conditions, batch format.
- [x] `docs/dev/IDEMPOTENCY.md` — key format, backend enforcement, replay policy.
- [x] `docs/dev/CONFLICT_RESOLUTION.md` — conflict types, severity, policy matrix.

### 25.2 User Docs

- [ ] `docs/user/OFFLINE_MODE_GUIDE.md` — install PWA, transact offline, check sync.
- [ ] `docs/user/PRINTER_GUIDE.md` — pair Bluetooth, test print, reprint receipt.
- [ ] `docs/user/SYNC_ERROR_GUIDE.md` — retry sync, resolve conflicts.

---

## Recommended Sprint Order (Remaining Work)

### Sprint 7 — Table Offline + RBAC Foundation ✅ COMPLETE

- [x] `saveCachedTables`, `getCachedTables`, `updateTablesCachedAt`, `getTablesCachedAt` in `catalogCache.ts`.
- [x] `LocalTable` type in `packages/offline/src/types.ts`.
- [x] `useTables` wires `saveCachedTables` after successful fetch.
- [x] `useOfflineTables` hook — network-first, IndexedDB fallback, `isFromCache`, `cacheAge`.
- [x] `TABLE_UNAVAILABLE` detection in `SyncOfflineOrder.ts` — non-blocking, logs conflict.
- [x] `ALLOW_TENANT_HEADER` env flag in `tenant.ts` middleware.
- [x] `rbac.ts` middleware skeleton — `attachRole`, `requireRole`, `hasRole`, convenience guards.
- [ ] Dine-in POS table selector wired to `useOfflineTables` (remaining small step).
- [ ] `attachRole` mounted in API router + routes protected.

### Sprint 8 — Inventory Ledger ✅

- [x] `inventory_movements` wired for payment paths (SALE via CreateAndPayOrder/stock movement helper, including synced offline orders with terminal metadata; RETURN on cancellation, ADJUSTMENT_IN/OUT on manual adjust).
- [x] `OFFLINE_SALE` movement type retained in enum/frontend labels for legacy or manual rows; new synced offline sales use canonical `SALE` rows.
- [x] Movement report endpoint `GET /api/inventory/report` — top 10 terlaku, breakdown tipe, nilai stok, unit terjual (period: 7/30/90 hari).
- [x] Movement filtering + pagination `GET /api/inventory/movements?type=&dateFrom=&dateTo=&limit=&offset=`.
- [x] `actorId` captured in manual adjustment routes.
- [x] Frontend `/stock` — Tab "Laporan" dengan summary cards, top produk terlaku, breakdown tipe.
- [x] Frontend `/stock` — Tab "Riwayat" dengan filter tipe chip (9 tipe).

### Sprint 9 — Void and Refund

- [ ] Void order flow.
- [ ] Refund flow with manager approval.
- [ ] Reverse inventory movement.

### Sprint 10 — Testing and CI

- [ ] Unit tests for `@pos/offline`.
- [ ] Backend integration tests.
- [ ] Playwright E2E offline scenarios.
- [ ] CI pipeline.

### Sprint 11 — Production Hardening

- [ ] `offline_pos_v1` feature flag.
- [ ] `audit_logs` table.
- [ ] User documentation.
- [ ] Support bundle export.
- [ ] Pilot rollout monitoring.

---

## Definition of Done — Production Grade Offline POS

AuraPoS is production-grade offline POS when ALL of these are true:

- [x] App installable as PWA.
- [x] `/pos` opens and refreshes while offline.
- [x] Products / categories / order types / features available offline.
- [x] Cart and draft survive refresh and crash.
- [x] Offline order can be created with local order number.
- [x] Offline payment can be recorded.
- [x] Receipt can be printed or added to print queue.
- [x] All offline transactions enter outbox with idempotency key.
- [x] Sync safe from duplicate order/payment.
- [x] Price / stock / product / table conflicts detected and handled.
- [x] Cashier sees pending / failed / conflict sync counts.
- [x] Admin can audit sync batches and conflicts.
- [x] Terminal can be registered and deactivated.
- [ ] Tenant header spoofing blocked in production.
- [ ] Table conflicts detected and resolvable.
- [ ] Inventory uses movement ledger for all paths.
- [ ] Refund / void has full audit trail.
- [ ] Offline E2E tests pass.
- [ ] Rollout uses per-tenant feature flag.
- [ ] User and developer documentation complete.
