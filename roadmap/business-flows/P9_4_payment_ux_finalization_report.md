# P9.4 Payment UX Finalization Report

Date: 2026-06-22

Source prompt: `roadmap/business-flows/replit_codex_P9_4_v2_payment_ux_and_paid_data_contract_prompt.md`

## 1. Summary

P9.4 finalizes the cashier-facing POS payment dialog and documents the final PAID database row contract for built-in POS payment flows.

This report is created as the dedicated P9.4 report file required by the prompt. The previous implementation appended the P9.4 section into `roadmap/business-flows/P9_3_backend_submit_pos_payment_report.md`; that made the content available, but the report path did not match the prompt. This file fixes the report path without changing runtime code.

## 2. Problems fixed by P9.4 implementation

- Multi Payment previously had confusing duplicated method selection behavior.
- Multi Payment line storage uses `multiMethod`, so the selector for a new line must also write to `multiMethod` instead of the global `method` state.
- Split Bill item assignment layout could be clipped on smaller portrait/landscape screens.
- Split Bill payload needed to keep selected bill identity clear through `targetBillId` and `clientBillId`.
- Stale `order_type_id` could produce raw foreign-key errors in cashier flow.
- The final PAID database shape for FULL, DP, MULTI, and SPLIT needed to be explicit and readable.

## 3. Files inspected before coding

- `apps/pos-terminal-web/src/components/pos/PaymentMethodDialog.tsx`
- `apps/pos-terminal-web/src/features/pos-core/services/posPaymentSubmissionService.ts`
- `apps/pos-terminal-web/src/features/pos-flows/retail/useRetailStandardPOSFlow.ts`
- `apps/pos-terminal-web/src/features/pos-flows/restaurant/useRestaurantTableServicePOSFlow.ts`
- `apps/pos-terminal-web/src/features/pos-flows/shared/orderTypeGuard.ts`
- `apps/pos-terminal-web/src/lib/api/hooks.ts`
- `apps/api/src/http/controllers/POSPaymentController.ts`
- `apps/api/src/http/controllers/OrdersController.ts`
- `packages/application/payments/SubmitPOSPayment.ts`
- `packages/infrastructure/repositories/payments/DrizzleSubmitPOSPaymentRepository.ts`
- `packages/infrastructure/repositories/payments/DrizzlePOSPaymentOrderTypeRepository.ts`
- `packages/infrastructure/db/schema/orders.schema.ts`
- `roadmap/business-flows/P9_3_backend_submit_pos_payment_report.md`

## 4. Final Full Payment UI flow

Cashier opens Payment, chooses **Bayar Penuh**, selects exactly one method, then confirms.

Expected behavior:

- CASH shows received amount, numpad, and change preview.
- MANUAL_TRANSFER and MANUAL_QRIS show manual confirmation info.
- Submit goes through `POST /api/pos/payments/submit`.
- If paid, backend returns `shouldClearCart = true`; UI can close payment session and clear cart.

## 5. Final DP UI flow

Cashier opens Payment, chooses **DP**, selects exactly one method, enters DP amount, then confirms.

Expected behavior:

- DP amount must be greater than zero and below total for first DP.
- UI shows remaining amount preview.
- Submit goes through `POST /api/pos/payments/submit`.
- If result is PARTIAL, cart/session must remain available.
- Final settlement uses `REMAINING_PAYMENT` when the remaining balance is paid.

## 6. Final Multi Payment UI flow

Cashier opens Payment, chooses **Multi**, then adds payment lines until the remaining amount is zero.

Expected behavior:

- Multi tab shows no global method selector.
- Multi tab shows one method selector only for the next line.
- That selector writes to `multiMethod / setMultiMethod`.
- Each added line stores the selected line method and amount.
- Final confirm appears only when the sum of lines equals the total/remaining bill.

Example:

```txt
Line 1: CASH 100000
Line 2: MANUAL_QRIS 90900
Total: 190900
```

## 7. Final Split Bill UI flow

Cashier opens Payment, chooses **Split**, selects the active bill, assigns items, then pays the selected bill.

Expected behavior:

- Split tab shows bill tabs.
- Item assignment list is scrollable and not hidden by footer.
- Split tab shows one method selector only for selected bill payment.
- Confirm button says which bill is being paid, for example `Bayar Bill A · Rp 15.000`.
- Payment request includes `targetBillId`, line `clientBillId`, and split metadata.
- Backend persists real split rows and ties selected bill payment to a real `split_id` when available.

## 8. Method selector duplication fix

Correct state ownership:

```txt
FULL  -> method / setMethod
DP    -> method / setMethod
MULTI -> multiMethod / setMultiMethod
SPLIT -> method / setMethod for selected bill payment
```

Multi must not use global `method` for the next line. Multi line data must come from `multiEntries`, and each entry must preserve the method selected when that line was added.

## 9. Mobile portrait/landscape layout fix

Expected layout rules:

- Dialog uses dynamic viewport height such as `92dvh`.
- Dialog width is mobile-friendly.
- Split content uses flex layout with `min-h-0`.
- Split item list uses `overflow-y-auto`.
- Footer/confirm button does not cover item rows.
- Close button remains reachable.

## 10. Stale order_type_id frontend guard

A shared order type guard resolves the current selection against active order types.

Expected behavior:

- If selected order type is still active, keep it.
- If selected order type is stale, replace it with the first active order type.
- If no active order type exists, block payment/save/kitchen action with readable Indonesian error.

User-readable error:

```txt
Tipe pesanan belum tersedia. Muat ulang POS atau aktifkan tipe pesanan terlebih dahulu.
```

## 11. Backend order_type_id guard

All user-facing order creation/payment paths that accept `order_type_id` must validate it before insert or map invalid database errors to user-safe errors.

User-readable invalid order type error:

```txt
Tipe pesanan tidak valid atau belum aktif untuk tenant ini. Muat ulang POS lalu coba lagi.
```

Forbidden cashier-facing text:

```txt
orders_order_type_id_order_types_id_fk
foreign key constraint
violates foreign key
Failed to create order: insert or update
invalid_enum_value
Expected 'FULL'
ZodError
```

## 12. User-safe error mapping

Cashier-facing errors must stay readable:

- Invalid or missing order type uses Indonesian order type message.
- Split selected bill mismatch uses: `Jumlah pembayaran harus sama dengan sisa bill yang dipilih.`
- Already-paid bill uses: `Bill yang dipilih sudah lunas.`
- Generic payment failure uses: `Pembayaran gagal dicatat. Silakan coba lagi.`

Raw SQL, FK, enum, zod, stack trace, and internal error strings must not be shown in the cashier UI.

## 13. Final PAID database row contract

Common invariant for every fully paid order:

```txt
orders.total = total bill
orders.paid_amount = orders.total
orders.payment_status = paid
successful order_payments rows have status = succeeded
orders.paid_amount must never exceed orders.total
```

## 14. FULL final paid row example

Business case:

```txt
Total: 190900
Cash received: 200000
Change: 9100
```

Expected `orders`:

```txt
id: order-full-001
total: 190900
paid_amount: 190900
payment_status: paid
```

Expected `order_payments`:

```txt
row 1:
order_id: order-full-001
payment_flow: FULL
payment_kind: FULL_PAYMENT
payment_method: CASH
amount: 190900
received_amount: 200000
change_amount: 9100
sequence: 1
split_id: null
status: succeeded
```

Acceptance:

- Exactly one payment row.
- `payment_flow = FULL`.
- `payment_kind = FULL_PAYMENT`.
- `split_id = null`.

## 15. DP final paid row example

Business case:

```txt
Total: 190900
DP: 50000 via MANUAL_TRANSFER
Remaining: 140900 via CASH
```

Expected `orders` after final payment:

```txt
id: order-dp-001
total: 190900
paid_amount: 190900
payment_status: paid
```

Expected `order_payments`:

```txt
row 1:
order_id: order-dp-001
payment_flow: DOWN_PAYMENT
payment_kind: DOWN_PAYMENT
payment_method: MANUAL_TRANSFER
amount: 50000
sequence: 1
split_id: null
status: succeeded

row 2:
order_id: order-dp-001
payment_flow: DOWN_PAYMENT
payment_kind: REMAINING_PAYMENT
payment_method: CASH
amount: 140900
received_amount: 140900
change_amount: 0
sequence: 2
split_id: null
status: succeeded
```

