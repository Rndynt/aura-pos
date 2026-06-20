# P5.1 Business Type vs Entitlement Model Correction Report

Date: 2026-06-20

## 1. Summary

P5.1 corrects the business-flow model so tenant `businessType` selects a baseline POS family, while paid add-ons are represented only as entitlements/capabilities. Restaurant/cafe tenants no longer default to mandatory table service, quick service is not unsupported, and service/laundry tenants receive the core checkout baseline.

## 2. Files changed

- `packages/domain/business-flows/businessFlowProfiles.ts` — replaced paid workflow IDs with baseline profile IDs.
- `packages/domain/business-flows/businessFlowTypes.ts` — updated `BusinessFlowProfileId` union.
- `packages/application/business-flows/resolveBusinessProfile.ts` — replaced workflow-mode mapping with baseline family mapping and core fallback.
- `packages/application/business-flows/resolveBusinessCapabilities.ts` — added entitlement-to-capability resolver.
- `packages/application/business-flows/registry/businessFlowProfiles.ts` — registered baseline profile definitions.
- `packages/application/business-flows/policies/CanPerformOrderAction.ts` — allowed core create-and-pay for every baseline family.
- `apps/api/src/http/controllers/TenantsController.ts` — continues exposing `businessProfile`, now carrying baseline family values from the corrected resolver.
- `apps/pos-terminal-web/src/features/pos-flows/core/*` and `root/*` — POS root now falls back to `CoreStandardPOSFlow` instead of unsupported for known/missing profiles.
- `apps/pos-terminal-web/src/hooks/api/useEntitlements.ts` — updated profile source typing/fallback.
- Tests under `packages/application/business-flows/__tests__` and `apps/pos-terminal-web/src/features/pos-flows/root/__tests__` were updated/added.
- `roadmap/business-flows/main.md` and this report were updated.

## 3. All discovered business type codes

Discovered from `ENTITLEMENT_CATALOG.businessTypes`, docs, migrations, and registration-related roadmap references:

| businessTypeCode | SOT status | Corrected businessFamily/baseProfile | Core POS flow component | Optional capabilities controlled by entitlements | Notes |
|---|---:|---|---|---|---|
| `CAFE_RESTAURANT` | Active SOT | `food_beverage` | Retail/core-compatible baseline in this batch | table service, floor plan, kitchen/KDS, order queue, split bill, partial payment, multi-payment | No longer routes to `restaurant_table_service` by default. |
| `RETAIL_MINIMARKET` | Active SOT | `retail_standard` | `RetailStandardPOSFlow` | advanced stock, barcode/label hardware, future retail add-ons | No restaurant controls by default. |
| `LAUNDRY` | Active SOT | `service` | Retail/core-compatible baseline in this batch | order queue, compact receipt, label printer, future service progress | Not unsupported by default. |
| `SERVICE_APPOINTMENT` | Active SOT | `service` | Retail/core-compatible baseline in this batch | order queue, partial payment, reports, future appointment lifecycle | Appointment/progress is not required for checkout. |
| `DIGITAL_PPOB` | Active SOT | `core_standard` | Retail/core-compatible baseline in this batch | API/webhook/reporting integrations | Uses core checkout fallback. |
| `retail`, `minimarket`, `store` | Alias/legacy examples | `retail_standard` | `RetailStandardPOSFlow` | same as retail SOT where applicable | Defensive compatibility aliases. |
| `restaurant`, `cafe`, `food_beverage`, `quick_service` | Alias/legacy examples | `food_beverage` | Retail/core-compatible baseline in this batch | F&B entitlements above | Quick service is not unsupported. |
| `service`, `appointment`, `salon`, `barber`, `spa` | Alias/future examples | `service` | Retail/core-compatible baseline in this batch | service entitlements/future modules | Kept as family aliases; not separate paid profiles. |
| unknown/null | Fallback | `core_standard` | Retail/core-compatible baseline in this batch | none by default | Does not block checkout. |

## 4. Old mapping vs corrected mapping

| Input | Old P4.1/P5 mapping | Corrected P5.1 mapping |
|---|---|---|
| `RETAIL_MINIMARKET` / retail/minimarket/store | `retail_standard` | `retail_standard` |
| `CAFE_RESTAURANT` / restaurant | `restaurant_table_service` | `food_beverage` |
| cafe | `cafe_counter` | `food_beverage` |
| quick_service | `quick_service` | `food_beverage` |
| laundry / service appointment | `service_business_later` | `service` |
| `DIGITAL_PPOB` | null/unsupported risk | `core_standard` |
| unknown/null | null -> unsupported | `core_standard` |

## 5. Base POS routing matrix after P5.1

