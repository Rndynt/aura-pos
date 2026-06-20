# P5 Restaurant Table Service Full Refactor Report

Date: 2026-06-20
Scope source: `roadmap/business-flows/replit_codex_P5_restaurant_table_service_full_refactor_prompt.md`

## 1. Summary

P5 implements an explicit `restaurant_table_service` POS runtime adapter and removes the old mixed generic POS page from active routing. POS root routing is now explicit:

- `retail_standard` -> `RetailStandardPOSFlow`
- `restaurant_table_service` -> `RestaurantTableServicePOSFlow`
- `cafe_counter`, `quick_service`, `service_business_later`, null, unknown -> `UnsupportedPOSFlow`

The restaurant adapter owns table/dining context, send-to-kitchen/pay-later active order creation, active restaurant order display, and payment on an existing active order. It does not expose retail fresh create-and-pay as the default restaurant action.

## 2. Files changed/deleted

Changed/created:

- `apps/pos-terminal-web/src/features/pos-flows/restaurant/RestaurantTableServicePOSFlow.tsx`
- `apps/pos-terminal-web/src/features/pos-flows/restaurant/useRestaurantTableServicePOSFlow.ts`
- `apps/pos-terminal-web/src/features/pos-flows/restaurant/restaurantTableServiceFlowPolicy.ts`
- `apps/pos-terminal-web/src/features/pos-flows/restaurant/RestaurantTableContextPanel.tsx`
- `apps/pos-terminal-web/src/features/pos-flows/restaurant/RestaurantOrderLifecyclePanel.tsx`
- `apps/pos-terminal-web/src/features/pos-flows/restaurant/index.ts`
- `apps/pos-terminal-web/src/features/pos-flows/restaurant/__tests__/restaurantTableServiceFlowPolicy.test.ts`
- `apps/pos-terminal-web/src/features/pos-flows/unsupported/UnsupportedPOSFlow.tsx`
- `apps/pos-terminal-web/src/features/pos-flows/unsupported/index.ts`
- `apps/pos-terminal-web/src/features/pos-flows/root/POSFlowRoot.tsx`
- `apps/pos-terminal-web/src/features/pos-flows/root/resolvePOSFlowComponent.ts`
- `apps/pos-terminal-web/src/features/pos-flows/root/__tests__/resolvePOSFlowComponent.test.ts`
- `apps/pos-terminal-web/src/features/pos/hooks/usePOSCartFlow.ts`
- `apps/pos-terminal-web/src/features/pos/hooks/usePOSCustomerDisplayFlow.ts`
- `apps/pos-terminal-web/src/features/pos/hooks/usePOSKitchenFlow.ts`
- `apps/pos-terminal-web/src/features/pos/hooks/usePOSOfflineFlow.ts`
- `apps/pos-terminal-web/src/features/pos/hooks/usePOSPaymentFlow.ts`
- `apps/pos-terminal-web/src/features/pos/hooks/usePOSReceiptFlow.ts`
- `apps/pos-terminal-web/src/components/pos/CombinedDraftSheet.tsx`
- `apps/pos-terminal-web/package.json`
- `roadmap/business-flows/main.md`
- `roadmap/business-flows/replit_codex_P5_restaurant_table_service_full_refactor_prompt.md`
- `PLANS.md`

Deleted:

- `apps/pos-terminal-web/src/features/pos/pages/GenericPOSPage.tsx`
- `apps/pos-terminal-web/src/features/pos/services/orderLifecycle.ts`
- `apps/pos-terminal-web/src/features/pos/services/posOrderService.ts`
- `apps/pos-terminal-web/src/features/pos/services/posPaymentService.ts`
- `apps/pos-terminal-web/src/features/pos/services/posPrinterService.ts`
- `apps/pos-terminal-web/src/features/pos/mappers/cartToOrderPayload.ts`
- `apps/pos-terminal-web/src/features/pos/mappers/orderToCart.ts`
- `apps/pos-terminal-web/src/features/pos/mappers/receiptPayloadMapper.ts`
- `apps/pos-terminal-web/src/features/pos/mappers/cfdPayloadMapper.ts`
- `apps/pos-terminal-web/src/features/pos/mappers/kitchenTicketPayloadMapper.ts`

## 3. Restaurant adapter structure

Created:

```txt
apps/pos-terminal-web/src/features/pos-flows/restaurant/
  RestaurantTableServicePOSFlow.tsx
  useRestaurantTableServicePOSFlow.ts
  restaurantTableServiceFlowPolicy.ts
  RestaurantOrderLifecyclePanel.tsx
  RestaurantTableContextPanel.tsx
  index.ts
  __tests__/restaurantTableServiceFlowPolicy.test.ts
```

The adapter composes the existing POS layout/product/cart/payment primitives while making restaurant decisions in the restaurant flow package.

## 4. POS root routing matrix after P5

| businessProfile | Result |
| --- | --- |
| `retail_standard` | `RetailStandardPOSFlow` |
| `restaurant_table_service` | `RestaurantTableServicePOSFlow` |
| `cafe_counter` | `UnsupportedPOSFlow` |
| `quick_service` | `UnsupportedPOSFlow` |
| `service_business_later` | `UnsupportedPOSFlow` |
| null/undefined/unknown | `UnsupportedPOSFlow` |

