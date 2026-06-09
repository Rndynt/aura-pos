# Billing Entitlement Rules

## Core Principle

`packages/application/entitlements/entitlementCatalog.ts` is the single source of truth for commercial tenant entitlements. Business type selection configures onboarding defaults, recommended add-ons, order types, and UI guidance from that catalog; it must not persist plan-default or business-type-default entitlements as tenant grant rows.

## Entitlement Storage

AuraPoS now uses one grant table for purchased, trial, and manually granted entitlements:

- `tenant_entitlements`

The following legacy entitlement/config tables are removed by the Phase 1 cleanup migration and must not be written by new onboarding logic:

- `tenant_features`
- `tenant_module_configs`

Plan-default and business-type-default access is computed at runtime from the catalog and the read-only entitlement engine. `tenant_entitlements` stores only explicit grants with `source` values `purchase`, `manual_grant`, or `trial`; expired and cancelled grants are ignored by effective entitlement checks.

## New Tenant Onboarding

Every new tenant registered through `POST /api/register` starts from the selected business type's SOT default plan:

```txt
ENTITLEMENT_CATALOG.businessTypes[businessType].defaultPlan
```

The Phase 1 catalog sets all initial business types to `starter`, which includes Basic Stock (`inventory_basic_stock`) through the cumulative plan hierarchy and/or business type defaults. Registration no longer inserts `tenant_features`, `tenant_module_configs`, or `tenant_entitlements` rows for plan/business defaults.

## Plan Hierarchy

Plans are cumulative by `sortOrder`:

```txt
starter -> growth -> pro
```

A `pro` tenant receives `starter + growth + pro` included entitlements without duplicating lower-tier entries inside the `pro` plan definition.

## Plan Upgrade

Plan tier changes remain restricted to a trusted internal billing/admin system.

- Endpoint: `PATCH /api/tenants/plan`
- Required header: `x-internal-billing-secret: <BILLING_INTERNAL_SECRET>`
- If `BILLING_INTERNAL_SECRET` is not set, plan-change requests return `403`.

Phase 1 keeps older tenant feature/module endpoints as compatibility/Phase 2 follow-up areas unless they are inventory-route guards. New access checks should use entitlement codes and the entitlement engine rather than legacy module flags or `tenant_features` rows.

## Marketplace / Add-ons

Marketplace and purchase flows should be generated from:

- `ENTITLEMENT_CATALOG.entitlements`
- `ENTITLEMENT_CATALOG.offers`
- `ENTITLEMENT_CATALOG.plans`
- `ENTITLEMENT_CATALOG.businessTypes[*].recommendedEntitlements`

Purchasing an offer must:

1. Verify the offer exists.
2. Verify the tenant plan satisfies `offer.requiredPlan` by plan `sortOrder`.
3. Avoid charging for entitlements already included by the tenant's cumulative plan.
4. Insert `tenant_entitlements` only for actual purchased/trial/manual grants.
5. Set `expires_at` when `offer.expires = true`.

## Inventory Entitlement Guards

Inventory route access is now entitlement-code based:

- `GET /api/inventory/products` requires `inventory_basic_stock`.
- `PUT /api/inventory/products/:id/adjust` requires `inventory_basic_stock` and writes advanced movement logs only when `inventory_advanced_stock` is effective.
- Inventory movement and report routes require `inventory_advanced_stock`.

The old Basic Stock runtime repair/self-heal resolver was removed; missing access should be fixed in SOT/purchase data, not repaired during request checks.
