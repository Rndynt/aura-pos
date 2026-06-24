# AuraPoS Architecture & Production Hardening Tasklist

Dokumen ini adalah acuan kerja untuk AI coding agent / Codex / vibe coding dalam memperbaiki arsitektur AuraPoS secara bertahap, presisi, dan aman.

Dokumen ini dibuat berdasarkan hasil riset mendalam terhadap codebase AuraPoS dan fokus pada readiness menuju production, clean architecture, offline-first, entitlement/business model, serta bug nyata yang ditemukan dari audit.

---

## 0. Tujuan Utama

Refactor ini bukan sekadar merapikan file. Target akhirnya adalah membuat AuraPoS lebih aman untuk pilot production dan lebih siap untuk production scale.

Target utama:

1. Menghilangkan anti-pattern arsitektur.
2. Memecah controller besar menjadi use-case handlers kecil.
3. Menghapus seluruh `@ts-nocheck`, `@ts-ignore`, dan type escape yang tidak perlu.
4. Menyatukan pricing engine frontend/offline/server menjadi satu shared source of truth.
5. Mengecilkan `container.ts` menjadi composition root per bounded context.
6. Membuat offline mode benar-benar offline-first, bukan hanya cache UI.
7. Memperbaiki bug nyata yang ditemukan dari audit.
8. Memperkuat entitlement, subscription, add-on, one-time, dan pay-as-you-go model.
9. Meningkatkan test coverage dan quality gate.
10. Menyiapkan deployment, observability, migration discipline, dan rollback strategy.

---

## 1. Aturan Wajib Untuk AI Coding Agent

### 1.1 Prinsip Umum

AI coding agent wajib mengikuti aturan berikut di semua phase:

1. Jangan melakukan rewrite total tanpa alasan teknis yang jelas.
2. Jangan mengubah behavior bisnis tanpa test pembuktian.
3. Jangan membuat compatibility layer legacy baru kecuali eksplisit diminta.
4. Jangan menambahkan `@ts-nocheck`, `@ts-ignore`, `any`, atau `as any` baru.
5. Jangan memindahkan logic bisnis ke React component, Express route, middleware, atau controller.
6. Jangan membuat controller besar baru.
7. Jangan membuat mega-service pengganti controller lama.
8. Jangan membuat migration tambal-sulam acak.
9. Jika project masih development dan belum punya data legacy penting, prefer perbaiki schema/migration sumber secara bersih daripada menambah alter/patch migration tidak jelas.
10. Setiap perubahan wajib bisa dibuktikan dengan type-check, build, dan test relevan.

### 1.2 Larangan Keras

Dilarang menambahkan pola seperti ini:

```ts
// @ts-nocheck
// @ts-ignore
const x: any = value;
value as any;
```

Dilarang membuat nama/pola seperti ini tanpa alasan kuat:

```txt
legacyResolver
compatibilityFix
temporaryMapping
hardcoded plan names scattered in UI
hardcoded payment method mapping outside source of truth
business logic inside route/controller/component
direct database access from HTTP route
```

### 1.3 Target Dependency Rule

Dependency yang benar:

```txt
UI / HTTP Layer
  -> Application Use Case / Handler
    -> Domain Model / Domain Service
      -> Ports / Interfaces
        -> Infrastructure Adapter
          -> Database / Redis / External Service
```

Rules:

```txt
apps/api/http     boleh import application contracts + handlers.
apps/api/http     tidak boleh import infrastructure DB detail langsung.
application       boleh import domain + ports.
application       tidak boleh import Express, React, Dexie, Drizzle concrete adapter.
domain            tidak boleh import application, infrastructure, React, Express, DB.
infrastructure    boleh implement ports dari application/domain.
offline           boleh import shared pricing/entitlement contracts, tetapi tidak boleh menduplikasi pricing logic.
frontend          boleh import shared contracts/core, tetapi tidak boleh menjadi authority bisnis.
```

---

## 2. Masalah Utama Dari Audit

| Kode | Masalah | Dampak | Prioritas |
|---|---|---|---|
| M-001 | `apps/api/src/index.ts` terlalu gemuk dan mencampur bootstrap, migration, CORS, auth, logging, repair schema/data | Startup sulit diaudit, sulit rollback, side-effect production tinggi | P0 |
| M-002 | `apps/api/src/container.ts` menjadi mega-container dengan wiring lintas context dan type escape | Coupling tinggi, sulit test, rawan circular dependency | P0 |
| M-003 | Controller besar seperti `OrdersController.ts` dan `SyncController.ts` mengandung orchestration bisnis | HTTP layer tidak tipis, logic sulit di-test | P0 |
| M-004 | Ada `@ts-nocheck` di komponen UI inti POS | Type safety bocor di flow penting | P0 |
| M-005 | Pricing dihitung di server/offline/frontend secara terpisah | Risiko mismatch total, receipt, payment, sync conflict | P0 |
| M-006 | Offline sync auth belum tegas antara cashier session dan terminal/device token | Sync bisa gagal atau terlalu permisif | P0 |
| M-007 | Offline auth fallback berbasis localStorage terlalu lemah | Terminal bisa dianggap authenticated tanpa proof kuat | P0 |
| M-008 | Outbox retry state bug: terminal/non-terminal sama-sama `failed` | Tidak bisa bedakan retry sementara vs gagal final | P0 |
| M-009 | Config drift: Vite config ganda, env/docs/deploy tidak sinkron | Build/deploy mudah salah | P1 |
| M-010 | Rate limiter in-memory untuk production multi-instance | Limit tidak konsisten antar instance | P1 |
| M-011 | Startup migration/schema repair berjalan saat app boot | Deploy multi-instance dan rollback tidak aman | P0 |
| M-012 | Test coverage belum cukup untuk transaksi/offline/sync/auth/entitlement | Regression mudah lolos | P0 |
| M-013 | Offline entitlement snapshot belum signed/expiry/grace | Offline gating belum production-grade | P0 |
| M-014 | Business model belum dijahit penuh ke entitlement + billing lifecycle + offline grace | Monetisasi belum kuat secara operasional | P1 |

---

## 3. Phase Overview

| Phase | Nama | Tujuan | Output Utama | Prioritas |
|---|---|---|---|---|
| P0 | Execution Guardrails & Baseline | Membuat baseline aman sebelum refactor | baseline report, dependency audit, rules | P0 |
| P1 | Config, Docs, Formatting Hygiene | Membersihkan drift konfigurasi dan dokumentasi | config canonical, env docs, port clarity | P1 |
| P2 | Bootstrap Decomposition | Memecah `index.ts` | bootstrap modules, startup bersih | P0 |
| P3 | Composition Root Per Bounded Context | Mengecilkan `container.ts` | module factories per bounded context | P0 |
| P4 | Controller Split To Use-Case Handlers | Memecah controller besar | contracts, routes tipis, application handlers | P0 |
| P5 | Remove Type Safety Escape | Menghapus `@ts-nocheck` dan type escape | typed UI, typed DTOs | P0 |
| P6 | Shared Pricing Engine SOT | Menyatukan pricing server/frontend/offline | shared pricing package | P0 |
| P7 | Entitlement & Business Model Hardening | Menguatkan subscription/add-on/PAYG/one-time | signed snapshot, business rules | P1 |
| P8 | Offline-First Hardening | Membuat offline mode operasional | terminal auth, retry state, conflict policy | P0 |
| P9 | Real Bug Fix Batch | Memperbaiki bug nyata dari audit | bugfix PR kecil dengan regression test | P0 |
| P10 | Testing & Quality Gates | Menutup regression risk | unit/integration/e2e/offline tests, CI gate | P0 |
| P11 | Production Hardening | Observability, migration, security, rate limit | runbook, metrics, Redis limiter | P0 |
| P12 | Rollout Plan & Pilot Production | Rollout aman ke tenant pilot | canary, rollback, pilot checklist | P0 |

