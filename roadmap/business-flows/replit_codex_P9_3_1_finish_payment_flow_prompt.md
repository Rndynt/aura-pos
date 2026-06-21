# Replit/Codex Prompt P9.3.1 — Finish POS Payment Flow End-to-End

Repository: `Rndynt/AuraPoS`

## Goal

Finish the payment flow until it is actually usable from the POS UI.

P9.3 added a backend `SubmitPOSPayment` use case and endpoint, but the frontend POS payment flow still uses the old orchestration path in several places. That means the application can still behave like this:

```txt
POS UI
→ create order manually
→ record payment manually
→ clear cart even when payment is only partial
→ retry can corrupt split bill state
```

That is not finished.

P9.3.1 must wire the POS UI to the new backend payment submission flow and remove the old payment orchestration from frontend business-flow hooks.

The target result must be simple and readable even for a nontechnical user:

```txt
1. Cashier adds items.
2. Cashier opens Payment.
3. Cashier chooses Bayar Penuh, DP, Multi, or Split.
4. Cashier chooses Tunai, Transfer Manual, or QRIS Manual.
5. POS sends one payment request to backend.
6. Backend creates/reuses the order and records the payment safely.
7. If fully paid, cart closes and receipt can print.
8. If partially paid, cart/payment session stays open and clearly shows the remaining bill.
9. Retry never creates duplicate order or duplicate payment.
```

## Non-negotiable direction

This project is still in development. Do not preserve old broken behavior.

```txt
- No legacy compatibility layer.
- No old alias normalization.
- No fallback to old createOrder + recordPayment payment orchestration.
- No "hardening" phase language.
- No card/ewallet/provider mapping.
- No NorthFlow changes.
- No businessProfile inside payment domain/application.
- No plan-name hardcoding.
- No raw database/FK/zod enum error shown to cashier.
```

Payment methods stay only:

```txt
CASH
MANUAL_TRANSFER
MANUAL_QRIS
```

Payment flows stay only:

```txt
FULL
DOWN_PAYMENT
MULTI_PAYMENT
SPLIT_BILL
```

Payment line kinds stay only:

```txt
FULL_PAYMENT
DOWN_PAYMENT
REMAINING_PAYMENT
MULTI_PAYMENT_LINE
SPLIT_BILL_LINE
```

## Mandatory first step: analyze before editing

Before writing code, inspect the current implementation and write a short internal implementation plan in the final report.

Analyze these files carefully:

```txt
packages/application/payments/SubmitPOSPayment.ts
packages/application/payments/POSPaymentCommand.ts
packages/application/payments/POSPaymentResult.ts
packages/application/payments/ports/SubmitPOSPaymentRepositoryPort.ts
packages/application/payments/ports/POSPaymentOrderTypePort.ts
packages/infrastructure/repositories/payments/DrizzleSubmitPOSPaymentRepository.ts
packages/infrastructure/repositories/payments/DrizzlePOSPaymentOrderTypeRepository.ts
apps/api/src/http/controllers/POSPaymentController.ts
apps/api/src/http/routes/pos.ts
apps/api/src/http/routes/index.ts
apps/pos-terminal-web/src/features/pos-core/services/posPaymentSubmissionService.ts
apps/pos-terminal-web/src/features/pos-flows/retail/useRetailStandardPOSFlow.ts
apps/pos-terminal-web/src/features/pos-flows/restaurant/useRestaurantTableServicePOSFlow.ts
apps/pos-terminal-web/src/lib/api/hooks.ts
apps/pos-terminal-web/src/components/pos/PaymentMethodDialog.tsx
packages/infrastructure/db/schema/orders.schema.ts
migrations/0017_p9_3_order_bill_splits_client_bill_id.sql
```

Also search these patterns:

