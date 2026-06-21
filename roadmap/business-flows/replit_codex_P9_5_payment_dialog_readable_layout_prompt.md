# Replit/Codex Prompt P9.5 — Payment Dialog Readable Layout Final Fix

Repository: `Rndynt/AuraPoS`

## 1. Goal

Fix the POS payment dialog layout so it is readable, predictable, and easy for a cashier to use.

The current P9.4 implementation fixed some state wiring, but the visual result is still bad in mobile landscape:

```txt
- Multi still feels wrong because the payment method selector is large in the right content area instead of being part of a clear payment-control panel.
- Split Bill item assignment area is not visible enough; the cashier cannot clearly see/select the cart items to assign into Bill A/B.
- The right panel is consumed by large buttons and spacing.
- The UI is technically less duplicated but still not user-readable.
```

P9.5 must redesign the dialog layout, not keep patching spacing randomly.

Expected result:

```txt
Cashier opens payment dialog.
Left panel shows total, flow tabs, selected payment method, and flow summary.
Right panel shows only the active flow work area.
Multi: right panel shows payment lines and amount input; method is selected clearly from left/current-line panel.
Split: right panel prioritizes bill tabs and item assignment list; payment method/confirm does not hide the item list.
```

## 2. Important principle

The project needs simple readable UI, not more complexity.

```txt
- Clean layout ownership.
- No duplicated controls.
- No random nested scrolls.
- No oversized payment method buttons taking over the work area.
- No hidden item list.
- No legacy compatibility.
- No provider/card/e-wallet/gateway/NorthFlow logic.
- No businessProfile logic inside payment domain/application.
```

Only fix the payment dialog UX/layout and the state mapping needed by that layout.

## 3. Screenshots/problem diagnosis

Based on the current screenshots:

### Multi screenshot problem

```txt
- Left panel has total and flow tabs, but the rest of the left panel is empty.
- Right panel contains large method buttons, amount field, and numpad.
- The method selector looks like a second main content area instead of a compact control.
- After adding lines, the list and method selector crowd the right panel.
- This is visually harder to understand than putting the method control in the left panel/control rail.
```

### Split screenshot problem

```txt
- Split tab shows Bill A/B at top.
- Item assignment area is barely visible or effectively hidden.
- Bill totals and payment method controls appear before the cashier can clearly see the item list.
- The flow is backward: cashier must assign items first, then choose method/pay. The UI should prioritize item assignment.
```

## 4. Files to inspect first

Inspect before coding:

```txt
apps/pos-terminal-web/src/components/pos/PaymentMethodDialog.tsx
apps/pos-terminal-web/src/features/pos-core/services/posPaymentSubmissionService.ts
apps/pos-terminal-web/src/features/pos-core/services/__tests__/posPaymentSubmissionService.test.ts
apps/pos-terminal-web/src/features/pos-flows/retail/useRetailStandardPOSFlow.ts
apps/pos-terminal-web/src/features/pos-flows/restaurant/useRestaurantTableServicePOSFlow.ts
roadmap/business-flows/P9_4_payment_ux_finalization_report.md
```

Run:

```bash
rg -n "MethodButtons|multiMethod|setMultiMethod|SPLIT_BILL|MULTI_PAYMENT|split-item-assignment-list|DialogContent|isLandscape|overflow-y-auto|flex-1|min-h-0" apps/pos-terminal-web/src/components/pos/PaymentMethodDialog.tsx
```

## 5. Final layout concept

Use a consistent two-zone layout for desktop/tablet/mobile-landscape.

```txt
Dialog
├── Left control panel
│   ├── Pembayaran title
│   ├── Total amount
│   ├── Flow tabs: Bayar Penuh / DP / Multi / Split
│   ├── Payment method selector for current flow or current line
│   └── Compact flow summary/help
└── Right work panel
    ├── Active flow content
    └── Confirm/action area
```

For small portrait, it can stack vertically, but still keep this order:

```txt
Total → flow tabs → method selector → active work area → confirm
```

## 6. Left panel responsibilities

The left panel is the cashier control rail. It should not be empty.

Left panel must contain:

```txt
- Payment total
- Flow selection tabs
- Method selector when the active flow needs method selection
- Compact selected flow summary
```

