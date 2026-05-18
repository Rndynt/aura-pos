# AuraPoS Codebase Audit & Improvement Checklist

**Tanggal audit**: 2026-05-18
**Auditor**: OpenAI GPT-5.5
**Scope**: analisis statis codebase, dokumentasi, schema database, backend API, frontend POS terminal, application/domain/infrastructure packages, dan health-check TypeScript scripts.
**Tujuan dokumen**: menjadi backlog teknis lengkap berisi temuan, risiko, rekomendasi, dan checklist pekerjaan lanjutan untuk meningkatkan AuraPoS menuju production-ready.

---

## 0. Ringkasan Eksekutif

AuraPoS sudah memiliki fondasi POS yang kuat: monorepo TypeScript, React/Vite POS terminal, Express API, Drizzle ORM, domain/application/infrastructure packages, multi-tenant schema, katalog produk, order, payment, kitchen display, table management, dan beberapa halaman manajemen.

Namun, hasil audit menunjukkan beberapa gap penting yang perlu dibereskan sebelum klaim production-ready:

- TypeScript root check masih gagal besar karena konfigurasi alias/root tsconfig belum sinkron dengan struktur monorepo saat ini.
- Flow `create-and-pay` belum benar-benar atomic walaupun dokumentasi/checklist menyatakan sudah atomic/no orphaned orders.
- Endpoint update status langsung bisa bypass aturan lifecycle/payment yang ada di use case domain.
- Tenant isolation belum konsisten, terutama pada table status update dan payment lookup.
- Beberapa fitur bisnis penting masih mock/static: dashboard, reports, stock, employees.
- Auth/RBAC belum production-grade; tenant masih berbasis header/hardcoded demo tenant.
- Inventory baru dicek saat order, tetapi belum ada stock movement/reservation/decrement yang utuh.
- Dokumentasi status implementasi ada yang kontradiktif dan terlalu optimistis dibanding kondisi kode.

---

## 1. Gambaran Codebase Saat Ini

### 1.1 Struktur Utama

- `apps/pos-terminal-web`: frontend POS terminal berbasis Vite + React.
- `apps/api`: backend Express/TypeScript.
- `apps/web`: frontend Next.js tambahan/opsional.
- `packages/domain`: tipe dan aturan domain.
- `packages/application`: use case bisnis.
- `packages/infrastructure`: repository/database access.
- `packages/core`: utilitas dan konstanta bersama.
- `shared/schema.ts`: schema Drizzle PostgreSQL lintas aplikasi.
- `docs/`: dokumentasi arsitektur, lifecycle, dan checklist.

### 1.2 Fitur yang Sudah Ada

#### POS Terminal

- [x] Product browsing.
- [x] Cart management.
- [x] Mobile cart drawer.
- [x] Desktop/tablet cart panel.
- [x] Product option/variant dialog.
- [x] Payment method dialog.
- [x] Partial payment dialog.
- [x] Save draft.
- [x] Continue/edit order via `continueOrderId`.
- [x] Order queue display.
- [x] Basic kitchen status action.

#### Catalog/Product

- [x] Product schema.
- [x] Option group schema.
- [x] Product option schema.
- [x] Product list API.
- [x] Product detail API.
- [x] Product create/update API.
- [x] Availability check API.
- [x] Product management frontend memakai API real.

#### Orders

- [x] Order schema.
- [x] Order item schema.
- [x] Order item modifier schema.
- [x] Create order use case.
- [x] Update order use case.
- [x] Confirm order use case.
- [x] Complete order use case.
- [x] Cancel order use case.
- [x] List/open/history endpoints.
- [x] Order status validator domain.
- [x] Basic order queue UI.

#### Payments

- [x] Payment schema.
- [x] Record payment use case.
- [x] Full payment support.
- [x] Partial payment support.
- [x] Payment status: unpaid/partial/paid.
- [x] Payment methods: cash/card/ewallet/other.
- [ ] True transaction-safe create+pay.
- [ ] Idempotency key for payment retry.
- [ ] Refund/void flow.

