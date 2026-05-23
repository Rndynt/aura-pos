# AuraPoS — Production Grade Offline POS Task List

> **Last updated:** Based on commit history audit up to `54d77e7` (PR #42 merged).
> Legend: `[x]` = implemented & merged, `[~]` = partially/stub only, `[ ]` = not yet started.

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

## Sprint 1 — Offline Foundation ✅ MERGED (PR #42)

### Phase 2.1 — PWA Foundation

- [x] `vite-plugin-pwa` added to `apps/pos-terminal-web/vite.config.ts`
- [x] `manifest.webmanifest` created (standalone, landscape, blue theme)
- [x] PWA icon: `icon.svg` (single SVG, `purpose: "any maskable"`)
- [x] Service worker registered with `registerType: "prompt"`
- [x] Workbox config: `navigateFallback: "/index.html"`, NetworkFirst pages cache
- [x] `devOptions.enabled: true` for dev testing
- [ ] PWA icons: `192x192` and `512x512` PNG files (only SVG exists)
- [ ] "New version available" update prompt UI shown to user
- [ ] Dedicated offline fallback page (not just index.html redirect)

### Phase 2.2 — Offline Detection

- [x] `useNetworkStatus.ts` hook — tracks `navigator.onLine`, lastOnlineAt, lastOfflineAt, derives `mode: online|offline|syncing`
- [x] `NetworkStatusBadge.tsx` — shows Online / Offline / Syncing with icon + count
- [x] `SyncStatusWidget.tsx` — pending/failed/conflict counts, last sync time, color-coded severity, manual sync trigger
- [x] Both components integrated into `MainLayout`

### Phase 3.1 — `@pos/offline` Package & IndexedDB

- [x] Package `packages/offline/` created with `package.json`, `index.ts`
- [x] Dexie-based `AuraPosOfflineDb` class in `db.ts`
- [x] DB name: `AuraPoSOfflineDB`, version 1
- [x] All required tables defined with indexes:
  - `local_tenants`, `local_features`, `local_products`, `local_categories`
  - `local_order_types`, `local_tables`, `local_terminal`, `local_cart_sessions`
  - `local_orders`, `local_order_items`, `local_order_payments`, `local_print_jobs`
  - `sync_outbox`, `sync_attempts`, `sync_conflicts`, `sync_meta`
- [x] `@pos/offline` alias registered in `apps/pos-terminal-web/vite.config.ts`

### Phase 3.2 — Local Entity Types

- [x] `types.ts`: `SyncStatus`, `TerminalIdentity`, `LocalProduct`, `LocalOrder`, `LocalOrderItem`, `LocalPayment`, `LocalPrintJob`, `SyncOutboxItem`, `SyncConflict`
- [x] All entities have `tenantId`
- [x] All mutation entities have `idempotencyKey`
- [x] All entities have `syncStatus`

### Phase 4.1 — Terminal Identity (Frontend)

- [x] `terminal.ts`: `getOrCreateTerminalIdentity()` — creates `TERM-{shortTenantId}-{randomId}`, persists in IndexedDB + localStorage
- [x] `useTerminalIdentity.ts` React hook

### Phase 6.1 — Cart Persistence in IndexedDB

- [x] `cartStore.ts`: `loadCartSession`, `saveCartSession`, `clearCartSession`, `migrateLegacySession`
- [x] 24-hour TTL expiry on cart
- [x] Legacy `sessionStorage` migration on first load
- [x] `useCart.ts` uses `saveCartSession` / `migrateLegacySession` from `@pos/offline`

### Phase 6.2 — Local Draft Orders / Held Orders

- [x] `draftOrders.ts`: `listLocalDraftOrders`, `saveLocalDraftOrder`, `deleteLocalDraftOrder`
- [x] Stored in `local_cart_sessions` with `draft:` prefix
- [x] `LocalDraftOrdersSheet.tsx`: responsive drawer (mobile) / dialog (desktop), list/resume/delete
- [x] Wired into `pos.tsx`

### Phase 8.1 — Outbox Primitives

- [x] `outbox.ts`: `enqueueOutbox`, `dequeuePendingOutbox`, `markOutboxSyncing`, `markOutboxSynced`, `markOutboxConflict`, `markOutboxFailed`, `resetOutboxForManualRetry`
- [x] Exponential backoff (2^n seconds, max 5 min, max 8 retries)
- [x] Outbox survives reload (IndexedDB)

### Phase 8.2 — Sync Engine Baseline

- [x] `syncEngine.ts`: `runSyncEngine()` — dequeues pending, sends HTTP with `x-idempotency-key` header, handles 200/201/409/422/5xx/network error
- [x] `useSyncEngine.ts`: runs on app open, `online` event, 30-second interval; single-lock prevents parallel runs
- [x] Manual sync trigger from `SyncStatusWidget`

### Phase 12.1 — Local Orders Page

- [x] `/local-orders` route registered in `App.tsx`
- [x] `local-orders.tsx` page (basic scaffold)
- [x] `LocalOrderList.tsx`: reads from IndexedDB, filter by sync status, search by order number, 5-second auto-refresh

### Documentation

- [x] `docs/OFFLINE_ARCHITECTURE.md` — modes, data sources, principles, conflict policy, limits, recovery, data flow diagram
- [x] `docs/dev/OFFLINE_ENGINE.md` — package overview, tables, terminal, gaps noted
- [x] `docs/dev/SYNC_PROTOCOL.md` — protocol contract, status model
- [x] `docs/dev/IDEMPOTENCY.md` — key uniqueness scope, retry rules
- [x] `docs/dev/CONFLICT_RESOLUTION.md` — conflict classes, severity model

---

## Sprint 2 — Local Catalog & Cache ✅ DONE

### Phase 5.1 — Cache Products Locally

- [x] `packages/offline/src/catalogCache.ts` — `saveCachedProducts`, `getCachedProducts`, `saveCachedCategories`, `getCachedCategories`, `updateCatalogCachedAt`, `getCatalogCachedAt`, `isCatalogStale`
- [x] Full product `rawData` stored in IndexedDB — full Product shape preserved alongside indexed fields
- [x] `useProducts()` in `@/lib/api/hooks.ts` — write-through cache on success, IndexedDB fallback on network error
- [x] `useProducts()` in `@/hooks/api/useProducts.ts` — same write-through pattern
- [x] `useCategories()` in `@/hooks/api/useCategories.ts` — write-through + offline fallback
- [x] `OfflineCacheBanner` — shown in POS when offline, shows cache timestamp, amber tint if stale (>6h)
- [x] Banner wired into `pos.tsx` via `useNetworkStatus` hook
- [x] Graceful crash-free: if server unreachable and cache empty, error propagates normally

### Phase 5.2 — Cache Tenant Features & Order Types

- [x] `packages/offline/src/tenantCache.ts` — `saveCachedOrderTypes`, `getCachedOrderTypes`, `saveCachedFeatures`, `getCachedFeatures`, `updateTenantCachedAt`, `getTenantCachedAt`, `isTenantCacheStale`
- [x] `useOrderTypes()` in `@/lib/api/hooks.ts` — write-through cache on success, IndexedDB fallback on error
- [x] `useTenantFeatures()` in `@/lib/api/hooks.ts` — same; `useFeatures()` + `hasFeature()` gate works offline
- [x] Feature gate works offline (cached features via `useTenantFeatures` → `useFeatures`)
- [x] `packages/offline/src/index.ts` — exports `catalogCache` and `tenantCache` modules

---

## Sprint 3 — Offline Order & Payment ✅ DONE

### Phase 7.1 — Local Order Service

- [x] `packages/offline/src/idempotency.ts` — `generateIdempotencyKey(terminalId)` — format `{terminalId}:{timestamp}:{random8}`
- [x] `packages/offline/src/orderNumber.ts` — `generateLocalOrderNumber(tenantId, terminalId)` — format `OFF-{shortTerminal}-{YYYYMMDD}-{seq:04}`, per-tenant-per-day sequence stored in `sync_meta`
- [x] `packages/offline/src/localOrderService.ts` — `createLocalOrder()` and `mirrorServerOrderLocally()`
  - Generates `localId` (nanoid), `idempotencyKey`, `localOrderNumber`
  - Computes pricing (subtotal, tax, service_charge, total) from items
  - Saves `LocalOrder` + `LocalOrderItem[]` + `LocalPayment` in IndexedDB transaction
  - Enqueues outbox entry targeting `POST /api/orders/create-and-pay` with full payload + `local_order_id`, `source_terminal_id`, `client_created_at`
  - Returns `CreateLocalOrderResult` with `isLocal: true` flag
  - No duplicate local order numbers (sequence per tenant/day)

### Phase 7.2 — Modify POS Charge Flow

- [x] `apps/pos-terminal-web/src/hooks/useOfflineOrderSubmit.ts` — `{ submitOrder, isSubmitting }`
- [x] **Online path**: `fetch /api/orders/create-and-pay` with `x-idempotency-key` header → on success, mirror to `local_orders` (syncStatus: synced) + invalidate query cache
- [x] **Offline path**: if fetch throws TypeError/network error → `createLocalOrder()` → return with `isLocal: true`
- [x] **5xx fallback**: server error also triggers local fallback (500 = temporary, retryable)
- [x] **API validation error**: 400/422 throw to UI — NO local fallback
- [x] **Double-tap prevention**: `inFlightRef` guard + `isSubmitting` state; second call throws immediately
- [x] Cart cleared only after `submitOrder` resolves successfully
- [x] Toast shows "(OFFLINE)" title + "akan tersinkron saat online" description for local orders
- [x] `useOfflineOrderSubmit` wired into `pos.tsx` — `createAndPayMutation` removed, `submitOrder` used in `handlePaymentMethodConfirm`
- [x] `packages/offline/src/index.ts` exports `idempotency`, `orderNumber`, `localOrderService`

---

## Sprint 4 — Sync Engine (Backend + Full Loop) ❌ NOT STARTED

### Phase 9.1 — Backend Idempotency Standardization

- [ ] `source_terminal_id` field added to order create/pay request schema (`shared/schema.ts`)
- [ ] `client_created_at` field added
- [ ] `local_order_id` field added
- [ ] Unique index: `(tenant_id, idempotency_key)` on orders
- [ ] Unique index: `(tenant_id, source_terminal_id, local_order_id)` on orders
- [ ] Response returns: `idempotent_replay`, `server_order_id`, `server_order_number`, `local_order_id`, `sync_status`
- [ ] Same request sent 10× creates only 1 order

### Phase 9.2 — Backend Batch Offline Sync Endpoint

- [ ] `apps/api/src/http/controllers/SyncController.ts`
- [ ] `apps/api/src/http/routes/sync.ts`
- [ ] `packages/application/sync/SyncOfflineOrder.ts`
- [ ] `POST /api/sync/offline-orders` — accepts batch, validates tenant+terminal+idempotency, per-item result: synced/replayed/conflict/failed
- [ ] Partial batch: 1 conflict does not fail the other 49
- [ ] Batch of 50 offline orders processes correctly

### Phase 4.2 — Backend Terminal Registry

- [ ] `terminals` table added to `shared/schema.ts`: id, tenant_id, terminal_code, name, device_fingerprint, is_active, last_seen_at, created_at, updated_at
- [ ] DB migration generated
- [ ] `apps/api/src/http/controllers/TerminalsController.ts`
- [ ] Routes: `POST /api/terminals/register`, `PATCH /api/terminals/:id/heartbeat`, `GET /api/terminals`, `PATCH /api/terminals/:id/deactivate`
- [ ] Frontend heartbeat call
- [ ] Inactive terminal blocked from syncing

### Phase 9.3 — Sync Audit Tables

- [ ] `sync_batches` table in `shared/schema.ts`
- [ ] `sync_events` table
- [ ] `sync_conflicts` table (server-side)
- [ ] `terminal_sync_state` table
- [ ] Admin endpoint to view sync logs
- [ ] Record: terminal_id, app version, payload hash (not sensitive payload), success/failed/conflict counts

### Local ID → Server ID Mapping in Sync Engine

- [ ] Store `localOrderId → serverOrderId` mapping in IndexedDB after successful sync
- [ ] Store `localOrderNumber → serverOrderNumber` mapping
- [ ] Update `local_orders.serverId` and `serverOrderNumber` post-sync
- [ ] Handle 200 idempotent replay response correctly

---

## Sprint 5 — Conflict & Inventory ❌ NOT STARTED

### Phase 10.1 — Conflict Types

- [ ] `packages/offline/src/conflictTypes.ts` — conflict enum, severity (warning/needs_review/blocking), resolver policy per type
- [ ] `packages/application/sync/conflictTypes.ts` — backend-side mirror
- [ ] Conflict types: `PRODUCT_INACTIVE`, `PRODUCT_NOT_FOUND`, `PRICE_CHANGED`, `STOCK_INSUFFICIENT`, `ORDER_DUPLICATE`, `PAYMENT_DUPLICATE`, `TENANT_FEATURE_DISABLED`, `ORDER_TYPE_DISABLED`, `TABLE_UNAVAILABLE`, `TERMINAL_INACTIVE`
- [ ] UI differentiates warning vs blocking conflicts

### Phase 10.2 — Price Conflict Policy

- [ ] Server compares offline order price vs current price during sync
- [ ] Store original price in local order
- [ ] Tenant policy: accept offline price / use server price / mark needs_review
- [ ] Default POS policy: accept offline price + add audit note
- [ ] Owner can audit price difference

### Phase 10.3 — Stock Conflict Policy

- [ ] `inventory_movements` table added to `shared/schema.ts`
- [ ] Movement types: `sale`, `return`, `adjustment`, `reservation`, `offline_sale`
- [ ] Stock decrement in DB transaction during order sync/payment
- [ ] Offline stock policy (configurable): allow negative / reject if insufficient / needs_review
- [ ] `stock_conflict` stored if insufficient
- [ ] Conflict UI for owner/admin

### Phase 17.1 — Inventory Ledger

- [ ] Remove reliance on `products.stockQty` as the only source
- [ ] `inventory_items` table
- [ ] `inventory_movements` ledger — every sale, refund, void, adjustment creates a row
- [ ] `inventory_stock_snapshots` for point-in-time reporting
- [ ] `inventory_adjustments` with reason + actor
- [ ] Offline sale sync creates movement type `offline_sale`
- [ ] Stock cannot change without a ledger row

---

## Sprint 6 — Print Queue ❌ NOT STARTED

### Phase 11.1 — Local Print Job Queue

- [ ] `packages/offline/src/printQueue.ts` — enqueue, dequeue, mark states, retry
- [ ] Print job fields: id, tenantId, terminalId, localOrderId, serverOrderId, type (receipt/kitchen), payload, status, retryCount, lastError, createdAt, printedAt
- [ ] Every successful local/server order enqueues a print job
- [ ] `apps/pos-terminal-web/src/components/printer/PrintQueuePanel.tsx` — Print / Reprint / Mark Printed / Retry All buttons
- [ ] Failed print does not cancel order/payment
- [ ] Receipt not lost even if printer is off

### Phase 11.2 — Printer Abstraction Layer

- [ ] `PrinterProvider` interface: `connect()`, `print(payload)`, `disconnect()`
- [ ] `BluetoothPrinterProvider` (wraps existing Web Bluetooth manager)
- [ ] `BrowserPrintProvider` (fallback: `window.print()` or PDF)
- [ ] `NetworkPrinterProvider` (optional, LAN/IP printer)
- [ ] App not locked to one printer method

---

## Sprint 7 — Security, Production & Tests ❌ NOT STARTED

### Phase 16.1 — Auth / Tenant / RBAC Hardening

- [ ] `ALLOW_TENANT_HEADER=false` env flag — blocks `x-tenant-id` header in production
- [ ] Production tenant resolved from: subdomain, authenticated session/token, terminal registration only
- [ ] RBAC roles: owner, manager, cashier, kitchen, viewer
- [ ] Permissions enforced:
  - Cashier: create order/payment only
  - Kitchen: update fulfillment status only
  - Manager: resolve conflict/refund/void
  - Owner: manage terminal/settings

### Phase 16.2 — Offline Session Policy

- [ ] Limited offline session token stored locally
- [ ] Offline session expiry policy defined
- [ ] Local cashier PIN unlock when session expires offline
- [ ] Cashier ID audited in every local order
- [ ] Lost device can be deactivated from backend (terminal deactivation)

### Phase 18.1 — Void Order Flow

- [ ] Void local unsynced order (no server call needed)
- [ ] Void synced order with manager permission
- [ ] Void reason required
- [ ] Void enters audit log
- [ ] If payment exists, must go through refund flow first

### Phase 18.2 — Refund Flow

- [ ] `refunds` table added to `shared/schema.ts`
- [ ] Refund types: full, partial, item-level
- [ ] Reverse payment movement created
- [ ] Reverse stock movement if item returned
- [ ] Manager approval required
- [ ] Gross/net sales reporting stays accurate

### Phase 21.2 — Backend Audit Logs

- [ ] `audit_logs` table: actor (userId, terminalId, tenantId), action, entity type, minimal metadata
- [ ] Logged: create order, payment, refund, void, stock adjustment, sync conflict, terminal registration
- [ ] All cashier actions auditable by owner

### Phase 22 — Tests

- [ ] Unit tests: idempotency key generator, local order number generator, cart persistence, outbox enqueue/dequeue, sync retry/backoff, price conflict resolver, stock conflict resolver, print queue state
- [ ] Backend integration tests: create-and-pay idempotency, duplicate idempotency, batch offline sync, tenant isolation, inactive terminal rejected, stock conflict, payment double submit, row lock concurrent payment
- [ ] E2E Playwright: load online → go offline → open /pos; create order offline; create payment offline; print receipt offline; reload → order still exists; go online → sync; duplicate retry no duplicate order; price conflict; stock conflict; printer fail + reprint

### Phase 23 — CI / Deployment

- [ ] CI: type-check + lint + unit test + integration test + build PWA + Playwright E2E
- [ ] Build fails if service worker not generated
- [ ] Build fails if migration not synced
- [ ] Feature flag `offline_pos_v1` in tenant module config
- [ ] Enable for dev tenant first, then 1 pilot tenant
- [ ] Rollout monitoring: pending sync count, failed sync count, conflict rate, duplicate idempotency replay, print failure rate

---

## Sprint N — Additional Phases (Later)

### Phase 13 — Service Worker Caching Strategy

- [ ] Cache static app shell (HTML, JS, CSS, fonts)
- [ ] Routes: `/pos`, `/products`, `/kitchen-display`, `/customer-display`
- [ ] Offline SPA fallback (not just index.html)
- [ ] GET catalog: network-first, fallback local DB (not just SW cache)
- [ ] POST/PATCH/DELETE: never cached by SW; always go through outbox
- [ ] Cache version invalidation

### Phase 14 — Backend Order Lifecycle Hardening

- [ ] Final status disambiguation: `served` for fulfillment, `closed`/`closed_at` for settlement
- [ ] Kitchen mode cannot close financial order
- [ ] Cashier can close only if paid or manager override
- [ ] Offline-origin order stored in sync table (not polluting order status)
- [ ] Order lifecycle transition tests

### Phase 15 — Table Management Offline

- [ ] Tables cached in IndexedDB
- [ ] Local table status: available / occupied_local / reserved / dirty / unknown
- [ ] Offline dine-in can select table
- [ ] Table status sync on reconnect
- [ ] Table conflict detection: `TABLE_UNAVAILABLE` type
- [ ] Admin can resolve: keep table / move table / clear table

### Phase 19 — Customer Display Offline

- [ ] Customer display works offline via BroadcastChannel/localStorage events (no server dependency)
- [ ] Customer display recovers last state after reload
- [ ] Payment QR/static payment info still appears if cached

### Phase 20 — Kitchen Display Offline (Local KDS)

- [ ] KDS reads local orders that have not synced
- [ ] POS sends local kitchen ticket to local IndexedDB queue
- [ ] KDS updates local status → enters outbox → syncs when online
- [ ] Fallback: printed kitchen ticket when on separate device without local network

### Phase 21.1 — Frontend Offline Logs

- [ ] Local logs: network changes, order created, payment recorded, sync started/success/failed, print failed
- [ ] JSON log export
- [ ] "Support bundle" download for troubleshooting

### Phase 25 — Documentation (User & Developer)

- [ ] `docs/user/OFFLINE_MODE_GUIDE.md` — install PWA, pair printer, transact offline, check pending sync, retry sync, resolve conflict, reprint receipt, change terminal
- [ ] `docs/user/PRINTER_GUIDE.md`
- [ ] `docs/user/SYNC_ERROR_GUIDE.md`
- [ ] `docs/dev/OFFLINE_ENGINE.md` — update with full local DB schema (currently only Sprint 1 stub)
- [ ] `docs/dev/SYNC_PROTOCOL.md` — update with actual batch endpoint contract
- [ ] `docs/dev/IDEMPOTENCY.md` — update with backend implementation details
- [ ] `docs/dev/CONFLICT_RESOLUTION.md` — update with resolver policies per type

---

## Definition of Done — Production Grade Offline POS

- [ ] App installable as PWA (192+512 PNG icons, update prompt)
- [ ] `/pos` opens and refreshes while offline
- [ ] Products/categories/order types/features available offline
- [ ] Cart and draft survive refresh/crash
- [~] Offline order can be created (outbox exists; `createLocalOrder` + `useOfflineOrderSubmit` not yet done)
- [ ] Offline payment can be recorded
- [ ] Receipt added to print queue
- [~] All offline mutations enter outbox (outbox wired for manual use; POS flow not yet routed through it)
- [ ] Sync is safe from duplicate order/payment (idempotency key from frontend not yet sent)
- [ ] Price/stock/product/table conflicts handled
- [ ] Cashier sees pending/failed/conflict sync (widget done; data not yet coming from real offline orders)
- [ ] Admin can audit sync (sync audit tables not yet created)
- [ ] Tenant isolation is safe (header bypass still possible in current code)
- [ ] Terminal can be registered/deactivated (backend not yet built)
- [ ] Inventory uses movement ledger (not yet built)
- [ ] Refund/void has audit trail (not yet built)
- [ ] Offline E2E tests pass (not yet built)
- [ ] Rollout uses feature flag (not yet built)
- [ ] User and developer documentation complete (stubs only)

---

## Recommended Next Work — Sprint 2 (Catalog Cache)

Start here — it unblocks Sprint 3 (offline order creation):

1. `packages/offline/src/catalogCache.ts` — fetch + save products/categories/order types/features to IndexedDB
2. `packages/offline/src/tenantCache.ts` — fetch + save tenant profile, tax config, tables
3. `useOfflineProducts` hook — online: fetch+cache, offline: read IndexedDB
4. `useOfflineTenantFeatures` + `useOfflineOrderTypes` hooks
5. Wire hooks into POS product list + order type selector

Then Sprint 3 (local order service) can use the cached catalog to create offline orders without any server calls.
