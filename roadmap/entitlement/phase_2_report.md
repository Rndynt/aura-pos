# Entitlement Phase 2 Report

## Summary

Phase 2 removed the legacy tenant feature/module subsystem end-to-end and aligned
all backend guards, registration, seeds, frontend hooks, navigation gating, and
the marketplace to the single source of truth (SOT):

```
packages/application/entitlements/entitlementCatalog.ts
```

Effective entitlements are now derived at runtime by the entitlement engine
(`cumulative plan included + business-type defaults + active grants`). There is
no projection table, no runtime self-heal, no resolver repair, and no legacy
compatibility mapping. The only persisted per-tenant entitlement rows are
purchased/granted add-ons in `tenant_entitlements`.

A new backend endpoint `GET /api/me/entitlements` (and the reshaped
`GET /api/tenants/profile`) exposes the tenant, the effective entitlement map,
active grants, and the catalog. The frontend consumes this exclusively via a
single `useEntitlements()` / `useTenant().can(code)` helper.

## Files removed

```
apps/api/src/constants/planFeatureMap.ts
apps/api/src/http/middleware/featureGuard.ts
apps/api/src/__tests__/tenant-feature-repository.test.ts
packages/application/tenants/businessTypeTemplates.ts
packages/application/tenants/CreateTenant.ts
packages/application/tenants/GetTenantProfile.ts
packages/application/tenants/GetActiveFeaturesForTenant.ts
packages/application/tenants/CheckFeatureAccess.ts
packages/application/tenants/ports/FeatureEntitlementPort.ts
packages/infrastructure/repositories/tenants/TenantFeatureRepository.ts
packages/infrastructure/repositories/tenants/TenantModuleConfigRepository.ts
apps/pos-terminal-web/src/lib/featureCatalog.ts
apps/pos-terminal-web/src/hooks/useFeatures.ts
apps/pos-terminal-web/src/hooks/useOfflineTenantFeatures.ts
apps/pos-terminal-web/src/hooks/api/useTenantFeatures.ts
```

## Files added

```
apps/api/src/services/tenantEntitlements.ts          # shared effective-entitlement loader
apps/api/src/http/middleware/entitlementGuard.ts     # requireEntitlement(code) middleware
apps/pos-terminal-web/src/hooks/api/useEntitlements.ts  # single frontend can() helper
apps/api/src/__tests__/no-legacy-entitlement-symbols.test.ts  # grep/audit guard test
```

## Files changed (key)

```
packages/infrastructure/db/schema/tenants.schema.ts          # removed legacy tables/types
packages/infrastructure/repositories/inventory/DrizzleInventoryPolicyRepository.ts  # entitlement-derived
packages/application/inventory/inventoryPolicy.ts            # source enum + result fields renamed
packages/application/tenants/index.ts                        # dropped legacy exports
packages/application/tenants/ports/index.ts                  # dropped FeatureEntitlementPort
packages/domain/tenants/types.ts + index.ts                  # removed TenantFeature/TenantModuleConfig/FeatureCheck
packages/core/enums.ts                                       # comment de-legacied
apps/api/src/container.ts                                     # dropped legacy repos/use cases
apps/api/src/http/controllers/TenantsController.ts           # entitlement endpoints only
apps/api/src/http/routes/tenants.ts + index.ts               # /me/entitlements, removed module/feature/plan routes
apps/api/src/http/routes/orders.ts + tables.ts               # requireEntitlement(...)
apps/api/src/http/routes/outlets.ts                          # multi_location entitlement for outlet slots
apps/api/src/services/registrationService.ts                 # SOT-only onboarding
apps/api/src/seed.ts + seed-free-starter.ts                  # planTier + tenant_entitlements grants only
apps/pos-terminal-web/src/context/TenantContext.tsx          # can()/entitlements
apps/pos-terminal-web/src/hooks/api/useTenantProfile.ts      # backed by /api/me/entitlements
apps/pos-terminal-web/src/pages/marketplace.tsx              # SOT catalog + effective entitlements
apps/pos-terminal-web/src/components/pos/{Sidebar,CartPanel,MobileCartDrawer,OrderTypeSelectionDialog,ProductArea}.tsx
apps/pos-terminal-web/src/components/navigation/UnifiedBottomNav.tsx
apps/pos-terminal-web/src/pages/{home,stock,dashboard,reports,products}.tsx
apps/pos-terminal-web/src/features/pos/pages/POSPage.tsx
apps/pos-terminal-web/src/App.tsx
apps/pos-terminal-web/src/lib/api/hooks.ts                   # removed useTenantFeatures/useCheckFeature
apps/pos-terminal-web/src/lib/mockData.ts                    # removed mock feature catalog/helpers
packages/offline/src/tenantCache.ts                          # entitlement map cache helpers
```