---

# P0 — Execution Guardrails & Baseline

## Tujuan

Membuat baseline aman sebelum refactor besar agar Codex tidak melakukan patch acak.

## Masalah Yang Diselesaikan

- Tidak ada satu dokumen eksekusi yang menjadi acuan.
- Tidak ada baseline test/build yang dicatat.
- Belum ada dependency boundary audit.
- Belum ada risk register per bounded context.

## Task P0.1 — Simpan Dokumen Tasklist Resmi

File target:

```txt
roadmap/architecture-production-hardening/tasklist.md
```

Task:

- [x] Pastikan file ini ada di repo.
- [x] Jangan mengubah source code pada task ini.
- [x] Jadikan file ini acuan task bertahap untuk Codex.

Acceptance criteria:

- [x] File markdown tersedia di repo.
- [x] Tidak ada perubahan source code dalam commit dokumen.

## Task P0.2 — Baseline Build & Test

Command wajib:

```bash
pnpm install
pnpm type-check
pnpm build
pnpm test
```

Jika `pnpm test` tidak tersedia di root, jalankan test per package yang tersedia.

Output file:

```txt
roadmap/architecture-production-hardening/baseline-report.md
```

Isi minimal:

```md
# Baseline Report

Tanggal:
Commit:
Branch:

## Commands
- pnpm install:
- pnpm type-check:
- pnpm build:
- pnpm test:

## Existing Failures
- ...

## Package Test Coverage Map
- apps/api:
- apps/pos-terminal-web:
- packages/application:
- packages/offline:
- packages/domain:
- packages/infrastructure:

## High Risk Files
- apps/api/src/index.ts
- apps/api/src/container.ts
- apps/api/src/http/controllers/OrdersController.ts
- apps/api/src/http/controllers/SyncController.ts
- packages/offline/src/localOrderService.ts
- packages/offline/src/outbox.ts
- packages/offline/src/syncEngine.ts
- apps/pos-terminal-web/src/App.tsx
- apps/pos-terminal-web/src/components/pos/OrderTypeSelectionDialog.tsx
- apps/pos-terminal-web/src/components/pos/OrderQueuePanel.tsx
```

Acceptance criteria:

- [x] Baseline report dibuat.
- [x] Semua error existing dicatat jujur.
- [x] Tidak ada klaim fixed tanpa test.

## Task P0.3 — Dependency Boundary Audit

Output file:

```txt
roadmap/architecture-production-hardening/dependency-boundary-audit.md
```

Task:

- [x] Audit import antar layer.
- [x] Cari import Express/React/Drizzle di domain/application.
- [x] Cari direct DB access dari route/controller.
- [x] Cari logic bisnis di React component.
- [x] Cari duplicate pricing/payment/entitlement logic.

Format output:

```md
# Dependency Boundary Audit

## Violations

### V-001
File:
Violation:
Expected boundary:
Risk:
Fix phase:
Suggested action:
```

Acceptance criteria:

- [x] Minimal mencakup API, frontend, offline, application, infrastructure.
- [x] Setiap violation dipetakan ke phase fix.

---

# P1 — Config, Docs, Formatting Hygiene

## Tujuan

Membersihkan drift konfigurasi dan dokumentasi sebelum refactor besar.

## Task P1.1 — Tetapkan Canonical App Ports

Target:

```txt
API server          : 5000
POS Terminal Web    : 5173 atau 5001
Admin/Web app       : 3000 atau 5002
Postgres            : 5432
Redis               : 6379
```

Files likely:

```txt
package.json
apps/api/package.json
apps/web/package.json
apps/pos-terminal-web/package.json
README.md
DEPLOYMENT_GUIDE.md
```

Task:

- [x] Audit semua script dev.
- [x] Pastikan tidak ada dua app default memakai port sama.
- [x] Update README dan deployment guide.

Acceptance criteria:

- [x] `pnpm dev` tidak menjalankan dua service pada port sama.
- [x] Docs menyebut port yang sama dengan script.

## Task P1.2 — Hapus Config Ganda Vite

Files likely:

```txt
vite.config.ts
apps/pos-terminal-web/vite.config.ts
apps/pos-terminal-web/vite.config.js
apps/pos-terminal-web/package.json
```

Task:

- [x] Tentukan satu config canonical untuk `apps/pos-terminal-web`.
- [x] Hapus config duplikat jika tidak digunakan.
- [x] Jika root `vite.config.ts` legacy, hapus atau dokumentasikan penggunaannya.
- [x] Pastikan build masih memakai config canonical.

Acceptance criteria:

- [x] Hanya ada config yang benar-benar digunakan.
- [x] Build frontend sukses.
- [x] Tidak ada output build path berbeda antara config aktif dan config sisa.

## Task P1.3 — Canonical Environment Matrix

Files:

```txt
.env.example
docs/ENVIRONMENT.md
```

Minimum env:

```env
NODE_ENV=development
PORT=5000
DATABASE_URL=
REDIS_URL=
BETTER_AUTH_SECRET=
BETTER_AUTH_URL=
CORS_ALLOWED_ORIGINS=
TRUST_PROXY=
LOG_LEVEL=
RATE_LIMIT_STORE=memory
TERMINAL_TOKEN_SECRET=
ENTITLEMENT_SNAPSHOT_SECRET=
VITE_API_URL=
VITE_APP_ENV=
```

Task:

- [x] Update `.env.example`.
- [x] Tambahkan `docs/ENVIRONMENT.md`.
- [x] Pisahkan dev/staging/production requirements.
- [x] Jangan masukkan secret asli.

Acceptance criteria:

- [x] `.env.example` cukup untuk dev.
- [x] `docs/ENVIRONMENT.md` menjelaskan env wajib production.
- [x] Tidak ada docs yang menyebut auth optional jika app butuh auth.

## Task P1.4 — Formatting Hygiene Untuk File One-Line Besar

Files likely:

```txt
apps/api/src/index.ts
apps/api/src/container.ts
apps/api/src/http/controllers/OrdersController.ts
apps/api/src/http/controllers/SyncController.ts
apps/api/src/http/middleware/*.ts
```

Task:

- [ ] Jalankan formatter hanya untuk file yang akan disentuh.
- [ ] Jangan lakukan mass formatting seluruh repo dalam PR logic.
- [ ] Jika perlu, buat commit formatting-only sebelum refactor logic.

