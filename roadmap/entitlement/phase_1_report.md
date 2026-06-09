# Entitlement Phase 1 Report

## Summary

Implemented a Phase 1 entitlement foundation centered on a single SOT catalog, a read-only entitlement engine, a new `tenant_entitlements` schema/migration, SOT-driven registration defaults, and entitlement-code based inventory guards. The old Basic Stock runtime repair migration/helper was removed.

This batch intentionally leaves several legacy references as Phase 2 blockers because tenant feature/module repositories, tenant profile endpoints, seed scripts, frontend marketplace gating, and historical migrations still need a coordinated follow-up conversion. Inventory routes and registration were converted as required for Phase 1.

## Files added

- `packages/application/entitlements/entitlementCatalog.ts`
- `packages/application/entitlements/entitlementEngine.ts`
- `packages/application/entitlements/index.ts`
- `migrations/0022_single_tenant_entitlements.sql`
- `roadmap/entitlement/phase_1_report.md`

## Files removed

- `migrations/0021_repair_basic_stock_runtime_entitlement.sql`

## Schema changes

- Added `tenantEntitlements` Drizzle schema for the new `tenant_entitlements` table.
- Added destructive migration `0022_single_tenant_entitlements.sql` that drops `tenant_features` and `tenant_module_configs` and creates `tenant_entitlements` with source/status checks and required indexes.
- Legacy `tenantFeatures`/`tenantModuleConfigs` Drizzle exports remain temporarily because many non-inventory legacy endpoints/repositories/tests still compile through them; this is tracked as a Phase 2 blocker.

## SOT

- SOT file: `packages/application/entitlements/entitlementCatalog.ts`
- Sections included:
  - `meta`
  - `billingIntervals`
  - `plans`
  - `entitlements`
  - `offers`
  - `businessTypes`
- Old SOT files removed/replaced:
  - `packages/application/tenants/businessTypeTemplates.ts` is now a derived compatibility wrapper.
  - `apps/api/src/constants/planFeatureMap.ts` is now a derived compatibility wrapper for older feature-code callers.
  - `apps/pos-terminal-web/src/lib/featureCatalog.ts` remains a Phase 2 frontend blocker.

## Database

- tenant_features removed: yes in migration `0022_single_tenant_entitlements.sql`; no in historical migrations and temporary Drizzle compatibility exports.
- tenant_module_configs removed: yes in migration `0022_single_tenant_entitlements.sql`; no in historical migrations and temporary Drizzle compatibility exports.
- tenant_entitlements created: yes.
- migration file: `migrations/0022_single_tenant_entitlements.sql`

## Engine

- getEffectiveEntitlements: implemented in `packages/application/entitlements/entitlementEngine.ts`; combines cumulative plan, business-type defaults, and active explicit grants.
- hasEntitlement: implemented; checks the effective entitlement set.
- requireEntitlement: implemented; throws `EntitlementRequiredError` without writing/repairing DB data.
- canPurchaseOffer: implemented; compares tenant plan and offer required plan by plan `sortOrder`.

## Route changes

- inventory basic: `GET /api/inventory/products` and `PUT /api/inventory/products/:id/adjust` now require `inventory_basic_stock` through the entitlement helper.
- inventory advanced: movement and report routes now require `inventory_advanced_stock`; report entitlement choice is documented as `inventory_advanced_stock` for this phase because the report is sourced from advanced movement history.
- marketplace: not fully converted; frontend marketplace hardcodes remain a Phase 2 blocker.
- registration: `registerTenantOwner()` reads the business type template derived from the SOT, stores SOT `defaultPlan`, and no longer inserts `tenant_features`, `tenant_module_configs`, or default `tenant_entitlements` rows.

## Tests

Focused tests added/updated for:

1. Entitlement catalog section shape and reference validity.
2. Plan hierarchy cumulative behavior and Pro receiving Starter + Growth + Pro.
3. Included plan entitlement access without a DB grant row.
4. Active purchased grant access.
5. Expired/cancelled grant rejection.
6. Offer minimum-plan checks.
7. Basic Stock via SOT defaults.
8. Inventory route entitlement guard static assertions.
9. Registration no longer inserting legacy entitlement/module tables.
10. Full registration journey using SOT default plans and no old-table inserts.

## Validation commands

- `pnpm check:boundaries` — passed.
- `pnpm --filter @pos/domain type-check` — passed.
- `pnpm --filter @pos/application type-check` — passed.
- `pnpm --filter @pos/infrastructure type-check` — passed.
- `pnpm --filter @pos/api type-check` — passed.
- `pnpm --filter @pos/terminal-web type-check` — passed.
- `pnpm run db:check` — passed.
- `pnpm --dir apps/api exec tsx --test src/__tests__/inventory-entitlement.test.ts src/__tests__/registration-service.test.ts src/__tests__/full-journey-registration.test.ts src/__tests__/plan-upgrade-flow.test.ts` — passed.

## Remaining references to old entitlement tables

Command run:

```bash
rg -n "tenantFeatures|tenant_features|tenantModuleConfigs|tenant_module_configs|enableInventory|enableInventoryAdvanced|resolveBasicStockEntitlement|planFeatureMap|businessTypeTemplates" apps packages shared migrations
```

Remaining references and disposition:

- Historical migrations/meta snapshots (`migrations/0000_*`, `0001_*`, `0015_*`, `0016_*`, `0020_*`, `migrations/meta/*`): historical or pre-cleanup migration artifacts; `0022_single_tenant_entitlements.sql` performs the destructive cleanup. `0020_basic_stock_default_entitlement.sql` is superseded by `0022` and should be removed or squashed in Phase 2 if the migration chain is reset.
- `packages/infrastructure/db/schema/tenants.schema.ts`: `tenantFeatures` and `tenantModuleConfigs` exports remain as temporary compile-compatibility exports; `tenantEntitlements` was added. Phase 2 should remove old exports after repository/controller conversion.
- `packages/infrastructure/repositories/tenants/TenantFeatureRepository.ts` and `TenantModuleConfigRepository.ts`: old-table repository layer remains a Phase 2 blocker.
- `packages/application/tenants/CreateTenant.ts`, `GetTenantProfile.ts`, `CheckFeatureAccess.ts`, and related ports: legacy feature/module use cases remain a Phase 2 blocker; production onboarding path `POST /api/register` was converted in this batch.
- `apps/api/src/http/controllers/TenantsController.ts`, `apps/api/src/http/middleware/featureGuard.ts`, `apps/api/src/http/routes/outlets.ts`: legacy feature/module endpoints and guards remain Phase 2 blockers.
- `apps/api/src/seed.ts` and `apps/api/src/seed-free-starter.ts`: seed scripts still write legacy tables and must be updated before using them with the post-0022 schema.
- `apps/pos-terminal-web/src/lib/featureCatalog.ts` and related UI tests/pages: frontend feature/marketplace catalog remains a Phase 2 blocker.
- `apps/api/src/constants/planFeatureMap.ts` and `packages/application/tenants/businessTypeTemplates.ts`: retained only as generated/derived compatibility wrappers with no independent SOT hardcode.
- `resolveBasicStockEntitlement`: no production helper reference remains; self-heal helper was removed.

## Final decision

- Single SOT done: yes for backend/application SOT; frontend marketplace still has Phase 2 hardcodes.
- Old tables removed: yes in the new destructive migration; no in all active code exports/repositories yet.
- Resolver/self-heal removed: yes.
- Inventory Basic Stock fixed by SOT: yes.
- Ready for Phase 2: yes, with documented blockers above.
