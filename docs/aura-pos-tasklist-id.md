# docs/aura-pos-tasklist-id.md
# AuraPoS – Daftar Tugas Berbasis Domain (ID)

> Prioritas: Kafe / Restoran terlebih dahulu.  
> Arsitektur: DDD (domain / application / infrastructure / apps/api / apps/pos-terminal-web).  
> Batasan:
> - Orders **tidak boleh** memiliki foreign-key dependency ke tabel tables, kitchen, DP, atau tabel spesifik vertikal lainnya.
> - Business type (vertikal) menentukan modul/domain mana yang dimuat per tenant.
> - Autentikasi (AuthCore) diimplementasikan terakhir; untuk saat ini users di-seed dan hardcoded dari satu tempat.
> - External payment gateway diimplementasikan terakhir; untuk saat ini menggunakan internal "mark as paid / partial" saja.
> - Modul loyalitas dirancang dan didaftarkan, tetapi diimplementasikan nanti.

---

## 0. Foundation & Cleanup

### 0.1 Pemeriksaan struktur Repo & DDD

- [ ] Konfirmasi layout monorepo:
  - [ ] `apps/api` – Backend Express
  - [ ] `apps/pos-terminal-web` – POS terminal web (Vite + React)
  - [ ] `packages/domain`, `packages/application`, `packages/infrastructure`, `packages/core`, `packages/features`, `shared/`
- [ ] Pastikan semua import menggunakan workspace paths (`@pos/domain`, `@pos/application`, dll.).
- [ ] Hapus atau tandai dengan jelas file legacy / tidak terpakai (jika ada) agar Replit agent tidak menyentuhnya.

### 0.2 Shared core utilities

- [x] Di `@pos/core` definisikan konstanta & tipe bersama:
  - [x] `BusinessType` enum/union (misal: `CAFE_RESTAURANT`, `RETAIL_MINIMARKET`, `LAUNDRY`, `SERVICE_APPOINTMENT`, `DIGITAL_PPOB`).
  - [x] `OrderStatus`, `PaymentStatus`, `OrderTypeCode` central enums.
  - [x] `FeatureCode` enum (sinkron dengan `tenant_features.feature_code` dan `FEATURE_CODES`).

---

## 1. Tenant & Business Type Domain

### 1.1 Domain model

- [x] Di `@pos/domain/tenants`:
  - [x] Tambahkan model/type `BusinessType`.
  - [x] Extend `Tenant` dengan:
    - [x] `business_type: BusinessType`
    - [x] `settings: Record<string, any>` (konfigurasi JSON per tenant, spesifik business-type).
  - [x] Tambahkan type `TenantModuleConfig` untuk merepresentasikan modul mana yang diaktifkan untuk tenant:
    - [x] Flag seperti `enable_table_management`, `enable_kitchen_ticket`, `enable_loyalty`, `enable_delivery`, dll.

### 1.2 Database schema & migrations

- [x] ~~Tambahkan tabel master `business_types`~~ (dilewati - menggunakan BusinessType enum di kode):
  - Business types didefinisikan di `@pos/core/constants.ts` sebagai string union type.
- [x] Update tabel `tenants`:
  - [x] Tambahkan `business_type` (varchar enum-like string).
  - [x] Tambahkan kolom `settings` JSONB (nullable).
- [x] Tambahkan tabel `tenant_module_configs` (pendekatan berbasis kolom):
  - [x] `tenant_id` (PK, FK ke tenants)
  - [x] Kolom Boolean untuk setiap modul: `enable_table_management`, `enable_kitchen_ticket`, `enable_loyalty`, `enable_delivery`, `enable_inventory`, `enable_appointments`, `enable_multi_location`
  - [x] `config` JSONB untuk pengaturan spesifik modul
  - [x] `updated_at` timestamp
  - [x] Migrasi dibuat: `migrations/0001_loose_frank_castle.sql`
  - [x] Repository diimplementasikan: `TenantModuleConfigRepository` dengan mapper yang type-safe

### 1.3 Application layer use cases

- [x] Use case `CreateTenant` (diimplementasikan di `packages/application/tenants/CreateTenant.ts`):
  - [x] Input mencakup `business_type`.
  - [x] Membuat tenant + default `tenant_features` + default `tenant_order_types` berdasarkan template business type.
  - [x] Menginisialisasi `tenant_module_configs` dengan default yang masuk akal dari template.
  - [x] Memvalidasi input, memeriksa keunikan slug, menangani error dengan baik.
  - [x] Mengembalikan profil tenant yang dibuat.
- [x] Use case `GetTenantProfile` (diimplementasikan di `packages/application/tenants/GetTenantProfile.ts`):
  - [x] Mengembalikan tenant + fitur yang diaktifkan + modul yang diaktifkan untuk tenant id tertentu.
  - [x] Parallel load fitur dan konfigurasi modul untuk performa.
  - [x] Penanganan error yang jelas untuk tenant yang tidak ditemukan.

### 1.4 Business-type templates

