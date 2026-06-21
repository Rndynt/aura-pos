# Replit/Codex Prompt P9.4 — Payment UX Finalization + Order Type Guard Completion

Repository: `Rndynt/AuraPoS`

## Goal

Finish the POS payment experience so the cashier can actually use it without broken layout, duplicated controls, or raw database errors.

This is not a backend-only patch and not another partial payment-invariant patch. This task must finish the complete cashier-facing payment flow:

```txt
Cart → Payment Dialog → Full / DP / Multi / Split → SubmitPOSPayment → readable result/error → correct cart/session state
```

The final UI must be understandable by a nontechnical cashier:

```txt
1. Pilih tipe pembayaran: Bayar Penuh, DP, Multi, atau Split.
2. Pilih metode pembayaran only once in the current flow.
3. Input amount only where amount input is needed.
4. Confirm payment.
5. If paid, close/clear/print.
6. If partial, keep remaining bill visible.
7. If there is an error, show a human-readable Indonesian message.
```

## Screenshots/problem symptoms to fix

The current observed behavior is unacceptable:

```txt
- In Multi tab, payment method selector appears twice.
- Multi tab concept is confusing because there is a global method selector and another line method selector.
- In Split tab, item/order list area can be hidden/cut off by the modal layout on phone screen.
- Dialog layout is cramped in portrait and landscape mobile views.
- Split flow can show items/order rows behind or under the bottom area.
- Raw FK error appears to cashier:
  Failed to create order: insert or update on table "orders" violates foreign key constraint "orders_order_type_id_order_types_id_fk"
```

These must be fixed in one coherent implementation.

## Non-negotiable direction

```txt
- Do not add provider/gateway/card/e-wallet/Midtrans/Xendit/NorthFlow logic.
- Do not add legacy compatibility for old payment aliases.
- Do not normalize old flow strings.
- Do not keep duplicated UI controls.
- Do not show raw SQL, FK constraint, enum, zod internals, stack traces, or "Failed to create order" technical text to cashier.
- Do not let frontend send stale order_type_id silently.
- Do not keep payment submit paths that bypass SubmitPOSPayment endpoint.
- Do not put businessProfile logic inside payment domain/application.
```

Built-in POS payment methods remain only:

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

## Mandatory first step: inspect before coding

Before editing, inspect these files and write findings into the report:

```txt
apps/pos-terminal-web/src/components/pos/PaymentMethodDialog.tsx
apps/pos-terminal-web/src/features/pos-core/components/POSPaymentDialog.tsx
apps/pos-terminal-web/src/features/pos-core/services/posPaymentSubmissionService.ts
apps/pos-terminal-web/src/features/pos-flows/retail/useRetailStandardPOSFlow.ts
apps/pos-terminal-web/src/features/pos-flows/restaurant/useRestaurantTableServicePOSFlow.ts
apps/pos-terminal-web/src/lib/api/hooks.ts
apps/pos-terminal-web/src/hooks/useCart.ts
apps/api/src/http/controllers/POSPaymentController.ts
apps/api/src/http/controllers/OrdersController.ts
packages/application/orders/CreateOrder.ts
packages/application/orders/CreateAndPayOrder.ts
packages/application/payments/SubmitPOSPayment.ts
packages/infrastructure/repositories/orders/OrderRepository.ts
packages/infrastructure/repositories/orders/DrizzleCreateAndPayOrderRepository.ts
packages/infrastructure/repositories/payments/DrizzleSubmitPOSPaymentRepository.ts
packages/infrastructure/repositories/payments/DrizzlePOSPaymentOrderTypeRepository.ts
packages/infrastructure/db/schema/orders.schema.ts
roadmap/business-flows/P9_3_backend_submit_pos_payment_report.md
```

Run these searches before coding:

