# Billing Entitlement Rules

## Core Principle

Business type selection configures a tenant's default workflows, starter catalog,
order types, and UI recommendations. It **never** grants paid plan access.

## New Tenant Onboarding

Every new tenant registered through `POST /api/register` always starts with:

```
plan_tier         = 'free'
subscription_status = 'active'
```

This is enforced in two places:

1. **Business type templates** (`packages/application/tenants/businessTypeTemplates.ts`) —
   all templates set `plan_tier: 'free'` and only include features from `PLAN_FEATURE_MAP.free`.

2. **Registration service** (`apps/api/src/services/registrationService.ts`) —
   `registerTenantOwner()` hard-codes `planTier: DEFAULT_ONBOARDING_PLAN_TIER` (`'free'`)
   and validates that no template feature exceeds `PLAN_FEATURE_MAP.free`. A
   `TEMPLATE_PLAN_MISMATCH` error is thrown if a template is misconfigured.

## Plan Upgrade

Plan tier changes are **only** allowed via a trusted internal billing/admin system.

- Endpoint: `PATCH /api/tenants/plan`
- Required header: `x-internal-billing-secret: <BILLING_INTERNAL_SECRET>`
- If `BILLING_INTERNAL_SECRET` env var is not set, **all** plan-change requests return `403`.
- Browser/client sessions can never upgrade a plan directly.

Response for unauthorized access:

```json
{
  "success": false,
  "error": "Plan changes are restricted to the billing/admin system.",
  "code": "BILLING_AUTH_REQUIRED"
}
```

## Marketplace UI

The Marketplace page displays paid features and modules as locked upgrade recommendations.
Clicking "Upgrade" shows an informational message — it does **not** call the plan endpoint.
No browser action can mutate the tenant's plan tier.

## Feature Map

The authoritative plan → feature mapping lives in:
`apps/api/src/constants/planFeatureMap.ts`

Free features:
- `product_variants`, `partial_payment`, `discounts`, `order_queue`,
  `receipt_printer`, `sales_reports`

Growth and Pro features are only activated after an authorized plan upgrade.

## Module Defaults

All paid modules default to `false` for new tenants:

| Module                  | Required Plan |
|-------------------------|---------------|
| Table Management        | Growth+       |
| Kitchen Ticket / KDS    | Growth+       |
| Loyalty                 | Growth+       |
| Delivery Management     | Growth+       |
| Advanced Inventory      | Growth+       |
| Appointments            | Growth+       |
| Multi-Location          | Pro only      |

Basic inventory / Stok Dasar (`enable_inventory`) is allowed on free/default onboarding plans and is now an onboarding default for new active tenants. It is stored in `tenant_module_configs`, not `tenant_features`. Runtime entitlement repair also treats active `free`, `starter`, `basic`, and `basic_starter` tenants as Basic Stock defaults so stale or missing module-config rows can be safely healed without granting Advanced Inventory. Advanced Inventory (`enable_inventory_advanced`) remains Growth+ and is not implied by Stok Dasar.

## Seed Data Requirements

Registration depends on these order types being present in the database:

- `DINE_IN` — Cafe/Restaurant
- `TAKE_AWAY` — Cafe/Restaurant
- `DELIVERY` — Cafe/Restaurant
- `WALK_IN` — Retail, Laundry, Service, PPOB

Run `pnpm db:seed` to ensure all order types are present.

Business type codes must match `packages/core/enums.ts`:
- `CAFE_RESTAURANT`
- `RETAIL_MINIMARKET`
- `LAUNDRY`
- `SERVICE_APPOINTMENT`
- `DIGITAL_PPOB`
