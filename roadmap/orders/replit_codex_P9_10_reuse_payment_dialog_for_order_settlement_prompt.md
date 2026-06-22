# Replit/Codex Prompt P9.10 — Reuse PaymentMethodDialog for Order Settlement

Repository: `Rndynt/AuraPoS`

## 1. Goal

Remove the separate custom `Konfirmasi Pembayaran` dialog from the Orders page and reuse the existing POS payment dialog component.

The Orders detail settlement flow currently opens a different mini dialog even though the cashier already has a complete payment dialog in `PaymentMethodDialog.tsx`. This creates inconsistent UX and duplicates payment method UI.

Expected result:

```txt
- From Orders detail, clicking `Proses Pembayaran` or `Lunasi Sisa Rp X` opens the same PaymentMethodDialog used by POS cashier payment.
- The settlement dialog UI is consistent with POS payment UI.
- Payment method selection, cash amount input, manual transfer, and manual QRIS behavior are not duplicated in orders.tsx.
- Orders page only adapts the selected order remaining balance into PaymentMethodDialog props and records the resulting payment.
```

## 2. Problem from screenshot

Current behavior:

```txt
Orders detail -> Proses Pembayaran -> opens `Konfirmasi Pembayaran` custom AlertDialog.
```

Problems:

```txt
- It is visually different from the POS payment dialog.
- It duplicates payment method buttons.
- It has less complete behavior than PaymentMethodDialog.
- It adds another code path for payment UI.
- Future payment UI fixes will not automatically apply to Orders settlement.
```

The correct design is one reusable payment dialog.

## 3. Files to inspect before coding

Inspect:

```txt
apps/pos-terminal-web/src/pages/orders.tsx
apps/pos-terminal-web/src/components/pos/PaymentMethodDialog.tsx
apps/pos-terminal-web/src/features/pos-core/services/posPaymentSubmissionService.ts
apps/pos-terminal-web/src/lib/api/hooks.ts
apps/api/src/http/controllers/OrdersController.ts
roadmap/business-flows/P9_4_payment_ux_finalization_report.md
```

Run:

```bash
rg -n "Konfirmasi Pembayaran|settleDialogOpen|settlePaymentMethod|handleConfirmSettle|useRecordPayment|PaymentMethodDialog|Proses Pembayaran|Lunasi Sisa" apps/pos-terminal-web/src/pages/orders.tsx apps/pos-terminal-web/src/components/pos/PaymentMethodDialog.tsx apps/pos-terminal-web/src/lib/api/hooks.ts
```

## 4. Required refactor

Update `apps/pos-terminal-web/src/pages/orders.tsx`.

Remove the custom AlertDialog settlement UI:

```txt
AlertDialog
AlertDialogAction
AlertDialogCancel
AlertDialogContent
AlertDialogDescription
AlertDialogFooter
AlertDialogHeader
AlertDialogTitle
settlePaymentMethod state
POS_PAYMENT_METHOD_OPTIONS if no longer used elsewhere
```

Import and use:

```ts
import { PaymentMethodDialog } from "@/components/pos/PaymentMethodDialog";
```

Use one state only:

```ts
const [settleDialogOpen, setSettleDialogOpen] = useState(false);
```

## 5. Order settlement mapping

When selected order is not fully paid:

```ts
const remaining = Math.max(0, selectedOrder.total_amount - selectedOrder.paid_amount);
```

Render PaymentMethodDialog:

```tsx
<PaymentMethodDialog
  open={settleDialogOpen}
  onClose={() => setSettleDialogOpen(false)}
  cartTotal={remaining}
  cartItems={[]}
  isSubmitting={recordPaymentMutation.isPending}
  defaultPaymentMethod="CASH"
  allowPartial={false}
  allowMultiPayment={false}
  allowSplitBill={false}
  onConfirm={handleConfirmSettleFromPaymentDialog}
/>
```

For this settlement use case, only full payment of the remaining amount is allowed. Do not show DP, Multi, or Split in this dialog unless there is an explicit product decision later.

## 6. Confirm handler

Replace current `handleConfirmSettle` with a handler compatible with `PaymentMethodDialog`:

```ts
const handleConfirmSettleFromPaymentDialog = async (
  method: PaymentMethod,
  cashReceived?: number,
  partialAmount?: number,
  paymentDetails?: PaymentDetails
) => {
  if (!selectedOrder) return;
  const remaining = Math.max(0, selectedOrder.total_amount - selectedOrder.paid_amount);
  if (remaining <= 0) return;

  const line = paymentDetails?.lines?.[0];
  const amount = line?.amount ?? remaining;

  await recordPaymentMutation.mutateAsync({
    orderId: selectedOrder.id,
    amount,
    payment_method: method,
    received_amount: line?.receivedAmount ?? cashReceived,
  });

  setSettleDialogOpen(false);
};
```

Adjust field names to match the existing `useRecordPayment` contract. If the hook only accepts `payment_method`, keep the existing shape and do not invent backend fields unless supported.

## 7. Behavior requirements

For unpaid order:

```txt
Orders detail -> Proses Pembayaran -> PaymentMethodDialog opens with cartTotal = total unpaid amount.
```

For partial order:

```txt
Orders detail -> Lunasi Sisa Rp X -> PaymentMethodDialog opens with cartTotal = X.
```

For paid order:

```txt
No settlement dialog. Show Pesanan Lunas.
```

Payment methods:

```txt
CASH -> Tunai
MANUAL_TRANSFER -> Transfer Manual
MANUAL_QRIS -> QRIS Manual
```

## 8. UX requirements

```txt
- The Orders settlement dialog must look like the main POS payment dialog.
- No separate `Konfirmasi Pembayaran` mini dialog remains.
- No duplicate payment method grid in orders.tsx.
- No raw enum labels exposed to cashier.
- Dialog must stay responsive on mobile portrait, mobile landscape, tablet, and desktop through PaymentMethodDialog.
```

## 9. Safety rules

```txt
- Do not rewrite payment engine.
- Do not add provider/gateway/card/e-wallet/NorthFlow logic.
- Do not add legacy compatibility.
- Do not change existing order detail read model unless needed for settlement display.
- Keep order settlement as paying the remaining balance only.
```

## 10. Tests / verification

Add/update practical tests if available. Otherwise update manual checklist in report.

Manual verification:

```txt
1. Open Orders page.
2. Select unpaid order.
3. Click Proses Pembayaran.
4. Expected: PaymentMethodDialog opens, not custom Konfirmasi Pembayaran AlertDialog.
5. Select Tunai and pay exact amount.
6. Expected: payment is recorded and dialog closes on success.
7. Select partial order.
8. Click Lunasi Sisa Rp X.
9. Expected: PaymentMethodDialog opens with amount X, not full original total.
10. Transfer Manual and QRIS Manual remain selectable.
11. No DP/Multi/Split tabs appear in Orders settlement unless explicitly enabled later.
```

## 11. Report update

Update:

```txt
roadmap/business-flows/P9_4_payment_ux_finalization_report.md
```

Add section:

```txt
## P9.10 Reuse PaymentMethodDialog for Order Settlement
```

Include:

```txt
1. Reason custom settlement AlertDialog was removed.
2. How Orders settlement reuses PaymentMethodDialog.
3. Remaining-balance mapping.
4. Files changed.
5. Manual verification.
6. Remaining limitations.
```

## 12. Acceptance checklist

```txt
- [ ] Orders page no longer renders custom `Konfirmasi Pembayaran` AlertDialog.
- [ ] Orders settlement imports and uses `PaymentMethodDialog`.
- [ ] `settlePaymentMethod` state is removed.
- [ ] Duplicate payment method grid in orders.tsx is removed.
- [ ] Unpaid order opens PaymentMethodDialog with unpaid total.
- [ ] Partial order opens PaymentMethodDialog with remaining amount only.
- [ ] Paid order does not open payment dialog.
- [ ] Record payment still calls the existing order payment API/hook.
- [ ] Cash, Transfer Manual, and QRIS Manual work through the reused dialog.
- [ ] DP/Multi/Split are disabled for Orders settlement unless product explicitly enables them later.
- [ ] Styling is consistent with main POS payment dialog.
- [ ] Report updated.
```

## 13. Commit message

```txt
fix(pos): reuse payment dialog for order settlement
```
