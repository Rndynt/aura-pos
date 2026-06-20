# Replit/Codex Prompt P4.1 — Business Profile Resolver + Safe POS Flow Root Gate

Repository: `Rndynt/AuraPoS`

## Goal

Add an explicit, reliable `businessProfile` contract for POS runtime and enable a safe POS flow root gate.

P4 created and exported the `retail_standard` adapter, but it was intentionally not routed to production because the POS runtime did not have a reliable explicit `businessProfile` source. P4.1 fixes that missing contract.

P4.1 must route only explicit `retail_standard` tenants to `RetailStandardPOSFlow`. Unknown, unmapped, unsupported, or non-retail tenants must continue using the current generic POS fallback.

## Phase dependencies

Read these first:

```txt
roadmap/business-flows/main.md
roadmap/business-flows/P0_current_pos_flow_audit.md
roadmap/business-flows/P1_business_flow_sot_report.md
roadmap/business-flows/P2_pos_lifecycle_runtime_fix_report.md
roadmap/business-flows/P2_1_lifecycle_hardening_patch_report.md
roadmap/business-flows/P3_pos_core_extraction_report.md
roadmap/business-flows/P4_retail_standard_adapter_report.md
packages/domain/business-flows/**
packages/application/business-flows/**
apps/pos-terminal-web/src/features/pos-core/**
apps/pos-terminal-web/src/features/pos-flows/retail/**
apps/pos-terminal-web/src/features/pos/pages/POSPage.tsx
apps/pos-terminal-web/src/hooks/api/useTenantProfile.ts
apps/api/src/http/controllers/**tenant** or equivalent tenant/profile controller
apps/api/src/http/routes/**tenant** or equivalent tenant/profile route
```

Use `rg` if paths differ:

```bash
rg -n "businessType|business_type|businessProfile|business_profile|tenantProfile|useTenantProfile|/profile|/tenant" apps packages shared
```

## Why this patch is required

P4 report states:

```txt
- retail adapter exists and is tested;
- production routing is not enabled by default;
- explicit businessProfile is missing from POS runtime;
- P4 forbids guessing from plan tier, entitlement absence, or frontend ad-hoc inference.
```

P4.1 must add the explicit profile source and minimal route gate.

## Non-negotiable scope boundary

Allowed in P4.1:

```txt
- Add/centralize business type -> business flow profile mapping.
- Expose explicit `businessProfile` from tenant/profile API output.
- Add frontend type support for `businessProfile`.
- Add POS flow root/gate that routes `retail_standard` to RetailStandardPOSFlow.
- Keep unknown/non-retail tenants on current generic POS runtime.
- Add tests for mapping and root routing decision.
- Add docs/report.
```

Forbidden in P4.1:

```txt
- Do not implement restaurant_table_service adapter yet.
- Do not implement cafe_counter/quick_service adapter yet.
- Do not implement service_business_later.
- Do not remove generic POS fallback.
- Do not infer profile from plan name.
- Do not infer profile from missing restaurant_kitchen_ops or missing orders_queue.
- Do not hardcode Starter/Growth/Pro.
- Do not change payment engine.
- Do not change database schema/migrations unless absolutely unavoidable.
- Do not change P2/P2.1 lifecycle locks.
- Do not weaken retail adapter safety.
```

P4.1 is a resolver/routing patch, not a new business-flow adapter phase.

## Required canonical mapping

Create a canonical mapping from existing tenant business type/code to business-flow profile.

Target profile ids come from P1:

```txt
retail_standard
restaurant_table_service
cafe_counter
quick_service
service_business_later
```

Initial P4.1 mapping must be conservative.

### Required retail mapping

Map known retail/minimarket/store business types to:

```txt
retail_standard
```

Expected known input examples may include:

```txt
RETAIL_MINIMARKET
retail_minimarket
retail
minimarket
store
```

Do not guess beyond known business type catalog. Search existing SOT/registration/business-type constants and map only codes that clearly mean retail/minimarket/store.

### Non-retail mapping rule

For restaurant/cafe/service types:

```txt
- If mapping is already reliable and clearly matches P1 profiles, you may return the correct profile id.
- But do not route non-retail adapters yet because they are not implemented.
- POS root must still fall back to generic POS for non-retail profiles until P5/P6 adapters exist.
```

