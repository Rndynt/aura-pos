# P3 POS Core Extraction Report

Date: 2026-06-20

## 1. Summary

P3 extracted the reusable, behavior-preserving POS runtime layer into `apps/pos-terminal-web/src/features/pos-core`. The current POS route still owns page-level orchestration, but pure lifecycle/payment amount logic, mappers, stock guard, active-order payment setup, receipt/printer orchestration wrappers, customer display wrapper, and lifecycle/payment/product/cart component facades now live behind POS core boundaries.

No backend order/payment behavior, database schema, migrations, entitlement semantics, public routes, offline/local draft behavior, or business-flow adapter split was introduced.

During extraction, an existing edge case was found in lifecycle amount parsing: missing `remaining_amount` was treated as `0` because `Number(undefined ?? 0)` returned zero. The P3 core service now treats missing/empty amount fields as absent, preserves the required fallback `total - paidAmount`, and returns `null` for explicitly invalid numeric fields so the active-order payment path blocks unsafe payment instead of submitting `NaN`, `0`, or overpayment.

## 2. Files moved/created/changed

### Created POS core

- `apps/pos-terminal-web/src/features/pos-core/index.ts`
- `apps/pos-terminal-web/src/features/pos-core/components/POSProductGrid.tsx`
- `apps/pos-terminal-web/src/features/pos-core/components/POSCartPanel.tsx`
- `apps/pos-terminal-web/src/features/pos-core/components/POSPaymentDialog.tsx`
- `apps/pos-terminal-web/src/features/pos-core/components/POSOrderLifecycleSheet.tsx`
- `apps/pos-terminal-web/src/features/pos-core/components/POSReceiptActions.tsx`
- `apps/pos-terminal-web/src/features/pos-core/hooks/usePOSStockGuard.ts`
- `apps/pos-terminal-web/src/features/pos-core/hooks/usePOSActiveOrderPayment.ts`
- `apps/pos-terminal-web/src/features/pos-core/hooks/usePOSReceiptController.ts`
- `apps/pos-terminal-web/src/features/pos-core/hooks/usePOSPrinterController.ts`
- `apps/pos-terminal-web/src/features/pos-core/hooks/usePOSCustomerDisplayController.ts`
- `apps/pos-terminal-web/src/features/pos-core/hooks/usePOSOfflineSubmit.ts`
- `apps/pos-terminal-web/src/features/pos-core/services/posLifecycleService.ts`
- `apps/pos-terminal-web/src/features/pos-core/services/posOrderApiService.ts`
- `apps/pos-terminal-web/src/features/pos-core/services/posPrinterService.ts`
- `apps/pos-terminal-web/src/features/pos-core/services/posPaymentAmountService.ts`
- `apps/pos-terminal-web/src/features/pos-core/mappers/cartToOrderPayload.ts`
- `apps/pos-terminal-web/src/features/pos-core/mappers/orderToCart.ts`
- `apps/pos-terminal-web/src/features/pos-core/mappers/receiptPayloadMapper.ts`
- `apps/pos-terminal-web/src/features/pos-core/mappers/cfdPayloadMapper.ts`
- `apps/pos-terminal-web/src/features/pos-core/mappers/kitchenTicketPayloadMapper.ts`
- `apps/pos-terminal-web/src/features/pos-core/services/__tests__/posPaymentAmountService.test.ts`
- `apps/pos-terminal-web/src/features/pos-core/services/__tests__/posLifecycleService.test.ts`

### Changed existing files

- `apps/pos-terminal-web/src/features/pos/pages/POSPage.tsx`
- `apps/pos-terminal-web/src/features/pos/services/orderLifecycle.ts`
- `apps/pos-terminal-web/src/features/pos/services/posOrderService.ts`
- `apps/pos-terminal-web/src/features/pos/services/posPrinterService.ts`
- `apps/pos-terminal-web/src/features/pos/mappers/cartToOrderPayload.ts`
- `apps/pos-terminal-web/src/features/pos/mappers/orderToCart.ts`
- `apps/pos-terminal-web/src/features/pos/mappers/receiptPayloadMapper.ts`
- `apps/pos-terminal-web/src/features/pos/mappers/cfdPayloadMapper.ts`
- `apps/pos-terminal-web/src/features/pos/mappers/kitchenTicketPayloadMapper.ts`
- `apps/pos-terminal-web/package.json`
- `PLANS.md`
- `roadmap/business-flows/replit_codex_P3_pos_core_extraction_prompt.md`

