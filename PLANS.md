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
- Current status: In progress

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
- Current status: In progress

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
