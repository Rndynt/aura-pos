# Entitlement Phase 1 — Single SOT + Single Entitlement Table Cleanup

## Context

AuraPoS currently has entitlement, feature, module, plan, marketplace, onboarding, and business-type logic spread across multiple places.

Current problematic sources include:

```txt
apps/api/src/constants/planFeatureMap.ts
packages/application/tenants/businessTypeTemplates.ts
feature catalog / marketplace hardcodes
apps/api/src/http/helpers/inventoryEntitlement.ts
migrations/0021_repair_basic_stock_runtime_entitlement.sql
tenant_features
tenant_module_configs
```

This created confusion and bugs such as Basic Stock / Stok Dasar showing as active in UI/business setup while `/api/inventory/products` still returned `403 MODULE_REQUIRED`.

This project is still in development. Do not preserve legacy entitlement tables or legacy compatibility layers. The goal is a clean entitlement architecture, not runtime repair for old data.

## Objective

Implement **Phase 1 Entitlement Cleanup**.

The target architecture must have:

```txt
1. One single SOT file for plan, feature, module, offer/addon, business type template, and pricing rules.
2. One single tenant entitlement table for purchased/trial/manual entitlements.
3. No tenant_features table.
4. No tenant_module_configs table.
5. No runtime self-heal resolver.
6. No legacy db mapping layer.
7. No duplicated feature/module/plan hardcode across API/frontend/application packages.
```

## Final SOT file

Create exactly one SOT config file:

```txt
packages/application/entitlements/entitlementCatalog.ts
```

Do not use app-brand-specific names such as:

```txt
auraSot.ts
auraEntitlementCatalog.ts
```

Use the generic name `entitlementCatalog.ts` so the file does not need to be renamed if the product brand changes later.

## Mandatory SOT shape

The SOT must contain these sections in one exported object:

```ts
export const ENTITLEMENT_CATALOG = {
  meta: {},
  billingIntervals: {},
  plans: {},
  entitlements: {},
  offers: {},
  businessTypes: {},
} as const;
```

The file must also export derived types from object keys:

```ts
export type EntitlementCatalog = typeof ENTITLEMENT_CATALOG;
export type PlanCode = keyof EntitlementCatalog["plans"];
export type EntitlementCode = keyof EntitlementCatalog["entitlements"];
export type OfferCode = keyof EntitlementCatalog["offers"];
export type BusinessTypeCode = keyof EntitlementCatalog["businessTypes"];
```

Do not create a separate duplicated constant object like:

```ts
export const ENTITLEMENT = { ... };
export const ENTITLEMENT_REGISTRY = { ... };
```

That duplication is not allowed.

The entitlement code must be the key of `ENTITLEMENT_CATALOG.entitlements`.

Example pattern:

```ts
entitlements: {
  inventory_basic_stock: {
    label: "Stok Dasar",
    kind: "module",
    area: "inventory",
  },
}
```

Not this:

```ts
ENTITLEMENT.INVENTORY_BASIC_STOCK
code: ENTITLEMENT.INVENTORY_BASIC_STOCK
[ENTITLEMENT.INVENTORY_BASIC_STOCK]
```

## SOT rules

### Rule 1 — Feature/module list first

`entitlements` is the registry of commercial/access-controlled capabilities only.

Do not include internal platform/RBAC/system operations such as:

```txt
staff.users
staff.roles
staff.permissions
staff.owner_role
platform.tenant_management
platform.plan_management
platform.marketplace
platform.billing_subscription
platform.feature_purchase
platform.audit_log
platform.notification
```

Those are internal/core platform permissions, not commercial tenant entitlements.

### Rule 2 — Included plan feature has no individual price

An entitlement included in a plan does not have a price in the entitlement registry.

Price belongs only to:

```txt
plans.<plan>.price
offers.<offer>.price
```

If a feature is included by a plan, it is paid through the plan price.

If a feature can be sold separately, create an `offers` entry for it.

### Rule 3 — Plan hierarchy is cumulative

Plan entitlements must be cumulative by `sortOrder`.

Example:

```txt
Starter sortOrder 10
Growth  sortOrder 20
Pro     sortOrder 30
```

A tenant on Pro must automatically receive:

```txt
Starter included entitlements
+ Growth included entitlements
+ Pro included entitlements
```

Do not duplicate Growth features inside Pro just to make them available.

### Rule 4 — Add-on / offer can require minimum plan

Support both cases:

```txt
Case A: Perpendek Struk can be bought from Starter/free onboarding plan.
Case B: Antrian Order can only be bought independently after tenant reaches Growth.
```

This belongs in `offers`, not in `entitlements`.

Example shape:

```ts
offers: {
  receipt_compact_monthly: {
    entitlement: "receipt_compact",
    requiredPlan: "starter",
    price: 15000,
    billingInterval: "monthly",
    expires: true,
  },
  orders_queue_addon: {
    entitlement: "orders_queue",
    requiredPlan: "growth",
    price: 25000,
    billingInterval: "monthly",
    expires: true,
  },
}
```

### Rule 5 — Business type defaults come from SOT

Tenant registration must load defaults based on selected `businessType`.

Example:

```txt
businessTypes.CAFE_RESTAURANT.defaultPlan
businessTypes.CAFE_RESTAURANT.defaultEntitlements
businessTypes.CAFE_RESTAURANT.recommendedEntitlements
businessTypes.CAFE_RESTAURANT.orderTypes
```

No separate `businessTypeTemplates.ts` hardcode may remain as an independent SOT.

## Required initial SOT contents

Create a complete but practical first catalog. Include at minimum these entries.

### Plans

```txt
starter
growth
pro
```

Each plan must have:

```txt
label
sortOrder
price
billingInterval
included
```

### Billing intervals

```txt
none
one_time
monthly
yearly
```

### Entitlements

Include at minimum:

```txt
inventory_basic_stock
inventory_advanced_stock
inventory_stock_adjustment
inventory_stock_movement_history
inventory_stock_opname
inventory_stock_transfer
inventory_low_stock_alert
inventory_reports

payments_cash
payments_manual_qris
payments_manual_bank_transfer
payments_partial_payment
payments_multi_payment
payments_split_payment

receipt_standard
receipt_reprint
receipt_compact

orders_queue
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

restaurant_table_management
restaurant_floor_layout
restaurant_kitchen_ticket
restaurant_kds
restaurant_kitchen_printer

reports_sales_basic
reports_sales_advanced
reports_inventory
reports_cashier
reports_export

multi_location_outlets
multi_location_stock
multi_location_reports

hardware_receipt_printer
hardware_label_printer
hardware_barcode_scanner
hardware_cash_drawer

integrations_payment_gateway
integrations_accounting
integrations_webhook
integrations_api_access
```

Do not include staff/RBAC/platform admin internals as commercial entitlements.

### Business types

Include existing business types:

```txt
CAFE_RESTAURANT
RETAIL_MINIMARKET
LAUNDRY
SERVICE_APPOINTMENT
DIGITAL_PPOB
```

Each business type must define:

```txt
label
defaultPlan
defaultEntitlements
recommendedEntitlements
orderTypes
```

Basic Stock must be default enabled for onboarding business types where the product policy says Basic Stock is starter/default.

## Database target

Remove old entitlement storage:

```txt
tenant_features
tenant_module_configs
```

Create one new table:

```txt
tenant_entitlements
```

Schema:

```txt
id uuid primary key
tenant_id uuid not null references tenants(id) on delete cascade
entitlement_code text not null
source varchar(50) not null
status varchar(50) not null default 'active'
starts_at timestamp not null default now()
expires_at timestamp nullable
config jsonb nullable
created_at timestamp not null default now()
updated_at timestamp not null default now()
```

Add indexes:

```txt
tenant_id
entitlement_code
status
expires_at
tenant_id + entitlement_code unique where status = active if supported safely
```

Allowed `source` values:

```txt
purchase
manual_grant
trial
```

Allowed `status` values:

```txt
active
expired
cancelled
```

Do not store plan-default entitlements in DB.

Do not store business-type-default entitlements in DB.

DB stores only entitlements that are purchased, manually granted, or trial-based.

## Migration requirements

Because this app is still in development, use a clean destructive migration.

Create a new migration after the current latest migration:

```txt
migrations/0022_single_tenant_entitlements.sql
```

The migration must:

```txt
1. Create tenant_entitlements.
2. Drop tenant_features.
3. Drop tenant_module_configs.
4. Remove any FK/index references to the old tables safely.
5. Be explicit that old entitlement/module config data is discarded because this is a development cleanup.
```

Remove the P8.4B repair migration file if it exists:

```txt
migrations/0021_repair_basic_stock_runtime_entitlement.sql
```

Remove runtime self-heal docs/tests that depend on 0021.

Do not keep compatibility mapping to old tables.

