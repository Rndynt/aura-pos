# P6 Food Beverage + Service Core Flow Adapters Report

Date: 2026-06-20

## 1. Summary

P6 adds explicit frontend baseline adapters for the corrected P5.1 business families `food_beverage` and `service`. Both adapters reuse the existing reusable checkout core, keep product/catalog → cart → full payment/cash → receipt available without paid entitlements, and add clear optional capability panels driven by the existing entitlement capability resolver semantics.

No schema, backend API, payment engine, NorthFlow, tenant resolution, or order lifecycle lock changes were made.

## 2. Files changed/created/deleted

Created:

- `apps/pos-terminal-web/src/features/pos-flows/food-beverage/FoodBeveragePOSFlow.tsx`
- `apps/pos-terminal-web/src/features/pos-flows/food-beverage/useFoodBeveragePOSFlow.ts`
- `apps/pos-terminal-web/src/features/pos-flows/food-beverage/foodBeverageFlowPolicy.ts`
- `apps/pos-terminal-web/src/features/pos-flows/food-beverage/FoodBeverageOptionalPanels.tsx`
- `apps/pos-terminal-web/src/features/pos-flows/food-beverage/index.ts`
- `apps/pos-terminal-web/src/features/pos-flows/food-beverage/__tests__/foodBeverageFlowPolicy.test.ts`
- `apps/pos-terminal-web/src/features/pos-flows/service/ServiceCorePOSFlow.tsx`
- `apps/pos-terminal-web/src/features/pos-flows/service/useServiceCorePOSFlow.ts`
- `apps/pos-terminal-web/src/features/pos-flows/service/serviceCoreFlowPolicy.ts`
- `apps/pos-terminal-web/src/features/pos-flows/service/ServiceOptionalPanels.tsx`
- `apps/pos-terminal-web/src/features/pos-flows/service/index.ts`
- `apps/pos-terminal-web/src/features/pos-flows/service/__tests__/serviceCoreFlowPolicy.test.ts`
- `apps/pos-terminal-web/src/features/pos-flows/shared/resolvePOSFlowCapabilities.ts`
- `apps/pos-terminal-web/src/features/pos-flows/shared/__tests__/resolvePOSFlowCapabilities.test.ts`
- `roadmap/business-flows/P6_food_beverage_service_core_flows_report.md`

Changed:

- `apps/pos-terminal-web/src/features/pos-flows/root/POSFlowRoot.tsx`
- `apps/pos-terminal-web/src/features/pos-flows/retail/RetailStandardPOSFlow.tsx`
- `apps/pos-terminal-web/package.json`
- `roadmap/business-flows/main.md`
- `roadmap/business-flows/replit_codex_P6_food_beverage_service_core_flows_prompt.md`
- `PLANS.md`

Deleted: none.

## 3. Routing matrix after P6

| Business profile | POS root component after P6 | Notes |
|---|---|---|
| `retail_standard` | `RetailStandardPOSFlow` | Unchanged retail baseline. |
| `food_beverage` | `FoodBeveragePOSFlow` | Explicit F&B adapter with optional capability panels. |
| `service` | `ServiceCorePOSFlow` | Explicit service adapter with optional capability panels. |
| `core_standard` | `CoreStandardPOSFlow` | Safe reusable checkout fallback. |
| null / undefined / unknown | `CoreStandardPOSFlow` | Not unsupported by default. |

## 4. FoodBeveragePOSFlow structure and baseline proof

`FoodBeveragePOSFlow` renders a F&B-specific optional panel and passes the F&B hook result into the reusable retail/core checkout composition. `foodBeverageFlowPolicy` sets `baselineCheckout` and `allowsCreateAndPay` to true, requires no capability for full payment, and explicitly marks table/floor/kitchen/KDS/queue/split/partial/multi payment as optional.

Baseline proof: `canFoodBeverageCreateAndPay(emptyCapabilities)` returns true and the test asserts `requiredCapabilitiesForFullPayment` is empty and `requiresOrderQueueForFullPayment` is false.

## 5. ServiceCorePOSFlow structure and baseline proof

`ServiceCorePOSFlow` renders service-specific copy/panels and reuses the same checkout primitives for service/product catalog, cart, full payment, and receipt. `serviceCoreFlowPolicy` keeps order queue, partial payment, and multi-payment optional; appointment lifecycle, service progress, and label printer are documented as future optional modules instead of baseline requirements.

