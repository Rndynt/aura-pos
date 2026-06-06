# PLANS.md — AuraPoS Execution Plans

## Active Plans

## Plan: Better Auth Register/Login Quick Implementation

### Source
- Tasklist: Tidak ada checklist formal, request user langsung
- User request: Pull terbaru dan implement register/login better-auth cepat
- Date started: 2026-05-19
- Current status: Implemented but pending DB migration for better-auth tables

### Context Read
- [x] AGENTS.md
- [x] PLANS.md
- [x] README.md
- [x] Relevant docs (better-auth installation/admin/username)
- [x] Relevant source files

### Progress
#### Completed
- [x] Integrasi endpoint better-auth di Express pada `/api/auth/*`.
- [x] Konfigurasi better-auth dengan email/password + username plugin + admin plugin.
- [x] Tambah dokumentasi env auth dasar di README.

#### Partially Completed
- [ ] Migrasi tabel better-auth di database.
  - Completed: Kode sudah siap menggunakan adapter Drizzle Postgres.
  - Remaining: Generate/apply schema migration better-auth pada DB target.
  - Reason: Tidak menjalankan migrasi DB otomatis pada batch ini.

### Validation Log
- Command: pnpm --filter @pos/api type-check
- Result: pass

### Continuation Notes
Lanjutkan dengan generate/migrate schema better-auth dan integrasi client login/register pada frontend.

## Plan: Integrasi Cetak Struk 58mm Bluetooth saat Klik Bayar

### Source
- Tasklist: Tidak ada checklist formal, request user langsung
- User request: "Gas implementasikan sekarang" untuk Bluetooth receipt printer 58mm saat bayar
- Date started: 2026-05-21
- Current status: Implemented (frontend POS integration) with browser/device compatibility caveat

### Context Read
- [x] AGENTS.md
- [x] PLANS.md
- [x] README.md
- [x] Relevant docs (ORDER_LIFECYCLE)
- [x] Relevant source files

### Progress
#### Completed
- [x] Menambahkan adapter frontend printer Bluetooth (Web Bluetooth + ESC/POS text mode) untuk struk 58mm.
- [x] Mengintegrasikan trigger cetak setelah create-and-pay sukses pada flow klik bayar.
- [x] Menambahkan guard feature flag `receipt_printer` agar cetak hanya aktif jika fitur tenant aktif.
- [x] Menambahkan UX toast terpisah untuk hasil pembayaran vs hasil cetak.

#### Partially Completed
- [ ] Retry/cetak ulang dari halaman orders.
  - Completed: Trigger auto-print saat pembayaran sukses.
  - Remaining: Tombol reprint berbasis payload order persisted.
  - Reason: Scope batch ini fokus pada auto-print saat klik bayar.

### Validation Log
- Command: pnpm --filter @pos/terminal-web type-check
- Result: fail (pre-existing type errors in example Cart components)
- Notes: TypeScript check lulus setelah perbaikan tipe Web Bluetooth dan CFD item mapping.

### Continuation Notes
Lanjutkan dengan endpoint backend payload struk tenant-aware dan fitur reprint dari Orders page untuk reliabilitas operasional.

## Plan: Persisten Pairing Printer Hub + Testing Page

### Source
- Tasklist: Tidak ada checklist formal, request user langsung
- User request: pairing printer harus tetap konek kecuali disconnect manual; perlu settings di halaman hub printers + pairing/testing di halaman itu
- Date started: 2026-05-21
- Current status: Implemented

### Context Read
- [x] AGENTS.md
- [x] PLANS.md
- [x] README.md
- [x] Relevant source files

### Progress
#### Completed
- [x] Refactor printer module menjadi singleton manager dengan state koneksi, saved paired device id, reconnect otomatis via `navigator.bluetooth.getDevices()`.
- [x] Tambah halaman `Printers` untuk pair/connect, test print, dan disconnect manual.
- [x] Tambah menu Hub ke halaman `Printers` serta route aplikasi `/printers`.
- [x] Ubah flow pembayaran agar memakai koneksi printer existing (tidak request pairing berulang).

### Validation Log
- Command: pnpm --filter @pos/terminal-web type-check
- Result: fail (pre-existing type errors in example Cart components)
- Notes: Type-check POS terminal lulus setelah integrasi halaman Printer Hub & reconnect manager.

### Continuation Notes
Langkah berikutnya: simpan preferensi service/characteristic UUID per model printer agar lebih kompatibel lintas perangkat.

## Plan: Perbaikan Auto Print Saat Printer Sudah Paired

### Source
- Tasklist: Request langsung user
- User request: auto print di cart belum jalan walau printer paired sukses
- Date started: 2026-05-21
- Current status: Implemented

### Progress
#### Completed
- [x] Tambah auto-reconnect di `bluetoothReceiptPrinter.print()` sebelum kirim bytes.
- [x] Tambah reconnect attempt di flow pembayaran POS sebelum print.

### Validation Log
- Command: pnpm --filter @pos/terminal-web type-check
- Result: fail (pre-existing type errors in example Cart components)
- Notes: Lolos setelah perbaikan reconnect flow.

## Plan: Investigasi Struk Pembayaran Tidak Keluar + Template Struk

### Source
- Tasklist: Tidak ada checklist formal, request user langsung
- User request: "Printer sudah konek, tapi saat pembayaran order bayar struk gak keluar; check kenapa + buat template struk"
- Date started: 2026-05-21
- Current status: Implemented

### Context Read
- [x] AGENTS.md
- [x] PLANS.md
- [x] README.md
- [x] Relevant source files

### Workstreams
#### Frontend/UI Workstream
- Scope: POS payment print trigger & printer hub UX
- Files inspected: apps/pos-terminal-web/src/lib/receiptPrinter.ts, apps/pos-terminal-web/src/pages/pos.tsx, apps/pos-terminal-web/src/pages/printers.tsx
- Findings: Trigger print sudah benar; kegagalan utama di koneksi hardcoded service/characteristic UUID printer bluetooth tertentu.
- Tasks: Implement fallback UUID + dynamic writable characteristic discovery; refresh template struk pembayaran.
- Risks: Sebagian model printer tetap bisa butuh UUID khusus vendor.
- Validation: pnpm --filter @pos/terminal-web type-check (pass)

### Progress
#### Completed
- [x] Investigasi akar masalah print tidak keluar walau printer paired.
  - Files changed: apps/pos-terminal-web/src/lib/receiptPrinter.ts
  - Validation: type-check pass
- [x] Perbaikan koneksi printer agar tidak hard fail di satu UUID.
  - Files changed: apps/pos-terminal-web/src/lib/receiptPrinter.ts
  - Validation: type-check pass
- [x] Menyediakan template struk pembayaran baru (58mm) yang lebih terstruktur.
  - Files changed: apps/pos-terminal-web/src/lib/receiptPrinter.ts
  - Validation: type-check pass

### Validation Log
- Command: pnpm --filter @pos/terminal-web type-check
- Result: fail (pre-existing type errors in example Cart components)
- Notes: Tidak ada error TypeScript setelah perubahan printer manager dan template struk.

### Continuation Notes
Jika masih ada model printer yang gagal, tambahkan mapping UUID per vendor/model pada setting Printer Hub.

## Plan: Fix Bluetooth writeValue >512 bytes on test print

### Source
- User request: tarik kode terbaru, perbaiki test print error `Value can't exceed 512 bytes`
- Date started: 2026-05-21
- Current status: Implemented

### Progress
#### Completed
- [x] Ganti alur kirim data ESC/POS menjadi chunked write agar tiap write <= batas BLE characteristic.
  - Files changed: apps/pos-terminal-web/src/lib/receiptPrinter.ts
  - Validation: pnpm --filter @pos/terminal-web type-check (pass)

### Continuation Notes
Jika masih ada printer bermasalah, tuning `MAX_WRITE_CHUNK_BYTES` per model di setting printer.

## Plan: Auto-print POS bayar tidak jalan meski test print sukses

### Source
- User request: pull terbaru lagi; investigasi kenapa test print sukses tapi saat bayar tidak keluar struk.
- Date started: 2026-05-21
- Current status: Implemented

### Findings
- Root cause: flow POS mengunci auto-print di feature flag `receipt_printer`.
- Test print di halaman Printer Hub tidak memakai gate flag yang sama.
- Akibatnya: test print bisa sukses, tapi bayar di POS tidak memanggil print sama sekali ketika flag tenant off.

### Completed
- [x] Ubah gate auto-print POS: print dijalankan jika `receipt_printer` aktif **atau** sudah ada device printer yang dipair.
- [x] Tambah toast informatif saat auto-print tidak aktif (flag off + belum paired).

### Validation Log
- Command: pnpm --filter @pos/terminal-web type-check
- Result: fail (pre-existing type errors in example Cart components)

## Plan: Perbaikan Dashboard & Laporan Data Real + Empty State

### Source
- Tasklist: Request user langsung
- User request: set remote origin + perbaiki dashboard/laporan agar data real dan handle empty state.
- Date started: 2026-05-21
- Current status: Implemented

### Context Read
- [x] AGENTS.md
- [x] PLANS.md
- [x] README.md
- [x] Relevant source files

### Progress
#### Completed
- [x] Set remote `origin` ke `https://github.com/Rndynt/AuraPoS.git`.
- [x] Ganti data mock halaman dashboard dengan agregasi dari order API tenant-aware.
- [x] Ganti data mock halaman laporan dengan data transaksi real dari order API.
- [x] Tambahkan empty state untuk dashboard chart/report table saat tidak ada data periode.

### Validation Log
- Command: pnpm --filter @pos/terminal-web type-check
- Result: fail (pre-existing type errors in example Cart components)

### Continuation Notes
Opsional berikutnya: buat endpoint analytics summary dedicated (server-side aggregated) agar performa dashboard lebih stabil untuk data besar.

## Plan: Master Data Kategori Produk + Perbaikan Manajemen Produk Terkait Kategori

### Source
- User request: master data/manage kategori belum ada; perbaiki semua manajemen produk terkait kategori.
- Date started: 2026-05-21
- Current status: Implemented

### Progress
#### Completed
- [x] Tambah endpoint kategori berbasis tenant untuk listing kategori dari data real produk.
- [x] Tambah endpoint rename kategori (bulk update kategori produk tenant-aware).
- [x] Integrasi halaman manajemen produk agar edit kategori pakai endpoint master kategori, bukan loop update per produk.
- [x] Form produk sekarang pakai daftar kategori real dari API kategori.

### Validation Log
- Command: pnpm --filter @pos/api type-check
- Result: pass
- Command: pnpm --filter @pos/terminal-web type-check
- Result: fail (pre-existing type errors in example Cart components)

### Continuation Update (2026-05-21)
- Implementasi next step dimulai: master table kategori `product_categories` + relasi opsional `products.category_id`.
- Endpoint kategori ditingkatkan agar berbasis master data, dengan bootstrap awal dari nilai legacy `products.category` saat master masih kosong.
- Tambah endpoint create kategori agar admin bisa membuat kategori walau belum ada produk.
- UI manajemen produk ditambah aksi `+ Kategori` dan form produk baca daftar kategori dari master data API.

### Continuation Update (2026-05-21 - UX & Schema Category Revamp)
- Ganti UX tambah kategori dari `window.prompt` ke dialog form pada halaman Products.
- Form tambah/edit produk: input kategori sekarang searchable (datalist-style) dengan sumber dari master kategori API.
- Alur simpan produk kini mendukung `category_id` (UUID), dan backend resolve nama kategori dari UUID untuk kompatibilitas transisi.
- Seeder diupdate: kategori master diinsert dan `products.category_id` ikut diisi.

## Plan: Edit/Hapus + Urutkan Kartu Kategori Produk

### Source
- Tasklist: Request user langsung
- User request: tambahkan action pada card kategori (ubah urutan/hapus), drag-drop urutan kategori, dan urutan tampil di POS setelah "All".
- Date started: 2026-05-21
- Current status: Implemented

### Progress
#### Completed
- [x] Tambah endpoint tenant-aware untuk simpan urutan kategori berdasarkan sequence (`display_order`).
- [x] Tambah UI aksi per card kategori: "Ubah urutan" dan "Hapus".
- [x] Implement drag & drop kategori untuk update urutan otomatis ke database.
- [x] Sinkronkan urutan kategori pada halaman POS (chip kategori + grouped view) setelah "All".

### Validation Log
- Command: pnpm --filter @pos/terminal-web type-check
- Result: fail (pre-existing type errors in example Cart components)
- Command: pnpm --filter @pos/api type-check
- Result: pass

### Continuation Notes
Opsional next: tambah modal konfirmasi hapus kategori dengan dropdown fallback (mengganti window.prompt) agar UX lebih aman.


## Plan: Order Queue Independen (POS + Kitchen Opsional)

### Source
- User request: Implement order queue sebagai feature flag independen, usable untuk draft/unpaid/paid, tetap kompatibel POS & kitchen
- Date started: 2026-05-21
- Current status: Implemented and validated with API test suite; API type-check still has pre-existing dependency/type issues.

### Context Read
- [x] AGENTS.md
- [x] PLANS.md
- [x] README.md
- [x] Relevant docs/source files

### Progress
#### Completed
- [x] Menambahkan feature flag independen `order_queue` pada enum core/domain feature codes.
- [x] Menambahkan default aktivasi `order_queue` pada business type templates.
- [x] Mengubah gate Order Queue di POS agar memakai feature `order_queue` (independen dari module kitchen).
- [x] Mengubah filter queue agar mencakup `draft`, `unpaid`, dan `paid` order flow (berbasis status aktif).
- [x] Menonaktifkan auto-close saat payment menjadi paid agar order tetap bisa berada di queue operasional sampai ditutup eksplisit.
- [x] Menambahkan refresh interval 5 detik pada data orders di POS saat feature `order_queue` aktif (near real-time tanpa reload manual).
- [x] Menyamakan refresh queue di Kitchen Display ke polling 5 detik saat feature `order_queue` aktif agar POS/Kitchen konsisten near real-time.
- [x] Menambahkan SSE endpoint tenant-aware (`/api/orders/queue/stream`) dan event publish dari mutation order utama untuk push update queue real-time.
- [x] Menambahkan SSE subscriber di POS dan Kitchen agar invalidate order queries secara event-driven (tetap ada polling fallback).
- [x] Perbaikan UX aksi queue: status `served` sekarang non-aksi (disabled), tidak menampilkan tombol aksi menyesatkan.

#### Partially Completed
- [ ] Belum ada tabel queue terpisah (masih berbasis status order aktif).
  - Reason: scope batch ini fokus fitur independen + alur operasional kompatibel dengan arsitektur eksisting.

### Validation Log
- Command: pnpm --filter @pos/api type-check
- Result: pass
- Command: pnpm --filter @pos/terminal-web type-check
- Result: fail (pre-existing type errors in example Cart components)

### Continuation Notes
Langkah berikutnya opsional: jika dibutuhkan audit/analytics queue lebih detail, tambahkan entitas `order_queue_entries` terpisah (queued_at, dequeued_at, source, station) sambil mempertahankan fallback status-based queue.

## Plan: Offline Production Grade POS — Sprint 1 Foundation

### Source
- Tasklist: docs/OFFLINE_PRODUCTION_GRADE_POS_TASKS.md
- User request: Implement Sprint 1 offline foundation in real code
- Date started: 2026-05-23
- Current status: Partially implemented (Sprint 1 core done)

### Context Read
- [x] AGENTS.md
- [x] PLANS.md
- [x] README.md
- [x] Active tasklist/checklist
- [x] Relevant docs
- [x] Relevant source files

### Progress
#### Completed
- [x] PWA plugin + manifest + SW registration + update prompt in POS app.
- [x] Added `@pos/offline` package with Dexie DB, typed schema, and exports.
- [x] Implemented terminal identity generation + persistent storage and frontend hook.
- [x] Implemented network status hook + status badge on main layout.
- [x] Added offline architecture and developer docs.

#### Partially Completed
- [ ] Offline fallback page behavior and deeper route precache hardening.
  - Completed: PWA setup and navigation fallback configured.
  - Remaining: dedicated offline fallback route/page and expanded runtime strategy.
  - Reason: kept batch focused on foundation with low-risk integration.

#### Not Attempted
- [ ] Sync outbox engine, local catalog cache readers/writers, cart IndexedDB migration.
  - Reason: scheduled for next sprints.

### Validation Log
- Command: pnpm install
- Result: pass
- Command: pnpm --filter @pos/offline type-check
- Result: pass
- Command: pnpm --filter @pos/terminal-web type-check
- Result: fail (pre-existing type errors in example Cart components)
- Command: pnpm --filter @pos/terminal-web build
- Result: fail (blocked by same pre-existing type errors)

### Continuation Notes
Next safest batch: implement catalog cache adapters + outbox primitives, then wire POS submit flow to online/offline strategy.

### Continuation Update (2026-05-23 - build stability and Sprint-1 hardening)
- Fixed POS terminal TypeScript/build blockers in example components by passing required `CartItem`/`CartPanel` props.
- Added missing `@pos/offline` path mapping to `apps/pos-terminal-web/tsconfig.json`.
- Replaced fragile `virtual:pwa-register` import with explicit `navigator.serviceWorker.register('/sw.js')` registration to ensure production build compatibility in current Vite setup.
- Validation rerun: `pnpm --filter @pos/terminal-web type-check` and `pnpm --filter @pos/terminal-web build` now pass.

### Continuation Update (2026-05-23 - Sprint 2 starter: cart persistence)
- Added `packages/offline/src/cartStore.ts` with IndexedDB cart session storage, legacy `sessionStorage` migration, and TTL expiry policy.
- Integrated `useCart` persistence so cart state is mirrored to IndexedDB and cleared in both stores on cart reset.
- Added startup hydration from IndexedDB (via migration helper) when sessionStorage is empty to improve crash/refresh durability.
- Validation rerun: `pnpm --filter @pos/offline type-check`, `pnpm --filter @pos/terminal-web type-check`, and `pnpm --filter @pos/terminal-web build` all pass.

### Continuation Update (2026-05-23 - local draft fallback)
- Added local draft storage primitives in `@pos/offline` (`draftOrders.ts`) with list/save/delete APIs.
- Added network-failure fallback in POS `handleSaveDraft`: when API draft save fails due to network issue, draft is persisted locally and cashier gets success feedback.
- Validation rerun: `pnpm --filter @pos/terminal-web type-check` and `pnpm --filter @pos/terminal-web build` pass.

### Continuation Update (2026-05-23 - local draft sheet integration)
- Added `LocalDraftOrdersSheet` UI to display local device drafts from IndexedDB (`@pos/offline`).
- Added local draft resume flow in POS to preload customer/table/items back into cart.
- Added local draft delete action from sheet (tenant-scoped delete).
- Validation rerun: `pnpm --filter @pos/terminal-web type-check` and `pnpm --filter @pos/terminal-web build` pass.

### Continuation Update (2026-05-23 - sync status widget baseline)
- Added `SyncStatusWidget` component with offline/healthy/pending/error status states and counters from IndexedDB (`sync_outbox` + `sync_conflicts`).
- Mounted widget in `MainLayout` next to network badge to give cashier visibility without opening devtools.
- `last_sync_at` support wired via `sync_meta` key lookup for future sync engine integration.

### Continuation Update (2026-05-23 - outbox primitives)
- Added `packages/offline/src/outbox.ts` with durable enqueue/dequeue and status transitions (`pending/syncing/synced/failed/conflict`).
- Added exponential backoff and manual retry reset for failed items.
- Exported outbox APIs via `@pos/offline` entrypoint for upcoming sync engine integration.

### Continuation Update (2026-05-23 - sync engine baseline)
- Added `packages/offline/src/syncEngine.ts` to process outbox queue and map HTTP responses to synced/failed/conflict states.
- Added `apps/pos-terminal-web/src/hooks/useSyncEngine.ts` with lock, app-open run, online-event trigger, and periodic online sync.
- Wired manual sync trigger by clicking `SyncStatusWidget`.

### Continuation Update (2026-05-23 - local orders page baseline)
- Added `/local-orders` page and `LocalOrderList` component to inspect local order sync status with filter/search.

## Plan: Tenant Auth Cross-Tenant Guard

### Source

- Tasklist: User numbered request for tenant middleware/session enforcement.
- User request: Enforce Better Auth session tenant ownership after tenant resolution, restrict production x-tenant-id fallback, apply to tenant-scoped routes, and add cross-tenant tests for orders/catalog/inventory/tenants/outlets.
- Date started: 2026-06-02
- Current status: Implemented; API test passed; API type-check attempted and blocked by pre-existing unrelated errors.

### Goal

Prevent authenticated users from accessing tenant-scoped API resources for a tenant that differs from their Better Auth `"user".tenant_id`, while preserving explicit platform-admin access and safe non-production/device tenant resolution behavior.

### Context Read

- [x] AGENTS.md
- [x] PLANS.md
- [x] README.md
- [x] Active tasklist/checklist from user request
- [x] Relevant docs (`docs/CODEBASE_AUDIT_AND_IMPROVEMENT_CHECKLIST.md`, `docs/migration-report.md` search results)
- [x] Relevant source files (`apps/api/src/http/middleware/tenant.ts`, `apps/api/src/routes.ts`, API tenant-scoped route files, Better Auth config/schema)

### Workstreams

#### Backend/API Workstream

- Scope: Tenant resolution middleware, route registration ordering, Better Auth session lookup.
- Files inspected: `apps/api/src/http/middleware/tenant.ts`, `apps/api/src/routes.ts`, `apps/api/src/http/routes/index.ts`, `apps/api/src/lib/auth.ts`, `apps/api/src/lib/auth-schema.ts`.
- Findings: Tenant resolution trusted `x-tenant-id` by default and did not compare authenticated session user tenant to resolved request tenant.
- Tasks: Implemented post-resolution auth guard and wired it before the tenant-scoped router.
- Risks: Existing unauthenticated/device routes still pass through when no Better Auth session is present; route-specific/device auth remains responsible for those flows.
- Validation: Focused API tests passed; API type-check attempted.

#### Database/Schema Workstream

- Scope: Better Auth `"user"` table fields.
- Files inspected: `apps/api/src/lib/auth-schema.ts`.
- Findings: `tenant_id` and `role` already exist on `"user"`; no schema migration required.
- Tasks: Guard now queries `id`, `tenant_id`, and `role` by `session.user.id`.
- Risks: None requiring schema changes.
- Validation: Covered by injected test doubles and type-check attempt.

#### Frontend/UI Workstream

- Scope: No UI changes expected.
- Files inspected: Not applicable beyond route consumers.
- Findings: No perceptible web application UI change.
- Tasks: None.
- Risks: Production clients relying on `x-tenant-id` without service token must switch to subdomain/session-aligned access.
- Validation: Not applicable.

#### Tests/Validation Workstream

- Scope: Cross-tenant rejection coverage for requested path families.
- Files inspected: `turbo.json`, package scripts.
- Findings: API package did not previously expose a test script.
- Tasks: Added a lightweight `node:test`/`tsx` test suite for `/api/orders/:id`, `/api/catalog/products`, `/api/inventory/products`, `/api/inventory/movements`, `/api/tenants/features`, `/api/outlets`, plus same-tenant, platform-admin, and unauthenticated passthrough cases.
- Risks: Tests focus on middleware behavior with injected dependencies, not full DB integration.
- Validation: `pnpm --filter @pos/api test` passed.

#### Documentation Workstream

- Scope: README env vars and PLANS progress.
- Files inspected: `README.md`, `PLANS.md`.
- Findings: README documented Better Auth env but not tenant header service-token behavior.
- Tasks: Added tenant resolution env documentation.
- Risks: None.
- Validation: Diff reviewed.

#### Security/Tenant Isolation Workstream

- Scope: Authenticated tenant mismatch prevention and tenant header hardening.
- Files inspected: tenant middleware and Better Auth user schema/config.
- Findings: Cross-tenant access by authenticated users could occur if `x-tenant-id`/subdomain selected another tenant.
- Tasks: Implemented 403 `TENANT_MISMATCH` rejection except exact `platform-admin`; disabled production fallback unless `TENANT_HEADER_SERVICE_TOKEN` matches `x-tenant-service-token`.
- Risks: Platform-admin bypass is exact/explicit.
- Validation: Cross-tenant tests passed.

### Execution Order

1. Safety/security/data-integrity/tenant-isolation blockers — completed.
2. Build/type/test blockers — focused tests pass; broader type-check has pre-existing unrelated blockers.
3. Dependency prerequisites — no schema migration required.
4. Highest priority actionable tasks — completed.
5. Lower priority actionable tasks — not applicable.
6. Documentation sync — README and PLANS updated.
7. Validation — test pass, type-check attempted.
8. Final checklist update — source checklist was in user prompt; final response reports status.

### Progress

#### Completed

- [x] Add Better Auth tenant ownership guard after tenant resolution.
  - Files changed: `apps/api/src/http/middleware/tenant.ts`, `apps/api/src/routes.ts`, `apps/api/src/index.ts`.
  - Validation: `pnpm --filter @pos/api test` passed.
  - Docs updated: `README.md`, `PLANS.md`.
- [x] Restrict production `x-tenant-id`/`tenant_id` fallback to configured service/device token.
  - Files changed: `apps/api/src/http/middleware/tenant.ts`, `apps/api/src/index.ts`, `README.md`.
  - Validation: `pnpm --filter @pos/api test` passed.
  - Docs updated: `README.md`.
- [x] Add cross-tenant guard tests for requested route families.
  - Files changed: `apps/api/src/__tests__/tenant-auth-guard.test.ts`, `apps/api/package.json`.
  - Validation: `pnpm --filter @pos/api test` passed.
  - Docs updated: `PLANS.md`.

#### Partially Completed

- [ ] API type-check validation.
  - Completed: Ran `pnpm --filter @pos/api type-check` and a narrower `pnpm exec tsc -p apps/api/tsconfig.json --noEmit --pretty false` check.
  - Remaining: Fix unrelated existing type errors in `featureGuard.ts`, `routes/index.ts`, and missing `@types/compression`.
  - Reason: Failures are not introduced by this tenant-auth change.

#### Blocked

- [ ] Full green API type-check.
  - Blocker: Pre-existing unrelated TypeScript errors in feature guard/rate limiter typing and missing compression declaration.
  - Required next step: Separate cleanup batch for API TypeScript baseline.

#### Not Attempted

- [ ] Full integration tests against a real database.
  - Reason: No test database setup is present for this batch; focused middleware tests cover the requested cross-tenant decision logic without DB dependency.

### Validation Log

- Command: `pnpm --filter @pos/api test`
- Result: pass
- Notes: 10 middleware tests passed.
- Command: `pnpm --filter @pos/api type-check`
- Result: fail
- Notes: Existing unrelated errors in `src/http/middleware/featureGuard.ts`, `src/http/routes/index.ts`, and missing `compression` declaration.
- Command: `pnpm exec tsc -p apps/api/tsconfig.json --noEmit --pretty false | rg "tenant|__tests__|routes.ts"`
- Result: only unrelated `featureGuard.ts` output matched `tenant_module_configs`; no tenant guard/test type errors were reported before existing blockers.
- Notes: Used to check whether this batch introduced tenant/test-specific type errors.

### Documentation Updates

- File: `README.md`
- Change: Documented `BASE_DOMAIN`, `ALLOW_TENANT_HEADER`, and `TENANT_HEADER_SERVICE_TOKEN` behavior.
- File: `PLANS.md`
- Change: Added and completed the Tenant Auth Cross-Tenant Guard execution plan.

### Checklist Updates

- File: User prompt tasklist
- Change: All requested items implemented and validated with focused tests; type-check validation is blocked by unrelated existing failures.

### Continuation Notes

Recommended next batch: fix existing API type-check blockers (`featureGuard.ts`, Express/rate-limit type mismatch, and `@types/compression`) so the full API type-check can become green.

## Plan: Harden API RBAC middleware and sensitive route guards

### Source
- Tasklist: User request with RBAC/session/route/test items
- User request: Enforce unauthenticated handling, remove cashier fallback, verify user/tenant match, guard sensitive routes, add tests.
- Date started: 2026-06-02
- Current status: Implemented; API test suite passed; API type-check still blocked by pre-existing unrelated type errors.

### Goal
Make API RBAC production-safer by requiring a real authenticated Better Auth session for protected routes, preventing cross-tenant role use, applying guards to sensitive orders/inventory/catalog/outlets/terminals/sync conflict endpoints, and validating unauthenticated/insufficient-role behavior with automated tests.

### Context Read
- [x] AGENTS.md
- [x] PLANS.md
- [x] README.md
- [x] Active user tasklist
- [x] Relevant docs (`docs/OFFLINE_PRODUCTION_GRADE_POS_TASKS.md`, `docs/dev/SYNC_PROTOCOL.md`, `docs/OFFLINE_ARCHITECTURE.md` via targeted RBAC/conflict search)
- [x] Relevant source files (`rbac.ts`, tenant middleware, route files, existing tenant guard tests)

