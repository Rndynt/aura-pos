# Replit/Codex Prompt P6 — POS Order Lifecycle Flow

Repository: `Rndynt/AuraPoS`

## Goal

Fix POS order lifecycle. This task is not stock-related.

Current problem: the UI treats every unpaid server order as “Draft”, including orders already sent to kitchen. That creates unsafe actions: active kitchen orders can appear with `Lanjut` and trash actions, and continued draft payment only updates the draft instead of actually paying.

## Verified root causes

- `CombinedDraftSheet` builds `serverDrafts` from `openOrdersData.orders.filter(o => o.paymentStatus !== 'paid')`, so confirmed/preparing/ready/served unpaid orders are mixed into “draft”.
- `CombinedDraftSheet` renders `Lanjut` and trash actions for each server unpaid order without status/kitchen-state checks.
- In `POSPage`, if `continueOrderId` exists and payment is not partial, `handleCharge()` calls `handleUpdateContinueOrder()` and returns. That updates the order, clears cart, and sends it back to open orders instead of opening/finishing payment.
- `Send to Kitchen` creates/updates an order then creates kitchen ticket, but the same order can still show in the current draft sheet as if it were editable.

## Final lifecycle definitions

Use separate concepts. Do not merge them under one “Draft” label.

```txt
Cart = temporary cashier basket, not a server order yet.
Local Draft = offline/local draft on this device only.
Server Draft = server order with status draft, unpaid, not sent to kitchen, editable.
Active Order = confirmed/preparing/ready/served and unpaid/partial; not a draft.
Kitchen Order = active order with kitchen ticket or fulfillment started; not editable through normal cart.
Paid/Completed Order = financially closed order.
```

Do not call all unpaid server orders “Draft”.

## Correct standard POS flow

Without kitchen entitlement and without order queue entitlement:

```txt
Cart -> Bayar -> create order + record payment atomically -> paid/completed -> clear cart
```

Rules:

- Must not enter Draft automatically.
- Must not reappear in open orders after successful payment.
- Draft is created only when cashier explicitly clicks `Simpan Draft` / `Simpan Order`.

Server draft flow:

```txt
Cart -> Simpan Draft -> Server Draft
Server Draft -> Lanjut/Edit -> cart
Server Draft -> Bayar -> update draft if needed -> record payment/settle existing order -> paid/completed
Server Draft -> Batalkan/Hapus -> cancelled/deleted according to policy
```

The critical bug to fix: loading a server draft and clicking Bayar must pay it. It must not only update and return it to open orders.

## Correct active order flow without kitchen

For a business that needs running bills but no kitchen:

```txt
Cart -> Simpan Pesanan / Buka Tagihan -> Active Order unpaid
Active Order -> Bayar -> paid/completed
Active Order -> Tambah Item if explicitly supported
Active Order -> Cancel/Void with reason and permission
```

This is not a draft. Do not expose normal trash/delete or arbitrary edit unless the order is still draft.

## Correct kitchen flow

With kitchen entitlement:

```txt
Cart -> Send to Kitchen -> create/update order -> confirmed -> create kitchen ticket -> Active Kitchen Order
```

Rules:

- Active kitchen order must appear under active orders, not editable drafts.
- No normal `Lanjut/Edit` for active kitchen orders.
- No trash action for active kitchen orders.
- Payment must be available through `Bayar` action/detail without loading into editable cart.
- If adding items to active kitchen order is needed, it must be a separate explicit `Tambah Item` flow that creates an additional kitchen ticket. Do not silently edit fired kitchen items.
- Cancellation/void of active kitchen order must use explicit cancel/void policy with reason and permission.

## Required UI changes

Replace `CombinedDraftSheet` semantics with clear sections/tabs:

```txt
Draft Server
Pesanan Aktif
Draft Lokal
```

Action matrix:

```txt
Draft Server:
- Lanjut/Edit
- Bayar
- Batalkan/Hapus if allowed

Pesanan Aktif:
- Bayar
- Lihat Detail
- Tambah Item only if explicit flow exists
- Cancel/Void only through permission + reason flow
- No Lanjut/Edit normal cart load
- No trash delete

Draft Lokal:
- Lanjut
- Hapus Lokal
```

Rename the POS button if needed. If it opens more than drafts, do not label it only `Draft`. Use `Pesanan`, `Order Aktif`, or `Draft & Pesanan`.

## Required backend protections

Do not rely on UI only.

- Reject item update for orders that are not `draft`.
- Reject normal cart edit if kitchen ticket exists or fulfillment started.
- Reject silent delete/trash for active kitchen orders.
- Active kitchen order cancellation must go through explicit cancel/void policy, reason, and permission.
- Payment of active unpaid order must not require editable cart load.
- Errors must be readable to cashier.

## Required POSPage fixes

Patch `apps/pos-terminal-web/src/features/pos/pages/POSPage.tsx`:

- `continueOrderId` charge path must not call only `handleUpdateContinueOrder()` and return.
- For editable server draft: clicking Bayar opens payment flow, updates draft if needed, then records payment/settles the existing order.
- For active kitchen order: do not load to cart through normal continue flow. Pay from active-order action/detail.
- Standard create-and-pay must work even when `restaurant_kitchen_ops` and `orders_queue` are disabled.

## Entitlement rules

- Standard payment flow must work without `restaurant_kitchen_ops` and without `orders_queue`.
- `restaurant_kitchen_ops` controls Send to Kitchen/KDS flow.
- `orders_queue` controls queue display only, not core payment lifecycle.
- Cancel/void/refund/order operation permissions must use existing SOT/policy, not hardcoded plan names.
- Do not hardcode plan names.

## Tests required

- Standard POS without kitchen/order_queue: cart -> bayar -> paid, no draft loop.
- Server draft: save -> continue/edit -> bayar -> paid, removed from draft list.
- Active order without kitchen: can be paid without cart edit loop.
- Kitchen order: send to kitchen -> appears active, not draft.
- Kitchen order has no Lanjut/Edit and no trash action.
- Backend rejects item update for confirmed/preparing/ready/served.
- Backend rejects normal edit when kitchen ticket exists.
- Active unpaid kitchen order can be paid through Pay action.
- orders_queue disabled does not break standard payment.

## Validation

Run:

- `pnpm type-check`
- `pnpm --filter @pos/api type-check`
- `pnpm --filter @pos/terminal-web type-check`
- `pnpm --filter @pos/api test`

Manual smoke:

```txt
1. Kitchen disabled, order_queue disabled: cart -> Bayar -> paid, no draft loop.
2. Save server draft -> Lanjut/Edit -> Bayar -> paid, disappears from Draft Server.
3. Kitchen enabled: Send to Kitchen -> appears in Pesanan Aktif, not Draft Server.
4. Active kitchen order has no normal delete/trash.
5. Active kitchen order cannot be loaded to editable cart through Lanjut.
6. Active unpaid kitchen order can be paid through Bayar action.
```

## Report

Create/update:

`roadmap/orders/pos_order_lifecycle_and_kitchen_flow_report.md`

Report must include root cause, final lifecycle decision, UI action matrix, backend protection matrix, kitchen proof, standard flow proof, entitlement proof, validation output, and remaining issues `none` unless externally blocked.

## Commit

`fix(pos): clarify draft and kitchen order lifecycle`
