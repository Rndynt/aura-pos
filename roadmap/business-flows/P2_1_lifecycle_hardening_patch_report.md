# P2.1 Lifecycle Hardening Patch Report

Date: 2026-06-20

## 1. Summary

P2.1 adds server-backed lifecycle DTO fields for POS/open-order responses, makes POS UI prefer the canonical flags/actions while retaining offline/backward-compatible fallback classification, replaces the disabled active-order Detail placeholder with a minimal detail/payment dialog, and hardens active-order payment to settle only the remaining balance.

No schema or migration was added. No P3/P4/P5 business-flow adapter split was performed.

## 2. Files changed

- `packages/application/orders/mappers/orderLifecycleDtoMapper.ts` — canonical lifecycle DTO mapper.
- `packages/application/orders/index.ts` — exports lifecycle mapper/types.
- `packages/application/orders/ListOpenOrders.ts` — open-order repository contract accepts outlet/payment filter shape used by POS.
- `packages/application/orders/__tests__/orderLifecycleDtoMapper.test.ts` — pure lifecycle mapper smoke tests.
- `packages/application/orders/__tests__/UpdateOrder.lifecycleLocks.test.ts` — UpdateOrder lock smoke tests.
- `packages/application/package.json` — adds application test script.
- `packages/infrastructure/repositories/orders/OrderRepository.ts` — adds batch edit-lock lookup and tenant-scopes fired item lock through the tenant-owned order join.
- `apps/api/src/http/controllers/OrdersController.ts` — attaches lifecycle DTO fields to `/api/orders`, `/api/orders/open`, and `/api/orders/:id`; filters POS open rows to draft/active lifecycle kinds.
- `apps/pos-terminal-web/src/features/pos/services/orderLifecycle.ts` — adds action-aware helpers and remaining-amount helpers.
- `apps/pos-terminal-web/src/components/pos/CombinedDraftSheet.tsx` — consumes server actions/flags and adds active-order detail/payment dialog.
- `apps/pos-terminal-web/src/features/pos/pages/POSPage.tsx` — active-order payment uses validated remaining amount.
- `docs/ORDER_LIFECYCLE.md` — documents POS lifecycle DTO and open-order filtering behavior.
- `PLANS.md` — records this execution batch.

## 3. Server lifecycle DTO fields added

Orders mapped for POS/order API views now include computed fields:

- `isEditableDraft`
- `isActiveOrder`
- `isKitchenLocked`
- `hasKitchenTicket`
- `hasFiredKitchenItems`
- `allowedActions`
- `lifecycleKind`
- `lifecycleLabel`

The mapper follows P2.1 rules: editable drafts require `status=draft`, non-paid/refunded/voided payment state, and no kitchen/fired locks. Active orders require `confirmed/preparing/ready/served` with `unpaid/partial`. Kitchen locks are derived from kitchen tickets, fired item status, and fulfillment/kitchen status signals.

## 4. API endpoints updated

- `GET /api/orders/open` attaches lifecycle fields and returns only `server_draft`, `active_order`, and `active_kitchen_order` rows for the POS sheet. This excludes paid fresh checkout orders from Draft Server/Pesanan Aktif operational noise.
- `GET /api/orders/:id` attaches lifecycle fields, so stale `continueOrderId` guards can rely on server-backed flags.
- `GET /api/orders` also attaches lifecycle fields without removing the existing response shape.

## 5. Frontend behavior before/after

Before P2.1, the frontend classified lifecycle rows defensively and the active-order Detail button was disabled. After P2.1, POS helpers prefer `allowedActions`, `isEditableDraft`, `isActiveOrder`, and `isKitchenLocked` when present, while preserving fallback logic for older/offline records.

Normal `Lanjut/Edit` appears only for rows allowed to continue as drafts. Draft cancel/delete appears only for cancellable server drafts. Active rows expose Bayar/Detail only and do not enter the editable cart path.

## 6. Active-order detail/payment behavior

The active-order detail dialog shows order number, table, customer, lifecycle label, item list, total, paid amount, remaining amount, payment status, and `Bayar`/`Tutup` actions. It does not expose cart editing or trash/delete. Its `Bayar` action reuses the same active-order payment flow as the active row.

