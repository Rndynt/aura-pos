# Dependency Boundary Audit

Tanggal: 2026-06-23  
Commit audit: 72870e5  
Branch: work

## Scope Minimal Yang Diaudit

- `apps/api/src/index.ts`
- `apps/api/src/container.ts`
- `apps/api/src/http/controllers/`
- `apps/api/src/http/routes/`
- `apps/api/src/http/middleware/`
- `packages/application/`
- `packages/domain/`
- `packages/infrastructure/`
- `packages/offline/`
- `apps/pos-terminal-web/src/`

## Ringkasan Prioritas P0

Audit menemukan pelanggaran boundary P0 pada empat area yang diminta:

1. Direct DB/Drizzle access dari HTTP layer masih tersebar di controller, route, middleware, dan bootstrap API.
2. Pricing masih dihitung di beberapa layer: HTTP controller, application use case, offline local order service, dan frontend amount/lifecycle helpers.
3. Controller/route masih melakukan orchestration bisnis dan adapter/repository wiring langsung.
4. Type escape (`any`, `as any`, `z.unknown`) muncul pada flow payment/order/sync, termasuk saat melewati boundary DTO ke use case.

## Violations

### V-001 — P0 Direct DB dari bootstrap HTTP/auth

File: `apps/api/src/index.ts`  
Violation: Bootstrap Express mengimpor `drizzle-orm`, menjalankan query SQL langsung untuk `/api/auth/me`, dan membaca row auth melalui `authDb.execute(...)` dengan cast `rows as any[]`.  
Expected boundary: `apps/api/src/index.ts` seharusnya composition/bootstrap tipis yang memasang middleware/routes; query auth profile harus dipindahkan ke application handler/port dengan adapter infrastructure.  
Risk: Startup/auth bootstrap sulit diuji, raw SQL dan type escape dapat bocor ke endpoint auth penting, serta dekomposisi bootstrap P2 akan terhambat oleh side-effect DB di file entrypoint.  
Fix phase: P2 Bootstrap Decomposition + P5 Remove Type Safety Escape.  
Suggested action: Buat `AuthProfileQuery`/handler di application atau API service boundary yang typed, implement adapter DB di infrastructure/auth service, lalu ganti `/api/auth/me` agar hanya memanggil handler typed.

### V-002 — P0 Mega-container mengekspos DB dan concrete adapters lintas bounded context

File: `apps/api/src/container.ts`  
Violation: Container mengimpor `db`, banyak repository Drizzle concrete, unit of work, dan semua use case lintas catalog/order/payment/inventory/sync dalam satu class; container juga mengekspos `public readonly db = db`.  
Expected boundary: Composition root boleh wiring adapter concrete, tetapi harus dipisah per bounded context dan tidak menjadi service locator yang membuat HTTP layer dapat memakai `container.db` langsung.  
Risk: Coupling tinggi, mudah terjadi direct DB dari controller, sulit membuat test slice per context, dan circular dependency/hidden dependency makin sulit diaudit.  
Fix phase: P3 Composition Root Per Bounded Context.  
Suggested action: Pecah menjadi factory `createCatalogModule`, `createOrderModule`, `createPaymentModule`, `createSyncModule`, `createInventoryModule`; hapus exposure `container.db` dari API publik container dan expose hanya use case/handlers typed.

### V-003 — P0 Direct DB untuk outlet product availability di CatalogController

File: `apps/api/src/http/controllers/CatalogController.ts`  
Violation: Controller mengimpor `db`, schema `productCategories`/`outletProductConfigs`, dan Drizzle operators untuk memfilter outlet availability serta lookup category saat create/update product.  
Expected boundary: Controller hanya validasi request dan memanggil application use case; outlet availability dan category lookup harus berada di application service dengan repository port infrastructure.  
Risk: Tenant/outlet filtering tersebar di HTTP layer, catalog behavior sulit dites tanpa Express, dan direct DB dapat divergen dari repository catalog.  
Fix phase: P4 Controller Split To Use-Case Handlers.  
Suggested action: Tambah port `OutletProductAvailabilityPort` dan `CategoryLookupPort`, pindahkan filtering ke `GetProducts`/handler catalog, lalu controller hanya meneruskan `tenantId`, `outletId`, dan query DTO.