```bash
rg -n "createOrderMutation\.mutateAsync|recordPaymentMutation\.mutateAsync|createAndPay|recordPayment\(|createOrder\(" apps/pos-terminal-web/src/features/pos-core apps/pos-terminal-web/src/features/pos-flows apps/pos-terminal-web/src/lib

rg -n "pos/payments/submit|SubmitPOSPayment|submitPOSPayment" apps packages

rg -n "cart\.clearCart\(|shouldClearCart|paymentSessionIdRef" apps/pos-terminal-web/src/features/pos-core apps/pos-terminal-web/src/features/pos-flows apps/pos-terminal-web/src/components/pos

rg -n "full_payment|partial_payment_dp|normalizePOSPaymentFlow|full\b|dp\b|multi\b|split\b" apps/pos-terminal-web/src/features/pos-core packages/domain packages/application apps/api/src
```

Expected understanding before coding:

```txt
- Backend endpoint exists but frontend is not fully using it.
- Retail flow still builds dependencies with createOrder, recordPayment, createAndPay.
- posPaymentSubmissionService still has old orchestration responsibilities.
- Partial payment can still clear cart/session incorrectly.
- Split bill retry can update split amountPaid before idempotent payment replay is detected.
- Required P9.3 report is missing.
```

## Current concrete problems to fix

### Problem 1 — Frontend still does old orchestration

`useRetailStandardPOSFlow` still creates a dependencies object with:

```txt
createOrder
updateOrder
recordPayment
createAndPay
```

Then it passes those dependencies into frontend `submitPOSPayment`.

This must be removed for payment submission.

Correct direction:

```txt
Frontend payment submit must call one endpoint only:
POST /api/pos/payments/submit
```

Do not keep old payment submit sequencing in business-flow hooks.

### Problem 2 — posPaymentSubmissionService still owns backend sequencing

`apps/pos-terminal-web/src/features/pos-core/services/posPaymentSubmissionService.ts` still does this kind of behavior:

```txt
- createOrder for fresh cart
- record payment rows
- createAndPay shortcut
- paymentSessionOrderCache in frontend memory
```

P9.3.1 must replace it with a frontend command builder/client boundary only.

Allowed responsibility:

```txt
- convert UI payment input into canonical SubmitPOSPayment request
- call submitPOSPayment API hook/client
- normalize response for UI
- convert error to user-safe message
```

Forbidden responsibility:

```txt
- manually create orders
- manually record payment rows
- maintain parent order retry cache as primary safety mechanism
- decide DB split persistence
```

### Problem 3 — PARTIAL clears cart/session

Any path like this is wrong when `result.shouldClearCart === false`:

```ts
cart.clearCart();
setPaymentMethodDialogOpen(false);
setLocation("/pos");
```

Correct behavior:

```txt
If result.status = PAID:
- close payment dialog
- clear cart/session
- navigate/refresh as needed
- receipt may print

If result.status = PARTIAL:
- do not clear cart/session
- keep or update payment session with orderId/orderNumber/paidAmount/remainingAmount/splits
- show clear message: "Pembayaran sebagian tersimpan"
- show remaining bill
- allow cashier to continue payment later without duplicate order
```

### Problem 4 — Split bill retry can double-count split amountPaid

Current repository updates `order_bill_splits.amount_paid` before checking whether the payment row is an idempotent replay.

Correct behavior:

```txt
1. Build deterministic idempotency key for the selected split payment line first.
2. Check existing payment row for that idempotency key first.
3. If existing payment row exists:
   - do not add to order_bill_splits.amount_paid again
   - do not add to orders.paid_amount again
   - return replay-safe aggregate result
4. If no existing payment row exists:
   - create/update split row
   - insert payment row
   - update split amountPaid exactly once
   - update order paid_amount exactly once
```

### Problem 5 — Order paid_amount can double-count idempotent replay

Current backend result logic may add `lineTotal` to `orderPaidBefore` even when all submitted lines already exist as idempotent replays.

Fix rules:

```txt
- Track actual newly inserted payment amount separately from replayed existing amount.
- Only newly inserted successful rows increment orders.paid_amount.
- Existing replayed rows must be returned but must not update paid_amount again.
- The result paidAmount must reflect database state after transaction, not a naive previous + requested lineTotal calculation.
```

### Problem 6 — Missing report

Create the required report:

```txt
roadmap/business-flows/P9_3_backend_submit_pos_payment_report.md
```

