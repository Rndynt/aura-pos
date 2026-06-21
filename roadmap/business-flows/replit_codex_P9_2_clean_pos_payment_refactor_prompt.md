# Replit/Codex Prompt P9.2 — Clean POS Payment Refactor

Repository: `Rndynt/AuraPoS`

## Goal

Refactor POS payment into a clean, independent, reusable payment module for AuraPoS.

This must fix the architecture mistake from P9/P9.1 where payment flow became a pile of compatibility aliases, normalization helpers, duplicated UI strings, and unstable fresh-cart order creation behavior.

Payment must be independent from business type and reusable by every POS flow.

Business type must not define payment rules.

Order lifecycle may consume payment results, but payment must not depend on whether the order comes from retail, food beverage, service, restaurant, table service, or any future POS flow.

## Non-negotiable direction

The project is still in development. Do not preserve old broken payment contracts for compatibility.

Remove the broken mixed contract instead of normalizing around it.

There must be one canonical payment language across frontend POS core, application layer, API DTO, and persistence adapter.

Do not keep both old and new names.

Do not build more `normalize full_payment to full` style workaround in POS core.

The correct outcome is:

```txt
Payment domain owns payment concepts.
POS flow submits canonical payment commands.
API receives canonical payment DTOs.
Application use cases persist canonical payment rows.
Business flow consumes payment result.
```

## Problems to fix

Current bad patterns to remove:

```txt
- payment_flow accepts mixed values such as full_payment, partial_payment_dp, full, dp, multi, split.
- POS core imports PaymentMethod from UI hook path.
- payment submission service lives in pos-core but still behaves like adapter glue.
- payment flow relies on normalization instead of clean canonical types.
- fresh-cart split/multi creates parent order first, then payment rows, causing duplicate draft/order when payment fails and user retries.
- split bill retry can create multiple parent orders.
- shouldClearCart is hardcoded true in shared payment submission result.
- business-flow hooks still understand too much payment behavior.
- split bill flow is unclear between parent order, paid bill, unpaid pool, and partial settlement.
- raw technical error handling is masking the root issue instead of fixing the contract.
```

## Target clean architecture

Create a real POS payment boundary.

Recommended structure:

```txt
packages/domain/payments/
  PaymentFlow.ts
  PaymentMethod.ts
  PaymentStatus.ts
  PaymentLine.ts
  PaymentCommand.ts
  PaymentResult.ts
  PaymentSplit.ts
  PaymentCalculation.ts
  index.ts

packages/application/payments/
  SubmitPOSPayment.ts
  ports/
    POSPaymentRepositoryPort.ts
    POSPaymentOrderPort.ts
  services/
    POSPaymentSessionService.ts
  index.ts

packages/infrastructure/repositories/payments/
  DrizzlePOSPaymentRepository.ts

apps/api/src/http/controllers/
  POSPaymentController.ts or existing OrdersController payment section cleaned

apps/pos-terminal-web/src/features/pos-core/payment/
  usePOSPayment.ts
  paymentUiState.ts
  paymentCommandMapper.ts
```

If the existing repo style requires different exact names, keep the same intent: domain/application/infrastructure/UI boundaries must be clear.

## Canonical types

Use one canonical enum/value set only.

Payment method:

```ts
export type POSPaymentMethod =
  | "CASH"
  | "MANUAL_TRANSFER"
  | "MANUAL_QRIS";
```

Payment flow:

```ts
export type POSPaymentFlow =
  | "FULL"
  | "DOWN_PAYMENT"
  | "MULTI_PAYMENT"
  | "SPLIT_BILL";
```

Payment line kind:

```ts
export type POSPaymentLineKind =
  | "FULL_PAYMENT"
  | "DOWN_PAYMENT"
  | "REMAINING_PAYMENT"
  | "MULTI_PAYMENT_LINE"
  | "SPLIT_BILL_LINE";
```

Payment status:

```ts
export type POSPaymentStatus =
  | "UNPAID"
  | "PARTIAL"
  | "PAID";
```

Do not keep lowercase aliases in POS core.

Do not keep `full_payment` or `partial_payment_dp` in frontend POS core, payment domain, application command, or UI callback contracts.

If database columns currently store lowercase values, either migrate them now or map only inside infrastructure adapter with a clearly named persistence mapper. That mapper must not leak to domain, application, UI, or controller DTOs.

## Canonical command

