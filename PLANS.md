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
- Result: pass
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
- Result: pass
- Notes: Type-check POS terminal lulus setelah integrasi halaman Printer Hub & reconnect manager.

### Continuation Notes
Langkah berikutnya: simpan preferensi service/characteristic UUID per model printer agar lebih kompatibel lintas perangkat.