## Schema cleanup

- tenant_features active schema removed: **yes** (Drizzle table + insert/select schemas + types deleted)
- tenant_module_configs active schema removed: **yes** (Drizzle table + insert/select schemas + types deleted)
- tenant_entitlements retained: **yes**

## SOT status

- entitlementCatalog.ts only SOT: **yes**
- planFeatureMap.ts removed or generated wrapper: **removed**
- businessTypeTemplates.ts removed or generated wrapper: **removed** (registration reads `ENTITLEMENT_CATALOG.businessTypes` directly)
- frontend featureCatalog.ts removed or generated wrapper: **removed**
- no duplicate frontend SOT: **yes** (frontend imports `@pos/application/entitlements` and/or the `/api/me/entitlements` response)

## Backend cleanup

- registration: SOT-only. Sets `tenants.planTier` + `tenants.businessType` (+ outlet/order-types/catalog). Inserts no `tenant_features`, `tenant_module_configs`, or default `tenant_entitlements`. Effective defaults derived at runtime.
- inventory route guards: `requireTenantEntitlement(db, tenantId, 'inventory_basic_stock' | 'inventory_advanced_stock')` (unchanged from Phase 1B, now backed by the shared loader).
- tenant profile/me entitlements: `GET /api/me/entitlements` and `GET /api/tenants/profile` return `{ tenant, entitlements, grants, catalog }`.
- marketplace/catalog endpoint: the catalog is included in the `/api/me/entitlements` response (`catalog.plans/entitlements/offers/businessTypes`) and the frontend also imports the SOT directly.
- kitchen-ticket route → `requireEntitlement('restaurant_kitchen_ops')`; tables router → `requireEntitlement('restaurant_table_service')`.
- outlet slot capacity → governed by `multi_location` entitlement (was `tenant_features` `multi_outlet`).
- inventory stock policy (strict/allow_negative) → derived from effective entitlements + `tenants.settings.inventory_policy` (was `tenant_module_configs`).

## Frontend cleanup

- useEntitlements/can helper: **added** (`useEntitlements()`, `useTenant().can(code)`).
- Sidebar: entitlement codes (`restaurant_table_service`, `restaurant_kitchen_ops`).
- Hub/home menu: `reports_advanced`, `restaurant_table_service`, `restaurant_kitchen_ops`, `multi_location`.
- Mobile bottom nav: `restaurant_table_service`, `restaurant_kitchen_ops`.
- Page route guard: `App.tsx` kitchen/tables routes use `can(...)`.
- Marketplace page: renders from `ENTITLEMENT_CATALOG` + effective entitlements/grants; offers gated by `requiredPlan` sortOrder; included-by-plan entitlements are not purchasable; expired/cancelled grants show as not active. No module/feature toggling.

## Base functionality not gated commercially

- catalog CRUD: **not gated** (catalog route has no entitlement guard; product variants always available).
- order lifecycle: **not gated** (open/create/cancel/void/refund have no commercial entitlement guard).
- cash/manual payment: **not gated**.
- standard receipt/reprint: **not gated** (only `receipt_compact` is a commercial add-on).

## Audit results

### `rg` audit 1 — `tenantFeatures|tenant_features|tenantModuleConfigs|tenant_module_configs|enableInventory|enableInventoryAdvanced|enable_inventory|enable_inventory_advanced|enable_table_management|enable_kitchen_ticket|enable_multi_location|resolveBasicStockEntitlement|repairBasicStockEntitlement|BASIC_STOCK_DEFAULT_PLAN_TIERS` over `apps packages shared migrations`

