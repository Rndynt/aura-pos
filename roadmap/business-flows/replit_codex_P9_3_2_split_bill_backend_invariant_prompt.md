# Replit/Codex Prompt P9.3.2 — Split Bill Backend Invariant Fix

Repository: `Rndynt/AuraPoS`

## Goal

Finish the remaining Split Bill backend rule so the POS payment flow is actually safe and readable.

P9.3.1 already moved frontend payment submission to the backend `SubmitPOSPayment` endpoint and fixed replay accounting for order paid amount and split paid amount. The remaining gap is this:

```txt
Backend Split Bill must explicitly validate the selected bill amount before it updates split/payment/order totals.
```

The target behavior must be clear for cashier and owner:

```txt
1. Cashier creates a split bill.
2. Cashier selects Bill A.
3. Cashier pays exactly the unpaid amount of Bill A.
4. Backend records the payment once.
5. Bill A becomes paid.
6. Parent order remains partial if other bills/items still unpaid.
7. Retry does not duplicate anything.
8. Overpaying Bill A is rejected with a readable message.
```

## Non-negotiable direction

This patch must be focused. Do not expand scope.

```txt
- Do not add provider, gateway, card, e-wallet, Midtrans, Xendit, or NorthFlow logic.
- Do not add support for old flow/method aliases.
- Do not add compatibility branch for old broken payment flows.
- Do not change payment methods beyond CASH, MANUAL_TRANSFER, MANUAL_QRIS.
- Do not change payment flows beyond FULL, DOWN_PAYMENT, MULTI_PAYMENT, SPLIT_BILL.
- Do not put businessProfile checks inside payment domain/application.
- Do not put UI/business-flow decisions inside infrastructure repository.
- Do not show database constraint names, enum internals, or raw SQL errors to cashier.
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

Payment line kinds remain only:

```txt
FULL_PAYMENT
DOWN_PAYMENT
REMAINING_PAYMENT
MULTI_PAYMENT_LINE
SPLIT_BILL_LINE
```

## Mandatory first step: inspect before coding

Before editing, inspect these files:

```txt
packages/infrastructure/repositories/payments/DrizzleSubmitPOSPaymentRepository.ts
packages/application/payments/SubmitPOSPayment.ts
packages/application/payments/POSPaymentCommand.ts
packages/application/payments/POSPaymentResult.ts
packages/application/payments/ports/SubmitPOSPaymentRepositoryPort.ts
apps/api/src/http/controllers/POSPaymentController.ts
apps/pos-terminal-web/src/features/pos-core/services/posPaymentSubmissionService.ts
apps/pos-terminal-web/src/features/pos-core/services/__tests__/posPaymentSubmissionService.test.ts
packages/infrastructure/db/schema/orders.schema.ts
roadmap/business-flows/P9_3_backend_submit_pos_payment_report.md
```

Search these patterns:

```bash
rg -n "SPLIT_BILL|orderBillSplits|amountPaid|amountDue|newLineTotal|targetBillId|splitIdMap|idempotencyKey" packages/infrastructure/repositories/payments/DrizzleSubmitPOSPaymentRepository.ts

rg -n "INVALID_SPLIT_BILL|Bill yang dipilih|melebihi|sudah lunas" apps/api/src packages/application packages/infrastructure

