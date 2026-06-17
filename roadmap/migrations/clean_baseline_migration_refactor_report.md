# Clean Baseline Migration Refactor Report

**Date:** 2026-06-17  
**Scope:** Total migration cleanup — development baseline only, no production data.

---

## Active Migration Chain

| File | Purpose |
|------|---------|
| `0000_extensions.sql` | pgcrypto extension |
| `0001_business_types.sql` | Global business type catalog |
| `0002_tenants.sql` | tenants, tenant_entitlements, Better Auth tables (user/session/account/verification), legacy users |
| `0003_outlets.sql` | outlets, user_outlet_assignments |
| `0004_catalog.sql` | product_categories, products, outlet_product_configs, product_option_groups, product_options |
| `0005_seating.sql` | tables |
| `0006_order_types.sql` | order_types, tenant_order_types, order_number_sequences |
| `0007_orders.sql` | orders, order_items, order_item_modifiers, order_payments |
| `0008_inventory.sql` | inventory_movements, inventory_sync_errors |
| `0009_kitchen_kds.sql` | kitchen_tickets, kds_devices |
| `0010_cfd_sync.sql` | terminals, sync_batches, sync_events, server_sync_conflicts, cfd_devices |
| `0011_seed_business_types.sql` | Idempotent business type seeds |
| `0012_seed_order_types.sql` | Idempotent order type seeds |

---

## Backup Migration List

All 24 old migrations moved to `migrations/backup/`:

```
0000_conscious_invisible_woman.sql
0001_loose_frank_castle.sql
0002_uneven_trauma.sql
0003_create_tables.sql
0004_orders_idempotency_key.sql
0005_served_status_and_order_hardening.sql
0006_auth_tables.sql
0007_add_table_number_to_kitchen_tickets.sql
0007_order_payments_idempotency_unique.sql
0008_offline_sync_engine.sql
0009_sprint5_conflicts.sql
0010_multi_outlet.sql
0011_inventory_sync_errors.sql
0012_order_number_sequences.sql
0013_kds_pairing_security.sql
0014_cfd_device_tokens.sql
0015_native_uuid_alignment.sql
0016_tenant_features_unique_upsert.sql
0017_inventory_movements_order_product_movement_unique.sql
0018_order_query_indexes.sql
0019_inventory_movement_traceability.sql
0020_basic_stock_default_entitlement.sql
0022_single_tenant_entitlements.sql
0023_seed_business_types.sql
0024_seed_order_types.sql
```

---

## Full Table Inventory

### Tables from Drizzle schema (`packages/infrastructure/db/schema/`)

| Table | Schema File | Baseline File |
|-------|-------------|---------------|
| `business_types` | tenants.schema.ts | 0001 |
| `users` | auth.schema.ts | 0002 |
| `user` | apps/api/src/lib/auth-schema.ts | 0002 |
| `session` | apps/api/src/lib/auth-schema.ts | 0002 |
| `account` | apps/api/src/lib/auth-schema.ts | 0002 |
| `verification` | apps/api/src/lib/auth-schema.ts | 0002 |
| `tenants` | tenants.schema.ts | 0002 |
| `tenant_entitlements` | tenants.schema.ts | 0002 |
| `outlets` | outlets.schema.ts | 0003 |
| `user_outlet_assignments` | outlets.schema.ts | 0003 |
| `product_categories` | catalog.schema.ts | 0004 |
| `products` | catalog.schema.ts | 0004 |
| `outlet_product_configs` | catalog.schema.ts | 0004 |
| `product_option_groups` | catalog.schema.ts | 0004 |
| `product_options` | catalog.schema.ts | 0004 |
| `tables` | seating.schema.ts | 0005 |
| `order_types` | orders.schema.ts | 0006 |
| `tenant_order_types` | orders.schema.ts | 0006 |
| `order_number_sequences` | orders.schema.ts | 0006 |
| `orders` | orders.schema.ts | 0007 |
| `order_items` | orders.schema.ts | 0007 |
| `order_item_modifiers` | orders.schema.ts | 0007 |
| `order_payments` | orders.schema.ts | 0007 |
| `inventory_movements` | inventory.schema.ts | 0008 |
| `inventory_sync_errors` | inventory.schema.ts | 0008 |
| `kitchen_tickets` | kds.schema.ts | 0009 |
| `terminals` | cfd.schema.ts | 0010 |
| `sync_batches` | cfd.schema.ts | 0010 |
| `sync_events` | cfd.schema.ts | 0010 |
| `server_sync_conflicts` | cfd.schema.ts | 0010 |