## 7. Remaining amount calculation proof

Active-order payment now resolves:

```txt
remainingAmount = remaining_amount/remainingAmount if present, otherwise max(total/total_amount - paidAmount/paid_amount, 0)
```

If the amount cannot be computed as a finite number, or if it is zero, the frontend blocks payment instead of posting `NaN`, `0`, or a full-total overpayment.

## 8. Fresh retail/counter create-and-pay proof or fix

P2.1 fixes the POS sheet side: `/api/orders/open` maps lifecycle and filters to draft/active unpaid kinds only. A fresh full-paid create-and-pay order with `paymentStatus=paid` maps to `paid_completed`, so it is excluded from Draft Server/Pesanan Aktif even if its operational `status` remains `confirmed` for fulfillment semantics.

No business-profile hardcoding or `fulfillment_mode=instant` inference was added; that remains a P3+ adapter decision.

## 9. Backend lock hardening proof

`getEditLockStates(orderIds, tenantId)` now batches kitchen ticket and fired-item checks. Kitchen tickets are scoped by `kitchen_tickets.tenant_id`. Fired items are scoped by joining `order_items` to `orders` with `orders.tenant_id = tenantId`, which avoids trusting `order_items` alone for tenant isolation.

`PATCH /api/orders/:id` continues to return stable 409 codes through the controller for:

- `ORDER_NOT_EDITABLE`
- `KITCHEN_ORDER_LOCKED`
- `FIRED_ITEMS_LOCKED`

## 10. Tests and validation output

Automated checks run in this batch:

```bash
pnpm --filter @pos/application type-check
pnpm --filter @pos/api type-check
pnpm --filter @pos/domain type-check
pnpm --filter @pos/terminal-web type-check
pnpm --filter @pos/application test
pnpm --filter @pos/api test
pnpm type-check
```

All listed commands passed.

Pure tests cover lifecycle mapper draft/active/kitchen/paid/local fallback cases. Application tests cover UpdateOrder allowed draft update and expected lock rejection codes.

## 11. Manual smoke result

Browser/manual smoke was not run in this non-interactive terminal-only environment. Manual checklist to execute in a browser:

1. Retail fresh payment: Cart -> Bayar -> paid -> not in Draft Server/Pesanan Aktif.
2. Server draft: Cart -> Simpan Draft -> Draft Server -> Lanjut -> Bayar -> update+record payment -> disappears.
3. Restaurant active kitchen: Send to Kitchen -> Pesanan Aktif -> no Lanjut/trash -> Detail opens -> Bayar works.
4. Partial active order: DP/partial -> Pesanan Aktif -> Bayar pays remaining only.
5. Stale URL: `/pos?continueOrderId=<active_order_id>` -> blocked with readable message.
6. Backend bypass: `PATCH` active/kitchen order items -> 409 `ORDER_NOT_EDITABLE`/`KITCHEN_ORDER_LOCKED`/`FIRED_ITEMS_LOCKED`.

## 12. Remaining risks deferred to P3+

- Full retail/restaurant/cafe business-flow adapter split remains deferred.
- No browser component test harness was added; UI behavior is covered by type-check and manual smoke checklist.
- `fulfillment_mode=instant` for business profiles still needs reliable profile/order-type policy before automatic close behavior is changed.
- Active-order detail is intentionally minimal and does not implement future void/refund/split-bill flows.

## Completion checklist

- [x] `/api/orders/open` returns lifecycle fields.
- [x] `/api/orders/:id` returns lifecycle fields.
- [x] Frontend prefers lifecycle fields over ad-hoc unpaid filtering.
- [x] Active order Detail is real, not disabled placeholder.
- [x] Active order payment pays remaining amount, not blindly full total.
- [x] Paid fresh retail/counter order is excluded from Draft Server/Pesanan Aktif.
- [x] Backend fired-item/kitchen-ticket lock is tenant-safe.
- [x] PATCH unsafe order update returns 409 stable code.
- [x] Local draft behavior still works.
- [x] Tests/validation documented.
- [x] P2.1 report created.