## 3. Extracted core modules table

| Area | POS core module | Purpose | Behavior status |
| --- | --- | --- | --- |
| Lifecycle classification | `services/posLifecycleService.ts` | Draft/active/kitchen/paid classification helpers and amount readers | Preserved, with safer missing/invalid amount handling |
| Active payment amount | `services/posPaymentAmountService.ts` | Resolve active-order remaining payment amount and block invalid/paid orders | Added pure tested helper |
| Order API frontend service | `services/posOrderApiService.ts` | Fetch POS order and update status | Moved behind compatibility shim |
| Printer service | `services/posPrinterService.ts` | Queue, print-now, paired printer, failed print marking | Moved behind compatibility shim |
| Payload mappers | `mappers/*` | Order payload, order-to-cart helpers, receipt/CFD/kitchen payloads | Moved behind compatibility shims |
| Stock guard | `hooks/usePOSStockGuard.ts` | Outlet-aware add/update stock validation | Extracted from POSPage with same user-facing messages |
| Active-order payment controller | `hooks/usePOSActiveOrderPayment.ts` | Turns active order row/detail action into pending payment dialog state | Extracted from POSPage |
| Receipt/printer controller | `hooks/usePOSReceiptController.ts` / `usePOSPrinterController.ts` | Receipt payload builder plus queue/print orchestration facade | Wrapped existing behavior |
| Customer display controller | `hooks/usePOSCustomerDisplayController.ts` | Stable POS core export for current CFD flow | Wrapped existing flow preserving `inPaymentFlowRef` behavior |
| Offline submit | `hooks/usePOSOfflineSubmit.ts` | Stable POS core export for create-and-pay offline fallback | Wrapped existing hook |
| Component facades | `components/POS*` | Product grid/cart/payment/lifecycle core entry points | Wrappers/re-exports to avoid UI rewrite |

## 4. POSPage slimming summary

`POSPage.tsx` now imports reusable core modules from `@/features/pos-core` for mappers, lifecycle/order/printer services, stock guard, active-order payment controller, receipt controller, CFD controller, offline submit wrapper, payment dialog facade, and lifecycle sheet facade. The large inline outlet stock map/quantity validation block was removed from the page and replaced with `usePOSStockGuard`. Active-order payment amount resolution was removed from the sheet callback and now goes through `usePOSActiveOrderPayment` and `posPaymentAmountService`.

The page remains the current route-level orchestrator for P3. It was intentionally not split into Retail/Restaurant/Cafe adapters.

## 5. Compatibility re-exports/shims

The previous mapper/service paths are retained as compatibility shims:

- `apps/pos-terminal-web/src/features/pos/services/orderLifecycle.ts`
- `apps/pos-terminal-web/src/features/pos/services/posOrderService.ts`
- `apps/pos-terminal-web/src/features/pos/services/posPrinterService.ts`
- `apps/pos-terminal-web/src/features/pos/mappers/cartToOrderPayload.ts`
- `apps/pos-terminal-web/src/features/pos/mappers/orderToCart.ts`
- `apps/pos-terminal-web/src/features/pos/mappers/receiptPayloadMapper.ts`
- `apps/pos-terminal-web/src/features/pos/mappers/cfdPayloadMapper.ts`
- `apps/pos-terminal-web/src/features/pos/mappers/kitchenTicketPayloadMapper.ts`

Existing imports outside the refactored POS page can continue to work while future P4/P5/P6 flow adapters migrate to `@/features/pos-core` directly.

## 6. Behavior preservation matrix