Acceptance criteria:

- [ ] Diff formatting-only tidak mengubah logic.
- [ ] PR logic setelahnya lebih kecil dan reviewable.

---

# P2 — Bootstrap Decomposition

## Tujuan

Memecah `apps/api/src/index.ts` agar startup API bersih, predictable, dan testable.

## Target Struktur

```txt
apps/api/src/
  index.ts
  bootstrap/
    createApp.ts
    env.ts
    cors.ts
    auth.ts
    routes.ts
    errorHandling.ts
    observability.ts
    readiness.ts
    startupChecks.ts
    migrations.ts
  runtime/
    server.ts
```

## Task P2.1 — Extract Env Validation

File:

```txt
apps/api/src/bootstrap/env.ts
```

Task:

- [x] Buat `loadApiConfig()`.
- [ ] Validasi env dengan schema typed. — **partial:** `loadApiConfig()` typed sudah ada, tetapi belum memakai schema validator formal.
- [ ] Jangan membaca `process.env` secara acak di banyak file. — **partial:** bootstrap memakai `loadApiConfig()`, tetapi audit env lint/source-wide cleanup belum selesai.
- [ ] Export `ApiRuntimeConfig`. — **partial:** kode mengekspor `ApiConfig`; nama acceptance belum persis `ApiRuntimeConfig`.

Acceptance criteria:

- [ ] Semua env utama dibaca melalui `loadApiConfig()`. — **partial:** bootstrap utama membaca config lewat `loadApiConfig()`, tetapi belum semua env access repo-wide dipusatkan.
- [x] Error env production jelas.
- [x] Type-check green.

## Task P2.2 — Extract CORS Policy

**Status note:** partial — inline CORS sudah keluar dari `index.ts`, tetapi production allowlist masih menerima base-domain/Replit/localhost paths dan unit test parsing origin belum ditemukan; acceptance tetap belum complete.

File:

```txt
apps/api/src/bootstrap/cors.ts
```

Task:

- [x] Hilangkan inline CORS policy dari `index.ts`.
- [x] Development boleh localhost.
- [ ] Production hanya allowlist eksplisit dari env.
- [ ] Tambahkan unit test untuk parsing origins.

Acceptance criteria:

- [ ] CORS dev dan production berbeda jelas.
- [ ] Allowed origins berasal dari env.

## Task P2.3 — Extract Auth Bootstrap

File:

```txt
apps/api/src/bootstrap/auth.ts
```

Task:

- [x] Mount Better Auth endpoints di modul khusus.
- [x] Jangan campur auth endpoint dengan migration/data repair.
- [x] Pastikan `/api/auth/*` tetap kompatibel.

Acceptance criteria:

- [x] Login/session endpoint tetap jalan.
- [x] Tidak ada perubahan kontrak response tanpa test.

## Task P2.4 — Extract Route Mounting

File:

```txt
apps/api/src/bootstrap/routes.ts
```

Task:

- [x] Route mounting hanya menerima `app`, `container/modules`, `config`.
- [x] Tidak boleh instantiate repository di route mounting.
- [x] `apps/api/src/http/routes/index.ts` tidak lagi mengimpor DB langsung; dependency tables berasal dari composition container.
- [x] Inventory sync retry job dipindahkan ke bootstrap jobs module agar route mounting tidak memulai background job tersembunyi.

Acceptance criteria:

- [x] Semua route existing tetap mounted.
- [x] Route mounting pendek dan mudah dibaca.
- [x] Validated with `pnpm --filter @pos/api type-check` on 2026-06-24.

## Task P2.5 — Extract Startup Checks & Migration Policy

Files:

```txt
apps/api/src/bootstrap/startupChecks.ts
apps/api/src/bootstrap/migrations.ts
```

Task:

- [x] Pisahkan readiness DB/Redis.
- [x] Pisahkan migration command dari app boot.
- [x] Production default: no auto-migrate on boot.
- [x] Dev boleh auto migrate hanya dengan env flag eksplisit.
- [x] Dokumentasikan migration production.

Acceptance criteria:

- [x] App boot production tidak menjalankan repair schema/data otomatis.
- [x] Migration dijalankan via command/pipeline eksplisit.

## Task P2.6 — Simplify `index.ts`

Target akhir:

```ts
import { loadApiConfig } from './bootstrap/env';
import { createApiApp } from './bootstrap/createApp';
import { startServer } from './runtime/server';

async function main() {
  const config = loadApiConfig();
  const app = await createApiApp(config);
  await startServer(app, config);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
```

Acceptance criteria:

- [x] `index.ts` hanya orchestration startup.
- [x] Tidak ada SQL/migration/data repair inline.
- [x] Tidak ada CORS/auth/route implementation detail di `index.ts`.

---

# P3 — Composition Root Per Bounded Context

## Tujuan

Mengecilkan `container.ts` menjadi composition root modular per bounded context.

## Target Bounded Context

```txt
catalog
orders
payments
inventory
tenant
outlet
entitlements
terminal
sync
kitchen
printing
auth
observability
```

## Target Struktur

```txt
apps/api/src/composition/
  createAppContainer.ts
  types.ts
  shared/
    databaseModule.ts
    redisModule.ts
    observabilityModule.ts
  modules/
    catalogModule.ts
    ordersModule.ts
    paymentsModule.ts
    inventoryModule.ts
    tenantModule.ts
    outletModule.ts
    entitlementModule.ts
    terminalModule.ts
    syncModule.ts
    kitchenModule.ts
    printingModule.ts
```

## Task P3.1 — Define Module Contract

File:

```txt
apps/api/src/composition/types.ts
```

Task:

- [x] Definisikan `SharedCompositionDeps`.
- [x] Definisikan `ModuleFactory<TModule>`.
- [x] Semua module factory memakai contract yang sama.

Acceptance criteria:

- [x] Tidak ada module membaca global singleton tanpa jelas.
- [x] Type dependency terlihat eksplisit.

## Task P3.2 — Extract Shared Infrastructure Modules

**Status note:** partial — database/unit of work sudah menjadi shared module, tetapi Redis/cache/pubsub, logger/observability, dan provider time/id/idempotency belum lengkap.

Task:

- [x] Extract database module.
- [ ] Extract Redis/cache/pubsub module. — **partial:** belum ada shared Redis/cache/pubsub composition module; Redis/cache masih perlu diaudit per context.
- [ ] Extract logger/observability module. — **partial:** bootstrap logging ada, tetapi belum menjadi shared observability composition module.
- [ ] Extract time/id/idempotency provider jika diperlukan. — **partial:** belum ada provider eksplisit; lanjutkan saat idempotency/offline refactor.

Acceptance criteria:

- [ ] Shared dependencies dibuat sekali. — **partial:** DB/unit of work sudah shared, Redis/cache/pubsub/logger/provider belum lengkap.
- [x] Context modules menerima dependency melalui parameter.

## Task P3.3 — Extract Orders Module

Target module:

```ts
export type OrdersModule = {
  handlers: {
    createOrder: CreateOrderHandler;
    createAndPayOrder: CreateAndPayOrderHandler;
    recordPayment: RecordPaymentHandler;
    listOrders: ListOrdersHandler;
    getOrder: GetOrderHandler;
    updateOrderStatus: UpdateOrderStatusHandler;
  };
};
```

Task:

- [x] Pindahkan wiring repository/use case order dari `container.ts`.
- [x] Jangan ubah behavior dulu.
- [ ] Tambah smoke test untuk module creation. — **partial:** root type-check/build/test lulus, tetapi belum ada smoke test khusus module creation.

Acceptance criteria:

- [x] Orders dependencies tidak lagi disusun langsung di mega-container.
- [x] `container.ts` berkurang signifikan.

## Task P3.4 — Extract Payments Module

**Status note:** partial — payment wiring sudah dipindah ke module, tetapi payment method/status policy dan entitlement/catalog source-of-truth belum lengkap.

Task:

- [x] Extract repository/use case payment.
- [ ] Pisahkan payment method, payment record, payment status policy. — **partial:** wiring payment sudah module, policy/method/status masih perlu refactor P4/P6/P7.
- [x] Jangan membuat mapping ewallet/card jika target saat ini hanya cash/manual QRIS/manual bank transfer.
- [ ] Payment method source harus mengikuti source of truth entitlement/catalog. — **partial:** perlu audit entitlement/payment SOT lanjutan.

Acceptance criteria:

- [ ] Payment module tidak tergantung langsung pada UI wording. — **partial:** module wiring tidak memakai UI wording, tetapi payment policy/SOT belum selesai diaudit.
- [ ] Payment logic bisa di-test terpisah. — **partial:** handler bisa diwiring terpisah, tetapi dedicated module tests belum ada.

## Task P3.5 — Extract Offline Sync Module

**Status note:** partial — sync module/use case wiring ada, tetapi SyncController masih punya direct DB/orchestration dan terminal-auth/pricing/conflict policy belum complete.

Task:

- [x] Extract sync handlers/repositories.
- [ ] Sync module bergantung pada terminal auth port, pricing engine, order application service, dan conflict policy. — **partial:** sync module ada, tetapi terminal auth/pricing/conflict policy belum lengkap.
- [ ] Jangan biarkan sync controller memproses logic sendiri. — **partial:** audit masih menemukan direct DB/orchestration di SyncController admin/conflict flow.

Acceptance criteria:

- [ ] Sync route memanggil sync handler. — **partial:** offline batch flow punya handlers, tetapi SyncController belum sepenuhnya tipis.
- [ ] Sync handler bisa di-test tanpa Express. — **partial:** application sync use cases ada, dedicated coverage masih perlu dilengkapi.

## Task P3.6 — Remove `as any` From Composition

Task:

- [x] Cari semua `as any` di composition/container.
- [x] Ganti dengan interface port yang benar.
- [x] Jika mismatch type terjadi, perbaiki constructor/port, bukan suppress.

Acceptance criteria:

- [x] Tidak ada `as any` di composition root.
- [x] `pnpm type-check` green.

---

# P4 — Controller Split To Use-Case Handlers

## Tujuan

Memindahkan orchestration bisnis dari controller besar ke use-case handlers kecil.

## Target Struktur

```txt
apps/api/src/http/
  contracts/
    orders.contract.ts
    payments.contract.ts
    sync.contract.ts
    terminals.contract.ts
  routes/
    orders.routes.ts
    sync.routes.ts
  mappers/
    orderResponseMapper.ts
    paymentResponseMapper.ts
    syncResponseMapper.ts

packages/application/src/
  orders/
    handlers/
      CreateOrderHandler.ts
      CreateAndPayOrderHandler.ts
      RecordOrderPaymentHandler.ts
      ConfirmOrderHandler.ts
      CancelOrderHandler.ts
      ListOrdersHandler.ts
    dto/
    ports/
  sync/
    handlers/
      SyncOfflineOrdersHandler.ts
      ResolveSyncConflictHandler.ts
```

## Task P4.1 — Extract HTTP Contracts

**Status note:** partial — beberapa order HTTP handler sudah dipisah, tetapi controller/route besar masih memiliki direct DB, type escape, dan schema/orchestration inline; jangan tandai complete sebelum audit P4 selesai.

Task:

- [ ] Pindahkan Zod schema request/response dari controller ke `http/contracts`.
- [ ] Gunakan nama contract eksplisit.
- [ ] Contract harus bisa di-import test.

Acceptance criteria:

- [ ] Controller tidak mendefinisikan schema panjang inline.
- [ ] Contract test bisa validasi payload tanpa Express.

## Task P4.2 — Create Order Handler Split

Task:

- [ ] Buat `CreateOrderHandler`.
- [ ] Handler menerima DTO application-level.
- [ ] Handler tidak menerima `Request`/`Response`.
- [ ] Handler tidak import Express.
- [ ] Handler memakai repository ports.

Acceptance criteria:

- [ ] Create order flow bisa di-test sebagai application handler.
- [ ] Route/controller hanya parse request dan map response.

## Task P4.3 — Create-And-Pay Handler Split

Task:

- [ ] Buat `CreateAndPayOrderHandler`.
- [ ] Pastikan create order + record payment atomic.
- [ ] Gunakan idempotency key.
- [ ] Jangan menerima total dari client sebagai authority.
- [ ] Payment amount harus divalidasi terhadap computed total/tendered rules.

Acceptance criteria:

- [ ] Duplicate idempotency key tidak menggandakan order/payment.
- [ ] Test happy path dan replay tersedia.

## Task P4.4 — Record Payment Handler Split

Task:

- [ ] Buat `RecordOrderPaymentHandler`.
- [ ] Validasi payment method entitlement.
- [ ] Validasi payment status transition.
- [ ] Pisahkan tendered/cash received/change amount dari order total.
- [ ] Jangan duplikasi pricing.

Acceptance criteria:

- [ ] Partial/multi/split/full payment rules jelas.
- [ ] Payment handler tidak tergantung React/HTTP.

## Task P4.5 — Sync Offline Orders Handler Split

Task:

- [ ] Buat `SyncOfflineOrdersHandler`.
- [ ] Handler menerima batch DTO.
- [ ] Handler memvalidasi tenant, outlet, terminal/device identity, idempotency key, pricing hash, entitlement snapshot, dan conflict policy.
- [ ] Handler mengembalikan result per item.

Acceptance criteria:

- [ ] Sync bisa diuji tanpa Express.
- [ ] Route `/api/sync/offline-orders` tipis.
- [ ] Duplicate sync replay aman.

## Task P4.6 — Response Mappers

Task:

- [ ] Buat response mapper order/payment/sync.
- [ ] Hindari response ad hoc di setiap handler.
- [ ] Pastikan response lama tetap kompatibel jika frontend masih bergantung.

Acceptance criteria:

- [ ] Response shape kritikal punya snapshot/contract test.
- [ ] Mapping tidak tersebar di controller.

---

# P5 — Remove Type Safety Escape

## Tujuan

Menghapus `@ts-nocheck`, `@ts-ignore`, `any`, dan type escape dari flow penting.