Define one canonical payment command shape.

Suggested shape:

```ts
export type POSPaymentCommand = {
  source: "FRESH_CART" | "SAVED_ORDER" | "ACTIVE_ORDER";
  orderId?: string;
  clientPaymentSessionId: string;
  flow: POSPaymentFlow;
  targetBillId?: string;
  lines: POSPaymentCommandLine[];
};

export type POSPaymentCommandLine = {
  method: POSPaymentMethod;
  amount: number;
  receivedAmount?: number;
  referenceNote?: string;
};
```

Rules:

```txt
- UI must emit POSPaymentCommand.
- API must receive canonical command or canonical DTO derived from it.
- Application use case must receive canonical command.
- Infrastructure may map to DB shape, but domain/application must not know DB enum strings.
```

## Payment method rules

Built-in POS methods only:

```txt
CASH
MANUAL_TRANSFER
MANUAL_QRIS
```

Rules:

```txt
- Cash may have receivedAmount and changeAmount.
- Manual transfer has exact amount and optional reference note.
- Manual QRIS has exact amount and optional reference note.
- No external gateway/provider concepts in this refactor.
- No NorthFlow changes.
```

## Payment flow rules

### Full payment

```txt
- Always available.
- No entitlement required.
- Creates exactly one payment row.
- Pays the full remaining amount.
- Order/payment aggregate becomes PAID only when persisted successful payment rows cover total.
```

### Down payment / DP

```txt
- Requires payments_partial_payment entitlement.
- Independent from Multi and Split.
- First payment records DOWN_PAYMENT.
- Final payment records REMAINING_PAYMENT.
- P9.2 simple rule: max 2 successful DP rows.
- DP below total must leave payment status PARTIAL.
```

### Multi payment

```txt
- Requires payments_multi_payment entitlement.
- Independent from DP and Split.
- P9.2 max 2 payment lines.
- Each line has its own payment method and amount.
- Sum must equal target amount to complete the payment.
- If sum is less than target amount, do not mark paid unless the flow explicitly becomes DP and entitlement exists.
- Do not auto-settle on first line click.
```

### Split bill

```txt
- Requires payments_split_bill or current SOT equivalent, but do not hardcode plan names.
- Independent from DP and Multi.
- P9.2 max 4 bills.
- User may pay one selected bill first without assigning or paying every item.
- Unassigned items are allowed and remain in unpaid pool.
- Parent order remains PARTIAL/OPEN until all bill/unassigned amounts are fully paid.
- Bill A can become PAID while Bill B/unassigned remains unpaid.
- Paying one bill must never create a second parent order on retry.
```

Important correction:

```txt
Split bill must NOT require all items to be assigned before paying one bill.
Only the selected bill being paid must be valid.
```

Selected bill valid means:

```txt
- bill exists in payment session;
- bill amount > 0;
- bill not already paid;
- command line total equals selected bill amount;
- method is valid;
- parent order identity is reused if already created.
```

## Payment session rules

Introduce a POS payment session concept for fresh cart payment flows.

Purpose:

```txt
- prevent duplicate parent orders;
- keep retry stable;
- keep split bill state stable;
- keep paid/unpaid bill state stable;
- allow one selected bill to be paid while other items remain unpaid.
```

Suggested frontend session state:

```ts
export type POSPaymentSession = {
  clientPaymentSessionId: string;
  source: "FRESH_CART" | "SAVED_ORDER" | "ACTIVE_ORDER";
  orderId?: string;
  orderNumber?: string;
  totalAmount: number;
  paidAmount: number;
  remainingAmount: number;
  bills: POSPaymentBill[];
  unassignedAmount: number;
  status: "OPEN" | "PARTIAL" | "PAID";
};

export type POSPaymentBill = {
  clientBillId: string;
  orderBillSplitId?: string;
  label: string;
  amountDue: number;
  amountPaid: number;
  status: "UNPAID" | "PARTIAL" | "PAID";
};
```

Rules:

```txt
- Fresh cart split/multi creates payment session before payment submit.
- If createOrder succeeds, store orderId in the session.
- If payment recording fails after order creation, keep orderId in the session.
- Retry must reuse the same orderId, not create another order.
- Do not clear cart/session until payment result requires it.
- For split bill partial payment, keep session open after Bill A is paid.
```

## Backend atomicity requirement

The current createOrder then recordPayment sequence is unsafe for multi-row payment if not transactional.

