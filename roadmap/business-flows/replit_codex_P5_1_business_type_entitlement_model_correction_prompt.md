# Replit/Codex Prompt P5.1 — Business Type vs Entitlement Model Correction

Repository: `Rndynt/AuraPoS`

## Goal

Correct the business-flow model so AuraPoS supports every registered business type with a core POS baseline, while paid/advanced operational modes are controlled by entitlement/plan.

P4.1 and P5 introduced explicit POS routing, but the model currently conflates **business type** with **paid operational mode**. Example problem:

```txt
restaurant / CAFE_RESTAURANT -> restaurant_table_service
restaurant_table_service -> RestaurantTableServicePOSFlow
```

That is wrong for the product model.

A restaurant/cafe tenant that just registered must be able to use the base POS immediately:

```txt
Product -> Cart -> Pay -> Receipt
```

They should not be pushed into table service, kitchen service, KDS, split bill, partial payment, or unsupported mode just because their business type is restaurant/cafe.

The correct model is:

```txt
businessType       = the kind of business the tenant selected during registration
core POS baseline  = always available default POS capability
entitlement/plan   = unlocks extra capabilities/modes inside that business type
```

There must be **no upgrade profile** concept. Users upgrade plan/entitlements, not their business type/profile.

## Read first

```txt
roadmap/business-flows/main.md
roadmap/business-flows/P4_1_business_profile_resolver_pos_flow_gate_report.md
roadmap/business-flows/P5_restaurant_table_service_full_refactor_report.md
packages/application/business-flows/resolveBusinessProfile.ts
packages/domain/business-flows/businessFlowProfiles.ts
apps/api/src/http/controllers/TenantsController.ts
apps/pos-terminal-web/src/features/pos-flows/root/**
apps/pos-terminal-web/src/features/pos-flows/retail/**
apps/pos-terminal-web/src/features/pos-flows/restaurant/**
apps/pos-terminal-web/src/features/pos-flows/unsupported/**
apps/pos-terminal-web/src/hooks/api/useEntitlements.ts
```

Use search to audit all created/existing business type constants and SOT files, not only cafe/restaurant:

```bash
rg -n "businessType|business_type|businessProfile|business_profile|RETAIL|CAFE|RESTAURANT|QUICK|SERVICE|LAUNDRY|SALON|BARBER|SPA|APPOINTMENT|MINIMARKET|STORE|business type|business-type" apps packages shared roadmap docs
```

## Current known problem to fix

Current resolver maps known business types into workflow-specific profiles:

```txt
retail/minimarket/store -> retail_standard
caferestaurant/restaurant -> restaurant_table_service
cafe -> cafe_counter
quickservice -> quick_service
laundry/serviceappointment -> service_business_later
```

The mistake is not only cafe/restaurant. The whole mapping model must be reviewed.

`restaurant_table_service`, `cafe_counter`, `quick_service`, and `service_business_later` are currently being treated as base routing profiles. That makes tenant business type look like an upgradeable workflow profile. It also causes business types without a ready adapter to go to `UnsupportedPOSFlow`, even though every registered business should still get core POS.

P5.1 must correct this globally.

## Product model that must be enforced

### Business type

`businessType` should describe the tenant's business category, for example:

```txt
retail_minimarket
cafe_restaurant
restaurant
cafe
quick_service
laundry
service_appointment
salon
barber
spa
store
```

Use the existing business-type catalog/SOT as the source of truth. Do not invent random codes. If some examples above do not exist in code, do not add them unless the registration/business type SOT already supports them.

### Core POS baseline

Every valid business type must be able to access a base POS flow:

```txt
Product/catalog -> Cart -> Full payment/cash -> Receipt
```

This baseline must not require:

```txt
orders_queue
table_service
floor_plan
restaurant_kitchen_ops
KDS
split_bill
partial_payment
advanced inventory
any paid addon
```

### Entitlement-controlled capabilities

These are not business type defaults. They are paid/entitlement-gated features/modes:

```txt
table service / floor plan / table layout
send to kitchen / kitchen ticket
KDS / kitchen display
order queue / preparation queue
split bill
partial payment / DP
multi payment
advanced receipt variants
inventory advanced features
service appointment progress features
```

If entitlement is missing, the user must still have core POS.

## Required conceptual correction

P5.1 must remove the idea that `restaurant_table_service` is the default routing profile for restaurant businesses.

Correct rules:

```txt
businessType = cafe_restaurant/restaurant/cafe/etc.
base POS flow = core/base flow for that business family, always usable
entitlements = turn on optional UI/actions/modes inside that flow
```