- [x] Definisikan di `@pos/application/tenants` (diimplementasikan di `businessTypeTemplates.ts`):
  - [x] Pemetaan `BusinessTypeTemplate` untuk semua 5 business types:
    - [x] CAFE_RESTAURANT: Default order types = `DINE_IN`, `TAKE_AWAY`, `DELIVERY`. Modul: table_management, kitchen_ticket, delivery diaktifkan.
    - [x] RETAIL_MINIMARKET: Default order type = `WALK_IN`. Modul: inventory, loyalty diaktifkan.
    - [x] LAUNDRY: Default order types = `WALK_IN`, `DELIVERY`. Modul: loyalty, delivery, label_printer diaktifkan.
    - [x] SERVICE_APPOINTMENT: Default order type = `WALK_IN`. Modul: appointments, loyalty diaktifkan.
    - [x] DIGITAL_PPOB: Default order type = `WALK_IN`. Modul: multi_location, payment_gateway diaktifkan.
  - [x] Setiap template mencakup feature codes default dengan source=plan_default.
  - [x] Helper function `getBusinessTypeTemplate(businessType)` untuk mengambil template.
- [x] Wire `CreateTenant` untuk menggunakan template di atas.

### 1.5 API / backend wiring

- [x] Tambahkan `/api/tenants/register` (sekarang deprecated untuk onboarding produksi; gunakan `POST /api/register`):
  - [x] Menerima `business_type`, info tenant dasar.
  - [x] Memanggil `CreateTenant`.
  - [x] Mengembalikan tenant dan modul/fitur yang diaktifkan.
  - [x] Validasi input menggunakan Zod schema dengan enum business type.
  - [x] Error handling yang tepat menggunakan middleware asyncHandler.
  - [x] Mengembalikan profil lengkap yang telah dipersist dengan ID dan timestamp asli.
- [x] Membuat endpoint `/api/tenants/profile` (memperluas fungsionalitas):
  - [x] Mengembalikan profil tenant lengkap (tenant + features + moduleConfig) untuk front-end.
  - [x] Terhubung dengan use case `GetTenantProfile` melalui DI container.

### 1.6 Frontend integration (POS terminal)

- [x] Di `apps/pos-terminal-web` (sudah diimplementasikan):
  - [x] Tambahkan hook `useTenantProfile()` yang:
    - [x] Mengambil profil tenant + flag modul dari `/api/tenants/profile`.
    - [x] Diimplementasikan di `apps/pos-terminal-web/src/hooks/api/useTenantProfile.ts`.
  - [x] Perluas `TenantContext` untuk menyimpan `business_type` dan peta modul:
    - [x] Menambahkan `business_type`, `moduleConfig`, `isLoading`, `error` ke context.
    - [x] Mengimplementasikan fungsi helper `hasModule(moduleName: string)`.
    - [x] Mempertahankan fungsionalitas `tenantId` yang ada (backward compatible).
    - [x] Diperbarui di `apps/pos-terminal-web/src/context/TenantContext.tsx`.
  - [x] Membuat dokumentasi penggunaan dengan contoh:
    - [x] Dokumentasi di `apps/pos-terminal-web/src/hooks/README.md`.
    - [x] Contoh untuk menampilkan/menyembunyikan layar manajemen meja (hanya kafe/restoran).
    - [x] Contoh untuk menampilkan/menyembunyikan field alamat pengiriman jika diaktifkan.
    - [x] Contoh untuk menampilkan/menyembunyikan UI loyalitas berdasarkan flag modul.

---

## Catatan
File ini merupakan versi bahasa Indonesia dari `docs/aura-pos-tasklist-en.md`. 
Untuk task domain lainnya (Catalog, Orders, Table Management, Kitchen, Payment, Authentication, Loyalty, Reporting, Frontend, Documentation), silakan lihat versi bahasa Inggris.

---

## 3. Ordering Domain (Generic, No Hard Table Dependency)

> Aturan inti: Orders bersifat generik.  
> Tables, kitchen, DP, loyalty, dll. adalah **modul terpisah** yang mereferensi orders, bukan sebaliknya (kecuali field netral opsional seperti `table_number`).

### 3.5 POS UI

- [x] Tambahkan tampilan "Order list" di POS terminal (diimplementasikan di apps/pos-terminal-web/src/pages/orders.tsx):
  - [x] Tab / filter untuk:
    - [x] Draft dine-in (dengan meja) - Tab "Dine-In" memfilter order dengan status=draft dan memiliki table_number.
    - [x] Draft takeaway - Tab "Takeaway" memfilter order dengan status=draft tanpa table_number.
    - [x] Siap untuk pembayaran (status + total) - Tab "Payment" memfilter order confirmed/preparing/ready yang belum dibayar penuh.
    - [x] Tab untuk semua order aktif dan order selesai.
- [x] Saat membuat order dari cart (diimplementasikan di apps/pos-terminal-web/src/components/pos/OrderTypeSelectionDialog.tsx):
  - [x] Tampilkan dialog:
    - [x] Pilih order_type (Dine In / Take Away / Delivery) - Radio group dengan ikon.
    - [x] Jika Dine In dan table management enabled - dropdown pilih meja.
    - [x] Jika tidak ada table management - input teks bebas untuk table_number.
    - [x] Opsi untuk langsung "Mark as paid" atau biarkan sebagai draft - Checkbox dengan tampilan jumlah.
