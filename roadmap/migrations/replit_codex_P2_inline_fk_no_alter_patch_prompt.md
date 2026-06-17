# Replit/Codex Prompt P2 — Patch Clean Baseline Migrations To Remove ALTER TABLE

Repository: `Rndynt/AuraPoS`

## Context

P1 migration refactor was committed as:

`ffa5073fc8169881494c8a267680e63628789076`

It created the new baseline migration chain and moved old migrations to `migrations/backup/`.

However, P1 is not complete because active baseline migrations still contain `ALTER TABLE ... ADD CONSTRAINT` for foreign keys. That violates the clean baseline requirement: tables must be created complete from the start.

## Objective

Patch the existing clean baseline migrations so active root migrations contain **zero `ALTER TABLE` statements**.

Do not rebuild the whole task again. Patch only the active baseline SQL files and the migration report.

## Hard Rules

1. Do not create any new migration file.
2. Do not create `ensure_*`, `repair_*`, `drift_*`, or compatibility migrations.
3. Do not move files again unless P1 left a file in the wrong place.
4. Do not change app logic, UI, routes, entitlement logic, POS flow, KDS flow, or CFD flow.
5. Do not use `ALTER TABLE` anywhere in active root `migrations/*.sql`.
6. Move every FK currently added by `ALTER TABLE ... ADD CONSTRAINT` into the owning table's `CREATE TABLE` statement.
7. Keep soft references soft when needed to avoid circular dependencies.
8. Update the report with actual validation results.

## Files To Patch

Audit all active root SQL migrations, but at minimum patch these files because they currently contain `ALTER TABLE`:

```txt
migrations/0002_tenants.sql
migrations/0003_outlets.sql
migrations/0004_catalog.sql
migrations/0005_seating.sql
migrations/0006_order_types.sql
migrations/0007_orders.sql
migrations/0008_inventory.sql
migrations/0009_kitchen_kds.sql
migrations/0010_cfd_sync.sql
```

## Required SQL Style

Use this style inside `CREATE TABLE`:

```sql
CREATE TABLE "child_table" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "parent_id" uuid NOT NULL,
  CONSTRAINT "child_table_parent_id_parent_table_id_fk"
    FOREIGN KEY ("parent_id") REFERENCES "public"."parent_table"("id") ON DELETE cascade ON UPDATE no action
);
```

Do not write this in active migrations:

```sql
ALTER TABLE "child_table"
  ADD CONSTRAINT ...
```

## Known Soft Reference

`tables.current_order_id` should remain a soft nullable reference if adding FK would create circular dependency with `orders`. Document it in the report. Do not create an ALTER just for it.

## Required Verification Commands

Run and record results:

```bash
rg -n "ALTER TABLE" migrations --glob "*.sql" --glob "!backup/**"
rg -n "ADD CONSTRAINT" migrations --glob "*.sql" --glob "!backup/**"
rg -n "ensure_|repair_|drift_|hotfix_" migrations --glob "*.sql" --glob "!backup/**"
pnpm type-check
pnpm --filter @pos/api type-check
pnpm --filter @pos/terminal-web type-check
```

Expected grep result for active migrations:

```txt
No matches for ALTER TABLE
No matches for ADD CONSTRAINT
No ensure/repair/drift/hotfix active migration files
```

## Clean Database Smoke Test

Run against a clean development database or clean schema.

Expected migration result:

```txt
DB migrations done — applied: 13, skipped: 0, errors: 0
```

Smoke endpoints:

```txt
/api/me/entitlements
/api/outlets
/api/catalog/products
/api/orders
/api/cfd/session-token
/api/kds/devices
/api/kds/generate-code
```

## Report Update

Update:

`roadmap/migrations/clean_baseline_migration_refactor_report.md`

Add a new section:

```txt
## P2 No-ALTER Patch Result
```

Include:

1. list of migration files patched;
2. confirmation that active root SQL has zero `ALTER TABLE`;
3. explanation that FKs were moved into table-level constraints inside `CREATE TABLE`;
4. soft-reference notes, if any;
5. actual validation command output;
6. clean DB smoke result or exact reason if not run.

## Commit

Commit only migration SQL and report changes.

Commit message:

`fix(migrations): inline baseline foreign keys without alter table`