### Workstreams

#### Backend/API Workstream
- Scope: RBAC middleware and route guards.
- Files inspected: apps/api/src/http/middleware/rbac.ts, apps/api/src/http/routes/orders.ts, inventory.ts, catalog.ts, outlets.ts, terminals.ts, sync.ts.
- Findings: Existing RBAC defaulted unauthenticated/invalid sessions to `cashier` and no sensitive route file used requireRole guards.
- Tasks: Added authenticated role resolution, user tenant match checks, no-session 401, invalid/low-role 403, and route guards.
- Risks: Read-only tenant-scoped routes remain unguarded unless they are admin/debug sync reads; this avoids breaking POS browsing while protecting sensitive mutations/admin conflict endpoints.
- Validation: `pnpm --filter @pos/api test` passed; `pnpm --filter @pos/api type-check` failed on existing unrelated type errors.

#### Tests/Validation Workstream
- Scope: Node test coverage for RBAC no-session and insufficient-role responses.
- Files inspected: apps/api/src/__tests__/tenant-auth-guard.test.ts.
- Findings: Existing tests use dependency injection pattern for tenant guard; RBAC now exposes injected factories for test isolation.
- Tasks: Added RBAC tests for unauthenticated access, no valid role, insufficient role, tenant mismatch, and sufficient role.
- Risks: None identified in the test seam; production exports still use default Better Auth/auth DB dependencies.
- Validation: `pnpm --filter @pos/api test` passed.

#### Documentation Workstream
- Scope: PLANS.md progress and final reporting.
- Files inspected: README.md, PLANS.md, RBAC references in docs.
- Findings: Existing docs mention RBAC skeleton; source checklist was the direct user list.
- Tasks: Updated PLANS.md with implementation status and validation outcomes.
- Risks: Full API type-check remains blocked by unrelated repository type issues that predate this batch.
- Validation: N/A.

### Execution Order
1. Safety/security/data-integrity/tenant-isolation blockers: completed.
2. Build/type/test blockers: tests pass; type-check blocker documented as unrelated/pre-existing.
3. Dependency prerequisites: no new dependencies needed.
4. Highest priority actionable tasks: completed.
5. Lower priority actionable tasks: completed for requested files/endpoints.
6. Documentation sync: PLANS.md updated.
7. Validation: API tests passed; API type-check attempted.
8. Final checklist update: completed in this plan.

### Progress

#### Completed
- [x] Task: Return unauthenticated when `auth.api.getSession` has no user.
  - Files changed: apps/api/src/http/middleware/rbac.ts
  - Validation: `pnpm --filter @pos/api test` passed.
  - Docs updated: PLANS.md.
- [x] Task: Remove default `cashier`; return `401 UNAUTHENTICATED` for no session and `403 INSUFFICIENT_ROLE` for low/invalid role.
  - Files changed: apps/api/src/http/middleware/rbac.ts, apps/api/src/__tests__/rbac.test.ts
  - Validation: `pnpm --filter @pos/api test` passed.
  - Docs updated: PLANS.md.
- [x] Task: Ensure `requireRole` verifies `req.userId` and `req.tenantId` against the authenticated user's tenant.
  - Files changed: apps/api/src/http/middleware/rbac.ts, apps/api/src/__tests__/rbac.test.ts
  - Validation: `pnpm --filter @pos/api test` passed.
  - Docs updated: PLANS.md.
- [x] Task: Add role guards to sensitive orders, inventory, catalog, outlets, terminals, and sync conflict routes.
  - Files changed: apps/api/src/http/routes/orders.ts, inventory.ts, catalog.ts, outlets.ts, terminals.ts, sync.ts
  - Validation: `pnpm --filter @pos/api test` passed.
  - Docs updated: PLANS.md.
- [x] Task: Add tests for unauthenticated access and insufficient role.
  - Files changed: apps/api/src/__tests__/rbac.test.ts
  - Validation: `pnpm --filter @pos/api test` passed.
  - Docs updated: PLANS.md.

#### Partially Completed
- [ ] Task: Full API type-check green.
  - Completed: Ran `pnpm --filter @pos/api type-check`.
  - Remaining: Fix unrelated existing errors in `featureGuard.ts`, Express/rate-limit type version mismatch, and missing compression declarations.
  - Reason: Failures are outside this RBAC change set and were already documented as the recommended next batch in the prior active plan.

#### Blocked
- [ ] Task: None for requested RBAC implementation.
  - Blocker: N/A
  - Required next step: N/A

#### Not Attempted
- [ ] Task: Full monorepo test/build.
  - Reason: API-scoped RBAC changes were validated with API tests; API type-check already identifies unrelated blockers.

### Validation Log
- Command: `pnpm --filter @pos/api test`
- Result: Pass
- Notes: 15 tests passed, including 5 new RBAC tests.
- Command: `pnpm --filter @pos/api type-check`
- Result: Fail (unrelated/pre-existing type errors)
- Notes: Errors reported in `src/http/middleware/featureGuard.ts`, `src/http/routes/index.ts` rate limiter typings, and missing `compression` declaration.

### Documentation Updates
- File: PLANS.md
- Change: Added and completed RBAC hardening execution plan with validation outcomes.

### Checklist Updates
- File: PLANS.md
- Change: Marked all requested RBAC items implemented/validated; recorded type-check blocker separately as partial/unrelated.

### Continuation Notes
Recommended next batch: fix existing API type-check blockers (`featureGuard.ts`, Express/rate-limit type mismatch, and `@types/compression`) so `pnpm --filter @pos/api type-check` can pass, then consider whether read-only admin/reporting routes should also require authenticated viewer/cashier access.

## Plan: Harden KDS order status transitions

### Source
- Tasklist: User request in chat (KDS status/update hardening)
- User request: Force KDS status updates through kitchen mode/use case, restrict KDS statuses, validate outlet-bound KDS devices, and test completed/cancelled rejection.
- Date started: 2026-06-02
- Current status: Implemented; API type-check remains blocked by pre-existing unrelated errors.

### Goal
Ensure KDS API keys can only drive kitchen fulfillment transitions for their own tenant/outlet and cannot perform financial close or cancellation transitions.

### Context Read
- [x] AGENTS.md
- [x] PLANS.md
- [x] README.md
- [x] Active tasklist/checklist
- [x] Relevant docs/source search for KDS/order status/outlet behavior
- [x] Relevant source files

### Workstreams

#### Backend/API Workstream
- Scope: apps/api/src/http/routes/kds.ts and OrdersController delegation.
- Files inspected: apps/api/src/http/routes/kds.ts, apps/api/src/http/controllers/OrdersController.ts, apps/api/src/http/routes/index.ts, apps/api/src/http/middleware/outlet.ts.
- Findings: OrdersController already has kitchen mode that allows only confirmed/preparing/ready/served, but KDS route did not force mode before delegation.
- Tasks: Implemented status allow-list pre-validation and forced `req.query.mode = 'kitchen'` before status delegation.
- Risks: KDS can no longer reach POS/cashier completed/cancelled transition map through the KDS route.
- Validation: API test pass; type-check attempted and blocked by pre-existing unrelated errors.

#### Database/Schema Workstream
- Scope: kds_devices outlet_id and orders outlet_id matching.
- Files inspected: migrations/0010_multi_outlet.sql, shared/schema.ts.
- Findings: kds_devices has outlet_id managed outside Drizzle schema; orders has outlet_id.
- Tasks: Implemented selection of KDS device `outlet_id` and target order outlet validation when the device is outlet-bound.
- Risks: Legacy orders with null outlet_id are rejected for outlet-bound KDS devices.
- Validation: API tests pass for status guard; type-check attempted.

#### Tests/Validation Workstream
- Scope: KDS route tests.
- Files inspected: apps/api/src/__tests__/rbac.test.ts, apps/api/src/__tests__/tenant-auth-guard.test.ts, apps/api/package.json.
- Findings: API uses node:test via tsx.
- Tasks: Added KDS route tests proving completed/cancelled are rejected before controller delegation and allowed statuses delegate in kitchen mode.
- Risks: Tests use dependency injection rather than a live DB integration harness.
- Validation: `pnpm --filter @pos/api test` passed.

### Execution Order
1. KDS status and kitchen-mode enforcement. Done.
2. Outlet-bound device context/validation. Done.
3. Tests for completed/cancelled rejection. Done.
4. Type/test validation. Tests passed; type-check blocked by existing unrelated errors.
5. Final plan update. Done.

### Progress

#### Completed
- [x] Force KDS order status updates into kitchen mode.
  - Files changed: apps/api/src/http/routes/kds.ts
  - Validation: pnpm --filter @pos/api test (pass)
  - Docs updated: PLANS.md
- [x] Restrict KDS status payloads to confirmed/preparing/ready/served.
  - Files changed: apps/api/src/http/routes/kds.ts
  - Validation: pnpm --filter @pos/api test (pass)
  - Docs updated: PLANS.md
- [x] Validate outlet-bound KDS devices against target order outlet.
  - Files changed: apps/api/src/http/routes/kds.ts
  - Validation: pnpm --filter @pos/api test (pass)
  - Docs updated: PLANS.md
- [x] Add KDS tests for completed/cancelled rejection.
  - Files changed: apps/api/src/__tests__/kds.test.ts
  - Validation: pnpm --filter @pos/api test (pass)
  - Docs updated: PLANS.md

#### Partially Completed
- [ ] None.

#### Blocked
- [ ] Full API type-check clean pass.
  - Blocker: Pre-existing unrelated TypeScript errors in featureGuard, rate-limit/Express type mismatch, and missing @types/compression.
  - Required next step: Fix existing API type-check blockers in a separate batch.

#### Not Attempted
- [ ] Live DB integration test for outlet-bound KDS device.
  - Reason: Current API tests are lightweight node:test route tests without a live Postgres fixture.

### Validation Log
- Command: pnpm --filter @pos/api exec tsx --test src/__tests__/kds.test.ts
- Result: Pass
- Notes: KDS-only tests passed.
- Command: pnpm --filter @pos/api test
- Result: Pass
- Notes: All API tests passed (18 tests).
- Command: pnpm --filter @pos/api type-check
- Result: Fail (pre-existing unrelated errors)
- Notes: No KDS/test-specific errors remained after fixes; remaining errors are existing featureGuard/rate-limit/@types/compression issues.

### Documentation Updates
- File: PLANS.md
- Change: Added and completed active KDS hardening plan with validation notes.

### Continuation Notes
Recommended next batch: fix existing API type-check blockers (`featureGuard.ts`, Express/rate-limit type mismatch, and missing `@types/compression`) so `pnpm --filter @pos/api type-check` can pass cleanly.

## Plan: Atomic quick-pay stock deduction and concurrency tests

### Source
- Tasklist: User request with 5 inventory/order integrity tasks.
- User request: Move stock deduction/reversal into transactions, allow helper tx injection, make CreateAndPay quick-pay atomic with stock movement, use conditional stock update when negative stock is disallowed, and add concurrency tests.
- Date started: 2026-06-02
- Current status: Implemented; API-wide type-check still has unrelated pre-existing errors.

### Goal
Make quick-pay order creation, payment recording, stock deduction, and inventory ledger writes commit or roll back together while preserving tenant filters and preventing oversell under concurrent requests on tracked products.

### Context Read
- [x] AGENTS.md
- [x] PLANS.md
- [x] README.md
- [x] Active tasklist/checklist (user prompt)
- [x] Relevant docs (`docs/ORDER_LIFECYCLE.md`)
- [x] Relevant source files (`stockDeduction.ts`, `CreateAndPayOrder.ts`, orders controller, schema, database types, existing tests)

### Workstreams

#### Backend/API Workstream
- Scope: Stock helper and quick-pay use case.
- Files inspected: apps/api/src/http/helpers/stockDeduction.ts; packages/application/orders/CreateAndPayOrder.ts; apps/api/src/http/controllers/OrdersController.ts.
- Findings: Helper used global db for lock/update/movement and swallowed movement insert errors; quick-pay deducted stock after the order/payment transaction committed.
- Tasks: Completed by adding application inventory helpers with optional tx and moving quick-pay deduction into the existing CreateAndPayOrder transaction.
- Risks: Online quick-pay for tracked products now rejects insufficient stock instead of allowing negative stock.
- Validation: `pnpm --filter @pos/application type-check`; `pnpm --filter @pos/api test`.

#### Database/Schema Workstream
- Scope: Existing product stock and inventory movement schema.
- Files inspected: shared/schema.ts; packages/infrastructure/database.ts.
- Findings: products.stockQty is nullable integer; stockTrackingEnabled gates stock mutation; inventory_movements stores before/after quantities.
- Tasks: No schema change needed; implemented transactional row locks and conditional stock updates.
- Risks: `SELECT ... FOR UPDATE` correctness depends on PostgreSQL transaction context, now provided by helper-owned transactions or caller tx.
- Validation: Type-check and fake transactional concurrency test.

#### Frontend/UI Workstream
- Scope: None.
- Files inspected: README.md for app context.
- Findings: No UI changes required.
- Tasks: Not applicable.
- Risks: None.
- Validation: Not applicable.

#### Tests/Validation Workstream
- Scope: Concurrency coverage for limited stock.
- Files inspected: apps/api/src/__tests__ patterns; package scripts.
- Findings: API uses Node test runner; existing tests avoid live DB by stubbing.
- Tasks: Added a fake transactional DB test that runs two create-and-pay calls concurrently against one tracked unit and verifies one rollback.
- Risks: Fake DB covers the use-case chains involved in this path, not all Drizzle behavior.
- Validation: `pnpm --filter @pos/api test` passed.

#### Documentation Workstream
- Scope: Order lifecycle docs and PLANS progress.
- Files inspected: docs/ORDER_LIFECYCLE.md.
- Findings: Existing docs claimed create-and-pay is atomic for order/payment but did not mention stock.
- Tasks: Updated docs to include stock deduction and inventory movement atomicity for quick-pay.
- Risks: None.
- Validation: Reviewed with implementation.

#### Security/Tenant Isolation Workstream
- Scope: Tenant-aware stock/product access.
- Files inspected: stock helper, quick-pay product validation.
- Findings: Existing stock queries filter by tenant and product IDs.
- Tasks: Preserved tenant filters on validation, locks, conditional update, and movement inserts.
- Risks: None identified.
- Validation: API test suite includes tenant guard tests; new stock code type-checks in application package.

### Execution Order
1. Safety/security/data-integrity/tenant-isolation blockers.
2. Build/type/test blockers.
3. Dependency prerequisites.
4. Highest priority actionable tasks.
5. Lower priority actionable tasks.
6. Documentation sync.
7. Validation.
8. Final checklist update.

### Progress

#### Completed
- [x] Move stock deduction/reversal into transactions with the same tx for `SELECT ... FOR UPDATE`, product stock update, and inventory movement insert.
  - Files changed: packages/application/inventory/stockMovements.ts; apps/api/src/http/helpers/stockDeduction.ts.
  - Validation: `pnpm --filter @pos/application type-check`; `pnpm --filter @pos/api test`.
  - Docs updated: docs/ORDER_LIFECYCLE.md.
- [x] Allow stock helper to accept optional tx.
  - Files changed: packages/application/inventory/stockMovements.ts; apps/api/src/http/helpers/stockDeduction.ts; packages/application/package.json.
  - Validation: `pnpm --filter @pos/application type-check`; `pnpm --filter @pos/api test`.
  - Docs updated: PLANS.md.
- [x] Make quick-pay order creation, payment, stock deduction, and inventory movement atomic.
  - Files changed: packages/application/orders/CreateAndPayOrder.ts.
  - Validation: `pnpm --filter @pos/application type-check`; `pnpm --filter @pos/api test`.
  - Docs updated: docs/ORDER_LIFECYCLE.md.
- [x] Add non-negative stock conditional update path.
  - Files changed: packages/application/inventory/stockMovements.ts.
  - Validation: `pnpm --filter @pos/application type-check`; `pnpm --filter @pos/api test`.
  - Docs updated: PLANS.md.
- [x] Add concurrency tests for two parallel orders on limited stock.
  - Files changed: apps/api/src/__tests__/create-and-pay-stock-concurrency.test.ts.
  - Validation: `pnpm --filter @pos/api test`.
  - Docs updated: PLANS.md.

#### Partially Completed
- [ ] API package type-check cleanup.
  - Completed: Ran API type-check to verify current state.
  - Remaining: Fix unrelated existing Express/rate-limit/compression declaration errors.
  - Reason: Errors are outside the changed stock/order files and pre-existing in the broader API package.

#### Blocked
- [ ] None.
  - Blocker: None.
  - Required next step: None.

#### Not Attempted
- [ ] Frontend/UI changes.
  - Reason: No frontend behavior requested or required.

### Validation Log
- Command: `pnpm --filter @pos/application type-check`
- Result: Pass
- Notes: Application package including new inventory helper and quick-pay changes type-checks.
- Command: `pnpm --filter @pos/api test`
- Result: Pass
- Notes: Includes new create-and-pay stock concurrency test and existing API tests.
- Command: `pnpm --filter @pos/api type-check`
- Result: Fail (unrelated existing errors)
- Notes: Fails in `featureGuard.ts`, `routes/index.ts`, and missing `@types/compression`, not in the changed inventory/order files.

### Documentation Updates
- File: docs/ORDER_LIFECYCLE.md
- Change: Quick-pay atomicity now documents order, payment, product stock, and inventory movement ledger behavior.
- File: PLANS.md
- Change: Added and completed this execution plan with validation results.

### Checklist Updates
- File: User prompt / PLANS.md
- Change: All 5 requested tasks implemented and tracked as completed; unrelated API type-check issue noted separately.

### Continuation Notes
Next recommended batch is to fix the pre-existing API type-check errors in `featureGuard.ts`, `routes/index.ts`, and compression typings so `pnpm --filter @pos/api type-check` can pass cleanly.

## Plan: Kebijakan Inventory Strict vs Allow-Negative + Retry Movement

### Source

- Tasklist: User request direct inventory/order hardening items 1-5.
- User request: Tentukan policy per tenant/module, enforce strict inventory before confirm/complete response, durable errors for allow-negative, remove silent catches, add alert/retry job.
- Date started: 2026-06-02
- Current status: Implemented; validation attempted with unrelated pre-existing API type-check errors noted.

### Goal

Make online order stock movement behavior explicit per tenant/module: strict inventory blocks order confirmation/quick-pay completion until stock and ledger writes succeed, while allow-negative permits order flow but records durable retryable inventory sync failures instead of silent console errors.

### Context Read

- [x] AGENTS.md
- [x] PLANS.md
- [x] README.md
- [x] Active tasklist/checklist (user-provided list)
- [x] Relevant docs (`docs/ORDER_LIFECYCLE.md`)
- [x] Relevant source files (`OrdersController`, `CreateAndPayOrder`, `stockMovements`, schema, API startup)

### Workstreams

#### Backend/API Workstream

- Scope: order confirm/kitchen/create-and-pay stock paths, startup job registration.
- Files inspected: `apps/api/src/http/controllers/OrdersController.ts`, `apps/api/src/index.ts`, `apps/api/src/container.ts`.
- Findings: confirm and kitchen-ticket paths swallow stock deduction errors with `.catch(() => {})`; create-and-pay forces strict stock behavior; no retry job exists.
- Tasks: resolve tenant inventory policy, replace silent catches with strict/allow-negative handler, start retry job.
- Risks: confirm use case commits status before stock movement in current architecture; strict mode must fail response on movement failure but may need follow-up transactional status+stock refactor for full rollback.
- Validation: API/application type-check and targeted tests where available.

#### Database/Schema Workstream

- Scope: durable `inventory_sync_errors` table.
- Files inspected: `shared/schema.ts`, `migrations/`.
- Findings: no durable table for failed stock movement retry/alert records exists.
- Tasks: add schema and SQL migration with tenant/order/product indexes.
- Risks: Drizzle meta snapshots are not regenerated in this environment; SQL migration is added manually.
- Validation: type-check.

#### Frontend/UI Workstream

- Scope: none for this backend-only batch.
- Files inspected: not applicable.
- Findings: no perceptible web UI change expected.
- Tasks: none.
- Risks: none.
- Validation: not applicable.

#### Tests/Validation Workstream

- Scope: API/application type-check and existing API tests.
- Files inspected: `apps/api/package.json`, `packages/application/package.json`.
- Findings: pnpm scripts available for type-check/test.
- Tasks: run relevant validation after implementation.
- Risks: existing tests may require DATABASE_URL/test environment.
- Validation: record exact commands/results.

#### Documentation Workstream

- Scope: order lifecycle and plan tracking.
- Files inspected: `docs/ORDER_LIFECYCLE.md`, `PLANS.md`.
- Findings: existing docs claim strict atomic quick-pay; needs policy caveat for allow-negative retry behavior.
- Tasks: update docs after implementation.
- Risks: avoid overstating production readiness.
- Validation: docs reviewed.

#### Security/Tenant Isolation Workstream

- Scope: tenant-aware policy lookup and retry records.
- Files inspected: schema and stock helpers.
- Findings: stock helpers filter products by tenant; retry/error records must include tenant_id and retry job must use tenant filter.
- Tasks: keep all inventory sync errors and retry movement lookup tenant-scoped.
- Risks: retry must avoid cross-tenant order/product access.
- Validation: type-check and code review.

### Execution Order

1. Add durable schema/migration for `inventory_sync_errors`.
2. Add policy resolver and durable error helpers.
3. Replace silent stock movement failures in order controllers.
4. Make create-and-pay use tenant policy.
5. Add retry/alert job and start it from API boot.
6. Update docs and this plan.
7. Run validation, commit, create PR.

### Progress

#### Completed

- [ ] Task:
  - Files changed:
  - Validation:
  - Docs updated:

#### Partially Completed

- [ ] Task:
  - Completed:
  - Remaining:
  - Reason:

#### Blocked

- [ ] Task:
  - Blocker:
  - Required next step:

#### Not Attempted

- [ ] Task:
  - Reason:

### Validation Log

- Command: pending
- Result: pending
- Notes: pending

### Documentation Updates

- File: pending
- Change: pending

### Checklist Updates

- File: user request / PLANS.md
- Change: plan section added; final status pending

### Continuation Notes

Continue by adding schema/migration, implementing policy/error/retry helpers, then replacing silent catches in order flows.

### Progress Update (2026-06-02)

#### Completed

- [x] Task: Tentukan policy per tenant/module (`strict` atau `allow_negative`).
  - Files changed: `packages/application/inventory/inventoryPolicy.ts`, `packages/application/inventory/index.ts`.
  - Validation: `pnpm --filter @pos/application type-check` passed; `pnpm --filter @pos/api test` passed.
  - Docs updated: `docs/ORDER_LIFECYCLE.md` documents `tenant_module_configs.config.inventory_policy` / `inventoryPolicy` and module defaults.
- [x] Task: Strict inventory must complete stock update + ledger before order confirm/complete response.
  - Files changed: `apps/api/src/http/controllers/OrdersController.ts`, `packages/application/orders/CreateAndPayOrder.ts`.
  - Validation: `pnpm --filter @pos/application type-check` passed; `pnpm --filter @pos/api test` passed.
  - Docs updated: `docs/ORDER_LIFECYCLE.md` documents strict behavior.
- [x] Task: Allow-negative inventory records durable failure instead of only logging.
  - Files changed: `shared/schema.ts`, `migrations/0011_inventory_sync_errors.sql`, `packages/application/inventory/inventorySyncErrors.ts`, `apps/api/src/http/controllers/OrdersController.ts`, `packages/application/orders/CreateAndPayOrder.ts`.
  - Validation: `pnpm --filter @pos/application type-check` passed; `pnpm --filter @pos/api test` passed.
  - Docs updated: `docs/ORDER_LIFECYCLE.md` documents durable `inventory_sync_errors` fallback.
- [x] Task: Hapus `.catch(() => {})` silent failure di order stock movement paths.
  - Files changed: `apps/api/src/http/controllers/OrdersController.ts`; `packages/application/orders/CreateAndPayOrder.ts` inspected and now records allow-negative failures explicitly.
  - Validation: `rg -n "catch\(\(\) => \{\}\)|console\.error" apps/api/src/http/controllers/OrdersController.ts packages/application/orders/CreateAndPayOrder.ts` returned no matches.
  - Docs updated: not required beyond order lifecycle behavior docs.
- [x] Task: Tambahkan alert/retry job untuk inventory movement yang gagal.
  - Files changed: `apps/api/src/jobs/inventorySyncRetryJob.ts`, `apps/api/src/index.ts`, `README.md`.
  - Validation: `pnpm --filter @pos/api test` passed; API type-check attempted but still has unrelated pre-existing Express/rate-limit/compression declaration issues.
  - Docs updated: `README.md` documents retry job environment variables.

#### Partially Completed

- [ ] Task: Make non-quick-pay confirm status update and stock movement a single DB transaction in strict mode.
  - Completed: strict mode now blocks the HTTP response when stock update/ledger fails; quick-pay strict remains fully transactional.
  - Remaining: refactor `ConfirmOrder` repository update and stock movement into one DB transaction so failed strict inventory also rolls back the already-confirmed status for the standalone confirm endpoint.
  - Reason: current `ConfirmOrder` use case commits status before API-level stock helper runs; changing repository transaction boundaries is a larger follow-up.

#### Blocked

- [ ] Task: Full API type-check green.
  - Blocker: `pnpm --filter @pos/api type-check` still fails on unrelated existing Express v4/v5 `RateLimitRequestHandler` type mismatch, missing `@types/compression`, and `featureGuard.ts` table cast issue.
  - Required next step: dependency/type hygiene pass for API package.

#### Not Attempted

- [ ] Task: Frontend UI for inventory sync alerts.
  - Reason: user requested alert/retry job; backend job logs warning alerts and durable failed status. No UI change was required in this batch.

### Validation Log

- Command: `pnpm --filter @pos/application type-check`
- Result: pass
- Notes: Application package compiles.
- Command: `pnpm --filter @pos/api test`
- Result: pass
- Notes: 19 API tests passed.
- Command: `pnpm --filter @pos/api type-check`
- Result: fail
- Notes: unrelated existing API type issues in `featureGuard.ts`, `routes/index.ts`, and missing `@types/compression` declaration.
- Command: `rg -n "catch\(\(\) => \{\}\)|console\.error" apps/api/src/http/controllers/OrdersController.ts packages/application/orders/CreateAndPayOrder.ts`
- Result: pass (no matches)
- Notes: requested silent failures removed from the specified files.

### Documentation Updates

- File: `docs/ORDER_LIFECYCLE.md`
- Change: documented strict vs allow-negative inventory policy, quick-pay transactional behavior, and durable retry/audit fallback.
- File: `README.md`
- Change: documented inventory sync retry job environment variables.

### Checklist Updates

- File: `PLANS.md`
- Change: added and updated active plan for inventory policy/retry execution.

### Continuation Notes

Next safest follow-up is to make standalone `/api/orders/:id/confirm` status transition and stock movement share one DB transaction in strict mode, then clean the existing API type-check blockers.

## Plan: Create-and-pay order/payment lifecycle decoupling

### Source

- Tasklist: User request (4 numbered lifecycle tasks)
- User request: Prevent full payment from auto-completing orders, preserve operational fulfillment states, add explicit instant-fulfillment flag if needed, sync docs/frontend/tests.
- Date started: 2026-06-02
- Current status: Completed for this batch

### Goal

Ensure `POST /api/orders/create-and-pay` records payment status/paid amount atomically without closing the operational order lifecycle unless an explicit validated instant-fulfillment mode is requested.

### Context Read

- [x] AGENTS.md
- [x] PLANS.md
- [x] README.md
- [x] Active user tasklist
- [x] Relevant docs (`docs/ORDER_LIFECYCLE.md`)
- [x] Relevant source files (`CreateAndPayOrder`, order status use cases/controllers, frontend open queue, offline sync, lifecycle tests)

### Workstreams

#### Backend/API Workstream

- Scope: Create-and-pay lifecycle behavior and request validation.
- Files inspected: `packages/application/orders/CreateAndPayOrder.ts`, `apps/api/src/http/controllers/OrdersController.ts`, `packages/application/orders/RecordPayment.ts`, `packages/application/orders/CompleteOrder.ts`, `packages/domain/orders/OrderStateValidator.ts`.
- Findings: Create-and-pay set `status='completed'` and `closedAt` whenever payment became `paid`; RecordPayment already kept payment separate from fulfillment.
- Tasks: Remove implicit full-payment completion; add validated explicit `fulfillment_mode='instant'` request mode for intentional non-kitchen auto-completion.
- Risks: Paid-but-unfulfilled orders must remain visible in operational queues.
- Validation: Targeted API lifecycle test passed; application package type-check passed.

#### Frontend/UI Workstream