### Unknown mapping rule

If code is unknown, absent, invalid, or unsupported:

```txt
businessProfile = null or "unknown"
```

and POS uses generic fallback.

## Required backend/application implementation

Add a pure resolver.

Preferred location:

```txt
packages/application/business-flows/resolveBusinessProfile.ts
```

or, if existing business-flow registry has a better place:

```txt
packages/application/business-flows/registry/resolveBusinessProfile.ts
```

The resolver should expose:

```ts
resolveBusinessProfileFromBusinessType(input: {
  businessType?: string | null;
  businessTypeCode?: string | null;
}): BusinessFlowProfileId | null
```

Rules:

```txt
- normalize case;
- handle snake/camel variants;
- never use plan tier;
- never use entitlement presence/absence;
- return null for unknown/unsupported;
- use P1 profile constants, not ad-hoc string literals if possible.
```

Add tests:

```txt
resolveBusinessProfileFromBusinessType(RETAIL_MINIMARKET) -> retail_standard
resolveBusinessProfileFromBusinessType(retail_minimarket) -> retail_standard
unknown -> null
undefined/null -> null
restaurant/cafe/service code does not route to retail_standard unless explicitly mapped to another profile
```

## Required API contract

Expose `businessProfile` in the tenant/profile response used by POS.

Find the API used by:

```txt
apps/pos-terminal-web/src/hooks/api/useTenantProfile.ts
```

Patch its response to include:

```ts
businessProfile: 'retail_standard' | 'restaurant_table_service' | 'cafe_counter' | 'quick_service' | 'service_business_later' | null
```

Where possible, also include source/debug metadata in non-sensitive form:

```ts
businessProfileSource?: 'business_type_mapping' | 'explicit_field' | 'unknown'
businessType?: string | null
```

Do not remove existing fields.

Do not break the tenant profile API shape.

If there is already a tenant business type field, preserve it and add `businessProfile` alongside it.

## Required frontend types/hooks

Patch frontend tenant profile typing/hook so POS can read:

```ts
tenantProfile?.tenant?.businessProfile
```

or another documented stable path.

Do not infer profile in frontend if backend already supplies it.

Frontend may have a fallback function only for defensive display, but routing must prefer backend `businessProfile`.

## Required POS flow root/gate

Create minimal POS flow root.

Preferred location:

```txt
apps/pos-terminal-web/src/features/pos-flows/root/POSFlowRoot.tsx
apps/pos-terminal-web/src/features/pos-flows/root/useResolvedPOSBusinessProfile.ts
apps/pos-terminal-web/src/features/pos-flows/root/index.ts
```

Routing behavior:

```tsx
if (businessProfile === 'retail_standard') {
  return <RetailStandardPOSFlow />;
}
return <GenericPOSPageFallback />;
```

Important implementation detail:

Current `POSPage.tsx` is the generic page. Avoid recursive import.

Recommended approach:

```txt
1. Keep current generic POS implementation in `POSPage.tsx` or extract it to `GenericPOSPage.tsx` if necessary.
2. Add a very small root gate that decides between RetailStandardPOSFlow and generic implementation.
3. If extracting GenericPOSPage is too risky, create `POSFlowRoot` but do not route it yet; document blocker. However preferred is to enable retail routing if safe.
```

Safer refactor option:

```txt
apps/pos-terminal-web/src/features/pos/pages/POSPage.tsx
  -> exports POSFlowRoot as default

apps/pos-terminal-web/src/features/pos/pages/GenericPOSPage.tsx
  -> contains previous POSPage body
```

Only do this if it can be done with minimal diff and passing type-check.

## Required routing guarantees

```txt
retail_standard -> RetailStandardPOSFlow
restaurant_table_service -> GenericPOS fallback until P5
cafe_counter -> GenericPOS fallback until P6
quick_service -> GenericPOS fallback until P6
service_business_later -> GenericPOS fallback until future phase
unknown/null -> GenericPOS fallback
```

No profile should crash POS.

While tenant profile is loading:

```txt
- either show existing loading behavior, or
- render generic POS safely until profile resolves, but avoid flicker if possible.
```