Do not create `legacyDbMapping`.

Do not keep adapter code that writes to `tenant_features` or `tenant_module_configs`.

## Entitlement engine

Create a read-only entitlement engine:

```txt
packages/application/entitlements/entitlementEngine.ts
```

Required functions:

```ts
getPlanIncludedEntitlements(planCode: PlanCode): EntitlementCode[]
getBusinessTypeDefaultEntitlements(businessType: BusinessTypeCode): EntitlementCode[]
getActiveTenantEntitlementGrants(input): Promise<EntitlementCode[]>
getEffectiveEntitlements(input): Promise<Set<EntitlementCode>>
hasEntitlement(input): Promise<boolean>
requireEntitlement(input): Promise<void>
canPurchaseOffer(input): boolean
```

Rules:

```txt
1. Engine is read-only.
2. Engine must not update DB.
3. Engine must not self-heal stale data.
4. Engine must not create tenant entitlement rows during request checking.
5. Expired grants are ignored by effective entitlement calculation.
6. Cancelled grants are ignored.
7. Included plan entitlements are calculated from cumulative plan hierarchy using sortOrder.
8. Add-on purchase permission is checked through offer.requiredPlan and plan sortOrder.
```

## API guard behavior

All feature/module access checks must use entitlement code.

Use:

```ts
await requireEntitlement({
  tenantId: req.tenantId!,
  entitlementCode: "inventory_basic_stock",
});
```

Do not use:

```txt
enableInventory
enableInventoryAdvanced
enableKitchenTicket
tenant_features feature_code direct checks
resolveBasicStockEntitlement
```

Required route conversions in this phase:

```txt
GET /api/inventory/products -> inventory_basic_stock
PUT /api/inventory/products/:id/adjust -> inventory_basic_stock
GET /api/inventory/movements -> inventory_advanced_stock
POST /api/inventory/movements -> inventory_advanced_stock
GET /api/inventory/report -> inventory_reports or inventory_advanced_stock, choose one and document
```

If other routes use `tenant_features` or `tenant_module_configs`, update them if they are easy and safe. Otherwise document remaining references as Phase 2 blockers. Do not leave inventory routes on old flags.

## Registration behavior

Registration must use `entitlementCatalog.ts`.

On tenant registration:

```txt
1. Read selected businessType.
2. Get defaultPlan from ENTITLEMENT_CATALOG.businessTypes[businessType].defaultPlan.
3. Store defaultPlan into tenants.planTier.
4. Do not insert tenant_features.
5. Do not insert tenant_module_configs.
6. Do not persist plan-default or business-default entitlements into DB.
7. Initial effective entitlement is computed from SOT at runtime.
```

If a starter tenant has Basic Stock by SOT, `hasEntitlement(tenantId, "inventory_basic_stock")` must return true even without any `tenant_entitlements` row.

## Marketplace / purchase behavior

Marketplace must be generated from SOT:

```txt
entitlements
offers
plans
businessTypes.recommendedEntitlements
```

Purchasing an add-on:

```txt
1. Check offer exists.
2. Check tenant plan satisfies offer.requiredPlan.
3. If entitlement is already included by plan hierarchy, do not charge/purchase duplicate.
4. Insert tenant_entitlements row only for actual purchase/trial/manual grant.
5. Set expires_at if offer.expires = true.
```

If a grant expires:

```txt
1. hasEntitlement ignores it automatically.
2. Tenant falls back to plan/business-type SOT entitlements.
3. No runtime DB repair is needed.
```

## Files to remove or replace

Remove or turn into generated wrappers with no independent hardcode:

```txt
apps/api/src/constants/planFeatureMap.ts
packages/application/tenants/businessTypeTemplates.ts
featureCatalog.ts if present
apps/api/src/http/helpers/inventoryEntitlement.ts resolve/self-heal logic
migrations/0021_repair_basic_stock_runtime_entitlement.sql
```

If `planFeatureMap.ts` must temporarily remain because imports are widespread, it must export values derived from `ENTITLEMENT_CATALOG`, not its own hardcoded list.

If `businessTypeTemplates.ts` must temporarily remain because imports are widespread, it must export values derived from `ENTITLEMENT_CATALOG`, not its own hardcoded module config.

But there must be only one SOT: `entitlementCatalog.ts`.

## Explicit non-goals

Do not build full billing provider integration.

Do not implement payment gateway subscription collection.

Do not build admin UI for editing SOT.