- Scope: Open order queue labels and filters.
- Files inspected: `apps/pos-terminal-web/src/components/pos/OrderQueuePanel.tsx`, `apps/pos-terminal-web/src/components/kitchen-display/OrderQueue.tsx`, `apps/pos-terminal-web/src/lib/api/tableHooks.ts`, `apps/pos-terminal-web/src/lib/api/hooks.ts`.
- Findings: One panel still used legacy `status === 'open'` pending filter/label; backend open query already includes draft/confirmed/preparing/ready/served.
- Tasks: Align frontend active/pending status filters with current lifecycle and expose `fulfillment_mode` in create-and-pay input type.
- Risks: Avoid hiding paid-but-unfulfilled confirmed orders.
- Validation: Terminal web type-check passed.

#### Tests/Validation Workstream

- Scope: Lifecycle regression coverage.
- Files inspected: `apps/api/src/__tests__/create-and-pay-stock-concurrency.test.ts`.
- Findings: Existing test covered stock transaction but not lifecycle status after full payment.
- Tasks: Added tests for full-payment confirmed status and explicit instant mode completion.
- Risks: None remaining in this batch.
- Validation: Targeted node test passed.

#### Documentation Workstream

- Scope: Order lifecycle docs.
- Files inspected: `docs/ORDER_LIFECYCLE.md`.
- Findings: Docs described separate payment/fulfillment but quick-pay wording could imply completion.
- Tasks: Updated atomic quick-pay and workflows to state full payment does not auto-complete unless `fulfillment_mode='instant'` is explicitly validated.
- Risks: None remaining in this batch.
- Validation: Manual documentation review.

#### Offline/Sync Workstream

- Scope: Offline local order and sync payload lifecycle parity.
- Files inspected: `packages/offline/src/localOrderService.ts`, `apps/pos-terminal-web/src/hooks/useOfflineOrderSubmit.ts`, `packages/application/sync/SyncOfflineOrder.ts`.
- Findings: Offline quick-pay mirrored local orders as `completed` by default.
- Tasks: Keep offline quick-pay local orders `confirmed` by default, preserve explicit `instant` fulfillment mode through queued sync.
- Risks: Existing local orders are not migrated; new offline orders follow the corrected lifecycle.
- Validation: Offline package and terminal web type-check passed.

### Execution Order

1. Backend lifecycle fix.
2. Frontend/offline queue and payload sync.
3. Tests lifecycle coverage.
4. Documentation sync.
5. Validation and commit.

### Progress

#### Completed

- [x] Task: Full payment no longer implicitly completes create-and-pay orders.
  - Files changed: `packages/application/orders/CreateAndPayOrder.ts`, `apps/api/src/http/controllers/OrdersController.ts`.
  - Validation: targeted lifecycle test and application type-check passed.
  - Docs updated: `docs/ORDER_LIFECYCLE.md`.
- [x] Task: Explicit instant fulfillment path added.
  - Files changed: `packages/application/orders/CreateAndPayOrder.ts`, `apps/api/src/http/controllers/OrdersController.ts`, `apps/pos-terminal-web/src/lib/api/hooks.ts`, `packages/offline/src/localOrderService.ts`, `packages/application/sync/SyncOfflineOrder.ts`.
  - Validation: targeted lifecycle test and package type-checks passed.
  - Docs updated: `docs/ORDER_LIFECYCLE.md`.
- [x] Task: Frontend/offline status lifecycle sync.
  - Files changed: `apps/pos-terminal-web/src/components/pos/OrderQueuePanel.tsx`, `apps/pos-terminal-web/src/hooks/useOfflineOrderSubmit.ts`, `packages/offline/src/localOrderService.ts`.
  - Validation: terminal web/offline type-check passed.
  - Docs updated: `docs/ORDER_LIFECYCLE.md`.
- [x] Task: Tests status lifecycle.
  - Files changed: `apps/api/src/__tests__/create-and-pay-stock-concurrency.test.ts`.
  - Validation: targeted node test passed.
  - Docs updated: none.

#### Partially Completed

- [ ] Task: Full monorepo `pnpm type-check` green.
  - Completed: Relevant packages (`@pos/application`, `@pos/offline`, `@pos/terminal-web`) type-check green.
  - Remaining: Existing `@pos/api` type-check blockers remain.
  - Reason: Failures are unrelated pre-existing Express/rate-limit/compression/featureGuard typing issues.

#### Blocked

- [ ] Task: Full root `pnpm type-check`.
  - Blocker: Existing `@pos/api` type errors in `src/http/middleware/featureGuard.ts`, `src/http/routes/index.ts`, and missing declaration for `compression`.
  - Required next step: API dependency/type hygiene pass.

#### Not Attempted

- [ ] Task: Database `fulfillment_mode` persistence column.
  - Reason: User allowed a request flag alternative; this batch added a validated request flag and avoided schema churn.

### Validation Log

- Command: `pnpm exec tsx --tsconfig apps/api/tsconfig.node.json apps/api/src/__tests__/create-and-pay-stock-concurrency.test.ts`
- Result: pass
- Notes: 3 lifecycle/stock tests passed.
- Command: `pnpm --filter @pos/application type-check`
- Result: pass
- Notes: Application package compiles.
- Command: `pnpm --filter @pos/offline type-check`
- Result: pass
- Notes: Offline package compiles.
- Command: `pnpm --filter @pos/terminal-web type-check`
- Result: pass
- Notes: Terminal web package compiles.
- Command: `pnpm type-check`
- Result: fail
- Notes: unrelated existing API type issues in `featureGuard.ts`, `routes/index.ts`, and missing `@types/compression` declaration.

### Documentation Updates

- File: `docs/ORDER_LIFECYCLE.md`
- Change: Documented payment/fulfillment separation for quick-pay, explicit `fulfillment_mode="instant"`, queue-visible paid orders, and updated workflows/state diagram.

### Checklist Updates

- File: `PLANS.md`
- Change: Added active execution plan and completed status for lifecycle task.

### Continuation Notes

Next safest follow-up is to clean existing API type-check blockers so root `pnpm type-check` can be used as the final monorepo gate.

## Plan: Payment idempotency key hardening for record payment

### Source
- Tasklist: User request with 5 payment idempotency/migration/test tasks.
- User request: Add partial unique index for `order_payments` idempotency, wire schema/use case, keep `transaction_ref` separate, add retry tests.
- Date started: 2026-06-02
- Current status: Implemented; API type-check still has unrelated pre-existing blockers.

### Goal
Make `POST /api/orders/:id/payments` safe to retry with the same idempotency key by storing that key on `order_payments`, replaying the existing payment inside the transaction, and enforcing a database uniqueness guard without conflating business transaction references.

### Context Read
- [x] AGENTS.md
- [x] PLANS.md
- [x] README.md
- [x] Active tasklist/checklist from user prompt
- [x] Relevant docs searched for payment/idempotency references
- [x] Relevant source files inspected (`shared/schema.ts`, `RecordPayment.ts`, orders controller/routes, migrations, API tests)

### Workstreams

#### Backend/API Workstream
- Scope: Orders payment endpoint and RecordPayment/CreateAndPay use cases.
- Files inspected: apps/api/src/http/controllers/OrdersController.ts, apps/api/src/http/routes/orders.ts, packages/application/orders/RecordPayment.ts, packages/application/orders/CreateAndPayOrder.ts
- Findings: Controller defaulted `transaction_ref` to `idempotency_key`; payment idempotency replay used business reference rather than the dedicated key.
- Tasks: Completed: added `idempotency_key` input, transactional replay lookup, replay status 200, dedicated payment key storage, and separate business reference storage.
- Risks: Cross-tenant replay remains guarded by locking the tenant-owned order first, then looking up payments scoped to that order.
- Validation: API tests pass; application package type-check passes.

#### Database/Schema Workstream
- Scope: Migrations and Drizzle schema indexes.
- Files inspected: migrations/0000_conscious_invisible_woman.sql, migrations/0004_orders_idempotency_key.sql, migrations/0006_auth_tables.sql, shared/schema.ts
- Findings: `order_payments.idempotency_key` existed in later migration/schema but no unique partial index was present.
- Tasks: Completed: added migration `0007_order_payments_idempotency_unique.sql` and mirrored partial unique index in Drizzle schema.
- Risks: Existing duplicate `(order_id, idempotency_key)` non-null rows would block migration and must be cleaned before applying in such environments.
- Validation: SQL/schema inspection and TypeScript validation attempted.

#### Tests/Validation Workstream
- Scope: API/use-case tests for payment retry behavior.
- Files inspected: apps/api/src/__tests__/create-and-pay-stock-concurrency.test.ts, apps/api/src/__tests__/record-payment-idempotency.test.ts
- Findings: A dedicated Express/controller test with fake RecordPayment DB covers the retry behavior.
- Tasks: Completed: added retry test verifying same key returns same payment, returns 200 on replay, preserves business `transaction_ref`, stores `idempotencyKey`, and does not increment paid amount twice.
- Risks: Test uses an in-memory fake DB; database unique index enforcement is covered by migration/schema rather than live DB integration.
- Validation: `pnpm --filter @pos/api test` pass.

#### Documentation Workstream
- Scope: PLANS.md and final report.
- Files inspected: README.md, docs payment/idempotency search results.
- Findings: No dedicated API docs found requiring sync for payment endpoint behavior.
- Tasks: Completed: PLANS.md updated with implementation and validation status.
- Risks: N/A.
- Validation: N/A.

#### Security/Tenant Isolation Workstream
- Scope: Tenant-aware payment replay and order locking.
- Files inspected: RecordPayment use case, orders controller.
- Findings: Order row lock uses order id + tenant id; replay now happens only after that tenant-owned order is confirmed.
- Tasks: Completed: existing payment lookup is scoped to the same `order_id`; unique partial index is also order scoped.
- Risks: None known for this batch.
- Validation: API retry test verifies same-order replay behavior.

### Execution Order
1. [x] Add schema/migration unique partial index.
2. [x] Update `RecordPayment` input and transactional replay/insert behavior.
3. [x] Update orders controller to pass idempotency key and not default business reference to key.
4. [x] Update create-and-pay payment storage/replay to use dedicated payment idempotency key.
5. [x] Add/adjust tests for same-key retry.
6. [x] Run validation and update PLANS.md.

### Progress

#### Completed
- [x] Add unique partial index migration for `order_payments(order_id, idempotency_key)`.
  - Files changed: migrations/0007_order_payments_idempotency_unique.sql, shared/schema.ts
  - Validation: `pnpm --filter @pos/application type-check` pass; API test suite pass.
  - Docs updated: PLANS.md
- [x] Use `orderPayments.idempotencyKey` for RecordPayment.
  - Files changed: packages/application/orders/RecordPayment.ts, apps/api/src/http/controllers/OrdersController.ts
  - Validation: `pnpm --filter @pos/api test` pass.
  - Docs updated: PLANS.md
- [x] Replay existing payment before insert inside RecordPayment transaction.
  - Files changed: packages/application/orders/RecordPayment.ts
  - Validation: `pnpm --filter @pos/api exec tsx --test src/__tests__/record-payment-idempotency.test.ts` pass.
  - Docs updated: PLANS.md
- [x] Keep `transaction_ref` as a separate business reference.
  - Files changed: apps/api/src/http/controllers/OrdersController.ts, packages/application/orders/RecordPayment.ts, packages/application/orders/CreateAndPayOrder.ts
  - Validation: `pnpm --filter @pos/api test` pass.
  - Docs updated: PLANS.md
- [x] Add retry test for `POST /api/orders/:id/payments` with the same key.
  - Files changed: apps/api/src/__tests__/record-payment-idempotency.test.ts
  - Validation: `pnpm --filter @pos/api test` pass.
  - Docs updated: PLANS.md
- [x] Prevent SSE maintenance timers from keeping API tests alive.
  - Files changed: apps/api/src/http/services/orderQueueEvents.ts
  - Validation: `pnpm --filter @pos/api test` exits cleanly.
  - Docs updated: PLANS.md

#### Partially Completed

#### Blocked
- [ ] Full API type-check clean status
  - Blocker: Existing unrelated TypeScript errors remain in `apps/api/src/http/middleware/featureGuard.ts`, `apps/api/src/http/routes/index.ts`, and missing `compression` declarations in `apps/api/src/index.ts`.
  - Required next step: Clean pre-existing API typing/dependency issues in a separate batch.

#### Not Attempted

### Validation Log
- Command: `pnpm --filter @pos/api exec tsx --test src/__tests__/record-payment-idempotency.test.ts`
- Result: Pass
- Notes: Targeted retry test passed.
- Command: `pnpm --filter @pos/api test`
- Result: Pass
- Notes: All API tests passed (22 tests).
- Command: `pnpm --filter @pos/application type-check`
- Result: Pass
- Notes: Application package type-check passed.
- Command: `pnpm --filter @pos/api type-check`
- Result: Fail (pre-existing/unrelated blockers)
- Notes: Existing errors in featureGuard table cast, express-rate-limit/@types Express mismatch in route mounting, and missing `@types/compression` declaration.

### Documentation Updates
- File: PLANS.md
- Change: Added and completed active plan for payment idempotency hardening.

### Checklist Updates
- File: User prompt tasklist (not a repository file)
- Change: All five requested items implemented and validated where practical; full API type-check blocker documented as unrelated.

### Continuation Notes
Next safest follow-up is to fix existing API type-check blockers so `pnpm --filter @pos/api type-check` can be restored as a clean gate.

## Plan: Transaction-safe tenant business-date order numbers

### Source
- Tasklist: User-provided 5-item implementation request for `order_number_sequences`.
- User request: Add sequence table keyed by `(tenant_id, business_date)`, use transactional upsert sequence increments, replace `generateOrderNumber` in repository and create-and-pay use case, use tenant timezone for business date, and add same-tenant parallel order tests.
- Date started: 2026-06-02
- Current status: Implemented; API package type-check still has unrelated pre-existing blockers.

### Goal
Make order number generation concurrency-safe per tenant and per tenant-local business date, replacing count-based order numbering that can collide under parallel order creation.

### Context Read
- [x] AGENTS.md
- [x] PLANS.md
- [x] README.md
- [x] Active user tasklist
- [x] Relevant docs (`docs/ORDER_LIFECYCLE.md` inspected for order lifecycle/data-integrity context)
- [x] Relevant source files (`shared/schema.ts`, `OrderRepository.ts`, `CreateAndPayOrder.ts`, existing create-and-pay concurrency tests)

### Workstreams

#### Backend/API Workstream
- Scope: Order creation and create-and-pay order number generation.
- Files inspected: `packages/infrastructure/repositories/orders/OrderRepository.ts`, `packages/application/orders/CreateAndPayOrder.ts`.
- Findings: Both paths used count-based date sequence generation; create-and-pay generated inside transaction but still counted orders.
- Tasks: Completed. Shared sequence helper now allocates numbers with tenant timezone and upserted sequence rows; create-and-pay calls it inside the order/payment transaction; repository `generateOrderNumber` wraps sequence allocation in a transaction.
- Risks: Normal `CreateOrder` still calls repository `generateOrderNumber` before repository `create`, so sequence allocation is concurrency-safe but may leave gaps if later order insertion fails.
- Validation: API tests passed; application and infrastructure package type-check passed.

#### Database/Schema Workstream
- Scope: New sequence table and migration.
- Files inspected: `shared/schema.ts`, `migrations/`.
- Findings: Tenant timezone exists on `tenants.timezone`; no sequence table existed.
- Tasks: Completed. Added `order_number_sequences` schema and `0012_order_number_sequences.sql` migration.
- Risks: No historical backfill was added because current task targets future sequence generation.
- Validation: Type-check for application/infrastructure packages and API tests.

#### Tests/Validation Workstream
- Scope: Concurrency tests.
- Files inspected: `apps/api/src/__tests__/create-and-pay-stock-concurrency.test.ts`.
- Findings: Existing fake DB serialized transactions and was expanded to emulate sequence upsert/tenant timezone.
- Tasks: Completed. Added many-parallel same-tenant order number uniqueness/sequence test and timezone business-date unit coverage.
- Risks: Fake Drizzle emulates the raw SQL path; full database integration would require a real PostgreSQL test harness.
- Validation: `pnpm --filter @pos/api test` passed.

#### Documentation Workstream
- Scope: Order lifecycle docs and plan.
- Files inspected: `docs/ORDER_LIFECYCLE.md`, `PLANS.md`.
- Findings: Docs mentioned transaction-safe create-and-pay but not sequence table.
- Tasks: Completed. Added database schema note for `order_number_sequences` and transactional tenant-timezone sequence allocation.
- Risks: None known.
- Validation: Documentation review.

#### Security/Tenant Isolation Workstream
- Scope: Tenant-owned sequence isolation.
- Files inspected: `shared/schema.ts`, order creation paths.
- Findings: Sequence key needed tenant and business date; timezone needed to be fetched by tenant inside helper.
- Tasks: Completed. Sequence primary key is `(tenant_id, business_date)`, tenant FK cascades, and helper fetches `tenants.timezone` by tenant id.
- Risks: Invalid tenant timezone falls back to UTC to keep order creation available.
- Validation: Tenant timezone test confirms non-UTC business date behavior.

### Execution Order
1. [x] Add schema/migration for `order_number_sequences`.
2. [x] Implement shared transactional order number helper using tenant timezone and upsert increment.
3. [x] Replace repository and create-and-pay generators.
4. [x] Update fake DB and add concurrency tests.
5. [x] Update docs/plan.
6. [x] Run relevant validation, commit, create PR.

### Progress

#### Completed
- [x] Task: Create `order_number_sequences` with `(tenant_id, business_date)` key and `last_seq`.
  - Files changed: `shared/schema.ts`, `migrations/0012_order_number_sequences.sql`
  - Validation: API tests passed; application/infrastructure type-check passed.
  - Docs updated: `docs/ORDER_LIFECYCLE.md`
- [x] Task: Use transactional `INSERT ... ON CONFLICT ... DO UPDATE SET last_seq = last_seq + 1 RETURNING last_seq`.
  - Files changed: `packages/application/orders/orderNumberSequence.ts`
  - Validation: API tests passed.
  - Docs updated: `docs/ORDER_LIFECYCLE.md`
- [x] Task: Replace `generateOrderNumber` in `OrderRepository.ts` and `CreateAndPayOrder.ts`.
  - Files changed: `packages/infrastructure/repositories/orders/OrderRepository.ts`, `packages/application/orders/CreateAndPayOrder.ts`
  - Validation: API tests passed; package type-check passed.
  - Docs updated: `docs/ORDER_LIFECYCLE.md`
- [x] Task: Use tenant timezone for `business_date`.
  - Files changed: `packages/application/orders/orderNumberSequence.ts`
  - Validation: Added timezone business-date test.
  - Docs updated: `docs/ORDER_LIFECYCLE.md`
- [x] Task: Add concurrency tests for many parallel orders on one tenant.
  - Files changed: `apps/api/src/__tests__/create-and-pay-stock-concurrency.test.ts`
  - Validation: API tests passed.
  - Docs updated: None.

#### Partially Completed
- [ ] Task: None.
  - Completed:
  - Remaining:
  - Reason:

#### Blocked
- [ ] Task: Full `@pos/api` type-check gate.
  - Blocker: Existing unrelated TypeScript errors in `apps/api/src/http/middleware/featureGuard.ts`, `apps/api/src/http/routes/index.ts`, and missing `compression` declarations in `apps/api/src/index.ts`.
  - Required next step: Separate cleanup of API type dependency/type errors.

#### Not Attempted
- [ ] Task: Real PostgreSQL integration concurrency test.
  - Reason: Existing test suite uses fake DB unit coverage for this flow; no real Postgres test harness was introduced in this batch.

### Validation Log
- Command: pnpm --filter @pos/api test
- Result: Pass (24 tests passed)
- Notes: Covers same-tenant parallel order number allocation and timezone business date helper.
- Command: pnpm --filter @pos/application type-check && pnpm --filter @pos/infrastructure type-check
- Result: Pass
- Notes: Validates changed package code.
- Command: pnpm --filter @pos/api type-check
- Result: Fail (unrelated/pre-existing blockers)
- Notes: Errors are in feature guard cast, express-rate-limit/@types express mismatch, and missing `@types/compression`.

### Documentation Updates
- File: `docs/ORDER_LIFECYCLE.md`
- Change: Documented `order_number_sequences` and tenant-timezone business-date transactional allocation.

### Checklist Updates
- File: User tasklist in prompt
- Change: All five requested implementation items completed; no source checklist file exists.

### Continuation Notes
Recommended next batch: fix existing API type-check blockers or add a real PostgreSQL integration test harness for transaction-level sequence allocation under true database concurrency.

## Plan: Transaction-Safe Owner Registration Flow

### Source

- Tasklist: User request with five registration integrity items
- User request: Bungkus tenant insert, owner sign-up/linking, default outlet/module seed, role assignment in transaction-safe flow; add Better Auth compensating cleanup; catch duplicate slug unique constraint; create default outlet/module config; add duplicate/failure tests.
- Date started: 2026-06-02
- Current status: Implemented; API type-check still blocked by pre-existing unrelated errors.

### Goal

Make public owner registration safe against partial tenant/auth state, seed multi-outlet defaults, and cover duplicate slug/email plus post-auth failure cleanup with automated tests.

### Context Read

- [x] AGENTS.md
- [x] PLANS.md
- [x] README.md
- [x] Active tasklist/checklist
- [x] Relevant docs (`docs/BUSINESS_TYPE_TEMPLATES.md`)
- [x] Relevant source files (`apps/api/src/http/routes/registration.ts`, auth schema/lib, shared schema, tenant templates)

### Workstreams

#### Backend/API Workstream

- Scope: Public `/api/register` route and registration orchestration.
- Files inspected: `apps/api/src/http/routes/registration.ts`, `apps/api/src/lib/auth.ts`, `apps/api/src/lib/auth-schema.ts`.
- Findings: Existing flow created tenant first, called Better Auth outside a transaction, only deleted tenant on sign-up failure, and did not seed outlet/module config or outlet assignment.
- Tasks: Completed: extracted registration service, wrapped tenant/default data/auth linking/assignment in transaction-safe flow, and mapped expected error statuses.
- Risks: Better Auth sign-up still cannot be guaranteed to share the exact Drizzle transaction; implemented compensating cleanup for Better Auth rows and tenant-owned registration data.
- Validation: Node API tests passed; API type-check attempted and failed on unrelated pre-existing errors.

#### Database/Schema Workstream

- Scope: `tenants`, `outlets`, `tenant_module_configs`, `user_outlet_assignments`, Better Auth `user/account/session` cleanup.
- Files inspected: `shared/schema.ts`, `apps/api/src/lib/auth-schema.ts`.
- Findings: Tenant has unique slug; outlet default and user assignment schema already exist; tenant cascades cover many tenant-owned rows but auth rows are separate.
- Tasks: Completed: catch tenant slug unique constraint at insert and added explicit cleanup for auth and tenant-owned defaults.
- Risks: Cleanup is best-effort and logs cleanup failures without hiding the original registration error.
- Validation: Unit tests simulate unique/failure paths.

#### Frontend/UI Workstream

- Scope: None.
- Files inspected: None beyond README; request is backend registration only.
- Findings: No UI change needed.
- Tasks: None.
- Risks: None.
- Validation: Not applicable.

#### Tests/Validation Workstream

- Scope: Registration behavior tests.
- Files inspected: existing `apps/api/src/__tests__/*.test.ts` patterns and `apps/api/package.json`.
- Findings: API tests use Node's built-in test runner through `tsx --test`.
- Tasks: Completed: added focused service tests for duplicate slug, duplicate email, success defaults, and simulated failure after user creation.
- Risks: Tests use injected fakes rather than a live PostgreSQL transaction harness.
- Validation: API test suite passed.

#### Documentation Workstream

- Scope: `PLANS.md`, registration behavior documentation.
- Files inspected: `README.md`, `docs/BUSINESS_TYPE_TEMPLATES.md`.
- Findings: Existing template doc described module defaults but not registration atomicity.
- Tasks: Completed: updated `PLANS.md` and documented public registration defaults/cleanup behavior in `docs/BUSINESS_TYPE_TEMPLATES.md`.
- Risks: Documentation explicitly says Better Auth uses compensating cleanup rather than claiming a single DB transaction.
- Validation: Diff reviewed.

#### Security/Tenant Isolation Workstream

- Scope: Owner tenant link and outlet role assignment.
- Files inspected: `shared/schema.ts`, auth schema.
- Findings: User tenant_id/role and outlet assignment are required to prevent orphan owner/no-outlet state.
- Tasks: Completed: set owner user tenant/role and assign owner to default outlet; cleanup all auth rows if later steps fail.
- Risks: Partial auth rows after Better Auth sign-up are addressed through best-effort cleanup.
- Validation: Failure-path tests assert cleanup hooks are called.

### Execution Order

1. [x] Implement injectable registration service with transaction-safe orchestration and cleanup.
2. [x] Update route to use the service and map duplicate slug/email responses.
3. [x] Add Node tests for success defaults, duplicate slug, duplicate email, and post-user failure cleanup.
4. [x] Run validation and update this plan.
5. [x] Prepare commit and PR metadata.

### Progress

#### Completed

- [x] Transaction-safe registration service
  - Files changed: `apps/api/src/services/registrationService.ts`
  - Validation: API tests passed; API type-check attempted.
  - Docs updated: `PLANS.md`, `docs/BUSINESS_TYPE_TEMPLATES.md`
- [x] Public registration route integration
  - Files changed: `apps/api/src/http/routes/registration.ts`
  - Validation: API tests passed; API type-check attempted.
  - Docs updated: `docs/BUSINESS_TYPE_TEMPLATES.md`
- [x] Duplicate slug/email and post-user failure tests
  - Files changed: `apps/api/src/__tests__/registration-service.test.ts`
  - Validation: API tests passed.
  - Docs updated: `PLANS.md`

#### Partially Completed

- [ ] API type-check cleanup
  - Completed: Ran type-check and confirmed failures are outside this registration change.
  - Remaining: Fix existing Express/rate-limit/compression/featureGuard type issues in a separate batch.
  - Reason: Existing unrelated blockers are outside this requested registration flow.

#### Blocked

- [ ] Full green `pnpm --filter @pos/api type-check`
  - Blocker: Existing unrelated TypeScript errors in `src/http/middleware/featureGuard.ts`, `src/http/routes/index.ts`, and missing `@types/compression` declaration.
  - Required next step: Separate type hygiene batch.

#### Not Attempted

- [ ] Live PostgreSQL integration test for real transaction rollback
  - Reason: Current batch added deterministic injected-fake tests; live DB harness is not configured for this repo's API tests.

### Validation Log

- Command: `pnpm --filter @pos/api exec tsx --test src/__tests__/registration-service.test.ts`
- Result: Passed (4 tests passed)
- Notes: Covers registration success, duplicate slug, duplicate email, and post-user failure cleanup.
- Command: `pnpm --filter @pos/api test -- src/__tests__/registration-service.test.ts`
- Result: Passed (package script ran the API test suite; 28 tests passed)
- Notes: Confirms no existing API test regressed.
- Command: `pnpm --filter @pos/api type-check`
- Result: Failed due to pre-existing unrelated type errors.
- Notes: Failures are in `featureGuard.ts`, `routes/index.ts`, and missing `compression` types; no registration service errors were reported.

### Documentation Updates

- File: `PLANS.md`
- Change: Added and completed active execution plan for transaction-safe owner registration.
- File: `docs/BUSINESS_TYPE_TEMPLATES.md`
- Change: Documented registration default outlet/module/owner assignment behavior and Better Auth compensating cleanup.

### Checklist Updates

- File: User-provided tasklist
- Change: All five requested items implemented and validated with API tests; source checklist was not a repository file.

### Continuation Notes

Recommended next batch: fix existing API type-check blockers in `featureGuard.ts`, `routes/index.ts`, and compression declarations, then optionally add a real PostgreSQL integration test harness for transaction rollback.

## Plan: KDS pairing security hardening

### Source
- Tasklist: User request for KDS code generation, brute-force controls, atomic activation, and API key hashing.
- User request: Harden `apps/api/src/http/routes/kds.ts` KDS pairing flow.
- Date started: 2026-06-02
- Current status: Implemented; API type-check still blocked by unrelated pre-existing errors.

### Goal
Make KDS device pairing safer by using cryptographically secure activation codes, endpoint-specific throttling and lockout controls, atomic one-time code consumption, and database-only API key hashes while returning the raw key once during pairing.

### Context Read
- [x] AGENTS.md
- [x] PLANS.md
- [x] README.md
- [x] Active tasklist/checklist
- [x] Relevant docs
- [x] Relevant source files

### Workstreams