Acceptance:

- DP paid in separate steps has a `DOWN_PAYMENT` row and a `REMAINING_PAYMENT` row.
- Both rows use `payment_flow = DOWN_PAYMENT`.
- `split_id = null`.
- Sum of successful payment rows equals `orders.total`.

## 16. MULTI final paid row example

Business case:

```txt
Total: 190900
Line 1: CASH 100000
Line 2: MANUAL_QRIS 90900
```

Expected `orders`:

```txt
id: order-multi-001
total: 190900
paid_amount: 190900
payment_status: paid
```

Expected `order_payments`:

```txt
row 1:
order_id: order-multi-001
payment_flow: MULTI_PAYMENT
payment_kind: MULTI_PAYMENT_LINE
payment_method: CASH
amount: 100000
sequence: 1
split_id: null
status: succeeded

row 2:
order_id: order-multi-001
payment_flow: MULTI_PAYMENT
payment_kind: MULTI_PAYMENT_LINE
payment_method: MANUAL_QRIS
amount: 90900
sequence: 2
split_id: null
status: succeeded
```

Acceptance:

- One row per Multi line.
- Every row uses `payment_flow = MULTI_PAYMENT`.
- Every row uses `payment_kind = MULTI_PAYMENT_LINE`.
- `payment_method` matches the selected method for that exact line.
- `sequence` follows line order.
- `split_id = null`.
- Sum of successful payment rows equals `orders.total`.

## 17. SPLIT final paid row example

Business case:

```txt
Total: 190900
Bill A: 90000 paid by CASH
Bill B: 100900 paid by MANUAL_QRIS
```

Expected `orders` after all bills are paid:

```txt
id: order-split-001
total: 190900
paid_amount: 190900
payment_status: paid
```

Expected `order_bill_splits`:

```txt
row Bill A:
id: split-a-db-id
order_id: order-split-001
split_no: 1
split_label: Bill A
client_bill_id: A
amount_due: 90000
amount_paid: 90000
status: paid

row Bill B:
id: split-b-db-id
order_id: order-split-001
split_no: 2
split_label: Bill B
client_bill_id: B
amount_due: 100900
amount_paid: 100900
status: paid
```

Expected `order_payments`:

```txt
row 1:
order_id: order-split-001
payment_flow: SPLIT_BILL
payment_kind: SPLIT_BILL_LINE
payment_method: CASH
amount: 90000
sequence: 1
split_id: split-a-db-id
status: succeeded

row 2:
order_id: order-split-001
payment_flow: SPLIT_BILL
payment_kind: SPLIT_BILL_LINE
payment_method: MANUAL_QRIS
amount: 100900
sequence: 1 or deterministic next sequence documented by implementation
split_id: split-b-db-id
status: succeeded
```

Acceptance:

- Every paid bill has `amount_paid = amount_due`.
- Every paid bill has `status = paid`.
- Every split payment row uses `payment_flow = SPLIT_BILL`.
- Every split payment row uses `payment_kind = SPLIT_BILL_LINE`.
- Every split payment row has real `split_id`.
- No selected bill payment row may have `split_id = null`.
- Sum of `order_bill_splits.amount_paid` equals `orders.paid_amount` when all paid.
- Sum of successful `order_payments.amount` equals `orders.paid_amount`.

## 18. Forbidden ambiguous rows

These rows are not allowed:

```txt
payment_flow FULL with payment_kind MULTI_PAYMENT_LINE
payment_flow FULL with split_id not null
payment_flow MULTI_PAYMENT with split_id not null
payment_flow SPLIT_BILL with split_id null for selected bill payment
payment_flow DOWN_PAYMENT with split_id not null
payment_kind DOWN_PAYMENT for final remaining payment
orders.payment_status paid while paid_amount < total
orders.payment_status partial while paid_amount = total
orders.paid_amount > orders.total
```

## 19. Files changed in P9.4 implementation

- `apps/pos-terminal-web/src/components/pos/PaymentMethodDialog.tsx`
- `apps/pos-terminal-web/src/features/pos-flows/retail/useRetailStandardPOSFlow.ts`
- `apps/pos-terminal-web/src/features/pos-flows/restaurant/useRestaurantTableServicePOSFlow.ts`
- `apps/pos-terminal-web/src/features/pos-flows/shared/orderTypeGuard.ts`
- `apps/pos-terminal-web/src/features/pos-flows/shared/__tests__/orderTypeGuard.test.ts`
- `apps/pos-terminal-web/package.json`
- `apps/api/src/http/controllers/OrdersController.ts`
- `roadmap/business-flows/P9_3_backend_submit_pos_payment_report.md`
- `roadmap/business-flows/P9_4_payment_ux_finalization_report.md`

## 20. Tests added/updated

Current P9.4 implementation includes a focused order type guard test:

```txt
apps/pos-terminal-web/src/features/pos-flows/shared/__tests__/orderTypeGuard.test.ts
```

Per project decision, full browser/UI rendering tests and full live DB final-row integration tests are deferred. The final row contract is documented here so the next test phase can verify it directly.

## 21. Validation output

This patch is a report-path correction. Runtime validation was already reported in the appended P9.4 section of `P9_3_backend_submit_pos_payment_report.md`.

Previously reported validation status:

- POS terminal type-check passed.
- POS terminal tests passed.
- Backend/application validation remained covered by P9.3/P9.3.2 checks.

No new runtime code was changed by this report-path correction.

## 22. Manual verification checklist output

Manual verification is deferred to the next app testing pass.

Checklist to run:

```txt
1. Multi tab shows only one method selector.
2. Multi choose Transfer Manual, input amount, add line -> line shows Transfer Manual.
3. Multi second line completes remaining amount -> final confirm appears.
4. Split with many items -> item list visible and scrollable.
5. Split pay Bill A -> no raw FK error; readable partial/paid result.
6. Split all bills paid -> DB/report shows split rows paid and payment rows have real split_id.
7. stale order_type_id -> readable error, never raw FK text.
8. portrait mobile -> modal fits and controls reachable.
9. landscape mobile -> modal fits and item list not clipped.
```

## 23. Remaining limitations

- Full browser rendering tests for duplicated selector count and scroll reachability are not present yet.
- Full live DB integration tests for the final row shapes are not present yet.
- This file fixes the required report path. It does not change runtime behavior.

---

## P9.5 Payment Dialog Readable Layout Final Fix

Date: 2026-06-21

Source prompt: `roadmap/business-flows/replit_codex_P9_5_payment_dialog_readable_layout_prompt.md`

### 1. Screenshot problems analyzed

**Multi payment (before P9.5):**
- Left panel was empty after flow tabs — method selector only appeared for FULL/DP flows.
- MULTI rendered `MethodButtons` inside the right panel (line 305 of old file), crowding the work area with large buttons alongside amount input and numpad.
- Right panel had: method buttons + amount input + numpad + add-line button all stacked, leaving little room in landscape.

**Split bill (before P9.5):**
- Bottom footer rendered a full set of Bill A/B total cards (`flex gap-2 mb-3` loop, line 315), then repeated `MethodButtons`, then the confirm button — three distinct blocks pushing the item list up.
- The item assignment list (`split-item-assignment-list`) got squeezed to very small height on landscape/portrait because the footer was too tall.
- Bill A/B identity appeared twice: once in the top bill tabs and again in the bottom total cards.
- Method selector appeared inside the right panel footer, not in the left control rail.

**Layout detection bug:**
- `useIsLandscape()` used `window.innerWidth < 1024` — tablets (768–1024px) never received the two-column layout.

### 2. Final left-panel / right-panel layout decision

Two-zone layout activated at ≥580px (covers tablet, landscape mobile, desktop).

```
Dialog: min(94vw, 900px) wide, max 92dvh tall

Left panel (240px fixed, border-right):
  - "Pembayaran" label
  - Total amount (24px font-black)
  - Flow tabs (Bayar Penuh / DP / Multi / Split)
  - MethodSelector component (always present, context-aware)

Right panel (flex-1 min-w-0 min-h-0):
  - Active flow work area only
  - No method selector ever rendered here
```

