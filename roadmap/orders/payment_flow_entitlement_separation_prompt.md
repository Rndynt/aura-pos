# Payment Flow Entitlement Separation — Clean Refactor Prompt

## Non-negotiable project context

AuraPoS is still in development and has no production users/data that must be preserved.

Therefore this task must be a clean refactor, not a compatibility patch.

Do not add:

```txt
legacy alias
legacy compatibility
legacy resolver
fallback to old key
old key support
backward compatibility bridge
compat wrapper
migration preserving old payment feature semantics
```

Remove ambiguous naming instead of preserving it.

If old code uses `payments_split_payment`, refactor it cleanly to the final key below. Do not keep both keys.

## Final product decision

There are four cashier payment choices:

```txt
1. Bayar Penuh
   - Built-in base POS feature.
   - Available to all tenants/plans.
   - No commercial entitlement required.

2. DP / Bayar Sebagian
   - Commercial entitlement: payments_partial_payment
   - Meaning: customer pays part of one bill now, remaining is paid later.

3. Multi Payment
   - Commercial entitlement: payments_multi_payment
   - Meaning: one bill is fully paid in one checkout using multiple payment methods.

4. Split Bill
   - Commercial entitlement: payments_split_bill
   - Meaning: one confirmed order is split into multiple bills by selected order items/quantities, then each bill is paid independently.
```

Important separation:

```txt
DP is not multi-payment.
DP is not split bill.
Multi-payment is not DP.
Multi-payment is not split bill.
Split bill is not DP.
Split bill is not multi-payment.
```

Each flow must have its own entitlement guard, UI flow/dialog/wizard, backend command/use case, audit semantics, reports, and receipt text.

## Final entitlement keys

Use exactly these keys:

```txt
payments_partial_payment
payments_multi_payment
payments_split_bill
```

Remove/refactor away:

```txt
payments_split_payment
```

Do not keep it as alias.

## Entitlement SOT requirements

Update:

```txt
packages/application/entitlements/entitlementCatalog.ts
```

### Bayar Penuh

Do not add an entitlement for full payment. It is base POS behavior.

### payments_partial_payment

Final metadata:

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

Must not mention:

```txt
split bill
split payment
multi payment
multiple tender
```

### payments_multi_payment

Final metadata:

```ts
payments_multi_payment: {
  label: 'Multi Payment',
  kind: 'feature',
  area: 'payments',
  category: 'Pembayaran',
  description: 'Lunasi satu tagihan dengan beberapa metode pembayaran.',
  longDesc: 'Satu order dibayar dalam satu checkout menggunakan beberapa metode, misalnya tunai + QRIS. Target normalnya adalah lunas dalam satu sesi bayar.',
}
```

### payments_split_bill

Final metadata:

```ts
payments_split_bill: {
  label: 'Split Bill',
  kind: 'feature',
  area: 'payments',
  category: 'Pembayaran',
  description: 'Pecah satu order menjadi beberapa tagihan berdasarkan item yang dipilih.',
  longDesc: 'Kasir dapat memilih item atau sebagian quantity item dari satu order confirmed untuk dibuat menjadi bill terpisah, lalu tiap bill dibayar masing-masing.',
}
```

Remove `payments_split_payment` from:

```txt
ENTITLEMENT_CATALOG.entitlements
ENTITLEMENT_CATALOG.plans[*].included
ENTITLEMENT_CATALOG.offers
frontend can() checks
marketplace cards
route/backend guards
tests
reports
```

Replace with `payments_split_bill` only.

## Product / UX answers to implement

### 1. Payment entry point display

The payment entry point must always show:

```txt
Bayar Penuh
```

because it is built-in base behavior.

The entry point must show entitlement-based options only when tenant has them:

```txt
DP / Bayar Sebagian       only if can('payments_partial_payment')
Multi Payment             only if can('payments_multi_payment')
Split Bill                only if can('payments_split_bill')
```

If tenant does not have an entitlement, do not let them use that flow.

Optionally show a locked/upsell row in marketplace or payment dialog, but it must not be clickable as a working payment flow.

### 2. Multi-payment sum less than total

Best behavior:

```txt
In Multi Payment mode, submit as Multi Payment is disabled until sum(payment lines) == total.
```

If sum is less than total:

```txt
- Show remaining amount.
- Show validation text: “Multi Payment harus lunas. Tambahkan metode/nominal sampai sisa Rp0.”
- If tenant also has payments_partial_payment, show secondary action: “Simpan sebagai DP / Bayar Sebagian”.
- If tenant does not have payments_partial_payment, do not allow underpaid multi-payment. User must adjust until full or upgrade DP feature.
```

This keeps the meaning clean:

```txt
Multi Payment = full settlement with multiple tenders.
DP = underpaid bill with remaining balance.
```

