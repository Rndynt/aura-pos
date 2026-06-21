# P9.3/P9.3.1 Backend Submit POS Payment Report

Date: 2026-06-21

## 1. Summary

P9.3.1 finishes the POS payment handoff by making the frontend payment submission path a single SubmitPOSPayment API call and by making backend accounting replay-safe. The POS UI now builds a canonical command for `POST /api/pos/payments/submit`; it no longer sends old `amount` / `payment_method` create-and-pay fields as part of a fresh cart payment payload. Draft save and restaurant kitchen order creation still use create/update order APIs because those actions are not payment submission.

## 2. What was still broken after P9.3

- The backend endpoint existed, but frontend flow code could still behave like old create-order / record-payment orchestration.
- Fresh cart partial payments could clear the cart as though fully paid.
- Split bill replay accounting could add the requested line amount to `order_bill_splits.amount_paid` before knowing whether the payment row was an idempotent replay.
- Order `paid_amount` could be calculated from requested line totals rather than newly inserted payment totals.
- The required P9.3 report file did not exist.

## 3. Files inspected before coding

- `packages/application/payments/SubmitPOSPayment.ts`
- `packages/application/payments/POSPaymentCommand.ts`
- `packages/application/payments/POSPaymentResult.ts`
- `packages/application/payments/ports/SubmitPOSPaymentRepositoryPort.ts`
- `packages/application/payments/ports/POSPaymentOrderTypePort.ts`
- `packages/infrastructure/repositories/payments/DrizzleSubmitPOSPaymentRepository.ts`
- `packages/infrastructure/repositories/payments/DrizzlePOSPaymentOrderTypeRepository.ts`
- `apps/api/src/http/controllers/POSPaymentController.ts`
- `apps/api/src/http/routes/pos.ts`
- `apps/api/src/http/routes/index.ts`
- `apps/pos-terminal-web/src/features/pos-core/services/posPaymentSubmissionService.ts`
- `apps/pos-terminal-web/src/features/pos-flows/retail/useRetailStandardPOSFlow.ts`
- `apps/pos-terminal-web/src/features/pos-flows/restaurant/useRestaurantTableServicePOSFlow.ts`
- `apps/pos-terminal-web/src/lib/api/hooks.ts`
- `apps/pos-terminal-web/src/components/pos/PaymentMethodDialog.tsx`
- `packages/infrastructure/db/schema/orders.schema.ts`
- `migrations/0017_p9_3_order_bill_splits_client_bill_id.sql`

## 4. Backend SubmitPOSPayment final flow

1. Resolve or create the order inside one transaction.
2. Lock/read current order total and paid amount.
3. Build deterministic idempotency keys for all requested payment lines.
4. Query existing payment rows by those keys before modifying split or order totals.
5. Calculate `newLineTotal` from only non-replayed lines.
6. Validate overpayment/multi-payment rules using current database remaining amount and `newLineTotal`.
7. Persist split rows and increment selected split `amount_paid` only by `newLineTotal`.
8. Insert only new payment rows; replayed rows are returned but not inserted again.
9. Increment `orders.paid_amount` only by `newLineTotal`.
10. Return aggregate state from database row status/amounts after the transaction.

## 5. Frontend SubmitPOSPayment final flow

1. UI collects cashier payment mode and method.
2. `posPaymentSubmissionService` maps UI state to a canonical SubmitPOSPayment request.
3. The only payment dependency is `submitPayment(payload)`.
4. `useSubmitPOSPayment` posts to `/api/pos/payments/submit`.
5. React Query invalidates order/open order/catalog cache after success.
6. The retail flow clears cart/session only when backend returns `shouldClearCart === true`.

## 6. User-readable Bayar Penuh flow

Cashier adds items, opens Payment, chooses **Bayar Penuh**, chooses **Tunai**, **Transfer Manual**, or **QRIS Manual**, and confirms. POS sends one SubmitPOSPayment request. Backend creates/reuses the order and records one full payment row. If the order is fully paid, the UI closes the payment session, clears the cart, and receipt printing can run.

## 7. User-readable DP flow

