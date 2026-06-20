# Replit/Codex Prompt P2 — POS Lifecycle Runtime Fix: Draft, Active Order, Kitchen, Payment

Repository: `Rndynt/AuraPoS`

## Goal

Fix the current POS runtime lifecycle bugs found in P0 using the P1 Business Flow SOT and order action policy contracts.

P2 must make the existing POS safe and understandable before the larger business-flow adapter split in later phases.

This phase follows:

```txt
roadmap/business-flows/main.md
roadmap/business-flows/P0_current_pos_flow_audit.md
roadmap/business-flows/P1_business_flow_sot_report.md
packages/domain/business-flows/**
packages/application/business-flows/**
```

## Main problems to fix

P0 confirmed these critical runtime bugs:

1. Server unpaid orders are treated as drafts even when they are active orders.
2. Kitchen/pay-later active orders can be loaded back into editable cart using `Lanjut`.
3. Kitchen/pay-later active orders can show trash/cancel as if they were draft deletes.
4. Clicking `Bayar` on a continued unpaid non-partial server order can patch/update the order and return it to open orders instead of recording payment.
5. Paid retail/counter orders may stay operationally `confirmed` instead of being closed/completed when the business flow is instant checkout.
6. Order item update does not clearly enforce draft-only editability or kitchen-ticket locks.

P2 must fix these runtime issues without doing the full P3/P4/P5 business-flow adapter rewrite.

## Non-negotiable scope boundary

Allowed in P2:

```txt
- Use P1 SOT/policy to gate runtime actions.
- Fix draft/open/active order classification in POS UI.
- Prevent active/kitchen orders from normal cart edit/delete.
- Make continued server draft payment actually settle/pay the order.
- Add backend protections for order item update and active/kitchen edit lock.
- Add readable user-facing errors for denied lifecycle actions.
- Add tests for the fixed runtime behavior.
- Update P2 report.
```

Forbidden in P2:

```txt
- Do not create the full POSRootPage -> RetailPOSFlow/RestaurantPOSFlow split yet.
- Do not change database schema/migrations unless absolutely unavoidable. Prefer existing fields and repository checks.
- Do not rename public API routes.
- Do not remove existing offline flow.
- Do not rewrite payment engine.
- Do not hardcode plan names.
- Do not make orders_queue a prerequisite for payment lifecycle.
- Do not implement service_business_later.
```

## Required files to inspect first

Inspect and cite in the P2 report:

```txt
roadmap/business-flows/P0_current_pos_flow_audit.md
roadmap/business-flows/P1_business_flow_sot_report.md
packages/domain/business-flows/**
packages/application/business-flows/**
apps/pos-terminal-web/src/features/pos/pages/POSPage.tsx
apps/pos-terminal-web/src/components/pos/CombinedDraftSheet.tsx
apps/pos-terminal-web/src/components/pos/DraftOrdersSheet.tsx
apps/pos-terminal-web/src/hooks/useCart.ts
apps/pos-terminal-web/src/hooks/useOfflineOrderSubmit.ts
apps/pos-terminal-web/src/lib/api/hooks.ts
apps/pos-terminal-web/src/lib/api/tableHooks.ts
apps/api/src/http/controllers/OrdersController.ts
packages/application/orders/**
packages/infrastructure/repositories/orders/**
shared/schema.ts or infrastructure order schema path
```

Use `rg` if paths differ.

## Required conceptual mapping

Map current production fields to P1 lifecycle vocabulary without changing DB schema.

Suggested mapping:

```txt
True server draft:
- order.status === 'draft'
- paymentStatus !== 'paid'
- no kitchen ticket
- no fired kitchen items

Active order:
- order.status in confirmed/preparing/ready/served
- paymentStatus in unpaid/partial

Active kitchen order:
- active order AND (hasKitchenTicket OR fulfillment/kitchen item status started)

Paid/completed:
- paymentStatus === paid OR order.status === completed
```

If current API response does not expose enough data to detect `hasKitchenTicket`, add a minimal read-only field to the order/open-order DTO if feasible. Avoid schema migration.

Suggested fields:

```txt
isEditableDraft
isActiveOrder
isKitchenLocked
allowedActions
```

These may be computed server-side or frontend-side using P1 policy. Prefer backend-calculated flags for safety, but keep frontend defensive too.

## Required UI behavior

### CombinedDraftSheet / DraftOrdersSheet

Stop treating all unpaid server orders as draft rows.

The sheet must clearly separate:

```txt
Draft Server
Pesanan Aktif
Draft Lokal
```