### 3. Split Bill availability

Split Bill is available only for existing confirmed/active orders.

Allowed parent order statuses:

```txt
confirmed
preparing
ready
served
```

Do not allow Split Bill for:

```txt
draft
completed
cancelled
```

Reason:

```txt
Split bill is used after an order exists/has been confirmed, commonly in restaurant pay-later flow or other businesses where the order is already accepted.
```

### 4. Split Bill before kitchen

Do not allow split bill before order confirmation.

If order is still a cart/new order/draft, cashier must confirm/create order first.

### 5. DP for quick retail transaction

Best behavior:

```txt
DP / Bayar Sebagian may be available for any order type if tenant has payments_partial_payment.
```

Reason:

```txt
Retail may use DP for pre-order, reservation, custom order, service deposit, or customer pay-later scenario.
```

But UX must make it clear this is not normal quick-sale full checkout:

```txt
- Full payment remains default.
- DP is a separate explicit choice.
- DP creates confirmed order with outstanding balance.
```

## Backend / Data Model decisions

### 1. payment_sessions is required

Add a table/model:

```txt
payment_sessions
```

Purpose:

```txt
- Audit one checkout/payment attempt as a unit.
- Group multi-payment lines.
- Distinguish flow type cleanly.
- Support report breakdown.
- Support receipt display.
```

Recommended schema:

```txt
payment_sessions
- id uuid primary key
- tenant_id uuid not null
- order_id uuid not null
- split_bill_id uuid nullable
- flow_type varchar not null -- full | dp | multi_payment | split_bill
- status varchar not null -- pending | completed | failed | voided
- total_due numeric not null
- amount_collected numeric not null default 0
- remaining_amount numeric not null default 0
- idempotency_key varchar nullable
- metadata jsonb nullable
- created_at timestamp not null
- updated_at timestamp not null
```

### 2. order_payments flow fields

Use `payment_sessions.flow_type` as the main semantic source.

Update `order_payments` to reference the session:

```txt
order_payments.payment_session_id nullable/not null depending migration scope
order_payments.split_bill_id nullable
```

Avoid putting the main flow semantics only on individual payment lines.

A payment line is a tender/money movement. A session is the business payment flow.

Examples:

```txt
Full payment:
  payment_sessions.flow_type = full
  order_payments: 1 line

DP:
  payment_sessions.flow_type = dp
  order_payments: 1 line

Multi Payment:
  payment_sessions.flow_type = multi_payment
  order_payments: 2+ lines

Split Bill:
  payment_sessions.flow_type = split_bill
  split_bill_id set
  order_payments: 1+ lines for that split bill
```

### 3. Split bill totals snapshot is required

Split bill totals must store a snapshot at the time the split bill is created.

Reason:

```txt
Audit must remain stable even if parent order/item prices/tax/discount display logic changes later.
```

Add tables:

```txt
order_split_bills
- id uuid primary key
- tenant_id uuid not null
- order_id uuid not null
- bill_number varchar/text not null
- label text nullable
- payer_name text nullable
- subtotal numeric not null
- tax_amount numeric not null
- service_charge numeric not null
- discount_amount numeric not null
- total numeric not null
- paid_amount numeric not null default 0
- payment_status varchar not null -- unpaid | partial | paid
- status varchar not null -- open | paid | voided
- created_at timestamp not null
- updated_at timestamp not null

order_split_bill_items
- id uuid primary key
- tenant_id uuid not null
- split_bill_id uuid not null
- order_id uuid not null
- order_item_id uuid not null
- quantity numeric/integer not null
- unit_price_snapshot numeric not null
- item_subtotal_snapshot numeric not null
- item_name_snapshot text not null
- metadata jsonb nullable
```

### 4. Split bill item allocation immutability

After any payment exists for a split bill, its item allocation is immutable.

Rules:

```txt
- Cannot add/remove/change split bill items after payment exists.
- Cannot change quantity allocation after payment exists.
- Can void/cancel a split bill only through explicit void flow, with audit.
```

### 5. Endpoint semantics

Do not keep one generic `recordPayment` as the semantic entry point for every payment flow.

Create explicit endpoints/use cases:

```txt
POST /api/orders/:id/payments/full
POST /api/orders/:id/payments/dp
POST /api/orders/:id/payments/multi
POST /api/orders/:id/split-bills
POST /api/orders/:id/split-bills/:splitBillId/pay
```

Existing generic endpoint may be refactored internally or removed if not needed. Since the app is development-only, prefer clean explicit endpoints.

Guard each endpoint independently:

```txt
full payment: no entitlement
DP: require payments_partial_payment
multi: require payments_multi_payment
split-bill create/pay: require payments_split_bill
```

## Backend flow details

### Full payment

Input:

```txt
order_id
method
amount = remaining or total depending context
```

Rules:

```txt
- Built-in base behavior.
- Can create payment_session flow_type=full.
- Amount must settle the order unless explicit partial flow is used.
- If amount < remaining, reject with message telling user to use DP if entitled.
```

### DP / Bayar Sebagian

Input:

```txt
order_id or create order payload
method
amount
```

Rules:

```txt
amount > 0
amount < total/remaining
requires payments_partial_payment
creates payment_session flow_type=dp
creates payment line
updates parent order paid_amount and payment_status=partial
if draft/new order, order.status becomes confirmed
```

### Multi Payment

Input:

```json
{
  "payments": [
    { "method": "cash", "amount": 40000 },
    { "method": "ewallet", "amount": 60000 }
  ],
  "idempotency_key": "..."
}
```

Rules:

```txt
requires payments_multi_payment
all lines must have amount > 0
sum(lines) must equal total/remaining for pure multi-payment submit
sum(lines) > total rejected
sum(lines) < total rejected unless user explicitly chooses DP fallback and has DP entitlement
creates one payment_session flow_type=multi_payment
creates multiple order_payments linked to that session
updates paid_amount/payment_status atomically
```

### Split Bill

Create split bill:

```json
{
  "label": "Bill A",
  "payer_name": "Rendy",
  "items": [
    { "order_item_id": "...", "quantity": 1 },
    { "order_item_id": "...", "quantity": 2 }
  ]
}
```

Rules:

```txt
requires payments_split_bill
parent order.status must be confirmed/preparing/ready/served
cannot split draft/completed/cancelled
item quantity allocation cannot exceed available unallocated quantity
snapshot item price/tax/service/discount into split bill tables
```

Pay split bill:

```txt
POST /api/orders/:id/split-bills/:splitBillId/pay
```

Rules:

```txt
requires payments_split_bill
creates payment_session flow_type=split_bill
links order_payments.split_bill_id
updates split_bill paid_amount/payment_status
updates parent order aggregate paid_amount/payment_status
if all split bills/order total paid, parent payment_status=paid
if some outstanding, parent payment_status=partial
```

## UI requirements

### Payment entry point

Replace ambiguous DP toggle with clear choices:

```txt
Bayar Penuh                         always visible
DP / Bayar Sebagian                 visible if can('payments_partial_payment')
Multi Payment                       visible if can('payments_multi_payment')
Split Bill                          visible if can('payments_split_bill') and order is confirmed/active
```

### New order/cart payment

Available flows:

```txt
Bayar Penuh
DP / Bayar Sebagian if entitled
Multi Payment if entitled
```

Split Bill must not be available for new cart/draft order.

### Existing order detail payment

For confirmed/active order:

```txt
Bayar Sisa / Bayar Penuh
DP / Tambah Pembayaran if entitled and not fully paid
Multi Payment if entitled and not fully paid
Split Bill if entitled and status is confirmed/preparing/ready/served
```

### DP dialog

Dedicated dialog/panel:

```txt
Title: DP / Bayar Sebagian
Fields:
- Total Tagihan
- Sudah Dibayar (if existing order)
- Sisa Saat Ini
- Nominal Dibayar Sekarang
- Sisa Setelah DP
- Payment Method
Actions:
- Simpan DP
- Batal
```

### Multi Payment dialog

Dedicated dialog/panel:

```txt
Title: Multi Payment
Rows:
- Method
- Amount
Actions:
- Tambah Metode
- Hapus Metode
- Bayar Semua
```

Display:

```txt
Total Tagihan
Total Dialokasikan
Sisa Dialokasikan
```

Validation:

```txt
Submit disabled unless sisa = 0
If sisa > 0 and tenant has DP: show secondary action “Simpan Sisa sebagai DP”
If sisa > 0 and tenant has no DP: show text “Multi Payment harus lunas.”
```

### Split Bill wizard

Dedicated wizard, only for confirmed/active order:

```txt
Step 1: Pilih Item
Step 2: Atur Qty jika item qty > 1
Step 3: Review Bill
Step 4: Simpan Bill / Bayar Bill Ini
```

Display:

```txt
All order items
Selected items
Available quantity
Selected quantity
Bill total
Unassigned remaining items
Existing split bills
Payment status per bill
```

## Reporting / Audit requirements

Reports must distinguish:

```txt
Revenue paid
Outstanding DP
Outstanding split bill
Multi tender breakdown
```

A report row with aggregate `payment_status=partial` must show reason/source:

```txt
DP outstanding
Split bill unpaid
Payment session incomplete/failed
```

Use `payment_sessions.flow_type` and split bill records to determine this. Do not infer only from `orders.payment_status`.

## Receipt requirements

Receipts must be concise but flow-aware.

### Full payment receipt

