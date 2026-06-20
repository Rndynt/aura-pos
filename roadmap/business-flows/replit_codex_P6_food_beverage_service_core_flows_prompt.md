# Replit/Codex Prompt P6 — Food Beverage + Service Core Flow Adapters

Repository: `Rndynt/AuraPoS`

## Goal

Create explicit baseline POS flow folders for `food_beverage` and `service` business families after P5.1 corrected the business type vs entitlement model.

P5.1 fixed the model so tenant `businessType` maps to baseline POS families:

```txt
retail_standard
food_beverage
service
core_standard
```

and optional operational modes are controlled by entitlements/capabilities, not by upgrade profile.

P6 must make that corrected model visible in frontend flow structure:

```txt
retail_standard -> RetailStandardPOSFlow
food_beverage -> FoodBeveragePOSFlow
service -> ServiceCorePOSFlow
core_standard / unknown / null -> CoreStandardPOSFlow
```

The new flows must reuse POS core and must not reintroduce the old GenericPOSPage, old compatibility shims, or paid-mode routing.

## Read first

```txt
roadmap/business-flows/main.md
roadmap/business-flows/P5_1_business_type_entitlement_model_correction_report.md
packages/domain/business-flows/businessFlowProfiles.ts
packages/application/business-flows/resolveBusinessProfile.ts
packages/application/business-flows/resolveBusinessCapabilities.ts
packages/application/business-flows/registry/businessFlowProfiles.ts
packages/application/business-flows/policies/CanPerformOrderAction.ts
apps/pos-terminal-web/src/features/pos-flows/core/**
apps/pos-terminal-web/src/features/pos-flows/retail/**
apps/pos-terminal-web/src/features/pos-flows/restaurant/**
apps/pos-terminal-web/src/features/pos-flows/root/**
apps/pos-terminal-web/src/hooks/api/useEntitlements.ts
```

Audit the current flow tree:

```bash
find apps/pos-terminal-web/src/features/pos-flows -maxdepth 3 -type f | sort
rg -n "food_beverage|service|core_standard|restaurant_table_service|cafe_counter|quick_service|service_business_later|UnsupportedPOSFlow|GenericPOSPage|features/pos/services|features/pos/mappers" apps packages shared roadmap docs
```

## Product model to preserve

P6 must keep the P5.1 correction intact:

```txt
businessType       = business category selected by tenant
base POS flow      = always available core checkout
entitlements       = optional capabilities/features inside the flow
```

There must be no profile upgrade concept.

Users upgrade plan/entitlements, not business type/profile.

## Non-negotiable scope boundary

Allowed in P6:

```txt
- Add FoodBeveragePOSFlow and ServiceCorePOSFlow baseline frontend adapters.
- Route food_beverage to FoodBeveragePOSFlow.
- Route service to ServiceCorePOSFlow.
- Keep core_standard/null/unknown on CoreStandardPOSFlow.
- Use resolveBusinessCapabilities() to drive optional UI sections.
- Add clear UX copy for food/beverage and service baseline flows.
- Add tests and report.
```

Forbidden in P6:

```txt
- Do not remap restaurant/cafe back to restaurant_table_service.
- Do not make table service, kitchen, KDS, split bill, partial payment, or order queue required for core POS.
- Do not route valid business types to UnsupportedPOSFlow by default.
- Do not reintroduce GenericPOSPage.
- Do not reintroduce old features/pos/services or features/pos/mappers compatibility shims.
- Do not hardcode plan names.
- Do not infer business type/profile from entitlement absence.
- Do not weaken P2/P2.1 active/kitchen order locks.
- Do not rewrite payment engine or NorthFlow.
- Do not add schema/migrations unless absolutely unavoidable and documented.
```

## Required target structure

Create:

```txt
apps/pos-terminal-web/src/features/pos-flows/food-beverage/
  FoodBeveragePOSFlow.tsx
  useFoodBeveragePOSFlow.ts
  foodBeverageFlowPolicy.ts
  FoodBeverageOptionalPanels.tsx
  index.ts
  __tests__/

apps/pos-terminal-web/src/features/pos-flows/service/
  ServiceCorePOSFlow.tsx
  useServiceCorePOSFlow.ts
  serviceCoreFlowPolicy.ts
  ServiceOptionalPanels.tsx
  index.ts
  __tests__/
```

Optional shared helpers only if they do not contain business decisions:

```txt
apps/pos-terminal-web/src/features/pos-flows/shared/
```

## Required routing after P6

Update:

```txt
apps/pos-terminal-web/src/features/pos-flows/root/resolvePOSFlowComponent.ts
apps/pos-terminal-web/src/features/pos-flows/root/POSFlowRoot.tsx
```

