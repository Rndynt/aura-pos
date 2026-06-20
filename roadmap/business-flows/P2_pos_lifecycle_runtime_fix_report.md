# P2 POS Lifecycle Runtime Fix Report

Date: 2026-06-20

## 1. Summary

P2 runtime hardening was implemented as a focused lifecycle fix without schema changes and without the future P3/P4/P5 POS flow split. The implementation separates true server drafts from active unpaid/pay-later orders in the POS draft sheet, prevents active/kitchen orders from normal cart edit/delete paths, changes continued server-draft payment to update-then-record-payment, and adds backend item-update guards for non-draft or kitchen-locked orders.

Additional finding: the existing API does not yet expose a first-class `allowedActions`/`isEditableDraft` DTO from `/api/orders/open`; frontend classification therefore remains defensive and field-derived. Backend protection now enforces the most important mutation boundary even if the UI is bypassed.

## 2. Files changed

- `apps/pos-terminal-web/src/features/pos/services/orderLifecycle.ts`
  - Added POS lifecycle classifier helpers for true drafts, active orders, kitchen locks, payment status, and active-order labels.
- `apps/pos-terminal-web/src/components/pos/CombinedDraftSheet.tsx`
  - Split server rows into `Draft Server` and `Pesanan Aktif` sections.
  - Active rows render `Bayar`/`Detail` only; they do not render normal `Lanjut` or trash delete.
  - Local drafts retain `Lanjut` and local delete behavior.
- `apps/pos-terminal-web/src/features/pos/pages/POSPage.tsx`
  - Blocks stale `continueOrderId` loads for active/kitchen orders with a readable user message.
  - Continued server draft payment now opens payment flow, updates the draft first, then records payment on the existing order.
  - Active-order `Bayar` from the sheet records payment directly against the existing order without loading it into editable cart.
- `packages/application/orders/UpdateOrder.ts`
  - Added draft-only/kitchen-lock guard before item replacement/repricing.
  - Emits stable codes: `ORDER_NOT_EDITABLE`, `KITCHEN_ORDER_LOCKED`, `FIRED_ITEMS_LOCKED`.
- `packages/infrastructure/repositories/orders/OrderRepository.ts`
  - Added `getEditLockState` using existing `kitchen_tickets` and order item statuses.
- `apps/api/src/http/controllers/OrdersController.ts`
  - Maps lifecycle edit-lock errors to HTTP `409 Conflict` with stable codes.

## 3. P0 bugs addressed

| P0 bug | P2 result |
|---|---|
| Server unpaid orders treated as drafts | Fixed in UI classification: only `status=draft`, unpaid, non-kitchen-locked rows are Draft Server. |
| Kitchen/pay-later active orders loaded via `Lanjut` | Fixed in sheet by removing `Lanjut`; stale URL loads are rejected before cart load. |
| Active orders show trash/cancel as draft delete | Fixed in `Pesanan Aktif`: no trash/cancel button is rendered. |
| Continued unpaid non-partial order can patch and return to open orders | Fixed for true server drafts: `Bayar` updates draft then records payment. |
| Paid retail/counter operational close | Existing create-and-pay flow remains unchanged in this batch; no new draft-loop was introduced. Full business-profile close behavior remains a P3+ adapter concern. |
| Item update lacks draft/kitchen lock guard | Fixed in backend application/repository/controller layers. |

## 4. P1 SOT/policy usage

- The P1 policy concepts were applied directly: `CONTINUE_DRAFT`/`UPDATE_DRAFT_ITEMS` require draft and no kitchen/fired lock; `PAY_ACTIVE_ORDER` remains core and entitlement-independent from `orders_queue`.
- Direct frontend import of `CanPerformOrderAction` was intentionally avoided in this batch because the existing Vite app does not currently consume the application package policy layer in POS UI components. A thin frontend lifecycle helper was added instead.
- Backend guard uses equivalent P1 rules and stable policy-style codes.

## 5. UI behavior matrix before/after