If the existing UI cannot support full tabs quickly, at minimum split the server rows into two sections with clear labels.

### Draft Server rows

Only true server draft rows may show:

```txt
Lanjut/Edit
Bayar
Batalkan/Hapus if allowed
```

Rules:

```txt
- Lanjut/Edit loads only true draft into cart.
- Trash/cancel is only shown for true draft where policy allows CANCEL_DRAFT.
- Bayar should settle/pay the draft without returning it to draft list.
```

### Pesanan Aktif rows

Active/kitchen/pay-later rows may show:

```txt
Bayar
Lihat Detail
```

Must not show:

```txt
Lanjut/Edit normal cart load
Trash delete/cancel button
```

Active kitchen rows should show a readable status label such as:

```txt
Sedang diproses dapur
Siap disajikan
Sudah disajikan
Tagihan aktif
```

Exact wording may follow current UI style.

### Draft Lokal rows

Local drafts remain local and may show:

```txt
Lanjut
Hapus Lokal
```

Do not break offline local draft behavior.

## Required POSPage behavior

Patch `apps/pos-terminal-web/src/features/pos/pages/POSPage.tsx` carefully.

### Fresh cart payment

For standard fresh cart payment:

```txt
Cart -> Bayar -> create-and-pay -> paid/completed -> clear cart
```

If business profile is retail/cafe/quick-service instant checkout, ensure the create-and-pay request passes/uses the correct fulfillment close behavior so paid order does not stay as active/open operational order.

Do not break restaurant pay-later/kitchen flow.

### Continue draft payment

Current bug: continued unpaid non-partial order can call update order and return instead of paying.

Required behavior:

```txt
Server Draft -> Lanjut/Edit -> Cart -> Bayar
```

When the cashier clicks Bayar:

1. If cart/order changed, update the draft order first.
2. Then record payment / settle existing order.
3. Mark payment status paid when amount completes order total.
4. Clear cart and remove from Draft Server.
5. Do not return to open draft list.

Do not treat active/kitchen order as editable draft.

### Active order payment

For active unpaid/partial order:

```txt
Pesanan Aktif -> Bayar -> record payment -> paid/completed/settled according to lifecycle
```

This must not require loading the whole order into cart edit mode.

If a direct active-order payment action UI is not already available, add a minimal action in the active-order section/dialog.

### Active/kitchen edit prevention

If a user somehow opens a non-draft order through URL `continueOrderId` or stale UI:

```txt
- Do not load it into editable cart.
- Show readable message: "Pesanan sudah aktif/diproses dan tidak bisa diedit dari keranjang. Gunakan Bayar atau Lihat Detail."
- Provide safe action if possible: open active order detail/payment instead.
```

## Required backend protection

Frontend guard is not enough.

Patch backend/application so normal order item update is rejected when unsafe.

### Update order/items guard

Before allowing `PATCH /api/orders/:id` item replacement/repricing, enforce:

```txt
Allowed only if:
- order.status === 'draft'
- paymentStatus is not paid/refunded/voided
- no kitchen ticket exists
- no fired kitchen items exist
```

Reject for:

```txt
confirmed
preparing
ready
served
completed
cancelled
hasKitchenTicket
hasFiredKitchenItems
```

Return readable error:

```txt
Pesanan sudah aktif atau sudah dikirim ke dapur dan tidak bisa diedit dari keranjang.
```

Use appropriate HTTP status, preferably `409 Conflict` with stable code such as:

```txt
ORDER_NOT_EDITABLE
KITCHEN_ORDER_LOCKED
FIRED_ITEMS_LOCKED
```

### Cancel/trash guard

Do not allow a draft-trash UI path to silently cancel active/kitchen orders.

Backend should either:

```txt
- reject cancel through draft action for active/kitchen orders, or
- require explicit active-order cancel reason/policy path.
```

If existing `POST /api/orders/:id/cancel` is the only cancel endpoint, ensure UI does not expose it as trash for active/kitchen rows in P2. Backend hardening may be conservative if existing business users rely on cancel endpoint, but report the residual risk clearly.

### Payment path

`PAY_ACTIVE_ORDER` must not require `orders_queue` entitlement.

Standard payment and record payment remain core cashier/payment behavior subject to auth/RBAC and existing payment entitlements for partial/split/multi as appropriate.

## Required use of P1 SOT/policy

Use `CanPerformOrderAction` / `ResolveAllowedOrderActions` from P1 where practical.

At minimum:

```txt
- Use policy for frontend row actions: continue/edit, pay active, delete local, cancel draft, send kitchen where feasible.
- Use policy or equivalent backend guard for update draft items.
- Do not duplicate ad-hoc strings for new action classification.
```

If direct use of P1 policy in frontend creates package/import boundary issues, add a thin API/helper layer or shared mapper without violating architecture. Report any boundary limitation.

## Entitlement rules

Keep these exact principles:

```txt
CREATE_AND_PAY: core POS payment, no commercial entitlement required; API auth/RBAC still applies.
PAY_ACTIVE_ORDER: core payment lifecycle, must not require orders_queue.
SEND_TO_KITCHEN: requires restaurant_kitchen_ops.
SPLIT_BILL: requires existing split bill entitlement code.
PARTIAL_PAYMENT: requires payments_partial_payment for DP/partial flow.
orders_queue: display/queue capability only, not payment lifecycle.
```

Do not hardcode Starter/Growth/Pro plan names.

## Tests required

Add or update tests according to existing test style.

### Frontend/unit or component tests if available

Test these behaviors:

```txt
- Draft Server section shows only true draft orders.
- Pesanan Aktif section shows confirmed/preparing/ready/served unpaid orders.
- Active/kitchen rows do not render Lanjut/Edit.
- Active/kitchen rows do not render trash/cancel as draft delete.
- Local draft rows still render Lanjut and Hapus Lokal.
```

If component test harness is not available, document manual verification steps in report and add lower-level mapper tests instead.

### Application/backend tests

Required pure/use-case tests:

```txt
- Update order items allowed for draft unpaid no kitchen ticket.
- Update order items denied for confirmed/preparing/ready/served.
- Update order items denied when hasKitchenTicket is true.
- Update order items denied when hasFiredKitchenItems is true.
- Continued draft payment path records payment after update.
- Active order payment path does not require orders_queue.
```

### API behavior tests if existing harness supports it

```txt
PATCH /api/orders/:id rejects active/kitchen order item replacement with 409 readable error.
POST /api/orders/:id/payments can settle active unpaid/partial order without orders_queue entitlement.
Fresh retail create-and-pay closes/does not return as draft/open order according to selected business profile mapping.
```

## Manual smoke scenarios

Document results in report:

```txt
1. Retail tenant without restaurant_kitchen_ops and without orders_queue:
   Cart -> Bayar -> paid/completed -> not in Draft Server.

2. True server draft:
   Cart -> Simpan Draft -> Draft Server -> Lanjut/Edit -> Bayar -> paid -> disappears from Draft Server.

3. Restaurant kitchen:
   Cart/Table -> Send to Kitchen -> Pesanan Aktif -> no Lanjut/Edit -> no trash -> Bayar action available.

4. Active kitchen stale URL:
   manually open continueOrderId for active/kitchen order -> not editable cart -> readable message.

5. Backend bypass:
   PATCH active/kitchen order items -> 409 readable error.
```

## Validation commands

Run as many as apply:

```bash
pnpm --filter @pos/domain type-check
pnpm --filter @pos/application type-check
pnpm --filter @pos/api type-check
pnpm --filter @pos/terminal-web type-check
pnpm --filter @pos/application test
pnpm --filter @pos/api test
pnpm type-check
```

If some pre-existing tests fail, document exact failures and prove they are unrelated.

## Required report

Create:

```txt
roadmap/business-flows/P2_pos_lifecycle_runtime_fix_report.md
```

Report must include:

```txt
1. Summary
2. Files changed
3. P0 bugs addressed
4. P1 SOT/policy usage
5. UI behavior matrix before/after
6. Backend guard matrix
7. Entitlement behavior proof
8. Retail standard smoke proof
9. Server draft payment proof
10. Restaurant/kitchen safety proof
11. Tests and validation output
12. Remaining risks / intentionally deferred to P3+
```

## Completion checklist

- [x] Server draft is separated from active orders in UI.
- [x] Active/kitchen orders cannot be loaded to editable cart through normal Lanjut.
- [x] Active/kitchen orders do not show trash draft delete.
- [x] Continued server draft can be paid and removed from draft list.
- [ ] Fresh retail/counter create-and-pay does not draft-loop. Existing path preserved; dedicated runtime smoke not executed in this batch.
- [x] Backend rejects normal item update for non-draft/kitchen-locked orders.
- [x] PAY_ACTIVE_ORDER does not require orders_queue.
- [x] Local drafts still work.
- [x] P2 report created.
- [x] Validation output documented.

## Commit

```txt
fix(pos): enforce draft and active order lifecycle
```