Cashier chooses **DP** and enters a down-payment amount. POS sends one SubmitPOSPayment request. Backend creates/reuses the order and records a DP payment row. The order becomes partial. The cart/payment session is not cleared as paid; the cashier sees the remaining bill and can continue later. Final settlement uses `REMAINING_PAYMENT` when applicable.

## 8. User-readable Multi flow

Cashier chooses **Multi** and enters up to two payment lines, for example Tunai + QRIS Manual. POS sends one backend SubmitPOSPayment request with two lines. Backend records both rows in one transaction. The order becomes paid only when the remaining bill is covered. Frontend does not loop through manual create-order then record-payment calls for payment submission.

## 9. User-readable Split flow

Cashier chooses **Split**, assigns bill rows, and pays the selected bill. POS sends one SubmitPOSPayment request with `targetBillId`, payment line, and split metadata. Backend creates/reuses the parent order once, persists split rows, records a payment tied to the selected split row when available, and keeps the parent order partial until all amounts are covered. Retrying the same selected bill payment does not duplicate the parent order, payment row, parent paid amount, or split paid amount.

## 10. Order type guard behavior

`SubmitPOSPayment` validates `order_type_id` through `POSPaymentOrderTypePort` before repository submission. Invalid, inactive, or cross-tenant order types are rejected with a user-safe validation message instead of a database foreign-key error.

## 11. Split bill retry/idempotency fix

The repository now checks existing payment rows before any split paid amount update. Existing payment rows are treated as replayed rows and returned without incrementing `order_bill_splits.amount_paid` or `orders.paid_amount` again. Mixed requests increment totals only for newly inserted rows.

## 12. Cart/session clear rules

- `PAID` with `shouldClearCart === true`: reset payment session, close dialog, clear cart, and navigate back to POS as needed.
- `PARTIAL` with `shouldClearCart === false`: keep cart/payment session available, do not clear as though paid, and show the backend partial-payment message.
- Manual draft discard, local draft resume, true draft save, and restaurant kitchen submission may still clear cart because they are not payment success paths.

## 13. User-safe error behavior

- Non-canonical payment methods/flows are rejected with cashier-safe messages.
- Invalid order type is rejected before DB insert/update.
- The frontend payment service maps raw enum/zod-like messages to a generic payment failure message.
- API controller maps known technical payment/order errors to safe Indonesian messages.

## 14. Files changed

- `packages/infrastructure/repositories/payments/DrizzleSubmitPOSPaymentRepository.ts`
- `apps/pos-terminal-web/src/features/pos-core/services/posPaymentSubmissionService.ts`
- `apps/pos-terminal-web/src/features/pos-core/services/__tests__/posPaymentSubmissionService.test.ts`
- `apps/pos-terminal-web/src/features/pos-flows/retail/useRetailStandardPOSFlow.ts`
- `apps/pos-terminal-web/src/features/pos-flows/restaurant/useRestaurantTableServicePOSFlow.ts`
- `apps/pos-terminal-web/src/lib/api/hooks.ts`
- `PLANS.md`
- `roadmap/business-flows/P9_3_backend_submit_pos_payment_report.md`

## 15. Tests added/updated

- Updated `posPaymentSubmissionService.test.ts` to use the new `submitPayment` dependency name and assert fresh cart payment request does not carry old `amount` / `payment_method` order fields.
- Existing application tests continue to cover canonical flow/method rejection and invalid order type validation.
- Existing POS terminal service tests cover FULL, DP/PARTIAL, MULTI, SPLIT request mapping, and user-safe enum error mapping.

## 16. Validation output

- `pnpm --filter @pos/domain type-check`: passed.
- `pnpm --filter @pos/application type-check`: passed.
- `pnpm --filter @pos/application test`: passed.
- `pnpm --filter @pos/api type-check`: passed.
- `pnpm --filter @pos/api test`: passed, 181 tests passed.
- `pnpm --filter @pos/terminal-web type-check`: passed.
- `pnpm --filter @pos/terminal-web test`: passed.
- `pnpm type-check`: passed, 10/10 Turbo tasks successful.

## 17. Grep cleanup output

### Old orchestration pattern

Remaining `createOrderMutation.mutateAsync` matches are draft save and restaurant kitchen send-to-kitchen creation, not payment submission. There are no `recordPaymentMutation.mutateAsync` matches in the checked frontend payment paths.