P9.2 must implement one of these approaches:

Preferred:

```txt
Create application use case: SubmitPOSPayment
- accepts canonical POSPaymentCommand;
- if source is FRESH_CART, creates parent order and payment rows in one DB transaction;
- if any payment row fails, rolls back order creation;
- if order already exists, reuses orderId and writes rows idempotently;
- returns aggregate payment result.
```

Acceptable temporary if full transaction refactor is too large:

```txt
- create parent order once;
- persist/reuse clientPaymentSessionId;
- after createOrder succeeds, update UI/session with orderId;
- all retry uses existing orderId;
- no duplicate parent order possible;
- report clearly states backend atomic use case remains pending.
```

Do not silently keep duplicate-order behavior.

## Idempotency rules

Every payment submit must have a clientPaymentSessionId.

For split/multi, every line should have deterministic idempotency identity based on:

```txt
clientPaymentSessionId
flow
targetBillId when split
line index
method
amount
```

If current backend does not support idempotency per payment line, at least prevent duplicate parent order in frontend/session and document remaining backend limitation.

## Data persistence expectations

Payment rows must be canonical at application boundary.

For full:

```txt
1 order payment row
flow = FULL
kind = FULL_PAYMENT
status = succeeded
```

For DP:

```txt
row 1: flow = DOWN_PAYMENT, kind = DOWN_PAYMENT
row 2: flow = DOWN_PAYMENT, kind = REMAINING_PAYMENT
```

For Multi:

```txt
max 2 rows
flow = MULTI_PAYMENT
kind = MULTI_PAYMENT_LINE
```

For Split:

```txt
max 4 bills
payment rows tied to selected bill when persisted split id exists
if split is UI-session only, keep stable clientBillId in metadata/session, not random fake uuid
parent payment status is based on total succeeded rows vs total amount
```

## Delete or replace broken code

Remove or replace these patterns:

```txt
normalizePOSPaymentFlow that accepts old mixed contract in POS core
paymentDetails.flow typed as unknown or old aliases
frontend payment_flow union containing both old and new values
pos-core importing PaymentMethod from @/hooks/useCart
hardcoded shouldClearCart: true
fresh_cart createOrder followed by recordPayment without retry/session safety
business-flow hooks containing payment row submit loops
raw technical API errors shown to cashier
```

Search and clean:

```bash
rg -n "full_payment|partial_payment_dp|normalizePOSPaymentFlow|payment_flow|shouldClearCart: true|recordPaymentLines|paymentDetails\?.flow|unknown" apps/pos-terminal-web/src/features/pos-core apps/pos-terminal-web/src/features/pos-flows apps/pos-terminal-web/src/hooks apps/pos-terminal-web/src/lib packages/application packages/domain apps/api/src
```

Allowed remaining uses:

```txt
- migration files if already committed;
- one infrastructure persistence mapper if database still stores old enum values;
- report/documentation only;
- tests that prove old values were removed or no longer accepted at canonical boundary.
```

But domain/application/UI canonical contract must not use old aliases.

## UI flow requirements

### Fresh cart + split bill

Correct flow:

```txt
1. Cashier adds items to cart.
2. Cashier opens payment dialog.
3. Cashier chooses Split Bill.
4. Cashier assigns some items/amount to Bill A.
5. Cashier may leave other items unassigned/unpaid.
6. Cashier pays Bill A.
7. System creates or reuses parent order once.
8. System records payment only for Bill A.
9. Bill A becomes paid.
10. Parent order remains partial/open.
11. Cart/session remains aware of same parent order.
12. Later cashier can pay Bill B or remaining/unassigned amount without creating a duplicate parent order.
```

### Failure flow

If payment for Bill A fails after parent order is created:

```txt
- keep payment dialog/session open or show recoverable state;
- keep orderId in session;
- show user-safe error;
- retry must reuse orderId;
- do not create new draft/order;
- do not clear cart as if successful.
```

### Success flow

If Bill A succeeds but remaining amount exists:

```txt
- show Pembayaran Bill A tersimpan;
- mark Bill A paid;
- keep parent order partial/open;
- do not mark order completed;
- do not lose unpaid pool;
- provide way to continue payment of remaining bill.
```

## Entitlement rules

Use existing entitlement system, but keep payment module independent.

