# Entitlement Phase 2 — End-to-End Legacy Cleanup and UI Gating Alignment

## Context

Phase 1 created the new entitlement foundation:

```txt
packages/application/entitlements/entitlementCatalog.ts
packages/application/entitlements/entitlementEngine.ts
tenant_entitlements table
```

Phase 1B corrected the SOT scope so `entitlementCatalog.ts` contains only real commercial tenant entitlements, not base POS/order/catalog/payment primitives.

However, the codebase still has old entitlement/feature/module systems in active code paths. This phase must remove them end-to-end, not partially.

Known active legacy areas from repo inspection include:

```txt
apps/pos-terminal-web/src/lib/featureCatalog.ts
apps/pos-terminal-web/src/__tests__/hub-sidebar-gating.test.ts
apps/api/src/constants/planFeatureMap.ts
packages/application/tenants/businessTypeTemplates.ts
active references to tenantFeatures / tenant_features
active references to tenantModuleConfigs / tenant_module_configs
active references to enableInventory / enableInventoryAdvanced / enable_table_management / enable_kitchen_ticket / enable_multi_location
frontend/sidebar/hub/menu gating based on old MODULE_REQUIRED_PLAN / FEATURE_REQUIRED_PLAN / moduleConfig / activeFeatures
```

This must be cleaned in one Phase 2 execution.

## Objective

Execute **Entitlement Phase 2 — End-to-End Legacy Cleanup and UI Gating Alignment**.

Goal:

```txt
1. Fully remove active runtime/code references to tenant_features.
2. Fully remove active runtime/code references to tenant_module_configs.
3. Fully remove active commercial gating references to enableInventory / enableInventoryAdvanced / enable_table_management / enable_kitchen_ticket / enable_multi_location.
4. Delete or replace old frontend featureCatalog.ts hardcode.
5. Ensure marketplace reads only from entitlementCatalog.ts / backend entitlement catalog API.
6. Ensure sidebar, hub menu, bottom nav, and page-level frontend gating use effective entitlement codes only.
7. Ensure backend API guards use entitlementEngine + tenant_entitlements + entitlementCatalog only.
8. Ensure registration uses entitlementCatalog.ts only.
9. Ensure no duplicate SOT remains.
10. Keep Phase 1B commercial-only entitlement list intact.
```

## Non-negotiable execution rule

This phase must be completed as a single coherent cleanup.

Do not split into:

```txt
Phase 2A
Phase 2B
mini patch
follow-up patch
later frontend patch
later marketplace patch
later sidebar patch
```

If a file is part of entitlement/feature/module/plan/marketplace/sidebar/hub access behavior, it is in scope for this phase.

Do not stop after backend cleanup while leaving frontend hardcode active.

Do not stop after SOT cleanup while leaving sidebar/hub/menu gating on old module flags.

Do not leave `featureCatalog.ts` as an active independent SOT.

Do not leave `phase_2_report.md` saying "remaining Phase 3 blocker" for active legacy gating unless there is a hard external blocker that makes completion impossible. A normal refactor cascade is not a blocker; fix it.

## Non-negotiable architecture rules

Do not recreate legacy compatibility mapping.

Do not restore `tenant_features`.

Do not restore `tenant_module_configs`.

Do not add projection tables.

Do not add runtime self-heal.

Do not add resolver repair logic.

Do not put base POS operations back into entitlement catalog.

Do not split inventory back into granular commercial entitlements.

Do not add catalog/order/payment/base receipt as commercial entitlements.

Do not duplicate SOT in other files.

Do not hide old references by renaming variables while preserving old behavior.

Do not keep wrappers with independent hardcoded feature/module config.

Do not keep frontend `PLAN_RANK`, `MODULE_CATALOG_DATA`, `FEATURE_CATALOG_DATA`, `MODULE_REQUIRED_PLAN`, or `FEATURE_REQUIRED_PLAN` as independent data.

## Single SOT

The only SOT remains:

```txt
packages/application/entitlements/entitlementCatalog.ts
```

The allowed Phase 1B commercial entitlement list remains exactly:

```txt
inventory_basic_stock
inventory_advanced_stock
payments_partial_payment
payments_multi_payment
payments_split_payment
receipt_compact
orders_queue
restaurant_table_service
restaurant_kitchen_ops
reports_advanced
reports_export
multi_location
hardware_label_printer
hardware_barcode_scanner
integrations_payment_gateway
integrations_accounting
integrations_webhook
integrations_api_access
```

Do not add base operation codes such as:

```txt
orders_open_order
orders_cancel
orders_void
orders_refund
catalog_products
catalog_categories
catalog_variants
catalog_options
catalog_sku
catalog_barcode
payments_cash
payments_manual_qris
payments_manual_bank_transfer
receipt_standard
receipt_reprint
inventory_stock_adjustment
inventory_stock_movement_history
inventory_stock_opname
inventory_stock_transfer
inventory_low_stock_alert
inventory_reports
hardware_receipt_printer
hardware_cash_drawer
```

## Required audit before editing

Run these before editing and save summarized results for the report:

```bash
rg -n "tenantFeatures|tenant_features|tenantModuleConfigs|tenant_module_configs|enableInventory|enableInventoryAdvanced|enable_inventory|enable_inventory_advanced|enable_table_management|enable_kitchen_ticket|enable_multi_location|resolveBasicStockEntitlement|repairBasicStockEntitlement|BASIC_STOCK_DEFAULT_PLAN_TIERS" apps packages shared migrations docs roadmap

rg -n "planFeatureMap|PLAN_FEATURE_MAP|businessTypeTemplates|BUSINESS_TYPE_TEMPLATES|featureCatalog|MODULE_CATALOG_DATA|FEATURE_CATALOG_DATA|MODULE_REQUIRED_PLAN|FEATURE_REQUIRED_PLAN|PLAN_RANK|moduleConfig|activeFeatures|hasModule|hasFeature|useFeatures" apps packages shared migrations docs roadmap

rg -n "orders_open_order|orders_cancel|orders_void|orders_refund|catalog_products|catalog_categories|catalog_variants|catalog_options|catalog_sku|catalog_barcode|payments_cash|payments_manual_qris|payments_manual_bank_transfer|receipt_standard|receipt_reprint|inventory_stock_adjustment|inventory_stock_movement_history|inventory_stock_opname|inventory_stock_transfer|inventory_low_stock_alert|inventory_reports|hardware_receipt_printer|hardware_cash_drawer" apps packages shared migrations docs roadmap
```

Classify every match into:

```txt
active runtime code
active frontend gating code
active schema/migration
active test
historical docs/report reference
```

Only historical docs/report references and explicit tests proving absence may remain.

## Part A — Schema cleanup

Inspect:

```txt
packages/infrastructure/db/schema/tenants.schema.ts
packages/infrastructure/db/schema/index.ts
packages/infrastructure/db/schema/**
shared/schema.ts if applicable
```

Remove active Drizzle schema definitions for:

```txt
tenantFeatures
tenantModuleConfigs
```

Remove associated insert/select schemas and exported types:

```txt
insertTenantFeatureSchema
selectTenantFeatureSchema
TenantFeature
InsertTenantFeature
insertTenantModuleConfigSchema
selectTenantModuleConfigSchema
TenantModuleConfig
InsertTenantModuleConfig
```

Keep only:

```txt
tenants
businessTypes
tenantEntitlements
```

Ensure the schema barrel exports only the current entitlement table, not old tables.

## Part B — Migration cleanup

Confirm `migrations/0022_single_tenant_entitlements.sql` is complete and destructive:

```txt
creates tenant_entitlements
drops tenant_features
drops tenant_module_configs
```

No later migration may recreate or reference:

```txt
tenant_features
tenant_module_configs
```

If migration code/docs still describe old tables as active, update them.

Historical migration comments are allowed only if they clearly describe dropped/removed tables.

## Part C — Backend runtime cleanup

Find and remove imports/usages of:

```txt
tenantFeatures
tenantModuleConfigs
enableInventory
enableInventoryAdvanced
```

Replace commercial access checks with entitlement engine usage:

```ts
await requireTenantEntitlement({
  tenantId: req.tenantId!,
  entitlementCode: "inventory_basic_stock",
});
```

or equivalent that calls `requireEntitlement` / `hasEntitlement` from the shared entitlement engine.

Disallowed runtime patterns:

```ts
tenantModuleConfigs.enableInventory
tenantModuleConfigs.enableInventoryAdvanced
tenantFeatures.featureCode
if (enableInventory) {}
if (enableInventoryAdvanced) {}
```

Routes/services/controllers that must be verified and cleaned:

```txt
apps/api/src/http/routes/inventory.ts
apps/api/src/http/controllers/TenantsController.ts
apps/api/src/services/registrationService.ts
apps/api/src/routes.ts
apps/api/src/middleware/**
apps/api/src/services/**
apps/api/src/repositories/**
apps/api/src/storage/**
```

If a route needs commercial access gating, use entitlement code.

If a route is base functionality, remove commercial entitlement gating.