If profile API fails:

```txt
- render generic POS fallback;
- log/report safe error if existing pattern supports it;
- do not block cashier checkout.
```

## Required retail smoke protection

Once routed, retail_standard must still obey P4 rules:

```txt
- no Send to Kitchen button;
- no kitchen queue/KDS controls;
- no table-service controls;
- no pay-later creation path;
- full payment works without orders_queue and without restaurant_kitchen_ops;
- paid retail order does not appear in Draft Server/Pesanan Aktif.
```

## Required tests

Add tests where existing harness supports it.

### Application tests

```txt
resolveBusinessProfileFromBusinessType:
- maps RETAIL_MINIMARKET to retail_standard
- maps normalized retail_minimarket to retail_standard
- returns null for unknown/null
- does not map restaurant/cafe/service to retail_standard accidentally
```

### API/controller tests if harness exists

```txt
tenant profile response includes businessProfile for retail tenant
unknown business type returns businessProfile null/unknown without failing
existing response fields remain present
```

### Frontend pure/root tests if harness exists

```txt
useResolvedPOSBusinessProfile or root decision helper:
- retail_standard selects RetailStandardPOSFlow
- restaurant_table_service selects generic fallback
- cafe_counter selects generic fallback
- unknown/null selects generic fallback
```

If component test harness does not exist, create a pure route decision helper and test that.

Suggested helper:

```ts
resolvePOSFlowComponent(profile): 'retail_standard' | 'generic_fallback'
```

## Manual smoke checklist

Document in report:

```txt
1. Retail tenant with businessType RETAIL_MINIMARKET:
   POS renders RetailStandardPOSFlow.

2. Retail fresh payment:
   Product -> Cart -> Bayar -> paid -> cart clears -> not in Draft Server/Pesanan Aktif.

3. Retail incompatible controls:
   no Send to Kitchen, KDS, kitchen queue, table-service controls, pay-later active creation.

4. Non-retail tenant:
   POS still renders generic fallback.

5. Unknown business type:
   POS still renders generic fallback, no crash.

6. Entitlement check:
   retail full payment works without orders_queue and restaurant_kitchen_ops.
```

Run browser smoke if environment supports it. If not, report not run clearly.

## Required docs/report

Create:

```txt
roadmap/business-flows/P4_1_business_profile_resolver_pos_flow_gate_report.md
```

Report must include:

```txt
1. Summary
2. Files changed
3. Business type -> business profile mapping table
4. API contract added
5. POS flow routing matrix
6. Retail route behavior proof
7. Generic fallback behavior proof
8. Entitlement non-inference proof
9. Tests and validation output
10. Manual smoke result or not-run statement
11. Remaining risks deferred to P5/P6/P7
12. Recommended next phase
```

Update related docs if present:

```txt
docs/ORDER_LIFECYCLE.md
roadmap/business-flows/main.md if needed
PLANS.md if the repo uses it for task tracking
```

## Validation commands

Run relevant commands:

```bash
pnpm --filter @pos/domain type-check
pnpm --filter @pos/application type-check
pnpm --filter @pos/api type-check
pnpm --filter @pos/terminal-web type-check
pnpm --filter @pos/application test
pnpm --filter @pos/api test
pnpm --filter @pos/terminal-web test
pnpm type-check
```

If scripts differ, run closest available and document exact output.

## Completion checklist

- [x] Business profile resolver created.
- [x] Resolver uses business type/code only, not plan/entitlement inference.
- [x] RETAIL_MINIMARKET or equivalent retail code maps to retail_standard.
- [x] Unknown/unsupported maps to null/unknown.
- [x] Tenant/profile API exposes explicit businessProfile.
- [x] Frontend tenant profile type/hook exposes businessProfile.
- [x] POS flow root/gate added.
- [x] retail_standard routes to RetailStandardPOSFlow.
- [x] non-retail/unknown routes to generic POS fallback.
- [x] Retail payment remains independent from orders_queue and restaurant_kitchen_ops.
- [x] No schema/migration unless documented as unavoidable.
- [x] Tests/validation documented.
- [x] P4.1 report created.

## Commit

```txt
feat(pos): route retail tenants by explicit business profile
```