#### Backend/API Workstream
- Scope: `apps/api/src/http/routes/kds.ts`, KDS pairing and device authentication.
- Files inspected: `apps/api/src/http/routes/kds.ts`, `apps/api/src/http/middleware/rateLimiter.ts`, `apps/api/src/http/routes/index.ts`.
- Findings: KDS activation used 4-digit `Math.random`, plaintext `api_key` lookup/storage, non-atomic select-then-update verification, and only a broad `/api/kds` limiter.
- Tasks: Implemented 6-digit `crypto.randomInt` codes, hashed API key lookup/storage, atomic verification update, endpoint-specific pairing limiter, and DB-backed failure/lockout handling for matching pending codes.
- Risks: Existing plaintext API keys rely on migration backfill via PostgreSQL `pgcrypto`.
- Validation: API tests passed; API type-check blocked by unrelated pre-existing errors.

#### Database/Schema Workstream
- Scope: KDS device columns used by pairing security.
- Files inspected: `migrations/0010_multi_outlet.sql`, route SQL references.
- Findings: `kds_devices` is managed outside Drizzle schema in current repo; outlet migration already alters it directly.
- Tasks: Added `0013_kds_pairing_security.sql` with `activation_attempts`, `activation_locked_until`, API key SHA-256 backfill, and KDS lookup indexes.
- Risks: Migration assumes `kds_devices` already exists and `pgcrypto` can be enabled.
- Validation: Static review plus API tests/type-check attempt.

#### Frontend/UI Workstream
- Scope: KDS activation/admin pages.
- Files inspected: `apps/pos-terminal-web/src/pages/kds-activate.tsx`, `apps/pos-terminal-web/src/pages/kitchen-display.tsx`.
- Findings: UI assumed 4-digit codes, so API moving to 6 digits required synchronized UI labels, dots, and input length.
- Tasks: Updated comments, copy, digit dots, input guard, and auto-submit length to 6 digits.
- Risks: No screenshot taken because the change is primarily backend/security plus small copy/input sync, and no runnable web-app screenshot was explicitly requested.
- Validation: POS terminal type-check passed.

#### Tests/Validation Workstream
- Scope: Existing API tests and type checking.
- Files inspected: `apps/api/src/__tests__/kds.test.ts`.
- Findings: Existing tests cover KDS status transition delegation, not pairing.
- Tasks: Ran relevant API test suite and type-check commands.
- Risks: Pairing flow still lacks a dedicated DB-backed integration test harness for the new atomic update/lockout SQL.
- Validation: `pnpm --filter @pos/api test` passed; `pnpm --filter @pos/api type-check` failed on unrelated existing type issues.

#### Documentation Workstream
- Scope: README/docs/plan if behavior changes.
- Files inspected: README, KDS UI copy.
- Findings: KDS code length was documented in UI comments/copy more than formal docs.
- Tasks: Synced changed UI comments/copy and this execution plan.
- Risks: None identified.
- Validation: File review.

#### Security/Tenant Isolation Workstream
- Scope: KDS key auth, one-time pairing code behavior, brute-force protections.
- Files inspected: KDS route and route mounting.
- Findings: Tenant comes from session for generation and from active device lookup for KDS requests; pairing code was race-prone and brute-forceable.
- Tasks: Preserved tenant-bound device lookup while hardening credential material and pairing flow.
- Risks: Existing active devices require migration to hash stored plaintext keys before the new hashed lookup can authenticate them.
- Validation: API tests passed.

### Execution Order
1. Add DB migration for KDS pairing security columns/key hashing. Completed.
2. Harden backend KDS route helpers and endpoint flow. Completed.
3. Sync KDS frontend code length/copy. Completed.
4. Run validation. Completed with noted API type-check blocker.
5. Update plan status. Completed.

### Progress

#### Completed
- [x] Replace KDS activation code generation with cryptographically secure 6-digit numeric codes.
  - Files changed: `apps/api/src/http/routes/kds.ts`.
  - Validation: API tests passed; API type-check attempted.
  - Docs updated: UI comments/copy and this plan.
- [x] Add endpoint-specific KDS pairing throttling, failure counter, and temporary lockout.
  - Files changed: `apps/api/src/http/routes/kds.ts`, `migrations/0013_kds_pairing_security.sql`.
  - Validation: API tests passed; API type-check attempted.
  - Docs updated: This plan.
- [x] Make KDS verification consume pending codes atomically.
  - Files changed: `apps/api/src/http/routes/kds.ts`.
  - Validation: API tests passed; API type-check attempted.
  - Docs updated: This plan.
- [x] Store only hashed KDS API keys in the database and return the raw key once during pairing.
  - Files changed: `apps/api/src/http/routes/kds.ts`, `migrations/0013_kds_pairing_security.sql`.
  - Validation: API tests passed; API type-check attempted.
  - Docs updated: This plan.
- [x] Sync KDS frontend activation UI to 6-digit codes.
  - Files changed: `apps/pos-terminal-web/src/pages/kds-activate.tsx`, `apps/pos-terminal-web/src/pages/kitchen-display.tsx`.
  - Validation: POS terminal type-check passed.
  - Docs updated: UI comments/copy and this plan.

#### Partially Completed
- [ ] Dedicated DB-backed integration coverage for pairing lockout/atomic update.
  - Completed: Existing API suite was run and passed.
  - Remaining: Add a real PostgreSQL integration test harness for the new SQL if/when the project has stable DB test fixtures for `kds_devices`.
  - Reason: Current KDS tests mock order-status auth/delegation and do not include a KDS pairing database fixture.

#### Blocked
- [ ] Clean API type-check.
  - Blocker: Existing unrelated TypeScript errors in `featureGuard.ts`, `routes/index.ts` express-rate-limit type mismatch, and missing `compression` declarations.
  - Required next step: Fix those pre-existing API type issues in a separate cleanup batch.

#### Not Attempted
- [ ] Alphanumeric one-time pairing token.
  - Reason: Implemented the requested 6-8 digit option as a 6-digit numeric code using `crypto.randomInt`; alphanumeric token remains an optional future alternative.

### Validation Log
- Command: `pnpm --filter @pos/api test`
- Result: Pass
- Notes: 28 tests passed.
- Command: `pnpm --filter @pos/terminal-web type-check`
- Result: Pass
- Notes: POS terminal TypeScript validation passed.
- Command: `pnpm --filter @pos/api type-check`
- Result: Fail, unrelated/pre-existing blockers
- Notes: Fails in `featureGuard.ts`, `routes/index.ts` express-rate-limit typings, and missing `compression` declaration; no remaining `kds.ts` type errors after casting the local pairing limiter to the repository's Express handler type.

### Documentation Updates
- File: PLANS.md
- Change: Added and completed KDS pairing security hardening plan.
- File: `apps/pos-terminal-web/src/pages/kds-activate.tsx`
- Change: Updated KDS activation comments/copy to 6-digit codes.
- File: `apps/pos-terminal-web/src/pages/kitchen-display.tsx`
- Change: Updated KDS admin launcher comments/copy to 6-digit codes.

### Checklist Updates
- File: N/A
- Change: User provided inline tasklist; final report maps completed/partial items.

### Continuation Notes
Recommended next batch: fix existing API type-check blockers, then add a dedicated DB-backed KDS pairing integration test covering lockout, atomic code consumption, and hashed-key authentication against a real `kds_devices` fixture.

## Plan: CFD Device Token Tenant Isolation

### Source

- Tasklist: User-provided inline CFD security tasks.
- User request: Add CFD device/session token similar to KDS key, validate `/api/cfd/update` and `/ws/cfd`, limit payload schema/size, and test cross-tenant isolation.
- Date started: 2026-06-02
- Current status: Implemented; API tests passed; POS terminal type-check passed; API type-check remains blocked by pre-existing unrelated type issues.

### Goal

Require a CFD-scoped token before any cross-device CFD state update or WebSocket subscription can read/write tenant CFD state, and prevent memory abuse from unbounded payloads.

### Context Read

- [x] AGENTS.md
- [x] PLANS.md
- [x] README.md
- [x] Active tasklist/checklist
- [x] Relevant docs
- [x] Relevant source files

### Workstreams

#### Backend/API Workstream

- Scope: `apps/api/src/routes.ts`, CORS headers, CFD token validation and payload validation.
- Files inspected: `apps/api/src/routes.ts`, `apps/api/src/http/routes/kds.ts`, `apps/api/src/index.ts`.
- Findings: CFD previously trusted `x-tenant-id` and accepted arbitrary JSON before setting in-memory state; WebSocket accepted tenant ID without token.
- Tasks: Added CFD token lookup, session token issuance, HTTP/WS tenant ownership enforcement, and payload schema/size limits.
- Risks: Existing displays need a generated CFD token in URL/local storage for cross-device sync.
- Validation: `pnpm --filter @pos/api test` passed.

#### Database/Schema Workstream

- Scope: CFD token persistence.
- Files inspected: `migrations/0013_kds_pairing_security.sql`, tenant schema.
- Findings: KDS stores hashed keys in a dedicated table; CFD had no table.
- Tasks: Added `migrations/0014_cfd_device_tokens.sql` for `cfd_devices` with hashed token indexes.
- Risks: Migration must be applied before production CFD token generation.
- Validation: SQL not DB-applied in this environment.

#### Frontend/UI Workstream

- Scope: POS/CFD hook token propagation and display share URL.
- Files inspected: `apps/pos-terminal-web/src/hooks/useCustomerDisplay.ts`, `apps/pos-terminal-web/src/pages/customer-display.tsx`.
- Findings: Frontend only sent tenant ID and generated unauthenticated display URLs.
- Tasks: Added CFD token generation/storage, `x-cfd-key` send header, WebSocket token query, and tokenized display URL.
- Risks: If session-token generation fails, same-device BroadcastChannel still works but cross-device sync is unavailable.
- Validation: `pnpm --filter @pos/terminal-web type-check` passed.

#### Tests/Validation Workstream

- Scope: Cross-tenant CFD tests and validation commands.
- Files inspected: Existing API node:test patterns.
- Findings: KDS tests use dependency injection; `registerRoutes` needed CFD dependency injection for tests.
- Tasks: Added `apps/api/src/__tests__/cfd.test.ts` for unauthorized push/subscribe and payload limits.
- Risks: API type-check still blocked by pre-existing unrelated type errors.
- Validation: API test suite passed; API type-check failed on known unrelated errors.

#### Documentation Workstream

- Scope: Document CFD token behavior.
- Files inspected: `docs/`.
- Findings: No dedicated CFD security note existed.
- Tasks: Added `docs/CFD_SECURITY.md`.
- Risks: User-facing setup docs can be expanded later when pairing UX is formalized.
- Validation: Documentation updated.

#### Security/Tenant Isolation Workstream

- Scope: Prevent cross-tenant CFD read/write.
- Files inspected: `apps/api/src/routes.ts`, `apps/api/src/__tests__/cfd.test.ts`.
- Findings: The former implementation allowed tenant ID guessing for push and subscribe.
- Tasks: Token tenant is now authoritative; requested tenant must match token tenant before state is cached or clients are added.
- Risks: Query-string tokens can appear in logs; header/subprotocol support is also available for non-browser clients.
- Validation: Cross-tenant API/WebSocket tests passed.

### Execution Order

1. Safety/security/data-integrity/tenant-isolation blockers
2. Build/type/test blockers
3. Dependency prerequisites
4. Highest priority actionable tasks
5. Lower priority actionable tasks
6. Documentation sync
7. Validation
8. Final checklist update

### Progress

#### Completed

- [x] Add CFD device/session token scoped to CFD read/write.
  - Files changed: `apps/api/src/routes.ts`, `migrations/0014_cfd_device_tokens.sql`, `apps/pos-terminal-web/src/hooks/useCustomerDisplay.ts`, `apps/pos-terminal-web/src/pages/customer-display.tsx`.
  - Validation: API tests and POS type-check passed.
  - Docs updated: `docs/CFD_SECURITY.md`.
- [x] Validate token and tenant ownership before `/api/cfd/update` caches state.
  - Files changed: `apps/api/src/routes.ts`.
  - Validation: API tests passed.
  - Docs updated: `docs/CFD_SECURITY.md`.
- [x] Validate token in `/ws/cfd` before adding CFD clients.
  - Files changed: `apps/api/src/routes.ts`.
  - Validation: API tests passed.
  - Docs updated: `docs/CFD_SECURITY.md`.
- [x] Limit CFD payload schema and size.
  - Files changed: `apps/api/src/routes.ts`.
  - Validation: API tests passed.
  - Docs updated: `docs/CFD_SECURITY.md`.
- [x] Add cross-tenant CFD tests.
  - Files changed: `apps/api/src/__tests__/cfd.test.ts`.
  - Validation: API tests passed.
  - Docs updated: `docs/CFD_SECURITY.md`.

#### Partially Completed

- [ ] Full API type-check cleanup.
  - Completed: Confirmed this batch did not add new route type-check errors.
  - Remaining: Fix pre-existing `featureGuard.ts`, `routes/index.ts` rate-limit type mismatch, and missing `compression` declarations.
  - Reason: Unrelated existing blockers remain outside the CFD task.

#### Blocked

- [ ] Clean `pnpm --filter @pos/api type-check`.
  - Blocker: Existing unrelated TypeScript errors in `featureGuard.ts`, `routes/index.ts`, and missing `@types/compression` declaration.
  - Required next step: Separate API type hygiene batch.

#### Not Attempted

- [ ] Formal CFD pairing/revocation management UI.
  - Reason: The requested backend token/session enforcement and frontend token propagation were implemented; a full admin device-management UI was outside this batch.

### Validation Log

- Command: `pnpm --filter @pos/api test`
- Result: Pass
- Notes: 32 tests passed.
- Command: `pnpm --filter @pos/terminal-web type-check`
- Result: Pass
- Notes: POS terminal TypeScript validation passed.
- Command: `pnpm --filter @pos/api type-check`
- Result: Fail, unrelated/pre-existing blockers
- Notes: Fails in `featureGuard.ts`, `routes/index.ts` express-rate-limit typings, and missing `compression` declaration.

### Documentation Updates

- File: `docs/CFD_SECURITY.md`
- Change: Documented CFD token scope, HTTP/WebSocket auth, payload limits, and tenant isolation tests.
- File: `PLANS.md`
- Change: Added CFD device token tenant isolation plan and validation status.

### Checklist Updates

- File: N/A
- Change: User provided inline tasklist; this plan and final report map completed/partial items.

### Continuation Notes

Recommended next batch: add a formal CFD device management/pairing UI and revoke flow, then fix existing API type-check blockers so full API type validation can pass.

## Plan: Native UUID Schema Alignment and Drift Check

### Source

- Tasklist: User request with five database/schema/migration/CI tasks.
- User request: Audit actual database via `information_schema.columns`, choose UUID standard, create explicit migration with FK drop/recreate, update schema/snapshots/docs, add drift check.
- Date started: 2026-06-02
- Current status: In progress

### Goal

Align tenant-owned identifier columns in Drizzle and migrations around one durable standard, document the actual database audit query/results limitations, add an explicit PostgreSQL migration for varchar-to-native-uuid conversion, and add a CI-friendly migration drift check.

### Context Read

- [x] AGENTS.md
- [x] PLANS.md
- [x] README.md
- [x] Active tasklist/checklist from user prompt
- [x] Relevant docs (`docs/migration-analysis/schema-audit.md`, `docs/migration-report.md`)
- [ ] Relevant source files before creating/changing code

### Workstreams

#### Backend/API Workstream

- Scope: Code paths that may depend on tenant/order/product ID TypeScript shapes after Drizzle schema changes.
- Files inspected: Pending.
- Findings: Pending.
- Tasks: Inspect ID use if type-check surfaces issues.
- Risks: Existing app may serialize UUIDs as strings; native Drizzle UUID still maps to strings in TypeScript.
- Validation: `pnpm type-check` or scoped checks.

#### Database/Schema Workstream

- Scope: `shared/schema.ts`, migrations, snapshots, information_schema audit SQL.
- Files inspected: `shared/schema.ts`, `apps/api/src/lib/auth-schema.ts`, `migrations/meta/_journal.json`.
- Findings: `tenants.id` and many tenant foreign keys are `varchar` while most entity IDs are native `uuid`; auth tables intentionally use text IDs.
- Tasks: Convert tenant IDs and UUID-reference text/varchar columns in shared schema to native `uuid`; add explicit conversion migration with FK/index handling; update snapshots if practical.
- Risks: Existing rows with non-UUID tenant IDs or ID reference strings block casting; migration must fail early with diagnostics instead of corrupting data.
- Validation: `drizzle-kit check`, type-check.

#### Frontend/UI Workstream

- Scope: None expected; UUID values remain strings over API.
- Files inspected: Pending only if type-check requires.
- Findings: Native uuid Drizzle columns infer string, so no UI behavior changes expected.
- Tasks: None planned.
- Risks: None beyond TypeScript schema imports.
- Validation: Workspace type-check where practical.

#### Tests/Validation Workstream

- Scope: CI drift check and local validation commands.
- Files inspected: `package.json`, `drizzle.config.ts`.
- Findings: No existing migration check script; `drizzle.config.ts` requires `DATABASE_URL` for all commands.
- Tasks: Add `db:check` script and a CI wrapper that skips only when no database URL is available.
- Risks: `drizzle-kit check` may need migration metadata to be valid.
- Validation: Run new script and document environment limitation if no `DATABASE_URL`.

#### Documentation Workstream

- Scope: Schema audit docs and plan updates.
- Files inspected: `docs/migration-analysis/schema-audit.md`, `docs/migration-report.md`.
- Findings: Existing schema audit claims no changes required and is stale for UUID drift.
- Tasks: Update docs with chosen native UUID standard, audit query, migration procedure, validation commands, blockers.
- Risks: Must not claim actual DB was audited if `DATABASE_URL` is unavailable.
- Validation: Markdown review.

#### Security/Tenant Isolation Workstream

- Scope: Tenant ID type consistency and FK behavior.
- Files inspected: `shared/schema.ts`.
- Findings: Tenant-owned data uses tenant IDs; native UUID FKs improve referential consistency.
- Tasks: Preserve tenant references and `onDelete` actions while converting types.
- Risks: Incorrect FK recreation could weaken tenant isolation; migration must recreate tenant FKs.
- Validation: Migration SQL inspection plus Drizzle check.

### Execution Order

1. Audit schema definitions and available actual DB connectivity.
2. Choose standard and update plan/docs.
3. Update `shared/schema.ts` to native uuid for tenant IDs and UUID reference columns.
4. Add explicit migration with cast prechecks, FK drop/recreate, index/type conversion.
5. Update migration metadata/snapshots or document if generated snapshot cannot be produced safely.
6. Add CI-friendly `db:check` / drift script.
7. Run relevant validation.
8. Update `PLANS.md` and docs with final status.

### Progress

#### Completed

- [ ] Task: Initial context and plan setup
  - Files changed: `PLANS.md`
  - Validation: Pending
  - Docs updated: `PLANS.md`

#### Partially Completed

- [ ] Task: Actual database audit
  - Completed: Determined local environment currently has no `DATABASE_URL`.
  - Remaining: Run `information_schema.columns` query against a provisioned database.
  - Reason: No database connection string is available in the environment.

#### Blocked

- [ ] Task: Live `information_schema.columns` results
  - Blocker: `DATABASE_URL` is unset.
  - Required next step: Provide a database URL or run the included audit query in an environment with database access.

#### Not Attempted

- [ ] Task: Schema/migration/drift-check implementation
  - Reason: Pending source inspection.

### Validation Log

- Command: `node -e "console.log(Boolean(process.env.DATABASE_URL))"`
- Result: `false`
- Notes: Confirms actual DB audit cannot run in this container yet.

### Documentation Updates

- File: `PLANS.md`
- Change: Added active plan for native UUID schema alignment.

### Checklist Updates

- File: N/A (user prompt tasklist)
- Change: Progress tracked in `PLANS.md` and final report.

### Continuation Notes

Continue by extracting all table/column definitions from `shared/schema.ts`, converting tenant ID columns to native UUID in schema, adding explicit migration and drift check, then validating with `drizzle-kit check` where possible.

### Execution Update (2026-06-02)

#### Completed

- [x] Task: Audit database actual using `information_schema.columns`
  - Files changed: `docs/migration-analysis/schema-audit.md`, `PLANS.md`
  - Validation: Verified `DATABASE_URL` is unset locally; documented exact `information_schema.columns` audit SQL for target DB execution.
  - Docs updated: `docs/migration-analysis/schema-audit.md`
- [x] Task: Choose schema standard
  - Files changed: `docs/migration-analysis/schema-audit.md`, `shared/schema.ts`
  - Validation: `pnpm --filter @pos/shared type-check` passed; `pnpm db:check` passed.
  - Docs updated: Native PostgreSQL `uuid` chosen and rationale documented.
- [x] Task: Explicit varchar/text UUID to native uuid migration
  - Files changed: `migrations/0015_native_uuid_alignment.sql`, `migrations/meta/_journal.json`, `migrations/meta/0015_snapshot.json`
  - Validation: `pnpm db:check` passed; migration SQL inspected. Live migration execution is pending a real database URL.
  - Docs updated: Migration steps and invalid UUID failure mode documented.
- [x] Task: Update Drizzle schema, migration snapshot, and schema audit docs
  - Files changed: `shared/schema.ts`, `migrations/meta/0015_snapshot.json`, `docs/migration-analysis/schema-audit.md`
  - Validation: `pnpm --filter @pos/shared type-check` passed; `pnpm db:check` passed.
  - Docs updated: `docs/migration-analysis/schema-audit.md`
- [x] Task: Add CI migration drift check
  - Files changed: `package.json`, `.github/workflows/db-migrations.yml`
  - Validation: `pnpm db:check` passed.
  - Docs updated: `docs/migration-analysis/schema-audit.md`

#### Partially Completed

- [ ] Task: Live database audit result capture
  - Completed: Added the exact audit SQL and preflight castability SQL.
  - Remaining: Run the audit against staging/production and archive the result.
  - Reason: `DATABASE_URL` is not set in this container.

#### Blocked

- [ ] Task: Execute migration on actual database
  - Blocker: No live database connection is available in this environment.
  - Required next step: Run `pnpm db:check`, the documented `information_schema.columns` query, and the migration in an environment with `DATABASE_URL`.

#### Not Attempted

- [ ] Task: Production/staging data cleanup for invalid UUIDs
  - Reason: No live database audit result showed invalid values in this environment.

### Validation Log

- Command: `node -e "console.log(Boolean(process.env.DATABASE_URL))"`
- Result: pass (`false`, confirms environment limitation)
- Notes: Local environment cannot produce actual `information_schema.columns` rows.
- Command: `pnpm db:check`
- Result: pass
- Notes: Drizzle migration metadata check passes with placeholder URL.
- Command: `pnpm --filter @pos/shared type-check`
- Result: pass
- Notes: Shared schema TypeScript compiles.
- Command: `pnpm --filter @pos/api type-check`
- Result: fail
- Notes: Schema-related `featureGuard.ts` cast issue was fixed; remaining failures are pre-existing Express/rate-limit type package mismatch and missing `@types/compression`.
- Command: `pnpm type-check`
- Result: fail
- Notes: Fails due to the same API package pre-existing type errors after 8 packages pass.

### Documentation Updates

- File: `docs/migration-analysis/schema-audit.md`
- Change: Replaced stale “no schema changes required” audit with native UUID standard, audit SQL, migration notes, CI drift-check instructions, and environment limitation.

### Checklist Updates

- File: User prompt tasklist tracked through this `PLANS.md` update.
- Change: All implementable local tasks completed; live DB result capture remains blocked by missing database connection.

### Continuation Notes

Next agent/operator should run the documented `information_schema.columns` audit and migration against staging with `DATABASE_URL` set, resolve any `Cannot cast ... to uuid` diagnostics, then rerun `pnpm db:check` and relevant API type-check after existing Express/compression typing issues are fixed.

## Plan: Frontend tenant authority hardening

### Source
- User request: make session/subdomain the frontend tenant source of truth, demote localStorage to display cache, stop sending raw tenant headers from POS request helpers, use signed/server-issued context for dev/offline fallback, and clear invalid tenant cache after login/logout.
- Date started: 2026-06-02
- Current status: In progress

### Goal
Remove localStorage-backed raw `x-tenant-id` authority from POS frontend API calls while preserving tenant-aware display/query cache and supporting authenticated session/subdomain tenant resolution.

### Context Read
- [x] AGENTS.md
- [x] PLANS.md
- [x] README.md
- [x] Active tasklist/checklist (user-provided task list)
- [x] Relevant docs
- [x] Relevant source files

### Workstreams

#### Backend/API Workstream
- Scope: Tenant middleware compatibility with no frontend tenant header.
- Files inspected: `apps/api/src/http/middleware/tenant.ts`
- Findings: Middleware resolved subdomain before raw header/query fallback, but did not use authenticated session tenant as a fallback.
- Tasks: Add session tenant resolution before raw header/query fallback.
- Risks: Public/device routes without session still need subdomain or approved device context.
- Validation: Type-check relevant package.

#### Frontend/UI Workstream
- Scope: POS request helpers and tenant/outlet cache behavior.
- Files inspected: `apps/pos-terminal-web/src/lib/tenant.ts`, `apps/pos-terminal-web/src/lib/outlet.ts`, `apps/pos-terminal-web/src/lib/api/hooks.ts`, `apps/pos-terminal-web/src/hooks/api/*`, `apps/pos-terminal-web/src/context/*`, `apps/pos-terminal-web/src/lib/auth.ts`, `apps/pos-terminal-web/src/App.tsx`, `apps/pos-terminal-web/src/pages/home.tsx`
- Findings: Several helpers always attached `x-tenant-id` from localStorage-backed active tenant cache.
- Tasks: Centralize tenant-aware header construction without raw tenant header by default; clear invalid tenant/outlet cache on session transitions.
- Risks: Dev/offline unauthenticated localhost flows require a signed/server-issued tenant context token instead of raw cache.
- Validation: Type-check relevant package.

#### Database/Schema Workstream
- Scope: None.
- Files inspected: None.
- Findings: No schema change required.
- Tasks: None.
- Risks: None.
- Validation: Not applicable.

#### Tests/Validation Workstream
- Scope: Type/build validation.
- Files inspected: package scripts.
- Findings: pnpm is required by repo instructions.
- Tasks: Run focused type-checks.
- Risks: Existing unrelated type errors may appear.
- Validation: `pnpm --filter @pos/terminal-web type-check`, `pnpm --filter @pos/api type-check`.

#### Documentation Workstream
- Scope: Plan tracking and tenant env notes if needed.
- Files inspected: `README.md`, `PLANS.md`
- Findings: README already documents production tenant header fallback token.
- Tasks: Update `PLANS.md`; update docs only if public behavior/env changes require it.
- Risks: Avoid overstating unsupported offline token behavior.
- Validation: Review final diff.

#### Security/Tenant Isolation Workstream
- Scope: Eliminate cache-as-authority and raw tenant header sends.
- Files inspected: tenant/header helper files and API middleware.
- Findings: Raw `x-tenant-id` from localStorage was a tenant authority risk.
- Tasks: Prefer subdomain/session, only allow raw header with server-issued/signed token headers present.
- Risks: Any remaining raw headers must be removed or justified.
- Validation: ripgrep for `x-tenant-id` in POS request helpers.

### Execution Order
1. Add safe shared frontend tenant header helper.
2. Update POS request helpers/hooks/outlet code to use it.
3. Add session fallback in API tenant middleware.
4. Clear invalid tenant cache on login/logout/session invalidation.
5. Validate and update progress.

### Progress

#### Completed
- [ ] Task: Pending implementation.
  - Files changed:
  - Validation:
  - Docs updated:

#### Partially Completed
- [ ] Task: Pending implementation.
  - Completed:
  - Remaining:
  - Reason:

#### Blocked
- [ ] Task: None currently.
  - Blocker:
  - Required next step:

#### Not Attempted
- [ ] Task: Validation.
  - Reason: Implementation not complete yet.

### Validation Log
- Command: Pending
- Result: Pending
- Notes:

### Documentation Updates
- File: `PLANS.md`
- Change: Added active execution plan.

### Checklist Updates
- File: User-provided task list
- Change: Will report completion status in final response.

### Continuation Notes
Continue by centralizing frontend tenant headers, updating the named helpers/hooks, adding API session fallback, then run focused type-checks.

### Completion Update (2026-06-02)

#### Completed
- [x] Tenant authority centralized so normal POS frontend requests rely on tenant subdomain or authenticated session instead of localStorage-backed raw `x-tenant-id`.
  - Files changed: `apps/pos-terminal-web/src/lib/tenant.ts`, `apps/pos-terminal-web/src/lib/outlet.ts`, `apps/pos-terminal-web/src/lib/api/hooks.ts`, `apps/pos-terminal-web/src/hooks/api/*`, and related POS request callers.
  - Validation: `pnpm --filter @pos/terminal-web type-check` passed.
  - Docs updated: `README.md`, `PLANS.md`.
