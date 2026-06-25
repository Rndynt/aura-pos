# Replit/Codex Prompt P9.11 — Split Bill Persistence + Resume Flow Final Fix

Repository: `Rndynt/AuraPoS`

## 1. Goal

Fix Split Bill end-to-end so it behaves like a real persisted order-payment flow, not temporary UI state.

Current bug from manual test:

```txt
1. User creates Split Bill.
2. Bill A is paid Rp 26.000.
3. Order becomes partial with remaining amount Rp 84.400.
4. User opens the order again from Draft / existing order.
5. Split dialog is wrong:
   - Bill A resets to Rp 0.
   - Bill A is still clickable/editable.
   - Bill A does not show paid/locked state.
   - Bill B is selected but item list is empty.
   - Unpaid items are not shown for the next bill.
```

Expected behavior:

```txt
After Bill A is paid:
- Bill A remains visible as paid/locked.
- Bill A amountDue = original Bill A amount.
- Bill A amountPaid = original Bill A amount.
- Bill A status = PAID.
- Bill A cannot be selected for editing item assignment.
- Paid items assigned to Bill A cannot be moved or paid again.
- Active bill defaults to next unpaid bill, usually Bill B.
- The item list shows only unpaid/unassigned items.
- Remaining order amount matches unpaid items and unpaid bill totals.
```

The cashier must be able to continue split payment from an existing partial order without losing the previous bill state.

## 2. Non-negotiable rules

```txt
- Do not treat Split Bill as dialog-local state only.
- Do not reset split bills when reopening a draft/partial order.
- Do not allow paid bills to be edited.
- Do not allow paid items to be assigned again.
- Do not create duplicate payment rows on retry.
- Do not mix `clientBillId` with DB UUID `orderBillSplitId`.
- Do not add provider/card/e-wallet/gateway/NorthFlow logic.
- Do not add legacy compatibility branches or aliases.
- Do not show SQL/zod/internal errors to cashier.
- Do not solve this with UI-only hiding. Persist and hydrate state correctly.
- Do not add random migration files for patching. If schema is missing, update the current schema/baseline according to project convention and document exactly why.
```

Payment methods remain only:

```txt
CASH
MANUAL_TRANSFER
MANUAL_QRIS
```

Payment flows remain only:

```txt
FULL
DOWN_PAYMENT
MULTI_PAYMENT
SPLIT_BILL
```

## 3. Files to inspect before coding

Inspect carefully before changing anything:

```txt
apps/pos-terminal-web/src/components/pos/PaymentMethodDialog.tsx
apps/pos-terminal-web/src/components/pos/CombinedDraftSheet.tsx
apps/pos-terminal-web/src/pages/orders.tsx
apps/pos-terminal-web/src/features/pos-core/services/posPaymentSubmissionService.ts
apps/pos-terminal-web/src/features/pos-flows/retail/useRetailStandardPOSFlow.ts
apps/pos-terminal-web/src/features/pos-flows/restaurant/useRestaurantTableServicePOSFlow.ts
apps/pos-terminal-web/src/lib/api/hooks.ts
apps/api/src/http/controllers/POSPaymentController.ts
apps/api/src/http/controllers/OrdersController.ts
packages/application/payments/SubmitPOSPayment.ts
packages/application/payments/POSPaymentCommand.ts
packages/application/payments/POSPaymentResult.ts
packages/application/payments/ports/SubmitPOSPaymentRepositoryPort.ts
packages/infrastructure/repositories/payments/DrizzleSubmitPOSPaymentRepository.ts
packages/infrastructure/repositories/orders/OrderRepository.ts
packages/infrastructure/db/schema/orders.schema.ts
roadmap/business-flows/P9_4_payment_ux_finalization_report.md
```

Run:

```bash
rg -n "SPLIT_BILL|splitBills|splitItems|assignedSplitId|clientBillId|orderBillSplitId|order_bill_splits|orderBillSplits|amountPaid|amountDue|targetBillId|Bill A|Bill B|PAID|PARTIAL" apps packages migrations

rg -n "open draft|continue|draft|selectedOrder|PaymentMethodDialog|cartItems|order.items|orderItems|paidAmount|remaining" apps/pos-terminal-web/src
```

