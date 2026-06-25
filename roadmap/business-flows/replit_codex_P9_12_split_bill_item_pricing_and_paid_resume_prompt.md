# Replit/Codex Prompt P9.12 — Split Bill Pricing + Paid Bill Resume Final Fix

Repository: `Rndynt/AuraPoS`

## 1. Goal

Fix two user-visible bugs that make Split Bill unreliable and confusing:

```txt
Bug 1 — Cart item price doubles incorrectly when quantity changes.
Example from manual test:
- Nasi Goreng base visible price around Rp 15.000.
- User selects variant/options so qty 1 becomes Rp 20.000.
- When quantity becomes 2, cart shows Rp 80.000.
- Expected: Rp 40.000.

Bug 2 — Paid Split Bill state is not restored correctly after reopening order/draft.
Example from manual test:
- User pays Bill A.
- Order remaining amount becomes Rp 91.350.
- User opens Split again from existing order/draft.
- UI shows Bill A Rp 0, not paid/locked.
- UI still shows all items as available.
- Clicking Bill A/payment causes backend error that Bill A is already paid.
- Backend knows Bill A is paid, but frontend UI does not represent it.
```

Expected result:

```txt
- Cart line totals are mathematically correct for base price + variant + options + quantity.
- Split bill totals use the same correct pricing source as cart/order totals.
- After Bill A is paid, reopening Split shows Bill A as paid/locked with its original amount.
- Paid Bill A cannot be selected for assignment/payment.
- Paid Bill A items/quantities do not appear as unpaid assignable items.
- Active bill defaults to Bill B / next unpaid bill.
- Remaining unpaid items/quantities are visible and assignable for the next bill.
```

This patch must fix the root cause, not only change labels or hide buttons.

## 2. Non-negotiable rules

```txt
- Do not add provider/card/e-wallet/gateway/NorthFlow logic.
- Do not add legacy compatibility branches or aliases.
- Do not add random repair migrations for this UI/pricing bug.
- Do not change payment methods beyond CASH, MANUAL_TRANSFER, MANUAL_QRIS.
- Do not treat paid split state as local dialog-only state.
- Do not make frontend show paid state only after backend rejects a repeat payment.
- Do not show backend/internal errors to cashier as the main state indicator.
- Do not double count variant/options/quantity.
- Do not double count split paid amount on retry.
```

## 3. Current code facts to verify before coding

Current cart pricing code in `useCart.ts` has:

```txt
- CartItem.itemTotal is documented as pre-discount base total / line total.
- calculateItemTotal(product, variant, selectedOptions, quantity) calls shared calculateItemPricing(...).item_subtotal.
- updateQuantity recalculates itemTotal with the new quantity.
- cartPricing also recalculates from product.base_price + variant_price_delta + selected_options + quantity.
- getItemPrice currently returns getItemEffectiveTotal(item), which is a line total, not a unit price.
```

This means the bug may be in display or cart panel math:

```txt
If a component receives getItemPrice(item) as a line total, then multiplies it by quantity again, qty 2 can become doubled.
```

Current `PaymentMethodDialog.tsx` already has partial support for persisted split state:

```txt
- existingSplitBills prop exists.
- persistedSplitBills state exists.
- Bill tab can show locked if persisted bill status is PAID.
- Item assignment uses splitItemQuantityMap.
```

But the screenshot proves one or more of these are still broken:

```txt
- existingSplitBills is not passed when reopening existing order/draft, OR
- backend/read model does not return split bill data, OR
- mapping from read model to existingSplitBills is wrong, OR
- paid item quantities are not linked to cart item ids/order item ids, OR
- cart item ids are regenerated and no longer match persisted order item ids, OR
- display uses cartTotal remaining but split bills are initialized from full/new local state.
```

## 4. Files to inspect first

Inspect before coding:

```txt
apps/pos-terminal-web/src/hooks/useCart.ts
apps/pos-terminal-web/src/components/pos/PaymentMethodDialog.tsx
apps/pos-terminal-web/src/components/pos/CartPanel.tsx
apps/pos-terminal-web/src/components/pos/MobileCartDrawer.tsx
apps/pos-terminal-web/src/features/pos-flows/retail/useRetailStandardPOSFlow.ts
apps/pos-terminal-web/src/features/pos-flows/restaurant/useRestaurantTableServicePOSFlow.ts
apps/pos-terminal-web/src/features/pos-core/services/posPaymentSubmissionService.ts
apps/pos-terminal-web/src/features/pos-core/services/posLifecycleOrderService.ts
apps/pos-terminal-web/src/features/pos-core/hooks/usePOSActiveOrderPayment.ts
apps/pos-terminal-web/src/components/pos/CombinedDraftSheet.tsx
apps/api/src/http/controllers/OrdersController.ts
packages/infrastructure/repositories/orders/OrderRepository.ts
packages/infrastructure/repositories/payments/DrizzleSubmitPOSPaymentRepository.ts
packages/infrastructure/db/schema/orders.schema.ts
packages/core/pricing/orderPricing.ts
roadmap/business-flows/P9_4_payment_ux_finalization_report.md
```

Run:

```bash
rg -n "getItemPrice|itemTotal|itemSubtotal|item_subtotal|totalPrice|total_price|unitPrice|unit_price|quantity|variant_price_delta|selected_options|calculateItemPricing|calculateOrderPricing" apps/pos-terminal-web/src packages/core packages/infrastructure

rg -n "existingSplitBills|persistedSplitBills|splitItemQuantityMap|clientBillId|orderBillSplitId|billSplits|orderBillSplits|splitItems|order_bill_split_items|order_bill_splits|paid split|status.*PAID|amountPaid|amountDue" apps packages migrations
```

## 5. Bug 1 — Cart price calculation requirement

### 5.1 Correct pricing definitions

Use one clear model everywhere:

```txt
unitBasePrice = product.base_price
variantDelta = variant.price_delta or 0
optionsDelta = sum selected_options price_delta including child options
unitPrice = unitBasePrice + variantDelta + optionsDelta
lineSubtotal = unitPrice * quantity
lineDiscount = discount, if any
lineTotal = lineSubtotal - lineDiscount
```

Do not mix unit and line totals.

### 5.2 Expected examples

Use these exact acceptance examples:

```txt
Example A:
base = Rp 15.000
variant/options delta = Rp 5.000
qty = 1
expected line total = Rp 20.000

Example B:
base = Rp 15.000
variant/options delta = Rp 5.000
qty = 2
expected line total = Rp 40.000
NOT Rp 80.000

Example C:
unit = Rp 28.000
qty = 2
expected line total = Rp 56.000
NOT any value produced by multiplying line total by qty again.
```

### 5.3 Required implementation direction

Add explicit helpers if needed:

```ts
getItemUnitPrice(item: CartItem): number
getItemLineSubtotal(item: CartItem): number
getItemLineTotal(item: CartItem): number
```

Rules:

```txt
- If a component needs unit display, use unit helper.
- If a component needs line total display, use line total helper.
- Do not pass a line total into a prop named getItemPrice if the receiver multiplies by quantity.
- Rename props if necessary: getItemUnitPrice vs getItemLineTotal.
- Cart subtotal/order subtotal must be calculated once from shared pricing, not from UI display values.
```

### 5.4 Places to fix

Check and fix all displays/calculations:

```txt
- Right cart panel item row amount.
- Mobile cart drawer item row amount.
- Draft loaded cart item totals.
- PaymentMethodDialog split item amount calculation.
- cart.toBackendOrderItems payload.
- CFD item payload if it depends on item price.
```

The cart panel must not multiply `getItemEffectiveTotal(item)` by quantity if `getItemEffectiveTotal` already returns line total.

## 6. Bug 2 — Paid split bill resume requirement

### 6.1 Correct product behavior

After Bill A is paid:

```txt
Bill A:
- amountDue = original paid Bill A amount.
- amountPaid = original paid amount.
- status = PAID.
- UI badge/chip = Lunas / Paid.
- tab disabled for assignment/payment.
- click does not make Bill A active editable target.

Bill B / next unpaid bill:
- active by default.
- starts with amount 0 if no new item selected yet.
- can receive only unpaid remaining items/quantities.

Item list:
- paid Bill A items are hidden from assignable list or shown locked in a separate paid summary.
- unpaid quantities remain visible.
- if an item qty was partially paid, only remaining qty is assignable.
```

### 6.2 Do not rely on backend rejection as UI state

Current bad behavior:

```txt
UI shows Bill A Rp 0 and editable.
User tries to pay Bill A.
Backend rejects because Bill A is already paid.
```

This is unacceptable. The UI must know Bill A is paid before the user clicks.

### 6.3 Required data flow

Trace and fix the full data path:

```txt
Backend DB -> OrderRepository/OrdersController -> frontend fetchOrderForPOS/useOrder -> cart.loadOrder/payment dialog props -> PaymentMethodDialog hydration.
```

Required read model must contain:

```txt
order.items[] with stable order item ids.
order.billSplits[] with clientBillId, amountDue, amountPaid, status, orderBillSplitId.
order.billSplitItems[] or split.items[] with orderItemId, clientBillId, quantity, amount.
order.payments[] with split/payment lines if useful for detail display.
```

If current API returns split rows but not item assignments, add the missing read mapping.

If current DB does not store split item assignments, implement it according to P9.11. Do not fake it from payment amount only.

## 7. Existing order / draft cart identity requirement

The split resume bug often happens because cart item IDs change after reopening.

Required:

```txt
- When loading an existing server order, CartItem.id must be the stable DB order_item.id when available.
- Do not regenerate nanoid for server order items that already have an id.
- persisted split item assignment must match orderItemId to CartItem.id.
- client_item_id is only for fresh cart before DB order items exist.
```

Check `useCart.loadOrder` carefully.

If it maps:

```ts
id: String(item.id ?? nanoid())
```

verify that `item.id` is actually DB order_item.id, not product id or missing field.

If backend sends `order_item_id`, map it explicitly:

```ts
id: String(item.id ?? item.orderItemId ?? item.order_item_id ?? nanoid())
```

## 8. PaymentMethodDialog split hydration requirement

`PaymentMethodDialog` must derive its split UI from persisted state when provided.

Required behavior on `open`:

```txt
- Normalize existingSplitBills by clientBillId.
- Keep paid bills in splitBills list.
- Put paid bills first if their splitNo says so.
- Preserve amountDue/amountPaid/status from persisted data.
- Build splitItemQuantityMap from persisted items.
- Default activeBill to first non-PAID bill.
- If all persisted bills are PAID but order remaining > 0, create next unpaid bill.
- Do not reset to [A, B] with both Rp 0 when existingSplitBills exists.
```

Item list rules:

```txt
- Use remaining quantity = order item quantity - locked/paid quantity - editable assigned quantity.
- Paid full item should not show as assignable for active unpaid bill.
- Partially paid item should show only remaining qty.
- Empty list means truly no unpaid item/qty remains.
```

Button rules:

```txt
- If active bill is paid/locked, button says Bill sudah lunas and disabled.
- If active bill has no selected items, button says Pilih item untuk Bill X dulu.
- If active bill has selected items, button says Bayar Bill X · Rp amount.
```

## 9. Backend submit requirement

Ensure split submit transaction persists both bill and item state correctly.

In one transaction:

```txt
- Create/update order_bill_splits.
- Create/update order_bill_split_items.
- Insert order_payments idempotently.
- Update split amountPaid/status only after idempotency check.
- Update order paidAmount/paymentStatus only after idempotency check.
```

Idempotency rules:

```txt
- Same clientPaymentSessionId + payment line key must not double-increment order paid amount.
- Same retry must not double-increment order_bill_splits.amount_paid.
- Same retry must not duplicate order_bill_split_items.
```

Validation rules:

```txt
- Cannot pay a split bill with status PAID.
- Cannot assign an item/quantity already locked by a paid bill.
- selected bill amount must match selected item quantities.
- selected payment amount must match selected bill remaining.
```

## 10. Tests required

Add tests where practical.

### 10.1 Pricing tests

```txt
1. Product Rp 15.000 + option/variant Rp 5.000 qty 1 = Rp 20.000.
2. Same item qty 2 = Rp 40.000, not Rp 80.000.
3. Product unit Rp 28.000 qty 2 = Rp 56.000.
4. Cart panel displays line total once, not line total × qty.
5. Cart subtotal equals sum of line totals.
```

### 10.2 Split resume tests

```txt
1. Pay Bill A with one item/quantity.
2. Reopen existing order/draft.
3. Bill A tab shows original amount and PAID/Lunas.
4. Bill A is disabled/read-only.
5. Active bill defaults to Bill B.
6. Paid Bill A items/quantities are not assignable again.
7. Remaining unpaid items are visible for Bill B.
8. Trying to pay Bill A from UI is impossible.
9. Backend rejects paid Bill A if called directly, with safe error.
10. Retry same Bill A payment does not double paid amount.
```

Add mapper tests for pure functions if component tests are hard:

```txt
- buildSplitStateFromExistingOrder
- getItemUnitPrice
- getItemLineTotal
- getRemainingAssignableQuantity
- getNextUnpaidBill
```

## 11. Manual verification checklist

Verify in running app:

```txt
1. Add Nasi Goreng with variant/options so qty 1 = Rp 20.000.
2. Increase qty to 2.
3. Cart line must show Rp 40.000.
4. Total must increase by Rp 20.000 only, not Rp 60.000.
5. Add items and create Split Bill.
6. Assign subset to Bill A and pay Bill A.
7. Reopen order/draft.
8. Bill A shows Lunas with original amount, not Rp 0.
9. Bill A cannot be selected for assignment/payment.
10. Bill B is active by default.
11. Unpaid remaining items/qty are visible under Bill B.
12. Pay Bill B.
13. Order becomes Lunas.
14. Reopen order detail and verify split summary is readable.
```

## 12. Report update

Update:

```txt
roadmap/business-flows/P9_4_payment_ux_finalization_report.md
```

Add section:

```txt
## P9.12 Split Bill Pricing + Paid Bill Resume Final Fix
```

Include:

```txt
1. Screenshot problems analyzed.
2. Cart price double-count root cause.
3. Unit price vs line total rule.
4. Split paid Bill A resume root cause.
5. Backend/read model fields used to hydrate split state.
6. Paid/locked bill behavior.
7. Remaining item quantity behavior.
8. Files changed.
9. Tests/manual verification.
10. Remaining limitations.
```

## 13. Acceptance checklist

```txt
- [x] Qty 1 Nasi Goreng variant/options Rp 20.000 stays Rp 20.000.
- [x] Qty 2 Nasi Goreng variant/options becomes Rp 40.000, not Rp 80.000.
- [x] Cart panel does not multiply line total by qty again.
- [x] Shared pricing source is used consistently.
- [x] Split item amounts use correct line/unit math.
- [x] After Bill A paid, reopening split shows Bill A original amount.
- [x] After Bill A paid, reopening split shows Bill A as Lunas/PAID.
- [x] Paid Bill A is disabled/read-only.
- [x] Active bill defaults to Bill B / next unpaid bill.
- [x] Paid Bill A items/quantities are not assignable again.
- [x] Remaining unpaid items/qty are visible for Bill B.
- [x] UI never invites user to pay already-paid Bill A.
- [x] Backend still rejects direct paid-bill submit safely.
- [x] Split retry does not double payment or split paid amount.
- [x] Order detail can show split summary when data exists.
- [x] No provider/card/e-wallet/gateway/NorthFlow logic added.
- [x] No legacy compatibility added.
- [x] No random repair migration added for this bug.
- [x] Report updated.
```

## 14. Commit message

```txt
fix(pos): correct split bill pricing and paid resume state
```