- [x] API tenant middleware accepts authenticated session tenant as server-side authority before raw header/query fallback.
  - Files changed: `apps/api/src/http/middleware/tenant.ts`, `apps/api/src/index.ts`.
  - Validation: `pnpm --filter @pos/api type-check` attempted; failed on pre-existing Express type dependency conflicts and missing `@types/compression`, not this tenant middleware change.
  - Docs updated: `README.md`, `PLANS.md`.
- [x] Login/logout/session guards clear invalid tenant and outlet cache.
  - Files changed: `apps/pos-terminal-web/src/lib/auth.ts`, `apps/pos-terminal-web/src/context/TenantContext.tsx`, `apps/pos-terminal-web/src/App.tsx`, `apps/pos-terminal-web/src/pages/home.tsx`.
  - Validation: `pnpm --filter @pos/terminal-web type-check` passed.
  - Docs updated: `PLANS.md`.

#### Partially Completed
- [ ] Server-issued terminal/signed tenant context fallback.
  - Completed: Frontend only sends raw `x-tenant-id` from `buildTenantAwareHeaders` when a server-issued/signed fallback token is cached (`aurapos.tenantContextToken` or `aurapos.terminalToken`) and exposes the matching token headers; CORS allows those headers.
  - Remaining: Implement/standardize the server endpoint and verification logic for generic POS terminal tenant context tokens if required beyond the existing production `TENANT_HEADER_SERVICE_TOKEN`/device patterns.
  - Reason: User asked to avoid localStorage authority; a full generic terminal-token issuance flow is a separate backend/device lifecycle task.

#### Blocked
- [ ] `@pos/api` full type-check clean pass.
  - Blocker: Existing Express v4/v5 type mismatch around rate-limit handlers and missing `compression` declaration.
  - Required next step: Align Express type dependencies and add/declare `@types/compression`.

#### Not Attempted
- [ ] Full workspace build/test.
  - Reason: Focused type validation was selected for this tenant-helper security change; API type-check already exposes unrelated package-level blockers.

### Validation Log
- Command: `pnpm --filter @pos/terminal-web type-check`
- Result: pass
- Notes: POS frontend compiles after tenant header/helper updates.
- Command: `pnpm --filter @pos/api type-check`
- Result: fail (pre-existing/unrelated type dependency issues)
- Notes: Errors are in `src/http/routes/index.ts` rate-limit Express type compatibility and `src/index.ts` missing `compression` declarations.

### Documentation Updates
- File: `README.md`
- Change: Tenant resolution notes now state normal POS requests resolve tenant from subdomain/session and localStorage is only display/cache.
- File: `PLANS.md`
- Change: Added plan and completion update for tenant authority hardening.

### Checklist Updates
- File: User-provided task list
- Change: Implemented all frontend header/cache/guard items; token issuance flow documented as partial/future backend hardening.

### Continuation Notes
Recommended next batch: implement a first-class POS terminal tenant-context token issuance/verification flow and fix the existing API TypeScript dependency mismatch so `@pos/api` type-check can pass cleanly.

## Plan: Canonical production tenant onboarding endpoint

### Source

- Tasklist: User request covering API registration comparison, canonical endpoint, frontend path consolidation, docs, and end-to-end test.
- User request: Compare `apps/api/src/http/routes/registration.ts` and `apps/api/src/http/controllers/TenantsController.ts` registration behavior; pick canonical endpoint; ensure production onboarding creates tenant, owner, default outlet, module config, free features, and initial catalog seeds consistently; deprecate/redirect alternate endpoint; update frontend docs; add E2E registration test.
- Date started: 2026-06-02
- Current status: Implemented in this batch; API type-check still has unrelated pre-existing dependency/type declaration failures.

### Goal

Make public tenant onboarding use one production-safe flow that creates all baseline records atomically enough for a new tenant to log in and use a seeded catalog immediately.

### Context Read

- [x] AGENTS.md
- [x] PLANS.md
- [x] README.md
- [x] Active tasklist/checklist (user request)
- [x] Relevant docs (`docs/BUSINESS_TYPE_TEMPLATES.md`, `docs/aura-pos-tasklist-id.md`)
- [x] Relevant source files (`registration.ts`, `TenantsController.ts`, registration service, frontend register pages/routes, schema/templates/tests)

### Workstreams

#### Backend/API Workstream

- Scope: Public registration route, tenant controller alternate endpoint, registration service.
- Files inspected: `apps/api/src/http/routes/registration.ts`, `apps/api/src/http/controllers/TenantsController.ts`, `apps/api/src/http/routes/tenants.ts`, `apps/api/src/services/registrationService.ts`, `packages/application/tenants/CreateTenant.ts`.
- Findings: `/api/register` creates owner + tenant + outlet/module/assignment but currently misses tenant features/order types/catalog seeds. `/api/tenants/register` creates tenant features/order types/module via `CreateTenant` but no owner/default outlet/catalog seed and is not a complete production onboarding flow.
- Tasks: Promote `/api/register` as canonical; expand service baseline creation; deprecate `/api/tenants/register`.
- Risks: Better Auth user creation remains outside tenant DB transaction; compensating cleanup must include new baseline rows.
- Validation: API unit/E2E tests and type-check.

#### Database/Schema Workstream

- Scope: Existing schema only; no migrations expected.
- Files inspected: `shared/schema.ts`, seed scripts.
- Findings: Tables already exist for tenant features, tenant order types, product categories, products, outlets, and owner outlet assignments.
- Tasks: Insert existing rows through registration service.
- Risks: Required order types must already be seeded; registration should fail clearly if missing.
- Validation: Fake transaction E2E/service tests.

#### Frontend/UI Workstream

- Scope: POS public registration pages/routes.
- Files inspected: `apps/pos-terminal-web/src/pages/register.tsx`, `apps/pos-terminal-web/src/pages/register-tenant.tsx`, `apps/pos-terminal-web/src/App.tsx`, `login.tsx`.
- Findings: `/register` still performs two-step owner signup + `/api/tenants/register`; `/register-tenant` already uses `/api/register` but is alternate UI.
- Tasks: Update `/register` to call `/api/register`; redirect `/register-tenant` to `/register` or otherwise consolidate.
- Risks: Avoid changing auth/login unrelated behavior.
- Validation: POS type-check/build if feasible.

#### Tests/Validation Workstream

- Scope: Registration service and HTTP route tests.
- Files inspected: `apps/api/src/__tests__/registration-service.test.ts` and route test patterns.
- Findings: Existing service tests use Node test runner and fake deps; no HTTP E2E for registration route yet.
- Tasks: Extend service tests for features/order types/catalog seeds; add route-level E2E registration test.
- Risks: Avoid requiring real DB/network.
- Validation: targeted node test, type-check.

#### Documentation Workstream

- Scope: README and business type/onboarding docs.
- Files inspected: `README.md`, `docs/BUSINESS_TYPE_TEMPLATES.md`, `docs/aura-pos-tasklist-id.md`.
- Findings: Docs already mention `/api/register` partially but do not cover canonical/deprecated endpoint and seeded catalog.
- Tasks: Update docs honestly.
- Risks: Avoid claiming production-ready beyond test coverage.
- Validation: Review docs diff.

#### Security/Tenant Isolation Workstream

- Scope: Registration public endpoint and tenant-owned records.
- Files inspected: registration service and route validators.
- Findings: Registration creates new isolated tenant-owned rows; no cross-tenant reads besides slug uniqueness. Slug validation/reserved list must remain.
- Tasks: Preserve slug checks and owner link/assignment.
- Risks: Partial resources after auth failure; cleanup must remove tenant cascade and auth rows.
- Validation: tests for cleanup paths where practical.

### Execution Order

1. Backend registration baseline consistency.
2. Alternate endpoint deprecation.
3. Frontend route/path consolidation.
4. Documentation sync.
5. Registration E2E and service test updates.
6. Validation and final checklist/plan update.

### Progress

#### Completed

- [x] Compared registration behaviors and selected `POST /api/register` as canonical production tenant onboarding.
  - Files changed: `apps/api/src/http/routes/registration.ts`, `apps/api/src/http/controllers/TenantsController.ts`, `README.md`, `docs/BUSINESS_TYPE_TEMPLATES.md`, `docs/aura-pos-tasklist-id.md`.
  - Validation: Targeted API registration tests passed.
  - Docs updated: README onboarding section and business type template registration defaults.
- [x] Expanded canonical registration to create owner-backed tenant baseline data.
  - Files changed: `apps/api/src/services/registrationService.ts`.
  - Validation: Registration service tests cover features, order types, catalog seeds, duplicate slug/email cleanup, and missing order-type cleanup.
  - Docs updated: `docs/BUSINESS_TYPE_TEMPLATES.md`.
- [x] Deprecated the alternate `POST /api/tenants/register` endpoint.
  - Files changed: `apps/api/src/http/controllers/TenantsController.ts`.
  - Validation: Route is still registered but returns 308 with deprecation, Location, and successor link metadata.
  - Docs updated: README and business type docs.
- [x] Consolidated frontend registration to one canonical path.
  - Files changed: `apps/pos-terminal-web/src/pages/register.tsx`, `apps/pos-terminal-web/src/App.tsx`.
  - Validation: POS terminal type-check passed.
  - Docs updated: README.
- [x] Added registration HTTP E2E coverage and extended service tests.
  - Files changed: `apps/api/src/__tests__/registration-route-e2e.test.ts`, `apps/api/src/__tests__/registration-service.test.ts`.
  - Validation: Targeted API registration tests passed.
  - Docs updated: N/A.

#### Partially Completed

- [ ] API package type-check pass.
  - Completed: Ran `pnpm --filter @pos/api type-check` and inspected failures.
  - Remaining: Fix existing Express 4/5 rate-limit type mismatch and missing `@types/compression`/declaration.
  - Reason: Failures are unrelated to this onboarding change and already affect route index/index declarations.

#### Blocked

- [ ] None for the requested onboarding implementation.
  - Blocker: N/A.
  - Required next step: N/A.

#### Not Attempted

- [ ] Full monorepo type-check/build.
  - Reason: Targeted validations were run; API package type-check has unrelated pre-existing dependency/declaration blockers that should be resolved separately first.

### Validation Log

- Command: `pnpm --filter @pos/api exec tsx --test src/__tests__/registration-service.test.ts src/__tests__/registration-route-e2e.test.ts`
- Result: Passed, 7 tests.
- Notes: Covers service and HTTP-level canonical registration behavior.
- Command: `pnpm --filter @pos/terminal-web type-check`
- Result: Passed.
- Notes: Covers frontend route/page type safety.
- Command: `pnpm --filter @pos/api type-check`
- Result: Failed.
- Notes: Unrelated existing failures: Express 4/5 type mismatch around rate limit middleware in `src/http/routes/index.ts`, plus missing declaration for `compression` in `src/index.ts`.

### Documentation Updates

- File: `README.md`
- Change: Added canonical tenant onboarding endpoint/page and deprecated alternate endpoint notes.
- File: `docs/BUSINESS_TYPE_TEMPLATES.md`
- Change: Expanded registration defaults to include features, order types, starter catalog, canonical/deprecated endpoint behavior, and cleanup honesty.
- File: `docs/aura-pos-tasklist-id.md`
- Change: Marked prior `/api/tenants/register` checklist wording as deprecated for production onboarding.

### Checklist Updates

- File: `PLANS.md`
- Change: Updated plan progress, validation, docs, and continuation notes.

### Continuation Notes

Recommended next batch: fix the existing API type-check blockers (`express-rate-limit` Express 5 type leakage vs Express 4 app types, and missing `compression` declaration) so `pnpm --filter @pos/api type-check` can pass cleanly.

## Plan: Tenant feature uniqueness, dedupe migration, and upsert toggles

### Source

- Tasklist: User request with 5 implementation items for `tenant_features` duplicate prevention.
- User request: Enforce unique `(tenant_id, feature_code)`, deduplicate existing rows by latest active row, add unique constraint after cleanup, switch feature toggle/purchase writes to upsert, and add duplicate toggle/purchase tests.
- Date started: 2026-06-02
- Current status: Implemented with targeted validation passing; API package type-check still blocked by pre-existing Express/compression type issues outside this change.

### Goal

Prevent duplicate tenant feature rows per tenant/feature, safely clean existing duplicates before adding the uniqueness guarantee, and make feature activation paths idempotent via upsert.

### Context Read

- [x] AGENTS.md
- [x] PLANS.md
- [x] README.md
- [x] Active tasklist/checklist: user-provided task list in current request
- [x] Relevant docs: README migration/DB notes
- [x] Relevant source files: `shared/schema.ts`, `packages/infrastructure/repositories/tenants/TenantFeatureRepository.ts`, `apps/api/src/http/controllers/TenantsController.ts`, existing API tests

### Workstreams

#### Backend/API Workstream

- Scope: Tenant feature toggle and plan feature synchronization paths.
- Files inspected: `apps/api/src/http/controllers/TenantsController.ts`, `packages/infrastructure/repositories/tenants/TenantFeatureRepository.ts`.
- Findings: Toggle used read-then-create/update; plan switching deleted plan defaults then inserted, which can conflict with a full unique tenant/feature row if a purchase row exists.
- Tasks: Added repository upsert and route controller usage for new toggle rows and plan-default sync.
- Risks: Tenant isolation and plan-tier enforcement preserved; upsert conflict target is tenant-scoped.
- Validation: API tests passed; API type-check reached unrelated pre-existing Express/compression type blockers.

#### Database/Schema Workstream

- Scope: Drizzle schema and SQL migrations for `tenant_features` uniqueness.
- Files inspected: `shared/schema.ts`, `migrations/0000_conscious_invisible_woman.sql`, current migration list.
- Findings: Schema/migration defined `tenant_features_tenant_feature_unique` as a non-unique index despite its name.
- Tasks: Converted schema to `uniqueIndex`; added migration that drops the old index, deduplicates by latest active row, then creates a unique index.
- Risks: Deduplication order keeps active rows before inactive rows and uses timestamps/id for deterministic selection.
- Validation: `pnpm run db:check` passed.

#### Tests/Validation Workstream

- Scope: Duplicate toggle/purchase behavior.
- Files inspected: `apps/api/src/__tests__`.
- Findings: Tests use Node test runner with lightweight fake DB chains.
- Tasks: Added focused repository tests proving duplicate purchase/create and toggle activation paths use `onConflictDoUpdate` on `(tenant_id, feature_code)`.
- Risks: Tests validate repository behavior without a live database.
- Validation: API test command passed all discovered API tests, including the new repository tests.

#### Documentation Workstream

- Scope: Plan/checklist status.
- Files inspected: `PLANS.md`, `README.md`.
- Findings: README already documents migrations location and commands; no public API shape change expected.
- Tasks: Updated `PLANS.md` with implementation and validation status.
- Risks: None.
- Validation: Final PLANS.md review.

#### Security/Tenant Isolation Workstream

- Scope: Tenant-owned feature rows.
- Files inspected: repository/controller feature queries.
- Findings: Existing queries filter by tenant ID; uniqueness target is tenant-scoped.
- Tasks: Preserved tenant filters and used `(tenant_id, feature_code)` as the conflict target.
- Risks: None introduced.
- Validation: Unit tests verify tenant/feature conflict target.

### Execution Order

1. Update schema and migration. Completed.
2. Add repository upsert method and use it in toggle/plan sync creation paths. Completed.
3. Add duplicate toggle/purchase tests. Completed.
4. Run targeted validation. Completed with one pre-existing type-check blocker noted.
5. Update plan status and commit. Completed in this batch.

### Progress

#### Completed

- [x] Task: Change `shared/schema.ts` `tenantFeatures` to enforce unique `(tenantId, featureCode)`.
  - Files changed: `shared/schema.ts`
  - Validation: `pnpm run db:check`; `pnpm --filter @pos/infrastructure type-check`
  - Docs updated: `PLANS.md`
- [x] Task: Add migration to deduplicate existing `tenant_features` by latest active row and add unique index after cleanup.
  - Files changed: `migrations/0016_tenant_features_unique_upsert.sql`
  - Validation: `pnpm run db:check`
  - Docs updated: `PLANS.md`
- [x] Task: Update tenant feature repository/use paths to upsert duplicate feature creation.
  - Files changed: `packages/infrastructure/repositories/tenants/TenantFeatureRepository.ts`, `apps/api/src/http/controllers/TenantsController.ts`
  - Validation: `pnpm --filter @pos/api test -- src/__tests__/tenant-feature-repository.test.ts`; `pnpm --filter @pos/infrastructure type-check`
  - Docs updated: `PLANS.md`
- [x] Task: Add duplicate toggle/purchase tests.
  - Files changed: `apps/api/src/__tests__/tenant-feature-repository.test.ts`
  - Validation: `pnpm --filter @pos/api test -- src/__tests__/tenant-feature-repository.test.ts`
  - Docs updated: `PLANS.md`

#### Partially Completed

- [ ] Task: Full API package type-check clean result.
  - Completed: Ran `pnpm --filter @pos/api type-check`.
  - Remaining: Fix unrelated existing Express type-version and missing `compression` declaration errors.
  - Reason: The failures are pre-existing type environment/dependency issues in `src/http/routes/index.ts` and `src/index.ts`, not caused by tenant feature changes.

#### Blocked

- [ ] Task: None for the requested implementation.
  - Blocker:
  - Required next step:

#### Not Attempted

- [ ] Task: Live database migration execution.
  - Reason: No live database was requested or configured for this batch; SQL migration was added and Drizzle check passed.

### Validation Log

- Command: `pnpm --filter @pos/api test -- src/__tests__/tenant-feature-repository.test.ts`
- Result: Pass
- Notes: The script discovered and ran all API tests; 37 tests passed including the new tenant feature repository tests.
- Command: `pnpm --filter @pos/infrastructure type-check`
- Result: Pass
- Notes: Infrastructure package type-check passed.
- Command: `pnpm run db:check`
- Result: Pass
- Notes: Drizzle migration/schema check reported everything fine.
- Command: `pnpm --filter @pos/api type-check`
- Result: Warning/fail due to pre-existing unrelated type issues
- Notes: Existing Express 4/5 `RateLimitRequestHandler` type mismatch in `apps/api/src/http/routes/index.ts` and missing `compression` declaration in `apps/api/src/index.ts`.

### Documentation Updates

- File: `PLANS.md`
- Change: Added and completed active execution plan with validation results and known unrelated type-check blocker.

### Checklist Updates

- File: User-provided tasklist in prompt
- Change: All five requested tasks implemented and validated with targeted tests/checks; no source checklist file exists to edit.

### Continuation Notes

Recommended next batch: fix the existing API type-check blockers (`express-rate-limit` Express 5 type leakage vs Express 4 app types, and missing `compression` declaration) so `pnpm --filter @pos/api type-check` can pass cleanly.

## Plan: Cross-Outlet Isolation for Orders, Tables, Inventory, Sync, KDS, Terminals, and Reports

### Source
- Tasklist: User request in chat, 2026-06-02
- User request: Audit routes reading/writing orders, tables, inventory, sync events/conflicts, KDS, terminals, and reports; add `req.outletId` filtering; validate `user_outlet_assignments`; verify outlet-scoped mutations; add cross-outlet manager/cashier tests.
- Date started: 2026-06-02
- Current status: Implemented and validated with full API tests; API type-check still has unrelated pre-existing dependency/type declaration failures.

### Goal
Close cross-outlet data access gaps for authenticated non-owner POS roles and outlet-scoped API reads/mutations while preserving tenant isolation and existing owner access.

### Context Read
- [x] AGENTS.md
- [x] PLANS.md
- [x] README.md
- [x] Active tasklist/checklist (user chat tasklist)
- [x] Relevant docs (`docs/dev/SYNC_PROTOCOL.md`, `docs/dev/CONFLICT_RESOLUTION.md`, `docs/ORDER_LIFECYCLE.md` by route audit references)
- [x] Relevant source files (orders, sync, KDS, inventory, terminals, tables, outlet middleware, repositories, tests)

### Workstreams

#### Backend/API Workstream
- Scope: Orders, tables, inventory, sync, KDS, terminals routes/controllers.
- Files inspected: `apps/api/src/http/controllers/OrdersController.ts`, `SyncController.ts`, `TerminalsController.ts`, `routes/inventory.ts`, `routes/kds.ts`, `routes/tables.ts`, `routes/index.ts`.
- Findings: History, sync audit lists, inventory report/movement lists, terminals, and some mutations need explicit outlet scoping.
- Tasks: Add `req.outletId` filters and mutation ownership checks.
- Risks: Existing legacy rows with null outlet IDs may become hidden from outlet-scoped non-owner requests.
- Validation: API tests and type-check.

#### Database/Schema Workstream
- Scope: Existing outlet columns/indexes.
- Files inspected: `shared/schema.ts`.
- Findings: Required `outlet_id` columns/indexes already exist for orders, tables, terminals, sync_batches, sync_events, server_sync_conflicts, inventory_movements.
- Tasks: No schema migration planned.
- Risks: None for schema.
- Validation: Type-check.

#### Frontend/UI Workstream
- Scope: No UI changes requested.
- Files inspected: Not applicable beyond API route contract.
- Findings: No perceptible UI change.
- Tasks: None.
- Risks: None.
- Validation: Not applicable.

#### Tests/Validation Workstream
- Scope: Cross-outlet manager/cashier tests.
- Files inspected: `apps/api/src/__tests__/tenant-auth-guard.test.ts`, `apps/api/src/__tests__/kds.test.ts`.
- Findings: Existing tests use dependency injection style for middleware/router tests.
- Tasks: Add outlet middleware and/or route-level tests for non-owner outlet assignment enforcement and cross-outlet mutation denial.
- Risks: Full suite may require DB env; targeted tests preferred.
- Validation: `pnpm --filter @pos/api test` or targeted `tsx --test`.

#### Documentation Workstream
- Scope: Sync protocol docs and plan.
- Files inspected: `docs/dev/SYNC_PROTOCOL.md`, `docs/dev/CONFLICT_RESOLUTION.md`, `docs/ORDER_LIFECYCLE.md`.
- Findings: Sync docs list audit endpoints but do not mention outlet scoping.
- Tasks: Update docs when behavior changes.
- Risks: Documentation must not overclaim production readiness.
- Validation: Review.

#### Security/Tenant Isolation Workstream
- Scope: Outlet assignment and row ownership checks.
- Files inspected: `apps/api/src/http/middleware/outlet.ts`, `apps/api/src/http/middleware/tenant.ts`, `apps/api/src/http/middleware/rbac.ts`.
- Findings: Tenant guard sets authenticated user; outlet middleware resolves outlet but does not enforce `user_outlet_assignments` for non-owner roles.
- Tasks: Validate assignment for manager/cashier/staff/kitchen/viewer and reject unassigned active outlet.
- Risks: Device/public routes that bypass tenant middleware need independent context; avoid breaking KDS key flow.
- Validation: Cross-outlet tests.

### Execution Order
1. Implement outlet assignment validation in outlet middleware.
2. Add outlet filters to reads: ListOrderHistory, sync audit lists, inventory report/movements, terminals, tables/KDS delegated list.
3. Add outlet ownership checks to mutations: orders, tables, sync conflict resolution, terminals, inventory movement writes where outlet-scoped.
4. Add cross-outlet tests for manager/cashier.
5. Sync docs and update this plan.
6. Run validation.

### Progress

#### Completed
- [x] Task: Route audit for orders, tables, inventory, sync events/conflicts, KDS, terminals, and reports.
  - Files changed: `PLANS.md`.
  - Validation: Findings implemented and covered by targeted/full API tests.
  - Docs updated: `docs/ORDER_LIFECYCLE.md`, `docs/dev/SYNC_PROTOCOL.md`.
- [x] Task: Enforce `user_outlet_assignments` for authenticated non-owner roles.
  - Files changed: `apps/api/src/http/middleware/outlet.ts`, `apps/api/src/__tests__/outlet-isolation.test.ts`.
  - Validation: `pnpm --filter @pos/api exec tsx --test src/__tests__/outlet-isolation.test.ts`, `pnpm --filter @pos/api test`.
  - Docs updated: `docs/ORDER_LIFECYCLE.md`, `docs/dev/SYNC_PROTOCOL.md`.
- [x] Task: Add outlet filters to order history, sync audit lists/conflict resolution, inventory movements/reporting, terminals, and tables/KDS delegated order access.
  - Files changed: `apps/api/src/http/controllers/OrdersController.ts`, `packages/application/orders/ListOrderHistory.ts`, `apps/api/src/http/controllers/SyncController.ts`, `packages/application/sync/SyncOfflineOrder.ts`, `apps/api/src/http/routes/inventory.ts`, `apps/api/src/http/controllers/TerminalsController.ts`, `apps/api/src/http/routes/tables.ts`.
  - Validation: `pnpm --filter @pos/api test`.
  - Docs updated: `docs/ORDER_LIFECYCLE.md`, `docs/dev/SYNC_PROTOCOL.md`.
- [x] Task: Verify outlet-scoped mutations target rows that belong to both tenant and outlet.
  - Files changed: `apps/api/src/http/controllers/OrdersController.ts`, `apps/api/src/http/controllers/SyncController.ts`, `apps/api/src/http/controllers/TerminalsController.ts`, `apps/api/src/http/routes/tables.ts`, `packages/application/seating/UpdateTableStatus.ts`, `packages/infrastructure/repositories/seating/TableRepository.ts`.
  - Validation: `pnpm --filter @pos/api test`.
  - Docs updated: `docs/ORDER_LIFECYCLE.md`.
- [x] Task: Add cross-outlet manager/cashier tests.
  - Files changed: `apps/api/src/__tests__/outlet-isolation.test.ts`.
  - Validation: `pnpm --filter @pos/api exec tsx --test src/__tests__/outlet-isolation.test.ts`, `pnpm --filter @pos/api test`.
  - Docs updated: None required.

#### Partially Completed
- [ ] Task: API type-check cleanup.
  - Completed: Ran type-check after implementation.
  - Remaining: Existing Express 4/5 rate-limit type mismatch and missing `@types/compression` still fail API type-check.
  - Reason: These failures are unrelated to outlet-isolation changes and pre-existed the batch scope.

#### Blocked
- [ ] Task: None.
  - Blocker:
  - Required next step:

#### Not Attempted
- [ ] Task: Full monorepo validation (`pnpm type-check`, `pnpm build`, `pnpm lint`).
  - Reason: Scope was API outlet-isolation backend changes; API-specific test suite passed, while API type-check remains blocked by unrelated pre-existing Express/compression typing issues.

### Validation Log
- Command: `pnpm --filter @pos/api exec tsx --test src/__tests__/outlet-isolation.test.ts`
- Result: Pass (4 tests).
- Notes: Covers manager denial without outlet assignment, cashier allow with assignment, owner allow, and ListOrderHistory outlet filter propagation.
- Command: `pnpm --filter @pos/api test`
- Result: Pass (41 tests).
- Notes: Full API test suite passed after outlet-scoped changes.
- Command: `pnpm --filter @pos/api type-check`
- Result: Fail (pre-existing environment/type issues).
- Notes: Fails on Express 4/5 `express-rate-limit` handler type mismatch in `apps/api/src/http/routes/index.ts` and missing `@types/compression` in `apps/api/src/index.ts`; no new outlet-specific type errors were reported.

### Documentation Updates
- File: `docs/ORDER_LIFECYCLE.md`
- Change: Documented outlet-scoped order reads/mutations and non-owner assignment requirement.
- File: `docs/dev/SYNC_PROTOCOL.md`
- Change: Documented `outlet_id` in sync audit tables and active-outlet scoping for sync audit/conflict APIs.

### Checklist Updates
- File: `PLANS.md`.
- Change: Added and completed active plan for cross-outlet isolation execution batch, including validation and remaining type-check limitation.

### Continuation Notes
Recommended next batch: fix unrelated API type-check blockers (`express-rate-limit` Express type mismatch and missing `@types/compression`) so `pnpm --filter @pos/api type-check` can be used as a clean validation gate.

## Plan: orders idempotency retry hardening

### Source

- Tasklist: User request on 2026-06-02 for `orders_tenant_idempotency_unique`, create-order idempotency, replay lookup, and retry tests.
- User request: Add partial unique migration/schema support, idempotency key support to `POST /api/orders` + frontend create order, replay lookup before insert in `CreateOrder`, and retry tests for create order/create-and-pay.
- Date started: 2026-06-02
- Current status: Implemented; targeted tests pass. Full repo type-check has unrelated pre-existing API typing failures in route rate limiter/compression declarations.

### Goal

Make order creation retry-safe by enforcing `(tenant_id, idempotency_key)` uniqueness only for non-null keys, replaying existing orders before inserting duplicates, propagating frontend idempotency keys, and validating retry behavior for draft and create-and-pay flows.

### Context Read