#### Kitchen Display

- [x] Kitchen display route.
- [x] Kitchen feature gate.
- [x] Auto refresh.
- [x] Status flow confirmed → preparing → ready → completed.
- [x] Kitchen ticket schema.
- [x] Create kitchen ticket endpoint.
- [ ] Dedicated kitchen ticket query/UI as source of truth.
- [ ] Item-level kitchen completion source of truth.
- [ ] Print/reprint kitchen ticket lifecycle.

#### Tables/Seating

- [x] Tables schema.
- [x] GET tables API.
- [x] POST tables API.
- [x] PATCH table status API.
- [x] useTables hook.
- [x] Available tables hook.
- [ ] Tenant-safe table status update.
- [ ] Sync table occupied/available with order lifecycle.
- [ ] Reservation lifecycle.
- [ ] Merge/split/move table.

#### Back-office

- [x] Product management page mostly connected to API.
- [x] Dashboard UI exists.
- [x] Reports UI exists.
- [x] Stock UI exists.
- [x] Employees UI exists.
- [ ] Dashboard real analytics API.
- [ ] Reports real transaction data/export.
- [ ] Stock real inventory ledger.
- [ ] Employees CRUD/RBAC.

---

## 2. Penjelasan Penting: Pay Later / Makan Dulu Bayar Belakangan

### 2.1 Apakah order unpaid boleh `ready` atau `completed`?

**Ya, untuk restaurant/coffee shop dine-in, workflow “pesan dulu, makan dulu, bayar terakhir” adalah valid dan umum.** Jadi aturan “tidak boleh ready/completed jika belum paid” tidak boleh diterapkan secara mentah untuk semua business type dan semua order type.

Yang perlu dibedakan adalah dua konsep berbeda:

1. **Fulfillment status**: progress operasional pesanan.
   - `draft`
   - `confirmed`
   - `preparing`
   - `ready`
   - `served` atau `fulfilled` (disarankan ditambahkan)
   - `cancelled`

2. **Settlement/payment status**: progress pembayaran.
   - `unpaid`
   - `partial`
   - `paid`
   - `refunded` atau `voided` (disarankan ditambahkan nanti)

Untuk dine-in restaurant:

```text
confirmed + unpaid  -> order diterima, belum bayar
preparing + unpaid  -> dapur sedang memasak, belum bayar
ready + unpaid      -> makanan siap, belum bayar
served + unpaid     -> makanan sudah disajikan, customer makan dulu
closed + paid       -> customer sudah bayar, meja bisa ditutup/diarsipkan
```

Jadi masalahnya bukan “unpaid tidak boleh ready”. Masalah sebenarnya adalah istilah **`completed`** saat ini ambigu: apakah artinya “makanan selesai/served” atau “transaksi selesai/closed dan sudah beres secara kasir”.

### 2.2 Rekomendasi model lifecycle yang lebih tepat

Agar mendukung dine-in pay-later dan counter-service prepay, lifecycle sebaiknya dipisahkan menjadi minimal 3 dimensi:

#### A. Order/Fulfillment Status

- `draft`: cart/order belum final.
- `confirmed`: order masuk sistem.
- `preparing`: sedang diproses kitchen/bar.
- `ready`: siap diambil/disajikan.
- `served` atau `fulfilled`: sudah disajikan/diambil customer.
- `cancelled`: dibatalkan sebelum selesai.

#### B. Payment Status

- `unpaid`: belum ada pembayaran.
- `partial`: sebagian dibayar.
- `paid`: lunas.
- `refunded`: sudah refund penuh/sebagian.
- `voided`: transaksi dibatalkan sebelum settlement.

#### C. Order Closing / Settlement Status

Tambahkan konsep `closed_at` atau status penutup:

- `open`: order masih aktif secara operasional atau finansial.
- `closed`: order selesai operasional dan settlement sudah beres.

Dengan model ini, order **boleh served/fulfilled walaupun unpaid**, tetapi **tidak boleh closed** jika masih unpaid, kecuali ada mode khusus seperti house account, invoice, complimentary, atau write-off yang perlu permission manager.