### V-004 — P0 Direct DB dan orchestration kategori di CategoryController

File: `apps/api/src/http/controllers/CategoryController.ts`  
Violation: Controller melakukan bootstrap legacy category, create, rename transaction, delete/fallback transaction, dan reorder SQL raw langsung terhadap `productCategories` dan `products`.  
Expected boundary: Category mutation/rename/reorder harus menjadi application use cases dengan repository ports; transaction dan SQL detail berada di infrastructure adapter.  
Risk: Business rule catalog tersimpan di HTTP layer, raw `sql.raw` reorder memperluas permukaan audit, dan rename/delete kategori dapat divergen dari product repository invariants.  
Fix phase: P4 Controller Split To Use-Case Handlers + P6 Shared Pricing/Domain Consistency where catalog item pricing depends on category/product shape.  
Suggested action: Buat use case `ListCategories`, `CreateCategory`, `RenameCategory`, `DeleteCategory`, `ReorderCategories`; pindahkan transaction ke repository/infrastructure dan tambah test tenant-scoped category mutation.

### V-005 — P0 SyncController memakai schema/DB langsung untuk sync admin/conflict flow

File: `apps/api/src/http/controllers/SyncController.ts`  
Violation: Controller mengimpor schema sync, Drizzle operators, memakai `container.db` untuk list batches/conflicts/events dan resolve conflict, serta memakai generic `scopedConditions<T extends { tenantId: any; outletId?: any }>` dan `orders: parsed.data.orders as any`.  
Expected boundary: Sync HTTP layer harus memanggil application sync query/command handlers dengan DTO typed; DB schema dan conflict persistence berada di infrastructure sync adapter.  
Risk: Offline sync adalah flow data-integrity tinggi; direct DB dan type escape pada batch order dapat melewati invariant order/payment/sync, membuat conflict resolution sulit dites dan raw row shape bocor ke API.  
Fix phase: P4 Controller Split To Use-Case Handlers + P5 Remove Type Safety Escape + P8 Offline-First Hardening.  
Suggested action: Tambah handlers `ListSyncBatches`, `ListSyncConflicts`, `ListSyncEvents`, `ResolveSyncConflict`; definisikan DTO offline order di application/domain sync contract agar tidak perlu `as any`.

### V-006 — P0 POSPaymentController type escape pada canonical payment/order DTO

File: `apps/api/src/http/controllers/POSPaymentController.ts`  
Violation: Zod schema masih menerima `selected_option_groups: z.array(z.unknown())`, lalu meneruskan `order: data.order as any` dan `payment: data.payment as any` ke `SubmitPOSPayment`.  
Expected boundary: Controller DTO harus parse ke command type application secara eksplisit tanpa `any`; selected option group shape harus memakai shared domain contract.  
Risk: Flow payment/order P0 dapat menerima bentuk option/split/payment yang tidak typed, sehingga invariant amount, selected options, split bill, dan persisted payment row dapat mismatch antar frontend/server/offline.  
Fix phase: P5 Remove Type Safety Escape + P6 Shared Pricing Engine SOT.  
Suggested action: Ekspor Zod/type contract `SubmitPOSPaymentHttpDto` atau mapper typed; gunakan domain `SelectedOptionGroup` schema; hapus cast `as any` dengan mapper yang mengembalikan `SubmitPOSPaymentCommand`.

### V-007 — P0 OrdersController melakukan pricing estimate dan payment orchestration di HTTP layer