Routing must be:

```txt
retail_standard -> RetailStandardPOSFlow
food_beverage -> FoodBeveragePOSFlow
service -> ServiceCorePOSFlow
core_standard -> CoreStandardPOSFlow
null/undefined/unknown -> CoreStandardPOSFlow
```

`UnsupportedPOSFlow` may remain only for explicit invalid states if still useful, but it must not be selected for valid SOT business types or normal unknown/null fallback.

## FoodBeveragePOSFlow requirements

`FoodBeveragePOSFlow` is the baseline flow for cafe, restaurant, quick service, and food/beverage business types.

Default behavior without paid entitlements:

```txt
Product/catalog -> Cart -> Full payment/cash -> Receipt
```

This default must not require:

```txt
restaurant_table_service
restaurant_kitchen_ops
orders_queue
payments_split_bill
payments_partial_payment
payments_multi_payment
KDS/floor plan/table service
```

Optional sections/actions must be driven by `resolveBusinessCapabilities()` / entitlement data:

```txt
tableService/floorPlan -> show table/floor/table controls
kitchenOps -> show Send to Kitchen / kitchen ticket controls
kds -> show KDS/prep display entry points if existing UI supports it
orderQueue -> show queue/prep tracking if existing UI supports it
splitBill -> show split bill only through safe entitlement-controlled UI
partialPayment -> show DP/partial payment only through safe payment dialog support
multiPayment -> show multi-payment only through safe payment dialog support
```

Important:

```txt
- If table/kitchen entitlement is missing, hide or disable table/kitchen controls, but keep normal checkout available.
- If kitchen ops is enabled but backend-safe flow is incomplete, show a disabled/upgrade/not-ready panel with report note, not a broken action.
- Do not use RestaurantTableServicePOSFlow as the default food_beverage route.
- RestaurantTableServicePOSFlow may be reused internally only as an optional table-service mode/panel when required entitlements are active and safe.
```

## ServiceCorePOSFlow requirements

`ServiceCorePOSFlow` is the baseline for service/laundry/appointment-like business types.

Default behavior without paid entitlements:

```txt
Service/product/catalog -> Cart -> Full payment/cash -> Receipt
```

This default must not require:

```txt
appointment lifecycle module
service progress module
order queue
partial payment
label printer
advanced reports
```

Optional sections/actions must be driven by capabilities/entitlements:

```txt
orderQueue -> show queue/job tracking if supported
partialPayment -> show DP/partial payment if supported
multiPayment -> show multi-payment if supported
receipt/label features -> show only if supported entitlement exists
future appointment lifecycle -> placeholder or hidden unless implemented and entitled
```

For P6, it is acceptable for ServiceCorePOSFlow to wrap the same core checkout primitives as CoreStandardPOSFlow, but it must have service-specific copy/structure and no unsupported/blocking default state.

## CoreStandardPOSFlow requirements

Keep CoreStandardPOSFlow as safe fallback:

```txt
core_standard/null/unknown -> CoreStandardPOSFlow
```

It must guarantee normal checkout remains available unless tenant/outlet/session is truly invalid.

Do not turn unknown/null into Unsupported by default.

## Capability resolver usage

Use existing:

```txt
packages/application/business-flows/resolveBusinessCapabilities.ts
```

and frontend entitlement data to produce UI flags.

If frontend currently cannot consume the application helper directly, add a frontend adapter/helper with the same semantics and tests, but keep mapping aligned with the application helper.

Do not duplicate inconsistent capability keys.

Capability keys should include only existing entitlement SOT keys. Do not invent new paid feature keys in P6.

## Optional panel behavior

Create optional panels with clear states:

```txt
- hidden: capability false and no upgrade CTA location exists;
- disabled/upgrade: capability false and UI has established upgrade/marketplace pattern;
- enabled: capability true and backend/frontend flow is safe;
- not implemented: capability true but safe runtime support is not available yet, with clear message/report blocker.
```

For P6, priority is safe baseline checkout and correct feature gating, not finishing every paid optional flow.

## Tests required

### Root routing tests

Update root routing test:

```txt
retail_standard -> retail
food_beverage -> food_beverage
service -> service
core_standard -> core
null/undefined/unknown -> core
no valid business type -> not unsupported
```

### FoodBeverage policy tests

```txt
foodBeverageFlowPolicy:
- businessProfile food_beverage
- baseline create-and-pay allowed
- table/kitchen/KDS/order queue/split/partial are optional capabilities
- no capability required for full payment
- no orders_queue required for payment
```

### Service policy tests

```txt
serviceCoreFlowPolicy:
- businessProfile service
- baseline create-and-pay allowed
- appointment/progress/queue/partial are optional capabilities
- no capability required for full payment
```