### 2.3 Aturan yang disarankan per order type

#### Dine-in / Pay Later

- [x] Boleh `confirmed + unpaid`.
- [x] Boleh `preparing + unpaid`.
- [x] Boleh `ready + unpaid`.
- [x] Boleh `served/fulfilled + unpaid`.
- [ ] Tidak boleh `closed` jika belum `paid`, kecuali override manager.
- [ ] Table tetap `occupied` selama order open atau unpaid.
- [ ] Saat order `closed + paid`, table menjadi `available` atau `cleaning`.

#### Takeaway / Counter Service

- [x] Bisa prepay: `confirmed + paid` sebelum kitchen.
- [x] Bisa pay-on-pickup: `ready + unpaid` masih valid.
- [ ] Tidak boleh close pickup order jika unpaid.

#### Delivery

- [x] Bisa unpaid jika COD.
- [x] Bisa paid jika online payment.
- [ ] Order close saat delivered dan paid/COD collected.

#### Marketplace/External Channel

- [x] Bisa dianggap paid jika settlement dari channel sudah dikonfirmasi.
- [ ] Perlu reference external order id/payment id.

### 2.4 Perbaikan terhadap temuan audit sebelumnya

Temuan audit “order belum paid bisa complete” perlu diperhalus:

- Jika `completed` dimaknai **makanan selesai/served**, maka unpaid completed bisa valid untuk dine-in pay-later.
- Jika `completed` dimaknai **transaksi selesai/closed**, maka unpaid completed adalah bug.

Karena itu rekomendasi teknisnya:

- [ ] Jangan pakai satu status `completed` untuk dua makna.
- [ ] Tambahkan status fulfillment `served`/`fulfilled`.
- [ ] Tambahkan `closed_at` atau `settlement_status`.
- [ ] Ubah `CompleteOrder` menjadi salah satu:
  - `MarkOrderServed` untuk fulfillment tanpa wajib paid; atau
  - `CloseOrder` untuk final close yang wajib paid/settled.
- [ ] Kitchen display sebaiknya hanya mengubah fulfillment status sampai `ready` atau `served`, bukan menutup transaksi finansial.
- [ ] POS/cashier yang menutup bill melakukan `close order` setelah payment lunas.

---

## 3. Temuan P0 - Harus Dikerjakan Lebih Dulu

### P0.1 TypeScript root check gagal besar

**Gejala:** `npm run check` gagal dengan banyak error, terutama module alias `@/...` tidak ditemukan dan beberapa error TypeScript lain.

**Akar masalah utama:**

- Root `tsconfig.json` masih mengarah ke struktur legacy seperti `client/src` dan `server`, sedangkan POS berada di `apps/pos-terminal-web/src`.
- Root alias `@/*` tidak cocok untuk app POS.
- `npm run type-check` bergantung pada `turbo`, tetapi command gagal karena executable tidak tersedia di environment saat audit.

**Risiko:**

- CI tidak dapat dipercaya.
- Error compile bisa lolos ke runtime.
- Sulit menjaga kontrak type lintas package.

**Checklist perbaikan:**

- [ ] Pisahkan `tsconfig` root untuk project references, bukan compile semua app sekaligus dengan alias app-spesifik.
- [ ] Pastikan root `tsconfig.json` tidak memakai alias `@/*` legacy ke `client/src`.
- [ ] Buat `tsconfig` per app/package yang authoritative.
- [ ] Pastikan `turbo` ter-install di CI dan local workflow.
- [ ] Jalankan `pnpm type-check` atau `npm run type-check` sampai hijau.
- [ ] Tambahkan CI minimal: type-check, build, lint, test.

---

### P0.2 Create-and-pay belum benar-benar atomic

**Gejala:** Dokumentasi dan checklist menyebut order+payment atomic/no orphaned orders, tetapi implementasi membuat order dulu lalu payment. Jika payment gagal, order sudah terlanjur ada.

**Risiko:**

