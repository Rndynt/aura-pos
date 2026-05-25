---
name: Plan tier naming mismatch
description: marketplace.tsx uses free/growth/pro but domain types used free/starter/professional/enterprise — resolved in favor of free/growth/pro
---

The marketplace.tsx PLANS array and PlanTier type use `"free" | "growth" | "pro"`.
The domain `Tenant` type declared `plan_tier: "free" | "starter" | "professional" | "enterprise"`.
The seed used `"premium"`.

**Decision:** Standardize on `free | growth | pro` everywhere — the marketplace/UI terms are user-facing and already implemented. The planTier DB column is varchar(50) with no enum constraint, so no migration needed.

**PLAN_FEATURE_MAP** is defined in `TenantsController.ts` and maps each tier to its feature codes. The `PATCH /api/tenants/plan` endpoint uses this map to delete/re-insert `plan_default` features.

**Why:** The UI plan names are already shown to users; changing the domain type is less disruptive than changing the UI. The varchar column accepts any string.

**How to apply:** When adding new plan tiers or features, update PLAN_FEATURE_MAP in TenantsController.ts AND the PLANS/MODULE_CATALOG/FEATURE_CATALOG in marketplace.tsx together.