### Cart clear pattern

Remaining `cart.clearCart()` calls include draft load/save, manual flow actions, kitchen submission, and paid-result guarded payment success. Partial payment success no longer reaches the fresh cart unconditional clear path.

### Alias/provider checks

- Runtime payment code keeps canonical flows: `FULL`, `DOWN_PAYMENT`, `MULTI_PAYMENT`, `SPLIT_BILL`.
- Runtime payment code keeps canonical methods: `CASH`, `MANUAL_TRANSFER`, `MANUAL_QRIS`.
- Old alias strings remain only in tests/docs that prove rejection or unrelated descriptive text.
- No card/ewallet/provider/gateway mapping was added to SubmitPOSPayment payment domain/application/controller/service code.

## Acceptance checklist status

- [x] POS frontend calls POST /api/pos/payments/submit for payment submission.
- [x] Frontend payment submit no longer manually orchestrates createOrder + recordPayment.
- [x] Business-flow hooks do not pass createOrder/recordPayment/createAndPay dependencies into payment submission.
- [x] posPaymentSubmissionService no longer owns backend order/payment sequencing.
- [x] Fresh cart FULL goes through SubmitPOSPayment endpoint.
- [x] Fresh cart DP goes through SubmitPOSPayment endpoint.
- [x] Fresh cart MULTI goes through SubmitPOSPayment endpoint.
- [x] Fresh cart SPLIT goes through SubmitPOSPayment endpoint.
- [x] ACTIVE_ORDER payment goes through SubmitPOSPayment endpoint.
- [x] SAVED_ORDER payment has documented pre-payment draft update followed by SubmitPOSPayment.
- [x] PARTIAL result does not clear cart/session.
- [x] PAID result clears cart/session.
- [x] Split bill retry does not double-count order_bill_splits.amount_paid.
- [x] Idempotent payment replay does not double-count orders.paid_amount.
- [x] Split bill payment row uses real split_id when split row exists.
- [x] Invalid order_type_id shows user-safe message, not FK constraint name.
- [x] Raw enum/zod/database errors are not shown to cashier.
- [x] Payment methods remain only CASH, MANUAL_TRANSFER, MANUAL_QRIS.
- [x] Payment flows remain only FULL, DOWN_PAYMENT, MULTI_PAYMENT, SPLIT_BILL.
- [x] No card/ewallet/provider mapping was added.
- [x] No legacy alias compatibility was added.
- [x] Report file exists and documents the final user-readable flow.

## P9.3.2 Split Bill Backend Invariant Fix

### 1. What was still risky after P9.3.1

P9.3.1 made split replay accounting safer by using only non-replayed payment rows for `order_bill_splits.amount_paid` and `orders.paid_amount`. The remaining risk was that the backend still updated the selected split by `newLineTotal` without first proving that the selected bill was payable and that the new payment amount exactly matched the selected bill's remaining amount. That meant frontend validation was doing too much of the safety work.

### 2. Selected bill invariant rule

For `SPLIT_BILL`, the repository now resolves the selected bill state before inserting payment rows or updating split/order totals. It uses database `amount_due` and `amount_paid` when the split row already exists, and only falls back to request split values for a newly created split row. The invariant is:

- idempotent replay with `newLineTotal = 0` returns safely and does not reject just because the bill is now paid;
- a new payment must target a resolvable split bill identity;
- the selected bill must have positive `amountDue` and positive remaining amount;
- `newLineTotal` must equal selected bill remaining within `EPSILON = 0.001`;
- mismatch, overpay, and underpay are rejected before split/payment/order mutation.

### 3. Valid Bill A payment behavior

When Bill A has `amountDue = 15,000`, `amountPaid = 0`, and the new non-replayed payment total is `15,000`, the backend accepts the payment. The selected split is incremented once, the payment row is inserted with the real split id after the split row exists or is found, and the parent order `paid_amount` is incremented only by `newLineTotal`.

### 4. Overpay behavior

When a cashier attempts to pay more than the selected bill remaining, the repository throws the user-safe mismatch message before any split/payment/order mutation:

`Jumlah pembayaran harus sama dengan sisa bill yang dipilih.`

The API maps this to `SPLIT_BILL_AMOUNT_MISMATCH` with HTTP 400.

### 5. Underpay behavior

P9.3.2 intentionally does not introduce partial-per-bill behavior. When a cashier attempts to pay less than the selected bill remaining, the repository rejects with the same user-safe mismatch message before any mutation.

### 6. Already-paid selected bill behavior

A new different-idempotency request against a selected bill whose remaining amount is already zero is rejected with:

`Bill yang dipilih sudah lunas.`

The API maps this to `SPLIT_BILL_ALREADY_PAID` with HTTP 409.

### 7. Idempotent replay behavior

A replay of the same selected bill payment is detected by deterministic payment-line idempotency key before split validation and mutation. Because all replayed lines produce `newLineTotal = 0`, the invariant helper allows the request to return current aggregate state safely. The selected split and parent order are not incremented again.

### 8. Files changed

- `packages/infrastructure/repositories/payments/DrizzleSubmitPOSPaymentRepository.ts`
- `apps/api/src/http/controllers/POSPaymentController.ts`
- `apps/api/src/__tests__/submit-pos-payment-split-invariant.test.ts`
- `roadmap/business-flows/replit_codex_P9_3_2_split_bill_backend_invariant_prompt.md`
- `roadmap/business-flows/P9_3_backend_submit_pos_payment_report.md`
- `PLANS.md`

### 9. Tests added/updated

Added `apps/api/src/__tests__/submit-pos-payment-split-invariant.test.ts` with focused backend/API coverage for:

- valid selected bill payment where `newLineTotal` equals remaining;
- overpay rejection;
- underpay rejection;
- already-paid selected bill rejection for a new request;
- idempotent replay allowance with `newLineTotal = 0`;
- cashier-readable API mapping for mismatch, already-paid, and invalid split bill errors.

Limitation: the new test directly covers the extracted invariant helper and API error mapper rather than a full Drizzle transaction against a live database. Existing API and type-check validation still cover integration build compatibility.

### 10. Validation output

- `pnpm --filter @pos/domain type-check`: passed.
- `pnpm --filter @pos/application type-check`: passed.
- `pnpm --filter @pos/application test`: passed.
- `pnpm --filter @pos/api type-check`: passed.
- `pnpm --filter @pos/api test`: passed, 189 tests passed.
- `pnpm --filter @pos/terminal-web type-check`: passed.
- `pnpm --filter @pos/terminal-web test`: passed.
- `pnpm type-check`: passed, 10/10 Turbo tasks successful.
- Provider/gateway grep check: no provider/card/e-wallet/gateway concepts were added to built-in SubmitPOSPayment runtime code.
- Alias grep check: only the existing application test still mentions rejected old flow string `full_payment`; no runtime old alias support was added.
- Invariant grep check: backend code contains the new split amount update and API error codes for split mismatch/already-paid behavior.

### 11. Final user-readable Split Bill flow

Cashier chooses Split, selects Bill A, and pays exactly Bill A's remaining amount. Backend resolves Bill A, validates that the payment equals the selected bill remaining, records the payment once, marks Bill A paid, and keeps the parent order partial if other bills remain unpaid. Retrying the same request returns safely without double-counting. Overpaying, underpaying, selecting an invalid bill, or paying an already-paid bill with a new request returns a cashier-readable error.

## P9.4 Payment UX Finalization + Final PAID Data Contract

Date: 2026-06-21

### 1. Deep analysis findings

- Payment dialog still rendered a global method selector for `MULTI_PAYMENT`, while multi-line storage used `multiMethod`. This meant the cashier saw duplicated method controls and could confuse the global `method` state with per-line multi method state.
- Split bill rows used a fixed `maxHeight` scroll area rather than a flex `min-h-0` layout, making item assignment prone to clipping on smaller portrait and landscape screens.
- Split bill payload sent the selected bill amount as `amountPaid` in the `splits` metadata. The backend already treats persisted split payment as DB truth, so new split payloads must send request split metadata with `amountPaid: 0` and let payment rows update DB state.
- Retail/restaurant POS flows only filled `selectedOrderTypeId` when it was empty. A stale ID left in cart state could still be submitted after tenant order types changed.