Remaining matches classified:
- **migration history only**: `migrations/0000..0022` SQL + `migrations/meta/*` snapshots (historical, drop/describe removed tables — allowed).
- **test-only proof of absence**: `apps/api/src/__tests__/inventory-entitlement.test.ts` (`assert.doesNotMatch(... tenantModuleConfigs ...)`), `apps/api/src/__tests__/no-legacy-entitlement-symbols.test.ts` (forbidden-symbol list).
- **active code remaining**: **none**.

### `rg` audit 2 — `featureCatalog|MODULE_CATALOG_DATA|FEATURE_CATALOG_DATA|MODULE_REQUIRED_PLAN|FEATURE_REQUIRED_PLAN|PLAN_RANK|moduleConfig|activeFeatures|hasModule|hasFeature|useFeatures` over `apps packages shared`

Remaining matches classified:
- **test-only proof of absence**: `apps/api/src/__tests__/no-legacy-entitlement-symbols.test.ts` (forbidden-symbol list).
- **active code remaining**: **none**.

## Tests

Added/updated:
- `apps/api/src/__tests__/no-legacy-entitlement-symbols.test.ts` — fs-based grep guard over active source (14 forbidden symbols), **14/14 pass**.
- `apps/api/src/__tests__/plan-upgrade-flow.test.ts` — rewritten on the entitlement engine (cumulative inclusion, ceilings, active/expired/cancelled grants), **11/11 pass**.
- `apps/api/src/__tests__/registration-service.test.ts` — SOT onboarding, no legacy/entitlement inserts, **8/8 pass**.
- `apps/api/src/__tests__/full-journey-registration.test.ts` — per-business-type SOT onboarding + cumulative inclusion, **8/8 pass**.
- `apps/api/src/__tests__/inventory-entitlement.test.ts` — retained (Phase 1B), asserts base routes are not commercially gated and inventory routes use coarse entitlement codes.
- `apps/pos-terminal-web/src/__tests__/entitlement-catalog.test.ts` — rewritten against the shared SOT (commercial-only list, cumulative plans, grants, offer purchase rules), passes.
- `apps/pos-terminal-web/src/__tests__/hub-sidebar-gating.test.ts` — rewritten as entitlement-based nav/route/stock gating, passes.

Frontend entitlement tests together: **21/21 pass**.

## Validation commands

```bash
tsc -p packages/domain/tsconfig.json --noEmit          # pass
tsc -p packages/application/tsconfig.json --noEmit      # pass
tsc -p packages/infrastructure/tsconfig.json --noEmit   # pass
tsc --noEmit (apps/api)                                 # only pre-existing baseline errors (compression/redis/distributedCache/vite-plugin-pwa types)
tsc --noEmit (apps/pos-terminal-web)                    # 42 errors, all pre-existing missing-dep types; baseline was 44 (no new errors)
tsx scripts/validate-boundaries.ts                      # pass (381 files, 8 zones)
tsx --test apps/api/src/__tests__/**/*.test.ts          # entitlement/registration/guard suites pass; pre-existing DB/redis e2e tests fail for env reasons only
drizzle-kit check                                       # requires DATABASE_URL (not provisioned here) — see blockers
```

## Remaining blockers

Environment-only (not refactor work):
- `DATABASE_URL` is not provisioned in this workspace, so DB-backed e2e tests (`cfd`, `record-payment-idempotency`, etc.) and `drizzle-kit check` cannot run. These fail identically on the pre-change baseline.
- `redis`, `compression`, `vite-plugin-pwa`, and several `@radix-ui/*` packages are not installed in this workspace, producing pre-existing TS "cannot find module" errors unrelated to this change (baseline reproduces them).

No active legacy gating remains; no normal refactor cascade is left open.

## Final decision

- Active tenant_features removed: **yes**
- Active tenant_module_configs removed: **yes**
- Runtime self-heal removed: **yes** (none present/added)
- Backend API guards use entitlement engine: **yes**
- Registration uses SOT only: **yes**
- Marketplace uses SOT only: **yes**
- Sidebar uses entitlement codes only: **yes**
- Hub/home menu uses entitlement codes only: **yes**
- Mobile nav uses entitlement codes only: **yes**
- Frontend old featureCatalog independent SOT removed: **yes**
- No active legacy gating remains: **yes**
- Ready for Phase 3: **yes**