```bash
rg -n "METHODS|MethodButtons|multiMethod|setMultiMethod|MULTI_PAYMENT|SPLIT_BILL|overflow-y-auto|maxHeight|DialogContent" apps/pos-terminal-web/src/components/pos/PaymentMethodDialog.tsx

rg -n "order_type_id|selectedOrderTypeId|activeOrderTypes|setSelectedOrderTypeId|orderTypes" apps/pos-terminal-web/src/features/pos-flows apps/pos-terminal-web/src/hooks apps/pos-terminal-web/src/lib/api

rg -n "orders_order_type_id_order_types_id_fk|foreign key constraint|Failed to create order|violates foreign key|invalid_enum_value|Expected.*FULL" apps packages

rg -n "createOrderMutation\.mutateAsync|useCreateOrder|create-and-pay|createAndPay|SubmitPOSPayment|/api/pos/payments/submit" apps/pos-terminal-web/src apps/api/src packages
```

Expected findings:

```txt
- PaymentMethodDialog currently renders global MethodButtons for non-split flows and also renders MethodButtons again inside MULTI_PAYMENT.
- MULTI_PAYMENT uses multiMethod state, but method selection UI may not actually update multiMethod clearly.
- Split layout has nested fixed/limited heights that can hide the item list/footer on phone screen.
- Frontend order type selection can stay stale if activeOrderTypes change and cart.selectedOrderTypeId is no longer valid.
- Backend/payment endpoint has an order type guard, but other create-order paths can still expose raw order_type_id FK errors.
```

## Part A — Redesign PaymentMethodDialog interaction model

Update:

```txt
apps/pos-terminal-web/src/components/pos/PaymentMethodDialog.tsx
```

The dialog must have one consistent layout and no duplicated controls.

### UI structure

Use this clear structure:

```txt
Header:
- Pembayaran
- Total amount
- Close button

Flow tabs:
- Bayar Penuh
- DP
- Multi
- Split

Content area:
- Render only the controls needed for selected flow
- Content area scrolls safely if screen is small

Footer/confirm area:
- Confirm button always visible for the active flow
- Disabled state explains what is missing
```

### Method selector rule

Payment method selector must appear only once per flow.

```txt
FULL:
- show one method selector
- if CASH, show cash received shortcuts/numpad/change
- if Manual Transfer/QRIS Manual, show simple instruction + confirm button

DP:
- show one method selector
- show DP amount input/numpad
- show remaining amount preview
- confirm DP

MULTI:
- do NOT show global method selector outside the line input area
- show existing payment lines at top
- show one active line method selector for the next line only
- show amount input/numpad for next line
- Add line button: "+ Tambah Tunai" / "+ Tambah Transfer Manual" / "+ Tambah QRIS Manual"
- after line is added, reset amount input; keep or reset method intentionally and document behavior
- when remaining = 0, show final confirm button only

SPLIT:
- do NOT show global method selector in sidebar/header
- show bill tabs
- show item assignment list
- show bill totals
- show one method selector for selected bill payment
- show one confirm button: "Bayar Bill A · Rp X"
```

### Fix `multiMethod`

The Multi payment line method must be controlled by `multiMethod`, not by the global `method` state.

Refactor the method selector into a reusable component that accepts explicit props:

```ts
type MethodSelectorProps = {
  value: PaymentMethod;
  onChange: (method: PaymentMethod) => void;
  layout?: "row" | "column" | "compact";
  testIdPrefix?: string;
};
```

Use it like:

```txt
FULL/DP selected method → method / setMethod
MULTI next line method → multiMethod / setMultiMethod
SPLIT selected bill method → method / setMethod
```

This must eliminate the duplicated method UI in Multi.

### Reset rules when switching flow

When cashier switches payment flow:

```txt
FULL:
- reset partialRaw, multiRaw, multiEntries only if leaving those flows
- keep selected method if reasonable

DP:
- reset cashRaw and multiRaw
- keep selected method

MULTI:
- reset cashRaw and partialRaw
- keep existing multiEntries only while still on Multi
- use multiMethod for new line method

SPLIT:
- reset cashRaw, partialRaw, multiRaw
- keep split assignments only while still on Split
```

Do not accidentally clear assigned split items when cashier only changes payment method.

## Part B — Fix responsive dialog layout

The dialog must be usable on:

