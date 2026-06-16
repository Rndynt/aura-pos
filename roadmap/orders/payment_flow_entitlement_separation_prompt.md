# Payment Flow Entitlement Separation — DP, Multi Payment, Split Bill

## Context

The current POS payment UX is still conceptually ambiguous because “partial payment” can be interpreted as several different business flows:

```txt
- DP / uang muka / bayar sebagian
- multi-payment / multiple tender methods
- split bill / split by selected order items or by payer
```

These must be separated as independent commercial entitlements, independent UI flows, and independent backend commands. They may share low-level payment records, but the cashier-facing process must not mix them.

## Current SOT problem

Current entitlement keys already exist for payment features, but the wording is ambiguous:

```txt
payments_partial_payment
payments_multi_payment
payments_split_payment
```

`payments_partial_payment` currently describes “split bill & cicilan”, which mixes business meanings. This must be corrected.

## Product decision

Treat these as three separate product features:

```txt
1. DP / Bayar Sebagian / Uang Muka
   Canonical entitlement: payments_partial_payment

2. Multi Payment / Multi Metode Pembayaran
   Canonical entitlement: payments_multi_payment

3. Split Bill / Pecah Tagihan per item or per payer
   Canonical entitlement: payments_split_bill
   Legacy/current key compatibility if needed: payments_split_payment
```

Important:

```txt
DP is not split bill.
DP is not multi-payment.
Multi-payment is not split bill.
Split bill is not DP.
```

Each feature has its own permission, UI, dialog/wizard, backend command, validation, audit semantics, and smoke tests.

## Definitions

### 1. DP / Bayar Sebagian

Business meaning:

```txt
One order.
One total bill.
Customer pays less than the total now.
Remaining balance is paid later.
```

Example:

```txt
Order total: Rp100.000
DP now: Rp30.000
Remaining: Rp70.000
```

Correct statuses:

```txt
orders.status = confirmed
orders.payment_status = partial
orders.paid_amount = 30000
remaining_amount = 70000
```

UI wording:

```txt
Bayar Sebagian
DP / Uang Muka
Nominal Dibayar Sekarang
Dibayar
Sisa Tagihan
Lunasi Sisa
Tambah Pembayaran
```

Do not use these labels for DP:

```txt
Split Bill
Split Payment
Multi Payment
Continue Draft
```

### 2. Multi Payment / Multiple Tender

Business meaning:

```txt
One order.
One total bill.
The same bill is paid using more than one payment method in the same checkout flow.
The target is usually fully paid in a single payment session.
```

Example:

```txt
Order total: Rp100.000
Cash: Rp40.000
QRIS: Rp60.000
Remaining: Rp0
```

Correct statuses after successful full multi-payment:

```txt
orders.status = confirmed or completed depending explicit fulfillment mode
orders.payment_status = paid
orders.paid_amount = 100000
remaining_amount = 0
```

If multi-payment is saved before fully allocated, it is a pending/incomplete payment session, not a DP flow. Do not silently convert it into DP unless the user explicitly chooses “Bayar Sebagian”.

UI wording:

```txt
Multi Payment
Multi Metode
Tambah Metode
Metode 1
Metode 2
Total Dialokasikan
Sisa Dialokasikan
Bayar Semua
```

Rules:

```txt
- Sum of tender lines must not exceed order total.
- To finalize as paid, sum must equal order total.
- Each tender line has method + amount.
- Same method can be allowed or blocked by product decision, but validation must be explicit.
- Payment lines should be grouped under one payment session/batch for audit.
```

### 3. Split Bill

Business meaning:

```txt
One order.
The order is split into multiple bills/sub-bills.
Cashier can choose which order items go into each bill.
Each split bill can then be paid independently.
```

Example:

```txt
Order:
- Nasi Goreng Rp30.000
- Kopi Rp20.000
- Pasta Rp50.000
Total Rp100.000

Split Bill A:
- Nasi Goreng
- Kopi
Total Rp50.000

Split Bill B:
- Pasta
Total Rp50.000
```