| Required behavior | P3 status | Notes |
| --- | --- | --- |
| Fresh cart payment opens payment dialog and submits create-and-pay/offline flow | Preserved | Payment flow code remains in POSPage; offline submit is only wrapped. |
| Server Draft -> Lanjut -> Bayar updates draft first then records payment | Preserved | Continue-order branch unchanged except mapper import source. |
| Active order row/detail -> Bayar records payment using remaining amount | Preserved/hardened | Uses tested core resolver; blocks paid, zero, invalid, or over-total remaining values. |
| Active/kitchen orders do not enter editable cart | Preserved | Lifecycle helper moved with compatibility shim. |
| Active/kitchen rows do not show draft trash delete | Preserved | `POSOrderLifecycleSheet` wraps current `CombinedDraftSheet`. |
| Local draft rows still resume and delete locally | Preserved | Sheet and resume path unchanged. |
| Send to Kitchen works when restaurant kitchen ops is active | Preserved | Kitchen path and payload mapper behavior unchanged. |
| Partial/DP flow uses existing partial entitlement and create-and-pay DP path | Preserved | DP path unchanged. |
| Multi/split payment flags preserved in payment dialog | Preserved | `POSPaymentDialog` re-exports current dialog. |
| Receipt and CFD behavior preserved | Preserved | Receipt and CFD are wrappers around existing services/hooks. |
| Stock guard remains outlet-aware | Preserved | Same tracked/non-tracked, unavailable, availableQuantity/stock_qty fallback, add/update messages. |
| No new orders_queue requirement introduced | Preserved | No backend/API lifecycle change; existing queue invalidation behavior unchanged. |

## 7. Tests and validation output

Automated checks run in this batch:

```bash
pnpm --filter @pos/terminal-web test
pnpm --filter @pos/domain type-check
pnpm --filter @pos/application type-check
pnpm --filter @pos/api type-check
pnpm --filter @pos/terminal-web type-check
pnpm --filter @pos/application test
pnpm --filter @pos/api test
pnpm type-check
```

All listed commands passed after fixing the amount-reader edge case described in the summary.

## 8. Manual smoke result

Browser/manual smoke was not run in this terminal-only environment. Manual checklist to execute in a browser:

1. Retail fresh payment still succeeds.
2. Server draft resume then payment still succeeds.
3. Active order payment from row/detail succeeds using remaining amount.
4. Stale active `continueOrderId` still blocks editable cart.
5. Send to Kitchen still creates active order/kitchen ticket.
6. Local draft resume/delete still works.
7. Receipt print/queue behavior still works.
8. CFD payment/completed screens still update correctly when `customer_display` is enabled.

## 9. Remaining risks deferred to P4/P5/P6

- `POSPage.tsx` remains a large route orchestrator; P3 intentionally avoids business-flow adapter split.
- Component facades are mostly wrappers/re-exports. Future adapters should move business-flow-specific orchestration behind adapter hooks in P4/P5/P6.
- Browser component tests for `POSOrderLifecycleSheet` were not added because no frontend component test harness is configured.
- `POSReceiptActions` is a placeholder facade for a future reusable visible receipt-actions component; current behavior remains service/controller driven.

## 10. Recommended next phase

Proceed to P4 with a retail-standard adapter only after confirming browser smoke. P4 should consume `@/features/pos-core` modules directly and keep retail-specific flow decisions out of core.

## Completion checklist

- [x] `pos-core` folder created.
- [x] Pure POS lifecycle/payment amount/mappers moved or centralized.
- [x] POSPage imports reusable core modules instead of owning all logic inline.
- [x] Stock guard extracted.
- [x] Receipt/printer orchestration extracted or wrapped.
- [x] CFD/customer display orchestration extracted or wrapped.
- [x] Draft/active lifecycle sheet wrapper created or current sheet safely re-exported.
- [x] P2.1 behavior preserved.
- [x] No schema/migration change.
- [x] No business-flow adapter split yet.
- [x] Tests/validation documented.
- [x] P3 report created.