Method selector placement:

```txt
FULL:
- method selector in left panel
- right panel: cash received/numpad/change OR manual confirmation display

DP:
- method selector in left panel
- right panel: DP amount input/numpad/remaining preview

MULTI:
- method selector in left panel titled "Metode Baris Berikutnya"
- selector writes to multiMethod/setMultiMethod
- right panel: existing lines, amount input, numpad, add-line button, final confirm

SPLIT:
- method selector in left panel titled "Metode Bayar Bill Aktif"
- selector writes to method/setMethod
- right panel: bill tabs, visible item assignment list, bill totals, confirm selected bill
```

Do not render a second method selector inside the right panel for Multi/Split.

## 7. Method selector component

Replace ad-hoc `MethodButtons` with a reusable, explicit component:

```ts
type MethodSelectorProps = {
  value: PaymentMethod;
  onChange: (method: PaymentMethod) => void;
  title?: string;
  compact?: boolean;
  testIdPrefix: string;
};
```

The component should support compact left-panel display:

```txt
- button height around 44-52px, not giant card blocks
- one column in narrow left rail
- clear selected state
- readable labels: Tunai, Transfer Manual, QRIS Manual
```

State mapping must be exact:

```txt
FULL  -> method/setMethod
DP    -> method/setMethod
MULTI -> multiMethod/setMultiMethod
SPLIT -> method/setMethod
```

## 8. Multi layout requirement

Multi must be readable and not look like duplicated payment screens.

Right panel for Multi must show:

```txt
1. Status: Terbayar X · Sisa Y
2. Existing payment lines list
3. Amount input for next line
4. Numpad
5. Add-line button: Tambah Tunai / Tambah Transfer Manual / Tambah QRIS Manual
6. Final confirm button only when remaining is zero
```

Left panel for Multi must show:

```txt
- total
- flow tabs
- method selector titled "Metode Baris Berikutnya"
- selected method summary
```

Multi correctness:

```txt
- Selecting method in left panel updates multiMethod.
- Add-line stores method: multiMethod.
- Existing lines display each stored method and amount.
- Global method must not affect Multi line storage.
- No method selector appears in the right panel for Multi.
```

## 9. Split layout requirement

Split must prioritize item assignment.

Right panel for Split must be redesigned as:

```txt
Top:
- Bill tabs: Bill A, Bill B, plus add bill

Main work area:
- Item assignment list must be visible immediately
- Each item row: assigned bill badge, product name, variant/options, quantity, amount
- Rows must be tap-friendly but compact
- Unassigned items must be clearly visible

Bottom/action area:
- Compact bill totals
- selected bill amount
- confirm button: Bayar Bill A · Rp X
```

Payment method for Split belongs in the left panel, not above the item list in the right panel.

### Landscape Split layout

For mobile landscape / wide dialog, use an internal two-column layout inside the right panel if needed:

```txt
Right panel Split
├── top bill tabs full width
└── body grid
    ├── left: item assignment list, scrollable, visible
    └── right: bill totals + selected bill summary + confirm button
```

This is preferred because the screen is short but wide.

### Portrait Split layout

For portrait, use vertical layout:

```txt
bill tabs
item assignment list, scrollable min height
bill totals
confirm button
```

### Hard requirements

```txt
- `split-item-assignment-list` must always have visible height.
- Use `min-h-0` on all flex/grid parents that contain scroll areas.
- Do not place method selector above item list in Split right panel.
- Do not let bill totals/payment footer push the item list to zero height.
- At least 3 item rows should be visible in landscape when there are 6 cart items, unless viewport is extremely small.
- The item list must remain scrollable.
```

## 10. Sizing and spacing rules

Use compact, practical spacing.

```txt
Dialog:
- width for landscape/tablet: min(94vw, 900px)
- max height: 92dvh
- left panel width: about 220-250px in landscape/tablet
- right panel: flex-1 min-w-0 min-h-0

Buttons:
- method buttons in left panel should be compact, not full content cards
- flow buttons can remain compact tabs
- numpad buttons can be smaller in landscape if needed

Scroll:
- only the active content area should scroll
- avoid nested scrollbars unless unavoidable
- never hide close button
```