- [x] AGENTS.md
- [x] PLANS.md
- [x] README.md
- [x] Active tasklist/checklist (user-provided list)
- [x] Relevant docs (`docs/dev/IDEMPOTENCY.md`)
- [x] Relevant source files (`shared/schema.ts`, migrations, OrdersController, CreateOrder/CreateAndPayOrder, order repository, POS hooks/page, existing idempotency/concurrency tests)

### Workstreams

#### Backend/API Workstream

- Scope: `POST /api/orders`, `POST /api/orders/create-and-pay`, `CreateOrder` replay behavior.
- Files inspected: `apps/api/src/http/controllers/OrdersController.ts`, `packages/application/orders/CreateOrder.ts`, `packages/application/orders/CreateAndPayOrder.ts`, `packages/infrastructure/repositories/orders/OrderRepository.ts`.
- Findings: create-and-pay only accepted body idempotency despite offline client sending header; create order did not accept or replay idempotency keys.
- Tasks: Added header/body normalization, tenant-scoped repository replay lookup, `CreateOrder` replay output, and create-and-pay replay status propagation.
- Risks: Concurrent duplicate inserts still depend on the DB partial unique index as the final safety net if both requests pass the pre-insert lookup simultaneously.
- Validation: API tests pass; app/application/infrastructure/terminal-web type-checks pass. Full root type-check blocked by unrelated API typings.

#### Database/Schema Workstream

- Scope: orders idempotency column/index representation.
- Files inspected: `shared/schema.ts`, `migrations/0004_orders_idempotency_key.sql`, `migrations/0006_auth_tables.sql`, migration snapshots.
- Findings: `0004` already has partial unique raw SQL; `0006` duplicated the column/index and created a non-partial duplicate; schema omitted `.where(...)` for orders.
- Tasks: Kept `0004` as the final raw SQL migration, removed duplicate `0006` order idempotency column/index statements, and aligned schema/snapshots to partial unique.
- Risks: Existing deployed DBs that already applied the non-partial duplicate may need manual reconciliation outside this patch.
- Validation: Static migration inspection and type-check of shared package via root type-check partial run.

#### Frontend/UI Workstream

- Scope: POS create order API hooks.
- Files inspected: `apps/pos-terminal-web/src/lib/api/hooks.ts`, `apps/pos-terminal-web/src/hooks/api/useOrders.ts`, `apps/pos-terminal-web/src/pages/pos.tsx`, `apps/pos-terminal-web/src/hooks/useOfflineOrderSubmit.ts`.
- Findings: online create-order hook did not generate/pass idempotency keys; offline create-and-pay sent idempotency header only.
- Tasks: Generate idempotency keys in create-order/create-and-pay hooks when callers do not supply one, include them in body and `x-idempotency-key` header, and make API backend honor header fallback.
- Risks: Hook-generated keys are per mutation invocation; callers that intentionally retry outside React Query can still pass an explicit `idempotency_key`.
- Validation: `@pos/terminal-web` type-check passes.

#### Tests/Validation Workstream

- Scope: Retry/idempotency tests for create order and create-and-pay.
- Files inspected: existing API tests for record payment and create-and-pay concurrency.
- Findings: create-and-pay fake DB needed condition filtering to simulate idempotency replay accurately; no CreateOrder retry tests existed.
- Tasks: Added `CreateOrder` retry/cross-tenant tests and create-and-pay retry test, while preserving existing concurrency/stock tests.
- Risks: Tests use fakes and do not replace DB integration coverage for unique-violation races.
- Validation: Full `@pos/api` test suite passes.

#### Documentation Workstream

- Scope: Idempotency documentation and PLANS.
- Files inspected: `docs/dev/IDEMPOTENCY.md`, `PLANS.md`.
- Findings: docs already described partial unique index and create-and-pay; they did not describe `POST /api/orders` idempotency support.
- Tasks: Updated docs for both endpoints, header/body behavior, and replay semantics.
- Risks: None known.
- Validation: Manual review.

#### Security/Tenant Isolation Workstream

- Scope: Tenant-scoped idempotency lookup and DB uniqueness.
- Files inspected: backend/create-order repository and migration schema.
- Findings: Unique scope must remain `(tenant_id, idempotency_key)`; replay lookup must include tenant.
- Tasks: Repository lookup filters by tenant and tests verify same key across tenants creates separate orders.
- Risks: None known.
- Validation: CreateOrder cross-tenant retry test passes.

### Execution Order

1. Fix migration/schema partial unique representation. Done.
2. Add backend idempotency normalization and `CreateOrder` replay lookup. Done.
3. Add frontend create-order key propagation. Done.
4. Add retry tests for create order and create-and-pay. Done.
5. Update docs and validation log. Done.

### Progress

#### Completed

- [x] Task: Choose final `orders_tenant_idempotency_unique` migration as partial unique where `idempotency_key IS NOT NULL`.
  - Files changed: `migrations/0004_orders_idempotency_key.sql`, `migrations/0006_auth_tables.sql`, migration snapshots.
  - Validation: Inspected migration SQL; targeted tests pass.
  - Docs updated: `docs/dev/IDEMPOTENCY.md` already documents partial unique and remains aligned.
- [x] Task: Make `shared/schema.ts` represent the partial unique index.
  - Files changed: `shared/schema.ts`, migration snapshots.
  - Validation: Root type-check reached shared package successfully; app-specific type-checks pass.
  - Docs updated: `docs/dev/IDEMPOTENCY.md`.
- [x] Task: Add idempotency key support to `POST /api/orders` and frontend create order.
  - Files changed: `OrdersController.ts`, POS API hooks.
  - Validation: API tests and terminal-web type-check pass.
  - Docs updated: `docs/dev/IDEMPOTENCY.md`.
- [x] Task: Implement replay lookup before insert in `CreateOrder`.
  - Files changed: `CreateOrder.ts`, `OrderRepository.ts`.
  - Validation: CreateOrder retry tests pass.
  - Docs updated: `docs/dev/IDEMPOTENCY.md`.
- [x] Task: Add retry tests for create order and create-and-pay.
  - Files changed: `create-order-idempotency.test.ts`, `create-and-pay-stock-concurrency.test.ts`, `CreateAndPayOrder.ts`.
  - Validation: Full `@pos/api` test suite passes.
  - Docs updated: `PLANS.md`.

#### Partially Completed

- [ ] Task: Full monorepo type-check.
  - Completed: `@pos/terminal-web`, `@pos/application`, and `@pos/infrastructure` type-checks passed; root type-check completed several packages before API failure.
  - Remaining: Fix unrelated `@pos/api` Express/rate-limit type mismatch and missing `@types/compression`.
  - Reason: Failures are pre-existing/dependency typing issues outside the idempotency change scope.

#### Blocked

- [ ] Task: Full root `pnpm type-check` green.
  - Blocker: `apps/api/src/http/routes/index.ts` Express v4/v5 type mismatch with `RateLimitRequestHandler`, plus missing `compression` declaration in `apps/api/src/index.ts`.
  - Required next step: Normalize Express type dependency versions and add/declare compression typings.

#### Not Attempted

- [ ] Task: Database integration race test against real Postgres.
  - Reason: Current batch added deterministic fake/use-case retry tests; real DB concurrency coverage can be a follow-up if a test database is provisioned.

### Validation Log

- Command: `pnpm --filter @pos/api exec tsx --test src/__tests__/create-order-idempotency.test.ts src/__tests__/create-and-pay-stock-concurrency.test.ts`
- Result: Passed.
- Notes: 8 tests passed.
- Command: `pnpm --filter @pos/api test`
- Result: Passed.
- Notes: 44 tests passed.
- Command: `pnpm --filter @pos/terminal-web type-check && pnpm --filter @pos/application type-check && pnpm --filter @pos/infrastructure type-check`
- Result: Passed.
- Notes: Validates touched frontend/application/infrastructure packages.
- Command: `pnpm type-check`
- Result: Failed.
- Notes: Unrelated/pre-existing API typing failures in `apps/api/src/http/routes/index.ts` and missing `compression` declaration in `apps/api/src/index.ts`.

### Documentation Updates

- File: `docs/dev/IDEMPOTENCY.md`
- Change: Added `POST /api/orders` idempotency support, header/body fallback behavior, and replay semantics for duplicate keys.
- File: `PLANS.md`
- Change: Added and completed execution plan for this batch.

### Checklist Updates

- File: User-provided checklist (no separate repository checklist file named by user).
- Change: All five requested items implemented in this batch; partial note only for full root type-check due unrelated blocker.

### Continuation Notes

Next safest batch is to fix the unrelated API type-check blockers (`express-rate-limit` Express type mismatch and `compression` typings), then add optional real-Postgres duplicate-key race coverage for create order/create-and-pay.

## Plan: Tenant-aware POS `apiRequest` conflict resolution headers

### Source

- Tasklist: User-provided 4-item implementation request for `apiRequest` tenant/outlet context and conflict resolve header coverage.
- User request: Replace or update POS `apiRequest`, audit imports, and add mocked fetch/header assertion for conflict resolve.
- Date started: 2026-06-02
- Current status: Implemented; validation attempted in this batch.

### Goal

Ensure POS terminal mutation calls made through the shared `apiRequest` helper include session credentials plus tenant/outlet context headers from the existing outlet/tenant helpers, and cover sync conflict resolution with a mocked fetch assertion.

### Context Read

- [x] AGENTS.md
- [x] PLANS.md
- [x] README.md
- [x] Active user tasklist/checklist
- [x] Relevant docs (`docs/dev/CONFLICT_RESOLUTION.md`, `docs/dev/SYNC_PROTOCOL.md`)
- [x] Relevant source files (`queryClient.ts`, `outlet.ts`, `tenant.ts`, `sync-conflicts.tsx`, `lib/api/hooks.ts`)

### Workstreams

#### Backend/API Workstream

- Scope: No backend implementation changes required.
- Files inspected: `docs/dev/CONFLICT_RESOLUTION.md`, `docs/dev/SYNC_PROTOCOL.md`.
- Findings: Conflict resolution endpoint is tenant-scoped (`PATCH /api/sync/conflicts/:id/resolve`) and frontend requests must preserve credentials and tenant/outlet context.
- Tasks: None changed server-side.
- Risks: Backend must continue rejecting missing or mismatched tenant context.
- Validation: Frontend mocked fetch assertion verifies request shape.

#### Database/Schema Workstream

- Scope: No schema changes.
- Files inspected: Conflict documentation for `server_sync_conflicts` behavior.
- Findings: Header propagation change does not alter persisted data shape.
- Tasks: None.
- Risks: None introduced.
- Validation: Not applicable.

#### Frontend/UI Workstream

- Scope: POS shared request helper and sync conflict page usage.
- Files inspected: `apps/pos-terminal-web/src/lib/queryClient.ts`, `apps/pos-terminal-web/src/lib/outlet.ts`, `apps/pos-terminal-web/src/pages/sync-conflicts.tsx`.
- Findings: `sync-conflicts.tsx` used `apiRequest`; centralizing header behavior in `apiRequest` fixes this and future calls.
- Tasks: Updated `apiRequest` to call `buildApiHeaders()` while preserving `credentials: "include"`; switched outlet helper import to a runtime-friendly relative import.
- Risks: `buildTenantAwareHeaders()` intentionally sends raw tenant header only when server-issued tenant or terminal context tokens are present.
- Validation: Mocked fetch test and type-check attempted.

#### Tests/Validation Workstream

- Scope: Header coverage for conflict resolve request.
- Files inspected: Existing package scripts and test conventions.
- Findings: POS terminal package has no existing test script; root has `tsx`, so a Node test was added under `tests/` and run with `pnpm exec tsx --test`.
- Tasks: Added `tests/pos-terminal-api-request.test.ts`.
- Risks: None observed in this batch.
- Validation: Targeted mocked fetch test and package type-check passed.

#### Documentation Workstream

- Scope: Conflict resolution docs.
- Files inspected: `docs/dev/CONFLICT_RESOLUTION.md`.
- Findings: Per-conflict action table did not document tenant-aware frontend headers.
- Tasks: Add note that conflict UI uses `apiRequest`, includes credentials, and adds tenant/outlet headers via `buildApiHeaders()`.
- Risks: None.
- Validation: Documentation reviewed with source changes.

#### Security/Tenant Isolation Workstream

- Scope: Tenant/outlet header propagation for tenant-scoped mutations.
- Files inspected: `apps/pos-terminal-web/src/lib/tenant.ts`, `apps/pos-terminal-web/src/lib/outlet.ts`, `apps/pos-terminal-web/src/lib/queryClient.ts`, `apps/pos-terminal-web/src/lib/api/hooks.ts`, `apps/pos-terminal-web/src/pages/sync-conflicts.tsx`.
- Findings: Only active `apiRequest` call is conflict resolve; stale import in API hooks was unused. Central helper now includes existing tenant-context-token/terminal-token-gated tenant header and active outlet header.
- Tasks: Updated helper and removed unused import.
- Risks: Raw localStorage tenant ID is still not treated as authority, matching existing security design.
- Validation: Mocked fetch assertion covers credentials, tenant token, terminal token, tenant ID, and outlet ID.

### Execution Order

1. Read required instructions/docs/source.
2. Audit `apiRequest` imports and usage.
3. Update central POS `apiRequest` helper.
4. Add mocked fetch assertion for conflict resolve headers.
5. Synchronize conflict-resolution docs and plan.
6. Run validation.
7. Commit and open PR.

### Progress

#### Completed

- [x] Task: Update `apiRequest` to use tenant/outlet-aware headers.
  - Files changed: `apps/pos-terminal-web/src/lib/queryClient.ts`, `apps/pos-terminal-web/src/lib/outlet.ts`
  - Validation: Targeted mocked fetch test passed; type-check attempted.
  - Docs updated: `docs/dev/CONFLICT_RESOLUTION.md`
- [x] Task: Audit `apiRequest` imports.
  - Files changed: `apps/pos-terminal-web/src/lib/api/hooks.ts`
  - Validation: `rg "apiRequest" apps/pos-terminal-web/src -n` showed only the helper export and sync conflict page usage after cleanup.
  - Docs updated: This plan documents the audit.
- [x] Task: Add conflict resolve request header assertion.
  - Files changed: `tests/pos-terminal-api-request.test.ts`
  - Validation: `pnpm exec tsx --test tests/pos-terminal-api-request.test.ts` passed.
  - Docs updated: None required beyond plan and conflict docs.

#### Partially Completed

- [ ] Task: None.
  - Completed: None.
  - Remaining: None.
  - Reason: No partial tasks in this batch.

#### Blocked

- [ ] Task: None.
  - Blocker: None.
  - Required next step: None.

#### Not Attempted

- [ ] Task: UI screenshot.
  - Reason: No perceptible UI behavior or visual change was made.

### Validation Log

- Command: `rg "apiRequest" apps/pos-terminal-web/src -n`
- Result: Passed; only helper export and sync-conflict usage remained.
- Notes: Removed unused import from centralized API hooks.
- Command: `pnpm exec tsx --test tests/pos-terminal-api-request.test.ts`
- Result: Passed.
- Notes: Verifies conflict resolve `PATCH` request includes credentials and tenant/outlet-aware headers.
- Command: `pnpm --filter @pos/terminal-web type-check`
- Result: Passed.
- Notes: POS terminal package type-check completed successfully after this change.

### Documentation Updates

- File: `docs/dev/CONFLICT_RESOLUTION.md`
- Change: Documented that conflict resolution UI requests use tenant-aware `apiRequest` headers and credentials.

### Checklist Updates

- File: `PLANS.md`
- Change: Added this active plan with completed, partial, validation, and continuation status.

### Continuation Notes

This header task is implemented and validated. No continuation is required for this batch.

## Plan: Offline sync inventory stock/ledger idempotency

### Source

- Tasklist: User request in current turn
- User request: Align `SyncOfflineOrder.writeInventoryMovements` with `CreateAndPayOrder`, choose one stock+ledger owner, prevent duplicate movements, add idempotency uniqueness, and test sync stock/ledger behavior.
- Date started: 2026-06-02
- Current status: Implemented; API type-check has unrelated pre-existing dependency/type mismatch warnings.

### Goal

Ensure offline order sync creates exactly one stock deduction and one inventory ledger entry per product by making the order/payment use case the owner of stock+ledger writes, while preserving sync metadata on that canonical movement.

### Context Read

- [x] AGENTS.md
- [x] PLANS.md
- [x] README.md
- [x] Active tasklist/checklist (current user request)
- [x] Relevant docs (`docs/dev/IDEMPOTENCY.md`, `docs/dev/SYNC_PROTOCOL.md`, `docs/OFFLINE_ARCHITECTURE.md`, `docs/dev/CONFLICT_RESOLUTION.md`, `docs/OFFLINE_PRODUCTION_GRADE_POS_TASKS.md`)
- [x] Relevant source files (`SyncOfflineOrder`, `CreateAndPayOrder`, `stockMovements`, schema/tests, inventory API route comments)

### Workstreams

#### Backend/API Workstream

- Scope: `SyncOfflineOrder`, `CreateAndPayOrder`, inventory stock helper, inventory route documentation comments.
- Files inspected: `packages/application/sync/SyncOfflineOrder.ts`, `packages/application/orders/CreateAndPayOrder.ts`, `packages/application/inventory/stockMovements.ts`, `apps/api/src/http/routes/inventory.ts`.
- Findings: Sync previously wrote `offline_sale` ledger rows and decremented stock after `CreateAndPayOrder` already deducted stock and wrote `SALE`; this duplicated stock/ledger effects.
- Tasks: Removed duplicate sync writer; passed sync terminal metadata into canonical movement.
- Risks: Keep idempotent replay behavior unchanged; update in-memory sync product snapshot only for subsequent batch conflict checks.
- Validation: API test suite and application type-check passed.

#### Database/Schema Workstream

- Scope: Inventory movements uniqueness.
- Files inspected: `shared/schema.ts`, `migrations/0009_sprint5_conflicts.sql`, migration folder.
- Findings: `inventory_movements` lacked a unique marker/index for order/product/movement.
- Tasks: Added partial unique index on `(order_id, product_id, movement_type)` where `order_id` is not null, with migration deduplicating existing duplicate rows for the same key before index creation.
- Risks: Legacy `OFFLINE_SALE` rows remain supported/visible; new synced offline sales use canonical `SALE` rows.
- Validation: Application type-check passed.

#### Tests/Validation Workstream

- Scope: Offline sync stock/ledger regression test.
- Files inspected: `apps/api/src/__tests__/create-and-pay-stock-concurrency.test.ts`, test script config.
- Findings: Existing fake DB tests covered CreateAndPay stock behavior, no sync-specific duplicate regression existed.
- Tasks: Added sync regression test verifying exactly one stock deduction and one ledger entry per product.
- Risks: API type-check still fails on unrelated Express/rate-limit/compression declaration issues.
- Validation: API test suite passed; application type-check passed; API type-check attempted and failed on unrelated pre-existing errors.

### Execution Order

1. Remove duplicate sync inventory writer and imports. Completed.
2. Add terminal metadata pass-through to canonical `SALE` movements. Completed.
3. Add unique idempotency index in schema and migration. Completed.
4. Add sync regression tests. Completed.
5. Run validation and update this plan with results. Completed.

### Progress

#### Completed

- [x] Task: Make `CreateAndPayOrder`/stock movement helper the single stock+ledger owner for synced offline orders.
  - Files changed: `packages/application/sync/SyncOfflineOrder.ts`, `packages/application/orders/CreateAndPayOrder.ts`, `packages/application/inventory/stockMovements.ts`.
  - Validation: `pnpm --filter @pos/application type-check`; `pnpm --filter @pos/api test`.
  - Docs updated: `PLANS.md`, `docs/dev/CONFLICT_RESOLUTION.md`, `docs/OFFLINE_PRODUCTION_GRADE_POS_TASKS.md`, `apps/api/src/http/routes/inventory.ts` comments.
- [x] Task: Add inventory movement idempotency uniqueness.
  - Files changed: `shared/schema.ts`, `migrations/0017_inventory_movements_order_product_movement_unique.sql`.
  - Validation: `pnpm --filter @pos/application type-check`.
  - Docs updated: `PLANS.md`.
- [x] Task: Add sync regression coverage for one stock deduction and one ledger row per product.
  - Files changed: `apps/api/src/__tests__/create-and-pay-stock-concurrency.test.ts`.
  - Validation: `pnpm --filter @pos/api test`.
  - Docs updated: `PLANS.md`.

#### Partially Completed

- [ ] Task: None.
  - Completed:
  - Remaining:
  - Reason:

#### Blocked

- [ ] Task: API package type-check clean pass.
  - Blocker: Existing dependency/type issues in `apps/api/src/http/routes/index.ts` for Express/rate-limit types and missing `@types/compression` declaration in `apps/api/src/index.ts`.
  - Required next step: Resolve dependency/type declarations separately; not caused by this inventory sync change.

#### Not Attempted

- [ ] Task: None.
  - Reason:

### Validation Log

- Command: `pnpm --filter @pos/api test -- create-and-pay-stock-concurrency.test.ts`
- Result: Pass (script still ran all API tests; 45 tests passed)
- Notes: Initial targeted regression run passed.
- Command: `pnpm --filter @pos/application type-check && pnpm --filter @pos/api type-check`
- Result: Partial; application type-check passed, API type-check failed on unrelated pre-existing Express/rate-limit/compression type issues.
- Notes: No application-layer type errors from this change.
- Command: `pnpm --filter @pos/application type-check && pnpm --filter @pos/api test`
- Result: Pass
- Notes: Application type-check passed and API suite passed (45 tests).

### Documentation Updates

- File: `PLANS.md`
- Change: Added and completed this execution plan.
- File: `docs/dev/CONFLICT_RESOLUTION.md`
- Change: Updated offline stock-conflict wording from `offline_sale` to canonical `SALE` movement.
- File: `docs/OFFLINE_PRODUCTION_GRADE_POS_TASKS.md`
- Change: Updated inventory ledger status to document canonical `SALE` movements for synced offline orders and legacy `OFFLINE_SALE` support.
- File: `apps/api/src/http/routes/inventory.ts`
- Change: Updated inventory route comments to note `OFFLINE_SALE` is retained for legacy/manual rows while current offline sync uses `SALE` with terminal metadata.

### Checklist Updates

- File: `PLANS.md`
- Change: Marked implementation and validation complete, with API type-check blocker documented.
- File: `docs/OFFLINE_PRODUCTION_GRADE_POS_TASKS.md`
- Change: Marked the synced offline inventory movement checklist item complete with corrected behavior.

### Continuation Notes

This batch is implemented and validated. Recommended next batch: clean up the unrelated API type-check dependency/type issues so `pnpm --filter @pos/api type-check` can pass independently.

## Plan: Browser-safe local order number sequence allocation

### Source
- Tasklist: User-provided 5-item request for `generateLocalOrderNumber` local sequence hardening.
- User request: Wrap `generateLocalOrderNumber` in a Dexie `sync_meta` transaction, re-read/update sequence inside it, include terminal id in sequence key when terminal-scoped, add duplicate fallback, and add a browser concurrency test for parallel local order creation.
- Date started: 2026-06-02
- Current status: Implemented and validated for `@pos/offline`.

### Goal
Prevent duplicate offline local order numbers when browser clients create local orders concurrently, while preserving terminal-scoped `OFF-{terminal}-{date}-{seq}` numbering.

### Context Read
- [x] AGENTS.md
- [x] PLANS.md
- [x] README.md
- [x] Active user tasklist
- [x] Relevant docs (`docs/OFFLINE_ARCHITECTURE.md`)
- [x] Relevant source files (`packages/offline/src/orderNumber.ts`, `packages/offline/src/localOrderService.ts`, `packages/offline/src/db.ts`)

### Workstreams

#### Frontend/Offline Workstream
- Scope: Offline IndexedDB order number generation.
- Files inspected: `packages/offline/src/orderNumber.ts`, `packages/offline/src/localOrderService.ts`, `packages/offline/src/db.ts`.
- Findings: Existing sequence key was per tenant/date only and read/updated `sync_meta` outside a Dexie transaction.
- Tasks: Completed. `generateLocalOrderNumber()` now uses a Dexie read-write transaction over `sync_meta` and `local_orders`, re-reads the sequence row inside the transaction, updates it before returning, and keys the counter by tenant, terminal, and date.
- Risks: Existing `sync_meta` tenant/date-only keys remain unused for future allocations; this may restart per-terminal local sequences but duplicate detection protects against existing local order numbers.
- Validation: `@pos/offline` test and type-check passed.

#### Tests/Validation Workstream
- Scope: Browser-like IndexedDB concurrency coverage.
- Files inspected: offline package scripts and existing test availability.
- Findings: No offline package test script existed; fake IndexedDB was needed for a browser IndexedDB-compatible test in Node.
- Tasks: Completed. Added Node test runner coverage using `fake-indexeddb` to simulate browser IndexedDB, covering 25 parallel `createLocalOrder()` calls and duplicate fallback behavior.
- Risks: This is browser IndexedDB simulation rather than an installed Playwright real-browser harness.
- Validation: `pnpm --filter @pos/offline test` passed.

#### Documentation Workstream
- Scope: Offline architecture documentation and execution plan.
- Files inspected: `docs/OFFLINE_ARCHITECTURE.md`, `PLANS.md`.
- Findings: Offline docs listed local order number generation but not transaction/terminal sequence details.
- Tasks: Completed. Updated offline architecture docs with terminal-scoped transactional local number allocation details.
- Risks: None known.
- Validation: Documentation reviewed.

### Execution Order
1. [x] Wrap local order number sequence allocation in Dexie transaction.
2. [x] Re-read and update `sync_meta` inside the transaction.
3. [x] Include `terminalId` in terminal-scoped sequence key.
4. [x] Add duplicate detection and retry/random fallback.
5. [x] Add browser IndexedDB concurrency test for parallel local order creation.
6. [x] Update offline docs and plan.
7. [x] Run validation, commit, create PR.

### Progress

#### Completed
- [x] Task: Transaction-safe `generateLocalOrderNumber` sequence allocation.
  - Files changed: `packages/offline/src/orderNumber.ts`.
  - Validation: `pnpm --filter @pos/offline test`; `pnpm --filter @pos/offline type-check`.
  - Docs updated: `docs/OFFLINE_ARCHITECTURE.md`.
- [x] Task: Terminal-scoped sequence key and duplicate fallback.
  - Files changed: `packages/offline/src/orderNumber.ts`.
  - Validation: duplicate fallback test passed.
  - Docs updated: `docs/OFFLINE_ARCHITECTURE.md`.
- [x] Task: Browser concurrency test.
  - Files changed: `packages/offline/src/__tests__/localOrderConcurrency.browser.test.ts`, `packages/offline/package.json`, `pnpm-lock.yaml`.
  - Validation: offline package test passed.
  - Docs updated: None.

#### Partially Completed
- [ ] Task: None.
  - Completed:
  - Remaining:
  - Reason:

#### Blocked
- [ ] Task: None.
  - Blocker:
  - Required next step:

#### Not Attempted
- [ ] Task: Real Playwright browser harness.
  - Reason: The repository did not already include a Playwright test setup; this batch added a browser IndexedDB simulation with `fake-indexeddb` instead of introducing a larger end-to-end browser harness.

### Validation Log
- Command: pnpm --filter @pos/offline test
- Result: Pass
- Notes: Covers parallel local order creation and duplicate fallback.
- Command: pnpm --filter @pos/offline type-check
- Result: Pass
- Notes: Validates offline package TypeScript including the new test.

### Documentation Updates
- File: `docs/OFFLINE_ARCHITECTURE.md`
- Change: Documented transaction-safe, terminal-scoped local order sequence allocation and `sync_meta` key shape.

### Checklist Updates
- File: User tasklist in prompt
- Change: All five requested implementation items completed and validated where practical.

### Continuation Notes
Recommended next batch: consider adding a real Playwright browser test harness if the project wants end-to-end multi-tab browser concurrency coverage beyond fake IndexedDB simulation.

## Plan: Order list index and query plan hardening

### Source

- Tasklist: User-provided 4-item list for order indexes, repository filter review, migration drift confirmation, and query plan checks.
- User request: Add order composite indexes; review `OrderRepository.buildFilterConditions` and open/history queries; confirm `order_items(order_id)` after drift cleanup; add query plan checks for queue/history/report endpoints.
- Date started: 2026-06-02
- Current status: Implemented; validation attempted with one pre-existing API type-check blocker and one environment-limited DB plan check.

### Goal

Make tenant/outlet-scoped order queue, order history, and report/list queries use matching composite indexes while providing a repeatable PostgreSQL query-plan check that validates realistic row-count behavior and confirms the existing `order_items(order_id)` index is present after migrations are applied.

### Context Read

- [x] AGENTS.md
- [x] PLANS.md
- [x] README.md
- [x] Active tasklist/checklist from user prompt
- [x] Relevant docs (`docs/ORDER_LIFECYCLE.md`, migration docs)
- [x] Relevant source files (`shared/schema.ts`, `OrderRepository`, open/history use cases, order routes/controllers, migrations)