## Task P5.1 — Inventory Type Escapes

**Status note:** blocked/partial — audit masih menemukan `@ts-nocheck`, `as any`, dan `: any` pada flow POS/API/offline; belum ada `type-safety-inventory.md` resmi.

Command:

```bash
grep -R "@ts-nocheck\|@ts-ignore\|as any\|: any" .
```

Output:

```txt
roadmap/architecture-production-hardening/type-safety-inventory.md
```

Task:

- [ ] Daftar semua type escape.
- [ ] Kategorikan must fix now / can fix with contract extraction / acceptable external boundary only.
- [ ] Jangan langsung hapus tanpa memperbaiki type.

Acceptance criteria:

- [ ] Semua escape tercatat.
- [ ] Tidak ada escape baru.

## Task P5.2 — Fix `OrderTypeSelectionDialog.tsx`

Task:

- [ ] Hapus `@ts-nocheck`.
- [ ] Definisikan props explicit.
- [ ] Definisikan type `OrderType`.
- [ ] Hilangkan implicit any.
- [ ] Tambah component-level test jika test infra tersedia.
- [ ] Pastikan dialog scrollable dan usable di viewport kecil.

Acceptance criteria:

- [ ] File tidak memakai `@ts-nocheck`.
- [ ] Type-check green. — **partial:** root baseline type-check lulus, tetapi task belum complete karena file masih memakai `@ts-nocheck`.
- [ ] Dialog behavior tidak rusak.

## Task P5.3 — Fix `OrderQueuePanel.tsx`

Task:

- [ ] Hapus `@ts-nocheck`.
- [ ] Definisikan DTO order queue.
- [ ] Pastikan status order/kitchen typed.
- [ ] Hindari string union liar.
- [ ] Tambah test untuk render status utama.

Acceptance criteria:

- [ ] Tidak ada `@ts-nocheck`.
- [ ] Queue panel tetap render order existing.
- [ ] Type-check green. — **partial:** root baseline type-check lulus, tetapi task belum complete karena file masih memakai `@ts-nocheck`.

## Task P5.4 — Typed API Client Contracts

Task:

- [ ] Buat shared DTO atau generated type untuk endpoint kritikal.
- [ ] Minimal order, payment, sync, entitlement, terminal.
- [ ] Frontend tidak boleh memakai `unknown as X` tanpa validator.

Acceptance criteria:

- [ ] API client memakai contract type.
- [ ] Runtime validation tersedia untuk offline/sync payload.

---

# P6 — Shared Pricing Engine Single Source Of Truth

## Tujuan

Menyatukan pricing logic agar server, frontend, dan offline memakai engine yang sama.

## Target Package

Rekomendasi:

```txt
packages/pricing/
  package.json
  src/
    index.ts
    types.ts
    computePricing.ts
    rounding.ts
    tax.ts
    serviceCharge.ts
    discounts.ts
    pricingHash.ts
    __tests__/
      computePricing.test.ts
      pricingHash.test.ts
      pricingParity.test.ts
```

## Pricing Authority Rules

1. Client boleh menampilkan preview.
2. Offline boleh menghitung transaksi lokal dengan engine yang sama.
3. Server tetap authority final saat online/sync.
4. Semua layer wajib memakai engine yang sama.
5. Order total tidak boleh berasal dari `input.amount`.
6. Payment amount adalah amount paid/tendered, bukan computed total.
7. Receipt harus menyimpan pricing snapshot.
8. Sync harus mengirim pricing snapshot/hash untuk validasi server.

## Task P6.1 — Define Pricing Input/Output

**Status note:** partial — `@pos/core/pricing` sudah menjadi pricing canonical pada sebagian flow, tetapi audit masih menemukan duplicate offline/frontend/server pricing dan belum semua acceptance parity terpenuhi.

Target type:

```ts
export type PricingInput = {
  currency: 'IDR';
  items: PricingItemInput[];
  tax?: TaxConfig;
  serviceCharge?: ServiceChargeConfig;
  discount?: DiscountConfig;
  rounding?: RoundingConfig;
};

export type PricingResult = {
  subtotal: number;
  discountAmount: number;
  taxableAmount: number;
  taxAmount: number;
  serviceChargeAmount: number;
  roundingAmount: number;
  totalAmount: number;
  lineItems: PricingLineResult[];
  hash: string;
};
```

Task:

- [ ] Buat type final.
- [ ] Semua amount integer minor unit IDR.
- [ ] Jangan pakai floating precision untuk uang.
- [ ] Buat pricing hash deterministic.

Acceptance criteria:

- [ ] Pricing result deterministic.
- [ ] Test fixture membuktikan hasil sama di Node/browser.

## Task P6.2 — Port Server Order Flow To Shared Pricing

Task:

- [ ] Replace kalkulasi total di order controller/handler.
- [ ] Simpan pricing snapshot.
- [ ] Simpan pricing hash jika schema mendukung.
- [ ] Jika schema belum mendukung, buat task migration/schema cleanup eksplisit.

Acceptance criteria:

- [ ] Server order total dari shared pricing engine.
- [ ] Tidak ada duplicate compute pricing di controller.

## Task P6.3 — Port Offline Local Order To Shared Pricing

Task:

- [ ] Hapus `computePricing()` lokal di `packages/offline/src/localOrderService.ts`.
- [ ] Import shared pricing engine.
- [ ] Ubah `input.amount` menjadi `payment.tenderedAmount` atau `payment.amountPaid`.
- [ ] Simpan `pricingSnapshot` dan `pricingHash`.

Acceptance criteria:

- [ ] Offline dan server menghasilkan total sama untuk fixture sama.
- [ ] Test offline pricing parity tersedia.

## Task P6.4 — Port Frontend Display To Shared Pricing

Task:

- [ ] Cari kalkulasi subtotal/total di React component.
- [ ] Replace dengan shared pricing.
- [ ] UI hanya display result.
- [ ] Jangan jadikan UI authority.

Acceptance criteria:

- [ ] Tidak ada kalkulasi total manual di component besar.
- [ ] Cart total, receipt preview, local order total memakai engine yang sama.

## Task P6.5 — Pricing Parity Test

Test wajib:

```txt
packages/pricing/src/__tests__/pricing-parity.test.ts
packages/offline/src/__tests__/offline-pricing-parity.test.ts
apps/api/src/__tests__/order-pricing.integration.test.ts
```

Acceptance criteria:

- [ ] Fixture yang sama menghasilkan subtotal, tax, service charge, total, dan hash yang sama.
- [ ] Test jalan di CI.

---

# P7 — Entitlement & Business Model Hardening

## Tujuan

Mengikat subscription, add-on, one-time, dan pay-as-you-go ke entitlement engine secara konsisten online dan offline.

## Model Bisnis Rekomendasi

Model utama:

```txt
Subscription base plan
+ Recurring add-ons
+ One-time enablement untuk setup/hardware/onboarding
+ Pay-as-you-go hanya untuk usage-based external cost
```

Plan rekomendasi:

```txt
Starter
- POS core
- cash payment
- manual QRIS
- manual bank transfer
- basic stock
- standard receipt

Growth
- semua Starter
- order queue
- table service
- kitchen/KDS
- advanced reports dasar

Pro
- semua Growth
- advanced stock
- split bill
- multi payment
- partial payment advanced
- customer display
- API/webhook jika sudah stabil
```

Pay-as-you-go hanya untuk:

```txt
WhatsApp/SMS receipt
payment gateway fee passthrough
e-invoice per document
high-volume API/webhook calls
cloud backup over quota
```

One-time hanya untuk:

```txt
onboarding
data migration
hardware setup
custom receipt template
training
```

## Task P7.1 — Entitlement Catalog Cleanup

Task:

- [ ] Audit entitlement catalog.
- [ ] Pastikan nama offer sesuai billing interval.
- [ ] Jangan ada offer `*_monthly` jika billing interval `none`.
- [ ] Pastikan included feature tidak muncul sebagai addon untuk plan yang sudah include.

Acceptance criteria:

- [ ] Catalog readable.
- [ ] Test marketplace gating lulus.
- [ ] Add-on visibility sesuai plan.

## Task P7.2 — Server-Side Entitlement Enforcement Audit

Endpoint/fitur minimal:

```txt
split bill
multi payment
partial payment
KDS
queue
stock advanced
reports
export
CFD
API/webhook
```

Task:

- [ ] Audit endpoint yang harus digate entitlement.
- [ ] Pastikan server guard ada, bukan hanya hide UI.
- [ ] Tambah test forbidden/allowed.

Acceptance criteria:

- [ ] Endpoint protected by entitlement guard.
- [ ] Test forbidden ketika entitlement tidak ada.
- [ ] Test allowed ketika entitlement ada.

## Task P7.3 — Signed Offline Entitlement Snapshot

Target type:

```ts
export type EntitlementSnapshot = {
  tenantId: string;
  outletIds: string[];
  terminalId: string;
  planCode: string;
  entitlements: Record<string, boolean>;
  issuedAt: string;
  expiresAt: string;
  graceUntil: string;
  version: number;
  signature: string;
};
```

Task:

- [ ] Backend endpoint issue snapshot.
- [ ] Snapshot ditandatangani HMAC/JWS.
- [ ] Frontend/offline bisa verify signature.
- [ ] Snapshot punya expiry dan grace period.
- [ ] Offline gating pakai snapshot, bukan cached session body.

Acceptance criteria:

- [ ] Offline mode tidak bergantung pada localStorage session mentah.
- [ ] Snapshot expired menonaktifkan fitur berbayar setelah grace.
- [ ] Test valid/expired/tampered snapshot tersedia.

## Task P7.4 — Billing Lifecycle Hooks

Events:

```txt
subscription_created
subscription_updated
subscription_cancelled
payment_failed
addon_purchased
addon_expired
grace_started
grace_ended
```

Task:

- [ ] Tambah interface billing event handler.
- [ ] Event mengubah entitlement source server-side.
- [ ] Frontend hanya consume effective entitlements.

Acceptance criteria:

- [ ] Entitlement source jelas.
- [ ] Tidak ada hardcoded plan logic scattered di UI.

---

# P8 — Offline-First Hardening

## Tujuan

Menjadikan offline mode layak untuk operasi POS nyata: auth, order, payment, sync, conflict, retry, print, entitlement.

## Target Offline Architecture

```txt
Online bootstrap:
  login cashier
  register terminal/device
  fetch catalog snapshot
  fetch entitlement snapshot
  fetch pricing config
  fetch outlet config

Offline operation:
  create local order
  compute pricing with shared engine
  store pricing snapshot/hash
  store local audit event
  enqueue outbox operation
  print local receipt if needed

Reconnect:
  authenticate terminal/device
  submit sync batch
  server validates tenant/outlet/terminal/entitlement/pricing/idempotency/conflict
  server returns per-item result
  local DB marks synced/conflict/dead-letter
```

## Task P8.1 — Terminal/Device Auth For Sync

Task:

- [ ] Definisikan terminal credential model.
- [ ] Terminal registration menghasilkan token/secret.
- [ ] Sync endpoint menerima terminal auth.
- [ ] Cashier session tetap untuk interactive user action.
- [ ] Token harus scoped ke tenant/outlet/terminal.

Acceptance criteria:

- [ ] `/api/sync/offline-orders` bisa dipanggil oleh terminal credential valid.
- [ ] Invalid terminal credential ditolak.
- [ ] Cross tenant/outlet ditolak.
- [ ] Test integration tersedia.

## Task P8.2 — Replace LocalStorage Auth Fallback

Task:

- [ ] Ubah offline auth fallback menjadi signed offline credential.
- [ ] Tambah expiry/grace.
- [ ] Jangan anggap authenticated hanya karena ada JSON session.
- [ ] Tambah local lock screen policy bila credential expired.

Acceptance criteria:

- [ ] Tampered localStorage tidak bisa membuka protected POS.
- [ ] Expired credential memicu lock/re-auth.
- [ ] Test tampered/expired local credential tersedia.

## Task P8.3 — Outbox Retry State Machine

**Status note:** blocked/partial — source masih mengandung bug `status: terminal ? "failed" : "failed"`; jangan tandai P8/P9 outbox complete sebelum state machine/test diperbaiki.

Target states:

```txt
pending
processing
retry_scheduled
synced
conflict
permanent_failure
dead_letter
cancelled
```

Task:

- [ ] Perbaiki bug `status: terminal ? "failed" : "failed"`.
- [ ] Tambah final state untuk retry exhausted.
- [ ] Tambah `nextRetryAt`, `retryCount`, `lastErrorCode`, `lastErrorMessage`.
- [ ] Tambah UI filter local orders by status.
- [ ] Tambah manual retry untuk allowed states.

Acceptance criteria:

- [ ] Temporary failure dijadwalkan ulang.
- [ ] Permanent validation error masuk `permanent_failure`.
- [ ] Retry exhausted masuk `dead_letter`.
- [ ] UI bisa membedakan semua state penting.
- [ ] Test retry state machine tersedia.

## Task P8.4 — Conflict Resolution Policy

Conflict types:

```txt
duplicate_idempotency_key
pricing_hash_mismatch
entitlement_expired
terminal_revoked
order_already_paid
stock_changed
payment_amount_mismatch
outlet_scope_mismatch
```

Task:

- [ ] Definisikan conflict code enum.
- [ ] Definisikan policy per conflict.
- [ ] Buat sync response per item.
- [ ] Buat UI conflict page yang actionable.
- [ ] Simpan local audit log.

Acceptance criteria:

- [ ] Conflict tidak hanya `failed`.
- [ ] User/operator tahu tindakan: retry, discard, adjust, contact admin, force sync jika policy mengizinkan.
- [ ] Test minimal 5 conflict type.

## Task P8.5 — Offline Payment Modes

Target file:

```txt
packages/application/src/payments/offlinePaymentPolicy.ts
```

Task:

- [ ] Definisikan payment mode yang boleh offline.
- [ ] Cash default yes.
- [ ] Manual QRIS/manual bank transfer conditional.
- [ ] Split/multi/partial payment harus pakai policy eksplisit.
- [ ] Jangan hardcode di component.

