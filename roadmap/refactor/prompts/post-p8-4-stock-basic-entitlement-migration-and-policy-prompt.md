# AuraPoS Post-P8.4 — Stock Basic Entitlement, Migration Recovery, and Stock Policy Prompt

Work in `Rndynt/AuraPoS`.

## Objective

Execute **Post-P8.4 — Stock Basic Entitlement, Migration Recovery, and Stock Policy**.

This task follows:

```txt
P0-P8 architecture refactor
Post-P8.1 boundary exception cleanup
Post-P8.2 POS + inventory smoke
Post-P8.3 inventory movement traceability + tracked stock listing fix
```

P8.3 fixed the tracked-product listing query, but production still shows a blocker in a Basic Starter tenant because the inventory endpoint is being blocked by module entitlement/gating.

This task must fix the production case and harden the stock policy.

## Production cases to include

### Case 1 — Basic Starter with Stok Dasar active still cannot open stock page

Reported production behavior:

```txt
A Basic Starter tenant has Stok Dasar / Basic Stock intended to be active for onboarding/new users.
User enabled stock tracking for 1 product.
The product still does not appear on the stock page.
Production logs show /api/inventory/products returns 403:

[403] Fitur ini memerlukan modul Stok Dasar. Aktifkan dari Marketplace. {
  path: '/inventory/products',
  method: 'GET',
  tenantId: '101a55c4-fabd-4832-afe8-22a1d941ed22',
  error: 'Fitur ini memerlukan modul Stok Dasar. Aktifkan dari Marketplace.'
}
```

This means the P8.3 query fix is not enough. The endpoint is blocked before listing products.

Expected behavior:

```txt
Basic Starter/new onboarding tenant should have Stok Dasar active by default if that is the intended product policy.
If Stok Dasar is active for a tenant, GET /api/inventory/products must return 200.
A product with stockTrackingEnabled = true must appear on the stock page even with stock 0/null and no movements.
```

Do not bypass entitlement globally. Fix the real entitlement/module activation path.

### Case 2 — Production migration error in 0015_native_uuid_alignment.sql

Production logs:

```txt
12:46:54 PM [migrate]   ✗ Migration error (0015_native_uuid_alignment.sql): Cannot cast tenants.id to uuid; invalid value: thamada
12:46:54 PM [migrate]   ✓ Applied migration: 0019_inventory_movement_traceability.sql
12:46:54 PM [migrate] DB migrations done — applied: 1, skipped: 19, errors: 1
```

This is dangerous because migration 0019 was applied while 0015 failed.

Expected behavior:

```txt
Migration runner must not silently continue to a partially migrated state without clear failure semantics.
0015 must be made production-safe for legacy slug tenant ids such as `thamada`, or a repair/preflight migration must be added.
The system must not report DB migrations as effectively done when errors > 0.
```

Investigate before changing.

## Read first

```txt
roadmap/refactor/reports/post-p8-2-pos-inventory-stock-smoke-report.md
roadmap/refactor/reports/post-p8-3-inventory-traceability-stock-listing-report.md
roadmap/refactor/p8-s1-s3-import-boundary-enforcement.md
scripts/validate-boundaries.ts
migrations/0015_native_uuid_alignment.sql
migrations/0019_inventory_movement_traceability.sql
apps/api/src/migrate*
apps/api/src/**/migrate*
apps/api/src/**/feature*
apps/api/src/**/module*
apps/api/src/**/marketplace*
apps/api/src/**/inventory*
apps/api/src/**/catalog*
apps/api/src/**/tenant*
apps/api/src/**/registration*
packages/application/inventory/**
packages/application/tenants/**
packages/infrastructure/repositories/inventory/**
packages/infrastructure/repositories/tenants/**
packages/infrastructure/db/schema/tenants.schema.ts
packages/infrastructure/db/schema/catalog.schema.ts
packages/infrastructure/db/schema/inventory.schema.ts
apps/pos-terminal-web/src/**/inventory*
apps/pos-terminal-web/src/**/stock*
apps/pos-terminal-web/src/**/marketplace*
```

Search first:

```bash
rg -n "Stok Dasar|stok dasar|Basic Stock|basic stock|enableInventory|enableInventoryAdvanced|inventory_basic|inventory|Marketplace|module|feature|requires.*stock|requires.*inventory|Fitur ini memerlukan modul|tenant_module_configs|tenant_features|planTier|Basic Starter|starter|growth|registration|onboarding" apps packages shared migrations

rg -n "migrate|migration|0015|0019|aurapos_assert_uuid_castable|Cannot cast|tenants.id|slug" apps packages migrations scripts
```