The report must be honest. Do not mark checklist complete unless the code actually satisfies it.

## Required frontend design

### Add API hook/client

Add a frontend API call in the existing API layer:

```txt
apps/pos-terminal-web/src/lib/api/hooks.ts
```

Suggested hook:

```ts
export type SubmitPOSPaymentRequest = {
  source: "FRESH_CART" | "SAVED_ORDER" | "ACTIVE_ORDER";
  clientPaymentSessionId: string;
  orderId?: string;
  orderNumber?: string;
  order?: {
    items: Array<any>;
    order_type_id?: string | null;
    customer_name?: string;
    table_number?: string;
    notes?: string;
    tax_rate?: number;
    service_charge_rate?: number;
    fulfillment_mode?: "standard" | "instant";
  };
  payment: {
    flow: "FULL" | "DOWN_PAYMENT" | "MULTI_PAYMENT" | "SPLIT_BILL";
    paymentKind?: "FULL_PAYMENT" | "DOWN_PAYMENT" | "REMAINING_PAYMENT" | "MULTI_PAYMENT_LINE" | "SPLIT_BILL_LINE";
    targetBillId?: string;
    lines: Array<{
      method: "CASH" | "MANUAL_TRANSFER" | "MANUAL_QRIS";
      amount: number;
      receivedAmount?: number;
      referenceNote?: string;
      clientBillId?: string;
      orderBillSplitId?: string;
    }>;
    splits?: Array<{
      clientBillId: string;
      label: string;
      splitNo: number;
      amountDue: number;
      amountPaid?: number;
      status?: "UNPAID" | "PARTIAL" | "PAID";
    }>;
  };
};

export function useSubmitPOSPayment() {
  return useMutation<SubmitPOSPaymentResponse, Error, SubmitPOSPaymentRequest>({
    mutationFn: (payload) => mutateWithTenantHeader("POST", "/api/pos/payments/submit", payload),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
      queryClient.invalidateQueries({ queryKey: ["/api/orders/open"] });
      if (result?.orderId) queryClient.invalidateQueries({ queryKey: ["/api/orders", result.orderId] });
      queryClient.invalidateQueries({ queryKey: ["/api/catalog/products"] });
    },
  });
}
```

Shape can differ, but the endpoint and intent must remain.

### Replace posPaymentSubmissionService

Refactor `posPaymentSubmissionService.ts` so it becomes a command mapper and UI-safe submit adapter.

Suggested exported functions:

```txt
buildSubmitPOSPaymentRequest(input)
submitPOSPayment(input, deps)
toUserSafePaymentError(error)
```

But `deps` must no longer contain `createOrder`, `recordPayment`, or `createAndPay`.

New dependency shape should be only:

```ts
type POSPaymentSubmissionDependencies = {
  submitPayment: (payload: SubmitPOSPaymentRequest) => Promise<SubmitPOSPaymentResponse>;
};
```

### Fresh cart request mapping

For fresh cart, request should look like:

```txt
source = FRESH_CART
clientPaymentSessionId = stable session id
order = current cart payload
payment = canonical payment command
```

Do not include `amount` and `payment_method` as separate old create-and-pay fields in `cartPayload`.

### Saved order request mapping

For saved draft/continued order:

```txt
source = SAVED_ORDER
orderId = continued order ID
order = updated order payload only if still needed before payment
payment = canonical payment command
```

If the current flow updates the draft before payment, keep update only if it is truly needed for saved draft editing. Do not use update as part of payment persistence itself.

### Active order request mapping

For active order:

```txt
source = ACTIVE_ORDER
orderId = active order ID
payment = canonical payment command
```

No cart reload should be required just to pay an active order.

## Required backend fix: idempotency ordering

Fix `packages/infrastructure/repositories/payments/DrizzleSubmitPOSPaymentRepository.ts`.

### Correct transaction algorithm

Use this exact conceptual order:

```txt
1. Resolve/create/lock order.
2. Calculate current total and paid from locked database row.
3. Build deterministic idempotency keys for all requested payment lines.
4. Query existing payment rows for these keys.
5. Determine which lines are new and which are replayed.
6. Validate flow using only the unpaid remaining amount after existing DB state.
7. For SPLIT_BILL:
   - persist split rows if needed
   - for selected split, calculate amount already paid from DB state
   - only add newly inserted line amount to split amountPaid
8. Insert only new payment rows.
9. Update order paid_amount by sum(newly inserted successful rows), not requested lineTotal.
10. Return fresh order/payment/split aggregate from DB state.
```

### Important details

```txt
- If all requested rows are idempotent replays, do not update order paid_amount.
- If selected split payment is replayed, do not update order_bill_splits.amount_paid.
- If a mixed request has one replayed row and one new row, only the new row increments totals.
- If order is already PAID and request is replay, return success with current aggregate.
- If order is already PAID and request is new, reject with user-safe overpayment message.
```

## Required user-readable payment flows

Make the report describe these flows in simple language.

### Bayar Penuh

```txt
Cashier chooses Bayar Penuh.
Cashier chooses payment method.
Cashier confirms payment.
Backend creates/reuses order and records one full payment row.
Order becomes paid.
Cart clears.
Receipt can print.
```

### DP

```txt
Cashier chooses DP.
Cashier inputs DP amount.
Backend creates/reuses order and records DP payment row.
Order becomes partial.
Cart/payment session does not disappear as if paid.
Cashier can later pay remaining amount.
Final remaining payment records REMAINING_PAYMENT.
```

### Multi

```txt
Cashier chooses Multi.
Cashier enters up to two payment lines, for example Tunai + QRIS Manual.
Sum must equal remaining bill.
Backend records both rows in one transaction.
Order becomes paid only when total is covered.
No manual create-order then record-payment loop remains in frontend.
```

### Split

```txt
Cashier chooses Split.
Cashier assigns item or amount to Bill A/B/etc.
Cashier may pay Bill A even if other items are not assigned yet.
Backend creates/reuses parent order once.
Backend persists bill split rows.
Backend records payment row tied to selected bill.
Bill A can become paid while parent order remains partial.
Cart/session keeps remaining bill visible.
Retry does not duplicate parent order, payment row, order paid amount, or split paid amount.
```

## Files that must be changed or verified

At minimum inspect and update as needed:

```txt
apps/pos-terminal-web/src/lib/api/hooks.ts
apps/pos-terminal-web/src/features/pos-core/services/posPaymentSubmissionService.ts
apps/pos-terminal-web/src/features/pos-flows/retail/useRetailStandardPOSFlow.ts
apps/pos-terminal-web/src/features/pos-flows/restaurant/useRestaurantTableServicePOSFlow.ts
apps/pos-terminal-web/src/components/pos/PaymentMethodDialog.tsx
packages/infrastructure/repositories/payments/DrizzleSubmitPOSPaymentRepository.ts
packages/application/payments/SubmitPOSPayment.ts
packages/application/payments/POSPaymentCommand.ts
packages/application/payments/POSPaymentResult.ts
apps/api/src/http/controllers/POSPaymentController.ts
roadmap/business-flows/P9_3_backend_submit_pos_payment_report.md
```

## Acceptance checklist

Do not mark complete until true.

