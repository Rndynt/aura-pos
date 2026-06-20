# Replit/Codex Prompt P6.1 — Cashier UI Cleanup

Repository: `Rndynt/AuraPoS`

## Goal

Clean the cashier-facing POS UI after P6.

The large informational panels added in P6 for Food & Beverage and Service capability explanation must not appear in the cashier POS screen. Cashier users should see the POS checkout interface, not internal entitlement/capability explanations.

The user-facing baseline must stay:

```txt
Product/catalog -> Cart -> Full payment/cash -> Receipt
```

Optional paid capabilities should become real controls only when they are implemented safely and entitlement is active. Internal entitlement keys must not be rendered as cashier copy.

## Read first

```txt
roadmap/business-flows/P5_1_business_type_entitlement_model_correction_report.md
roadmap/business-flows/P6_food_beverage_service_core_flows_report.md
apps/pos-terminal-web/src/features/pos-flows/food-beverage/**
apps/pos-terminal-web/src/features/pos-flows/service/**
apps/pos-terminal-web/src/features/pos-flows/core/**
apps/pos-terminal-web/src/features/pos-flows/retail/**
apps/pos-terminal-web/src/features/pos-flows/root/**
apps/pos-terminal-web/src/features/pos-flows/shared/resolvePOSFlowCapabilities.ts
packages/application/business-flows/resolveBusinessCapabilities.ts
```

## Problem

Food & Beverage POS displayed an internal capability panel such as:

```txt
Food & Beverage mode
Table & floor service
Kitchen / KDS
Order queue
Split bill
DP / partial payment
Multi payment
```

This is not cashier UX. It is implementation/debug documentation and must be removed from active runtime.

## Required work

### 1. Confirm runtime is clean

These flows should directly render checkout composition without capability explanation panels:

```txt
apps/pos-terminal-web/src/features/pos-flows/food-beverage/FoodBeveragePOSFlow.tsx
apps/pos-terminal-web/src/features/pos-flows/service/ServiceCorePOSFlow.tsx
```

Expected shape:

```tsx
export function FoodBeveragePOSFlow() {
  const flow = useFoodBeveragePOSFlow();
  return <RetailStandardPOSFlowView flow={flow} />;
}

export function ServiceCorePOSFlow() {
  const flow = useServiceCorePOSFlow();
  return <RetailStandardPOSFlowView flow={flow} />;
}
```

Equivalent clean composition is fine.

### 2. Delete unused panel files if no active import remains

Delete if unused:

```txt
apps/pos-terminal-web/src/features/pos-flows/food-beverage/FoodBeverageOptionalPanels.tsx
apps/pos-terminal-web/src/features/pos-flows/service/ServiceOptionalPanels.tsx
```

Do not delete capability resolver logic. Keep these for future real controls:

```txt
apps/pos-terminal-web/src/features/pos-flows/shared/resolvePOSFlowCapabilities.ts
packages/application/business-flows/resolveBusinessCapabilities.ts
```

### 3. Add regression guard

Add a small test that prevents internal/debug capability panel copy from returning to cashier runtime components.

Suggested file:

```txt
apps/pos-terminal-web/src/features/pos-flows/__tests__/cashierCopyGuard.test.ts
```

The test should check cashier runtime component source files and fail if these user-facing debug phrases reappear:

```txt
Food & Beverage mode
Service mode
Table & floor service
Kitchen / KDS
Order queue
DP / partial payment
Entitlement aktif
Baseline:
```

Scope the test only to runtime component files, not reports/docs/tests.

### 4. Do not change product model

Keep the P5.1 model:

```txt
businessType = tenant category
base POS flow = always available checkout
entitlements = optional capabilities
```

Do not remap restaurant/cafe back to table-service mode.

Do not make full payment depend on queue, kitchen, table, split, or partial-payment entitlements.

## Forbidden

```txt
- Do not reintroduce GenericPOSPage.
- Do not reintroduce old features/pos/services or features/pos/mappers shims.
- Do not hide full payment/cash behind entitlement.
- Do not make orders_queue required for payment.
- Do not add raw entitlement/debug copy to cashier UI.
- Do not rewrite payment engine or NorthFlow.
- Do not add schema/migrations.
```

## Required report

Create:

```txt
roadmap/business-flows/P6_1_cashier_ui_cleanup_report.md
```

Report must include:

```txt
1. Summary
2. Files changed/deleted
3. Why the panel was wrong for cashier users
4. Runtime UI after cleanup
5. Regression guard/test result
6. Cleanup grep findings
7. Validation output
8. Manual smoke result or not-run statement
9. Remaining risks / next recommended phase
```

## Validation commands

Run:

```bash
pnpm --filter @pos/terminal-web type-check
pnpm --filter @pos/terminal-web test
pnpm type-check
```

If time allows also run:

```bash
pnpm --filter @pos/domain type-check
pnpm --filter @pos/application type-check
pnpm --filter @pos/api type-check
pnpm --filter @pos/application test
pnpm --filter @pos/api test
```

Run cleanup checks and document results:

```bash
rg -n "FoodBeverageOptionalPanels|ServiceOptionalPanels" apps/pos-terminal-web/src packages apps/api/src
rg -n "Food & Beverage mode|Service mode|Table & floor service|Kitchen / KDS|Order queue|DP / partial payment|Entitlement aktif|Baseline:" apps/pos-terminal-web/src/features/pos-flows
```

Expected:

```txt
No active runtime references to the removed panels.
No debug capability panel copy in cashier runtime components.
```

## Manual smoke checklist

Run in browser if possible:

```txt
1. CAFE_RESTAURANT tenant opens POS.
2. No large Food & Beverage mode panel is visible.
3. Product search/category/cart/payment still work.
4. Full cash payment works without orders_queue.
5. Retail tenant still opens normal POS with no kitchen/table/debug panel.
6. Service/laundry tenant opens POS with no Service mode debug panel.
7. core_standard/null/unknown still opens checkout fallback.
```

If browser smoke cannot be run, say so clearly and rely on tests/grep proof.

## Completion checklist

- [x] FoodBeverageOptionalPanels removed from runtime.
- [x] ServiceOptionalPanels removed from runtime.
- [x] Unused internal panel files deleted if safe.
- [x] Regression guard/test added.
- [x] Core checkout remains available for food_beverage/service/core/retail.
- [x] Full payment/cash remains available without orders_queue.
- [x] No GenericPOSPage or old compatibility shims reintroduced.
- [x] P6.1 report created.
- [x] Validation documented.

## Commit

```txt
fix(pos): remove internal capability panels from cashier flows
```