## Strict scope

Do not refactor architecture again.

Do not weaken `pnpm check:boundaries`.

Do not bypass all inventory entitlement checks just to make the endpoint return 200.

Do not give Growth/paid advanced modules to Free/Basic tenants unless product policy explicitly says so.

Do not expose inventory data across tenant/outlet boundaries.

Do not change stock deduction timing without explicitly documenting and testing it.

Do not remove P8.3 traceability fields.

Do not remove migration 0019.

Do not make migration 0015 silently ignore bad legacy data without repairing or reporting it clearly.

## Part A — Fix Basic Starter Stok Dasar entitlement

Find the real source of truth for module/feature access:

```txt
- tenant_module_configs?
- tenant_features?
- marketplace feature catalog?
- planTier defaults?
- registration/onboarding defaults?
- route-level entitlement middleware?
```

Then fix the Basic Starter onboarding policy:

```txt
Basic Starter/new onboarding tenant must have Stok Dasar active if that is the intended default.
Inventory Basic should be enabled without requiring manual Marketplace activation for brand-new users if product policy says stock basic is part of onboarding.
Inventory Advanced must remain separate and must not be accidentally enabled unless intended.
```

Acceptance criteria:

```txt
1. New Basic Starter tenant gets basic stock entitlement/module active by default.
2. Existing Basic Starter tenant with stock basic active passes entitlement check.
3. GET /api/inventory/products returns 200 for tenant with Stok Dasar active.
4. GET /api/inventory/products still returns 403 for tenant without Stok Dasar if policy requires gating.
5. The 403 message remains correct for truly inactive tenants.
6. Enabling stockTrackingEnabled on a product makes it visible on stock page/API immediately.
7. No cross-tenant/outlet leakage.
```

If the bug is only seed/demo data, fix seed and registration/onboarding so it does not happen again.

If the bug is marketplace activation state mismatch, fix the mapping/sync between marketplace module activation and backend entitlement check.

If the bug is the endpoint requiring Advanced Stock instead of Basic Stock, correct the guard.

## Part B — Fix tracked product stock listing in production-gated path

Re-test the exact production flow:

```txt
1. Use Basic Starter tenant.
2. Ensure Stok Dasar is active according to product policy.
3. Create/select one product.
4. Enable stockTrackingEnabled.
5. Call GET /api/inventory/products.
6. Open stock page.
7. Confirm product appears with stock 0/null if no movement exists.
```

Do not rely only on Growth tenant.

Add tests for Basic Starter specifically:

```txt
- basic starter tenant with enableInventory/basic stock active can access /api/inventory/products
- basic starter tracked product appears with zero/null stock
- tenant without stock module receives 403
- advanced stock remains gated separately
```

## Part C — Migration 0015 production failure recovery

Investigate why production still has legacy `tenants.id = 'thamada'` while schema expects UUID.

The current `0015_native_uuid_alignment.sql` intentionally fails if it finds non-UUID values. The failure path is visible in the migration function:

```txt
Cannot cast tenants.id to uuid; invalid value: thamada
```

Fix strategy must be safe.

Preferred safe approach:

```txt
1. Add a new repair/preflight migration before or alongside 0015 handling if migration order allows.
2. For legacy tenants with non-UUID id values, generate UUID ids and update all referencing tenant_id columns consistently.
3. Preserve slug values such as `thamada` in `tenants.slug`, not `tenants.id`.
4. Update all referencing tables in the same transaction where possible.
5. Make operation idempotent.
6. Do not lose tenant data.
7. Do not create duplicate tenants.
```

If changing already-applied migration 0015 is unsafe, create a new migration and update the migration runner/documentation so production can recover cleanly.

Important: because production logs show 0019 applied while 0015 failed, also inspect migration runner behavior.

Acceptance criteria for migration runner:

```txt
- If any migration errors, process should return non-zero / deployment should know it failed.
- Summary must clearly report errors and not imply success.
- Later migrations must not be applied after a failed dependency migration unless explicitly configured and documented as safe.
```

If making runner fail-fast is risky for current production, document the risk and create the smallest safe improvement.

## Part D — Stock deduction/cancel/refund/restore policy