Order open/cancel/void/refund and catalog CRUD must not be commercially entitlement-gated in this phase.

## Part D — Registration cleanup

Registration must use only:

```txt
ENTITLEMENT_CATALOG.businessTypes
ENTITLEMENT_CATALOG.plans
entitlementEngine helpers
```

Registration must not insert or update:

```txt
tenant_features
tenant_module_configs
```

Registration must not persist plan-default or business-default entitlements into DB.

Tenant registration should set:

```txt
tenants.planTier
tenants.businessType
normal tenant/outlet/business setup
```

Default entitlements are derived from SOT at runtime.

Expected behavior:

```txt
New starter tenant with businessType RETAIL_MINIMARKET has inventory_basic_stock through effective entitlement calculation, without tenant_entitlements row.
```

## Part E — Entitlement API contract

Add or standardize backend endpoint(s) for frontend consumption.

Preferred endpoint:

```txt
GET /api/me/entitlements
```

or if existing tenant profile endpoint is used, it must include the same shape.

Required response shape:

```json
{
  "tenant": {
    "id": "...",
    "planTier": "starter",
    "businessType": "RETAIL_MINIMARKET"
  },
  "entitlements": {
    "inventory_basic_stock": true,
    "inventory_advanced_stock": false,
    "orders_queue": false,
    "restaurant_kitchen_ops": false,
    "multi_location": false
  },
  "catalog": {
    "plans": {},
    "entitlements": {},
    "offers": {},
    "businessTypes": {}
  }
}
```

The frontend must not reconstruct plan hierarchy from a separate frontend catalog.

The frontend must consume backend/effective entitlements or a shared package import from the same SOT.

## Part F — Frontend SOT cleanup

Delete or replace:

```txt
apps/pos-terminal-web/src/lib/featureCatalog.ts
```

It must not remain as an active independent SOT.

If a file with that name remains for import stability, it must be a thin adapter generated from `packages/application/entitlements/entitlementCatalog.ts` or API response types only, with no hardcoded:

```txt
PLAN_RANK
MODULE_CATALOG_DATA
FEATURE_CATALOG_DATA
MODULE_REQUIRED_PLAN
FEATURE_REQUIRED_PLAN
free/growth/pro duplicate plan ranking
moduleConfigKey
featureCode plan hardcode
```

Preferred outcome:

```txt
Remove featureCatalog.ts entirely and replace usages with entitlement-aware hooks/helpers.
```

## Part G — Frontend hooks/context cleanup

Find and refactor:

```txt
useFeatures
TenantContext.hasModule
TenantContext moduleConfig
hasFeature
hasModule
activeFeatures
moduleConfig
```

Create/standardize one frontend access helper:

```txt
useEntitlements()
can(entitlementCode)
requireEntitlementForPage(entitlementCode)
```

It must use effective entitlements from backend or shared entitlement engine/SOT, not frontend hardcode.

Allowed frontend check examples:

```ts
can("inventory_basic_stock")
can("inventory_advanced_stock")
can("restaurant_table_service")
can("restaurant_kitchen_ops")
can("multi_location")
can("reports_advanced")
```

Disallowed frontend checks:

```ts
hasModule("enable_inventory")
hasModule("enable_kitchen_ticket")
hasModule("enable_table_management")
hasModule("enable_multi_location")
hasFeature("inventory_reports")
hasFeature("analytics_dashboard")
planAllows(plan, "growth")
MODULE_REQUIRED_PLAN[...]
FEATURE_REQUIRED_PLAN[...]
```

## Part H — Sidebar, hub menu, bottom nav, and page guard cleanup

Audit and update all navigation and page visibility code, especially:

```txt
apps/pos-terminal-web/src/components/pos/Sidebar.tsx
apps/pos-terminal-web/src/components/layout/MainLayout.tsx
apps/pos-terminal-web/src/components/navigation/** if present
apps/pos-terminal-web/src/components/**/UnifiedBottomNav.tsx if present
apps/pos-terminal-web/src/pages/home.tsx or src/features/**/home.tsx if present
apps/pos-terminal-web/src/features/**
apps/pos-terminal-web/src/routes/** if present
```

Required mapping:

```txt
Inventory / stock menu -> inventory_basic_stock
Advanced inventory / movements / reports -> inventory_advanced_stock
Orders queue menu -> orders_queue
Restaurant table / floor layout menu -> restaurant_table_service
Kitchen / KDS / kitchen printer menu -> restaurant_kitchen_ops
Advanced reports / analytics -> reports_advanced
Export report -> reports_export
Multi location menu -> multi_location
Payment gateway settings -> integrations_payment_gateway
Webhook/API settings -> integrations_webhook / integrations_api_access
Compact receipt settings -> receipt_compact
Label printer -> hardware_label_printer
Barcode scanner -> hardware_barcode_scanner
```