```txt
Total: Rp100.000
Dibayar: Rp100.000
Metode: Tunai
```

### DP receipt

```txt
DP Dibayar: Rp30.000
Sisa Tagihan: Rp70.000
Metode: QRIS
```

### Multi payment receipt

```txt
Total: Rp100.000
Tunai: Rp40.000
QRIS: Rp60.000
```

### Split bill receipt

```txt
Split Bill: Bill A
Item: Nasi Goreng, Kopi
Total Bill: Rp50.000
Dibayar: Rp50.000
```

## Tests required

### Entitlement tests

```txt
Bayar Penuh does not require entitlement.
payments_partial_payment unlocks DP only.
payments_multi_payment unlocks Multi Payment only.
payments_split_bill unlocks Split Bill only.
payments_split_payment no longer exists anywhere in active source.
```

### DP tests

```txt
DP amount < total creates confirmed + partial.
DP amount >= total rejected in DP endpoint.
DP is hidden/blocked without payments_partial_payment.
```

### Multi-payment tests

```txt
Multiple tender lines sum to total -> paid.
Sum greater than total -> rejected.
Sum less than total -> rejected as multi-payment.
Sum less than total can only be saved through explicit DP fallback with DP entitlement.
Multi-payment hidden/blocked without payments_multi_payment.
```

### Split bill tests

```txt
Cannot split draft order.
Can split confirmed order by selected items.
Can allocate partial quantity from item with quantity > 1.
Cannot allocate more quantity than available.
Cannot modify split bill items after payment exists.
Paying Bill A does not auto-pay Bill B.
Parent order aggregate paid/remaining is correct.
Split bill hidden/blocked without payments_split_bill.
```

### Report tests

```txt
DP outstanding appears as DP outstanding.
Split bill unpaid appears as split bill outstanding.
Multi-payment report shows tender breakdown.
```

### Receipt tests

```txt
DP receipt shows paid DP and remaining.
Multi-payment receipt shows method breakdown.
Split bill receipt shows bill label and selected items summary.
```

## Audit commands

Run after implementation:

```bash
rg -n "payments_split_payment|legacy alias|legacyAlias|compat|compatibility|fallback old|old key" apps packages shared migrations roadmap
```

Expected:

```txt
No active source code uses payments_split_payment.
No legacy alias/compat wording in active implementation.
Only roadmap/history text may mention removed terms if unavoidable, but prefer cleaning prompt/report text too.
```

## Validation commands

Run:

```bash
pnpm --filter @pos/api type-check
pnpm --filter @pos/application type-check
pnpm --filter @pos/infrastructure type-check
pnpm --filter @pos/terminal-web type-check
pnpm type-check
pnpm run db:check
pnpm --filter @pos/api test
```

Run focused frontend tests if available.

## Required implementation report

Create:

```txt
roadmap/orders/payment_flow_entitlement_separation_report.md
```

Report format:

```md
# Payment Flow Entitlement Separation Report

## Summary

## Clean refactor confirmation
- No legacy alias retained: yes/no
- payments_split_payment removed from active source: yes/no
- payments_split_bill is canonical: yes/no

## Product definitions applied
- Bayar Penuh:
- DP / Bayar Sebagian:
- Multi Payment:
- Split Bill:

## Entitlement changes
- payments_partial_payment independent: yes/no
- payments_multi_payment independent: yes/no
- payments_split_bill independent: yes/no
- marketplace cards separated: yes/no

## UI changes
- payment entry point separated: yes/no
- DP dialog/panel: yes/no
- Multi Payment dialog/panel: yes/no
- Split Bill item selection wizard: yes/no

## Backend changes
- payment_sessions added: yes/no
- DP endpoint/use case: yes/no
- Multi-payment endpoint/use case: yes/no
- Split bill tables/use cases: yes/no
- Split bill allocation immutable after payment: yes/no

## Reporting and receipt
- DP outstanding breakdown: yes/no
- Split bill outstanding breakdown: yes/no
- Multi tender breakdown: yes/no
- Flow-aware receipt text: yes/no

## Tests/commands run

## Remaining blockers
```

## Commit

Use commit message:

```bash
git commit -m "refactor(payments): separate DP multi payment and split bill flows"
```

Then push.

## Final response required

Return:

```txt
Payment flow clean refactor status:
Commit SHA:
Files changed:
No legacy alias retained: yes/no
payments_split_bill canonical: yes/no
Full payment base flow: yes/no
DP entitlement independent: yes/no
Multi-payment entitlement independent: yes/no
Split-bill entitlement independent: yes/no
payment_sessions added: yes/no
Split-bill item selection implemented: yes/no
Reports breakdown implemented: yes/no
Receipts flow-aware: yes/no
Tests/commands run:
Remaining blockers:
```