rg -n "SPLIT_BILL|split bill|Bill A|amountDue|amountPaid" apps/pos-terminal-web/src/features/pos-core apps/pos-terminal-web/src/features/pos-flows packages/application packages/domain
```

Expected understanding before coding:

```txt
- P9.3.1 already checks payment replay before incrementing order/split totals.
- Backend still needs explicit selected bill invariant validation.
- Frontend validation is not enough; backend must protect the database state.
```

## Current problem to fix

In `DrizzleSubmitPOSPaymentRepository`, Split Bill currently persists or updates split rows and increments the selected split by `newLineTotal`.

That is not enough. Backend must prove the selected bill is payable before it updates anything.

The backend must reject these cases:

```txt
- selected bill does not exist and cannot be created from request splits
- selected bill has amountDue <= 0
- selected bill is already fully paid
- requested new payment amount is greater than selected bill remaining
- requested new payment amount is less than selected bill remaining when the operation is meant to pay the selected bill fully
- targetBillId/clientBillId does not match any submitted split row
- split payment line has no selected bill identity
```

## Correct Split Bill invariant

For `SPLIT_BILL`, define the selected bill state before inserting new payment rows:

```txt
selectedBillAmountDue = amountDue from order_bill_splits or request splits
selectedBillAmountPaid = existing amountPaid from order_bill_splits, default 0 only for newly created split
selectedBillRemaining = selectedBillAmountDue - selectedBillAmountPaid
newLineTotal = sum of payment lines that are not idempotent replays
```

Rules:

```txt
- If all lines are idempotent replays, do not reject only because selectedBillRemaining is now 0. Return current aggregate safely.
- If newLineTotal > 0, selectedBillRemaining must be > 0.
- If newLineTotal > selectedBillRemaining, reject.
- If newLineTotal < selectedBillRemaining, reject for current P9.3.2 behavior unless a future explicit partial-per-bill mode is designed.
- If newLineTotal === selectedBillRemaining, proceed.
- Update selected split amountPaid by newLineTotal only once.
- Insert payment rows only for new lines.
- Update parent order paidAmount only by newLineTotal.
```

Use a small tolerance for currency comparison:

```ts
const EPSILON = 0.001;
```

## Required backend behavior

### Replay request

If cashier retries the exact same Bill A payment:

```txt
- existing payment row is found by deterministic idempotency key
- newLineTotal = 0
- selected split is not incremented again
- order paidAmount is not incremented again
- backend returns success with current aggregate state
```

### Valid Bill A payment

Example:

```txt
Bill A amountDue = 15,000
Bill A amountPaid = 0
newLineTotal = 15,000
```

Expected:

```txt
- accepted
- Bill A amountPaid becomes 15,000
- Bill A status becomes paid
- parent order paymentStatus remains partial if total order still has remaining amount
```

### Overpay selected bill

Example:

```txt
Bill A amountDue = 15,000
Bill A amountPaid = 0
newLineTotal = 20,000
```

Expected:

```txt
- reject before insert/update
- no payment row inserted
- no split amountPaid increment
- no order paidAmount increment
- user-safe error: "Jumlah pembayaran harus sama dengan sisa bill yang dipilih."
```

### Underpay selected bill

Example:

```txt
Bill A amountDue = 15,000
Bill A amountPaid = 0
newLineTotal = 10,000
```

Expected for this patch:

```txt
- reject before insert/update
- no payment row inserted
- no split amountPaid increment
- no order paidAmount increment
- user-safe error: "Jumlah pembayaran harus sama dengan sisa bill yang dipilih."
```

Reason:

```txt
P9.3.2 keeps Split Bill simple: selected bill payment pays exactly the selected bill remaining. Do not introduce partial-per-bill behavior now.
```

### Already paid selected bill

Example:

```txt
Bill A amountDue = 15,000
Bill A amountPaid = 15,000
newLineTotal = 15,000 new request with different idempotency key
```

Expected:

```txt
- reject
- user-safe error: "Bill yang dipilih sudah lunas."
```

## Implementation guidance

Update:

```txt
packages/infrastructure/repositories/payments/DrizzleSubmitPOSPaymentRepository.ts
```

Add a focused helper inside the repository file or a small private function near the split logic:

```ts
type SelectedSplitState = {
  clientBillId: string;
  splitNo: number;
  splitDbId?: string;
  amountDue: number;
  amountPaid: number;
  remaining: number;
};
```

Suggested helper behavior:

```txt
resolveSelectedSplitState({ tx, orderId, targetBillId, splits })
```

It should:

```txt
1. Resolve selected bill identity from targetBillId or payment line clientBillId.
2. Find request split by clientBillId.
3. Find existing DB split by orderId + splitNo, or orderId + clientBillId if available.
4. Use DB amountDue/amountPaid if DB split exists.
5. Use request amountDue/amountPaid only for a new split row.
6. Return selected bill due, paid, and remaining.
7. Throw user-safe error if selected bill cannot be resolved.
```

Important:

```txt
Do not trust frontend amountPaid over DB amountPaid when DB split row exists.
DB state is source of truth.
```

## Required transaction order

For `SPLIT_BILL`, the order must be:

```txt
1. Resolve/create/lock parent order.
2. Build deterministic idempotency keys.
3. Query existing payment rows.
4. Compute newLineTotal from non-replayed rows.
5. Resolve selected split state from DB/request.
6. Validate selected bill invariant.
7. Create/update split rows.
8. Insert only new payment rows with real split_id.
9. Update order paid_amount only by newLineTotal.
10. Return fresh aggregate.
```

If current code needs minor rearrangement to satisfy this, do it. Keep the patch focused.

## API error mapping

Update `apps/api/src/http/controllers/POSPaymentController.ts` only if needed.

Required user-safe messages:

```txt
INVALID_SPLIT_BILL
→ "Bill yang dipilih tidak valid atau sudah lunas."

SPLIT_BILL_AMOUNT_MISMATCH
→ "Jumlah pembayaran harus sama dengan sisa bill yang dipilih."