Baseline proof: `canServiceCoreCreateAndPay(emptyCapabilities)` returns true and the test asserts no full-payment capability requirement.

## 6. CoreStandard fallback proof

`resolvePOSFlowComponent()` already returns `core_standard` for `core_standard`, null, and undefined; `POSFlowRoot` now only selects F&B/service for explicit flow keys and otherwise returns `CoreStandardPOSFlow`. Root tests cover null/undefined fallback.

## 7. Capability/entitlement usage proof

The frontend helper `resolvePOSFlowCapabilities()` delegates to `@pos/application/business-flows` `resolveBusinessCapabilities()` and only adds a `baselineCheckout: true` flag for UI composition. It keeps the existing SOT entitlement keys:

- `restaurant_table_service` → table service and floor plan
- `restaurant_kitchen_ops` → kitchen ops and KDS
- `orders_queue` → order queue
- `payments_split_bill` → split bill
- `payments_partial_payment` → partial payment
- `payments_multi_payment` → multi-payment

No new paid entitlement keys were invented.

## 8. Optional panel behavior matrix

| Panel | Missing entitlement | Present entitlement in P6 |
|---|---|---|
| F&B table/floor | Disabled/upgrade explanatory card; checkout remains available. | Enabled-state card; runtime controls should only be mounted when safe. |
| F&B kitchen/KDS | Disabled/upgrade explanatory card; checkout remains available. | Enabled-state card; send-to-kitchen remains guarded by safe implementation. |
| F&B order queue | Disabled explanatory card; full payment does not require queue. | Enabled-state card. |
| F&B split/partial/multi | Disabled explanatory card; full payment remains available. | Payment dialog flags can be enabled from capability data. |
| Service job queue | Disabled explanatory card; checkout remains available. | Enabled-state card. |
| Service partial/multi | Disabled explanatory card; full payment remains available. | Payment dialog flags can be enabled from capability data. |
| Appointment lifecycle | Not implemented explanatory card in P6. | Deferred future module; not a checkout blocker. |

## 9. Tests and validation output

Commands run:

```bash
pnpm --filter @pos/domain type-check
pnpm --filter @pos/application type-check
pnpm --filter @pos/api type-check
pnpm --filter @pos/terminal-web type-check
pnpm --filter @pos/application test
pnpm --filter @pos/api test
pnpm --filter @pos/terminal-web test
pnpm type-check
```

All commands passed in this batch.

## 10. Manual smoke result or not-run statement

Manual browser smoke was not run in this non-interactive environment. Automated policy/helper/root tests and TypeScript checks validate the routing and entitlement-gating invariants. A browser smoke should still be run before production release for real checkout, receipt printing, and tenant entitlement combinations.

## 11. Cleanup grep findings

Command run:

```bash
rg -n "GenericPOSPage|features/pos/services|features/pos/mappers|restaurant_table_service.*businessType|businessType.*restaurant_table_service|cafe_counter|service_business_later|UnsupportedPOSFlow" apps packages shared roadmap docs
```

Findings:

- No active runtime imports of `GenericPOSPage` or old `features/pos/services` / `features/pos/mappers` compatibility shims were introduced in `apps/pos-terminal-web/src`.
- `UnsupportedPOSFlow` remains as a component/export under `apps/pos-terminal-web/src/features/pos-flows/unsupported`, but POS root does not select it for valid baseline profiles or unknown/null fallback.
- Remaining grep hits are historical roadmap/report/prompt references and application tests that assert old profile IDs are not selected.

## 12. Remaining risks/deferred paid capability work

- F&B and service adapters currently reuse the retail/core checkout primitives; this is intentional for P6 baseline safety but visual composition can be refined later.
- F&B optional table/floor/kitchen controls are represented as gated informational panels in this batch; deeper integration with the restaurant table-service adapter should happen only when entitlement and safe runtime support are both present.
- Service appointment/progress/label workflows remain future modules and are not mounted in P6.
- A manual browser smoke with real tenants and entitlement combinations is still required before release.

## 13. Recommended next phase

Implement safe, entitlement-gated optional runtime panels for F&B table/floor/kitchen only where backend lifecycle guards are already complete, and add component-level rendering tests with a React test harness for `FoodBeveragePOSFlow` and `ServiceCorePOSFlow`.