Acceptance criteria:

- [ ] Offline UI membaca policy.
- [ ] Server sync memvalidasi policy yang sama.
- [ ] Entitlement tetap enforced.

## Task P8.6 — Offline Print Queue

Task:

- [ ] Audit print queue.
- [ ] Pastikan print job punya idempotency key.
- [ ] Pastikan reprint tidak menggandakan payment/order.
- [ ] Tambah local audit for printed/reprinted.

Acceptance criteria:

- [ ] Print retry aman.
- [ ] Reprint tercatat.
- [ ] Failed print tidak mengubah status payment.

---

# P9 — Real Bug Fix Batch

## Tujuan

Memperbaiki bug nyata dengan PR kecil dan regression test.

## Task P9.1 — Fix Port Conflict

**Status note:** complete — port canonical sudah sinkron dengan scripts dan docs; divalidasi melalui audit script package dan baseline build.

Task:

- [x] Tetapkan port canonical sesuai P1.1.
- [x] Update scripts.
- [x] Update README.
- [x] Test dev command terkait.

Acceptance criteria:

- [x] Tidak ada dua service default pada port sama.
- [x] Docs sesuai script.

## Task P9.2 — Fix Outbox Retry Terminal Bug

Task:

- [ ] Ganti bug `terminal ? "failed" : "failed"` dengan state yang benar.
- [ ] Jika P8.3 belum selesai, minimal bedakan temporary failure dan exhausted/dead-letter.
- [ ] Tambah unit test.

Acceptance criteria:

- [ ] Retry exhausted berbeda dari temporary failure.
- [ ] Test membuktikan MAX_RETRY bekerja.

## Task P9.3 — Fix Sync Auth Mismatch

Task:

- [ ] Implement terminal auth middleware.
- [ ] Sync route menerima terminal auth.
- [ ] Cashier auth tetap berlaku untuk interactive admin/cashier routes.
- [ ] Test session valid, terminal valid, both missing, wrong tenant, revoked terminal.

Acceptance criteria:

- [ ] Offline sync bisa jalan setelah reconnect tanpa memaksa active browser session.
- [ ] Security tetap scoped ke tenant/outlet/terminal.

## Task P9.4 — Fix Cached Auth Fallback

Task:

- [ ] Replace raw cached session fallback dengan signed offline credential.
- [ ] Tambah expiry/grace.
- [ ] Tambah lock state.
- [ ] Test tamper.

Acceptance criteria:

- [ ] User tidak dianggap authenticated hanya karena localStorage berisi object session.

## Task P9.5 — Fix Deployment Docs Drift

**Status note:** complete for docs/config drift — README, `.env.example`, `DEPLOYMENT_GUIDE.md`, dan `docs/ENVIRONMENT.md` sudah sinkron untuk pnpm, env, Redis/auth production requirements, dan migration command eksplisit.

Task:

- [x] Sinkronkan README, `.env.example`, `DEPLOYMENT_GUIDE.md`, dan `docs/ENVIRONMENT.md`.
- [x] Package manager harus pnpm jika monorepo memakai pnpm.
- [x] Auth/Redis tidak disebut optional jika production membutuhkannya.
- [x] Migration command production jelas.

Acceptance criteria:

- [x] Developer baru bisa setup tanpa guesswork.
- [x] Production deploy guide tidak bertentangan dengan current code.

## Task P9.6 — Fix Rate Limiter Production Store

Task:

- [ ] Tambah Redis-backed store.
- [ ] Env `RATE_LIMIT_STORE=memory|redis`.
- [ ] Production default Redis jika `REDIS_URL` ada.
- [ ] Memory store hanya dev/test.

Acceptance criteria:

- [ ] Multi-instance rate limit konsisten.
- [ ] Redis down behavior fail-open/fail-closed dipilih dan didokumentasikan.

---

# P10 — Testing & Quality Gates

## Tujuan

Mencegah regression pada flow bisnis utama.

## Target Testing Pyramid

```txt
Unit:
  pricing
  entitlement
  payment policy
  retry state machine
  order lifecycle

Integration:
  API route + DB test
  sync route
  terminal auth
  entitlement guard
  create-and-pay

E2E:
  cashier login
  cart -> order -> payment -> receipt
  offline order -> reconnect -> sync
  locked entitlement route
```

## Task P10.1 — Unit Tests For Pricing

Acceptance criteria:

- [ ] Test tax.
- [ ] Test service charge.
- [ ] Test rounding.
- [ ] Test option/variant price delta.
- [ ] Test discount jika tersedia.
- [ ] Test pricing hash.

## Task P10.2 — Unit Tests For Entitlement

Acceptance criteria:

- [ ] Included plan features.
- [ ] Add-on features.
- [ ] Expired add-on.
- [ ] Minimum plan rule.
- [ ] Feature not for sale.
- [ ] Offline snapshot valid/expired/tampered.

## Task P10.3 — Integration Tests For Orders/Payments

Flow wajib:

```txt
create order
create and pay
partial payment
multi payment
split bill
cancel order
void/refund if supported
```

Acceptance criteria:

- [ ] Server validates entitlement.
- [ ] Idempotency works.
- [ ] Payment amount rules enforced.
- [ ] Pricing snapshot stored.

## Task P10.4 — Integration Tests For Offline Sync

Flow wajib:

```txt
offline create local order
sync success
duplicate replay
pricing mismatch
expired entitlement
wrong terminal
wrong outlet
retry temporary failure
dead-letter permanent failure
```

Acceptance criteria:

- [ ] Semua flow punya deterministic response.
- [ ] Tidak ada duplicate order/payment on replay.

## Task P10.5 — Frontend Tests

Task:

- [ ] Add tests for entitlement sidebar gating.
- [ ] Add tests for marketplace add-on visibility.
- [ ] Add tests for order type dialog.
- [ ] Add tests for order queue panel.
- [ ] Add tests for local orders page.
- [ ] Add tests for sync conflict page.
- [ ] Add tests for offline lock state.

Acceptance criteria:

- [ ] `@ts-nocheck` removal backed by tests for critical UI.

## Task P10.6 — CI Gate

Target CI:

```txt
lint
type-check
unit tests
integration tests
build
docker build smoke
migration check
```

Acceptance criteria:

- [ ] PR fails if type-check/build/test fails.
- [ ] DB migration metadata check still runs.
- [ ] Tidak ada critical package yang test-nya silently skipped.

---

# P11 — Production Hardening

## Tujuan

Menyiapkan AuraPoS untuk pilot production dan production scale.

## Task P11.1 — Structured Logging

Fields wajib:

```txt
requestId
tenantId
outletId
terminalId
userId
role
idempotencyKey
syncBatchId
orderId
paymentId
route
statusCode
durationMs
errorCode
```

Acceptance criteria:

- [ ] Semua request kritikal punya request id.
- [ ] Error log tidak membocorkan secret.
- [ ] Sync batch bisa dilacak.

## Task P11.2 — Metrics

Metrics wajib:

```txt
http_request_duration_ms
http_request_total
order_created_total
payment_recorded_total
offline_sync_batch_total
offline_sync_item_failed_total
outbox_dead_letter_total
entitlement_denied_total
terminal_auth_failed_total
pricing_mismatch_total
```

Acceptance criteria:

- [ ] Metrics tersedia untuk dashboard.
- [ ] Minimal ada endpoint metrics atau integration observability provider.

## Task P11.3 — Release Migration Discipline

**Status note:** complete for current acceptance — boot-time migration production dimatikan/rejected, command migration eksplisit tersedia, dan deployment guide memuat backup/rollback/expand-contract notes.

Task:

- [x] Matikan auto migration on boot di production.
- [x] Buat command migration release.
- [x] Buat checklist expand/contract.
- [x] Tambah backup before migration.

Acceptance criteria:

- [x] Deploy app tidak otomatis repair schema.
- [x] Migration berjalan eksplisit.
- [x] Rollback procedure tertulis.

## Task P11.4 — Security Hardening

**Status note:** partial — CORS/env/migration docs sudah mengarah ke production hardening, tetapi Redis rate limiter, terminal rotation, security headers/audit log/debug endpoint audit belum complete.

Task:

- [ ] CORS strict production.
- [ ] Trust proxy explicit.
- [ ] Security headers.
- [ ] Body size limit.
- [ ] Cookie secure/sameSite production.
- [ ] Terminal token rotation.
- [ ] Audit log auth events.
- [ ] Rate limiter Redis production.
- [ ] Disable debug endpoints production.

Acceptance criteria:

- [ ] Security config berbasis env.
- [ ] Tidak ada localhost wildcard production.
- [ ] Terminal revoked tidak bisa sync.

## Task P11.5 — Backup & Restore Drill

Task:

- [ ] Dokumentasikan backup DB.
- [ ] Dokumentasikan restore.
- [ ] Test restore di staging.
- [ ] Catat RPO/RTO target.

Acceptance criteria:

- [ ] Ada bukti restore test.
- [ ] Runbook bisa diikuti.

---

# P12 — Rollout Plan & Pilot Production

## Tujuan

Melakukan rollout aman ke tenant/outlet pilot sebelum scale luas.

## Rollout Strategy

```txt
Phase A: internal dogfood
Phase B: one pilot tenant
Phase C: limited multi-outlet pilot
Phase D: paid pilot
Phase E: broader production rollout
```

## Task P12.1 — Feature Flag Critical Refactor

Task:

- [ ] Feature flag untuk shared pricing.
- [ ] Feature flag untuk terminal sync auth.
- [ ] Feature flag untuk offline signed entitlement snapshot.
- [ ] Feature flag untuk new outbox state machine jika perlu.

Acceptance criteria:

- [ ] Bisa enable per tenant/outlet.
- [ ] Bisa rollback ke behavior lama selama masa transisi.

## Task P12.2 — Pilot Checklist

Checklist wajib:

```txt
Tenant created
Outlet created
Cashier user created
Terminal registered
Catalog synced
Entitlement snapshot issued
Create order online works
Create and pay online works
Create local order offline works
Reconnect sync works
Receipt print works
KDS/queue works if enabled
Backup configured
Logs and metrics visible
Rollback tested
```

Acceptance criteria:

- [ ] Semua checklist pilot lulus sebelum paid pilot.

## Task P12.3 — Rollback Plan

Task:

- [ ] Dokumentasikan rollback app version.
- [ ] Dokumentasikan rollback feature flags.
- [ ] Dokumentasikan rollback DB migration dengan expand/contract policy.
- [ ] Dokumentasikan handling offline clients yang belum sync.

Acceptance criteria:

- [ ] Rollback tidak menggandakan order/payment.
- [ ] Offline outbox tidak hilang.
- [ ] Operator tahu tindakan saat rollback.

---

## 4. Urutan Eksekusi Yang Disarankan

Urutan eksekusi paling aman:

```txt
1. P0 baseline
2. P1 config/docs/formatting hygiene
3. P2 bootstrap decomposition
4. P3 composition root modularization
5. P4 controller split
6. P5 remove type safety escape
7. P6 shared pricing engine
8. P8 offline-first hardening
9. P9 real bug fix batch, sebagian bisa paralel setelah P0/P1
10. P10 testing & CI gates
11. P7 entitlement/business model hardening, bisa paralel setelah P6 sebagian selesai
12. P11 production hardening
13. P12 rollout pilot production
```

Catatan:

- P6 shared pricing harus selesai sebelum offline payment/sync dianggap aman.
- P8 terminal auth harus selesai sebelum offline-first disebut production-ready.
- P10 test gate harus menyertai setiap phase, bukan dikerjakan paling akhir seluruhnya.
- P7 business model tidak boleh hanya UI pricing; entitlement server dan offline snapshot harus ikut.

---

## 5. Definition Of Done Global

Satu phase dianggap selesai jika:

- [ ] Semua task phase selesai.
- [ ] Type-check green.
- [ ] Build green.
- [ ] Test relevan green.
- [ ] Tidak ada `@ts-nocheck`, `@ts-ignore`, `any`, atau `as any` baru.
- [ ] Tidak ada hardcoded business rule baru di UI/controller.
- [ ] Tidak ada migration acak tanpa alasan.
- [ ] Dokumentasi terkait diperbarui.
- [ ] Risiko dan rollback note ditulis.

---

## 6. Output Laporan Per PR/Commit

Setiap PR/commit pengerjaan wajib menyertakan ringkasan:

```md
## Summary
- ...

## Files Changed
- ...

## Architecture Impact
- ...

## Behavior Changes
- ...

## Tests
- [ ] pnpm type-check
- [ ] pnpm build
- [ ] pnpm test
- [ ] specific test command

## Risk
- ...

## Rollback
- ...
```

---

## 7. Prioritas Teknis Paling Tinggi

Jika waktu terbatas, kerjakan urutan berikut:

1. Baseline report dan dependency audit.
2. Fix config/docs/port drift.
3. Pecah `index.ts`.
4. Pecah `container.ts` per bounded context.
5. Split `OrdersController` dan `SyncController`.
6. Hapus `@ts-nocheck` dari komponen POS inti.
7. Buat shared pricing engine.
8. Perbaiki outbox retry state.
9. Implement terminal/device auth untuk sync.
10. Replace localStorage auth fallback dengan signed offline credential.
11. Tambah integration tests untuk create-and-pay dan offline sync.
12. Tambah production observability dan migration discipline.

---

## 8. Catatan Akhir

AuraPoS sudah punya fondasi fitur yang kuat: POS, order, payment, entitlement, KDS/queue, terminal, offline package, dan multi-tenant/outlet scope. Namun sebelum dianggap production-hard, refactor dan hardening di dokumen ini wajib dilakukan secara bertahap.

Tujuan dokumen ini adalah menjaga Codex agar tidak melakukan patch sporadis. Semua perubahan harus mengarah ke clean architecture, offline-first yang aman, pricing SOT, entitlement yang enforceable, dan production readiness yang bisa diuji.