- Orphaned unpaid order.
- Kasir mengira pembayaran gagal total padahal order sudah masuk.
- Double retry bisa membuat order ganda.
- Reporting/payment reconciliation kacau.

**Checklist perbaikan:**

- [ ] Buat use case `CreateAndPayOrder` khusus.
- [ ] Implement DB transaction untuk create order, insert payment, update order paid amount/payment status.
- [ ] POS quick charge wajib memakai endpoint atomic tersebut.
- [ ] Tambahkan idempotency key di request create-and-pay.
- [ ] Tambahkan test untuk payment gagal: order tidak tercipta atau status jelas `payment_failed` sesuai desain.
- [ ] Update dokumentasi agar tidak mengklaim atomic sampai transaksi DB benar-benar ada.

---

### P0.3 Endpoint update status bypass domain rules

**Gejala:** Endpoint `PATCH /api/orders/:id/status` langsung update status ke repository tanpa menjalankan use case lifecycle/domain validator.

**Risiko:**

- Transition invalid bisa masuk database.
- Kitchen bisa menutup transaksi finansial tanpa cashier.
- Payment-later flow sulit dibedakan dari closed/settled flow.

**Checklist perbaikan:**

- [ ] Buat use case `TransitionOrderFulfillmentStatus`.
- [ ] Endpoint status wajib memakai validator domain.
- [ ] Kitchen display hanya boleh mengubah fulfillment status.
- [ ] Tambahkan permission/role: kitchen tidak boleh melakukan `CloseOrder` finansial.
- [ ] Tambahkan status `served`/`fulfilled` atau konsep `closed_at` agar dine-in pay-later valid.
- [ ] Tambahkan tests transition untuk dine-in pay-later, takeaway prepay, COD delivery.

---

### P0.4 Tenant isolation tables belum aman

**Gejala:** Table status update tidak menerima/validasi tenant di repository update, dan route tables membaca tenant dari header langsung, bukan `req.tenantId` dari middleware.

**Risiko:**

- Cross-tenant update table jika id diketahui.
- Data tenant A bisa berubah oleh request tenant B.

**Checklist perbaikan:**

- [ ] Ubah tables route agar menggunakan `req.tenantId`.
- [ ] Ubah `TableRepository.updateStatus` menjadi filter `id + tenantId`.
- [ ] Ubah `TableRepository.findById` menjadi tenant-aware.
- [ ] Validasi `currentOrderId` harus milik tenant yang sama.
- [ ] Tambahkan automated test cross-tenant table update.

---

## 4. Temuan P1 - Risiko Tinggi Setelah P0

### P1.1 Auth dan tenant masih demo/hardcoded

**Gejala:** Tenant masih berdasarkan header/hardcoded demo tenant. Belum terlihat route auth production yang aktif untuk login/session/JWT dan membership tenant.

**Risiko:**

- Siapa pun bisa mengganti `x-tenant-id`.
- Tidak ada role enforcement.
- Audit trail user tidak bisa dipercaya.

**Checklist perbaikan:**

- [ ] Implement auth login/logout.
- [ ] Implement JWT/session dengan tenant membership.
- [ ] Tambahkan roles: owner, manager, cashier, kitchen, staff.
- [ ] Middleware harus derive tenant dari auth context, bukan dari header bebas.
- [ ] Header `x-tenant-id` boleh dipakai hanya untuk memilih tenant yang user memang punya akses.
- [ ] Tambahkan audit log user id untuk mutation penting.

---

### P1.2 Payment race condition

**Gejala:** Record payment membaca order, menghitung remaining, insert payment, lalu update order tanpa row lock/transaction/idempotency.

**Risiko:**

- Dua payment simultan bisa overpay.
- Paid amount tidak akurat.
- Payment double retry dapat tercatat ganda.

**Checklist perbaikan:**

- [ ] Bungkus `RecordPayment` dalam DB transaction.
- [ ] Lock row order saat menghitung remaining balance.
- [ ] Tambahkan idempotency key/reference unik.
- [ ] Tambahkan unique constraint untuk provider reference jika ada.
- [ ] Tambahkan test concurrent payment.