## 5. Legacy/compatibility cleanup result

- `POSFlowRoot` no longer imports or renders `GenericPOSPage`.
- `GenericPOSPage.tsx` was deleted.
- Old `features/pos/services/*` and `features/pos/mappers/*` re-export shims were deleted.
- Remaining feature hooks now import from `features/pos-core` instead of compatibility paths.

Prompt-required `rg` check no longer finds active `GenericPOSPage`, `features/pos/services`, or `features/pos/mappers` references. Remaining `legacy` word hits are unrelated comments/tests in API/domain/retail legacy-active-order warning copy, not active mixed POS fallback imports.

## 6. Remaining Legacy Blockers

None for active POS runtime fallback or POS compatibility shim imports.

Known non-blocking terminology remains in unrelated source comments/tests and in retail warning copy for active unpaid orders created before the flow split. This does not keep the mixed generic POS runtime active.

## 7. Restaurant table context behavior

- The adapter uses `useTables()` from the existing tenant-aware table API hook.
- If tables are returned, the user can select one from `RestaurantTableContextPanel`.
- The user can also type a manual table/dining note into the same panel.
- `Send to Kitchen` is blocked when the cart has items but no dining context.

## 8. Send to Kitchen behavior proof

`useRestaurantTableServicePOSFlow` owns `handleSendToKitchenFromCart`:

1. validates non-empty cart;
2. requires dining context;
3. requires `restaurant_kitchen_ops` before creating a kitchen ticket;
4. creates an unpaid order through existing create-order API;
5. creates a kitchen ticket through existing kitchen ticket mutation when online;
6. queues a local kitchen ticket only for offline local KDS fallback;
7. clears the cart and refreshes active orders after success;
8. does not record payment.

## 9. Active kitchen order lifecycle/payment proof

The restaurant active-order panel lists unpaid, non-completed active restaurant orders and exposes `Detail / Bayar`, not cart edit/delete. Draft resume still verifies `isTrueServerDraft`; active/kitchen orders are rejected from normal editable cart loading.

Payment is driven by `usePOSActiveOrderPayment`, which resolves remaining amount through the POS core active-order payment amount service before opening the payment dialog. The payment dialog records payment against the existing order with `useRecordPayment`; it does not create a second paid order from cart contents.

## 10. Payment entitlement proof

- Full payment on existing active restaurant orders uses normal record-payment flow and does not require `orders_queue`.
- `payments_partial_payment` only controls whether the existing payment dialog is allowed to expose partial payment UI.
- `payments_multi_payment` remains controlled by existing `payments_multi_payment` entitlement.
- Split bill is not exposed for restaurant P5 because a dedicated safe restaurant split UI is not implemented in this phase.

## 11. Tests and validation output

Commands run in this batch:

```bash
pnpm --filter @pos/terminal-web type-check
pnpm --filter @pos/terminal-web test
rg -n "GenericPOSPage|features/pos/services|features/pos/mappers|compatibility shim|legacy" apps/pos-terminal-web/src packages apps/api/src
```

Results:

- Terminal web type-check passed.
- Terminal web tests passed, including root routing and restaurant policy/helper tests.
- `rg` confirmed there is no active `GenericPOSPage`, `features/pos/services`, or `features/pos/mappers` runtime import/reference. Remaining `legacy` hits are unrelated comments/tests or warning copy.

Full workspace validation commands were also run after this report update; see `PLANS.md` and final response for exact pass/fail output.

## 12. Manual smoke result or not-run statement

Browser/manual smoke was not run in this terminal-only batch.

Manual smoke checklist to run in browser:

1. Restaurant tenant routes to `RestaurantTableServicePOSFlow`.
2. Retail tenant still routes to `RetailStandardPOSFlow`.
3. Cafe/quick/service/unknown routes to `UnsupportedPOSFlow`, not `GenericPOSPage`.
4. Restaurant cart with no table cannot Send to Kitchen.
5. Restaurant table selected -> add products -> Send to Kitchen -> active kitchen order appears -> cart clears.
6. Active kitchen order cannot be edited/deleted through normal cart.
7. Active kitchen order Detail/Pay opens payment dialog and pays remaining amount only.
8. Paid active restaurant order disappears from active list and receipt behavior remains available where configured.
9. Retail flow still has no kitchen/table controls.
10. Full payment works without `orders_queue`.

## 13. Remaining risks deferred to P6/P7

- Add-items-to-existing-active-restaurant-order remains intentionally hidden because the current backend lacks a dedicated safe append-items/new-ticket use case that does not violate fired-item locks.
- Component/browser tests for restaurant UI should be added when the frontend test harness is available.
- Cafe counter, quick service, and service-business-later still need dedicated adapters.
- Restaurant split bill/table split remains deferred until it has a dedicated entitlement-controlled UI and backend-safe flow.

## 14. Recommended next phase

Recommended next phase: P6 cafe/quick-service adapter or backend `AppendRestaurantOrderItems` use case.

Why: P5 now removes the ambiguous mixed runtime path. The next highest-value work is either implementing another explicit adapter or enabling safe add-on kitchen tickets for active restaurant tables.
