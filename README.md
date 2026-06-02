# AuraPoS Monorepo

AuraPoS adalah monorepo aplikasi Point of Sale (POS) untuk UMKM yang mencakup frontend terminal kasir, dashboard manajemen, dan backend API. Basis kode menggunakan TypeScript dengan React (Vite) di sisi frontend, Express + Drizzle ORM di sisi backend, serta paket domain bersama untuk menjaga konsistensi model bisnis.

## Struktur Proyek
- **apps/pos-terminal-web**: Frontend terminal kasir berbasis Vite + React dengan wouter sebagai router dan React Query untuk data fetching. Fokus pada operasi order, keranjang, pembayaran, dan ticket dapur.
- **apps/web**: Frontend tambahan berbasis Next.js (marketing/opsional) yang memanfaatkan komponen bersama.
- **apps/api**: Backend Express/TypeScript dengan Drizzle untuk akses database serta hooks React Query sebagai klien API.
- **packages/domain**: Definisi tipe domain (catalog, orders, pricing, tenants) yang dipakai lintas aplikasi.
- **packages/core / application / features / infrastructure**: Paket utilitas dan lapisan arsitektur pendukung.
- **design_guidelines.md**: Pedoman UI/UX berbasis Material Design untuk terminal kasir.

## Menjalankan Secara Lokal
1. **Instal dependensi**
   ```bash
   pnpm install
   ```
2. **Menjalankan semua aplikasi dengan Turbo (dev mode)**
   ```bash
   pnpm dev:turbo
   ```
   Atau jalankan servis terpisah:
   - Backend API: `pnpm dev`
   - POS terminal (Vite): `pnpm --filter apps/pos-terminal-web dev`
   - Next.js web: `pnpm --filter apps/web dev`

3. **Perintah lain yang sering digunakan**
   - Cek tipe: `pnpm type-check`
   - Linting: `pnpm lint`
   - Build produksi: `pnpm build`

> Catatan: ikuti aturan pada `agents.md` serta pedoman desain di `design_guidelines.md` ketika menambah fitur baru.


## Tenant Onboarding
- Production tenant onboarding is canonical at `POST /api/register` and the POS public registration page `/register`.
- The canonical flow creates the owner account, tenant, default outlet, module configuration, plan-default/free feature flags, enabled order types, and a starter catalog seed in one registration flow.
- `POST /api/tenants/register` is deprecated for onboarding and returns a deprecation response pointing clients to `POST /api/register`; do not build new clients against it.
- Slug availability can be checked with `GET /api/register/check-slug/:slug`.

## Catatan Arsitektur
- Router pada POS menggunakan wouter dengan layout utama (`MainLayout`) untuk konsistensi navigasi dan `UnifiedBottomNav` untuk pengalaman mobile.
- State keranjang dikelola via hook khusus (`useCart`) yang mengkalkulasi subtotal, pajak, dan service charge secara otomatis serta menyiapkan payload API.
- Integrasi fitur seperti partial payment dan kitchen ticket bergantung pada flag fitur melalui `useFeatures` dan pemanggilan API di `@/lib/api/hooks`.

## Dokumentasi Tambahan
- Pedoman UI/UX: `design_guidelines.md`
- Aturan kontribusi agen: `agents.md`
- Migrasi/DB: konfigurasi ada di `drizzle.config.ts` dan folder `migrations/`.


## Environment Variables Tambahan (Auth)
- `BETTER_AUTH_SECRET`: secret minimal 32 karakter untuk better-auth.
- `BETTER_AUTH_URL`: base URL aplikasi (contoh `http://localhost:5000`).

## Environment Variables Tambahan (Tenant Resolution)
- `BASE_DOMAIN`: domain utama untuk resolusi subdomain tenant (default `aurapos.my.id`).
- Tenant untuk request POS normal diselesaikan dari subdomain tenant atau session login di server. Cache tenant di `localStorage` frontend hanya untuk display/cache offline dan tidak dipakai sebagai authority header.
- `ALLOW_TENANT_HEADER`: kontrol fallback `x-tenant-id`/`tenant_id` di non-production; set `false` untuk mematikannya.
- `TENANT_HEADER_SERVICE_TOKEN`: token service/device untuk mengizinkan fallback `x-tenant-id`/`tenant_id` di production melalui header `x-tenant-service-token`. Tanpa token ini, production wajib memakai subdomain tenant atau session login.

## Environment Variables Tambahan (Inventory Retry)
- `INVENTORY_SYNC_RETRY_INTERVAL_MS`: interval job retry `inventory_sync_errors` (default `60000`).
- `INVENTORY_SYNC_RETRY_BATCH_SIZE`: jumlah maksimum error pending yang diproses per tick (default `25`).
- `INVENTORY_SYNC_RETRY_MAX_RETRIES`: batas retry sebelum record ditandai `failed` (default `5`).
- `INVENTORY_SYNC_RETRY_DELAY_MS`: jeda sebelum retry berikutnya setelah gagal (default `300000`).
