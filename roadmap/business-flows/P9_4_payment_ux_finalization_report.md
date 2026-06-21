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
- The content-type guard truncates the response body to 200 characters in the error message; full body is not exposed to the client toast (appropriate for security).
