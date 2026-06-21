# Replit/Codex Prompt P9.3 — Backend SubmitPOSPayment + OrderType Guard + Persisted Split Lifecycle

Repository: `Rndynt/AuraPoS`

## Goal

Finish the POS payment refactor properly.

P9.2 cleaned the canonical payment language, but payment is still not complete because fresh-cart Multi/Split still creates an order first and then records payment rows from frontend retry/session logic. That is not clean enough.

P9.3 must move POS payment submission into a backend application use case so payment becomes independent, reusable, transaction-safe, and cleanly separated from POS business-flow UI.

The outcome must be:

```txt
Frontend POS flow
→ emits canonical payment command
→ API validates DTO
→ application SubmitPOSPayment use case owns orchestration
→ infrastructure repository performs one DB transaction
→ returns aggregate payment result
→ business flow consumes result only
```

Payment must not depend on business type. Retail, cafe counter, restaurant table service, and future flows must reuse the same payment use case.

## Non-negotiable rules

```txt
- No legacy compatibility aliases.
- No old flow strings such as full_payment, partial_payment_dp, full, dp, multi, split.
- No e-wallet/card/provider mapping.
- POS built-in payment methods only: CASH, MANUAL_TRANSFER, MANUAL_QRIS.
- Payment module must not know businessProfile.
- Business profile may decide where payment is invoked, but not how payment rows are persisted.
- Entitlement checks stay at API/business-flow boundary, not inside payment domain.
- No duplicate parent order on retry.
- No raw FK/database error exposed to cashier.
- No cart/session clear when payment result is PARTIAL.
```

Canonical values must remain:

```ts
export type POSPaymentMethod =
  | "CASH"
  | "MANUAL_TRANSFER"
  | "MANUAL_QRIS";

export type POSPaymentFlow =
  | "FULL"
  | "DOWN_PAYMENT"
  | "MULTI_PAYMENT"
  | "SPLIT_BILL";

export type POSPaymentLineKind =
  | "FULL_PAYMENT"
  | "DOWN_PAYMENT"
  | "REMAINING_PAYMENT"
  | "MULTI_PAYMENT_LINE"
  | "SPLIT_BILL_LINE";
```

## Current bugs to fix

### 1. `order_type_id` foreign key crash

Screenshot error:

```txt
Failed to create order: insert or update on table "orders" violates foreign key constraint "orders_order_type_id_order_types_id_fk"
```

This is unacceptable UX. Backend must not insert a stale/invalid `order_type_id` directly.

Fix rules:

```txt
- Validate order_type_id before insert.
- If order_type_id is provided, it must exist in order_types, be active, and be enabled for the tenant through tenant_order_types.
- If invalid, return user-safe 400 before insert.
- Error message: "Tipe pesanan tidak valid atau belum aktif untuk tenant ini. Muat ulang POS lalu coba lagi."
- Do not expose FK names or SQL messages.
```

Optional safe fallback only if product decision prefers it:

```txt
- If tenant has exactly one enabled active order type and provided order_type_id is missing/null, use that one.
- If tenant has no enabled active order type, allow NULL only if orders.order_type_id is nullable and POS flow does not require order type.
- Do not silently replace a provided but invalid order_type_id unless explicitly documented in the report.
```

### 2. Fresh-cart Multi/Split is not backend-atomic

Current behavior is still too frontend-driven:

```txt
fresh cart
→ frontend/service creates parent order
→ frontend/service records payment rows
→ if payment row fails, recovery depends on in-memory session/cache
```

P9.3 must create backend SubmitPOSPayment so create/reuse order and payment rows happen in one application/infrastructure transaction.

### 3. Split bill lifecycle is not persisted strongly enough

`order_bill_splits` exists, but split lifecycle is still treated mostly as UI metadata for fresh-cart selected bill payment.

P9.3 must persist selected bill splits properly:

```txt
order_bill_splits
- create/update bill rows for submitted split session
- selected bill amount_due and amount_paid are tracked
- status updates: unpaid | partial | paid
- payment rows are tied to real split_id when split row exists
- unassigned/remaining pool may remain unpaid
```

### 4. UI clears cart/session on PARTIAL

Fresh-cart hook must respect `result.shouldClearCart`. If result is PARTIAL, do not clear cart/session as if the whole order was paid.

Fix all frontend paths that currently clear cart unconditionally after submit.

## Target backend architecture

Add a payment application module. Use exact names if practical; if repo style requires variants, keep the same responsibility.