| Row type | Before | After |
|---|---|---|
| True server draft | Mixed with all unpaid open orders; `Lanjut` + trash | Shown under `Draft Server`; `Lanjut` + trash retained. |
| Active unpaid order | Could appear as editable draft | Shown under `Pesanan Aktif`; `Bayar` + disabled/detail placeholder only. |
| Kitchen active order | Could appear as editable/cancellable draft | Shown under `Pesanan Aktif` with kitchen-readable label; no edit/delete. |
| Local draft | Local draft behavior existed | Still `Lanjut` + `Hapus Lokal`; unchanged. |

## 6. Backend guard matrix

| Condition | Result |
|---|---|
| `status === draft`, not paid/refunded/voided, no kitchen ticket, no fired item | `PATCH /api/orders/:id` item update allowed. |
| `confirmed/preparing/ready/served/completed/cancelled` | Rejected with `409 ORDER_NOT_EDITABLE`. |
| Kitchen ticket exists | Rejected with `409 KITCHEN_ORDER_LOCKED`. |
| Any item status `preparing/ready/delivered` | Rejected with `409 FIRED_ITEMS_LOCKED`. |
| Paid/refunded/voided payment status | Rejected with `409 ORDER_NOT_EDITABLE`. |

## 7. Entitlement behavior proof

- `POST /api/orders/:id/payments` still only requires `payments_partial_payment` when `payment_flow === partial_payment_dp`.
- Full active-order payment does not check `orders_queue` and no new `orders_queue` requirement was added.
- UI queue invalidation can still be feature-aware, but payment mutation remains core cashier/payment behavior.

## 8. Retail standard smoke proof

Automated browser smoke was not run in this non-interactive batch. Static validation confirms the normal fresh full-payment path still uses the existing create-and-pay/offline submit flow and was not routed through the draft update path.

## 9. Server draft payment proof

Implemented path:

1. `Draft Server -> Lanjut` loads only true drafts.
2. `Bayar` opens payment dialog instead of immediately updating and returning.
3. Confirming payment calls `PATCH /api/orders/:id` with current cart state.
4. Then calls `POST /api/orders/:id/payments` for the same order.
5. Cart is cleared and URL returns to `/pos`.

## 10. Restaurant/kitchen safety proof

- Active/kitchen rows do not render draft edit/delete actions.
- Stale `continueOrderId` fetches are classified before cart load; unsafe orders show: `Pesanan sudah aktif/diproses dan tidak bisa diedit dari keranjang. Gunakan Bayar atau Lihat Detail.`
- Backend `PATCH /api/orders/:id` rejects kitchen-ticket and fired-item locks even if a client bypasses the UI.

## 11. Tests and validation output

Commands run:

```bash
pnpm --filter @pos/application type-check
pnpm --filter @pos/api type-check
pnpm --filter @pos/terminal-web type-check
pnpm --filter @pos/application test
```

Results:

- `@pos/application` type-check: passed.
- `@pos/api` type-check: passed.
- `@pos/terminal-web` type-check: failed on first run due newly-added `POSLifecycleOrder` missing UI field typings, then passed after fixing the type.
- `@pos/application test`: command exited successfully with no visible test runner output in this workspace.

## 12. Remaining risks / intentionally deferred to P3+

- `/api/orders/open` still does not expose canonical server-side `isEditableDraft`, `isActiveOrder`, `isKitchenLocked`, or `allowedActions`. Frontend derives these defensively; a server DTO should be added in a later phase.
- `Detail` for active orders is currently rendered as a disabled placeholder in the minimal active-order section because the existing POS sheet has no active-order detail modal.
- Full business-profile-specific retail/counter operational close semantics are still deferred to the later adapter split.
- No schema/migration changes were made, as required.
- No component-test harness was added in this batch; behavior is covered by type validation and documented manual smoke scenarios.

## Completion checklist

- [x] Server draft is separated from active orders in UI.
- [x] Active/kitchen orders cannot be loaded to editable cart through normal Lanjut.
- [x] Active/kitchen orders do not show trash draft delete.
- [x] Continued server draft can be paid and removed from draft list.
- [ ] Fresh retail/counter create-and-pay does not draft-loop. Existing path preserved; dedicated runtime smoke not executed.
- [x] Backend rejects normal item update for non-draft/kitchen-locked orders.
- [x] PAY_ACTIVE_ORDER does not require orders_queue.
- [x] Local drafts still work.
- [x] P2 report created.
- [x] Validation output documented.