---

### P1.3 Order number race condition

**Gejala:** Order number dibuat dari jumlah order hari ini + 1. Tidak ada unique constraint tenant+order_number.

**Risiko:**

- Order number duplikat saat traffic paralel.
- Struk/report membingungkan.

**Checklist perbaikan:**

- [ ] Tambahkan unique index `(tenant_id, order_number)`.
- [ ] Buat counter table per tenant+date atau database sequence.
- [ ] Generate order number di transaction.
- [ ] Implement retry saat unique violation.

---

### P1.4 Status order tidak konsisten antar dokumen, schema, API, UI

**Gejala:** Schema dan validator mengenal `preparing`/`ready`, tetapi filter list orders hanya menerima subset status. Dokumentasi memakai istilah `IN_PROGRESS` yang tidak sama dengan status DB.

**Risiko:**

- Filter order kitchen bisa gagal.
- Developer bingung status mana yang valid.
- UI label dan API contract tidak sinkron.

**Checklist perbaikan:**

- [ ] Jadikan enum status satu sumber kebenaran di `packages/core` atau `packages/domain`.
- [ ] Update schema validation API agar menerima semua status valid.
- [ ] Definisikan apakah `IN_PROGRESS` hanya label UI untuk `preparing`.
- [ ] Update docs lifecycle agar memakai istilah yang sama dengan code.
- [ ] Tambahkan OpenAPI/API contract untuk order status.

---

### P1.5 API response shape belum konsisten

**Gejala:** Banyak endpoint memakai `{ success, data }`, tetapi tables route mengembalikan payload langsung seperti `{ tables, total }`.

**Risiko:**

- Hook frontend perlu special case.
- Error handling tidak konsisten.
- Sulit membuat generated client.

**Checklist perbaikan:**

- [ ] Standardisasi response envelope: `{ success, data, error? }`.
- [ ] Standardisasi error shape: `{ success:false, error:{ code, message, details } }`.
- [ ] Migrasi tables API agar konsisten.
- [ ] Tambahkan API client helper tunggal.

---

## 5. Temuan P2 - Fitur Belum Lengkap / Masih Mock

### P2.1 Dashboard masih static/mock

**Checklist implementasi:**

- [ ] Endpoint `GET /api/analytics/summary?period=`.
- [ ] Revenue total.
- [ ] Transactions count.
- [ ] Average bill.
- [ ] Top products.
- [ ] Low stock count.
- [ ] Sales chart by hour/day/week.
- [ ] Replace hardcoded dashboard arrays.

---

### P2.2 Reports masih static/mock

**Checklist implementasi:**

- [ ] Endpoint sales report by date range.
- [ ] Transaction history paginated.
- [ ] Filter by payment method/status/channel.
- [ ] Export CSV.
- [ ] Export PDF/print view.
- [ ] Tax/service charge/discount breakdown.
- [ ] Refund/void reporting.

---

### P2.3 Stock/inventory belum utuh

**Checklist implementasi:**

- [ ] Tambahkan table `stock_movements`.
- [ ] Tambahkan movement types: `initial`, `adjustment`, `sale`, `void`, `refund`, `waste`, `transfer`.
- [ ] Implement decrement stock pada lifecycle yang dipilih.
- [ ] Untuk dine-in, tentukan apakah stock dikurangi saat `confirmed`, `preparing`, atau `served`.
- [ ] Implement reservation jika ingin mencegah oversell sebelum served.
- [ ] Stock page memakai API real.
- [ ] Stock adjustment memerlukan role manager/owner.

---

### P2.4 Employees masih mock

**Checklist implementasi:**

- [ ] Schema employees/staff.
- [ ] Employee CRUD API.
- [ ] Role assignment.
- [ ] PIN login untuk cashier/kitchen.
- [ ] Permission matrix.
- [ ] Disable/delete employee dengan audit trail.
- [ ] Shift assignment.

---

### P2.5 Refund/void belum ada

**Checklist implementasi:**

