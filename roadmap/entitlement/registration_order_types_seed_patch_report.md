# Registration Order Types Seed Patch Report

## Status

Complete.

## Problem

Registration still failed after business_types were seeded because the next reference table was missing required order types.

Runtime error:

```txt
RegistrationError: Required order types are not seeded: DINE_IN, TAKE_AWAY, DELIVERY
```

`registerTenantOwner` reads `ENTITLEMENT_CATALOG.businessTypes[businessType].orderTypes`, then looks up `order_types.code`. For `CAFE_RESTAURANT`, the SOT requires:

```txt
DINE_IN
TAKE_AWAY
DELIVERY
```

Other business types require:

```txt
WALK_IN
```

The registration flow correctly refuses to continue when required operational order types are absent, but the reference rows were missing from the database migration seed path.

## Fix

Added:

```txt
migrations/0024_seed_order_types.sql
```

The migration idempotently upserts:

```txt
DINE_IN
TAKE_AWAY
DELIVERY
WALK_IN
```

These are operational order type reference rows, not commercial entitlements.

## Invariants

- Does not recreate tenant_features.
- Does not recreate tenant_module_configs.
- Does not persist default entitlements to tenant_entitlements.
- Does not add order types as marketplace entitlements.
- Keeps tenant.slug separate from default outlet slug `main`.
- Supports all orderTypes currently referenced by ENTITLEMENT_CATALOG.businessTypes.

## Required runtime action

The running Replit API process must pick up the new migration.

Either restart the API/server so the migration runner applies `0024_seed_order_types.sql`, or run the migration command used by the project.

Expected migration result after restart:

```txt
0024_seed_order_types.sql applied
order_types has DINE_IN, TAKE_AWAY, DELIVERY, WALK_IN
```

## Verification query

```sql
SELECT code, name FROM order_types ORDER BY code;
```

Expected rows:

```txt
DELIVERY
DINE_IN
TAKE_AWAY
WALK_IN
```

## Commit

```txt
fix(registration): seed order types reference data
```