Correct UX:

```txt
Open order detail / POS payment flow
→ choose Split Bill
→ select item(s) to split
→ create Bill A / Bill B / Bill C
→ pay each bill separately
```

Split method scope for this patch:

```txt
Primary: split by selected order items.
Optional later: split equally by number of people.
Optional later: split by custom amount.
```

Rules:

```txt
- A split bill contains selected order item references and quantities.
- One order item quantity can be split partially if quantity > 1.
- The same item quantity must not be assigned beyond available quantity.
- Each split bill has total, paid amount, remaining amount, and status.
- Paying a split bill updates aggregate order paid amount.
- The parent order payment_status can be partial while some split bills are unpaid.
- This aggregate payment_status partial is not the same as the DP feature.
```

UI wording:

```txt
Split Bill
Pecah Tagihan
Pilih Item
Buat Tagihan
Bill 1
Bill 2
Bayar Bill Ini
Sisa Belum Dibagi
Sisa Belum Dibayar
```

Do not call this “Bayar Sebagian”.

## Required entitlement SOT changes

Update:

```txt
packages/application/entitlements/entitlementCatalog.ts
```

### payments_partial_payment

Keep key for compatibility, but change wording to DP/bayar sebagian only.

Expected metadata:

```ts
payments_partial_payment: {
  label: 'DP / Bayar Sebagian',
  kind: 'feature',
  area: 'payments',
  category: 'Pembayaran',
  description: 'Terima uang muka dan lunasi sisa tagihan nanti.',
  longDesc: 'Satu order dengan satu total tagihan: customer membayar sebagian sebagai DP/uang muka, lalu sisa tagihan dilunasi kemudian.',
}
```

It must not mention split bill or multi-payment.

### payments_multi_payment

Expected metadata:

```ts
payments_multi_payment: {
  label: 'Multi Payment',
  description: 'Lunasi satu tagihan dengan beberapa metode pembayaran.',
  longDesc: 'Satu order dibayar dalam satu checkout menggunakan beberapa metode, misalnya tunai + QRIS. Target normalnya adalah lunas dalam satu sesi bayar.',
}
```

### Split bill entitlement

Preferred canonical key:

```txt
payments_split_bill
```

If changing keys is risky, keep `payments_split_payment` as legacy alias, but UI and product wording must say Split Bill.

Recommended migration path:

```txt
1. Add canonical payments_split_bill to SOT.
2. If existing stored grants use payments_split_payment, map alias payments_split_payment -> payments_split_bill in entitlement resolution.
3. Replace plan included key from payments_split_payment to payments_split_bill only if DB/dev state allows it.
4. Do not show both as separate marketplace cards.
```

Expected metadata:

```ts
payments_split_bill: {
  label: 'Split Bill',
  kind: 'feature',
  area: 'payments',
  category: 'Pembayaran',
  description: 'Pecah satu order menjadi beberapa tagihan berdasarkan item yang dipilih.',
  longDesc: 'Kasir dapat memilih item atau sebagian quantity item dari satu order untuk dibuat menjadi bill terpisah, lalu tiap bill dibayar masing-masing.',
}
```

## UI flow requirements

### Payment entry point

Current `PaymentMethodDialog` mixes DP toggle into the same payment method dialog. That is acceptable only as a short-term implementation, but the UX must expose three clearly separate choices when the tenant has the entitlements.

Recommended layout:

```txt
Payment Dialog / Payment Action Sheet

Primary actions:
1. Bayar Penuh
2. DP / Bayar Sebagian            shown only if can('payments_partial_payment')
3. Multi Payment                  shown only if can('payments_multi_payment')
4. Split Bill                     shown only if can('payments_split_bill') or legacy alias grants access
```

Do not show DP toggle as if it is split/multi payment.

### DP dialog

Separate DP panel/dialog:

```txt
Title: DP / Bayar Sebagian
Fields:
- Total Tagihan
- Nominal Dibayar Sekarang
- Sisa Tagihan
- Payment Method
Actions:
- Simpan DP
- Batal
```

Validation:

```txt
amount > 0
amount < orderTotal
cannot exceed total
```

Backend action:

```txt
New order: create-and-pay with amount < total
Existing order: POST /api/orders/:id/payments with amount <= remaining
```

### Multi Payment dialog

Separate multi payment dialog:

```txt
Title: Multi Payment
Rows:
- method
- amount
Actions:
- Tambah Metode
- Hapus Metode
- Bayar Semua
```

Validation:

```txt
sum(paymentLines.amount) <= total
To submit as paid: sum == total
If sum < total, require explicit choice: “Simpan sebagai DP/Bayar Sebagian” and require payments_partial_payment entitlement.
```

Backend requirement:

Prefer a new atomic endpoint:

```txt
POST /api/orders/create-and-pay-multi
POST /api/orders/:id/payments/multi
```

Payload:

```json
{
  "payments": [
    { "method": "cash", "amount": 40000 },
    { "method": "ewallet", "amount": 60000 }
  ],
  "idempotency_key": "..."
}
```

If implementing minimal patch first, the frontend can call existing payment endpoint sequentially only with backend safeguards/idempotency, but the final intended design should be atomic.

### Split Bill dialog/wizard

Separate split bill wizard:

```txt
Step 1: Select items to split
Step 2: Review bill total
Step 3: Pay bill or save bill
```

UI requirements:

```txt
- Display all order items.
- Allow selecting item lines.
- For quantity > 1, allow selecting quantity to move into split bill.
- Show total selected amount.
- Show unassigned remaining items/amount.
- Create Bill A/B/C.
- Pay selected bill.
```

Backend requirements for split bill:

Add domain/API for split bills. Do not fake split bill as a DP payment.

Recommended tables if not already present:

```txt
order_split_bills
- id
- tenant_id
- order_id
- bill_number
- label / payer_name nullable
- subtotal
- tax_amount
- service_charge
- discount_amount
- total
- paid_amount
- payment_status: unpaid | partial | paid
- status: open | paid | voided
- created_at
- updated_at

order_split_bill_items
- id
- split_bill_id
- order_item_id
- quantity
- amount
- metadata
```

Payment records should be linkable to a split bill:

```txt
order_payments.order_id
order_payments.split_bill_id nullable
order_payments.payment_session_id nullable
```

If schema change is too large for this patch, create a roadmap task and implement UI/flow only after backend split bill tables are ready. Do not claim split bill is complete without item-level split persistence.

## Backend entitlement guards

Add/verify guards:

```txt
DP/Bayar Sebagian endpoint or flow requires payments_partial_payment.
Multi Payment endpoint or flow requires payments_multi_payment.
Split Bill endpoint or flow requires payments_split_bill or legacy alias access.
```

Do not allow:

```txt
payments_partial_payment to unlock multi-payment.
payments_multi_payment to unlock split bill.
payments_split_bill to unlock DP.
```

## Internal status model clarification

`orders.payment_status = partial` is an aggregate financial state, not a product feature.

It may happen because:

```txt
- DP / bayar sebagian
- split bill where only some bills are paid
- other future payment allocations
```

But the source flow should be clear via:

```txt
- payment session type
- split bill records
- payment notes/metadata
- UI context
```

Do not infer feature flow from payment_status alone.

## Suggested implementation phases

### Phase A — Product wording and entitlement cleanup

Scope:

```txt
- Update ENTITLEMENT_CATALOG labels/descriptions.
- Add canonical payments_split_bill or map legacy payments_split_payment cleanly.
- Marketplace displays DP, Multi Payment, Split Bill as separate cards.
- Sidebar/payment dialog uses can() checks independently.
```

### Phase B — UI separation without deep schema changes

Scope:

```txt
- Payment dialog entry point presents separate actions.
- DP dialog is separate.
- Multi Payment dialog is separate for full settlement.
- Split Bill action exists only if backend split bill is implemented; otherwise show disabled “coming soon” state and do not pretend it works.
```