### Tables managed outside Drizzle schema (raw SQL in routes)

| Table | Active Code Reference | Baseline File |
|-------|----------------------|---------------|
| `kds_devices` | `apps/api/src/http/routes/kds.ts` | 0009 |
| `cfd_devices` | `apps/api/src/realtime/cfd/CfdAuthService.ts` | 0010 |

### Tables intentionally excluded (dropped in 0022)

| Table | Reason |
|-------|--------|
| `tenant_features` | Superseded by `tenant_entitlements` |
| `tenant_module_configs` | Superseded by `tenant_entitlements` |

---

## Dependency Rationale

1. **pgcrypto first** — `gen_random_uuid()` requires it on PostgreSQL < 14.
2. **business_types before tenants** — `tenants.business_type` has FK to `business_types.code`.
3. **tenants before all operational tables** — all tenant-scoped tables cascade delete from tenants.
4. **Better Auth tables in 0002** — `user.tenant_id` is a soft text reference to tenants; `session` and `account` FK to `user`.
5. **outlets after tenants** — `outlets.tenant_id` FK.
6. **catalog after outlets** — `outlet_product_configs.outlet_id` FK; `products.category_id` FK to `product_categories`.
7. **seating after outlets** — `tables.outlet_id` FK. `tables.current_order_id` is a **soft reference** (no FK) to avoid circular dependency with orders.
8. **order_types after outlets** — `tenant_order_types` FKs to outlets and order_types.
9. **orders after order_types** — `orders.order_type_id` FK.
10. **inventory after orders** — `inventory_movements.order_id` FK.
11. **kitchen/KDS after orders** — `kitchen_tickets.order_id` FK.
12. **CFD/sync after outlets** — all sync tables scope to tenant + outlet.
13. **Seeds last** — data depends on tables existing.

---

## Old Migration → New Baseline Mapping

| Old Migration | Changes Folded Into |
|---------------|---------------------|
| `0000_conscious_invisible_woman.sql` | Core tables → 0002–0007; tenant_features dropped (0022 supersedes) |
| `0001_loose_frank_castle.sql` | business_types → 0001; tenants.business_type → 0002; tenant_module_configs dropped |
| `0002_uneven_trauma.sql` | order_types.affects_service_charge default → 0006; unique index change → 0006 (no unique on tenant_order_types in multi-outlet) |
| `0003_create_tables.sql` | tables → 0005 |
| `0004_orders_idempotency_key.sql` | orders.idempotency_key + index → 0007 |
| `0005_served_status_and_order_hardening.sql` | orders.closed_at, cancellation_reason, tenant_order_number_unique → 0007 |
| `0006_auth_tables.sql` | Better Auth tables → 0002; order_payments.idempotency_key → 0007; products.metadata → 0004 |
| `0007_add_table_number_to_kitchen_tickets.sql` | kitchen_tickets.table_number → 0009 |
| `0007_order_payments_idempotency_unique.sql` | order_payments partial unique index → 0007 |
| `0008_offline_sync_engine.sql` | orders offline fields → 0007; terminals → 0010; sync_batches → 0010; sync_events → 0010; server_sync_conflicts → 0010 |
| `0009_sprint5_conflicts.sql` | server_sync_conflicts enrichment → 0010; inventory_movements → 0008 |
| `0010_multi_outlet.sql` | outlets → 0003; user_outlet_assignments → 0003; outlet_product_configs → 0004; outlet_id on all tables → folded into each table's creation file; kds_devices.outlet_id → 0009; tables unique index change → 0005 |
| `0011_inventory_sync_errors.sql` | inventory_sync_errors → 0008 |
| `0012_order_number_sequences.sql` | order_number_sequences → 0006 |
| `0013_kds_pairing_security.sql` | kds_devices.activation_attempts + activation_locked_until + indexes → 0009 |
| `0014_cfd_device_tokens.sql` | cfd_devices → 0010 |
| `0015_native_uuid_alignment.sql` | All varchar/text UUID columns → native uuid in every baseline table. Entire migration obsolete. |
| `0016_tenant_features_unique_upsert.sql` | tenant_features dropped (0022 supersedes); no fold needed |
| `0017_inventory_movements_order_product_movement_unique.sql` | Partial unique index → 0008 |
| `0018_order_query_indexes.sql` | Composite order indexes → 0007 |
| `0019_inventory_movement_traceability.sql` | inventory_movements.payment_id, reference_type, reference_id, metadata → 0008 |
| `0020_basic_stock_default_entitlement.sql` | Data backfill on tenant_module_configs (dropped) — not needed in clean baseline |
| `0022_single_tenant_entitlements.sql` | tenant_entitlements → 0002; tenant_features and tenant_module_configs dropped |
| `0023_seed_business_types.sql` | → 0011 |
| `0024_seed_order_types.sql` | → 0012 |