File: `apps/api/src/http/controllers/OrdersController.ts`  
Violation: Controller mendefinisikan `estimateCreateAndPayTotal(...)`, memakai DEFAULT pricing constants, melakukan entitlement/order type/payment flow normalization, dan masih memakai `payment_flow: ... as any` serta `payment_kind: ... as any`.  
Expected boundary: Pricing/payment/order orchestration harus berada di application/domain service; controller hanya memanggil create/order/payment handlers.  
Risk: Pricing duplication dapat menghasilkan total berbeda dengan `CalculateOrderPricing`, create-and-pay repository, offline order, dan POS receipt; type escape pada payment flow/kind melemahkan invariant settlement.  
Fix phase: P4 Controller Split To Use-Case Handlers + P5 Remove Type Safety Escape + P6 Shared Pricing Engine SOT.  
Suggested action: Pindahkan create-and-pay estimation/normalization ke application command handler berbasis shared pricing engine; controller cukup map DTO typed dan error user-safe.

### V-008 — P0 Direct DB dan business orchestration di inventory route

File: `apps/api/src/http/routes/inventory.ts`  
Violation: Route mengimpor `db`, schema `products`/`inventoryMovements`, Drizzle operators, concrete inventory repositories, dan unit of work; route melakukan entitlement checks, balance initialization, stock adjustment, movement recording, dan report query orchestration.  
Expected boundary: Express route harus tipis; inventory commands/queries, entitlement decision, unit-of-work transaction, dan DB query detail harus berada di application handlers + infrastructure adapters.  
Risk: Inventory adjustment adalah mutation sensitif; route-level orchestration meningkatkan risiko tenant/outlet guard tidak konsisten dan sulit membuat regression test transaksi stok.  
Fix phase: P4 Controller Split To Use-Case Handlers + P10 Testing & Quality Gates.  
Suggested action: Buat `ListTrackedProducts`, `AdjustProductStock`, dan inventory report handlers; inject ports via inventory module factory, lalu route hanya validasi HTTP DTO dan memanggil handler.

### V-009 — P0 Direct DB pada outlets route

File: `apps/api/src/http/routes/outlets.ts`  
Violation: Route mengimpor `db`, schema outlets/user assignments/config, Drizzle operators, dan menjalankan listing/create/update/delete outlet langsung termasuk slot entitlement logic.  
Expected boundary: Outlet management harus menjadi application use cases dengan tenant-aware repository ports dan entitlement/capacity policy terpisah dari Express route.  
Risk: Multi-outlet entitlement dan tenant isolation mutation berada di route, sehingga policy bisa divergen dari billing/entitlement engine dan cache invalidation sulit diuji.  
Fix phase: P4 Controller Split To Use-Case Handlers + P7 Entitlement & Business Model Hardening.  
Suggested action: Buat outlet application service (`ListOutlets`, `CreateOutlet`, `UpdateOutlet`, `DeleteOutlet`) dengan policy port untuk entitlement slot; pindahkan Drizzle ke infrastructure repository.

### V-010 — P0 Direct DB di HTTP middleware tenant/outlet/RBAC

File: `apps/api/src/http/middleware/tenant.ts`, `apps/api/src/http/middleware/outlet.ts`, `apps/api/src/http/middleware/rbac.ts`  
Violation: Middleware mengimpor `db`, schema tenant/outlet assignment, Drizzle operators/raw SQL, dan memakai `(rows as any[])[0]` untuk resolve context/role.  
Expected boundary: Middleware boleh attach context, tetapi DB lookup harus melalui typed context resolver service/port; role/tenant/outlet row shape tidak boleh memakai `any`.  
Risk: Tenant isolation boundary paling kritis berada di middleware; direct DB + type escape dapat membuat auth/outlet resolution tidak konsisten dengan application policies dan sulit diuji tanpa DB.  
Fix phase: P5 Remove Type Safety Escape + P11 Production Hardening.  
Suggested action: Buat `TenantContextResolver`, `OutletContextResolver`, dan `RoleResolver` typed; middleware hanya memanggil resolver dan attach hasil typed ke request.

### V-011 — P0 Offline pricing duplication tidak menghitung selected options