This was originally the P8.4 topic and must still be documented.

Current observed behavior from Post-P8.2:

```txt
Stock deducts at first payment recording, including partial payment.
Unpaid draft/confirmed order does not deduct stock.
Cancel of unpaid order does not restore stock because stock was never deducted.
Refund/void endpoint was not available in the tested AuraPoS flow.
```

Document and enforce policy:

```txt
- Deduction timing remains first payment recording unless changed intentionally.
- Partial payment deducts stock once on first payment only.
- Additional payment does not deduct again.
- Retry/idempotency does not duplicate stock movement.
- Cancel unpaid order does not restore stock.
- If cancel/refund paid order exists or is added later, stock restoration policy must be explicit.
```

Do not implement full refund/void stock restoration unless it already exists and only needs a small fix. If it is missing, document it as a follow-up task.

## Required automated tests

Add/update tests for:

```txt
1. Basic Starter/new onboarding stock basic entitlement is active by default if intended.
2. `/api/inventory/products` returns 200 for Basic Starter tenant with Stok Dasar active.
3. `/api/inventory/products` returns 403 for tenant without Stok Dasar.
4. stockTrackingEnabled product appears in stock list with no movement.
5. stockTrackingEnabled product appears in stock list with stock 0/null.
6. advanced inventory remains gated separately from basic stock.
7. migration repair/preflight handles legacy slug tenant id safely or reports actionable failure.
8. migration runner fails/flags correctly when a migration errors.
9. first partial payment deducts stock once.
10. second/final payment does not deduct stock again.
```

If some tests require integration DB, create focused DB tests and document how to run them with `DATABASE_URL`.

## Required manual validation

Run against local/staging data that mirrors production:

```txt
1. Seed or create Basic Starter tenant.
2. Confirm Stok Dasar is active.
3. Login as tenant owner.
4. Create/select product.
5. Enable stock tracking.
6. Open stock page.
7. Confirm product appears.
8. Call GET /api/inventory/products; expect 200.
9. Confirm tenant without Stok Dasar still receives 403.
10. Apply migrations on a DB containing legacy slug tenant id if possible; verify repair/fail-fast behavior.
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

Run focused tests added/updated in this task.

Do not hide `DATABASE_URL`-dependent failures. If a full test script is not actionable without DB, document exact focused commands that were run.

## Documentation output

Create report:

```txt
roadmap/refactor/reports/post-p8-4-stock-basic-entitlement-migration-policy-report.md
```

Include:

```md
# Post-P8.4 Stock Basic Entitlement, Migration Recovery, and Policy Report

## Production cases

### Basic Starter stock page 403
- Root cause:
- Fix:
- Validation:

### Migration 0015 legacy tenant id failure
- Root cause:
- Fix:
- Migration/runner changes:
- Validation:

## Stock policy

- Deduction timing:
- Partial payment behavior:
- Cancel unpaid behavior:
- Paid refund/void behavior:
- Follow-up required:

## Tests

- Automated:
- Manual:

## Commands

- `pnpm check:boundaries`:
- `pnpm --filter @pos/domain type-check`:
- `pnpm --filter @pos/application type-check`:
- `pnpm --filter @pos/infrastructure type-check`:
- `pnpm --filter @pos/api type-check`:
- `pnpm --filter @pos/terminal-web type-check`:
- `pnpm type-check`:
- `pnpm run db:check`:

## Final decision

- Basic Starter Stok Dasar default fixed: yes/no
- Stock page 403 fixed: yes/no
- Tracked product visible for Basic Starter: yes/no
- Migration 0015 production failure handled: yes/no
- Migration runner fail-fast improved: yes/no
- Stock policy documented/enforced: yes/no
- Ready for next task: yes/no
```

## Commit

Use one of these depending on actual changes:

```bash
git commit -m "fix(inventory): enable basic stock access for starter tenants"
```

or, if migration runner/repair is included:

```bash
git commit -m "fix(inventory): repair stock entitlement and uuid migration recovery"
```

Then push.

## Final response required

Report:

```txt
Post-P8.4 status:
Commit SHA:
Files changed:
Basic Starter stock page fixed: yes/no
Production 403 root cause:
Migration 0015 root cause:
Migration/runner changes:
Tests added/run:
Commands run:
Manual validation result:
DB schema changed: yes/no
Migration generated: yes/no
Boundary check: pass/fail
Follow-up required: yes/no
```
