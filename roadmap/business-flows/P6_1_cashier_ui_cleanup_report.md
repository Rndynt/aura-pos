# P6.1 Cashier UI Cleanup Report

Date: 2026-06-20

## 1. Summary

P6.1 removes the remaining internal capability explanation panels from cashier POS runtime exports and deletes their unused component files. The active Food & Beverage and Service runtime components now stay focused on the shared checkout composition: product/catalog → cart → full payment/cash → receipt.

The capability resolver logic remains intact for future real, entitlement-gated controls. No product model, payment engine, tenant resolver, backend API, schema, migration, NorthFlow, GenericPOSPage, or old compatibility shim changes were made.

Additional finding from the cleanup: the main F&B and Service flow components were already clean before this batch, but the panel files still existed and were re-exported from feature barrel files. That made the debug/capability UI easy to reintroduce accidentally and kept forbidden cashier copy inside active source scope.

## 2. Files changed/deleted

Changed:

- `apps/pos-terminal-web/src/features/pos-flows/food-beverage/index.ts` — removed the `FoodBeverageOptionalPanels` barrel export.
- `apps/pos-terminal-web/src/features/pos-flows/service/index.ts` — removed the `ServiceOptionalPanels` barrel export.
- `apps/pos-terminal-web/src/features/pos-flows/__tests__/cashierCopyGuard.test.ts` — added a source-level guard for cashier runtime component copy.
- `apps/pos-terminal-web/package.json` — added the cashier copy guard to the terminal-web test script.
- `roadmap/business-flows/replit_codex_P6_1_cashier_ui_cleanup_prompt.md` — updated the completion checklist.
- `PLANS.md` — added and completed the P6.1 execution plan.

Deleted:

- `apps/pos-terminal-web/src/features/pos-flows/food-beverage/FoodBeverageOptionalPanels.tsx`
- `apps/pos-terminal-web/src/features/pos-flows/service/ServiceOptionalPanels.tsx`

Created:

- `roadmap/business-flows/P6_1_cashier_ui_cleanup_report.md`

## 3. Why the panel was wrong for cashier users

The deleted panels described entitlement/capability internals such as table service, KDS, queue, split bill, partial payment, and baseline notes. That copy was useful as implementation documentation, but it was not cashier UX.

Cashier-facing POS should show operational controls needed to sell: catalog/product selection, cart, payment, and receipt. Internal entitlement keys and implementation status copy can confuse cashiers, expose implementation concepts, and suggest unavailable paid capabilities are part of the active transaction flow.

## 4. Runtime UI after cleanup

Runtime F&B and Service components directly render the checkout composition through `RetailStandardPOSFlowView`:

- `FoodBeveragePOSFlow` calls `useFoodBeveragePOSFlow()` and returns `<RetailStandardPOSFlowView flow={flow} />`.
- `ServiceCorePOSFlow` calls `useServiceCorePOSFlow()` and returns `<RetailStandardPOSFlowView flow={flow} />`.

The baseline remains:

```txt
Product/catalog -> Cart -> Full payment/cash -> Receipt
```

Optional paid capabilities remain represented in capability data for future safe controls, but no debug explanation panel is mounted in cashier runtime.

## 5. Regression guard/test result

Added `cashierCopyGuard.test.ts`. It scans only cashier runtime component source files, not docs/reports/tests, and fails if internal/debug panel phrases are found in those runtime components.

Result:

```txt
cashierCopyGuard: no internal/debug capability copy in cashier runtime components
```

## 6. Cleanup grep findings

Commands run:

```bash
rg -n "FoodBeverageOptionalPanels|ServiceOptionalPanels" apps/pos-terminal-web/src packages apps/api/src
rg -n "Food & Beverage mode|Service mode|Table & floor service|Kitchen / KDS|Order queue|DP / partial payment|Entitlement aktif|Baseline:" apps/pos-terminal-web/src/features/pos-flows
rg -n "GenericPOSPage|features/pos/services|features/pos/mappers" apps/pos-terminal-web/src
```

Findings:

- No active source references remain for `FoodBeverageOptionalPanels` or `ServiceOptionalPanels`.
- No forbidden debug capability panel copy remains under `apps/pos-terminal-web/src/features/pos-flows`.
- No `GenericPOSPage`, old `features/pos/services`, or old `features/pos/mappers` compatibility shims were introduced in terminal-web source.

## 7. Validation output

Required validation:

```bash
pnpm --filter @pos/terminal-web type-check
pnpm --filter @pos/terminal-web test
pnpm type-check
```

All required validation passed.

Additional validation:

```bash
pnpm --filter @pos/domain type-check
pnpm --filter @pos/application type-check
pnpm --filter @pos/api type-check
pnpm --filter @pos/application test
pnpm --filter @pos/api test
```

All additional validation passed.

## 8. Manual smoke result or not-run statement

Manual browser smoke was not run in this non-interactive environment. Automated tests, type-checks, and cleanup grep checks validate that the debug panels are not in runtime source and that the baseline flow policy still allows create-and-pay without optional entitlements.

Recommended manual smoke before release:

1. CAFE_RESTAURANT tenant opens POS and sees no Food & Beverage debug panel.
2. Product search/category/cart/payment still work.
3. Full cash payment works without `orders_queue`.
4. Retail tenant opens normal POS with no kitchen/table/debug panel.
5. Service/laundry tenant opens POS with no Service mode debug panel.
6. core_standard/null/unknown still opens checkout fallback.

## 9. Remaining risks / next recommended phase

- Future F&B/service paid capability controls must be implemented as real cashier controls only when both runtime support and entitlement are active.
- Browser smoke with real tenants and entitlement combinations is still required before production release.
- Keep the source guard scoped to runtime components; if new runtime component files are added for F&B/service/core checkout, add them to the guard list.