```txt
- mobile portrait
- mobile landscape
- tablet/desktop
```

Required layout behavior:

```txt
- Dialog max height uses dynamic viewport units: max-h-[92dvh] or equivalent.
- On mobile portrait, dialog should be almost full width: width: min(94vw, 520px).
- On mobile landscape, dialog should use wider two-column layout but still fit vertically.
- Header/flow tabs must not push item list out of view.
- Split item list must have a real scroll area with min-height: 0 on flex parents.
- Split footer/confirm button must stay visible without covering the item list.
- No important content hidden behind bottom navbar/browser chrome.
```

Implementation guidance:

```txt
- Avoid hardcoded maxHeight: "38vh" for split item list if it breaks on landscape/portrait.
- Use flex column with min-h-0 and overflow-hidden on container.
- Put item list in flex-1 min-h-0 overflow-y-auto.
- Put payment method + confirm button in shrink-0 footer.
- For small portrait, consider rendering dialog as a single-column sheet-like modal.
- For landscape, left sidebar can exist, but do not duplicate method selector in left sidebar for Multi/Split.
```

### Minimum manual visual acceptance

After implementation, these must be true:

```txt
- Multi tab shows exactly one method selector for adding the current line.
- Multi tab does not show duplicate Tunai/Transfer/QRIS blocks.
- Split tab shows bill tabs, item list, bill totals, method selector, and confirm button without overlap.
- Item list is scrollable if there are many cart items.
- Close button is reachable.
- Flow tabs remain readable.
```

## Part C — Fix stale/invalid order_type_id before submit

The FK error must not happen again in user-facing flow.

### Frontend guard

Update retail and restaurant POS flows:

```txt
apps/pos-terminal-web/src/features/pos-flows/retail/useRetailStandardPOSFlow.ts
apps/pos-terminal-web/src/features/pos-flows/restaurant/useRestaurantTableServicePOSFlow.ts
```

Current behavior likely only sets default order type if selectedOrderTypeId is empty. That is not enough.

Required behavior:

```txt
- When order types finish loading, verify cart.selectedOrderTypeId exists in activeOrderTypes.
- If selectedOrderTypeId is missing or stale, set it to the first active order type.
- If no active order types exist, disable charge/save/kitchen/payment actions and show:
  "Tipe pesanan belum tersedia. Muat ulang POS atau aktifkan tipe pesanan terlebih dahulu."
- Before save draft, send to kitchen, or payment submit, call a shared ensureValidOrderType() helper.
- Never send stale order_type_id to backend.
```

Suggested helper:

```ts
function getValidSelectedOrderTypeId(): string | null {
  if (cart.selectedOrderTypeId && activeOrderTypes.some((type) => type.id === cart.selectedOrderTypeId)) {
    return cart.selectedOrderTypeId;
  }
  return activeOrderTypes[0]?.id ?? null;
}

function ensureValidOrderType(): string | null {
  const validId = getValidSelectedOrderTypeId();
  if (!validId) {
    toast({
      title: "Tipe pesanan belum tersedia",
      description: "Muat ulang POS atau aktifkan tipe pesanan terlebih dahulu.",
      variant: "destructive",
    });
    return null;
  }
  if (validId !== cart.selectedOrderTypeId) cart.setSelectedOrderTypeId(validId);
  return validId;
}
```

Use the returned `validId` in payload construction. Do not rely on state update timing.

### Backend guard for all order creation paths

The screenshot shows raw FK from an order create path. Fix all user-facing order creation paths, not only SubmitPOSPayment.

Update as needed:

```txt
apps/api/src/http/controllers/OrdersController.ts
packages/application/orders/CreateOrder.ts
packages/application/orders/CreateAndPayOrder.ts
packages/infrastructure/repositories/orders/OrderRepository.ts
packages/infrastructure/repositories/orders/DrizzleCreateAndPayOrderRepository.ts
packages/infrastructure/repositories/payments/DrizzlePOSPaymentOrderTypeRepository.ts
```

Required behavior:

```txt
- Any create order / create-and-pay / submit payment path that accepts order_type_id must validate it before DB insert.
- If invalid, inactive, or not enabled for tenant, return user-safe 400:
  "Tipe pesanan tidak valid atau belum aktif untuk tenant ini. Muat ulang POS lalu coba lagi."
- Do not expose "orders_order_type_id_order_types_id_fk".
- Do not expose "Failed to create order: insert or update...".
```

If the existing `DrizzlePOSPaymentOrderTypeRepository` can be reused cleanly, reuse it. If not, create a small shared application/infrastructure guard, but keep it simple.

### API error mapper

Update controller/global error handling so these patterns map to safe messages:

```txt
orders_order_type_id_order_types_id_fk
foreign key constraint
violates foreign key
Failed to create order
invalid input syntax for type uuid
invalid_enum_value
```

But do not hide all bugs under vague messages in logs. Logs may keep technical details; cashier response must be safe.

## Part D — Fix payment dialog data emitted for Split/Multi

Ensure emitted `paymentDetails` are clean and canonical.

### Multi emit

For Multi:

```txt
- lines must be the multiEntries only
- each line has method and amount
- sum must equal cartTotal/remaining
- no duplicate global method state should affect lines
```

### Split emit

For Split:

```txt
- targetBillId must equal selected active bill client id, e.g. "A"
- line.clientBillId or splitId must match active bill consistently
- splits must include all bills with id/clientBillId, label, splitNo, amountDue, amountPaid
- selected bill amountDue must equal selected bill total
- amountPaid in request for newly created split should not be used by backend as source of truth, but UI may still send display data
```

Do not change canonical backend flow names.

## Part E — User-readable errors and toasts

Update frontend error mapping if needed:

```txt
apps/pos-terminal-web/src/features/pos-core/services/posPaymentSubmissionService.ts
apps/pos-terminal-web/src/lib/api/hooks.ts
common fetch/mutation error helper if available
```

Cashier-facing errors must be readable:

```txt
Invalid order type:
"Tipe pesanan tidak valid atau belum aktif untuk tenant ini. Muat ulang POS lalu coba lagi."

Missing order type:
"Tipe pesanan belum tersedia. Muat ulang POS atau aktifkan tipe pesanan terlebih dahulu."

Split selected bill amount mismatch:
"Jumlah pembayaran harus sama dengan sisa bill yang dipilih."

Already paid bill:
"Bill yang dipilih sudah lunas."

Generic payment failure:
"Pembayaran gagal dicatat. Silakan coba lagi."
```

Forbidden cashier-facing text:

```txt
orders_order_type_id_order_types_id_fk
foreign key constraint
violates foreign key
invalid_enum_value
Expected 'FULL'
ZodError
Failed to create order: insert or update
```

## Part F — Tests required

Add/update tests. Do not only update docs.

### PaymentMethodDialog tests

Add or update UI/component tests if existing test stack supports it. If not, add focused service-level tests and document UI manual verification in the report.

Required assertions:

```txt
- Multi flow renders only one visible method selector group for active new line.
- Selecting Transfer Manual in Multi updates the next line method, then adding line stores MANUAL_TRANSFER.
- Multi add button label follows selected multiMethod.
- Split flow renders method selector once and confirm button once.
- Split flow emits targetBillId and splits consistently.
```

### Order type tests

Required tests:

```txt
- stale selectedOrderTypeId is replaced with first active order type before payment payload is built.
- no active order type prevents payment submit and shows readable error.
- invalid order_type_id from API create-order path maps to readable error, not FK text.
- SubmitPOSPayment invalid order type still returns readable error.
```

### Error mapping tests

Required tests:

```txt
- FK constraint string maps to safe Indonesian message.
- invalid enum/zod-like text maps to safe payment failure.
- "Failed to create order: insert or update..." does not appear in user-facing toast.
```

## Manual verification checklist

Use the running app and verify these exact cases:

```txt
1. Open Payment → Multi.
   Expected: only one Tunai/Transfer Manual/QRIS Manual selector is visible for next line.

2. Multi: choose Transfer Manual, input 10.000, tap Tambah.
   Expected: line shows Transfer Manual Rp 10.000.

3. Multi: add second method for remaining amount.
   Expected: final confirm appears only when remaining is zero.

4. Open Payment → Split with 6 cart items.
   Expected: item list is visible and scrollable; footer does not cover rows.

5. Split: assign one item to Bill A and pay Bill A.
   Expected: no raw FK error; if payment succeeds, partial message is readable.

6. Force stale order_type_id in local state or clear tenant order type config.
   Expected: UI/API shows readable order type error, never raw FK.

7. Portrait mobile.
   Expected: modal fits screen; close button, tabs, content, footer are reachable.

8. Landscape mobile.
   Expected: modal fits screen; content scrolls; no clipped order/item list.
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
rg -n "orders_order_type_id_order_types_id_fk|foreign key constraint|violates foreign key|Failed to create order: insert or update|invalid_enum_value|Expected.*FULL|ZodError" apps/pos-terminal-web/src apps/api/src packages
```

Expected:

```txt
No user-facing runtime string exposes these. Tests may include these strings only to prove safe mapping.
```

```bash
rg -n "<MethodButtons|MethodSelector|multiMethod|setMultiMethod|flow !== \"SPLIT_BILL\"" apps/pos-terminal-web/src/components/pos/PaymentMethodDialog.tsx
```

Expected:

```txt
The code proves each flow renders exactly one relevant method selector. Multi must use multiMethod/setMultiMethod.
```

```bash
rg -n "createOrderMutation\.mutateAsync|recordPaymentMutation\.mutateAsync|createAndPay|recordPayment\(" apps/pos-terminal-web/src/features/pos-flows apps/pos-terminal-web/src/features/pos-core apps/pos-terminal-web/src/lib
```

Expected:

```txt
Payment submission must not manually sequence createOrder + recordPayment. Draft save and restaurant kitchen create-order may remain if clearly not payment submission.
```

## Required report

Create or update:

```txt
roadmap/business-flows/P9_4_payment_ux_finalization_report.md
```

Report must include:

```txt
1. Summary
2. Screenshots/problems fixed
3. Files inspected before coding
4. Final Full Payment UI flow
5. Final DP UI flow
6. Final Multi Payment UI flow
7. Final Split Bill UI flow
8. Method selector duplication fix
9. Mobile portrait/landscape layout fix
10. Stale order_type_id frontend guard
11. Backend order_type_id guard for all create paths
12. User-safe error mapping
13. Files changed
14. Tests added/updated
15. Validation output
16. Manual verification checklist output
17. Remaining limitations, if any
```

Be honest. Do not mark something complete if it is not implemented.

## Acceptance checklist

```txt
- [ ] Multi tab shows no duplicated payment method selector.
- [ ] Multi line method uses multiMethod/setMultiMethod, not global method accidentally.
- [ ] Multi add button label matches selected next-line method.
- [ ] Full and DP show one method selector only.
- [ ] Split shows one method selector only.
- [ ] Split item list is visible and scrollable on mobile portrait.
- [ ] Split item list is visible and scrollable on mobile landscape.
- [ ] Split footer/confirm button does not cover item rows.
- [ ] Payment dialog close button is reachable.
- [ ] Flow tabs remain readable.
- [ ] Frontend prevents stale selectedOrderTypeId from being submitted.
- [ ] No active order type blocks payment/save/kitchen with readable error.
- [ ] All order create/payment paths validate order_type_id before insert or map invalid FK safely.
- [ ] Cashier never sees orders_order_type_id_order_types_id_fk.
- [ ] Cashier never sees raw "foreign key constraint" text.
- [ ] Cashier never sees "Failed to create order: insert or update".
- [ ] Payment submit still uses POST /api/pos/payments/submit.
- [ ] No provider/card/e-wallet/gateway logic added.
- [ ] No old payment alias compatibility added.
- [ ] Report created.
- [ ] Type-check/tests pass or unrelated failures are documented clearly.
```

## Commit message

```txt
fix(pos): finalize payment dialog ux and order type guard
```