```txt
FULL: no entitlement
DOWN_PAYMENT: payments_partial_payment
MULTI_PAYMENT: payments_multi_payment
SPLIT_BILL: payments_split_bill or payments_split_payment alias at entitlement boundary only
```

Entitlement alias handling is allowed only in entitlement adapter/SOT, not in payment command domain.

## Tests required

Add tests for canonical payment contract:

```txt
- canonical command rejects/does not use old flow aliases;
- UI mapper emits FULL, DOWN_PAYMENT, MULTI_PAYMENT, SPLIT_BILL only;
- pos-core no longer imports PaymentMethod from useCart;
- fresh cart split can pay Bill A even when other items are unassigned;
- selected bill payment validates only selected bill;
- parent order created once and reused after payment failure;
- retry split payment does not create duplicate order;
- successful Bill A payment leaves parent order partial/open when remaining exists;
- shouldClearCart false for partial split result;
- Multi max 2 lines;
- Split max 4 bills;
- full payment creates one row and completes order;
- DP creates down payment then remaining payment;
- business-flow hooks do not contain payment row loops;
- no raw enum validation text appears in runtime UI.
```

Add regression tests against screenshots scenario:

```txt
Scenario: fresh cart split Bill A payment fails after parent order creation.
Expected:
- one parent order only;
- retry uses same orderId;
- no duplicate draft/order;
- UI remains recoverable.
```

## Validation commands

Run:

```bash
pnpm --filter @pos/terminal-web type-check
pnpm --filter @pos/terminal-web test
pnpm --filter @pos/domain type-check
pnpm --filter @pos/application type-check
pnpm --filter @pos/application test
pnpm --filter @pos/api type-check
pnpm --filter @pos/api test
pnpm type-check
```

Run grep checks:

```bash
rg -n "full_payment|partial_payment_dp|normalizePOSPaymentFlow|paymentDetails\?.flow.*unknown|shouldClearCart: true|recordPaymentLines|@/hooks/useCart" apps/pos-terminal-web/src/features/pos-core apps/pos-terminal-web/src/features/pos-flows packages/domain packages/application apps/api/src
```

Expected:

```txt
No old flow aliases or mixed compatibility in domain/application/pos-core/UI runtime.
Only infrastructure persistence mapper or docs/tests may mention removed aliases if absolutely required.
```

```bash
rg -n "createOrder\(|createOrderMutation\.mutateAsync" apps/pos-terminal-web/src/features/pos-core apps/pos-terminal-web/src/features/pos-flows
```

Expected:

```txt
Fresh cart create-order behavior must be session-safe and must not create duplicate parent orders on retry.
```

```bash
rg -n "orders_queue.*full payment|recordPayment.*orders_queue|GenericPOSPage|features/pos/services|features/pos/mappers" apps packages shared
```

Expected:

```txt
No regression from earlier flow refactor.
```

## Required report

Create:

```txt
roadmap/business-flows/P9_2_clean_pos_payment_refactor_report.md
```

Report must include:

```txt
1. Summary
2. Root cause of P9/P9.1 architecture failure
3. Canonical payment contract
4. Removed old aliases / compatibility cleanup
5. New module structure
6. Fresh cart Full/DP/Multi/Split flow
7. Saved/active order Full/DP/Multi/Split flow
8. Split bill partial settlement behavior
9. Payment session / no duplicate parent order strategy
10. Backend transaction/idempotency strategy
11. UI failure/retry behavior
12. Files changed
13. Tests added/updated
14. Validation output
15. Grep cleanup output
16. Remaining limitations
17. Next recommended phase
```

## Completion checklist

```txt
- [x] Payment domain types are canonical.
- [x] No mixed old/new flow values in POS core/application/UI runtime.
- [x] Payment module does not depend on business type.
- [x] POS core does not import PaymentMethod from UI cart hook.
- [x] Full payment works as one row.
- [x] DP works as max two rows.
- [x] Multi works as max two lines.
- [x] Split works as max four bills.
- [x] Split can pay selected bill while other items remain unassigned/unpaid.
- [x] Parent order is created once and reused after failure/retry.
- [x] No duplicate draft/order from split/multi retry.
- [x] shouldClearCart is result-based, not hardcoded true.
- [x] Raw technical enum errors are not shown to cashier.
- [x] Business-flow hooks do not own payment persistence rules.
- [x] Tests and validation pass.
- [x] Report created.
```

## Commit message

```txt
refactor(pos): rebuild payment flow as independent clean module
```