File: `packages/offline/src/localOrderService.ts`  
Violation: `computePricing(...)` menghitung subtotal dari `base_price + variant_price_delta` saja, memakai default tax/service 0, dan mengabaikan `selected_options`; ini terpisah dari `packages/application/orders/CalculateOrderPricing.ts` dan `packages/application/catalog/pricing.ts`.  
Expected boundary: Offline boleh membuat order lokal, tetapi pricing harus memakai shared pricing source-of-truth/contract yang sama dengan server dan frontend.  
Risk: Offline order total, payment amount, receipt, dan sync payload dapat berbeda dari total server saat produk memiliki modifier/options/tax/service charge; ini berisiko conflict/overpayment/underpayment.  
Fix phase: P6 Shared Pricing Engine SOT + P8 Offline-First Hardening.  
Suggested action: Ekstrak pricing engine ke shared/domain/core package yang bisa dipakai application, offline, dan frontend; update local order payload agar menyimpan breakdown canonical dan test modifier/tax/service parity.

### V-012 — P0 Frontend active-order amount helper memakai type escape pada payment/order lifecycle

File: `apps/pos-terminal-web/src/features/pos-core/services/posPaymentAmountService.ts`  
Violation: Helper membaca `order_number`/`orderNumber` dengan `(order as any)` dan bergantung pada amount lifecycle helper frontend untuk memutuskan payable amount.  
Expected boundary: Frontend boleh menampilkan hasil dan prefill amount, tetapi command authority dan lifecycle/remaining amount contract harus berasal dari shared typed DTO/server response.  
Risk: Type escape pada flow bayar active order dapat menutupi perubahan kontrak `remaining_amount`/`remainingAmount`, menyebabkan UI mengirim amount salah atau memblokir pembayaran valid.  
Fix phase: P5 Remove Type Safety Escape + P6 Shared Pricing Engine SOT.  
Suggested action: Definisikan `POSLifecycleOrder` DTO canonical dengan alias mapping di API client boundary, lalu helper hanya menerima shape typed tanpa `any`.

### V-013 — P0 Infrastructure payment repository masih mengimpor mapper application dan memakai banyak type escape

File: `packages/infrastructure/repositories/payments/DrizzleSubmitPOSPaymentRepository.ts`  
Violation: Infrastructure adapter mengimpor mapper dari `@pos/application/orders/mappers`, memakai `selected_option_groups as any`, `toInsertOrderItemDb(item as any, ...)`, dan banyak enum casts untuk status/payment flow/kind/method.  
Expected boundary: Infrastructure boleh implement application ports, tetapi mapping DB row harus menjadi adapter-owned mapper atau shared contract; adapter tidak boleh bergantung pada application mapper internals yang juga membutuhkan `any`.  
Risk: Payment/order persistence P0 bisa menyimpan enum/payment row shape yang tidak dibuktikan tipe, dan dependency arah infrastructure → application implementation detail memperkuat coupling.  
Fix phase: P5 Remove Type Safety Escape + P6 Shared Pricing Engine SOT.  
Suggested action: Pindahkan DB mapper ke infrastructure atau shared adapter mapper typed; definisikan enum/value object mapping eksplisit untuk payment flow/kind/status/method; hapus `as any` bertahap dengan tests FULL/DP/MULTI/SPLIT.

### V-014 — P0 Outbox retry state bug dan offline sync status boundary tidak jelas

File: `packages/offline/src/outbox.ts`  
Violation: `markOutboxFailed` menghitung `terminal`, tetapi mengisi `status: terminal ? "failed" : "failed"`, sehingga retry sementara dan gagal final memakai status yang sama.  
Expected boundary: Offline sync state machine harus punya status/domain contract eksplisit untuk retryable failure vs terminal failure.  
Risk: UI/sync engine tidak bisa membedakan retry tertunda dengan gagal permanen, sehingga operator bisa melihat sync gagal padahal masih retry atau sebaliknya; ini berdampak pada order/payment sync reliability.  
Fix phase: P8 Offline-First Hardening + P9 Real Bug Fix Batch.  
Suggested action: Perkenalkan status typed seperti `retry_scheduled` atau gunakan `failed` hanya terminal; update dequeue query, UI conflict/sync page, dan tests retry backoff.

