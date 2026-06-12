# Entitlement Phase 2 Report

## Summary

Implemented a careful Phase 2 cleanup batch focused on removing the dangerous active database/runtime dependency on legacy tenant feature/module tables. The active Drizzle schema no longer exports the removed tables, registration and seed flows no longer write legacy rows, tenant feature/module API behavior now reads/writes `tenant_entitlements` or returns effective entitlement data, and old route guards now evaluate mapped entitlement codes through the entitlement engine.

This batch also converted the POS marketplace's inventory entitlement controls away from legacy inventory module flags and made the frontend catalog wrapper derive from `entitlementCatalog.ts`.

## Removed legacy tables/code

- Removed active Drizzle schema definitions and insert/select schemas for `tenant_features` and `tenant_module_configs`.
- Removed active API reads/writes of `tenantFeatures` and `tenantModuleConfigs` from tenant controller, feature guard, seed scripts, outlet slot checks, and inventory policy repository.
- Replaced legacy tenant feature/module persistence in compatibility repositories with non-writing removed-state adapters.
- Registration remains SOT-driven and does not persist plan/business defaults into any feature/module/grant table.

## Schema changes

- tenant_features active schema removed: yes
- tenant_module_configs active schema removed: yes
- tenant_entitlements retained: yes

## SOT status

- entitlementCatalog.ts only SOT: partial
- planFeatureMap.ts removed or generated wrapper: generated wrapper remains and is now unused by active API controller code; retained for tests/older import compatibility.
- businessTypeTemplates.ts removed or generated wrapper: generated wrapper remains for older application use cases/tests; active registration was moved directly to `ENTITLEMENT_CATALOG`.
- featureCatalog hardcode removed: partial; `apps/pos-terminal-web/src/lib/featureCatalog.ts` now derives plan/feature data from `ENTITLEMENT_CATALOG`, but the filename/import remains as a wrapper.

## Runtime access checks

- inventory basic: guarded by `requireTenantEntitlement(..., 'inventory_basic_stock')`.
- inventory advanced: guarded by `requireTenantEntitlement(..., 'inventory_advanced_stock')`.
- tenant profile/me: `GET /api/tenants/profile` now returns tenant metadata, effective entitlements, catalog plans/offers, and explicit grants.
- marketplace: inventory module flag controls were removed; the marketplace uses entitlement codes/effective entitlements for active state and calls the entitlement toggle endpoint.
- registration: reads `ENTITLEMENT_CATALOG.businessTypes`, plan included entitlements, and business type defaults; does not write legacy rows or default grant rows.

## Audit results

### Required audit 1

Command:

```bash
rg -n "tenantFeatures|tenant_features|tenantModuleConfigs|tenant_module_configs|enableInventory|enableInventoryAdvanced|resolveBasicStockEntitlement|repairBasicStockEntitlement|BASIC_STOCK_DEFAULT_PLAN_TIERS" apps packages shared migrations docs roadmap
```

Classification summary:

- active runtime code: no remaining `tenantFeatures`/`tenantModuleConfigs` schema/table usage in non-test active app/package source after this batch.
- active schema/migration: `migrations/0022_single_tenant_entitlements.sql` intentionally drops the old tables; historical migrations and snapshots still contain old table history.
- active test: tests intentionally assert schema removal and registration no-insert behavior.
- active docs/report historical reference: roadmap and billing docs retain historical references.

### Required audit 2

Command:

```bash
rg -n "planFeatureMap|PLAN_FEATURE_MAP|businessTypeTemplates|BUSINESS_TYPE_TEMPLATES|featureCatalog|moduleConfig|enable_inventory|enable_inventory_advanced" apps packages shared migrations docs roadmap
```

Classification summary:

- active runtime code remaining: some legacy compatibility surfaces remain in application/domain/frontend profile context (`CreateTenant`, `GetTenantProfile`, `TenantContext`, `useTenantProfile`, and stock page moduleConfig compatibility). These are not old table reads after this batch, but they are still old shape/API compatibility and should be Phase 3 cleanup blockers.
- active schema/migration: no active old module table schema remains.
- active test: tests still exercise wrapper compatibility.
- active docs/report historical reference: hooks README and roadmap docs retain legacy examples.

### Required audit 3

Command:

```bash
rg -n "orders_open_order|orders_cancel|orders_void|orders_refund|catalog_products|catalog_categories|catalog_variants|catalog_options|catalog_sku|catalog_barcode|payments_cash|payments_manual_qris|payments_manual_bank_transfer|receipt_standard|receipt_reprint|inventory_stock_adjustment|inventory_stock_movement_history|inventory_stock_opname|inventory_stock_transfer|inventory_low_stock_alert|inventory_reports|hardware_receipt_printer|hardware_cash_drawer" apps packages shared migrations docs roadmap
```

Classification summary:

- active runtime code remaining: `inventory_reports` appears only as a legacy-to-entitlement guard mapping in `featureGuard.ts`; access is mapped to `inventory_advanced_stock`, not treated as an independent commercial entitlement.
- active tests/docs: tests and historical docs assert removed/base entitlement codes are absent from the Phase 1B catalog.

## Tests

- Added/updated schema-removal coverage by changing the legacy tenant feature repository test to assert `tenantFeatures` is not exported and write calls fail.
- Updated registration tests so they no longer import removed schema exports and continue to assert registration does not write default `tenant_entitlements` rows.
- Existing inventory entitlement tests continue to cover SOT effective grants, expired/cancelled grants, inventory basic/advanced route guards, and base catalog/order routes not being commercially entitlement-gated.

## Validation commands

- `pnpm --filter @pos/domain type-check`: passed
- `pnpm --filter @pos/application type-check`: passed
- `pnpm --filter @pos/infrastructure type-check`: passed
- `pnpm --filter @pos/api type-check`: passed
- `pnpm --filter @pos/terminal-web type-check`: passed
- `pnpm --filter @pos/api test`: passed (129 tests)
- `pnpm check:boundaries`: passed
- `pnpm type-check`: passed
- `pnpm run db:check`: passed

## Remaining blockers

- Some moduleConfig-shaped frontend/application compatibility remains and is documented as a Phase 3 blocker. It no longer depends on the dropped tables in the paths converted in this batch, but the public shape should be removed or replaced cleanly.
- `businessTypeTemplates.ts` and `planFeatureMap.ts` remain as generated compatibility wrappers for older tests/imports.

## Final decision

- Active tenant_features removed: yes for schema/table runtime usage in converted paths; historical migrations/docs/tests remain.
- Active tenant_module_configs removed: yes for schema/table runtime usage in converted paths; moduleConfig API shape compatibility remains.
- Runtime self-heal removed: yes
- SOT-only plan/business/marketplace config: partial
- API guards use entitlement engine: yes
- Registration uses SOT only: yes
- Ready for Phase 3: partial; remaining compatibility-shape blockers should be scheduled before declaring complete removal of all old frontend/application surfaces.