Base pages must remain visible/usable without commercial entitlement:

```txt
Catalog/products/categories base CRUD
Order open/create/cancel/void/refund lifecycle
Cash/manual payment base behavior
Standard receipt/reprint base behavior
```

Do not hide base POS with commercial entitlement checks.

## Part I — Marketplace cleanup

Marketplace must read from:

```txt
ENTITLEMENT_CATALOG.plans
ENTITLEMENT_CATALOG.entitlements
ENTITLEMENT_CATALOG.offers
ENTITLEMENT_CATALOG.businessTypes[*].recommendedEntitlements
```

or from backend API exposing the same data.

Marketplace must not use:

```txt
apps/pos-terminal-web/src/lib/featureCatalog.ts hardcoded catalog
MODULE_CATALOG_DATA
FEATURE_CATALOG_DATA
old module config flags
old feature code arrays
```

Marketplace behavior:

```txt
1. Show plans from SOT.
2. Show add-on offers from SOT.
3. Do not show base operations as purchasable features.
4. Do not allow purchase if entitlement already included by cumulative plan.
5. Enforce offer.requiredPlan using SOT plan sortOrder.
6. For expired/cancelled tenant_entitlements, show as not active.
```

## Part J — Seeds and tests cleanup

Remove seed/test fixture reliance on:

```txt
tenant_features
tenant_module_configs
enable_inventory
enable_inventory_advanced
enableInventory
enableInventoryAdvanced
moduleConfig
activeFeatures
```

Seed tenants should only set:

```txt
planTier
businessType
```

If a test needs an active purchased addon, seed:

```txt
tenant_entitlements
```

If a test needs default plan/business entitlement, do not seed DB rows; assert engine derives it from SOT.

## Part K — Required tests

Update or replace:

```txt
apps/pos-terminal-web/src/__tests__/hub-sidebar-gating.test.ts
```

That test currently mirrors old `featureCatalog.ts`, `MODULE_REQUIRED_PLAN`, `FEATURE_REQUIRED_PLAN`, module config, and feature list behavior. Replace it with entitlement-based tests.

Required test coverage:

```txt
1. No active schema export for tenantFeatures / tenantModuleConfigs.
2. No active API import of tenantFeatures / tenantModuleConfigs.
3. Registration does not insert tenant_features or tenant_module_configs.
4. New tenant gets inventory_basic_stock through SOT/effective entitlement, without DB grant row.
5. Purchased addon grant in tenant_entitlements grants access.
6. Expired addon grant does not grant access.
7. Cancelled addon grant does not grant access.
8. Inventory stock list requires inventory_basic_stock.
9. Inventory movement/history/report requires inventory_advanced_stock.
10. Base catalog routes are not commercially entitlement-gated.
11. Base order lifecycle routes are not commercially entitlement-gated.
12. Marketplace offer list comes from entitlementCatalog.ts / entitlement API.
13. Sidebar desktop visibility uses entitlement codes only.
14. Hub/home menu visibility uses entitlement codes only.
15. Mobile bottom nav visibility uses entitlement codes only.
16. Page route guard uses entitlement codes only.
17. featureCatalog.ts is deleted or contains no independent hardcoded plan/feature/module data.
18. planFeatureMap.ts is deleted or generated from SOT only.
19. businessTypeTemplates.ts is deleted or generated from SOT only.
20. Pro gets Starter + Growth + Pro entitlements cumulatively.
21. Included plan entitlement cannot be purchased/charged again through offer flow.
```

Add a grep/audit test if practical to prevent reintroducing these in active app/package source:

```txt
tenantModuleConfigs
tenantFeatures
enableInventory
enableInventoryAdvanced
resolveBasicStockEntitlement
MODULE_CATALOG_DATA
FEATURE_CATALOG_DATA
MODULE_REQUIRED_PLAN
FEATURE_REQUIRED_PLAN
```

## Required validation commands

Run:

```bash
pnpm check:boundaries
pnpm --filter @pos/domain type-check
pnpm --filter @pos/application type-check
pnpm --filter @pos/infrastructure type-check
pnpm --filter @pos/api type-check
pnpm --filter @pos/terminal-web type-check
pnpm type-check
pnpm run db:check
```

Run focused entitlement/API/registration/marketplace/sidebar/hub tests.

