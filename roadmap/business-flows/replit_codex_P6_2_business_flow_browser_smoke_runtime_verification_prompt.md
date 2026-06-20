# Replit/Codex Prompt P6.2 — Business Flow Browser Smoke + Runtime Verification

Repository: `Rndynt/AuraPoS`

## Goal

Verify the current POS business-flow runtime in browser/manual smoke after P5.1, P6, and P6.1.

This phase is not a feature build and not another refactor. It is a runtime verification phase to prove the POS route, baseline checkout, entitlement separation, and cashier UI are actually correct in a running app.

Current intended routing:

```txt
retail_standard -> RetailStandardPOSFlow
food_beverage -> FoodBeveragePOSFlow
service -> ServiceCorePOSFlow
core_standard/null/unknown -> CoreStandardPOSFlow
```

The core baseline must remain:

```txt
Product/catalog -> Cart -> Full payment/cash -> Receipt
```

No baseline checkout should require paid entitlements such as order queue, table service, kitchen, split bill, partial payment, or multi-payment.

## Read first

```txt
roadmap/business-flows/P5_1_business_type_entitlement_model_correction_report.md
roadmap/business-flows/P6_food_beverage_service_core_flows_report.md
roadmap/business-flows/P6_1_cashier_ui_cleanup_report.md
apps/pos-terminal-web/src/features/pos-flows/root/**
apps/pos-terminal-web/src/features/pos-flows/retail/**
apps/pos-terminal-web/src/features/pos-flows/food-beverage/**
apps/pos-terminal-web/src/features/pos-flows/service/**
apps/pos-terminal-web/src/features/pos-flows/core/**
apps/pos-terminal-web/src/hooks/api/useEntitlements.ts
packages/application/business-flows/resolveBusinessProfile.ts
packages/application/business-flows/resolveBusinessCapabilities.ts
```

## Scope

Allowed:

```txt
- Add smoke checklist docs.
- Add small browser/runtime smoke helper if the project already has an accepted pattern.
- Add lightweight route/debug instrumentation only if safe and not shown to normal cashier users.
- Add test seed notes for tenant/business type combinations.
- Fix small bugs discovered during smoke if they are directly related to routing, checkout, or hidden debug panels.
- Create report with pass/fail evidence.
```

Forbidden:

```txt
- Do not build new paid feature panels.
- Do not implement restaurant table service enhancements.
- Do not change business type mapping unless smoke proves a bug.
- Do not reintroduce GenericPOSPage.
- Do not reintroduce old features/pos/services or features/pos/mappers shims.
- Do not make orders_queue required for payment.
- Do not show raw entitlement/internal debug copy in cashier UI.
- Do not rewrite payment engine, NorthFlow, schema, or migrations.
```

## Required smoke scenarios

Create a report and verify these runtime paths.

### 1. Retail baseline

Tenant/business type:

```txt
RETAIL_MINIMARKET or equivalent retail test tenant
```

Expected:

```txt
- POS routes to RetailStandardPOSFlow.
- Product/catalog visible.
- Add item to cart works.
- Full payment/cash works.
- Receipt behavior remains available.
- No kitchen/table/debug capability panel appears.
- No raw entitlement keys are visible.
- Payment does not require orders_queue.
```

### 2. Food & Beverage baseline without paid entitlements

Tenant/business type:

```txt
CAFE_RESTAURANT or restaurant/cafe test tenant
```

Expected:

```txt
- POS routes to FoodBeveragePOSFlow.
- Product/catalog visible.
- Add item to cart works.
- Full payment/cash works.
- Receipt behavior remains available.
- No Food & Beverage debug panel appears.
- No mandatory table selection.
- No mandatory kitchen/KDS flow.
- No raw entitlement keys are visible.
- Payment does not require orders_queue, table service, kitchen ops, split bill, or partial payment.
```

### 3. Service baseline without paid entitlements

Tenant/business type:

```txt
LAUNDRY or SERVICE_APPOINTMENT test tenant
```

Expected:

```txt
- POS routes to ServiceCorePOSFlow.
- Product/service catalog visible if seeded.
- Add item/service to cart works.
- Full payment/cash works.
- Receipt behavior remains available.
- No Service mode debug panel appears.
- No appointment/progress module is required.
- No raw entitlement keys are visible.
```

### 4. Core fallback

Tenant/profile state:

```txt
core_standard, null, unknown, or missing business profile in controlled test
```

Expected:

```txt
- POS routes to CoreStandardPOSFlow.
- Checkout is not blocked solely because profile is null/unknown.
- No UnsupportedPOSFlow is shown for normal fallback.
- No debug entitlement panel appears.
```

### 5. Capability separation check

For a food/beverage tenant with optional entitlements toggled if practical:

```txt
restaurant_table_service
restaurant_kitchen_ops
orders_queue
payments_partial_payment
payments_multi_payment
payments_split_bill or payments_split_payment
```

Expected:

```txt
- Optional controls appear only if there is safe runtime support.
- If optional runtime is not implemented, it must remain hidden or safely disabled.
- Full payment/cash remains available regardless of these entitlements.
```

## Required automated checks

Run:

```bash
pnpm --filter @pos/terminal-web type-check
pnpm --filter @pos/terminal-web test
pnpm type-check
```

If practical, also run:

```bash
pnpm --filter @pos/domain type-check
pnpm --filter @pos/application type-check
pnpm --filter @pos/api type-check
pnpm --filter @pos/application test
pnpm --filter @pos/api test
```

Run cleanup/guard checks:

```bash
rg -n "Food & Beverage mode|Service mode|Table & floor service|Kitchen / KDS|Entitlement aktif|Baseline:" apps/pos-terminal-web/src/features/pos-flows
rg -n "GenericPOSPage|features/pos/services|features/pos/mappers" apps/pos-terminal-web/src
```

Expected:

```txt
No cashier runtime debug copy.
No GenericPOSPage or old compatibility shim imports.
```

## Browser/manual evidence requirements

If a browser environment is available, capture evidence in the report:

```txt
- route/profile being tested;
- visible POS flow behavior;
- checkout result;
- whether receipt/payment succeeded;
- whether debug panels/raw entitlement keys were absent;
- screenshots if available, or detailed manual notes if screenshots are not supported.
```

If browser smoke cannot be run, the report must say so clearly and list the automated validation that was run instead. Do not claim browser smoke passed if it was not run.

## Required report

Create:

```txt
roadmap/business-flows/P6_2_business_flow_browser_smoke_runtime_verification_report.md
```

Report must include:

```txt
1. Summary
2. Environment used
3. Test tenant/business type matrix
4. Routing verification matrix
5. Retail smoke result
6. Food & Beverage smoke result
7. Service smoke result
8. Core fallback smoke result
9. Capability separation result
10. Cashier UI debug-copy verification
11. Automated validation output
12. Bugs found and fixes made, if any
13. Manual smoke not-run statement, if applicable
14. Recommended next phase
```

Update:

```txt
roadmap/business-flows/main.md
PLANS.md
```

if the repo uses these for progress tracking.

## Completion checklist

- [ ] Retail route smoke documented.
- [ ] Food & Beverage route smoke documented.
- [ ] Service route smoke documented.
- [ ] Core fallback route smoke documented.
- [ ] Full payment/cash verified not to require orders_queue.
- [ ] Debug/capability panel absence verified.
- [ ] Raw entitlement keys absence verified.
- [ ] Automated validation documented.
- [ ] Any found bug fixed or documented with exact blocker.
- [ ] P6.2 report created.

## Commit

```txt
test(pos): verify business flow runtime smoke
```