## 4. Required domain model

Split Bill needs persisted state at two levels:

```txt
1. Bill level:
   - Bill A / Bill B / Bill C identity.
   - amountDue.
   - amountPaid.
   - status: UNPAID / PARTIAL / PAID.
   - locked state derived from status.

2. Item assignment level:
   - which order item belongs to which bill.
   - quantity assigned if item quantity can be split partially later.
   - paid/locked derived from the bill/payment state.
```

Definitions:

```txt
clientBillId:
- UI bill id: A, B, C.
- Stable across dialog open/reopen.
- Not a UUID.

orderBillSplitId:
- DB UUID for persisted order_bill_splits row.
- Used after backend creates the split row.

orderItemId:
- DB UUID for persisted order item.
- Required to know which items were already assigned/paid.
```

Do not send `clientBillId: "A"` as `orderBillSplitId`.

## 5. Persistence requirement

### 5.1 Existing table check

Check whether the current schema already has enough fields/tables to persist item assignment.

Known existing concept:

```txt
order_bill_splits / orderBillSplits stores bill totals and status.
```

If there is no persisted split-item assignment table, add one cleanly.

Suggested table:

```txt
order_bill_split_items
```

Suggested columns:

```txt
id uuid primary key default gen_random_uuid()
order_id uuid not null references orders(id) on delete cascade
order_bill_split_id uuid not null references order_bill_splits(id) on delete cascade
order_item_id uuid not null references order_items(id) on delete cascade
client_bill_id varchar(128) not null
quantity numeric(12,3) not null default 1
amount numeric(12,2) not null default 0
created_at timestamp default now()
updated_at timestamp default now()
```

Constraints/indexes:

```txt
unique(order_id, order_item_id, client_bill_id)
index(order_id)
index(order_bill_split_id)
index(order_item_id)
```

If the project already supports order item quantity splitting, use quantity. If not, persist whole-item assignment first and document that partial quantity split is a later scope.

### 5.2 Schema/migration rule

This project is still in development. Do not add random patch migrations if the project convention is to change the main schema/baseline and use `db:push`.

Required:

```txt
- Update Drizzle schema in `packages/infrastructure/db/schema/orders.schema.ts`.
- If a SQL migration file is required by the current project migration policy, update the correct current migration/baseline, not a pile of repair migrations.
- Update `migrations/meta/_journal.json` only if the project actually uses generated migration files for this change.
- Explain in the report what schema storage is used.
```

## 6. Submit behavior requirement

When paying a selected split bill:

```txt
- Frontend sends the selected bill.
- Frontend sends assigned item ids for that selected bill.
- Backend persists/updates order_bill_splits.
- Backend persists item assignment rows.
- Backend inserts payment row idempotently.
- Backend updates split amountPaid/status.
- Backend updates order paidAmount/paymentStatus.
```

Important invariants:

```txt
- Paying Bill A must save both Bill A total and Bill A assigned items.
- Paying Bill A must lock Bill A after success.
- Retrying the same submit with same idempotency key must not duplicate payment, amountPaid, or item assignment.
- A paid bill cannot accept item reassignment.
- A paid item cannot appear as selectable/unassigned in future split sessions.
- Unpaid items remain available for Bill B / next bill.
```

## 7. Rehydrate behavior requirement

When opening PaymentMethodDialog for an existing order/draft/partial order:

```txt
1. Load order items from backend/read model.
2. Load existing bill splits.
3. Load split item assignments.
4. Build split UI state from persisted data.
5. Mark paid bills as locked.
6. Hide or disable paid items from the selectable list.
7. Default active bill to the first unpaid bill with amountDue = 0 or next available bill.
8. Show unpaid/unassigned items in the list.
```

Example after Bill A was paid Rp 26.000 and remaining order is Rp 84.400:

```txt
Bill A:
- label: Bill A
- amountDue: 26000
- amountPaid: 26000
- status: PAID
- locked: true
- visual: green/paid/locked badge
- click: disabled or read-only only

Bill B:
- label: Bill B
- amountDue: 0 until items are selected
- amountPaid: 0
- status: UNPAID
- locked: false
- active by default

Item list:
- shows only unpaid items totaling Rp 84.400
- does not show paid Bill A items as assignable
```