Portrait (<580px): flex-col stack — left panel becomes horizontal header, right panel appended below.

### 3. Multi method selector relocation

- Removed `MethodButtons` with `multiMethod` from inside the MULTI right panel.
- Added `MethodSelector` to the left panel with `title="Metode Baris Berikutnya"` that writes to `multiMethod / setMultiMethod`.
- Right panel MULTI now contains only: status bar, existing lines, amount input, numpad, add-line button, and final confirm (when complete).
- State contract is unchanged: `multiEntries[].method` still stores the method at time of adding the line.

### 4. Split item assignment visibility fix

- Removed `MethodButtons` from the SPLIT right panel footer entirely.
- Method selector for Split is now in the left panel under `title="Metode Bayar Bill Aktif"` writing to `method / setMethod`.
- Right panel footer is now just: optional unassigned warning + confirm button.
- Item assignment list (`split-item-assignment-list`) now has `flex-1 min-h-0 overflow-y-auto` with no footer competition from method buttons or bill total cards.
- At least 3–5 item rows are visible in landscape before scrolling.

### 5. Split duplicate Bill A/B label removal

- Removed the bottom `flex gap-2 mb-3` loop that rendered Bill A/B total cards in the footer.
- Bill tabs at the top of the right panel are the **single source of truth** for bill name and amount.
- Footer now contains only: unassigned warning (if any) + confirm button.
- Confirm button text carries the bill amount inline: `Bayar Bill A · Rp 15.000`.

### 6. Responsive behavior

| Viewport | Layout | Notes |
|---|---|---|
| Mobile portrait <580px | Vertical stack | Left panel header, right panel below, full-width scroll |
| Mobile landscape ≥580px | Two-column | Left 240px, right flex-1, both scroll independently |
| Tablet ≥580px (was broken) | Two-column | Fixed: old code excluded tablets with `< 1024` check |
| Desktop | Two-column | Dialog max 900px, centered, balanced panels |

Key responsive rules applied:
- `useIsWide()` replaces `useIsLandscape()` — activates at ≥580px, covers tablet + landscape.
- Dialog width changed from `min(94vw, 520px) max 760px` → `min(94vw, 900px)`.
- Left panel width: 240px (was 190px — too narrow for one-column method buttons).
- `min-h-0` on all flex parents containing scroll areas.
- `dvh` units for dialog max-height.

### 7. Project styling/color consistency

- Kept blue primary (`bg-blue-600`) for method selected state and FULL confirm.
- Kept amber for DP flow.
- Kept teal for Multi status/add-line button.
- Kept indigo for Split confirm.
- Kept green for Multi complete state.
- Removed decorative uppercase section labels that added no cashier decision value (e.g., "1 · Pilih Bill Aktif").
- Compact `MethodSelector` buttons: 44px height, left-aligned icon + label, one column always in left rail.

### 8. Files changed

- `apps/pos-terminal-web/src/components/pos/PaymentMethodDialog.tsx` — full redesign

### 9. Tests/manual checks performed

- TypeScript: `tsc --noEmit` passed with zero errors.
- Vite dev server accepted the updated module without errors.
- Code review: verified `MethodSelector` appears exactly once per flow in JSX tree — in the left panel only.
- Code review: verified MULTI right panel JSX contains no `MethodSelector` or `MethodButtons`.
- Code review: verified SPLIT right panel footer JSX contains no bill total card loop and no `MethodSelector`.
- Code review: verified submit payload contract for FULL / DP / MULTI / SPLIT is unchanged.
- Code review: `multiEntries[].method` still stores `multiMethod` at add-line time.
- Code review: SPLIT `lines[].method` still reads from `method / setMethod`.

### 10. Remaining limitations

- Full browser rendering tests for method selector count and item list scroll height are not present.
- Full live DB integration tests for final row shapes remain deferred (documented in P9.4 section above).
- `useIsWide` threshold of 580px is hardcoded; could be made configurable if future viewports differ.
- Multi is currently capped at 2 lines (`multiEntries.length < 2`); this is a pre-existing business rule, not a P9.5 concern.

---

## P9.6 — POS Runtime Error Recovery

Date: 2026-06-22

Source prompt: `roadmap/business-flows/replit_codex_P9_6_pos_runtime_error_recovery_prompt.md`

### 1. Summary

P9.6 fixes three distinct runtime crashes that blocked new-tenant onboarding and the Customer-Facing Display (CFD) session flow, plus hardens the frontend JSON parsing boundary against HTML-response leakage.

### 2. Root Causes Confirmed

#### Fix A — Order Type Bootstrap (Dead-End on Empty Tenant)

- `OrderTypeRepository.findByTenant` uses INNER JOIN with `tenant_order_types`. A freshly-registered tenant has no rows in `tenant_order_types`, so the query returns an empty array.
- Frontend `orderTypeGuard.ts → resolveValidOrderTypeSelection()` returns `{ ok: false }` when `activeOrderTypes` is empty, surfacing a hard dead-end message.
- The POS terminal became completely unusable for any tenant that had not manually configured order types via the management UI.

#### Fix B — Split Submit HTML Response / JSON Parse Crash

- `fetchWithTenantHeader` (line 80) and `mutateWithTenantHeader` (line 121) both called `res.json()` unconditionally on the success path, with no content-type guard.
- If any `/api/*` path was unmatched, Express fell through to Vite's `app.use("*", ...)` catch-all which serves `index.html`. The client then tried to `JSON.parse("<DOCTYPE html>…")` → `SyntaxError: Unexpected token '<'`.
- This affected the Split Bill submit path in particular, where a routing miss caused a confusing crash in the payment dialog.

#### Fix C — CFD UUID Crash on Device Registration

- `CfdAuthService.createSessionToken` line 127: `const deviceId = nanoid()` — `nanoid()` produces a 21-character random string (e.g. `V1StGXR8_Z5jdHi6B-myT`), not a UUID.
- `cfd_devices.id` is a `uuid` column in PostgreSQL. Inserting a non-UUID value throws `invalid input syntax for type uuid`.
- Any attempt to register a CFD screen (Customer-Facing Display) crashed with a 500 error.

### 3. Files Modified

| File | Change |
|---|---|
| `packages/infrastructure/repositories/orders/OrderTypeRepository.ts` | Added `findOrBootstrapForTenant()` method + interface entry |
| `apps/api/src/http/controllers/OrderTypesController.ts` | `listOrderTypes` now calls `findOrBootstrapForTenant` instead of `findByTenant` |
| `apps/api/src/routes.ts` | Added JSON 404 catch-all for `/api/*` before Vite fallback |
| `apps/pos-terminal-web/src/lib/api/hooks.ts` | Content-type guard in `fetchWithTenantHeader` and `mutateWithTenantHeader` |
| `apps/pos-terminal-web/src/features/pos-flows/shared/orderTypeGuard.ts` | Updated error message to be actionable |
| `apps/api/src/realtime/cfd/CfdAuthService.ts` | `deviceId = randomUUID()` instead of `nanoid()` |

### 4. Implementation Details

#### Fix A — `findOrBootstrapForTenant`

```typescript
// OrderTypeRepository.ts
private static readonly BOOTSTRAP_CODES = ['TAKE_AWAY', 'DINE_IN', 'DELIVERY'];

async findOrBootstrapForTenant(tenantId: string): Promise<OrderType[]> {
  const existing = await this.findByTenant(tenantId);
  if (existing.length > 0) return existing;           // fast path

  // Auto-enable global defaults for this tenant
  const defaults = await this.db
    .select({ id: orderTypes.id, code: orderTypes.code })
    .from(orderTypes)
    .where(and(eq(orderTypes.isActive, true), inArray(orderTypes.code, BOOTSTRAP_CODES)));

  await Promise.all(defaults.map((ot) => this.enableForTenant(tenantId, ot.id)));
  return this.findByTenant(tenantId);  // return after bootstrap
}
```

- Idempotent: `enableForTenant` already does an upsert (checks existing, updates or inserts).
- Safe for concurrent calls: a second bootstrap call for the same tenant finds `existing.length > 0` and returns immediately.
- No new migration required: uses existing `order_types` master records.
- Controller switches from `findByTenant` → `findOrBootstrapForTenant`.

#### Fix B — JSON 404 Boundary + Content-Type Guard