```txt
- [ ] POS frontend calls POST /api/pos/payments/submit for payment submission.
- [ ] Frontend payment submit no longer manually orchestrates createOrder + recordPayment.
- [ ] Business-flow hooks do not pass createOrder/recordPayment/createAndPay dependencies into payment submission.
- [ ] posPaymentSubmissionService no longer owns backend order/payment sequencing.
- [ ] Fresh cart FULL goes through SubmitPOSPayment endpoint.
- [ ] Fresh cart DP goes through SubmitPOSPayment endpoint.
- [ ] Fresh cart MULTI goes through SubmitPOSPayment endpoint.
- [ ] Fresh cart SPLIT goes through SubmitPOSPayment endpoint.
- [ ] ACTIVE_ORDER payment goes through SubmitPOSPayment endpoint.
- [ ] SAVED_ORDER payment goes through SubmitPOSPayment endpoint or has a clearly documented pre-payment draft update followed by SubmitPOSPayment.
- [ ] PARTIAL result does not clear cart/session.
- [ ] PAID result clears cart/session.
- [ ] Split bill retry does not double-count order_bill_splits.amount_paid.
- [ ] Idempotent payment replay does not double-count orders.paid_amount.
- [ ] Split bill payment row uses real split_id when split row exists.
- [ ] Invalid order_type_id shows user-safe message, not FK constraint name.
- [ ] Raw enum/zod/database errors are not shown to cashier.
- [ ] Payment methods remain only CASH, MANUAL_TRANSFER, MANUAL_QRIS.
- [ ] Payment flows remain only FULL, DOWN_PAYMENT, MULTI_PAYMENT, SPLIT_BILL.
- [ ] No card/ewallet/provider mapping was added.
- [ ] No legacy alias compatibility was added.
- [ ] Report file exists and documents the final user-readable flow.
```

## Tests required

Add or update tests for these cases:

```txt
1. Frontend submit request for FULL uses /api/pos/payments/submit and not createAndPay.
2. Frontend submit request for DP returns PARTIAL and does not clear cart/session.
3. Frontend submit request for MULTI sends one backend submit request with two lines.
4. Frontend submit request for SPLIT sends one backend submit request with target bill and splits.
5. Retail flow no longer passes createOrder/recordPayment/createAndPay dependencies to payment submission.
6. Split idempotent replay does not increment split amountPaid twice.
7. Payment idempotent replay does not increment order paidAmount twice.
8. Invalid order_type_id returns user-safe error message.
9. Old aliases are rejected; no compatibility normalization added.
10. POS cashier never sees FK constraint or invalid enum text.
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

Also run grep checks:

```bash
rg -n "createOrderMutation\.mutateAsync|recordPaymentMutation\.mutateAsync|createAndPay|recordPayment\(|createOrder\(" apps/pos-terminal-web/src/features/pos-core apps/pos-terminal-web/src/features/pos-flows apps/pos-terminal-web/src/lib
```

Expected:

```txt
No frontend payment submit path manually sequences createOrder + recordPayment.
Any remaining create/update order usage must be for draft save/edit only, not payment submission.
```

```bash
rg -n "cart\.clearCart\(\)" apps/pos-terminal-web/src/features/pos-core apps/pos-terminal-web/src/features/pos-flows apps/pos-terminal-web/src/components/pos
```

Expected:

```txt
Payment success clears cart only behind result.shouldClearCart === true.
Draft discard/manual clear buttons may still clear cart.
```

```bash
rg -n "full_payment|partial_payment_dp|normalizePOSPaymentFlow|full\b|dp\b|multi\b|split\b" apps/pos-terminal-web/src/features/pos-core packages/domain packages/application apps/api/src
```

Expected:

```txt
No old alias compatibility in runtime code.
Docs/tests may mention old aliases only to prove rejection.
```

```bash
rg -n "card|ewallet|provider|gateway|midtrans|xendit" packages/domain/payments packages/application/payments apps/pos-terminal-web/src/features/pos-core/services/posPaymentSubmissionService.ts apps/api/src/http/controllers/POSPaymentController.ts
```

Expected:

```txt
No provider/card/ewallet concepts in built-in POS payment flow.
```

## Required report

Create or update:

```txt
roadmap/business-flows/P9_3_backend_submit_pos_payment_report.md
```

The report must include:

```txt
1. Summary
2. What was still broken after P9.3
3. Files inspected before coding
4. Backend SubmitPOSPayment final flow
5. Frontend SubmitPOSPayment final flow
6. User-readable Bayar Penuh flow
7. User-readable DP flow
8. User-readable Multi flow
9. User-readable Split flow
10. Order type guard behavior
11. Split bill retry/idempotency fix
12. Cart/session clear rules
13. User-safe error behavior
14. Files changed
15. Tests added/updated
16. Validation output
17. Grep cleanup output
18. Remaining limitations, if any
19. Final acceptance checklist
```

## Commit message

```txt
fix(pos): finish submit payment flow integration
```