---

## Migration Runner Changes

**File:** `apps/api/src/migrations/migrationRunner.ts`

**Change:** Removed `42830` (invalid_foreign_key) from `ALREADY_APPLIED_CODES`.

**Reason:** In the clean baseline all FK targets exist at the time each referencing table is created. If a FK error occurs it indicates a real dependency problem that must fail fast, not be silently swallowed. The old `42830` entry was added to tolerate schema drift from incremental ALTER TABLE chains — which the clean baseline eliminates entirely.

The runner already correctly fails fast for:
- `42P01` (undefined_table) — not in ALREADY_APPLIED_CODES ✓
- `23503` (FK violation on insert) — not in ALREADY_APPLIED_CODES ✓

---

## Validation Results

Type check and smoke test must be run against a fresh database after applying this baseline.

### Expected clean run sequence
```
✓ Applied migration: 0000_extensions.sql
✓ Applied migration: 0001_business_types.sql
✓ Applied migration: 0002_tenants.sql
✓ Applied migration: 0003_outlets.sql
✓ Applied migration: 0004_catalog.sql
✓ Applied migration: 0005_seating.sql
✓ Applied migration: 0006_order_types.sql
✓ Applied migration: 0007_orders.sql
✓ Applied migration: 0008_inventory.sql
✓ Applied migration: 0009_kitchen_kds.sql
✓ Applied migration: 0010_cfd_sync.sql
✓ Applied migration: 0011_seed_business_types.sql
✓ Applied migration: 0012_seed_order_types.sql
DB migrations done — applied: 13, skipped: 0, errors: 0
```

### Smoke check endpoints
- `GET /api/tenants/:slug/entitlements` — tenant_entitlements
- `GET /api/outlets` — outlets
- `GET /api/products` — products, product_categories
- `POST /api/orders` — orders, order_items
- `POST /api/cfd/session` — cfd_devices
- `POST /api/kds/generate-code` — kds_devices
- `POST /api/kds/verify-code` — kds_devices

---

## Remaining Issues

1. **Existing databases** — drizzle migration tracking (`drizzle.__drizzle_migrations`) must be cleared before applying the clean baseline on a previously-migrated database. For development: drop and recreate the database.
2. **`users` table (legacy)** — `packages/infrastructure/db/schema/auth.schema.ts` still exports a `users` table that is no longer used for auth (Better Auth's `user` table is used instead). Included in 0002 for Drizzle schema compatibility. Can be removed in a future cleanup once auth.schema.ts is updated.
3. **`tables.current_order_id`** — soft reference (no FK) to avoid circular dependency with orders. Application-layer consistency responsibility.