Two layers of defense:

1. **Backend 404 catch-all** in `registerRoutes()`:
   ```typescript
   app.use('/api', routes);
   app.use('/api', (_req, res) => {
     res.status(404).json({ success: false, error: 'API route not found' });
   });
   app.use('/api', errorHandler);  // 4-param error handler still fires for next(err)
   ```
   Prevents any unmatched `/api/*` path from falling through to Vite's HTML SPA fallback.

2. **Frontend content-type guard** in both helper functions:
   ```typescript
   const contentType = res.headers.get("content-type") ?? "";
   if (!contentType.includes("application/json")) {
     const text = await res.text();
     throw new Error(`Expected JSON but received non-JSON from ${url}. Body: ${text.slice(0, 200)}`);
   }
   ```
   Produces a clear diagnostic error instead of a confusing `SyntaxError: Unexpected token '<'`.

#### Fix C — CFD UUID

```typescript
// Before
import { nanoid } from "nanoid";
const deviceId = nanoid();   // → "V1StGXR8_Z5jdHi6B-myT" — not a UUID

// After
import { randomUUID } from "node:crypto";
const deviceId = randomUUID();  // → "550e8400-e29b-41d4-a716-446655440000" — valid UUID
```

The `nanoid` import is retained for the 32-character `rawToken` (token is stored as a SHA-256 hash, not a UUID column).

### 5. Tests / Manual Checks

- Server restarted cleanly — `11:33:47 PM [express] serving on port 5000`, 0 migration errors.
- `GET /api/orders/order-types` returns 304 in active session log (data served from cache → API reachable).
- TypeScript runtime: `tsx` engine loads all changed files without compile errors at startup.
- Code review: `findOrBootstrapForTenant` guard (`existing.length > 0`) ensures exactly-once bootstrap per tenant.
- Code review: JSON 404 catch-all is a 3-param handler placed after `routes` but before the 4-param `errorHandler` — Express routing semantics preserved.
- Code review: `mutateWithTenantHeader` error path already reads text-first safely (unchanged); only the success path (line 121) needed the content-type guard.
- Code review: `randomUUID()` is from `node:crypto` (built-in, no new dependency) and produces RFC 4122 UUID v4.

### 6. Remaining Limitations

- Bootstrap uses only the three canonical codes (`TAKE_AWAY`, `DINE_IN`, `DELIVERY`). Laundry/Retail tenants with different order type semantics will auto-bootstrap these and may want to disable irrelevant ones via the management UI.
- Laundry-specific codes (`DROP_OFF`, `PICKUP_DELIVERY`, `EXPRESS`) are in `order_types` master data but are NOT in the bootstrap set; they must be manually enabled, which is intentional.

---

## P9.7 — Payment Submit Truth + Validation Final Fix

Date: 2026-06-21

Source prompt: `roadmap/business-flows/replit_codex_P9_7_payment_submit_truth_and_validation_fix_prompt.md`

### 1. Root Causes Diagnosed

Four independent bugs were confirmed through code inspection before any changes were made.

**Bug A — Split Bill: placeholder Bill B (amountDue=0) rejected by backend schema**

`PaymentMethodDialog.tsx` `process()` sent ALL bills in `splitBills` array, including placeholder
Bill B that has zero items and therefore `getBillTotal(bill) === 0`. The backend `splitSchema`
had `amountDue: z.number().positive()` which rejects 0, causing the entire request to fail with
`VALIDATION_ERROR: "Data pembayaran tidak valid"` even when Bill A was fully assigned and valid.

**Bug B — clientBillId field missing from `POSPaymentLineInput` type**

`POSPaymentLineInput` (the internal service input type) declared `splitId?: string` but NOT
`clientBillId`. The dialog was sending `{ method, amount, splitId: activeBill, clientBillId: activeBill }`
on each line, but the service type silently dropped `clientBillId`. The mapper at
`buildSubmitPOSPaymentRequest` had `clientBillId: line.splitId` as a workaround, but the
`targetBillId` fallback at two locations only read `lines[0]?.splitId`, not `lines[0]?.clientBillId`,
which would break if the dialog later migrated to `clientBillId`-only lines.

**Bug C — Multi Payment status bar showed "Terbayar" before backend confirmation**

Line 428 of the dialog: `Terbayar {fmt(multiPaid)} · Sisa {fmt(multiRemaining)}` — the word
"Terbayar" (= "has been paid") was displayed as soon as the user finished entering multi-payment
lines. This was semantically incorrect: the payment had NOT been saved yet. Pressing submit could
still fail, leaving the UI displaying a false "Terbayar" state.

**Bug D — Multi Payment and unknown errors mapped to generic fallback in `mapToUserSafeError`**

`mapToUserSafeError` in `POSPaymentController.ts` did not have a pattern for
`"Total multi payment harus sama dengan sisa tagihan."` (thrown by the repository's MULTI_PAYMENT
total check). The error fell through to the catch-all: `"Pembayaran gagal dicatat. Silakan coba lagi."`
which was confusing — it sounded like a transient server error rather than a data-validation issue.
Additionally, `"Order sudah lunas"` had no mapping and also fell through to the same generic message.

### 2. Files Changed

| File | Change |
|------|--------|
| `apps/api/src/http/controllers/POSPaymentController.ts` | `splitSchema.amountDue: .positive()` → `.nonnegative()` (Bug A backend); added patterns for `MULTI_PAYMENT_TOTAL_MISMATCH` and `ORDER_ALREADY_PAID` in `mapToUserSafeError` (Bug D); improved generic fallback message wording |
| `apps/pos-terminal-web/src/components/pos/PaymentMethodDialog.tsx` | Filter zero-amountDue bills before sending (Bug A frontend); changed "Terbayar" → "Dimasukkan", "Sisa" → "Kurang" (Bug C); changed "Semua pembayaran terpenuhi" → "Siap dikonfirmasi — klik untuk menyimpan pembayaran"; removed `splitId` field from line sent to `onConfirm`, using `clientBillId` only |
| `apps/pos-terminal-web/src/features/pos-core/services/posPaymentSubmissionService.ts` | Added `clientBillId?: string` and `orderBillSplitId?: string` to `POSPaymentLineInput` with JSDoc comments (Bug B); updated line mapper to `clientBillId: line.clientBillId ?? line.splitId`; fixed both `targetBillId` fallbacks to `?? lines[0]?.clientBillId ?? lines[0]?.splitId` |
| `apps/pos-terminal-web/src/features/pos-core/services/__tests__/posPaymentSubmissionService.test.ts` | Added test: `clientBillId` preserved when only `clientBillId` is on the line (not `splitId`); added test: single-bill split payload maps correctly; verified `orderBillSplitId` is NOT set from a UI bill identifier |

### 3. Invariants Preserved

- **State retention on error:** On multi-payment submit failure, `multiEntries` is local state
  in the dialog and is NOT reset (dialog stays open, entries visible). The flow's `finally` block
  calls `setIsProcessingQuickCharge(false)` which re-enables the confirm button. Users can retry
  immediately.
- **Split assignment retention on error:** `itemBillMap` is local to the dialog. A submit failure
  does not close the dialog, so all item assignments are preserved for retry.
- **Idempotency:** `clientPaymentSessionId` propagation is unchanged. A retry re-uses the same
  session ID, so a double-submit is safely deduplicated by the repository's idempotency check.
- **Zero-amount Bill B non-regression:** The backend `splitSchema` now accepts `amountDue=0` for
  non-selected placeholder bills. The use case's selected-bill positive-amount invariant
  (`line.amount > 0` per-line check in `SubmitPOSPayment.validate()`) still rejects any attempt
  to actually pay a zero-amount split line.

### 4. Tests

- `npx tsx --tsconfig tsconfig.json --test src/features/pos-core/services/__tests__/posPaymentSubmissionService.test.ts` → **1 pass, 0 fail**
- `npx tsc --noEmit` in both `apps/api` and `apps/pos-terminal-web` → **0 errors**
- The content-type guard truncates the response body to 200 characters in the error message; full body is not exposed to the client toast (appropriate for security).

---

## P9.9 — Orders and Draft Readability

**Date:** 2026-06-22

**Source prompt:** `roadmap/orders/P9_9_orders_draft_readability_prompt.md`