| Base profile | POS root result | Baseline guarantee |
|---|---|---|
| `retail_standard` | `RetailStandardPOSFlow` | Product/catalog -> cart -> cash/full payment -> receipt. |
| `food_beverage` | `CoreStandardPOSFlow` | Same baseline; restaurant controls are entitlement-gated future/panel work. |
| `service` | `CoreStandardPOSFlow` | Same baseline; appointment/service lifecycle is optional/future. |
| `core_standard` | `CoreStandardPOSFlow` | Safe fallback checkout. |

`UnsupportedPOSFlow` remains in the tree but is no longer selected by the root resolver for known, unknown, null, or missing business profiles.

## 6. Entitlement capability matrix

| Capability | Entitlement key used | Missing entitlement behavior |
|---|---|---|
| table service | `restaurant_table_service` | Hide/disable table controls; core POS remains available. |
| floor plan | `restaurant_table_service` | Hide/disable floor/table layout; core POS remains available. |
| kitchen ops | `restaurant_kitchen_ops` | Hide/disable send-to-kitchen; core POS remains available. |
| KDS | `restaurant_kitchen_ops` | Hide/disable KDS/prep display; core POS remains available. |
| order queue | `orders_queue` | Hide/disable queue; full payment remains available. |
| split bill | `payments_split_bill` | Hide/disable split bill; full payment remains available. |
| partial payment | `payments_partial_payment` | Hide/disable partial/DP UI; full payment remains available. |
| multi payment | `payments_multi_payment` | Hide/disable multi-payment; full payment remains available. |

No new entitlement keys were invented.

## 7. Proof core POS is not blocked by missing paid entitlement

- `resolveBusinessProfileFromBusinessType()` now returns a checkout-capable baseline profile for every SOT business type and falls back to `core_standard` for unknown/null.
- `CanPerformOrderAction` allows `CREATE_AND_PAY` for `retail_standard`, `food_beverage`, `service`, and `core_standard` without requiring `orders_queue`, table service, kitchen, split bill, partial payment, or multi-payment.
- `resolveBusinessCapabilities([])` returns all optional capabilities as false; it does not disable the baseline POS profile.

## 8. Proof restaurant/cafe is not default table-service anymore

Resolver tests assert `CAFE_RESTAURANT`, `restaurant`, and `cafe` map to `food_beverage`, and explicitly do not map to `restaurant_table_service`, `cafe_counter`, `quick_service`, or `service_business_later`.

## 9. Proof quick/service/laundry are not Unsupported by default

Resolver tests assert `quick_service -> food_beverage`, `LAUNDRY -> service`, and `SERVICE_APPOINTMENT -> service`. POS root tests assert null/unknown profile input resolves to `core_standard`, not unsupported.

## 10. Tests and validation output

Commands run in this batch:

```bash
pnpm --filter @pos/domain type-check
pnpm --filter @pos/application type-check
pnpm --filter @pos/api type-check
pnpm --filter @pos/terminal-web type-check
pnpm --filter @pos/application test
pnpm --filter @pos/api test
pnpm --filter @pos/terminal-web test
pnpm --filter @pos/application exec tsx --tsconfig tsconfig.json business-flows/__tests__/businessFlowRegistry.test.ts
pnpm --filter @pos/application exec tsx --tsconfig tsconfig.json business-flows/__tests__/resolveBusinessCapabilities.test.ts
pnpm type-check
```

All commands above passed after fixing the capability resolver typing issue found during the first application type-check attempt.

## 11. Manual smoke result

Manual browser smoke was not run in this non-interactive batch. Automated resolver/type validation confirms route selection and baseline action policy, but a real cafe/restaurant registration-to-payment browser smoke should still be run before production release.

## 12. Cleanup grep findings

`rg -n "GenericPOSPage|restaurant_table_service.*businessType|businessType.*restaurant_table_service|UnsupportedPOSFlow|features/pos/services|features/pos/mappers|plan.*businessProfile|orders_queue.*payment" apps packages shared roadmap docs` still finds historical roadmap/docs references and the retained `UnsupportedPOSFlow` component file. No runtime mapping from business type to `restaurant_table_service` remains in `apps` or `packages`.

## 13. Remaining risks / deferred paid capability work

- `food_beverage`, `service`, and `core_standard` currently use `CoreStandardPOSFlow`, which delegates to the reusable retail/core checkout implementation. Dedicated `FoodBeveragePOSFlow` and `ServiceCorePOSFlow` wrappers should be added next for clearer UX copy and optional panels.
- The existing restaurant table-service adapter remains as an optional/internal implementation area, but it is no longer the default route for restaurant/cafe business type.
- Some docs still describe old roadmap phases using `restaurant_table_service`, `cafe_counter`, and `service_business_later` as profiles; they should be updated in a future documentation cleanup batch if those historical docs are meant to remain current.

## 14. Recommended next phase

Create explicit `food-beverage/` and `service/` flow folders that wrap/reuse POS core components while rendering optional panels from `resolveBusinessCapabilities()`. Then add component tests verifying cafe/restaurant without entitlements renders product/cart/payment but no table/kitchen/KDS controls.