```txt
packages/application/payments/
  SubmitPOSPayment.ts
  POSPaymentCommand.ts
  POSPaymentResult.ts
  ports/
    SubmitPOSPaymentRepositoryPort.ts
    POSPaymentOrderTypePort.ts
  index.ts

packages/infrastructure/repositories/payments/
  DrizzleSubmitPOSPaymentRepository.ts

apps/api/src/http/controllers/
  POSPaymentController.ts
```

If creating a separate controller is too much, keep the route under existing order/payment route, but do not keep large orchestration logic in `OrdersController`.

## Canonical backend command

Define the application command as backend-safe and canonical:

```ts
export type SubmitPOSPaymentSource = "FRESH_CART" | "SAVED_ORDER" | "ACTIVE_ORDER";

export type SubmitPOSPaymentCommand = {
  tenantId: string;
  outletId?: string | null;
  source: SubmitPOSPaymentSource;
  clientPaymentSessionId: string;

  orderId?: string;
  orderNumber?: string;

  order?: {
    items: Array<{
      product_id: string;
      product_name: string;
      base_price: number;
      quantity: number;
      variant_id?: string;
      variant_name?: string;
      variant_price_delta?: number;
      selected_options?: Array<{
        group_id: string;
        group_name: string;
        option_id: string;
        option_name: string;
        price_delta: number;
      }>;
      selected_option_groups?: unknown[];
      notes?: string;
    }>;
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
```

Rules:

```txt
- FRESH_CART requires order payload unless orderId is already known from prior retry/session.
- SAVED_ORDER and ACTIVE_ORDER require orderId.
- clientPaymentSessionId is mandatory for all flows.
- All payment line methods/flows/kinds must be canonical.
- Reject old aliases immediately with user-safe validation error.
```

## Backend SubmitPOSPayment behavior

### Common transaction rules

The repository implementation must run the critical section in one DB transaction:

```txt
1. Validate tenant/outlet scope.
2. Validate or resolve order_type_id before order insert.
3. Create or lock/reuse parent order.
4. Lock order row with SELECT ... FOR UPDATE before computing paid/remaining amount.
5. Validate payment command against current order totals and existing payments.
6. Persist bill split rows if SPLIT_BILL.
7. Insert payment rows with deterministic idempotency keys.
8. Update order paid_amount and payment_status.
9. Return aggregate result.
```

Do not leave fresh-cart Multi/Split as create order then record rows from frontend.

### Parent order creation/reuse

Rules:

```txt
- If source = FRESH_CART and orderId is absent, create parent order once inside the transaction.
- If clientPaymentSessionId already has an existing order/payment session, reuse that order.
- If source = FRESH_CART and orderId is present, lock and reuse that order.
- If order creation succeeds but payment insertion fails, transaction rollback must prevent orphan order for new order path.
- If order already exists from prior retry, retry must reuse the same order and idempotent rows.
```

Implementation options:

```txt
Preferred:
- Store clientPaymentSessionId on order idempotencyKey or a dedicated payment session reference if available.
- Look up existing order by tenant_id + clientPaymentSessionId/idempotency key.

Acceptable:
- Use existing orders.idempotencyKey = clientPaymentSessionId for FRESH_CART payment session identity, if it does not break existing createOrder idempotency.
- Document exact choice in report.
```

### Deterministic payment line idempotency

Every row must have deterministic idempotency key:

```txt
${clientPaymentSessionId}:${flow}:${targetBillId || "none"}:${lineIndex}:${method}:${amount}
```

Rules:

```txt
- Replaying same line must not insert duplicate payment row.
- Same order + same line key returns existing payment.
- Multi line sequence must be stable.
- Split selected bill retry must not duplicate the bill payment row.
```

### Payment amount rules

Full:

```txt
- exactly one line
- line total must equal current remaining amount or fresh order total
- kind = FULL_PAYMENT
- result PAID if total covered
```

DP:

```txt
- exactly one line per submit
- first DP below total uses kind DOWN_PAYMENT
- final payment uses kind REMAINING_PAYMENT
- max 2 succeeded DP rows for P9.3
- line amount cannot exceed remaining
- if remaining after line > 0, result PARTIAL
```

Multi:

```txt
- max 2 lines
- line total must equal target remaining amount
- each row kind = MULTI_PAYMENT_LINE
- insert all lines inside one transaction
- result PAID only if order total covered
```

Split:

```txt
- max 4 bills
- selected bill may be paid before other items are assigned
- unassigned/remaining pool is allowed
- selected bill must have amountDue > amountPaid
- submitted line total must equal selected bill remaining
- create/update order_bill_splits rows for submitted splits
- payment row must use real split_id after split row is persisted
- selected bill status becomes paid when covered
- parent order status stays partial/open until total paid
```

## Order type guard

Add a reusable guard/port for order type validation.

Suggested:

```txt
packages/application/payments/ports/POSPaymentOrderTypePort.ts
packages/infrastructure/repositories/payments/DrizzlePOSPaymentOrderTypeRepository.ts
```

Responsibilities:

```txt
- validate order_type_id exists in order_types
- validate order_types.is_active = true
- validate tenant_order_types row exists and is_enabled = true for tenant
- return user-safe error before insert
```

This guard can also be reused by `CreateOrder` and `CreateAndPayOrder` later. For P9.3 at minimum it must protect SubmitPOSPayment and prevent the FK crash shown in the screenshot.

## API endpoint

Add canonical endpoint:

```txt
POST /api/pos/payments/submit
```

or, if route grouping must stay under orders:

```txt
POST /api/orders/payments/submit
```

Request body should be canonical and close to `SubmitPOSPaymentCommand`.

Controller responsibilities only:

```txt
- extract tenantId/outletId/user context
- validate zod DTO
- perform entitlement checks for DOWN_PAYMENT/MULTI_PAYMENT/SPLIT_BILL
- call SubmitPOSPayment use case
- map result to JSON
- map known errors to user-safe HTTP errors
```

Controller must not:

```txt
- create order manually
- record payment rows manually
- calculate split lifecycle itself
- know businessProfile payment behavior
- expose database error messages
```

## Frontend changes

Update POS frontend to call SubmitPOSPayment endpoint for all flows.

Required:

```txt
apps/pos-terminal-web/src/features/pos-core/services/posPaymentSubmissionService.ts
apps/pos-terminal-web/src/features/pos-flows/retail/useRetailStandardPOSFlow.ts
apps/pos-terminal-web/src/components/pos/PaymentMethodDialog.tsx
apps/pos-terminal-web/src/lib/api/hooks.ts
```

Frontend responsibilities after P9.3:

```txt
- Build canonical payment command.
- Keep UI input state.
- Show result/toast.
- Clear cart/session only when result.shouldClearCart === true.
- Keep cart/session open when result.status === PARTIAL.
- Do not directly sequence createOrder then recordPayment for fresh-cart Multi/Split.
```

Remove or stop using direct payment row loops in business-flow hooks.

## Result shape

Use consistent result:

```ts
export type SubmitPOSPaymentResult = {
  orderId: string;
  orderNumber: string;
  paymentFlow: POSPaymentFlow;
  paidAmount: number;
  remainingAmount: number;
  status: "PAID" | "PARTIAL" | "SAVED_NEEDS_PAYMENT";
  shouldClearCart: boolean;
  shouldPrintReceipt: boolean;
  order: unknown;
  payments: unknown[];
  splits?: Array<{
    id: string;
    clientBillId?: string;
    label: string;
    amountDue: number;
    amountPaid: number;
    status: "unpaid" | "partial" | "paid";
  }>;
  messageTitle: string;
  messageDescription: string;
};
```

Rules:

```txt
- shouldClearCart true only when status === PAID and no unpaid split/unassigned remainder exists.
- shouldPrintReceipt true only when final paid flow is complete.
- PARTIAL never clears cart/session automatically.
```

## User-safe errors

Map these errors:

```txt
INVALID_ORDER_TYPE
→ "Tipe pesanan tidak valid atau belum aktif untuk tenant ini. Muat ulang POS lalu coba lagi."

PAYMENT_AMOUNT_EXCEEDS_REMAINING
→ "Jumlah pembayaran melebihi sisa tagihan."

INVALID_SPLIT_BILL
→ "Bill yang dipilih tidak valid atau sudah lunas."

PAYMENT_METHOD_INVALID
→ "Metode pembayaran tidak valid."

PAYMENT_FLOW_INVALID
→ "Tipe pembayaran tidak valid."
```

Do not show:

```txt
orders_order_type_id_order_types_id_fk
invalid_enum_value
Expected 'FULL' | 'DOWN_PAYMENT'...
Postgres constraint names
raw SQL errors
```

## Tests required

Add/adjust tests for:

```txt
1. SubmitPOSPayment FULL fresh cart creates one order + one payment row transactionally.
2. SubmitPOSPayment DP fresh cart creates order + DP row and returns PARTIAL with shouldClearCart false.
3. SubmitPOSPayment MULTI fresh cart inserts max two rows in one transaction.
4. SubmitPOSPayment SPLIT fresh cart can pay Bill A while other items remain unassigned.
5. Split Bill A success creates/updates order_bill_splits and ties payment row to real split_id.
6. Split Bill A success leaves parent order partial/open when remaining amount exists.
7. Split retry with same clientPaymentSessionId does not create duplicate parent order.
8. Split retry with same deterministic line key does not duplicate payment row.
9. Invalid order_type_id returns user-safe 400 before insert.
10. Missing order_type_id behavior is deterministic and documented.
11. Old payment aliases are rejected at canonical boundary.
12. Frontend does not clear cart/session on PARTIAL result.
13. Controller does entitlement checks only at boundary.
14. Payment application use case does not import React, frontend hooks, or business-flow UI.
15. Payment domain/application does not import Drizzle directly.
```

## Grep checks

Run:

```bash
rg -n "full_payment|partial_payment_dp|normalizePOSPaymentFlow|paymentDetails\?.flow.*unknown|shouldClearCart: true|recordPaymentLines" apps/pos-terminal-web/src/features/pos-core apps/pos-terminal-web/src/features/pos-flows packages/domain packages/application apps/api/src
```

Expected:

```txt
No old runtime aliases or hardcoded clear-cart behavior.
Docs/tests may mention old aliases only to prove rejection.
```

Run:

```bash
rg -n "createOrderMutation\.mutateAsync|recordPaymentMutation\.mutateAsync|createOrder\(|recordPayment\(" apps/pos-terminal-web/src/features/pos-flows apps/pos-terminal-web/src/features/pos-core
```

Expected:

```txt
Business-flow hooks must not manually orchestrate fresh-cart create-order then payment-row persistence.
They may call a single SubmitPOSPayment client service/hook.
```

Run:

```bash
rg -n "order_type_id.*insert|orderTypeId: order_type_id|orderTypeId:" packages/infrastructure/repositories packages/application apps/api/src
```

Expected:

```txt
Any order insert path used by SubmitPOSPayment must validate order type first.
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

If an existing unrelated test fails, document exact failure and why it is unrelated. Do not hide payment failures.

## Required report

Create:

```txt
roadmap/business-flows/P9_3_backend_submit_pos_payment_report.md
```

Report must include:

```txt
1. Summary
2. Root cause fixed
3. Backend SubmitPOSPayment architecture
4. API endpoint and DTO
5. Order type guard behavior
6. Full payment flow
7. DP flow
8. Multi flow
9. Split bill persisted lifecycle
10. Transaction/idempotency strategy
11. Frontend command submission changes
12. UI partial-result behavior
13. User-safe error mapping
14. Files changed
15. Tests added/updated
16. Validation output
17. Grep cleanup output
18. Remaining limitations
19. Next recommended phase
```

## Acceptance checklist

```txt
- [ ] Payment method values are only CASH, MANUAL_TRANSFER, MANUAL_QRIS.
- [ ] Payment flow values are only FULL, DOWN_PAYMENT, MULTI_PAYMENT, SPLIT_BILL.
- [ ] Backend has SubmitPOSPayment use case.
- [ ] Fresh-cart FULL/DP/MULTI/SPLIT goes through SubmitPOSPayment.
- [ ] Fresh-cart Multi/Split no longer manually creates order then records rows from business-flow hooks.
- [ ] Parent order creation/reuse is transaction-safe.
- [ ] Deterministic line idempotency exists.
- [ ] Split bill persists `order_bill_splits` lifecycle.
- [ ] Bill A can be paid while other items remain unassigned/unpaid.
- [ ] Parent order remains PARTIAL/open when bill/unassigned remainder exists.
- [ ] Retry never creates duplicate parent order.
- [ ] Retry never duplicates same payment line.
- [ ] Invalid order_type_id returns user-safe error before insert.
- [ ] FK constraint names are never shown to cashier.
- [ ] PARTIAL result does not clear cart/session.
- [ ] Payment application does not depend on businessProfile.
- [ ] Payment domain/application does not import React or UI hooks.
- [ ] Payment domain/application does not import Drizzle directly.
- [ ] Tests and validation pass or failures are explicitly documented.
- [ ] Report created.
```

## Commit message

```txt
feat(pos): add backend submit payment prompt
```
