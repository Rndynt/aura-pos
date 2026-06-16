# Replit/Codex Prompt — AuraPoS Total Clean Baseline Migration Refactor

Repository: `Rndynt/AuraPoS`

## Objective

Refactor **all database migrations** into one clean development baseline. This is not a small KDS/CFD fix. This is a total migration cleanup for every table used by AuraPoS.

The app is still development-only. There is no production data and no legacy data to preserve.

## Required Outcome

Move every current root SQL migration into:

`migrations/backup/`

Then create a new active migration chain in `migrations/` root. The new chain must create the complete current schema from zero in dependency order.

## Hard Rules

- No `ensure_*` migrations.
- No `repair_*` migrations.
- No drift patch migrations.
- No legacy compatibility migrations.
- No data backfill migrations.
- No incremental column-add chain.
- Do not change UI, routes, entitlements, POS logic, KDS logic, or CFD logic.
- Use current code and schema as source of truth.
- Every final table must be created with its complete final columns, defaults, constraints, indexes, unique indexes, and foreign keys in its owning migration.

## Source Audit Required First

Read every schema file under:

`packages/infrastructure/db/schema/`

Read all current SQL migrations before moving them to backup.

Search active API/package code for every raw table name. Do not only check KDS/CFD. Build a full table inventory before writing migrations.

## Required Active Migration Chain

Use this active file order and naming unless a dependency audit proves a better order:

1. `0000_extensions.sql` — database extensions.
2. `0001_business_types.sql` — global business type catalog.
3. `0002_tenants.sql` — tenants and tenant entitlement grants.
4. `0003_outlets.sql` — outlets and outlet assignments.
5. `0004_catalog.sql` — product catalog and product options.
6. `0005_seating.sql` — restaurant table service.
7. `0006_order_types.sql` — global and tenant order type configuration.
8. `0007_orders.sql` — orders, items, modifiers, payments, and active payment-flow tables.
9. `0008_inventory.sql` — inventory ledger and sync/error tables.
10. `0009_kitchen_kds.sql` — kitchen tickets and KDS device tables.
11. `0010_cfd_sync.sql` — customer display and sync runtime tables.
12. `0011_seed_business_types.sql` — idempotent business type seeds.
13. `0012_seed_order_types.sql` — idempotent order type seeds.

## Explicit Table Coverage

### `0000_extensions.sql`

Purpose: prepare database primitives.

Must include required extensions used by UUID/hash generation, including `pgcrypto` if current schema uses `gen_random_uuid()`.

### `0001_business_types.sql`

Create complete table:

- `business_types`

Include code/id, label/name, description, active flag, metadata/settings if used, timestamps, unique constraints, and lookup indexes.

### `0002_tenants.sql`

Create complete tables:

- `tenants`
- `tenant_entitlements`
- any current tenant-level module/config table still referenced by active code

`tenants` must include final fields such as id, name, slug, business identity, business type reference, plan tier, subscription status, timezone, currency, locale, settings, active flag, created timestamp, updated timestamp, and all final indexes.

`tenant_entitlements` must include tenant id, entitlement code, source, status, expiry, metadata if used, timestamps, and indexes/unique constraints required by current entitlement code.

### `0003_outlets.sql`

Create complete tables:

- `outlets`
- `user_outlet_assignments`

Include tenant id, outlet identity, outlet code/slug if used, address, phone, default outlet flag, active flag, settings, user id assignment, role if used, timestamps, indexes, and unique constraints.

### `0004_catalog.sql`

Create complete tables:

- `product_categories`
- `products`
- `outlet_product_configs`
- `product_option_groups`
- `product_options`

Include all final product/catalog fields: tenant id, outlet id where applicable, category id, product identity, SKU, barcode, price, cost, image, stock tracking flag, stock quantity, low stock threshold, variants/options, active flag, metadata, timestamps, indexes, FK constraints, and unique SKU/barcode rules if current schema expects them.

### `0005_seating.sql`