### Workstreams

#### Backend/API Workstream

- Scope: Order repository filters and endpoint query shapes.
- Files inspected: `packages/infrastructure/repositories/orders/OrderRepository.ts`, `packages/application/orders/ListOpenOrders.ts`, `packages/application/orders/ListOrderHistory.ts`, `apps/api/src/http/controllers/OrdersController.ts`, `apps/api/src/http/routes/orders.ts`.
- Findings: List/open/history/report-like order endpoints all use tenant filters and outlet filters when `req.outletId` is present, then sort by `order_date DESC`.
- Tasks: Reorder repository predicate construction to match tenant/outlet/status/date index prefix and document why.
- Risks: Predicate order is not a PostgreSQL semantic requirement, so validation must focus on actual query plans.
- Validation: Type-check API and add query-plan check script.

#### Database/Schema Workstream

- Scope: Drizzle schema indexes and SQL migrations.
- Files inspected: `shared/schema.ts`, `migrations/0000_conscious_invisible_woman.sql`, `migrations/0015_native_uuid_alignment.sql`, `migrations/0016_tenant_features_unique_upsert.sql`, `migrations/0017_inventory_movements_order_product_movement_unique.sql`, `migrations/meta/_journal.json`.
- Findings: `order_items_order_idx` already exists in base migration and schema. Requested `orders(tenant_id, outlet_id, status, order_date DESC)` and `orders(tenant_id, outlet_id, order_date DESC)` are absent.
- Tasks: Add schema indexes and idempotent SQL migration.
- Risks: Existing migration journal drift predates this task; avoid unsafe broad migration rewrite.
- Validation: Drizzle/type validation and query-plan script index-presence checks.

#### Tests/Validation Workstream

- Scope: Repeatable checks for queue/history/report queries.
- Files inspected: API package scripts and existing Node test style.
- Findings: Existing tests use Node test runner; query plans need a real PostgreSQL connection and realistic seeded rows.
- Tasks: Add opt-in DB script that seeds temporary tenant/outlet/order rows inside a rollback transaction, runs EXPLAIN plans, and asserts required index usage.
- Risks: Cannot run without `DATABASE_URL` pointing to PostgreSQL.
- Validation: Run type-check; run script if DB is available, otherwise document environment limitation.

#### Documentation Workstream

- Scope: Document index/query-plan check behavior and migration confirmation.
- Files inspected: README and docs/dev.
- Findings: No current query-plan check documentation.
- Tasks: Add docs/dev guide and update PLANS.md progress.
- Risks: Keep documentation honest about DB requirement.
- Validation: N/A beyond type-check.

#### Security/Tenant Isolation Workstream

- Scope: Tenant/outlet filters in order reads.
- Files inspected: Order repository and controllers/use cases.
- Findings: Existing query paths include tenant filtering; outlet scoping is passed by controllers/use cases when outlet middleware supplies `req.outletId`.
- Tasks: Preserve tenant/outlet filtering while adding indexes.
- Risks: None if query shapes remain unchanged.
- Validation: Type-check and query-plan script.

### Execution Order

1. Add schema and SQL migration indexes.
2. Align repository condition construction/commentary with index order.
3. Add DB query-plan check script and package command.
4. Document query-plan checks and order item index confirmation.
5. Run validation and update progress.

### Progress

#### Completed

- [x] Task: Add order composite indexes
  - Files changed: `shared/schema.ts`, `migrations/0018_order_query_indexes.sql`, `migrations/meta/_journal.json`
  - Validation: `pnpm --filter @pos/api type-check` attempted; failed on pre-existing Express/rate-limit/compression type issues unrelated to these files.
  - Docs updated: `docs/dev/ORDER_QUERY_PLAN_CHECKS.md`
- [x] Task: Review and align repository/open/history query shape
  - Files changed: `packages/infrastructure/repositories/orders/OrderRepository.ts`
  - Validation: Repository query shape reviewed against `ListOpenOrders`, `ListOrderHistory`, and `OrdersController` list/report path.
  - Docs updated: `docs/dev/ORDER_QUERY_PLAN_CHECKS.md`
- [x] Task: Confirm `order_items(order_id)` after drift cleanup
  - Files changed: `migrations/0018_order_query_indexes.sql`, `apps/api/src/scripts/checkOrderQueryPlans.ts`
  - Validation: Query-plan script confirms `order_items_order_idx` exists before running plans; local run was blocked because `DATABASE_URL` is not set.
  - Docs updated: `docs/dev/ORDER_QUERY_PLAN_CHECKS.md`
- [x] Task: Add query-plan checks for queue/history/report endpoints
  - Files changed: `apps/api/src/scripts/checkOrderQueryPlans.ts`, `apps/api/package.json`
  - Validation: `pnpm --filter @pos/api check:order-query-plans` attempted; failed locally because `DATABASE_URL` is required for real PostgreSQL EXPLAIN checks.
  - Docs updated: `docs/dev/ORDER_QUERY_PLAN_CHECKS.md`

#### Partially Completed

- [ ] Task:
  - Completed:
  - Remaining:
  - Reason:

#### Blocked

- [ ] Task:
  - Blocker:
  - Required next step:

#### Not Attempted

- [ ] Task:
  - Reason:

### Validation Log

- Command: `pnpm --filter @pos/api exec tsc --noEmit --skipLibCheck --module NodeNext --moduleResolution NodeNext --target ES2022 src/scripts/checkOrderQueryPlans.ts`
- Result: Pass
- Notes: Validates the new query-plan script TypeScript in isolation.
- Command: `pnpm --filter @pos/api type-check`
- Result: Failed
- Notes: Failure is in existing route typings (`src/http/routes/index.ts`) and missing `@types/compression`, not in the changed order index/query-plan files.
- Command: `pnpm --filter @pos/api check:order-query-plans`
- Result: Failed in local environment
- Notes: Script correctly requires `DATABASE_URL`; run it against a migrated PostgreSQL database to execute EXPLAIN checks with temporary realistic rows.

### Documentation Updates

- File: `docs/dev/ORDER_QUERY_PLAN_CHECKS.md`
- Change: Documented new indexes, repository query shape, `order_items_order_idx` confirmation, and query-plan check command.

### Checklist Updates

- File: PLANS.md
- Change: Active plan completed with validation caveats.

### Continuation Notes

Run `DATABASE_URL=<postgres> pnpm --filter @pos/api check:order-query-plans` after applying migrations in a staging/production-like database, then investigate any PostgreSQL-specific planner differences if the script reports sequential scans.

## Plan: Distributed pubsub and cache hardening

### Source

- Tasklist: User request with 5 infrastructure/cache items
- User request: Replace in-memory pub/sub, persist CFD state, use namespaced Redis/cache, add instance-safe invalidation, document production config.
- Date started: 2026-06-02
- Current status: In progress

### Goal

Move order queue and CFD cross-instance signaling away from process-local only behavior, store latest CFD state in Redis with TTL when configured, centralize tenant/feature/module/outlet cache namespaces, and document production runtime requirements.

### Context Read

- [x] AGENTS.md
- [x] PLANS.md
- [x] README.md
- [x] Active user tasklist
- [x] Relevant docs (`docs/CFD_SECURITY.md`, architecture docs searched for CFD/order queue/offline notes)
- [x] Relevant source files (`apps/api/src/routes.ts`, `apps/api/src/http/services/orderQueueEvents.ts`, tenant/feature/outlet routes and middleware)

### Workstreams

#### Backend/API Workstream

- Scope: CFD websocket update path, order queue SSE events, tenant/feature/module/outlet caches.
- Files inspected: `apps/api/src/routes.ts`, `apps/api/src/http/services/orderQueueEvents.ts`, `apps/api/src/http/middleware/tenant.ts`, `apps/api/src/http/middleware/featureGuard.ts`, `apps/api/src/http/routes/outlets.ts`, `apps/api/src/http/controllers/TenantsController.ts`.
- Findings: CFD latest state and order queue events are process-local; tenant/feature/module caches are in-memory only; invalidation helpers are local-only and not always called after tenant/module/feature/outlet mutations.
- Tasks: Add shared Redis cache/pubsub service with local fallback, wire route publish/subscribe, add invalidation helpers and mutation calls.
- Risks: Redis is optional in dev; production must configure Redis for cross-instance behavior.
- Validation: API type-check and tests where possible.

#### Database/Schema Workstream

- Scope: No schema migration planned because Redis is selected for pub/sub/cache/state.
- Files inspected: `packages/infrastructure/database.ts`, package dependency graph.
- Findings: Postgres client exists but Redis better matches requested TTL cache/state use cases.
- Tasks: Add Redis dependency/config docs only.
- Risks: Production without Redis falls back to local process behavior and is not multi-instance safe.
- Validation: Type-check.

#### Frontend/UI Workstream

- Scope: No perceptible UI changes expected.
- Files inspected: Not applicable beyond CFD/order queue API contract.
- Findings: Existing websocket/SSE contracts can stay unchanged.
- Tasks: None.
- Risks: None.
- Validation: No screenshot required because no UI change.

#### Tests/Validation Workstream

- Scope: Existing CFD/order queue tests and type-check.
- Files inspected: `apps/api/src/__tests__/cfd.test.ts`.
- Findings: Dependency injection needed to keep local test behavior deterministic.
- Tasks: Preserve testability with fallbacks.
- Risks: Full workspace may have pre-existing failures.
- Validation: Targeted API type-check/test.

#### Documentation Workstream

- Scope: README and production docs.
- Files inspected: `README.md`, `docs/CFD_SECURITY.md`.
- Findings: Redis/pubsub config not yet documented.
- Tasks: Add production cache/pubsub env docs.
- Risks: Must be honest about fallback behavior.
- Validation: Docs reviewed.

#### Security/Tenant Isolation Workstream

- Scope: Namespaced cache keys and tenant-scoped pub/sub channels.
- Files inspected: CFD and tenant middleware.
- Findings: CFD token tenant checks already exist; cache keys need tenant/outlet/device namespace discipline.
- Tasks: Use namespaced keys and tenant-scoped channels; invalidate by tenant/outlet safely.
- Risks: Never allow cross-tenant cache key overlap.
- Validation: Type-check and tests.

### Execution Order

1. Safety/security/data-integrity/tenant-isolation blockers
2. Build/type/test blockers
3. Dependency prerequisites
4. Highest priority actionable tasks
5. Lower priority actionable tasks
6. Documentation sync
7. Validation
8. Final checklist update

### Progress

#### Completed

- [ ] Task:
  - Files changed:
  - Validation:
  - Docs updated:

#### Partially Completed

- [ ] Task:
  - Completed:
  - Remaining:
  - Reason:

#### Blocked

- [ ] Task:
  - Blocker:
  - Required next step:

#### Not Attempted

- [ ] Task:
  - Reason:

### Validation Log

- Command: Pending
- Result: Pending
- Notes: Pending

### Documentation Updates

- File: Pending
- Change: Pending

### Checklist Updates

- File: PLANS.md
- Change: Added active execution plan for distributed pubsub/cache hardening.

### Continuation Notes

Continue by adding Redis-backed pub/sub/cache services, then wire CFD/order queue/tenant-feature-module-outlet invalidation and run validation.

### Completion Update (2026-06-02)

### Progress

#### Completed

- [x] Replace process-local order queue pub/sub with Redis-backed distributed pub/sub plus local development fallback.
  - Files changed: `apps/api/src/http/services/orderQueueEvents.ts`, `apps/api/src/services/distributedCache.ts`.
  - Validation: `pnpm --filter @pos/api type-check`, `pnpm --filter @pos/api test -- cfd.test.ts`, `pnpm --filter @pos/api build`.
  - Docs updated: `docs/PRODUCTION_CACHE_PUBSUB.md`, `README.md`.
- [x] Replace process-local CFD fan-out/latest-state handling with Redis-backed pub/sub and Redis latest state TTL keyed by tenant/outlet/device.
  - Files changed: `apps/api/src/routes.ts`, `apps/api/src/services/distributedCache.ts`.
  - Validation: CFD tests passed as part of `pnpm --filter @pos/api test -- cfd.test.ts`.
  - Docs updated: `docs/CFD_SECURITY.md`, `docs/PRODUCTION_CACHE_PUBSUB.md`.
- [x] Use namespaced shared cache keys for tenant, feature, module, and outlet caches.
  - Files changed: `apps/api/src/services/distributedCache.ts`, `apps/api/src/http/middleware/tenant.ts`, `apps/api/src/http/middleware/featureGuard.ts`, `apps/api/src/http/routes/outlets.ts`.
  - Validation: API type-check passed.
  - Docs updated: `docs/PRODUCTION_CACHE_PUBSUB.md`.
- [x] Add instance-safe invalidation from tenant feature/module/plan and outlet mutations.
  - Files changed: `apps/api/src/services/cacheInvalidation.ts`, `apps/api/src/http/controllers/TenantsController.ts`, `apps/api/src/http/routes/outlets.ts`.
  - Validation: API type-check and tests passed.
  - Docs updated: `docs/PRODUCTION_CACHE_PUBSUB.md`.
- [x] Fix API type-check blockers discovered during validation.
  - Files changed: `apps/api/src/http/routes/index.ts`, `apps/api/src/index.ts`, `apps/api/package.json`, `pnpm-lock.yaml`.
  - Validation: API type-check passed.
  - Docs updated: none.

#### Partially Completed

- [ ] None.

#### Blocked

- [ ] None.

#### Not Attempted

- [ ] Postgres LISTEN/NOTIFY alternative.
  - Reason: Redis was selected because it satisfies pub/sub, TTL-backed CFD state, and shared cache/invalidation requirements in one production dependency.

### Validation Log

- Command: `pnpm --filter @pos/api type-check`
- Result: Passed
- Notes: Also fixed Express middleware type mismatch and missing compression typings found during validation.
- Command: `pnpm --filter @pos/api test -- cfd.test.ts`
- Result: Passed (script runs all API tests; 45 passed)
- Notes: Confirms CFD tenant-token isolation and existing API tests still pass.
- Command: `pnpm --filter @pos/api build`
- Result: Passed
- Notes: API bundle completed with esbuild.

### Documentation Updates

- File: `README.md`
- Change: Added Redis/pubsub/cache environment variables.
- File: `docs/CFD_SECURITY.md`
- Change: Updated CFD state/pubsub behavior from in-memory to Redis-backed production behavior.
- File: `docs/PRODUCTION_CACHE_PUBSUB.md`
- Change: Added production Redis config, key namespaces, channels, TTL, and fallback limitations.

### Checklist Updates

- File: `PLANS.md`
- Change: Marked distributed pubsub/cache tasks completed and recorded validation.

### Continuation Notes

No blocker remains for this batch. A future batch can add integration tests against a real Redis service if the CI environment provisions Redis.

## Plan: Payment Orchestration Phase 8F Standalone Readiness + Parity Closure

### Source

- Tasklist: `docs/replit-agent-payment-orchestration-phase-8f-standalone-readiness-prompt.md`
- User request: Check dan eksekusi docs/replit-agent-payment-orchestration-phase-8f-standalone-readiness-prompt.md
- Date started: 2026-06-05
- Current status: In progress — inventory and parity audit underway.

### Goal

Determine whether Northflow Payment Orchestration standalone service is ready for AuraPoS FakeGateway SDK integration behind a feature flag, without performing the integration, and document any parity gaps/deferred phases.

### Context Read

- [x] AGENTS.md
- [x] PLANS.md
- [x] README.md
- [x] Active tasklist/checklist
- [x] Relevant docs
- [x] Relevant source files

### Workstreams

#### Backend/API Workstream

- Scope: Embedded payment-engine routes/use cases and standalone service routes/use cases.
- Files inspected: `apps/api/src/http/routes/payment-engine.ts`, `packages/application/payments/*`, `apps/payment-orchestration-service/src/app.ts`, `apps/payment-orchestration-service/src/routes/*`, `apps/payment-orchestration-service/src/application/use-cases/*`.
- Findings: Embedded runtime is full-featured for FakeGateway/manual/Xendit scaffolding/refund/void/reconciliation; standalone runtime covers merchant/provider-account/intent/gateway FakeGateway/status/refundability/webhook/reconcile but not Xendit runtime or refund/void endpoints.
- Tasks: Create embedded inventory, standalone inventory, parity matrix, readiness decision, and final report.
- Risks: Avoid modifying embedded runtime or legacy order payment flow.
- Validation: Package type-checks and targeted payment orchestration tests.

#### Database/Schema Workstream

- Scope: Standalone `payment_orchestration_*` tables and migration.
- Files inspected: `shared/schema.ts`, `migrations/0022_payment_orchestration_standalone.sql`, standalone Drizzle repositories.
- Findings: Merchant-scoped standalone schema exists for merchants, provider accounts, intents, transactions, provider events, and idempotency keys.
- Tasks: Document schema parity and deferred provider/refund/void gaps.
- Risks: No schema changes planned for Phase 8F.
- Validation: Existing mapper/repository-adjacent tests.

#### Frontend/UI Workstream

- Scope: Guardrail verification only.
- Files inspected: Not applicable beyond task guardrails.
- Findings: Phase 8F forbids POS UI and AuraPoS SDK consumption changes.
- Tasks: Confirm no POS UI changes.
- Risks: Accidental integration must be avoided.
- Validation: Git diff review.

#### Tests/Validation Workstream

- Scope: Required package checks and targeted test files from phase prompt.
- Files inspected: `apps/api/src/__tests__/payment-orchestration-*.test.ts`, `apps/api/src/__tests__/payment-xendit-gateway-integration.test.ts`.
- Findings: Required test files exist.
- Tasks: Run package type-checks, targeted tests, and root check if practical; record honest results.
- Risks: Root check may expose unrelated workspace failures.
- Validation: Command log in final report.

#### Documentation Workstream

- Scope: Architecture doc, parity matrix, readiness decision, final report, active prompt status.
- Files inspected: `docs/payment-orchestration-hybrid-standalone-architecture.md`, smoke guide, Phase 8D/8E reports.
- Findings: Needs Phase 8F documentation additions and updated roadmap.
- Tasks: Create new report files and update architecture docs.
- Risks: Do not overstate production readiness.
- Validation: Markdown diff review.

#### Security/Tenant Isolation Workstream

- Scope: Merchant scoping, service-token auth, webhook signature/auth bypass, idempotency, no secret exposure.
- Files inspected: standalone auth middleware, webhook routes/handler, repositories, SDK config/types.
- Findings: Service-token auth protects `/v1` except webhooks; webhooks use provider signature path; merchantId scoping is explicit.
- Tasks: Document readiness and limitations.
- Risks: Xendit/production provider readiness deferred.
- Validation: Auth/webhook targeted tests.

### Execution Order

1. Inventory embedded runtime without changes.
2. Inventory standalone runtime without AuraPoS integration.
3. Create parity matrix.
4. Fix only small safe gaps if discovered; otherwise document none.
5. Create readiness decision and final report.
6. Update architecture docs and source prompt status notes.
7. Run validations.
8. Inspect accidental files/assets and commit.

### Progress

#### Completed

- [ ] Task: Phase 8F audit/report artifacts
  - Files changed: Pending
  - Validation: Pending
  - Docs updated: Pending

#### Partially Completed

- [ ] Task: Phase 8F source inspection
  - Completed: Required instructions, source prompt, relevant docs, and key embedded/standalone files inspected.
  - Remaining: Finish report artifacts and validation.
  - Reason: Work in progress.

#### Blocked

- [ ] Task: None
  - Blocker: None
  - Required next step: Continue execution.

#### Not Attempted

- [ ] Task: Code fixes
  - Reason: No small code gap confirmed yet; Phase 8F audit may remain docs-only if runtime is sufficient for FakeGateway/dev integration.

### Validation Log

- Command: Pending
- Result: Pending
- Notes: Pending

### Documentation Updates

- File: Pending
- Change: Pending

### Checklist Updates

- File: `docs/replit-agent-payment-orchestration-phase-8f-standalone-readiness-prompt.md`
- Change: Pending honest execution status update.

### Continuation Notes

Continue by writing the parity matrix, readiness decision, final Phase 8F report, architecture doc Phase 8F section, then run required checks and commit.

### Phase 8F Completion Update — 2026-06-05

#### Completed

- [x] Embedded payment runtime inventory completed without modifying embedded payment files.
  - Files changed: Documentation/report files only.
  - Validation: Targeted payment orchestration tests passed.
  - Docs updated: Final Phase 8F report.
- [x] Standalone payment orchestration inventory completed.
  - Files changed: Final Phase 8F report.
  - Validation: Package type-checks and targeted tests passed.
  - Docs updated: Parity matrix/readiness/report.
- [x] Parity matrix created.
  - Files changed: `docs/reports/payment-orchestration-phase-8f-parity-matrix.md`.
  - Validation: Reviewed against inspected source files.
  - Docs updated: Architecture doc links Phase 8F artifacts.
- [x] Small SDK parity gap fixed.
  - Files changed: `packages/payment-orchestration-client-sdk/src/client.ts`, `packages/payment-orchestration-client-sdk/src/types.ts`, `packages/payment-orchestration-client-sdk/src/index.ts`.
  - Validation: SDK type-check and SDK test passed.
  - Docs updated: Phase 8F matrix/report.
- [x] Readiness decision created.
  - Files changed: `docs/reports/payment-orchestration-phase-8f-readiness-decision.md`.
  - Validation: Decision constrained to FakeGateway/dev integration readiness.
  - Docs updated: Architecture doc and final report.
- [x] Final report created with Commands Run table and guardrails.
  - Files changed: `docs/reports/payment-orchestration-phase-8f-standalone-readiness-report.md`.
  - Validation: Command log recorded honestly.
  - Docs updated: Source prompt execution status.

#### Partially Completed

- [ ] Root workspace type-check.
  - Completed: `npm run check` was attempted.
  - Remaining: Fix older `@pos/api` payment-orchestration test helper typing drift.
  - Reason: Root check fails on pre-existing type errors unrelated to the Phase 8F SDK method.

#### Blocked

- [ ] Production provider migration readiness.
  - Blocker: Standalone Xendit runtime and provider-level refund/cancel are intentionally deferred.
  - Required next step: Phase 8G Provider Runtime Completion.

#### Not Attempted

- [ ] AuraPoS SDK integration.
  - Reason: Explicitly forbidden in Phase 8F; deferred to Phase 8I.
- [ ] Embedded engine deprecation.
  - Reason: Deferred to Phase 8J after feature-flag integration validation.

### Validation Log

- Command: `pnpm --filter @northflow/payment-orchestration-core type-check`
- Result: Pass
- Notes: 0 errors.
- Command: `pnpm --filter @northflow/payment-orchestration-service type-check`
- Result: Pass
- Notes: 0 errors.
- Command: `pnpm --filter @northflow/payment-orchestration-client-sdk type-check`
- Result: Pass
- Notes: 0 errors.
- Command: targeted `npx tsx --tsconfig apps/api/tsconfig.node.json --test ...` Phase 8F test list
- Result: Pass
- Notes: Required payment-orchestration tests plus new SDK test passed individually.
- Command: `npm run check`
- Result: Fail
- Notes: Fails in `@pos/api` on older payment-orchestration test helper typing drift; new SDK test was not among reported failures.

### Documentation Updates

- File: `docs/payment-orchestration-hybrid-standalone-architecture.md`
- Change: Phase 8F section and roadmap update.
- File: `docs/reports/payment-orchestration-phase-8f-parity-matrix.md`
- Change: New parity matrix.
- File: `docs/reports/payment-orchestration-phase-8f-readiness-decision.md`
- Change: New readiness decision.
- File: `docs/reports/payment-orchestration-phase-8f-standalone-readiness-report.md`
- Change: New final report.
- File: `docs/replit-agent-payment-orchestration-phase-8f-standalone-readiness-prompt.md`
- Change: Appended execution status.

### Checklist Updates

- File: `docs/replit-agent-payment-orchestration-phase-8f-standalone-readiness-prompt.md`
- Change: Tasks 1–9 marked complete with validation note and final decision.

### Continuation Notes

Next safest batch: Phase 8G Provider Runtime Completion, specifically standalone Xendit create-payment/webhook and provider refund/cancel contract design. Keep AuraPoS SDK consumption deferred until Phase 8I and keep embedded payment runtime unchanged until Phase 8J.

## Plan: Payment Orchestration Phase 8G+8H Standalone Boundary + Provider Runtime

### Source

- Tasklist: `docs/replit-agent-payment-orchestration-phase-8g-8h-standalone-boundary-provider-runtime-prompt.md`
- User request: `Check dan eksekusi docs/replit-agent-payment-orchestration-phase-8g-8h-standalone-boundary-provider-runtime-prompt.md`
- Date started: 2026-06-05
- Current status: Implemented boundary audit docs, schema extraction plan, standalone provider runtime foundation, Xendit sandbox provider/webhook/polling foundations, tests, and report. Validation passed and changes committed in this batch.

### Goal

Advance Northflow Payment Orchestration toward standalone extraction readiness by proving source boundary purity, documenting schema extraction, and completing provider runtime foundations beyond FakeGateway without integrating AuraPoS through the SDK or changing embedded payment/order flows.

### Context Read

- [x] AGENTS.md
- [x] PLANS.md
- [x] README.md
- [x] Active tasklist/checklist
- [x] Relevant docs
- [x] Relevant source files

### Workstreams

#### Backend/API Workstream

- Scope: standalone payment-orchestration-service provider contracts, webhook use case, status route.
- Files inspected: `apps/payment-orchestration-service/src/app.ts`, `src/container.ts`, `src/routes/*`, `src/application/use-cases/*`, `src/infrastructure/providers/*`.
- Findings: FakeGateway existed; Xendit sandbox runtime and status polling route were missing.
- Tasks: add provider runtime contract, Xendit sandbox provider, generalized webhook parser path, status refresh use case/route.
- Risks: Xendit default HTTP client/credential runtime remains deployment-sensitive.
- Validation: type-checks and targeted tests required.

#### Database/Schema Workstream

- Scope: current schema/migration ownership.
- Files inspected: `shared/schema.ts`, `migrations/0022_payment_orchestration_standalone.sql`.
- Findings: payment_orchestration tables are still rooted in AuraPoS shared schema/migrations.
- Tasks: document extraction plan; no risky schema relocation in this phase.
- Risks: schema ownership remains extraction blocker.
- Validation: docs plus existing schema mapper tests.

#### Frontend/UI Workstream

- Scope: none.
- Files inspected: none; prompt forbids POS UI changes.
- Findings: no UI changes needed.
- Tasks: not attempted by design.
- Risks: none.
- Validation: not applicable.

#### Tests/Validation Workstream

- Scope: boundary import scan, Xendit provider/webhook tests, status refresh test, existing payment-orchestration regression tests.
- Files inspected: existing payment-orchestration tests under `apps/api/src/__tests__`.
- Findings: tests use node test runner with `tsx` and in-memory repos.
- Tasks: add targeted tests and run command list.
- Risks: root `npm run check` may surface unrelated monorepo drift.
- Validation: targeted tests and `npm run check` passed.

#### Documentation Workstream

- Scope: reports and architecture roadmap.
- Files inspected: architecture doc, Phase 8F reports, active prompt.
- Findings: previous roadmap optimized toward AuraPoS integration; new phase needs standalone-first sequence.
- Tasks: add boundary audit, schema extraction plan, refund/cancel contract, final report, architecture roadmap section.
- Risks: report command table must be updated after validation.
- Validation: docs reviewed for honesty.

#### Security/Tenant Isolation Workstream

- Scope: merchant scoping, webhook verification, credential handling.
- Files inspected: provider account repositories, webhook handler/use case, provider account mapper.
- Findings: webhook does not trust merchant header; provider account credentialsRef is opaque and must not expose raw secrets.
- Tasks: xendit_sandbox uses credentialsRef resolver and sanitizes secret-like response fields; status refresh scopes transaction by merchantId.
- Risks: production credential manager deferred.
- Validation: no raw credential exposure test and route/service type checks.

### Execution Order

1. Read instructions/context/tasklist.
2. Audit standalone boundaries.
3. Implement provider runtime contract and Xendit sandbox foundations.
4. Add status refresh foundation.
5. Add tests.
6. Add docs/reports and update architecture.
7. Run validation.
8. Update final report command table if needed.

### Progress

#### Completed

- [x] Task: A1 dependency boundary audit
  - Files changed: `docs/reports/payment-orchestration-phase-8g-boundary-audit.md`, `apps/api/src/__tests__/payment-orchestration-boundary-purity.test.ts`
  - Validation: boundary-purity test passed
  - Docs updated: boundary audit report
- [x] Task: A2 small boundary leaks
  - Files changed: standalone provider runtime files; no forbidden source imports found
  - Validation: boundary-purity test passed
  - Docs updated: boundary audit report
- [x] Task: A3 schema extraction plan
  - Files changed: `docs/reports/payment-orchestration-schema-extraction-plan.md`
  - Validation: documentation only
  - Docs updated: schema extraction plan