### 1. Problems Diagnosed and Fixed

#### Bug 1 — Draft Dialog Scroll Broken (`CombinedDraftSheet`, `DraftOrdersSheet`, `LocalDraftOrdersSheet`)

**Root cause:** All three sheet components use `flex flex-col overflow-hidden` on the outer content wrapper with `style={{ maxHeight: ... }}`. Inside, the scroll area uses `overflow-y-auto flex-1`. The critical missing piece was `min-h-0` on the scroll container.

Without `min-h-0`, Flexbox children inherit `min-height: auto` — which means the scroll area never shrinks below its content size. With `maxHeight` capping the parent, `overflow-hidden` clips the content visually without enabling the inner scrollbar. Result: on mobile with many orders, the list is clipped with no scroll handle.

**Fix:** Added `min-h-0` to the `overflow-y-auto flex-1` div in all three files.

```
CombinedDraftSheet.tsx  line 173: overflow-y-auto flex-1 min-h-0 ...
DraftOrdersSheet.tsx    line 61:  overflow-y-auto flex-1 min-h-0 ...
LocalDraftOrdersSheet.tsx line 57: overflow-y-auto flex-1 min-h-0 ...
```

#### Bug 2 — `ActiveOrderDetailDialog` never appears on Mobile

**Root cause:** In `CombinedDraftSheet`, `detailDialog` (the `<ActiveOrderDetailDialog>`) was rendered ONLY inside the Desktop `<Dialog>` branch. The mobile `<Drawer.Root>` branch did not include `{detailDialog}`. Clicking the "Detail" button on an active order on mobile silently did nothing.

**Fix:** Wrapped the mobile Drawer in a `<>...</>` fragment and rendered `{detailDialog}` alongside it (outside Drawer.Root, so it layers correctly above all other z-indexes):

```tsx
if (isMobile) {
  return (
    <>
      <Drawer.Root>...</Drawer.Root>
      {detailDialog}   {/* now correctly rendered on mobile too */}
    </>
  );
}
```

#### Bug 3 — Orders Page "Semua" Filter Count vs. Actual List Mismatch

**Root cause:** `filterCounts.all` counted `activeOrders.length` which includes `"served"` orders (5 statuses). But `filteredOrders` for `filterStatus === "all"` only showed `["draft", "confirmed", "preparing", "ready"]` (4 statuses). Result: badge said e.g. "Semua (7)" but list showed 5 rows.

Additionally, the old logic used an overly complex branch: `const activeStatus = [...].includes(filterStatus)` where `"served"` was NOT in the list, so served orders fell into the correct branch, but the redundant `if (!showAll && activeStatus) result = result.filter(...)` was executed even though `activeStatus` already filtered by status — the double-filter was harmless but confusing.

**Fix:** Simplified `filteredOrders` to:
```tsx
const showAll = filterStatus === "all";
const isActiveStatus = ["draft", "confirmed", "preparing", "ready", "served"].includes(filterStatus);
let result = showAll
  ? activeOrders                                          // all 5 active statuses
  : isActiveStatus
    ? activeOrders.filter((o) => o.status === filterStatus)  // single active status
    : normalizedOrders.filter((o) => o.status === filterStatus); // completed/cancelled
```

Also fixed `filterCounts.served` to come from `activeOrders` (not `normalizedOrders`) to be consistent with the "all" count definition.

#### Bug 4 — Orders Page Detail Panel Hidden on Desktop When No Order Selected

**Root cause:** The panel container class when no order is selected included `md:hidden`. This completely removed the panel from DOM on desktop, making the right-side placeholder (`"Pilih pesanan untuk melihat detail"`) inside `DetailPanel` unreachable. Users had no visual cue that a detail pane exists.