Do not create a separate `restaurant_standard` vs `restaurant_table_service` upgrade profile. That is still wrong. The business type remains cafe/restaurant; only features are enabled/disabled by entitlement.

If a field name `businessProfile` already exists in API from P4.1, either:

```txt
Option A: keep the field name for API compatibility during development but change its meaning/values to base business profile/category, not paid workflow mode; or
Option B: introduce clearer naming such as `businessFlowProfile` / `posBusinessProfile` only if it improves correctness and does not cause large churn.
```

Because this project is still in development, prefer correctness over compatibility. Update call sites/tests/docs accordingly.

## Required target behavior after P5.1

### Routing must become baseline-first

No known valid business type should be blocked by `UnsupportedPOSFlow` just because its advanced adapter is not complete.

Required high-level routing:

```txt
retail/minimarket/store -> RetailStandardPOSFlow or CoreStandardPOSFlow with retail defaults
cafe/restaurant/food-beverage -> FoodBeveragePOSFlow or CoreStandardPOSFlow with food defaults
quick_service -> FoodBeveragePOSFlow/CoreStandardPOSFlow with quick-service defaults
laundry/service/salon/barber/spa/service appointment -> CoreStandardPOSFlow or ServiceCorePOSFlow baseline
unknown/null -> CoreStandardPOSFlow fallback, not unsupported, unless tenant setup is truly invalid
```

Important:

```txt
- table-service UI is not a routing profile;
- kitchen/KDS is not a routing profile;
- split bill is not a routing profile;
- partial payment is not a routing profile;
- service appointment progress is not required to use core POS.
```

### Cafe/restaurant baseline

For cafe/restaurant tenants without paid entitlements:

```txt
Product -> Cart -> Pay -> Receipt
```

With entitlements:

```txt
table_service/floor_plan -> table context/table controls visible
restaurant_kitchen_ops/kitchen_ops -> Send to Kitchen/kitchen ticket visible
KDS entitlement -> KDS/prep display visible
orders_queue -> queue/prep tracking visible
split_bill -> split bill UI visible
partial_payment -> DP/partial payment visible
multi_payment -> multi-payment UI visible
```

No entitlement means the control is hidden/disabled with upgrade CTA only where marketplace UX already supports it. It must not block core POS.

### Retail baseline

Retail remains:

```txt
Product -> Cart -> Pay -> Receipt
```

No kitchen/table UI by default. If future entitlements allow something retail-specific, that must be explicit.

### Quick service baseline

Quick service should not be unsupported. It should have core POS baseline:

```txt
Product -> Cart -> Pay -> Receipt
```

If queue/prep ticket entitlement exists, then after payment it can create a prep ticket. Without entitlement, it still completes normal POS sale.

### Service/laundry baseline

Service/laundry/service-appointment business types should not be unsupported. They should at least get core POS baseline:

```txt
Service/Product -> Cart -> Pay -> Receipt
```

Appointment/progress/lifecycle features are entitlements/future modules, not a reason to block POS.

## Required implementation directions

### 1. Audit all business types

Find the actual business type SOT/catalog used by registration and tenant creation.

Produce a mapping table in the report with every existing business type code found in codebase.

For each, classify:

```txt
businessTypeCode
businessFamily/baseProfile
core POS flow component
optional capabilities controlled by entitlements
notes
```

Do not only patch `CAFE_RESTAURANT`.

### 2. Replace workflow-mode resolver with base business family resolver

Current `resolveBusinessProfileFromBusinessType` should be corrected.

Recommended new concept:

```ts
type BasePOSBusinessProfile =
  | 'retail'
  | 'food_beverage'
  | 'service'
  | 'core_standard';
```

or use names already accepted by the project if they exist.

Rules:

```txt
retail/minimarket/store -> retail or core_standard with retail defaults
cafe/restaurant/food/quick_service -> food_beverage or core_standard with food defaults
laundry/service/salon/barber/spa/appointment -> service or core_standard
unknown/null -> core_standard fallback or null with CoreStandardPOSFlow fallback
```

Do not map restaurant to `restaurant_table_service` by default.

Do not map cafe to `cafe_counter` as a paid/operational mode by default unless `cafe_counter` is redefined as a business family baseline and not a premium workflow. If unclear, use `food_beverage` or `core_standard`.

### 3. Introduce capability flags from entitlements

Create a separate capability resolver, for example:

```txt
packages/application/business-flows/resolveBusinessCapabilities.ts
```

or frontend-local helper if entitlement data only exists on frontend.

The model should look like:

```ts
businessCapabilities = {
  tableService: boolean;
  floorPlan: boolean;
  kitchenOps: boolean;
  kds: boolean;
  orderQueue: boolean;
  splitBill: boolean;
  partialPayment: boolean;
  multiPayment: boolean;
}
```

Use existing entitlement keys only. Do not invent new paid feature keys unless they already exist in entitlement SOT. If a required entitlement key is missing, document it in report instead of hardcoding.

### 4. Add or reuse CoreStandardPOSFlow

There must be a baseline flow for every business type.

Preferred options:

```txt
Option A: rename/convert RetailStandardPOSFlow into CoreStandardPOSFlow if it is generic enough, then wrap retail-specific defaults separately.
Option B: create `CoreStandardPOSFlow` using pos-core components and keep RetailStandardPOSFlow as retail-specific wrapper.
```

Required folder if creating new flow:

```txt
apps/pos-terminal-web/src/features/pos-flows/core/
  CoreStandardPOSFlow.tsx
  useCoreStandardPOSFlow.ts
  coreStandardFlowPolicy.ts
  index.ts
  __tests__/
```

Core flow must support:

```txt
Product grid
Cart
Full payment/cash
Receipt
Stock guard
Local/offline fallback if currently supported safely
No paid feature hard requirement
```

### 5. Refactor FoodBeverage/CafeRestaurant flow

Restaurant P5 created `RestaurantTableServicePOSFlow`. P5.1 should correct it into one of these clean directions:

```txt
Option A: Rename/refactor to FoodBeveragePOSFlow or CafeRestaurantPOSFlow and make table/kitchen sections entitlement-gated optional panels.
Option B: Keep RestaurantTableServicePOSFlow only as an internal optional sub-mode/panel used inside FoodBeveragePOSFlow when tableService/kitchen entitlements are active.
```

Do not route cafe/restaurant tenants directly into mandatory table-service flow.

FoodBeverage default must be:

```txt
Product -> Cart -> Pay -> Receipt
```

Optional sections only when entitlement active:

```txt
TableContextPanel
SendToKitchen
RestaurantOrderLifecyclePanel
KDS/prep queue
Split bill
Partial payment
```

### 6. Refactor POS root routing

POS root should route by base business category, not premium mode.

Target examples:

```txt
retail -> RetailStandardPOSFlow/CoreStandardPOSFlow
food_beverage/cafe_restaurant/restaurant/cafe/quick_service -> FoodBeveragePOSFlow/CoreStandardPOSFlow
service/laundry/service appointment -> CoreStandardPOSFlow or ServiceCorePOSFlow
unknown/null -> CoreStandardPOSFlow fallback
```

`UnsupportedPOSFlow` should not be used for valid tenant business types that can use core POS. It may remain only for truly invalid/misconfigured state if needed.

### 7. Remove/rename misleading profile constants

Audit `packages/domain/business-flows/businessFlowProfiles.ts`.

Current values like these are misleading if treated as base profile:

```txt
restaurant_table_service
cafe_counter
quick_service
service_business_later
```

Fix by either:

```txt
- Renaming to base business profiles/families; or
- Moving table-service/cafe-counter/service-later into capability/mode definitions, not base profile routing; or
- Leaving old constants only if no runtime route uses them as default profile and report explains deprecation/removal plan.
```

Because project is in development, prefer removal/rename over compatibility shims.

### 8. Update API contract and frontend types

If `businessProfile` remains:

```txt
businessProfile should represent base category/family, not paid mode.
```

If introducing clearer fields:

```ts
businessType: string | null;
businessFamily: 'retail' | 'food_beverage' | 'service' | 'core_standard' | null;
posCapabilities: { ... entitlement flags ... };
```

Do not remove required tenant/profile fields without updating frontend call sites.

## Entitlement rules to preserve

Core full payment must never require:

```txt
orders_queue
table_service/floor_plan
restaurant_kitchen_ops
KDS
split bill
partial payment
multi payment
advanced inventory
```

Optional feature visibility:

```txt
table UI -> table/floor/table service entitlement
Send to Kitchen -> restaurant_kitchen_ops/kitchen_ops entitlement
KDS/prep queue -> KDS/order queue entitlement
Split bill -> payments_split_bill or payments_split_payment entitlement
Partial payment -> payments_partial_payment entitlement
Multi payment -> payments_multi_payment entitlement
```

If exact entitlement keys differ, use existing SOT and document mapping.

## Tests required

### Resolver tests

Add/update tests for every discovered business type code.

Minimum cases:

```txt
RETAIL_MINIMARKET -> base retail/core, not premium add-on mode
retail -> base retail/core
minimarket -> base retail/core
store -> base retail/core
CAFE_RESTAURANT -> food_beverage/cafe_restaurant, not restaurant_table_service
restaurant -> food_beverage/cafe_restaurant, not restaurant_table_service
cafe -> food_beverage/cafe_restaurant, not mandatory cafe_counter premium mode
quick_service -> food_beverage/quick base, not unsupported
laundry -> service/core, not unsupported
SERVICE_APPOINTMENT -> service/core, not unsupported
unknown/null -> core fallback or documented null -> CoreStandardPOSFlow fallback
```

### POS root routing tests

```txt
retail/minimarket profile -> core/retail flow
cafe_restaurant/restaurant/cafe/quick_service -> food/core flow, not unsupported
service/laundry -> core/service flow, not unsupported
unknown/null -> core fallback, not blocked
```

### Entitlement capability tests

If helper created:

```txt
no entitlements -> core POS still allowed
table entitlement -> table controls enabled
kitchen entitlement -> send-to-kitchen enabled
split entitlement -> split bill enabled
partial entitlement -> partial payment enabled
orders_queue absent -> full payment still allowed
```

### UI/component tests if harness exists

```txt
Cafe/restaurant without entitlements renders product/cart/payment but no table/kitchen/KDS.
Cafe/restaurant with table+kitchen entitlements renders table/kitchen controls.
Retail still has no table/kitchen controls.
Service/laundry does not render UnsupportedPOSFlow.
```

If component harness is unavailable, document manual smoke.

## Manual smoke checklist

Run if possible and document:

```txt
1. New cafe/restaurant tenant without paid entitlements can open POS, add product, pay cash/full payment, receipt works.
2. Same tenant does not see table/kitchen/KDS/split/partial controls without entitlement.
3. Cafe/restaurant tenant with table/kitchen entitlements sees table/kitchen controls and can Send to Kitchen.
4. Retail tenant still can fast checkout and does not see table/kitchen controls.
5. Quick service tenant can use core POS and is not Unsupported.
6. Laundry/service tenant can use core POS and is not Unsupported.
7. Unknown/missing business type does not block checkout; core fallback works or safe setup message is shown according to documented rule.
8. Full payment works without orders_queue.
```

## Cleanup requirements

P5 deleted legacy mixed POS runtime. P5.1 must not reintroduce it.

Check:

```bash
rg -n "GenericPOSPage|restaurant_table_service.*businessType|businessType.*restaurant_table_service|UnsupportedPOSFlow|features/pos/services|features/pos/mappers|plan.*businessProfile|orders_queue.*payment" apps packages shared roadmap docs
```

Required outcomes:

```txt
- No business type default maps to paid entitlement mode.
- No valid business type routes to Unsupported as default.
- No plan/entitlement absence is used to decide business type/profile.
- No GenericPOSPage reintroduced.
- No old compatibility shims reintroduced.
```

## Required report

Create:

```txt
roadmap/business-flows/P5_1_business_type_entitlement_model_correction_report.md
```

Report must include:

```txt
1. Summary
2. Files changed/deleted/renamed
3. All discovered business type codes
4. Old mapping vs corrected mapping
5. Base POS routing matrix after P5.1
6. Entitlement capability matrix
7. Proof no business type is blocked from core POS by missing paid entitlement
8. Proof restaurant/cafe is not default table-service anymore
9. Proof quick/service/laundry are not Unsupported by default
10. Tests and validation output
11. Manual smoke result or not-run statement
12. Remaining risks/deferred paid capability work
13. Recommended next phase
```

Update:

```txt
roadmap/business-flows/main.md
PLANS.md
P4.1/P5 prompt checklist if applicable
```

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

Also run the cleanup grep commands listed above and document exact findings.

## Completion checklist

- [x] All existing business type codes audited from registration/SOT/codebase.
- [x] Business type no longer maps to paid operational mode by default.
- [x] Cafe/restaurant no longer maps directly to mandatory `restaurant_table_service`.
- [x] Quick/service/laundry are not Unsupported by default.
- [x] Core POS baseline exists for every valid business type.
- [x] POS root routes by base business category/family, not entitlement mode.
- [x] Table service is entitlement/capability, not profile upgrade.
- [x] Kitchen/KDS is entitlement/capability, not profile upgrade.
- [x] Split/partial/multi payment are entitlements, not profile upgrades.
- [x] Full payment/cash remains available without paid addons.
- [x] No orders_queue payment requirement introduced.
- [x] No plan name hardcoding introduced.
- [x] No GenericPOSPage or legacy mixed runtime reintroduced.
- [x] Tests/validation documented.
- [x] P5.1 report created.

## Commit

```txt
fix(pos): separate business type routing from entitlement capabilities
```