Do not keep legacy table compatibility.

Do not add runtime self-heal.

Do not create brand-specific SOT names.

Do not include internal RBAC/platform admin permissions as commercial entitlements.

Do not charge features that are included in the tenant's plan.

Do not duplicate Growth included entitlements inside Pro.

Do not create multiple SOT files.

## Required tests

Add/update tests for:

```txt
1. entitlementCatalog has unique entitlement keys.
2. plans reference valid entitlement keys.
3. offers reference valid entitlement keys.
4. businessTypes reference valid entitlement keys.
5. plan hierarchy is cumulative.
6. Pro receives Starter + Growth + Pro entitlements.
7. included plan entitlement does not require tenant_entitlements DB row.
8. purchased active tenant_entitlement grants access.
9. expired tenant_entitlement does not grant access.
10. cancelled tenant_entitlement does not grant access.
11. offer with requiredPlan starter can be purchased by starter/growth/pro.
12. offer with requiredPlan growth cannot be purchased by starter.
13. offer with requiredPlan growth can be purchased by growth/pro.
14. registration no longer inserts tenant_features or tenant_module_configs.
15. new tenant receives Basic Stock through SOT effective entitlement.
16. inventory products endpoint requires inventory_basic_stock.
17. inventory advanced movement/report endpoint requires advanced entitlement.
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

Run focused entitlement tests and relevant API tests.

If full API tests require `DATABASE_URL`, run with DB env or document exactly why full tests cannot run.

## Required report

Create:

```txt
roadmap/entitlement/phase_1_report.md
```

Report must include:

```md
# Entitlement Phase 1 Report

## Summary

## Files added

## Files removed

## Schema changes

## SOT
- SOT file:
- Sections included:
- Old SOT files removed/replaced:

## Database
- tenant_features removed: yes/no
- tenant_module_configs removed: yes/no
- tenant_entitlements created: yes/no
- migration file:

## Engine
- getEffectiveEntitlements:
- hasEntitlement:
- requireEntitlement:
- canPurchaseOffer:

## Route changes
- inventory basic:
- inventory advanced:
- marketplace:
- registration:

## Tests

## Validation commands

## Remaining references to old entitlement tables

Run:
`rg -n "tenantFeatures|tenant_features|tenantModuleConfigs|tenant_module_configs|enableInventory|enableInventoryAdvanced|resolveBasicStockEntitlement|planFeatureMap|businessTypeTemplates" apps packages shared migrations`

List every remaining reference and justify whether it is deleted, generated wrapper, or Phase 2 blocker.

## Final decision

- Single SOT done: yes/no
- Old tables removed: yes/no
- Resolver/self-heal removed: yes/no
- Inventory Basic Stock fixed by SOT: yes/no
- Ready for Phase 2: yes/no
```

## Commit

Use commit message:

```bash
git commit -m "refactor(entitlement): consolidate SOT and replace legacy feature tables"
```

Then push.

## Final response required

Return:

```txt
Entitlement Phase 1 status:
Commit SHA:
Files changed:
SOT file:
Migration:
tenant_features removed: yes/no
tenant_module_configs removed: yes/no
tenant_entitlements created: yes/no
resolver/self-heal removed: yes/no
Registration uses SOT: yes/no
Inventory guard uses entitlement engine: yes/no
Tests added/run:
Commands run:
Remaining blockers:
```

---

## Execution Status — 2026-06-09

- [x] Created the single SOT file `packages/application/entitlements/entitlementCatalog.ts` with required sections, plans, billing intervals, entitlements, offers, and business types.
- [x] Created the read-only entitlement engine `packages/application/entitlements/entitlementEngine.ts`.
- [x] Added `tenant_entitlements` schema and `migrations/0022_single_tenant_entitlements.sql`.
- [x] Removed `migrations/0021_repair_basic_stock_runtime_entitlement.sql` and runtime Basic Stock self-heal helper behavior.
- [x] Converted registration to SOT default plan/default entitlements and stopped inserting `tenant_features` / `tenant_module_configs` / default `tenant_entitlements` rows.
- [x] Converted inventory product, movement, and report guards to entitlement-code checks.
- [x] Added/updated focused tests and validation.
- [x] Created `roadmap/entitlement/phase_1_report.md`.
- [ ] Phase 2 blocker: remove remaining legacy table exports/repositories/controllers/middleware/seed scripts/frontend marketplace hardcodes after converting those workflows to `tenant_entitlements` and the entitlement engine.