## 11. Submit payload must stay canonical

Do not break the data contract already established.

Multi emits:

```ts
payment: {
  flow: "MULTI_PAYMENT",
  paymentKind: "MULTI_PAYMENT_LINE",
  lines: [
    { method: "CASH", amount: 100000 },
    { method: "MANUAL_TRANSFER", amount: 90900 },
  ],
}
```

Split emits:

```ts
payment: {
  flow: "SPLIT_BILL",
  paymentKind: "SPLIT_BILL_LINE",
  targetBillId: "A",
  lines: [
    { method: "CASH", amount: 15000, clientBillId: "A" },
  ],
  splits: [
    { clientBillId: "A", label: "Bill A", splitNo: 1, amountDue: 15000, amountPaid: 0, status: "UNPAID" },
    { clientBillId: "B", label: "Bill B", splitNo: 2, amountDue: 175900, amountPaid: 0, status: "UNPAID" },
  ],
}
```

Do not change canonical flow/method/kind names.

## 12. User-readable behavior

Cashier should understand:

```txt
Bayar Penuh:
- choose method on left
- enter cash/manual confirmation on right

DP:
- choose method on left
- enter DP amount on right

Multi:
- choose method for next line on left
- enter amount and add line on right
- repeat until remaining is zero

Split:
- choose method for selected bill on left
- assign items to bill on right
- pay selected bill from right confirm button
```

## 13. Tests / verification

Full UI test can be deferred if the project test stack is not ready, but add or update what is practical.

At minimum, update report/manual checklist.

If component tests are available, add assertions:

```txt
- Multi renders only one method selector and it is in the left panel/control rail.
- Multi right panel has no method selector.
- Selecting Transfer Manual in Multi stores MANUAL_TRANSFER in added line.
- Split right panel contains visible split-item-assignment-list before payment action section.
- Split right panel has no method selector above the item list.
```

Manual verification required:

```txt
1. Mobile landscape Multi: method selector appears in left panel only.
2. Mobile landscape Multi: adding line shows correct method and amount.
3. Mobile landscape Split: item rows are visible immediately.
4. Mobile landscape Split: at least several cart item rows are visible and scrollable.
5. Mobile landscape Split: payment method selector is not blocking item assignment.
6. Mobile portrait Split: item list still visible and scrollable.
7. Full and DP remain usable and do not regress.
```

## 14. Report update

Update:

```txt
roadmap/business-flows/P9_4_payment_ux_finalization_report.md
```

Add section:

```txt
## P9.5 Payment Dialog Readable Layout Final Fix
```

Include:

```txt
1. Screenshot problems analyzed
2. Final left-panel/right-panel layout decision
3. Multi method selector relocation
4. Split item assignment visibility fix
5. Mobile landscape behavior
6. Mobile portrait behavior
7. Files changed
8. Tests/manual checks performed
9. Remaining limitations
```

## 15. Acceptance checklist

```txt
- [ ] Left panel is no longer empty after flow tabs.
- [ ] FULL method selector appears in left panel.
- [ ] DP method selector appears in left panel.
- [ ] MULTI method selector appears in left panel as "Metode Baris Berikutnya".
- [ ] MULTI right panel does not render method selector.
- [ ] MULTI add line stores selected multiMethod.
- [ ] MULTI lines display correct method and amount.
- [ ] SPLIT method selector appears in left panel as "Metode Bayar Bill Aktif".
- [ ] SPLIT right panel does not show method selector before item list.
- [ ] SPLIT item assignment list is visible immediately.
- [ ] SPLIT item rows are readable: bill badge, name, quantity, amount.
- [ ] SPLIT item list remains scrollable.
- [ ] SPLIT footer/summary does not push item list to zero height.
- [ ] Mobile landscape layout is readable.
- [ ] Mobile portrait layout is readable.
- [ ] Close button remains reachable.
- [ ] Submit payload contract for FULL/DP/MULTI/SPLIT is unchanged.
- [ ] No provider/card/e-wallet/gateway/NorthFlow code added.
- [ ] No legacy compatibility added.
- [ ] Report updated.
```

## 16. Commit message

```txt
fix(pos): make payment dialog layout readable
```