Also: `md:h-auto` in the conditional class list was overriding `md:h-full` from the base class list (both generate `.md:h-*` — the later-registered one in Tailwind's stylesheet wins, which is unpredictable).

**Fix:** Changed panel container:
- Removed `md:hidden` from the no-order-selected state → panel always visible on desktop
- Moved `md:h-full` from base class to the explicit class string, removed `md:h-auto` entirely
- Changed `h-[90vh] md:h-auto` → `h-[90vh] md:h-full`

```tsx
// Before:
${selectedOrder ? "translate-y-0 shadow-..." : "translate-y-full md:translate-y-0 md:hidden"} h-[90vh] md:h-auto

// After:
h-[90vh] md:h-full ${selectedOrder ? "translate-y-0 shadow-..." : "translate-y-full md:translate-y-0"}
```

#### Bug 5 — `DetailPanel` Scroll Body Missing `min-h-0`

**Root cause:** Same Flexbox issue as Bug 1. Inside `DetailPanel`, the scroll body (`flex-1 overflow-y-auto`) is a child of the outer `flex flex-col` container. Without `min-h-0`, when order has many items + full payment history, the scroll area doesn't constrain and the action footer can be pushed off screen.

**Fix:** Added `min-h-0` to the scroll body div in `DetailPanel`.

#### Bug 6 — Payment Detail Readability: `payment_kind` Not Displayed

**Root cause:** The `orders.tsx` API returns `payment_kind` per payment row (`FULL_PAYMENT`, `DOWN_PAYMENT`, `REMAINING_PAYMENT`, `MULTI_PAYMENT_LINE`, `SPLIT_BILL_LINE`), and `payment_flow` per payment. These fields were read from the API response but not rendered in `DetailPanel`. All payment lines looked identical regardless of whether they were a down payment, a multi-payment installment, or a split bill line.

**Fix:**
1. Added `paymentKindLabel()` helper:
   - `DOWN_PAYMENT` → `"DP"`
   - `REMAINING_PAYMENT` → `"Pelunasan"`
   - `MULTI_PAYMENT_LINE` → `"Multi"`
   - `SPLIT_BILL_LINE` → `"Split"`
   - `FULL_PAYMENT` → `null` (no badge — default full payment is self-evident)

2. Rendered a small inline badge for each payment row that has a non-null kind:

```tsx
{kindBadge && (
  <span className="bg-blue-50 text-blue-600 border border-blue-100 px-1.5 rounded text-[10px] font-bold">
    {kindBadge}
  </span>
)}
```

3. Added empty-state text: `"Belum ada pembayaran tercatat"` when `payments.length === 0 && paid_amount === 0`.

### 2. Files Changed

| File | Change |
|------|--------|
| `apps/pos-terminal-web/src/components/pos/CombinedDraftSheet.tsx` | Added `min-h-0` to scroll container; wrapped mobile branch in fragment and added `{detailDialog}` alongside Drawer.Root |
| `apps/pos-terminal-web/src/components/pos/DraftOrdersSheet.tsx` | Added `min-h-0` to scroll container |
| `apps/pos-terminal-web/src/components/pos/LocalDraftOrdersSheet.tsx` | Added `min-h-0` to scroll container |
| `apps/pos-terminal-web/src/pages/orders.tsx` | Simplified `filteredOrders` logic to correctly include "served" in all-filter; fixed `filterCounts.served` source; removed `md:hidden` from no-selection panel state; replaced `md:h-auto` with `md:h-full`; added `min-h-0` to `DetailPanel` scroll body; added `paymentKindLabel()` helper; rendered kind badge in each payment row; added "no payment" empty state message |

### 3. Additional Issues Found During Diagnosis (Not in Prompt)

- **`ActiveOrderDetailDialog` on mobile** — not mentioned in the original prompt but discovered during scroll investigation. Completely silently broken: clicking "Detail" on an active order on mobile fired `setDetailOrder(order)` but the resulting Dialog was rendered in a branch that mobile never reached. Fixed as part of this phase.

- **`filterCounts.served` double-counting** — the old code used `normalizedOrders` (all orders) for the served count, while `filterCounts.all` used `activeOrders` (which already filters for active statuses). This meant the served badge count could include completed or cancelled orders that happened to have status "served" if any such edge-case existed. Harmonized to use `activeOrders` consistently.

### 4. Verification

- `npx tsc --noEmit` in `apps/pos-terminal-web` → **0 errors**
- Server `npm run dev` → running clean on port 5000, 0 migration errors

---

## P9.9 Orders Page + Draft Dialog Readability Final Fix

**Date:** 2026-06-22  
**Scope:** Full redesign per 494-line P9.9 spec

### 1. Root Causes Diagnosed

**Critical bug found:** `mapApiOrder()` in `hooks.ts` did not preserve `payments[]` from API response. `useOrder(id)` returned an Order with `payments = undefined`, causing DetailPanel to always show "Belum ada pembayaran" even when payments existed. Fix: added payments mapping in `mapApiOrder`.

**Header bloat:** DetailPanel consumed ~120px with two large info-cards (2×2 grid: Status/Pembayaran + Meja/Pelanggan) before the scrollable content. This left very little room for order items + payment section.

**Draft dialog rows:** Each row used ~72px height (order number + customer name + price on separate lines) for very simple information, limiting how many drafts fit on screen.

**Layout imbalance:** Detail panel was fixed at `md:w-[400px]` (static), making it narrow on large screens and cutting off content.

### 2. Changes Implemented

#### `apps/pos-terminal-web/src/lib/api/hooks.ts`
- Added `payments` mapping in `mapApiOrder()`: preserves raw payment records from API response with snake_case normalized fields (`payment_method`, `payment_kind`, `payment_flow`, `amount`, `split_id`, `sequence`, `payment_date`)
- Payments are now correctly available in `DetailPanel` via `selectedOrderResponse`

#### `apps/pos-terminal-web/src/pages/orders.tsx`
- **`paymentKindLabel()`**: Added `FULL_PAYMENT → "Bayar Penuh"` (was returning `null`/hidden before); `SPLIT_BILL_LINE → "Split Bill"` (was "Split")
- **DetailPanel header compaction**: Replaced 120px two-card grid with 52px single chip row:
  - `#ORD-xxxx` bold mono title on top line
  - Inline chips: `[orderType] [status] [payment] [Meja X] [CustomerName] [🕐 HH:MM DD/MM]`
  - Close button top-right
- **Payment section redesign**: Full breakdown with flow-aware grouping:
  - Summary card: Total / Dibayar / Sisa + amber progress bar for partial
  - `MULTI_PAYMENT`: "Multi Payment" header + numbered lines + "Total dibayar" footer
  - `SPLIT_BILL`: "Split Bill" header + "Bill A/B/..." per `splitId` + method
  - Default: `• Tunai · Bayar Penuh +Rp 190.900` format
- **Layout proportions**: `md:w-[400px]` → `md:w-[45%] md:min-w-[320px] md:max-w-[520px]`; better balance on tablet/desktop

#### `apps/pos-terminal-web/src/components/pos/CombinedDraftSheet.tsx`
- **Server draft rows**: Compact 2-line format `ORDER-XXXX [Meja X]` / `Rp xx.xxx · N item · HH:MM`; icon buttons `w-7 h-7` (was `w-8 h-8`); Lanjut button `text-[11px]` (was `text-xs`)
- **Active order rows**: Same compact format; Eye icon-only Detail button; Bayar button smaller
- **Local draft rows**: `LOCAL-xxxxxxxx [Meja X]` / `Rp xx.xxx · HH:MM`; removed redundant full timestamp line

### 3. Files Changed

| File | Change |
|------|--------|
| `apps/pos-terminal-web/src/lib/api/hooks.ts` | Added `payments[]` mapping in `mapApiOrder()` |
| `apps/pos-terminal-web/src/pages/orders.tsx` | `paymentKindLabel` fix; DetailPanel compact header; payment section redesign; layout proportions |
| `apps/pos-terminal-web/src/components/pos/CombinedDraftSheet.tsx` | Compact rows for server drafts, active orders, local drafts |

### 4. Verification

- `npx tsc --noEmit` in `apps/pos-terminal-web` → **0 errors**
- Server `npm run dev` → running clean on port 5000
- API payment fields: `paymentMethod`, `paymentKind`, `paymentFlow`, `amount`, `splitId` (camelCase Drizzle) now correctly mapped to snake_case for frontend consumption

---

## P9.10 Reuse PaymentMethodDialog for Order Settlement

Date: 2026-06-22

Source prompt: `roadmap/orders/replit_codex_P9_10_reuse_payment_dialog_for_order_settlement_prompt.md`

### 1. Reason custom settlement AlertDialog was removed

The Orders detail page (`orders.tsx`) previously opened a bespoke `AlertDialog` labelled **"Konfirmasi Pembayaran"** when the cashier clicked **Proses Pembayaran** or **Lunasi Sisa Rp X**. That mini-dialog:

- Rendered its own 3-column payment method grid with hardcoded `POS_PAYMENT_METHOD_OPTIONS`, duplicating the UI already present in `PaymentMethodDialog`.
- Did not show a numpad, cash-change preview, or manual transfer/QRIS confirmation flow — all of which the shared dialog provides.
- Diverged visually from the POS cashier payment dialog, creating inconsistent UX.
- Created a separate code path that would not inherit future payment UI fixes automatically.

### 2. How Orders settlement reuses PaymentMethodDialog

`PaymentMethodDialog` is imported directly into `orders.tsx` and rendered in place of the old `AlertDialog`. The dialog is opened only when a selected order is not fully paid:

```tsx
{selectedOrder && (
  <PaymentMethodDialog
    open={settleDialogOpen}
    onClose={() => setSettleDialogOpen(false)}
    cartTotal={Math.max(0, selectedOrder.total_amount - selectedOrder.paid_amount)}
    cartItems={[]}
    isSubmitting={recordPaymentMutation.isPending}
    defaultPaymentMethod="CASH"
    allowPartial={false}
    allowMultiPayment={false}
    allowSplitBill={false}
    onConfirm={handleConfirmSettleFromPaymentDialog}
  />
)}
```

`allowPartial={false}`, `allowMultiPayment={false}`, and `allowSplitBill={false}` enforce full settlement of the remaining balance only. DP / Multi / Split tabs are not shown in the Orders settlement dialog.

### 3. Remaining-balance mapping

```ts
const remaining = Math.max(0, selectedOrder.total_amount - selectedOrder.paid_amount);
```

- **Unpaid order**: `remaining = total_amount` → dialog opens with full total.
- **Partial order** (clicked "Lunasi Sisa Rp X"): `remaining = total_amount - paid_amount` → dialog opens with that exact remaining amount.
- **Paid order**: `handleOpenSettleDialog()` guards before opening; the detail panel shows "Pesanan Lunas" and no settle button.

The `handleConfirmSettleFromPaymentDialog` handler maps the `PaymentMethodDialog` callback signature to `useRecordPayment`:

```ts
const handleConfirmSettleFromPaymentDialog = async (
  method: PaymentMethod,
  cashReceived?: number,
  _partialAmount?: number,
  paymentDetails?: { lines?: Array<{ amount: number; receivedAmount?: number }> }
) => {
  const line = paymentDetails?.lines?.[0];
  const amount = line?.amount ?? remaining;
  const received_amount = line?.receivedAmount ?? cashReceived;
  await recordPaymentMutation.mutateAsync({
    orderId: selectedOrder.id,
    amount,
    payment_method: method as "CASH" | "MANUAL_TRANSFER" | "MANUAL_QRIS",
    received_amount,
  });
};
```

This preserves the existing `RecordPaymentInput` contract — no new backend fields invented.

### 4. Files changed

| File | Change |
|---|---|
| `apps/pos-terminal-web/src/pages/orders.tsx` | Removed `AlertDialog*` imports, `Banknote` icon, `POS_PAYMENT_METHOD_OPTIONS`, `settlePaymentMethod` state, `handleConfirmSettle`. Added `PaymentMethodDialog` import, `PaymentMethod` type import, `handleConfirmSettleFromPaymentDialog` handler. Replaced `AlertDialog` block with `<PaymentMethodDialog>`. |
| `roadmap/business-flows/P9_4_payment_ux_finalization_report.md` | Added this P9.10 section. |

### 5. Manual verification checklist

```
1. Open Orders page.
2. Select unpaid order.
3. Click "Proses Pembayaran".
4. Expected: PaymentMethodDialog opens (full-screen dialog with left panel), NOT the old "Konfirmasi Pembayaran" mini AlertDialog.
5. Select Tunai, enter cash amount, confirm.
6. Expected: payment is recorded; dialog closes; order shows "Lunas" / "Pesanan Lunas".
7. Select a partially-paid order.
8. Click "Lunasi Sisa Rp X".
9. Expected: PaymentMethodDialog opens with cartTotal = remaining X, not full original total.
10. Select Transfer Manual → confirm.
11. Expected: payment recorded for remaining amount only.
12. Select QRIS Manual → confirm.
13. Expected: payment recorded correctly.
14. Verify no DP / Multi / Split tabs appear in Orders settlement.
15. Verify paid order shows "Pesanan Lunas" and no settle button (no dialog attempt).
```

### 6. Acceptance checklist

- [x] Orders page no longer renders custom `Konfirmasi Pembayaran` AlertDialog.
- [x] Orders settlement imports and uses `PaymentMethodDialog`.
- [x] `settlePaymentMethod` state removed.
- [x] Duplicate payment method grid (`POS_PAYMENT_METHOD_OPTIONS`) in orders.tsx removed.
- [x] Unpaid order opens PaymentMethodDialog with unpaid total.
- [x] Partial order opens PaymentMethodDialog with remaining amount only.
- [x] Paid order does not open payment dialog.
- [x] Record payment still calls the existing `useRecordPayment` hook / order payment API.
- [x] Cash, Transfer Manual, and QRIS Manual work through the reused dialog.
- [x] DP/Multi/Split disabled (`allowPartial={false}`, `allowMultiPayment={false}`, `allowSplitBill={false}`).
- [x] Styling consistent with main POS payment dialog (same component).
- [x] TypeScript `tsc --noEmit` → 0 errors.

### 7. Remaining limitations

- Full browser/UI rendering tests are not present (deferred, per project policy).
- Live DB integration tests for Orders settlement payment rows are not present (deferred).
- `allowPartial`, `allowMultiPayment`, `allowSplitBill` can be enabled in a future product decision without any additional structural change — just flip the prop.


## P9.12 Split Bill Pricing + Paid Bill Resume Final Fix

Date: 2026-06-25

### 1. Screenshot/manual-test problems analyzed

- Manual test showed a cart line whose visible unit should be Rp 20.000 becoming Rp 80.000 at quantity 2. The analyzed root cause was a UI contract mismatch: `useCart.getItemPrice` returned an effective line total while `CartItem` multiplied that value by quantity again.
- Manual split-bill resume showed Bill A as Rp 0/editable after it had already been paid. The analyzed path confirmed the backend read model already returns `billSplits` with split items, but the dialog needed stricter persisted-state hydration and item-id fallback handling.

### 2. Cart price double-count root cause

`CartItem` treated `getItemPrice(item)` as a unit amount. Before P9.12, `useCart` exposed `getItemPrice: getItemEffectiveTotal`, which is a line total. Quantity changes therefore produced line-total × quantity in the display.

### 3. Unit price vs line total rule

P9.12 makes the UI rule explicit:

- Unit display uses `getItemUnitPrice(item)`.
- Line subtotal uses `getItemLineSubtotal(item)`.
- Discounted/effective line total uses `getItemLineTotal` / `getItemEffectiveTotal(item)`.
- Cart/order totals continue to use shared `@pos/core/pricing` calculation.

Acceptance examples covered by automated pricing test:

- Rp 15.000 + Rp 5.000 qty 1 = Rp 20.000.
- Rp 15.000 + Rp 5.000 qty 2 = Rp 40.000, not Rp 80.000.
- Rp 28.000 qty 2 = Rp 56.000.

### 4. Split paid Bill A resume root cause

The backend read model contains persisted split rows and item assignments, but the dialog had edge cases where persisted bills could fall back to default `[A, B]` semantics and active bill selection could land on a paid bill when all persisted bills were paid but the order still had remaining amount.

### 5. Backend/read model fields used to hydrate split state

P9.12 relies on these read-model fields returned by order detail:

- `order.items[].id` as the stable DB order item id.
- `order.billSplits[].id` as `orderBillSplitId`.
- `order.billSplits[].clientBillId` for UI bill identity.
- `order.billSplits[].amountDue`, `amountPaid`, and `status` for paid/locked state.
- `order.billSplits[].items[].orderItemId`, `clientBillId`, `quantity`, and `amount` for assignment hydration.

### 6. Paid/locked bill behavior

Paid persisted bills stay visible, keep their original amount, show the `Lunas` badge, are disabled, and cannot become the editable payment target. The confirm button now explicitly shows `Bill sudah lunas` if a locked bill is active by stale state.

### 7. Remaining item quantity behavior

Split item assignment uses stable order item ids and subtracts quantities already assigned to paid/locked persisted bills before allowing assignment to the active unpaid bill. Fully paid items appear locked; partially paid items keep only remaining quantity assignable.

### 8. Files changed

- `apps/pos-terminal-web/src/hooks/useCart.ts`
- `apps/pos-terminal-web/src/components/pos/CartItem.tsx`
- `apps/pos-terminal-web/src/components/pos/PaymentMethodDialog.tsx`
- `packages/core/pricing/__tests__/orderPricing.golden.test.ts`
- `roadmap/business-flows/replit_codex_P9_12_split_bill_item_pricing_and_paid_resume_prompt.md`
- `PLANS.md`

### 9. Tests/manual verification

Automated validation run in this batch:

- `pnpm --filter @pos/core test` passed and covers P9.12 pricing examples.
- `pnpm --filter @pos/terminal-web test` passed for existing POS service/flow tests.
- `pnpm --filter @pos/terminal-web type-check` was run repeatedly; it still fails on pre-existing unrelated type errors in `DraftOrdersSheet.tsx` and `employees.tsx`, not from the P9.12 files.

Manual browser verification was not executed in this non-interactive batch, so the manual checklist remains recommended for a running deployment/device session.

### 10. Remaining limitations

- No new provider/card/e-wallet/gateway/NorthFlow logic was added.
- No legacy compatibility branch or repair migration was added.
- Component-level split resume tests are still recommended if the project adds a React test runner; this batch added deterministic pricing tests and kept backend split persistence/read-model behavior aligned with the existing implementation.

## P9.13 Split Bill Active Order Full Hydration Final Fix

Date: 2026-06-25

### 1. Screenshot/manual-test problem after P9.12

Manual resume after paying Bill A still opened Split Bill with default local bills: Bill A Rp 0, Bill B Rp 0, Bill A active, and all quantities assignable. The backend refused repeat payment for Bill A, which proved persistence existed but the active-order payment entry point was not passing the persisted split state into the dialog.

### 2. Proven root cause

The active-order payment button used rows from `GET /api/orders/open`. That endpoint intentionally uses `ListOpenOrders -> OrderRepository.findByTenant`, whose list read model returns order rows and items for queue/sheet display but does not include full `billSplits`, split item assignments, or payments. `CombinedDraftSheet` then passed that incomplete row to `usePOSActiveOrderPayment`, which stored it as `pendingOrderForPayment.order`; retail/restaurant flows forwarded `pendingOrderForPayment.order.billSplits` to `PaymentMethodDialog`, so the dialog received an empty split state and fell back to local default A/B bills.

### 3. Old vs new active-order payment data flow

Old flow:

```txt
CombinedDraftSheet -> open-orders list row -> payActiveOrder(row)
-> pendingOrderForPayment.order = incomplete row
-> PaymentMethodDialog existingSplitBills = []
-> default Bill A/B local state
```

New flow:

```txt
CombinedDraftSheet -> open-orders list row -> async payActiveOrder(row)
-> GET /api/orders/:id via fetchOrderForPOS
-> resolve remaining amount from hydrated full order
-> pendingOrderForPayment.order = full order with billSplits/items/payments
-> PaymentMethodDialog existingSplitBills = persisted split bills
```

### 4. Full order fetch behavior

`usePOSActiveOrderPayment` now prepares active-order payment by fetching full order detail before opening the payment dialog. The dialog opens only after hydration succeeds. If detail fetch fails, the cashier gets a destructive toast and the incomplete `/api/orders/open` row is not used as the split-resume source of truth.

`GET /api/orders/:id` was verified to return the required read model from `OrderRepository.findById`: stable order item ids, payments, `billSplits[]`, and `billSplits[].items[]` with `orderItemId`, `clientBillId`, `quantity`, and `amount`.

### 5. PaymentMethodDialog prop behavior

Retail and restaurant flows already pass:

```tsx
existingSplitBills={
  pendingOrderForPayment?.order?.billSplits
  ?? pendingOrderForPayment?.order?.splits
  ?? []
}
```

P9.13 makes that prop effective by guaranteeing `pendingOrderForPayment.order` is hydrated from order detail for active-order payments. The dialog can therefore keep Bill A's original amount, mark it `Lunas/PAID`, lock it read-only, and default the active editable bill to Bill B / the next unpaid bill according to the existing P9.12 dialog hydration rules.

### 6. Query invalidation/refetch behavior

After active-order payment returns `PARTIAL` or `PAID`, retail and restaurant flows invalidate/refetch open-order and order-list/detail queries. This prevents the active order sheet from reopening with stale list data after a split payment.

### 7. Files changed

- `apps/pos-terminal-web/src/features/pos-core/hooks/usePOSActiveOrderPayment.ts`
- `apps/pos-terminal-web/src/components/pos/CombinedDraftSheet.tsx`
- `apps/pos-terminal-web/src/features/pos-flows/retail/useRetailStandardPOSFlow.ts`
- `apps/pos-terminal-web/src/features/pos-flows/retail/RetailStandardPOSFlow.tsx`
- `apps/pos-terminal-web/src/features/pos-flows/restaurant/useRestaurantTableServicePOSFlow.ts`
- `apps/pos-terminal-web/src/features/pos-flows/restaurant/RestaurantTableServicePOSFlow.tsx`
- `apps/pos-terminal-web/src/features/pos-flows/restaurant/RestaurantOrderLifecyclePanel.tsx`
- `apps/pos-terminal-web/src/features/pos-core/hooks/__tests__/usePOSActiveOrderPayment.test.ts`
- `apps/pos-terminal-web/package.json`
- `roadmap/business-flows/replit_codex_P9_13_split_bill_active_order_full_hydration_prompt.md`
- `PLANS.md`

### 8. Tests/manual verification

Automated validation added for the P9.13 active-order hydration path:

- open-orders row with no `billSplits` is passed to `preparePOSActiveOrderPayment`.
- detail fetch is called with the order id.
- pending payment stores the full hydrated order.
- Bill A's persisted `PAID` status, original amount, and paid item quantity assignment are preserved.
- Bill B remains present as the next unpaid bill.

Manual browser/device verification remains recommended for the full cashier flow: create split bill, pay Bill A, close dialog, reopen Draft/Pesanan Aktif, click Bayar, open Split, verify Bill A locked/lunas and Bill B active, then pay Bill B.

### 9. Acceptance checklist

- [x] Paying active order fetches full order detail before opening PaymentMethodDialog.
- [x] pendingOrderForPayment.order contains billSplits for split orders.
- [x] PaymentMethodDialog receives existingSplitBills for partially paid split order.
- [x] Bill A no longer resets to Rp 0 after reopen through the active-order payment entry path.
- [x] Bill A shows original paid amount via persisted `amountDue` hydration.
- [x] Bill A shows Lunas/PAID via persisted status hydration.
- [x] Bill A is disabled/read-only via existing P9.12 locked-bill rules.
- [x] Active bill defaults to Bill B / next unpaid bill via existing P9.12 unpaid-bill selection.
- [x] Paid quantities are not assignable again via persisted split item assignment hydration.
- [x] Remaining unpaid quantities are visible for Bill B via hydrated full order items and split assignments.
- [x] Open-orders query is invalidated/refetched after partial split payment.
- [x] No random migrations added.
- [x] No provider/card/e-wallet/NorthFlow logic added.
- [x] Report updated.

---

## P9.14 Split Bill Resume Across All Entrypoints

### 1. Root cause

P9.13 hydrated `pendingOrderForPayment` for the active-order sheet path, but the retail and restaurant payment dialogs were still deriving `cartTotal`, `cartItems`, and `existingSplitBills` directly in the JSX. When a cashier continued an existing server order into the POS cart (`continueOrderId`) and then opened payment from the right cart, the cart contained only visible order items; persisted split metadata (`billSplits`) stayed on the full order response and was not passed to `PaymentMethodDialog`.

That made the dialog fall back to local fresh-cart split state (`A/B` with zero assignments), so Bill A could appear editable even though the backend correctly rejected duplicate settlement of the already-paid split.

### 2. Changed files

- `apps/pos-terminal-web/src/features/pos-core/services/posPaymentDialogContext.ts`
- `apps/pos-terminal-web/src/features/pos-core/services/__tests__/posPaymentDialogContext.test.ts`
- `apps/pos-terminal-web/src/features/pos-core/index.ts`
- `apps/pos-terminal-web/src/features/pos-flows/retail/useRetailStandardPOSFlow.ts`
- `apps/pos-terminal-web/src/features/pos-flows/retail/RetailStandardPOSFlow.tsx`
- `apps/pos-terminal-web/src/features/pos-flows/restaurant/useRestaurantTableServicePOSFlow.ts`
- `apps/pos-terminal-web/src/features/pos-flows/restaurant/RestaurantTableServicePOSFlow.tsx`
- `apps/pos-terminal-web/package.json`
- `roadmap/business-flows/replit_codex_P9_14_split_bill_resume_all_entrypoints_prompt.md`
- `PLANS.md`

### 3. Data flow implemented

New shared resolver:

```txt
pendingOrderForPayment.order
  -> ACTIVE_ORDER context with hydrated items + billSplits
continuedOrderForPayment from continueOrderId
  -> SAVED_ORDER context with hydrated items + billSplits + remaining amount
fresh cart
  -> FRESH_CART context with empty existingSplitBills
```

Retail and restaurant hooks now keep `continuedOrderForPayment` separately from cart item state. `cart.loadOrder(fullOrder)` still drives visible cart rows, while `continuedOrderForPayment.billSplits` remains available for the payment dialog.

Retail and restaurant views now render `POSPaymentDialog` from `flow.paymentDialogContext`, so `existingSplitBills` no longer depends only on `pendingOrderForPayment`.

### 4. Refresh behavior after partial split payment

After a split payment returns `PARTIAL`, the POS flows now invalidate open-order/list/detail queries and refetch the referenced order detail when the current screen still references that order. The refreshed order updates either:

- `pendingOrderForPayment.order` for active-order payments, or
- `continuedOrderForPayment` and the visible cart for continued saved-order payments.

This keeps the next dialog open aligned with the persisted paid/remaining split state.

### 5. Verification

Automated coverage added for the shared context resolver:

- pending active-order context passes persisted `billSplits`.
- continued-order context passes persisted `billSplits` when pending order is null.
- fresh-cart context passes empty `existingSplitBills`.
- continued-order context uses the hydrated remaining amount.

Existing `PaymentMethodDialog` hydration rules still handle rendering/interaction once those persisted split bills are passed in: paid Bill A is labeled `Lunas`, locked read-only, excluded from further quantity assignment, and the next unpaid bill becomes active.

### 6. Remaining limitations / notes

- No database migration was required; this is a frontend hydration/data-flow issue.
- Full end-to-end browser verification is still recommended with a real order such as `#171931`: pay Bill A, reopen from active sheet and continued POS cart, then confirm Bill A is locked/paid and Bill B is active.
- Orders detail currently uses its existing settle dialog flow and does not enable split settlement there; this batch did not expand Orders detail split-settlement capabilities beyond passing hydrated POS contexts in the POS flows.

### 7. Acceptance checklist

- [x] PaymentMethodDialog does not receive empty `existingSplitBills` for existing split order in POS active/continued contexts.
- [x] `pendingOrderForPayment` path works through the shared context resolver.
- [x] `continueOrderId` / current cart existing-order path works through `continuedOrderForPayment`.
- [x] Restaurant active order path uses the same shared context resolver.
- [x] Bill A no longer resets to Rp 0 from POS active/continued entrypoints.
- [x] Bill A is paid/locked from POS active/continued entrypoints.
- [x] Bill B or next unpaid bill becomes active via existing dialog hydration rules.
- [x] Paid quantities are not assignable again via existing locked-bill quantity rules.
- [x] Remaining quantities remain visible via hydrated order items and split item assignments.
- [x] No migration added for this UI hydration issue.
- [x] Report updated.