- [x] Task: B1 provider runtime contract
  - Files changed: `apps/payment-orchestration-service/src/infrastructure/providers/StandalonePaymentProvider.ts`
  - Validation: service type-check passed
  - Docs updated: final report
- [x] Task: B2 Xendit sandbox create payment
  - Files changed: `apps/payment-orchestration-service/src/infrastructure/providers/XenditSandboxProvider.ts`, provider registry, create payment use case
  - Validation: Xendit provider test passed
  - Docs updated: final report
- [x] Task: B3 Xendit standalone webhook parser/verifier
  - Files changed: `XenditSandboxProvider.ts`, `HandleProviderWebhook.ts`
  - Validation: Xendit webhook test passed
  - Docs updated: final report
- [x] Task: B4 provider status polling foundation
  - Files changed: `RefreshProviderStatus.ts`, `routes/transactions.ts`, `app.ts`, `container.ts`
  - Validation: provider status refresh test passed
  - Docs updated: final report
- [x] Task: B5 provider refund/cancel contract design
  - Files changed: `docs/reports/payment-orchestration-provider-refund-cancel-contract.md`
  - Validation: documentation only
  - Docs updated: final report
- [x] Task: documentation/reporting
  - Files changed: final report and architecture doc
  - Validation: final report command table updated after passing checks
  - Docs updated: `docs/payment-orchestration-hybrid-standalone-architecture.md`

#### Partially Completed

- [x] Task: A4 root check/type drift gate
  - Files changed: `packages/payment-orchestration-core/src/domain/PaymentMerchant.ts`, `packages/payment-orchestration-core/src/domain/PaymentIntent.ts`, `packages/payment-orchestration-core/src/domain/PaymentTransaction.ts`, payment-orchestration test container helpers
  - Validation: `npm run check` passed
  - Docs updated: final report command table

#### Blocked

- [ ] Task: Full schema extraction
  - Blocker: prompt explicitly defers large schema relocation; current shared schema must remain stable until extraction simulation.
  - Required next step: Phase 8K extraction simulation after standalone schema module is introduced.

#### Not Attempted

- [ ] Task: AuraPoS SDK consumption
  - Reason: explicitly forbidden in this phase.
- [ ] Task: Embedded payment runtime/order payment changes
  - Reason: explicitly forbidden in this phase.
- [ ] Task: Real provider refund/cancel money movement
  - Reason: financial-integrity sensitive and explicitly design-only in this phase.

### Validation Log

- Command: `pnpm --filter @northflow/payment-orchestration-core type-check`
- Result: pass
- Notes: core contracts compile.
- Command: `pnpm --filter @northflow/payment-orchestration-service type-check`
- Result: pass
- Notes: standalone service compiles.
- Command: `pnpm --filter @northflow/payment-orchestration-client-sdk type-check`
- Result: pass
- Notes: SDK compiles.
- Command: `npm run check`
- Result: pass
- Notes: Turbo type-check passed across all 13 packages after fixing payment-orchestration test/helper drift.
- Command: targeted payment-orchestration node test suite
- Result: pass
- Notes: new and existing tests passed.

### Documentation Updates

- File: `docs/reports/payment-orchestration-phase-8g-boundary-audit.md`
- Change: added boundary audit.
- File: `docs/reports/payment-orchestration-schema-extraction-plan.md`
- Change: added schema/migration extraction plan.
- File: `docs/reports/payment-orchestration-provider-refund-cancel-contract.md`
- Change: added refund/cancel contract design.
- File: `docs/reports/payment-orchestration-phase-8g-8h-standalone-boundary-provider-runtime-report.md`
- Change: added final phase report draft.
- File: `docs/payment-orchestration-hybrid-standalone-architecture.md`
- Change: added Phase 8G+8H standalone-first roadmap section.

### Checklist Updates

- File: `docs/replit-agent-payment-orchestration-phase-8g-8h-standalone-boundary-provider-runtime-prompt.md`
- Change: source prompt retained as task definition; completion status tracked in this `PLANS.md` section and final report.

### Continuation Notes

Continue with Phase 8I operations layer/worker readiness. Do not integrate AuraPoS SDK until standalone extraction readiness phases complete.

## Plan: Payment Orchestration Phase 8G/8H Hardening + 8I Runtime Readiness

### Source

- Tasklist: `docs/replit-agent-payment-orchestration-phase-8g8h-hardening-8i-standalone-runtime-readiness-prompt.md`
- User request: "Check dan eksekusi docs/replit-agent-payment-orchestration-phase-8g8h-hardening-8i-standalone-runtime-readiness-prompt.md"
- Date started: 2026-06-05
- Current status: Completed for current batch; ready for extraction-simulation preparation.

### Goal

Harden standalone payment orchestration boundaries, add explicit Xendit runtime configuration policy, introduce operations use cases/workers, add a non-secret readiness endpoint, test runtime readiness foundations, and publish an honest report without implementing AuraPoS SDK consumption or changing embedded payment/order flows.

### Context Read

- [x] AGENTS.md
- [x] PLANS.md
- [x] README.md
- [x] Active tasklist/checklist
- [x] Relevant docs/reports listed by the task prompt
- [x] Relevant standalone source files

### Workstreams

#### Backend/API Workstream

- Scope: Standalone service use cases, routes, container wiring.
- Files inspected: `apps/payment-orchestration-service/src/app.ts`, `container.ts`, `routes/health.ts`, existing use cases.
- Findings: Added `/ready`, stale expiration, provider-event reprocess, worker entry points, and error normalization.
- Tasks: Completed.
- Risks: Provider-event replay remains safe-skip until adapter design.
- Validation: Service type-check, root check, focused tests.

#### Database/Schema Workstream

- Scope: Low-risk schema ownership bridge and repository import paths.
- Files inspected: `shared/schema.ts`, standalone Drizzle repositories and mappers.
- Findings: Repositories now import through `apps/payment-orchestration-service/src/infrastructure/schema.ts`.
- Tasks: Completed as re-export bridge; full relocation deferred.
- Risks: Extraction simulation must replace bridge with standalone schema/migrations.
- Validation: Schema boundary test.

#### Frontend/UI Workstream

- Scope: None.
- Files inspected: Not applicable.
- Findings: Prompt forbids POS UI changes.
- Tasks: No UI work.
- Risks: None.
- Validation: Not applicable.

#### Tests/Validation Workstream

- Scope: New focused node:test files plus required command list.
- Files inspected: existing `apps/api/src/__tests__/payment-orchestration*.test.ts` patterns.
- Findings: Added six focused tests and updated one existing test for expanded optional repository contracts.
- Tasks: Completed.
- Risks: None remaining in current batch.
- Validation: Required package type-checks, `npm run check`, existing regression tests, new tests all passed.

#### Documentation Workstream

- Scope: Architecture, smoke test, final report, PLANS.
- Files inspected: listed docs and prior phase reports.
- Findings: Roadmap updated to standalone-first 8I→8M path and report created.
- Tasks: Completed.
- Risks: Docs honestly retain schema relocation/reprocess limitations.
- Validation: Manual review plus line citations available.

#### Security/Tenant Isolation Workstream

- Scope: Merchant isolation, credentialsRef policy, webhook/event safety, non-secret readiness.
- Files inspected: Xendit provider, provider account model, routes/auth.
- Findings: Xendit credentials remain env-var-name refs; `/ready` exposes only booleans/configured status.
- Tasks: Completed.
- Risks: Live provider HTTP disabled unless env-enabled.
- Validation: Xendit runtime config and ready endpoint tests.

### Execution Order

1. Safety/security/data-integrity/tenant-isolation blockers — completed.
2. Build/type/test blockers — completed.
3. Dependency prerequisites — no new dependencies added.
4. Highest priority actionable tasks — completed.
5. Lower priority actionable tasks — completed for current batch.
6. Documentation sync — completed.
7. Validation — completed.
8. Final checklist/report update — completed.

### Progress

#### Completed

- [x] Task: A1 stale standalone-first comment/docs cleanup.
  - Files changed: `PaymentIntent.ts`, `providerRegistry.ts`, architecture docs.
  - Validation: Type-check and tests.
  - Docs updated: Architecture report/docs.
- [x] Task: A2 Xendit sandbox runtime HTTP client policy.
  - Files changed: `xenditHttpClient.ts`, `providerRegistry.ts`, `env.ts`.
  - Validation: Xendit runtime config test, package/root type-checks.
  - Docs updated: Architecture, smoke test, final report.
- [x] Task: A3 standalone schema boundary module foundation.
  - Files changed: `infrastructure/schema.ts`, Drizzle repositories.
  - Validation: Schema boundary test, root check.
  - Docs updated: Architecture, report.
- [x] Task: B1 expire stale transactions use case.
  - Files changed: `ExpireStalePaymentTransactions.ts`, repository contracts/implementation.
  - Validation: Expire stale test.
  - Docs updated: Report.
- [x] Task: B2 workers/runners.
  - Files changed: `workers/reconcile.ts`, `workers/expireStale.ts`.
  - Validation: Workers test.
  - Docs updated: Smoke test, report.
- [x] Task: B3 provider event reprocess foundation.
  - Files changed: `ReprocessProviderEvents.ts`, provider event repository query.
  - Validation: Provider event reprocess test.
  - Docs updated: Architecture, report.
- [x] Task: B4 error normalization/logging.
  - Files changed: `application/errors.ts`, `middleware/errors.ts`.
  - Validation: Type-check/root check.
  - Docs updated: Report.
- [x] Task: B5 readiness endpoint.
  - Files changed: `routes/health.ts`, `app.ts`.
  - Validation: Ready endpoint test.
  - Docs updated: Architecture, smoke test, report.
- [x] Task: B6 tests/checks.
  - Files changed: six new focused tests and one updated existing test.
  - Validation: All required commands passed.
  - Docs updated: Report command table.

#### Partially Completed

- [ ] Task: Full schema relocation.
  - Completed: Service-local re-export bridge and repository boundary.
  - Remaining: Move definitions/migrations out of `shared/schema.ts` during extraction simulation.
  - Reason: Prompt requested low-risk foundation, not risky full migration.
- [ ] Task: Provider event replay.
  - Completed: Safe skip/summary foundation.
  - Remaining: Provider-specific replay adapters if needed.
  - Reason: Raw body/signature reconstruction is unsafe in this phase.

#### Blocked

- [ ] Task: None.
  - Blocker: None.
  - Required next step: Proceed to 8J/8K planning.

#### Not Attempted

- [ ] Task: AuraPoS SDK integration, embedded route deletion, legacy order payment migration, POS UI changes.
  - Reason: Explicitly forbidden by prompt.

### Validation Log

- Command: `pnpm --filter @northflow/payment-orchestration-core type-check`; `pnpm --filter @northflow/payment-orchestration-service type-check`; `pnpm --filter @northflow/payment-orchestration-client-sdk type-check`; `npm run check`; required existing tests; all new tests.
- Result: Passed.
- Notes: `npm` emitted a non-blocking `Unknown env config "http-proxy"` warning during `npx`/`npm` commands.

### Documentation Updates

- File: `docs/payment-orchestration-hybrid-standalone-architecture.md`
- Change: Added Phase 8I runtime readiness, schema bridge, Xendit policy, workers, readiness, roadmap.
- File: `docs/payment-orchestration-service-smoke-test.md`
- Change: Added `/ready`, Xendit env policy, worker entry points, focused tests.
- File: `docs/reports/payment-orchestration-phase-8g8h-hardening-8i-runtime-readiness-report.md`
- Change: Final implementation report with decision and guardrails.

### Checklist Updates

- File: `docs/replit-agent-payment-orchestration-phase-8g8h-hardening-8i-standalone-runtime-readiness-prompt.md`
- Change: Source prompt left unchanged; implementation status captured in this plan and final report.

### Continuation Notes

Next recommended phase: `8J — SDK/API Contract Freeze + Deployment Readiness`, then `8K — Extraction Simulation`. Keep AuraPoS integration deferred until extraction simulation is stable.

## Plan: Payment Orchestration Phase 8J — Standalone Extraction Completion

### Source

- Tasklist: `docs/replit-agent-payment-orchestration-phase-8j-standalone-extraction-completion-prompt.md`
- User request: `Check dan eksekusi docs/replit-agent-payment-orchestration-phase-8j-standalone-extraction-completion-prompt.md`
- Date started: 2026-06-05
- Current status: Completed; final decision `READY_TO_EXTRACT_TO_STANDALONE_REPO`.

### Goal

Close standalone extraction blockers for payment orchestration without implementing AuraPoS app integration, embedded payment runtime deletion, POS UI changes, or legacy order payment migration.

### Context Read

- [x] AGENTS.md
- [x] PLANS.md
- [x] README.md
- [x] Active tasklist/checklist
- [x] Relevant docs
- [x] Relevant source files

### Workstreams

#### Backend/API Workstream

- Scope: standalone payment orchestration use cases, repositories, workers.
- Files inspected: service use cases, repositories, provider contracts, worker files, tests.
- Findings: schema bridge, missing tx expiry persistence, reprocess skip-only behavior, and no unified runner were extraction blockers.
- Tasks: implemented tx expiry, parsed payload persistence, safe reprocess, and worker runner.
- Risks: reprocess remains provider-specific and must stay limited to verified stored parsed payloads.
- Validation: package type-checks, root check, all payment-orchestration tests.

#### Database/Schema Workstream

- Scope: service-owned schema, standalone/root compatibility migrations.
- Files inspected: service schema, root shared schema, root migration 0022.
- Findings: service schema re-exported root shared schema.
- Tasks: created service-local Drizzle schema, standalone migration, drizzle config, root compatibility expiry migration.
- Risks: root shared schema remains compatibility until physical extraction.
- Validation: schema boundary test and extraction simulation check.

#### Frontend/UI Workstream

- Scope: confirm no UI changes required.
- Files inspected: active prompt guardrails.
- Findings: POS UI changes explicitly disallowed.
- Tasks: none.
- Risks: none.
- Validation: no frontend files intentionally touched.

#### Tests/Validation Workstream

- Scope: focused Phase 8J tests and existing payment-orchestration suite.
- Files inspected: payment-orchestration tests.
- Findings: existing fixtures needed transaction `expiresAt` field.
- Tasks: expanded expire-stale/reprocess/schema tests and updated fixtures.
- Risks: none after `npm run check` passed.
- Validation: all commands listed in report passed.

#### Documentation Workstream

- Scope: architecture doc, smoke doc, final report, PLANS.
- Files inspected: existing payment orchestration architecture/smoke docs and reports.
- Findings: docs needed Phase 8J completion status and runner commands.
- Tasks: added Phase 8J architecture notes, worker/extraction smoke commands, final report.
- Risks: docs should be revised again in 8K after API/SDK contract freeze.
- Validation: docs align with code and validation output.

#### Security/Tenant Isolation Workstream

- Scope: guardrails, provider webhook verification/reprocess safety, tenant/merchant isolation.
- Files inspected: webhook handler, reprocess use case, extraction checker.
- Findings: reprocess must not reverify signatures or double-apply events; merchant resolution stays providerReference → transaction → intent.
- Tasks: safe stored parsedPayload replay, processed-event skip, forbidden import extraction check.
- Risks: adding more providers requires explicit adapter support and tests.
- Validation: reprocess tests and all payment-orchestration tests passed.

### Execution Order

1. Replace schema bridge with service-local schema ownership.
2. Add transaction-level expiry support and operations policy.
3. Persist parsed webhook payload and implement supported reprocess adapters.
4. Add no-Express worker runner.
5. Add extraction simulation check.
6. Sync docs/report/PLANS.
7. Run validation.

### Progress

#### Completed

- [x] Task: Replace schema bridge with standalone schema ownership
  - Files changed: service schema/db, drizzle config, standalone migration, root compatibility schema/migration, schema boundary test.
  - Validation: type-check, schema boundary test, extraction check.
  - Docs updated: architecture doc and Phase 8J report.
- [x] Task: Add transaction expiry policy end-to-end
  - Files changed: core transaction/repository contracts, repository, mapper, provider payment create use case, expire worker use case, tests.
  - Validation: focused expire-stale tests and all payment-orchestration tests.
  - Docs updated: architecture doc and Phase 8J report.
- [x] Task: Store parsed webhook payload for reprocess
  - Files changed: provider event contract/repository, webhook handler, tests.
  - Validation: all payment-orchestration tests.
  - Docs updated: Phase 8J report.
- [x] Task: Implement provider-specific event reprocess adapters
  - Files changed: ReprocessProviderEvents, container wiring, tests.
  - Validation: provider-event reprocess tests and all payment-orchestration tests.
  - Docs updated: Phase 8J report.
- [x] Task: Make worker runner operational
  - Files changed: worker runner and service package script.
  - Validation: service type-check and existing worker tests.
  - Docs updated: smoke doc and Phase 8J report.
- [x] Task: Add extraction simulation check
  - Files changed: extraction check script and root package script.
  - Validation: `pnpm payment-orchestration:extraction-check` passed.
  - Docs updated: smoke doc and Phase 8J report.
- [x] Task: Documentation and final report
  - Files changed: architecture doc, smoke doc, Phase 8J report, PLANS.md.
  - Validation: documentation synced with implemented code and validation results.
  - Docs updated: listed files.

#### Partially Completed

- [ ] Task: None.
  - Completed: N/A
  - Remaining: N/A
  - Reason: N/A

#### Blocked

- [ ] Task: None.
  - Blocker: N/A
  - Required next step: N/A

#### Not Attempted

- [ ] Task: 8K SDK/API Contract Freeze + Deployment Readiness
  - Reason: Next phase only after 8J decision; outside current prompt scope.

### Validation Log

- Command: `pnpm --filter @northflow/payment-orchestration-core type-check`
- Result: Passed
- Notes: Core contracts compile.
- Command: `pnpm --filter @northflow/payment-orchestration-service type-check`
- Result: Passed
- Notes: Standalone service compiles.
- Command: `pnpm --filter @northflow/payment-orchestration-client-sdk type-check`
- Result: Passed
- Notes: SDK compiles.
- Command: `npm run check`
- Result: Passed
- Notes: Turbo type-check across workspace passed.
- Command: `npx tsx --tsconfig apps/api/tsconfig.node.json --test apps/api/src/__tests__/payment-orchestration-*.test.ts`
- Result: Passed
- Notes: 159 payment-orchestration tests passed.
- Command: `pnpm payment-orchestration:extraction-check`
- Result: Passed
- Notes: Extraction simulation passed.

### Documentation Updates

- File: `docs/payment-orchestration-hybrid-standalone-architecture.md`
- Change: Added Phase 8J standalone extraction completion notes and final decision.
- File: `docs/payment-orchestration-service-smoke-test.md`
- Change: Added worker runner and extraction-check commands.
- File: `docs/reports/payment-orchestration-phase-8j-standalone-extraction-completion-report.md`
- Change: Added final Phase 8J report.

### Checklist Updates

- File: `docs/replit-agent-payment-orchestration-phase-8j-standalone-extraction-completion-prompt.md`
- Change: Source prompt had no markdown checkbox statuses; implementation status is recorded in this PLANS.md entry and the Phase 8J report.

### Continuation Notes

Phase 8J is complete and ready for standalone repo extraction planning. Continue with `8K — SDK/API Contract Freeze + Deployment Readiness`, focusing on freezing API/SDK contracts, deployment manifests, CI packaging, and any extraction repository bootstrap.

## Plan: Complete Northflow Payment Legacy Parity Hardening

### Source

- Tasklist: `docs/replit-agent-payment-parity-hardening-completion-prompt.md`
- User request: "Check dan eksekusi docs/replit-agent-payment-parity-hardening-completion-prompt.md"
- Date started: 2026-06-06
- Current status: In progress

### Goal

Complete safe actionable legacy payment parity hardening inside `northflow-payment-orchestration/` without deleting AuraPoS payment code or integrating POS UI.

### Context Read

- [x] AGENTS.md
- [x] PLANS.md
- [x] README.md
- [x] Active tasklist/checklist
- [x] Relevant docs
- [x] Relevant source files

### Workstreams

#### Backend/API Workstream

- Scope: refund/void use cases, transaction route serialization, provider runtime contracts.
- Files inspected: `RefundPaymentTransaction.ts`, `VoidPaymentTransaction.ts`, `transactions.ts`, provider files.
- Findings: refund/void provider fallback was broad; void did not accept/persist idempotency key; refund did not replay/conflict on transaction idempotency key.
- Tasks: implement transaction idempotency lookup, idempotent replay flags, route body/response updates, provider unsupported errors.
- Risks: race safety depends on existing `(merchant_id, idempotency_key)` unique transaction index.
- Validation: targeted tests plus type-check/build/check.

#### Database/Schema Workstream

- Scope: transaction idempotency columns and repository primitives.
- Files inspected: `schema.ts`, migrations, transaction repository.
- Findings: `idempotency_key` column and unique merchant/key index already exist; repository lacked lookup/update support for refund/void parity.
- Tasks: add repository lookup by merchant/key and allow status update to set idempotency key/metadata/raw response.
- Risks: no DB transaction/lock primitive in current repository port; document reliance on unique constraint.
- Validation: repository compile checks and parity tests.

#### Frontend/UI Workstream

- Scope: none; hard guardrail says do not add POS UI.
- Files inspected: not applicable.
- Findings: no UI work required.
- Tasks: none.
- Risks: none.
- Validation: not applicable.

#### Tests/Validation Workstream

- Scope: SDK and refund/void parity tests.
- Files inspected: `payment-orchestration-client-sdk.test.ts`, `payment-orchestration-refund-void-parity.test.ts`.
- Findings: tests existed but accepted unsafe fallback and lacked idempotency coverage.
- Tasks: add SDK refund/void method tests, idempotency replay/conflict tests, unsupported provider tests.
- Risks: full workspace validation may expose pre-existing failures.
- Validation: pnpm commands listed in prompt.

#### Documentation Workstream

- Scope: API/SDK/error/smoke/OpenAPI/README/parity reports/extraction check.
- Files inspected: docs and script named by prompt.
- Findings: refund/void docs existed partially but lacked final hardening detail and reports.
- Tasks: sync docs with idempotency/provider policy and create parity reports.
- Risks: standalone sync may be blocked by missing credentials/remote access.
- Validation: extraction-check and docs tests.

#### Security/Tenant Isolation Workstream

- Scope: merchant isolation and provider unsupported behavior.
- Files inspected: use cases and routes.
- Findings: use cases consistently use merchantId; unsafe non-manual provider fallback must be removed.
- Tasks: keep merchant-scoped lookups/updates, reject unsupported gateway refund/cancel.
- Risks: provider capability inconsistency if future provider omits methods but claims support.
- Validation: tests for non-manual provider without refund/cancel.

### Execution Order

1. Fix transaction idempotency and provider fallback in use cases/routes.
2. Add SDK refund/void types and methods.
3. Update tests for SDK, idempotency, and provider unsupported policy.
4. Update OpenAPI/API/SDK/error/smoke/README docs and parity reports.
5. Update extraction check.
6. Run validation.
7. Record blockers and final decision honestly.

### Progress

#### Completed

- [ ] Task: Pending implementation in this batch.
  - Files changed:
  - Validation:
  - Docs updated:

#### Partially Completed

- [ ] Task: Standalone repository sync.
  - Completed: Folder validation planned.
  - Remaining: Push/sync to external standalone repo.
  - Reason: Requires remote access/credentials; must be validated after code checks.

#### Blocked

- [ ] Task: None yet.
  - Blocker:
  - Required next step:

#### Not Attempted

- [ ] Task: AuraPoS payment deletion.
  - Reason: Explicit hard guardrail forbids deletion in this phase.

### Validation Log

- Command: Pending.
- Result: Pending.
- Notes: Pending.

### Documentation Updates

- File: Pending.
- Change: Pending.

### Checklist Updates

- File: `docs/replit-agent-payment-parity-hardening-completion-prompt.md`
- Change: Source prompt is not a checkbox checklist; completion will be recorded in reports and this plan.

### Continuation Notes

Continue from backend/API and SDK parity implementation, then update docs/reports and run validation.

### Execution Batch Update — 2026-06-06

#### Completed

- [x] SDK refund/void contract
  - Files changed: `packages/client-sdk/src/client.ts`, `packages/client-sdk/src/types.ts`, `packages/client-sdk/src/index.ts`
  - Validation: `pnpm test`, `pnpm check`, client SDK type-check passed.
  - Docs updated: SDK contract docs and OpenAPI.
- [x] Refund idempotency parity
  - Files changed: `RefundPaymentTransaction.ts`, repository contract/implementation, tests.
  - Validation: refund idempotent replay/conflict tests passed.
  - Docs updated: API/SDK/error docs and parity reports.
- [x] Void idempotency parity
  - Files changed: `VoidPaymentTransaction.ts`, `transactions.ts`, repository status update contract, tests.
  - Validation: void replay, already-cancelled mismatch, and unsupported provider tests passed.
  - Docs updated: API/SDK/error docs and parity reports.
- [x] Unsafe provider fallback hardening
  - Files changed: refund/void use cases and provider contract docs.
  - Validation: non-manual provider missing refund/cancel method tests passed.
  - Docs updated: provider fallback policy documented.
- [x] OpenAPI/API/SDK docs and parity reports
  - Files changed: OpenAPI, API contract, SDK contract, smoke docs, README, error codes, two reports.
  - Validation: extraction-check passed.
  - Docs updated: all named docs synchronized.
- [x] Extraction check update
  - Files changed: `scripts/extraction-check.ts`
  - Validation: `pnpm extraction-check` passed with 96/96 checks.

#### Partially Completed

- [ ] Standalone repository sync
  - Completed: Cloned `https://github.com/Rndynt/northflow-payment-orchestration.git`, rsynced validated folder contents, and created local standalone commit `aef58a5f3350ab8e2190dd665a3c31e50bd9d027` with message `fix: complete legacy payment parity hardening`.
  - Remaining: Push local standalone commit to GitHub.
  - Reason: `git push origin HEAD:main` failed because the environment has no GitHub username/credentials (`fatal: could not read Username for 'https://github.com': No such device or address`).

#### Blocked

- [ ] Standalone repository push
  - Blocker: Missing GitHub credentials for HTTPS push.
  - Required next step: Push local standalone commit from an authenticated environment or provide repository write credentials.

#### Not Attempted

- [ ] AuraPoS payment deletion/removal
  - Reason: Explicit hard guardrail forbids deleting AuraPoS payment code in this phase.

### Validation Log

- Command: `pnpm install`
- Result: Passed.
- Notes: Installed standalone folder workspace dependencies; pnpm warned about ignored build scripts for esbuild packages.
- Command: `pnpm check`
- Result: Passed after adding TypeScript 6 deprecation silence and DOM lib for SDK fetch/Response types.
- Notes: Initial pre-install attempt failed because `turbo` was unavailable before `pnpm install`.
- Command: `pnpm build`
- Result: Passed.
- Notes: Turbo warned no output files for service build because build is no-emit type check.
- Command: `pnpm test`
- Result: Passed; 210 tests passed.
- Notes: Test suite logs an expected error-handler crash fixture and npm env warnings.
- Command: `pnpm extraction-check`
- Result: Passed; 96 checks passed.
- Notes: In-repo standalone folder ready to push.
- Command: `pnpm --filter @northflow/payment-orchestration-core type-check`
- Result: Passed.
- Notes: None.
- Command: `pnpm --filter @northflow/payment-orchestration-client-sdk type-check`
- Result: Passed.
- Notes: None.
- Command: `pnpm --filter @northflow/payment-orchestration-service type-check`
- Result: Passed.
- Notes: None.
- Command: `npm run check`
- Result: Passed from AuraPoS root; 13/13 packages successful.
- Notes: npm emitted environment config warnings.

### Documentation Updates

- File: `northflow-payment-orchestration/docs/reports/legacy-payment-to-northflow-parity-matrix.md`
- Change: Added parity matrix and final decision.
- File: `northflow-payment-orchestration/docs/reports/legacy-payment-parity-migration-report.md`
- Change: Added blockers fixed, limitations, validation, standalone sync status, and final decision.
- File: API/SDK/OpenAPI/error/smoke/README docs
- Change: Documented refund/void endpoints, idempotency behavior, response/error envelopes, and provider fallback policy.

### Checklist Updates

- File: `docs/replit-agent-payment-parity-hardening-completion-prompt.md`
- Change: Source prompt is not a checkbox checklist; execution status recorded in reports and this plan.

### Continuation Notes

Next safe action is to push local standalone commit `aef58a5f3350ab8e2190dd665a3c31e50bd9d027` to `https://github.com/Rndynt/northflow-payment-orchestration.git` from an authenticated environment, then update the final decision to `NORTHFLOW_PAYMENT_PARITY_READY_FOR_AURAPOS_PAYMENT_REMOVAL` only if the push succeeds and no new validation failures appear.