### Capability UI tests/helper tests

If pure helper exists:

```txt
empty entitlements -> no optional capability true, baseline still true
restaurant_table_service entitlement -> tableService true
restaurant_kitchen_ops entitlement -> kitchenOps/KDS true according to current SOT
orders_queue entitlement -> orderQueue true, full payment remains true without it
payments_split_bill -> splitBill true
payments_partial_payment -> partialPayment true
payments_multi_payment -> multiPayment true
```

### Component tests if harness exists

If component harness exists, add:

```txt
FoodBeveragePOSFlow without entitlements renders product/cart/payment and no table/kitchen panel.
FoodBeveragePOSFlow with table/kitchen entitlements renders optional panels.
ServiceCorePOSFlow renders product/cart/payment and not unsupported.
RetailStandardPOSFlow remains unchanged.
```

If component harness is unavailable, document manual smoke.

## Manual smoke checklist

Run if possible and document:

```txt
1. CAFE_RESTAURANT tenant without paid entitlements opens FoodBeveragePOSFlow and can checkout Product -> Cart -> Pay -> Receipt.
2. Same tenant does not see active table/kitchen/KDS/split/partial controls unless entitlement exists.
3. Same tenant with restaurant_table_service entitlement sees table/floor/table controls or clear disabled/not-implemented state.
4. Same tenant with restaurant_kitchen_ops entitlement sees kitchen/send-to-kitchen controls only if safe; otherwise clear not-implemented state.
5. QUICK_SERVICE tenant opens FoodBeveragePOSFlow/Core checkout, not Unsupported.
6. LAUNDRY/SERVICE_APPOINTMENT tenant opens ServiceCorePOSFlow and can checkout.
7. DIGITAL_PPOB/unknown/null falls to CoreStandardPOSFlow and can checkout if catalog/product exists.
8. Retail tenant still opens RetailStandardPOSFlow.
9. Full payment works without orders_queue.
10. No GenericPOSPage or old mapper/service shim is imported at runtime.
```

## Cleanup checks

Run and document:

```bash
rg -n "GenericPOSPage|features/pos/services|features/pos/mappers|restaurant_table_service.*businessType|businessType.*restaurant_table_service|cafe_counter|service_business_later|UnsupportedPOSFlow" apps packages shared roadmap docs
```

Expected:

```txt
- No active runtime import of GenericPOSPage.
- No active runtime import of old features/pos services/mappers shim paths.
- No business type maps to restaurant_table_service/cafe_counter/service_business_later as default route.
- UnsupportedPOSFlow is not selected for baseline profiles or unknown/null fallback.
- Historical roadmap/docs references may remain only if report documents them.
```

## Required report

Create:

```txt
roadmap/business-flows/P6_food_beverage_service_core_flows_report.md
```

Report must include:

```txt
1. Summary
2. Files changed/created/deleted
3. Routing matrix after P6
4. FoodBeveragePOSFlow structure and baseline proof
5. ServiceCorePOSFlow structure and baseline proof
6. CoreStandard fallback proof
7. Capability/entitlement usage proof
8. Optional panel behavior matrix
9. Tests and validation output
10. Manual smoke result or not-run statement
11. Cleanup grep findings
12. Remaining risks/deferred paid capability work
13. Recommended next phase
```

Update:

```txt
roadmap/business-flows/main.md
PLANS.md
```

if the repo uses these as progress/task tracking.

## Validation commands

Run:

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

Run cleanup grep command above and document exact result.

## Completion checklist

- [x] FoodBeveragePOSFlow created.
- [x] useFoodBeveragePOSFlow created.
- [x] foodBeverageFlowPolicy created.
- [x] FoodBeverage optional panel component created.
- [x] ServiceCorePOSFlow created.
- [x] useServiceCorePOSFlow created.
- [x] serviceCoreFlowPolicy created.
- [x] Service optional panel component created.
- [x] POS root routes food_beverage to FoodBeveragePOSFlow.
- [x] POS root routes service to ServiceCorePOSFlow.
- [x] POS root routes core_standard/null/unknown to CoreStandardPOSFlow.
- [x] UnsupportedPOSFlow is not default for valid baseline business types.
- [x] Food/beverage baseline checkout works without paid entitlements.
- [x] Service baseline checkout works without paid entitlements.
- [x] Optional table/kitchen/KDS/split/partial/multi controls are capability-gated.
- [x] Full payment/cash remains available without orders_queue.
- [x] No GenericPOSPage or old compatibility shims reintroduced.
- [x] Tests/validation documented.
- [x] P6 report created.

## Commit

```txt
feat(pos): add food beverage and service core flows
```