Run frontend tests affected by navigation/gating.

If full API tests require `DATABASE_URL`, run with DB env or document exact limitation.

## Required final audit

Before final commit, rerun:

```bash
rg -n "tenantFeatures|tenant_features|tenantModuleConfigs|tenant_module_configs|enableInventory|enableInventoryAdvanced|enable_inventory|enable_inventory_advanced|enable_table_management|enable_kitchen_ticket|enable_multi_location|resolveBasicStockEntitlement|repairBasicStockEntitlement|BASIC_STOCK_DEFAULT_PLAN_TIERS" apps packages shared migrations

rg -n "featureCatalog|MODULE_CATALOG_DATA|FEATURE_CATALOG_DATA|MODULE_REQUIRED_PLAN|FEATURE_REQUIRED_PLAN|PLAN_RANK|moduleConfig|activeFeatures|hasModule|hasFeature|useFeatures" apps packages shared
```

Expected result:

```txt
No active runtime/frontend source matches, except intentional tests proving absence or generated type names that no longer reference old behavior.
```

Historical docs/roadmap/report may still mention old names only as removed history.

## Required report

Create:

```txt
roadmap/entitlement/phase_2_report.md
```

Report must include:

```md
# Entitlement Phase 2 Report

## Summary

## Files removed

## Files added

## Files changed

## Schema cleanup

- tenant_features active schema removed: yes/no
- tenant_module_configs active schema removed: yes/no
- tenant_entitlements retained: yes/no

## SOT status

- entitlementCatalog.ts only SOT: yes/no
- planFeatureMap.ts removed or generated wrapper:
- businessTypeTemplates.ts removed or generated wrapper:
- frontend featureCatalog.ts removed or generated wrapper:
- no duplicate frontend SOT: yes/no

## Backend cleanup

- registration:
- inventory route guards:
- tenant profile/me entitlements:
- marketplace/catalog endpoint:

## Frontend cleanup

- useEntitlements/can helper:
- Sidebar:
- Hub/home menu:
- Mobile bottom nav:
- Page route guard:
- Marketplace page:

## Base functionality not gated commercially

- catalog CRUD:
- order lifecycle:
- cash/manual payment:
- standard receipt/reprint:

## Audit results

Include summarized output for:

```bash
rg -n "tenantFeatures|tenant_features|tenantModuleConfigs|tenant_module_configs|enableInventory|enableInventoryAdvanced|enable_inventory|enable_inventory_advanced|enable_table_management|enable_kitchen_ticket|enable_multi_location|resolveBasicStockEntitlement|repairBasicStockEntitlement|BASIC_STOCK_DEFAULT_PLAN_TIERS" apps packages shared migrations docs roadmap

rg -n "featureCatalog|MODULE_CATALOG_DATA|FEATURE_CATALOG_DATA|MODULE_REQUIRED_PLAN|FEATURE_REQUIRED_PLAN|PLAN_RANK|moduleConfig|activeFeatures|hasModule|hasFeature|useFeatures" apps packages shared
```

Classify remaining matches:

```txt
none
historical docs only
migration history only
test-only proof of absence
active code remaining
```

If any active code remains, Phase 2 is not done.

## Tests

## Validation commands

## Remaining blockers

Only list blockers caused by external environment limitations, not normal refactor work.

## Final decision

- Active tenant_features removed: yes/no
- Active tenant_module_configs removed: yes/no
- Runtime self-heal removed: yes/no
- Backend API guards use entitlement engine: yes/no
- Registration uses SOT only: yes/no
- Marketplace uses SOT only: yes/no
- Sidebar uses entitlement codes only: yes/no
- Hub/home menu uses entitlement codes only: yes/no
- Mobile nav uses entitlement codes only: yes/no
- Frontend old featureCatalog independent SOT removed: yes/no
- No active legacy gating remains: yes/no
- Ready for Phase 3: yes/no
```

## Commit

Use commit message:

```bash
git commit -m "refactor(entitlement): remove legacy gating end-to-end"
```

Then push.

## Final response required

Return:

```txt
Entitlement Phase 2 status:
Commit SHA:
Files changed:
tenant_features active references removed: yes/no
tenant_module_configs active references removed: yes/no
SOT-only config: yes/no
Registration cleanup: yes/no
API guards cleanup: yes/no
Marketplace cleanup: yes/no
Sidebar cleanup: yes/no
Hub/home cleanup: yes/no
Mobile nav cleanup: yes/no
featureCatalog independent SOT removed: yes/no
Tests added/run:
Commands run:
Remaining blockers:
```