### V-015 — P1/P0 Direct DB tersebar di API routes/controllers selain area inti

File: `apps/api/src/http/routes/registration.ts`, `apps/api/src/http/routes/tenants.ts`, `apps/api/src/http/routes/inventory-advanced.ts`, `apps/api/src/http/routes/tables.ts`, `apps/api/src/http/controllers/TenantsController.ts`, `apps/api/src/http/controllers/TerminalsController.ts`  
Violation: Beberapa HTTP modules mengimpor `@pos/infrastructure/database`, schema Drizzle, concrete repositories, atau memakai `container.db` langsung.  
Expected boundary: HTTP modules harus memanggil application handlers/use cases; concrete DB/repositories hanya di infrastructure/composition root.  
Risk: Walaupun sebagian bukan payment/order P0 langsung, pola ini menjaga service locator/direct DB tetap hidup dan akan menghambat P4/P11 hardening.  
Fix phase: P4 Controller Split To Use-Case Handlers.  
Suggested action: Jadwalkan refactor per bounded context setelah P0 payment/order/sync/catalog selesai; tambahkan lint/import boundary rule agar direct DB import dari `apps/api/src/http/**` gagal di CI.

### V-016 — P1 Frontend imports application entitlement/business-flow implementation

File: `apps/pos-terminal-web/src/features/pos-flows/shared/resolvePOSFlowCapabilities.ts`, `apps/pos-terminal-web/src/hooks/api/useEntitlements.ts`, `apps/pos-terminal-web/src/lib/entitlementIcons.ts`  
Violation: Frontend mengimpor beberapa contract/logic dari `@pos/application/*`, bukan hanya shared/domain/core contracts.  
Expected boundary: Frontend boleh import shared contracts/domain/core, tetapi application package sebaiknya tetap server/business-use-case layer; UI menggunakan API DTO atau shared package khusus.  
Risk: Application package menjadi runtime dependency frontend, sulit memisahkan server-only use case dari browser bundle, dan entitlement/business model bisa bercabang antara UI dan API.  
Fix phase: P7 Entitlement & Business Model Hardening + P3/P4 boundary cleanup.  
Suggested action: Ekstrak entitlement catalog/business-flow public contracts ke shared/domain package; frontend hanya import read-only contract package, API tetap menjadi authority entitlement efektif.

## Non-violations / Catatan Positif

- `packages/domain/` tidak terlihat mengimpor Express, React, Drizzle concrete adapter, atau infrastructure pada audit minimal ini.
- `packages/application/` pada area yang dicek mayoritas mengarah ke domain/ports dan tidak terlihat mengimpor Express/React/Drizzle concrete adapter.
- `packages/infrastructure/` memang mengimpor Drizzle/schema sebagai adapter layer; masalah utama di infrastructure bukan Drizzle usage itu sendiri, melainkan type escape dan dependency ke mapper application pada flow payment/order.

## Recommended Fix Order

1. P5/P6 untuk payment/order DTO dan shared pricing contract karena berdampak langsung pada settlement.
2. P4 untuk `POSPaymentController`, `OrdersController`, dan `SyncController` agar HTTP layer tidak memegang orchestration P0.
3. P8/P9 untuk offline pricing parity dan outbox retry status bug.
4. P3 untuk memecah `container.ts` dan menghapus `container.db` dari surface area controller.
5. P11 tambahkan boundary lint rule: larang `@pos/infrastructure/database`, `@pos/infrastructure/db/schema`, dan `drizzle-orm` dari `apps/api/src/http/**` kecuali exception eksplisit untuk middleware resolver yang sudah typed.
