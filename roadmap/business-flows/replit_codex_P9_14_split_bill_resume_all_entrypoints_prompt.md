# P9.14 — Split Bill Resume Across All Payment Entrypoints

Repository: `Rndynt/AuraPoS`

## Goal

Split Bill still opens with default empty A/B state after Bill A was already paid.

Current failed case:

- Order remaining amount is Rp 91.350.
- Bill A was already paid.
- Payment dialog opens with Bill A Rp 0 and Bill B Rp 0.
- Bill A is still active/editable.
- Items are still shown as assignable.
- Backend later rejects repeat Bill A payment because it knows Bill A is paid.

Expected:

- Bill A shows original paid amount.
- Bill A shows Lunas/PAID.
- Bill A is locked/read-only.
- Bill B or next unpaid bill is active.
- Paid item quantities are not assignable again.
- Remaining unpaid quantities are visible.

## Root cause to verify

P9.13 fixed `payActiveOrder`, but this screenshot can still happen because `PaymentMethodDialog` is also opened from other POS paths.

In `RetailStandardPOSFlow.tsx`, current props are effectively:

```tsx
cartTotal={pendingOrderForPayment?.totalAmount || cart.total}
cartItems={cart.items.length ? cart.items : pendingOrderForPayment?.order?.items}
existingSplitBills={pendingOrderForPayment?.order?.billSplits ?? []}
```

If `pendingOrderForPayment` is null but the current cart belongs to an existing order, `existingSplitBills` is still empty. `cart.loadOrder(fullOrder)` copies order items into cart, but split bill metadata is not passed to the payment dialog.

That makes `PaymentMethodDialog` reset to local default A/B.

## Files to inspect

- `apps/pos-terminal-web/src/features/pos-flows/retail/useRetailStandardPOSFlow.ts`
- `apps/pos-terminal-web/src/features/pos-flows/retail/RetailStandardPOSFlow.tsx`
- `apps/pos-terminal-web/src/features/pos-flows/restaurant/useRestaurantTableServicePOSFlow.ts`
- `apps/pos-terminal-web/src/features/pos-flows/restaurant/RestaurantTableServicePOSFlow.tsx`
- `apps/pos-terminal-web/src/hooks/useCart.ts`
- `apps/pos-terminal-web/src/components/pos/PaymentMethodDialog.tsx`
- `apps/pos-terminal-web/src/features/pos-core/services/posOrderApiService.ts`
- `apps/pos-terminal-web/src/features/pos-core/hooks/usePOSActiveOrderPayment.ts`
- `packages/infrastructure/repositories/orders/OrderRepository.ts`

Run:

```bash
rg -n "continueOrderId|pendingOrderForPayment|PaymentMethodDialog|existingSplitBills|cartItems=|cartTotal=|loadOrder\(|fetchOrderForPOS|billSplits|splits|orderBillSplit" apps packages
```

## Required implementation

Create one payment dialog context resolver used by POS flow views.

Suggested shape:

```ts
type POSPaymentDialogContext = {
  orderId?: string;
  orderNumber?: string;
  totalAmount: number;
  cartItems: CartItem[];
  existingSplitBills: ExistingSplitBill[];
  source: "FRESH_CART" | "SAVED_ORDER" | "ACTIVE_ORDER";
};
```

Rules:

1. If `pendingOrderForPayment` exists, use its full hydrated order, total amount, items, and bill splits.
2. Else if `continueOrderId` or current POS cart belongs to an existing server order, use the full order fetched by `fetchOrderForPOS` and its `billSplits`.
3. Else use fresh cart and `existingSplitBills = []`.

## Store hydrated continued order

In retail and restaurant flow hooks, keep full loaded order data separately from cart items:

```ts
const [continuedOrderForPayment, setContinuedOrderForPayment] = useState<POSLifecycleOrder | null>(null);
```

When `fetchOrderForPOS(continueOrderId)` succeeds:

- call `cart.loadOrder(fullOrder)` for visible cart items
- also call `setContinuedOrderForPayment(fullOrder)`

When cart is cleared or route returns to fresh POS:

- clear `continuedOrderForPayment`

This keeps split metadata available even though cart only stores items.

## Render PaymentMethodDialog from context

In `RetailStandardPOSFlow.tsx` and restaurant view:

```tsx
const paymentContext = flow.paymentDialogContext;

<POSPaymentDialog
  cartTotal={paymentContext.totalAmount}
  cartItems={paymentContext.cartItems}
  existingSplitBills={paymentContext.existingSplitBills}
  ...
/>
```

`existingSplitBills` must not come only from `pendingOrderForPayment`.

## After partial split payment

When split payment returns `PARTIAL`:

- invalidate `/api/orders/open`
- invalidate order list/detail query
- refetch `GET /api/orders/:id` when current POS screen still references the same order
- update `continuedOrderForPayment` or `pendingOrderForPayment.order`

Next dialog open must receive the new bill split state.

## Acceptance scenario

For order `#171931` with Bill A already paid and remaining Rp 91.350:

- Opening payment dialog from Draft/Active sheet must show Bill A paid/locked.
- Opening payment dialog from POS right cart after continuing an existing order must show Bill A paid/locked.
- Opening from Orders detail must show Bill A paid/locked if split settlement is supported there.
- Active bill must be Bill B or next unpaid bill.
- Paid quantities must be locked.
- Remaining quantities must be visible.

## Tests

Add tests for:

1. pending order context passes existing bill splits.
2. continued order context passes existing bill splits when pending order is null.
3. fresh cart passes empty existing bill splits.
4. after partial split payment, hydrated order state is refreshed.
5. PaymentMethodDialog renders Bill A PAID as locked and activates Bill B.

## Report update

Update:

`roadmap/business-flows/P9_4_payment_ux_finalization_report.md`

Add section:

`## P9.14 Split Bill Resume Across All Entrypoints`

Include root cause, changed files, data flow, verification, and remaining limitations.

## Acceptance checklist

- [x] PaymentMethodDialog does not receive empty `existingSplitBills` for existing split order.
- [x] `pendingOrderForPayment` path works.
- [x] `continueOrderId` / current cart existing-order path works.
- [x] restaurant active order path works if applicable.
- [x] Bill A no longer resets to Rp 0 from any entrypoint.
- [x] Bill A is paid/locked from any entrypoint.
- [x] Bill B or next unpaid bill becomes active.
- [x] paid quantities are not assignable again.
- [x] remaining quantities remain visible.
- [x] no migration added for this UI hydration issue.
- [x] report updated.

## Commit message

```txt
fix(pos): hydrate split bill resume across payment entrypoints
```