Create complete table:

- `tables`

Include tenant id, outlet id, table number/name, floor, capacity, status, current order reference if used, active flag, timestamps, unique rule for table number per outlet/tenant, and indexes. Avoid circular FK if current order reference would create circular dependency; document it as soft reference if needed.

### `0006_order_types.sql`

Create complete tables:

- `order_types`
- `tenant_order_types`
- `order_number_sequences`

Include global order type code/label, tenant enablement, config fields, sequence prefix/current number/reset fields if used, timestamps, indexes, and unique constraints.

### `0007_orders.sql`

Create complete tables:

- `orders`
- `order_items`
- `order_item_modifiers`
- `order_payments`

Also include these only if current active code references them:

- `payment_sessions`
- `split_bills`
- `split_bill_items`
- `split_bill_payments`

`orders` must include final fields for tenant, outlet, order number, order type, sales channel, status, payment status, subtotal, discount, tax, service charge, total, paid amount, customer fields, table reference, notes, idempotency key, terminal/source fields, local/offline order id, closed/cancelled fields, timestamps, indexes, and unique rules.

`order_items`, modifiers, and payments must include every current final field, including snapshot fields, quantities, prices, payment method, payment provider references, idempotency fields, metadata, timestamps, indexes, and unique constraints.

### `0008_inventory.sql`

Create complete tables:

- `inventory_movements`
- `inventory_sync_errors`

Include tenant, outlet, product, order/payment references if used, movement type, quantities before/after, unit cost, reference type/id, reason, actor, terminal/source fields, retry/error fields, metadata, timestamps, and indexes.

### `0009_kitchen_kds.sql`

Create complete tables:

- `kitchen_tickets`
- `kds_devices`

This is not a patch. Create the full KDS schema from zero. `kds_devices` must include all fields used by current KDS routes and old KDS security migration: tenant id, outlet id, device name, API key, activation code, activation expiry, activation attempts, lock-until field, status, activated timestamp, last-seen timestamp, revoked timestamp if used, created/updated timestamps, indexes, and partial indexes.

### `0010_cfd_sync.sql`

Create complete tables:

- `terminals`
- `sync_batches`
- `sync_events`
- `server_sync_conflicts`
- `cfd_devices`

Create the full CFD/sync schema from zero. `cfd_devices` must include the fields from the existing CFD token migration and current CFD routes: tenant id, device name, API key, status, created timestamp, activated timestamp, last-seen timestamp, revoked timestamp, indexes, and partial indexes.

### `0011_seed_business_types.sql`

Seed all supported business types idempotently, including cafe/restaurant, retail/minimarket, laundry, service/appointment, digital/PPOB, and any other type used by registration.

### `0012_seed_order_types.sql`

Seed all supported order types idempotently, including dine-in, takeaway, delivery, walk-in, and any other type used by the app.

## Fold Old Changes Into New Tables

Every old migration that added a column, index, unique index, FK, enum/status field, local/offline field, device field, payment field, or outlet field must be folded into the relevant new table creation file.

The report must map every old migration file to the new baseline file where its schema changes were folded.

## Migration Runner

Review `apps/api/src/migrations/migrationRunner.ts`.

It must not mark missing relation/table errors as applied. Missing tables must fail fast during development.

## Required Report

Create:

`roadmap/migrations/clean_baseline_migration_refactor_report.md`

Report must include active migration list, backup migration list, full table inventory, dependency rationale, old-to-new migration mapping, all old ALTER/fix changes and where they were folded, validation results, and remaining issues.

## Validation

Run type checks for root, API, and terminal web. Test on a fresh development database. The expected clean run is that the new baseline applies in order with zero missing-table errors.

Smoke check core runtime endpoints including entitlements, outlets, products, orders, CFD session token, KDS devices, and KDS generate code.

## Commit

Commit only migration cleanup, migration runner safety if needed, and migration report.

Commit message:

`refactor(migrations): rebuild clean development baseline`