- [ ] Void unpaid order.
- [ ] Full refund paid order.
- [ ] Partial refund paid order.
- [ ] Refund payment record.
- [ ] Refund reason required.
- [ ] Manager approval optional/required by setting.
- [ ] Inventory restock rule.
- [ ] Reporting refund.

---

## 6. Rekomendasi Feature Must-Have untuk POS Restaurant/Coffee Shop

### 6.1 Dine-in/table service

- [ ] Open bill per table.
- [ ] Add items after initial order.
- [ ] Send only new items to kitchen.
- [ ] Move table.
- [ ] Merge tables.
- [ ] Split bill.
- [ ] Split payment.
- [ ] Service charge configurable per order type.
- [ ] Table status: available, occupied, reserved, cleaning, maintenance.
- [ ] Pay later support: served unpaid, close only after paid.

### 6.2 Counter/quick service

- [ ] Quick charge truly one-flow atomic.
- [ ] Receipt print after payment.
- [ ] Queue number display.
- [ ] Pay-on-pickup option.

### 6.3 Kitchen/bar workflow

- [ ] Kitchen ticket per station.
- [ ] Reprint ticket.
- [ ] Void/cancel item notification.
- [ ] Item-level status.
- [ ] Prep time tracking.
- [ ] Priority/rush order.

### 6.4 Cashier operations

- [ ] Cash drawer open/close.
- [ ] Shift closing.
- [ ] Cash in/out.
- [ ] End-of-day report.
- [ ] Payment reconciliation.
- [ ] Receipt numbering.

### 6.5 Product/catalog

- [ ] Category CRUD.
- [ ] Modifier library reusable.
- [ ] Product availability by schedule.
- [ ] Variant SKU/stock.
- [ ] Batch import/export products.

### 6.6 SaaS/multi-tenant

- [ ] Tenant onboarding flow.
- [ ] Plan/subscription enforcement.
- [ ] Tenant settings page.
- [ ] Business type templates applied on tenant creation.
- [ ] Multi-location support.

---

## 7. Rekomendasi Desain Data untuk Pay-Later

### 7.1 Minimal change approach

Jika ingin minim perubahan schema:

- Pertahankan `orders.status` sebagai fulfillment-ish status.
- Tambahkan `orders.closed_at` nullable.
- Tambahkan `orders.served_at` nullable.
- Ubah rule:
  - `ready` tidak butuh paid.
  - `completed` diganti maknanya menjadi served/fulfilled, tidak butuh paid untuk dine-in.
  - Close/archive final hanya lewat `closed_at`, dan wajib paid kecuali override.

**Kelemahan:** istilah `completed` tetap ambigu.

### 7.2 Recommended approach

Tambahkan/ubah menjadi:

```text
orders.fulfillment_status:
  draft | confirmed | preparing | ready | served | cancelled

orders.payment_status:
  unpaid | partial | paid | refunded | voided

orders.closed_at:
  timestamp nullable
```

Aturan:

- `served + unpaid` valid untuk dine-in.
- `ready + unpaid` valid untuk pay-on-pickup/COD.
- `closed_at` hanya boleh diisi jika `payment_status = paid`, atau ada `settlement_type` khusus.

Tambahkan optional:

```text
orders.settlement_type:
  normal | house_account | complimentary | write_off | external_invoice
```

Untuk settlement type non-normal, butuh permission dan audit reason.

---

## 8. Roadmap Eksekusi yang Disarankan

### Sprint 1 - Safety & Build Hygiene

- [ ] Fix root TypeScript config.
- [ ] Fix `npm run check`.
- [ ] Fix `npm run type-check` / turbo availability.
- [ ] Standardize status enum source.
- [ ] Fix list order status filter.
- [ ] Fix tenant isolation in tables.

### Sprint 2 - Order/Payment Lifecycle

- [ ] Redesign lifecycle for pay-later.
- [ ] Add served/closed semantics.
- [ ] Replace direct status endpoint with transition use case.
- [ ] Implement true atomic create-and-pay.
- [ ] Implement transaction-safe record payment.
- [ ] Add idempotency key.

