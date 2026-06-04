---
name: Feature catalog source of truth
description: Plan-tier gating must derive from the existing marketplace.tsx catalog, not from duplicated hardcoded sets.
---

## Rule
`apps/pos-terminal-web/src/lib/featureCatalog.ts` is the single source of truth for plan-tier gating on the frontend. It contains pure data (no React imports) derived from the same catalog shown in marketplace.tsx.

- `FEATURE_REQUIRED_PLAN` — featureCode → PlanTier (used by `useFeatures.ts`)
- `MODULE_REQUIRED_PLAN` — moduleKey → PlanTier (used by `TenantContext.hasModule()`)
- `PLAN_RANK` + `planAllows()` — numeric comparison helper

**Why:** Previous attempt duplicated the catalog into a separate `FREE_FEATURE_CODES` Set and `GROWTH_MODULES`/`PRO_MODULES` Sets — these went out of sync with `marketplace.tsx` and had to be maintained in two places. User explicitly called this out.

**How to apply:**
- Adding a new module or feature? Add it to `featureCatalog.ts` first, then decorate with icons/colors in `marketplace.tsx`.
- Never add a hardcoded `Set<string>` of plan-gated codes in `useFeatures.ts` or `TenantContext.tsx`.
- API-side (`apps/api`) still uses `planFeatureMap.ts` independently — that's intentional (server validation, not UI gating).