### 2. Implemented changes

- `PaymentMethodDialog` now keeps method selectors scoped to the active flow:
  - `FULL` and `DOWN_PAYMENT` use the normal `method` / `setMethod` selector.
  - `MULTI_PAYMENT` has no global selector and uses only `multiMethod` / `setMultiMethod` for the next line.
  - `SPLIT_BILL` has no global selector and uses only the selected bill payment selector.
- Multi add button remains tied to the selected `multiMethod`, and emitted multi lines come only from `multiEntries`.
- Split assignment list is a flex child with `min-h-0` and `overflow-y-auto`, and the modal uses `92dvh` plus a mobile-friendly width cap.
- Split payload now includes `clientBillId` on the payment line, includes all bill metadata, and sends new split `amountPaid` as `0` / `UNPAID` so DB persistence remains authoritative.
- Retail and restaurant flows now run a shared order type guard before draft save, kitchen submission, charge, and fresh payment submit. A stale selected order type is replaced with the first active type, while no active type blocks with the readable Indonesian message.

### 3. Final PAID data contract

Common invariant for final paid orders:

```txt
orders.total = total bill
orders.paid_amount = orders.total
orders.payment_status = paid
successful order_payments rows have status = succeeded
orders.paid_amount must never exceed orders.total
```

#### FULL final PAID

```txt
orders:
- total: 190900
- paid_amount: 190900
- payment_status: paid

order_payments:
- payment_flow: FULL
- payment_kind: FULL_PAYMENT
- payment_method: CASH
- amount: 190900
- received_amount: 200000
- change_amount: 9100
- sequence: 1
- split_id: null
- status: succeeded
```

#### DP final PAID

```txt
orders:
- total: 190900
- paid_amount: 190900
- payment_status: paid

order_payments:
- row 1 payment_flow: DOWN_PAYMENT, payment_kind: DOWN_PAYMENT, amount: 50000, split_id: null, status: succeeded
- row 2 payment_flow: DOWN_PAYMENT, payment_kind: REMAINING_PAYMENT, amount: 140900, split_id: null, status: succeeded
```

#### MULTI_PAYMENT final PAID

```txt
orders:
- total: 190900
- paid_amount: 190900
- payment_status: paid

order_payments:
- row 1 payment_flow: MULTI_PAYMENT, payment_kind: MULTI_PAYMENT_LINE, payment_method: CASH, amount: 100000, sequence: 1, split_id: null, status: succeeded
- row 2 payment_flow: MULTI_PAYMENT, payment_kind: MULTI_PAYMENT_LINE, payment_method: MANUAL_QRIS, amount: 90900, sequence: 2, split_id: null, status: succeeded
```

#### SPLIT_BILL final PAID

```txt
orders:
- total: 190900
- paid_amount: 190900
- payment_status: paid

order_bill_splits:
- Bill A amount_due: 90000, amount_paid: 90000, status: paid
- Bill B amount_due: 100900, amount_paid: 100900, status: paid

order_payments:
- row 1 payment_flow: SPLIT_BILL, payment_kind: SPLIT_BILL_LINE, payment_method: CASH, amount: 90000, split_id: real Bill A split id, status: succeeded
- row 2 payment_flow: SPLIT_BILL, payment_kind: SPLIT_BILL_LINE, payment_method: MANUAL_QRIS, amount: 100900, split_id: real Bill B split id, status: succeeded
```

### 4. P9.4 validation status

- UI and order-type guard implementation was validated by POS terminal type-check.
- POS terminal tests passed, including a pure unit test covering stale selected order type replacement and the no-active-order-type readable blocker.
- Full browser rendering tests for duplicated selector count and scroll reachability are still not present because this workspace currently uses script-level `tsx` tests rather than a React DOM test runner. The code exposes specific `data-testid` hooks (`multi-method-selector`, `split-method-selector`, `split-item-assignment-list`) so future DOM tests can cover this directly.
- Full live DB integration tests for the final row shapes remain a follow-up; this report documents the mandatory PAID contract and existing backend P9.3/P9.3.2 tests cover canonical submission, split selected-bill invariants, idempotency, and safe errors.