### Phase C — Backend multi-payment atomic endpoint

Scope:

```txt
- Add payment session/batch if needed.
- Record multiple order_payments atomically.
- Validate sums and idempotency.
- Return paid/remaining.
```

### Phase D — Backend split bill model

Scope:

```txt
- Add split bill tables.
- Add create/update split bill APIs.
- Add item/quantity allocation validation.
- Add pay split bill API.
- Aggregate parent order payment status from split bills/payments.
```

## Tests

### Entitlement tests

```txt
- payments_partial_payment label/description does not mention split bill/multi payment.
- payments_multi_payment is independent.
- payments_split_bill is independent or legacy alias maps correctly.
- Marketplace shows separate cards.
- DP can() does not unlock multi/split.
- Multi can() does not unlock DP/split.
- Split bill can() does not unlock DP/multi.
```

### DP tests

```txt
- DP amount < total creates status confirmed + payment_status partial.
- DP UI shows Dibayar/Sisa/Lunasi Sisa.
- DP cannot exceed/equal total in DP mode.
```

### Multi payment tests

```txt
- Multiple tender lines sum to total -> payment_status paid.
- Sum > total rejected.
- Sum < total requires explicit DP fallback and DP entitlement.
- Multi-payment is not shown without payments_multi_payment.
```

### Split bill tests

```txt
- Select item(s) into split bill.
- Quantity allocation cannot exceed order item quantity.
- Bill total is correct.
- Paying Bill A does not automatically pay Bill B.
- Parent order aggregate paid/remaining is correct.
- Split bill is not shown without payments_split_bill.
```

## Manual smoke scenarios

### DP smoke

```txt
Order total Rp100.000
Choose DP / Bayar Sebagian
Pay Rp30.000
Expected:
status confirmed
payment_status partial
Dibayar Rp30.000
Sisa Rp70.000
Lunasi Sisa visible
```

### Multi payment smoke

```txt
Order total Rp100.000
Choose Multi Payment
Cash Rp40.000
QRIS Rp60.000
Expected:
payment_status paid
Dibayar Rp100.000
Sisa Rp0
Payment history has two methods or one grouped session with two lines
```

### Split bill smoke

```txt
Order has 3 items
Choose Split Bill
Select item 1 + item 2 for Bill A
Pay Bill A
Expected:
Bill A paid
Bill B/open remaining items still unpaid
Parent order shows aggregate paid/remaining
```

## Required report

Create:

```txt
roadmap/orders/payment_flow_entitlement_separation_report.md
```

Report format:

```md
# Payment Flow Entitlement Separation Report

## Summary

## Product definitions applied
- DP/Bayar Sebagian:
- Multi Payment:
- Split Bill:

## Entitlement changes
- payments_partial_payment wording fixed: yes/no
- payments_multi_payment independent: yes/no
- payments_split_bill canonical or legacy alias: yes/no
- marketplace cards separated: yes/no

## UI changes
- payment entry point separated: yes/no
- DP dialog/panel: yes/no
- Multi Payment dialog/panel: yes/no
- Split Bill wizard: yes/no/not implemented yet

## Backend changes
- DP endpoint/flow guarded: yes/no
- Multi-payment atomic endpoint: yes/no/not implemented yet
- Split bill item allocation model: yes/no/not implemented yet

## Tests/commands run

## Remaining blockers
```

## Commit

Use commit message:

```bash
git commit -m "fix(payments): separate DP multi payment and split bill flows"
```

Then push.

## Final response required

Return:

```txt
Payment flow separation status:
Commit SHA:
Files changed:
DP entitlement independent: yes/no
Multi-payment entitlement independent: yes/no
Split-bill entitlement independent: yes/no
DP UI separated: yes/no
Multi-payment UI separated: yes/no
Split-bill item selection implemented: yes/no
Tests/commands run:
Remaining blockers:
```