## 8. Frontend requirements

Update `PaymentMethodDialog.tsx` to support persisted split state.

### 8.1 Props / input model

Add or adapt props so the dialog can receive existing persisted split data:

```ts
type ExistingSplitBill = {
  id?: string;
  clientBillId: string;
  label: string;
  amountDue: number;
  amountPaid: number;
  status: "UNPAID" | "PARTIAL" | "PAID";
  items?: ExistingSplitBillItem[];
};

type ExistingSplitBillItem = {
  orderItemId: string;
  clientBillId: string;
  quantity: number;
  amount: number;
};
```

Use existing project naming if already available. Keep it readable.

### 8.2 Initialization

Initialization rules:

```txt
- Fresh cart: start with default editable Bill A/B UI.
- Existing order with no split state: start with default editable Bill A/B and existing order items.
- Existing order with split state: hydrate from persisted split state.
- Paid bills must not reset to Rp 0.
- Paid bill item assignment must not disappear.
```

### 8.3 Paid/locked bill UI

Paid bill tab should show clearly:

```txt
Bill A
Rp 26.000
Lunas
```

Behavior:

```txt
- Paid bill tab is read-only/disabled for assignment.
- If clicked, it may show a read-only summary, but must not become active editable target.
- Add bill button creates next unpaid bill only if needed.
```

### 8.4 Item list

For Split Bill item assignment list:

```txt
- Display unpaid/unassigned items for active unpaid bill.
- Paid items should either be hidden from assignable list or shown as locked in a separate paid summary section.
- Empty state must be accurate.
```

Bad empty state:

```txt
Pilih item untuk Bill B dulu
```

when there are actually unpaid items.

Good empty states:

```txt
- "Semua item sudah dibayar" if nothing remains.
- "Belum ada item untuk bill ini. Pilih item dari daftar di bawah." when list exists below.
- Never show empty list if unpaid items exist.
```

## 9. Backend/API read model requirements

Orders/draft APIs must return enough data to rehydrate split state.

Update read model in `OrdersController` / `OrderRepository` if missing:

```txt
order.items[]
order.payments[]
order.billSplits[] or order.splits[]
order.billSplitItems[] or nested items under each split
```

Minimum response shape:

```ts
{
  id: string;
  total_amount: number;
  paid_amount: number;
  payment_status: "unpaid" | "partial" | "paid";
  items: Array<{
    id: string;
    product_id: string;
    product_name: string;
    quantity: number;
    unit_price: number;
    total_price: number;
  }>;
  billSplits: Array<{
    id: string;
    clientBillId: string;
    label: string;
    splitNo: number;
    amountDue: number;
    amountPaid: number;
    status: "UNPAID" | "PARTIAL" | "PAID";
    items: Array<{
      orderItemId: string;
      quantity: number;
      amount: number;
    }>;
  }>;
}
```

Do not expose internal-only fields that cashier does not need.

## 10. Backend submit requirements

Update `DrizzleSubmitPOSPaymentRepository` / payment use case path as needed.

### 10.1 Persist split rows and item assignment together

All of this must be inside the same DB transaction:

```txt
- create/update order if fresh cart
- create/update order items if fresh cart
- create/update order_bill_splits
- create/update order_bill_split_items
- insert order_payments idempotently
- update split paid amount/status
- update order paid amount/status
```

### 10.2 Idempotency

The current split submit must be safe on retry.

Rules:

```txt
- Check existing payment by idempotency key before increasing amountPaid.
- If payment already exists, do not increment split.amountPaid again.
- Do not duplicate split item rows.
- Do not duplicate bill split rows.
- Do not duplicate order paid amount.
```

### 10.3 Validation

Validation rules:

```txt
- selected bill must have amountDue > 0.
- selected bill payment amount must equal selected bill remaining.
- selected bill must not already be PAID.
- selected bill item assignments must match selected bill amountDue.
- item cannot belong to a paid split and be submitted again.
- submitted item ids must belong to the same order.
```

