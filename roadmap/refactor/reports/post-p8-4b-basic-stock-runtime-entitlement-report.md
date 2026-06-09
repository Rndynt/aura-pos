# Post-P8.4B Basic Stock Runtime Entitlement Report

## Production case

- Tenant id from logs: `101a55c4-fabd-4832-afe8-22a1d941ed22`
- Symptom: `/api/inventory/products` returned `403 MODULE_REQUIRED` with the Stok Dasar message even though the tenant is a Basic Starter/starter onboarding shape where Basic Stock is intended to be active by default.
- Root cause: the route-level Basic Stock guard trusted only `tenant_module_configs.enable_inventory = true`. If the row was missing or `enable_inventory` was still `false` from stale pre-P8.4 data, the request was rejected before the stock listing query could include tracked products.
- Fix: Basic Stock now resolves through a reusable backend resolver that centralizes default-plan policy (`free`, `starter`, `basic`, `basic_starter`), honors existing `enable_inventory = true`, and self-heals active default-plan tenants by upserting/repairing their `tenant_module_configs` row with `enable_inventory = true` while preserving `enable_inventory_advanced`.
- Why P8.4 was insufficient: migration `0020_basic_stock_default_entitlement.sql` only updated existing rows for `free`/`starter` active tenants. It did not insert missing `tenant_module_configs` rows and did not include legacy/basic aliases like `basic` or `basic_starter`.

## Root-cause questions

1. Does the tenant have a `tenant_module_configs` row?
   - Not verifiable from this environment because no production database credentials were available. The production symptom is consistent with either a missing row or a stale row because the previous guard returned `false` for both cases.
2. If row exists, what is `enable_inventory`?
   - Not verifiable from this environment. If the row exists and `enable_inventory = false`, the new resolver treats it as stale for active default-plan tenants and repairs it.
3. Does the tenant plan tier use `free`, `starter`, `basic`, `basic_starter`, or another value?
   - Not verifiable for the production tenant without DB access. Code evidence shows current onboarding writes `free`, but the fix also covers `starter`, `basic`, and `basic_starter` aliases used by production/starter terminology.
4. Does Marketplace/frontend derive Basic Stock active from a different source than backend?
   - The stock page reads `profile.moduleConfig.enable_inventory`, while the old backend guard directly read `tenant_module_configs.enable_inventory`. The mismatch occurred when frontend/profile state or product UI indicated Basic Stock/tracking was available while the backend entitlement row was missing/stale. The backend resolver is now the runtime source of truth and repairs the row that profile/Marketplace should read.
5. Does onboarding create `tenant_module_configs` reliably for new tenants?
   - Current registration inserts `tenant_module_configs` from business-type templates in the tenant creation transaction, and templates set Basic Stock enabled by default. Existing production tenants can still be missing/stale from old data or older onboarding paths.
6. Did migration 0020 insert missing rows or only update existing rows?
   - Migration 0020 only performed an `UPDATE ... FROM tenants` against existing `tenant_module_configs` rows. It did not insert missing rows.
7. Why did tenant `101a55c4-fabd-4832-afe8-22a1d941ed22` still get 403?
   - The most likely reason, based on code and the migration gap, is that the tenant's `tenant_module_configs` row was missing or had stale `enable_inventory = false`, or its plan tier was an alias not covered by 0020. The old runtime guard had no plan-policy fallback or self-heal, so it returned 403 before product listing.

## Backend entitlement source of truth

- Source(s) used:
  - Existing tenant module config: `enable_inventory = true` always grants Basic Stock for that tenant row.
  - Active default-plan policy: active tenants on `free`, `starter`, `basic`, or `basic_starter` are entitled to Basic Stock by default.
- Runtime self-heal behavior:
  - Missing config row for an active default-plan tenant: insert `tenant_module_configs` with Basic Stock enabled and paid modules disabled.
  - Stale config row with `enable_inventory = false` for an active default-plan tenant: update `enable_inventory = true`.
  - Repairs are idempotent and log a warning once per tenant/action.
- Migration/backfill:
  - Added `0021_repair_basic_stock_runtime_entitlement.sql` to insert missing rows and update stale Basic Stock rows for active default-plan tenants.
- Advanced Inventory separation:
  - Runtime self-heal and migration preserve `enable_inventory_advanced`; they do not set Advanced Inventory to true.
  - Advanced endpoints continue using `enable_inventory_advanced = true` checks.

## Tests

- Automated:
  - Added entitlement tests for default plan aliases, missing config repair decisions, stale disabled repair decisions, inactive/non-policy denial, and Advanced Inventory separation.
  - Added static migration tests ensuring 0021 inserts missing rows, updates stale Basic Stock, and does not enable Advanced Inventory.
  - Existing stock listing tests continue to cover tracked products with `stockQty = null` and `stockQty = 0`.
- Manual/staging:
  - Not run in this environment because no running API/staging URL and production-shaped database credentials were available.

## Commands

- `pnpm check:boundaries`: passed.
- `pnpm --filter @pos/domain type-check`: passed.
- `pnpm --filter @pos/application type-check`: passed.
- `pnpm --filter @pos/infrastructure type-check`: passed.
- `pnpm --filter @pos/api type-check`: passed.
- `pnpm --filter @pos/terminal-web type-check`: passed.
- `pnpm type-check`: passed.
- `pnpm run db:check`: passed.
- `pnpm --filter @pos/api exec tsx --test src/__tests__/inventory-entitlement.test.ts src/__tests__/inventory-stock-listing.test.ts`: passed.
- `pnpm --filter @pos/api test -- --test-name-pattern='inventory entitlement|0021 Basic Stock'`: failed because the package script forwarded the pattern incorrectly and executed all API tests; the unrelated `record-payment-idempotency.test.ts` requires `DATABASE_URL` and exited with `[database] DATABASE_URL environment variable is not set`.

## Final decision

- Production 403 fixed: yes, by code path for active `free`/`starter`/`basic`/`basic_starter` tenants with missing/stale Basic Stock config. Live production verification was not possible here.
- Basic Starter tracked product visible: yes by entitlement path plus existing stock-list normalization tests for tracked products with `null` or zero stock. Live browser verification was not possible here.
- Missing config row repaired: yes.
- Stale `enable_inventory=false` repaired: yes.
- Advanced Inventory still gated: yes.
- Migration generated: yes, `migrations/0021_repair_basic_stock_runtime_entitlement.sql`.
- DB schema changed: no schema shape change; data backfill/repair migration only.
- Follow-up required: yes — run manual/staging validation against tenant `101a55c4-fabd-4832-afe8-22a1d941ed22` or a production-shaped clone to confirm the repair applies to live data and `/api/inventory/products` returns 200 while advanced endpoints remain 403 when Advanced Inventory is disabled.
