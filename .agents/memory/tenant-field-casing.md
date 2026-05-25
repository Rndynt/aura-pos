---
name: Tenant domain type field casing
description: Tenant domain type uses snake_case field names; TenantRepository maps DB camelCase columns to snake_case domain fields
---

The `Tenant` domain type in `packages/domain/tenants/types.ts` uses snake_case:
- `plan_tier` (NOT planTier)
- `business_name`, `business_address`, `business_phone`, `business_email`
- `subscription_status`, `trial_ends_at`, `is_active`, `created_at`, `updated_at`

`TenantRepository.ts` maps DB camelCase → domain snake_case (e.g. `dbTenant.planTier` → `plan_tier`).

**Why:** A pre-existing bug in marketplace.tsx accessed `profile?.tenant?.planTier` (camelCase, the DB column name) which always returned undefined, making currentPlan always "free" and locking all features. Fixed to `profile?.tenant?.plan_tier`.

**How to apply:** In any frontend code consuming `TenantProfile.tenant`, always use snake_case field names. If unsure, check `packages/domain/tenants/types.ts`.