User-safe errors:

```txt
- "Bill ini sudah lunas. Pilih bill lain yang belum dibayar."
- "Item bill belum dipilih. Pilih item yang ingin dibayar."
- "Jumlah bill tidak sesuai dengan item yang dipilih."
- "Item sudah pernah dibayar di bill lain. Muat ulang pesanan."
```

## 11. Continue draft / existing order integration

Check all entry points that can reopen existing orders:

```txt
- Draft button / CombinedDraftSheet -> Lanjut
- Orders page -> Proses Pembayaran / Lunasi Sisa
- Restaurant table service flow -> existing table order
- Retail flow -> continue saved order
```

Required behavior:

```txt
- Existing order data passed into PaymentMethodDialog must include persisted split state.
- Cart reconstruction must preserve DB orderItemId where available.
- If cart item has no orderItemId, it cannot be matched to paid split state. Fix the mapper.
- Opening split mode on an existing partially paid split order should immediately show paid/locked bills and unpaid items.
```

## 12. UX behavior for the screenshot case

Given:

```txt
Order total before Bill A payment: Rp 110.400
Bill A paid: Rp 26.000
Remaining: Rp 84.400
User opens draft and selects Split
```

Expected UI:

```txt
Left panel:
- Pembayaran Rp 84.400 or clearly "Sisa Rp 84.400" depending on dialog context.
- Flow tabs visible.
- Split active.
- Method selector for active unpaid bill.

Right panel:
- Bill A tab visible but locked/paid:
  Bill A · Rp 26.000 · Lunas
- Bill B active:
  Bill B · Rp 0 initially or current selected unpaid total
- Item list below shows unpaid items totaling Rp 84.400.
- Button disabled until Bill B has selected items.
- After selecting unpaid items, button shows:
  Bayar Bill B · Rp 84.400
```

Do not show an empty item area if unpaid items exist.

## 13. Tests required

Add/update tests where practical.

Minimum test cases:

```txt
1. Paying Bill A persists order_bill_splits row with amountDue/amountPaid/status PAID.
2. Paying Bill A persists item assignment rows.
3. Reopening the same order returns billSplits with Bill A paid and items attached.
4. PaymentMethodDialog hydrates Bill A as paid/locked, not Rp 0.
5. PaymentMethodDialog defaults active bill to Bill B when Bill A is paid.
6. Paid Bill A cannot be edited or selected as target for assignment.
7. Paid Bill A items do not appear in unpaid assignable list.
8. Unpaid items remain visible for Bill B.
9. Retrying same split payment does not double amountPaid.
10. Retrying same split payment does not duplicate payment row.
11. Retrying same split payment does not duplicate split item rows.
12. Split payment rejects selected paid bill with user-safe error.
13. Split payment rejects mismatched item total vs bill amount.
```

If component test stack is limited, add unit tests for pure mapper functions:

```txt
- buildSplitStateFromOrder(order)
- getAssignableItems(orderItems, persistedSplitItems)
- getNextUnpaidBill(splitBills)
- buildSplitPaymentPayload(activeBill, selectedItems)
```

## 14. Manual verification checklist

Use running app:

```txt
1. Add several items to cart.
2. Open Split.
3. Assign one item or a subset to Bill A.
4. Pay Bill A.
5. Confirm order becomes partial with remaining amount.
6. Open Draft / existing order again.
7. Open Split.
8. Verify Bill A is visible as paid/locked with original amount.
9. Verify active bill is Bill B or next unpaid bill.
10. Verify unpaid item list is visible and not empty when remaining items exist.
11. Assign remaining items to Bill B.
12. Pay Bill B.
13. Verify order becomes paid/lunas.
14. Reopen order detail and verify split summary shows Bill A and Bill B.
```

## 15. Report update

Update:

```txt
roadmap/business-flows/P9_4_payment_ux_finalization_report.md
```

Add section:

```txt
## P9.11 Split Bill Persistence + Resume Flow Final Fix
```

Include:

```txt
1. Screenshot problem analyzed.
2. Root cause found: UI state vs persisted split state.
3. Data model used for bill splits and split items.
4. Submit transaction behavior.
5. Rehydrate behavior from draft/existing order.
6. Paid/locked bill behavior.
7. Idempotency behavior.
8. Files changed.
9. Tests/manual verification.
10. Remaining limitations.
```

## 16. Acceptance checklist

```txt
- [ ] Split bill state is persisted, not dialog-local only.
- [ ] Bill A paid amount remains visible after reopening draft/order.
- [ ] Paid Bill A is locked/read-only.
- [ ] Paid Bill A cannot be used as active editable target.
- [ ] Paid Bill A items cannot be selected again.
- [ ] Active bill defaults to next unpaid bill.
- [ ] Unpaid items are visible for next bill after reopening.
- [ ] Empty state is accurate and never hides unpaid items.
- [ ] Split item assignment is persisted with order item ids.
- [ ] Order read model exposes bill splits and split item assignment.
- [ ] Split submit is idempotent on retry.
- [ ] Split amountPaid is not double-incremented on retry.
- [ ] Order paidAmount is not double-incremented on retry.
- [ ] Split payment can continue until order becomes fully paid.
- [ ] Split summary appears in order detail when data exists.
- [ ] No provider/card/e-wallet/gateway/NorthFlow logic added.
- [ ] No legacy compatibility added.
- [ ] Report updated.
```

## 17. Commit message

```txt
fix(pos): persist and resume split bill state
```

## Execution Report — 2026-06-25

Status: Implemented and validated for the current batch.

What changed:
- Added persisted split-bill item assignment storage via `order_bill_split_items` so bill/item state is no longer dialog-local only.
- Submit POS payment now carries selected split-bill item assignments, validates order ownership, blocks already-paid item reuse, and writes split rows/items/payments/order totals in one repository transaction.
- Order read model now returns `billSplits[].items[]` for split resume hydration.
- POS payment dialog now hydrates persisted paid bills, locks paid bill tabs/items, defaults to the first unpaid bill, and sends DB split/item identifiers without mixing `clientBillId` and `orderBillSplitId`.
- Active/draft order payment entry points pass persisted split state to the dialog and preserve existing split assignments during split-bill payment continuation.

Validation:
- Passed: `pnpm --filter @pos/infrastructure type-check`
- Passed: `pnpm --filter @pos/application type-check`
- Passed: `pnpm --filter @pos/terminal-web test`
- Warning/pre-existing failures: `pnpm --filter @pos/api type-check` still fails on unrelated API typing issues in auth/migrations/middleware/routes/tests.
- Warning/pre-existing failures: `pnpm --filter @pos/terminal-web type-check` still fails on unrelated DraftOrdersSheet and Employees icon typing issues; no P9.11 changed file errors remained after targeted fixes.

Schema storage note:
- This repo already contains SQL migrations for order payment metadata (`0016`, `0017`), so this batch adds a single forward migration `migrations/0018_order_bill_split_items.sql` plus the Drizzle schema table definition. This is not a random repair migration; it is the canonical storage addition required to persist split item assignment.

Remaining/hardening notes:
- Partial quantity split UI is now completed for whole-number item quantities. One order item row with quantity > 1 can be allocated across different split bills, while quantities already attached to paid bills remain locked.
- Existing full workspace/API type-check failures should be cleaned separately because they are outside this split-bill flow and pre-date this batch.

## Execution Report Update — 2026-06-25 Partial Quantity Completion

Status: Completed.

What changed:
- Split Bill UI now stores quantity allocation per order item per bill instead of a single item-to-bill mapping.
- Cashier can assign a subset of an item row quantity to the active bill with +/- controls.
- Paid quantities stay locked and cannot be moved or submitted again.
- Backend validation now sums paid quantity per order item and allows submitting only unpaid remaining quantity.

Validation:
- Passed: `pnpm --filter @pos/infrastructure type-check`
- Passed: `pnpm --filter @pos/terminal-web test`
- Warning/pre-existing failures: `pnpm --filter @pos/terminal-web type-check` still fails on unrelated DraftOrdersSheet and Employees icon typing issues.