### Sprint 3 - Inventory & Tables

- [ ] Add stock movement ledger.
- [ ] Implement stock decrement/reservation.
- [ ] Sync table status with open/closed orders.
- [ ] Add table move/merge/split basics.

### Sprint 4 - Back-office Real Data

- [ ] Dashboard analytics API.
- [ ] Reports API.
- [ ] CSV/PDF export.
- [ ] Replace mock stock page.
- [ ] Replace mock employees page.

### Sprint 5 - Auth/RBAC & Production Hardening

- [ ] Implement auth.
- [ ] Implement tenant membership.
- [ ] Implement role permissions.
- [ ] Add audit logs.
- [ ] Add monitoring/logging/error tracking.

---

## 9. Testing Checklist Target

### Unit Tests

- [ ] Order status transition validator.
- [ ] Pay-later lifecycle rules.
- [ ] Record payment remaining balance.
- [ ] Create order pricing calculation.
- [ ] Product availability check.

### Integration Tests

- [ ] Create order with items/modifiers.
- [ ] Create-and-pay success atomic.
- [ ] Create-and-pay payment failure rollback/consistent failure state.
- [ ] Partial payment then remaining payment.
- [ ] Concurrent payment protection.
- [ ] Cross-tenant order access denied.
- [ ] Cross-tenant table update denied.

### E2E Tests

- [ ] Dine-in pay-later: create → kitchen → served unpaid → pay → close.
- [ ] Counter prepay: create+pay → kitchen → ready → pickup close.
- [ ] Delivery COD: create → prepare → deliver → collect cash → close.
- [ ] Split payment.
- [ ] Continue open order and send only new items to kitchen.

---

## 10. Dokumentasi yang Perlu Diupdate Setelah Implementasi

- [ ] `docs/ORDER_LIFECYCLE.md`: update status pay-later dan close/settlement semantics.
- [ ] `docs/FEATURES_CHECKLIST.md`: ubah status sesuai kenyataan implementasi.
- [ ] `IMPLEMENTATION_STATUS.md`: hapus kontradiksi complete vs not started.
- [ ] Tambahkan `docs/API_CONTRACT.md` atau OpenAPI spec.
- [ ] Tambahkan `docs/RBAC.md`.
- [ ] Tambahkan `docs/INVENTORY_LIFECYCLE.md`.

---

## 11. Catatan Command Audit

Command yang dipakai saat audit antara lain:

```bash
pwd && find .. -name AGENTS.md -print
rg --files -g '!node_modules' -g '!vendor'
find . -maxdepth 3 -type d -not -path './node_modules*' -not -path './.git*'
cat package.json
sed -n '1,260p' README.md
nl -ba <file> | sed -n '<range>p'
rg -n "TODO|FIXME|HACK|not implemented|Coming soon|placeholder|mock" -g '!**/node_modules/**' -g '!attached_assets/**'
npm run check
npm run type-check
git status --short
```

Hasil validasi penting:

- `npm run check`: gagal; root TypeScript config/alias dan beberapa issue type lain perlu dibenahi.
- `npm run type-check`: gagal karena `turbo` tidak ditemukan di environment command saat audit.
- `git status --short`: clean sebelum dokumen ini dibuat.

---

## 12. Definition of Done Global

Codebase baru layak disebut production-ready jika minimal:

- [ ] Type-check hijau di CI.
- [ ] Build hijau di CI.
- [ ] Tenant isolation dites.
- [ ] Auth/RBAC aktif untuk mutation sensitif.
- [ ] Create-and-pay transaction-safe.
- [ ] Record payment transaction-safe dan idempotent.
- [ ] Pay-later dine-in lifecycle terdokumentasi dan dites.
- [ ] Dashboard/reports/stock/employees tidak lagi mock untuk fitur yang tampil sebagai produk aktif.
- [ ] Refund/void flow minimal tersedia.
- [ ] Audit log untuk order/payment/refund/stock adjustment.
- [ ] Dokumentasi checklist/status sinkron dengan kode.