SPLIT_BILL_ALREADY_PAID
→ "Bill yang dipilih sudah lunas."
```

Do not expose internal details.

## User-readable flow to preserve

The final Split flow must stay simple:

```txt
Cashier chooses Split.
Cashier selects Bill A.
Cashier pays Bill A exactly.
Backend records Bill A payment once.
Bill A becomes paid.
Other bills remain unpaid/partial.
Parent order stays partial until everything is paid.
Retry does not duplicate anything.
```

Do not turn this into a complicated multi-step technical UI.

## Tests required

Add or update tests for backend repository/use case level. If repository tests are not easy in the current test setup, add the closest application/integration test available and document the limitation in the report.

Required cases:

```txt
1. SPLIT_BILL valid selected bill payment succeeds when newLineTotal equals selected bill remaining.
2. SPLIT_BILL overpay selected bill is rejected before payment insert.
3. SPLIT_BILL underpay selected bill is rejected before payment insert.
4. SPLIT_BILL already-paid selected bill rejects a new different-idempotency request.
5. SPLIT_BILL idempotent replay after Bill A is paid returns success and does not double-count split amountPaid.
6. SPLIT_BILL idempotent replay does not double-count order paidAmount.
7. SPLIT_BILL payment row uses real split_id after split row exists/is created.
8. SPLIT_BILL missing targetBillId/clientBillId is rejected with user-safe error.
```

Also keep existing payment tests passing:

```txt
- FULL payment
- DOWN_PAYMENT
- MULTI_PAYMENT
- frontend submit request mapping
- user-safe error mapping
```

## Validation commands

Run:

```bash
pnpm --filter @pos/domain type-check
pnpm --filter @pos/application type-check
pnpm --filter @pos/application test
pnpm --filter @pos/api type-check
pnpm --filter @pos/api test
pnpm --filter @pos/terminal-web type-check
pnpm --filter @pos/terminal-web test
pnpm type-check
```

Run grep checks:

```bash
rg -n "card|ewallet|provider|gateway|midtrans|xendit" packages/domain/payments packages/application/payments packages/infrastructure/repositories/payments apps/api/src/http/controllers/POSPaymentController.ts apps/pos-terminal-web/src/features/pos-core/services/posPaymentSubmissionService.ts
```

Expected:

```txt
No provider/card/e-wallet/gateway concepts added to built-in POS payment flow.
```

```bash
rg -n "full_payment|partial_payment_dp|normalizePOSPaymentFlow|compat|alias" packages/domain/payments packages/application/payments packages/infrastructure/repositories/payments apps/api/src/http/controllers/POSPaymentController.ts apps/pos-terminal-web/src/features/pos-core/services/posPaymentSubmissionService.ts
```

Expected:

```txt
No runtime support for old flow aliases. Tests/docs may mention rejected old strings only if already present.
```

```bash
rg -n "amountPaid.*newLineTotal|newLineTotal.*amountPaid|selectedBillRemaining|SPLIT_BILL_AMOUNT_MISMATCH|SPLIT_BILL_ALREADY_PAID" packages/infrastructure/repositories/payments/DrizzleSubmitPOSPaymentRepository.ts apps/api/src/http/controllers/POSPaymentController.ts
```

Expected:

```txt
Split selected bill invariant is visible in backend code.
```

## Required report update

Update:

```txt
roadmap/business-flows/P9_3_backend_submit_pos_payment_report.md
```

Add a new section:

```txt
## P9.3.2 Split Bill Backend Invariant Fix
```

Include:

```txt
1. What was still risky after P9.3.1
2. Selected bill invariant rule
3. Valid Bill A payment behavior
4. Overpay behavior
5. Underpay behavior
6. Already-paid selected bill behavior
7. Idempotent replay behavior
8. Files changed
9. Tests added/updated
10. Validation output
11. Final user-readable Split Bill flow
```

Be honest. Do not mark something complete if code does not prove it.

## Acceptance checklist

```txt
- [x] Backend explicitly validates selected split bill remaining.
- [x] Valid selected bill payment succeeds only when payment amount equals selected bill remaining.
- [x] Overpay selected bill is rejected before DB mutation.
- [x] Underpay selected bill is rejected before DB mutation.
- [x] Already-paid selected bill rejects new different-idempotency payment.
- [x] Idempotent replay of an already paid selected bill returns safely without double-counting.
- [x] Split amountPaid increments only by newly inserted payment rows.
- [x] Order paidAmount increments only by newly inserted payment rows.
- [x] Payment row uses real split_id when split row exists or is created.
- [x] Error messages are cashier-readable.
- [x] No provider/card/e-wallet/gateway logic added.
- [x] No old flow/method alias support added.
- [x] Report updated with P9.3.2 section.
- [x] Type-check and tests pass or any unrelated failure is documented clearly.
```

## Commit message

```txt
fix(pos): enforce split bill payment invariants
```
