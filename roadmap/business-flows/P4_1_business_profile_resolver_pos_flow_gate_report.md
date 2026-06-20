# P4.1 Business Profile Resolver + POS Flow Gate Report

Date: 2026-06-20
Scope source: `roadmap/business-flows/replit_codex_P4_1_business_profile_resolver_pos_flow_gate_prompt.md`

## 1. Summary

P4.1 adds the missing explicit `businessProfile` runtime contract and enables the safe POS root gate that P4 intentionally deferred.

The implementation keeps the separation between workflow profile and entitlements:

- backend/application resolves business profile from tenant business type/code only;
- tenant entitlement/profile responses now include `businessProfile` plus non-sensitive source metadata;
- POS routing uses the explicit backend-provided profile surfaced by `useTenantProfile`;
- only `retail_standard` routes to `RetailStandardPOSFlow`;
- all non-retail, unknown, null, failed, or not-yet-loaded profiles remain on the existing generic POS fallback.

No database schema or migration was required.

## 2. Files changed

- `packages/application/business-flows/resolveBusinessProfile.ts` — pure canonical resolver from business type/code to business-flow profile.
- `packages/application/business-flows/index.ts` — exports the resolver from the application business-flow package.
- `packages/application/business-flows/__tests__/resolveBusinessProfile.test.ts` — resolver tests for retail, unknown, null, and non-retail safety.
- `packages/application/package.json` — includes resolver test in the package test script.
- `apps/api/src/http/controllers/TenantsController.ts` — adds `businessProfile`, `business_profile`, `businessProfileSource`, and `business_profile_source` to `/api/me/entitlements` and `/api/tenants/profile` response tenant shape.
- `apps/pos-terminal-web/src/hooks/api/useEntitlements.ts` — frontend tenant profile type now exposes business profile fields and offline fallback returns `null`/`unknown`.
- `apps/pos-terminal-web/src/features/pos/pages/GenericPOSPage.tsx` — extracted previous generic POS implementation unchanged as fallback.
- `apps/pos-terminal-web/src/features/pos/pages/POSPage.tsx` — now exports the POS flow root gate.
- `apps/pos-terminal-web/src/features/pos-flows/root/POSFlowRoot.tsx` — minimal runtime router between retail and generic flows.
- `apps/pos-terminal-web/src/features/pos-flows/root/useResolvedPOSBusinessProfile.ts` — reads explicit business profile from tenant profile hook.
- `apps/pos-terminal-web/src/features/pos-flows/root/resolvePOSFlowComponent.ts` — pure route decision helper.
- `apps/pos-terminal-web/src/features/pos-flows/root/index.ts` — root flow exports.
- `apps/pos-terminal-web/src/features/pos-flows/root/__tests__/resolvePOSFlowComponent.test.ts` — root routing decision tests.
- `apps/pos-terminal-web/package.json` — includes POS root decision test in terminal-web test script.
- `roadmap/business-flows/replit_codex_P4_1_business_profile_resolver_pos_flow_gate_prompt.md` — completion checklist updated honestly.
- `roadmap/business-flows/P4_1_business_profile_resolver_pos_flow_gate_report.md` — this report.
- `PLANS.md` — execution plan/progress updated.

## 3. Business type -> business profile mapping table

| Input examples | Normalized key | Resolved profile | Notes |
| --- | --- | --- | --- |
| `RETAIL_MINIMARKET`, `retail_minimarket` | `retailminimarket` | `retail_standard` | Required retail mapping. |
| `retail` | `retail` | `retail_standard` | Conservative generic retail code. |
| `minimarket` | `minimarket` | `retail_standard` | Conservative store/minimarket code. |
| `store` | `store` | `retail_standard` | Conservative store code. |
| `CAFE_RESTAURANT`, `restaurant` | `caferestaurant`, `restaurant` | `restaurant_table_service` | Resolved but not routed to a custom adapter yet. |
| `cafe` | `cafe` | `cafe_counter` | Resolved but still generic POS until later adapter phase. |
| `quick_service` | `quickservice` | `quick_service` | Resolved but still generic POS until later adapter phase. |
| `LAUNDRY`, `SERVICE_APPOINTMENT` | `laundry`, `serviceappointment` | `service_business_later` | Resolved but still generic POS until future adapter phase. |
| Unknown, absent, blank | n/a | `null` | Generic fallback. |

The resolver normalizes case and snake/camel/punctuation variants by stripping non-alphanumeric separators after lowercasing.

## 4. API contract added

The shared entitlement/profile response returned by both `GET /api/me/entitlements` and `GET /api/tenants/profile` now includes these tenant fields without removing existing fields:

```ts
businessProfile: 'retail_standard' | 'restaurant_table_service' | 'cafe_counter' | 'quick_service' | 'service_business_later' | null;
business_profile: same as businessProfile;
businessProfileSource: 'business_type_mapping' | 'unknown';
business_profile_source: same as businessProfileSource;
businessType: string | null;
business_type: string | null;
```

`businessProfileSource` is intentionally non-sensitive metadata. It confirms whether the profile came from canonical business-type mapping or no supported mapping was found.

## 5. POS flow routing matrix

| businessProfile | POS root result |
| --- | --- |
| `retail_standard` | `RetailStandardPOSFlow` |
| `restaurant_table_service` | Generic POS fallback |
| `cafe_counter` | Generic POS fallback |
| `quick_service` | Generic POS fallback |
| `service_business_later` | Generic POS fallback |
| `null` / `undefined` / unknown | Generic POS fallback |

## 6. Retail route behavior proof

`POSPage` now renders `POSFlowRoot`. The root reads `tenantProfile?.tenant?.businessProfile` or snake-case `business_profile`. Only the exact value `retail_standard` returns `RetailStandardPOSFlow`; all other values return `GenericPOSPage`.

The retail adapter from P4 remains unchanged, so the P4 protection still applies:

- no Send to Kitchen button is introduced by P4.1;
- no KDS/kitchen queue controls are introduced by P4.1;
- no table-service controls are introduced by P4.1;
- no pay-later creation path is introduced by P4.1;
- fresh retail full payment remains the P4 create-and-pay/offline submit path.

## 7. Generic fallback behavior proof

The previous `POSPage.tsx` body was copied to `GenericPOSPage.tsx` and remains the fallback implementation. Because the route helper returns generic fallback for every non-retail/unknown state, unsupported profiles do not crash or block checkout.

While profile data is loading, the hook returns `null`, which routes to generic fallback. If the profile API fails and React Query has no data, routing also remains generic fallback.

## 8. Entitlement non-inference proof

The resolver accepts only:

```ts
{ businessType?: string | null; businessTypeCode?: string | null }
```

It does not accept plan tier, subscription status, entitlement map, feature flags, missing `orders_queue`, missing `restaurant_kitchen_ops`, or package names. POS root routing reads only the explicit profile field emitted by the backend profile contract.

## 9. Tests and validation output

Commands run and passed in this batch:

```bash
pnpm --filter @pos/application test
pnpm --filter @pos/terminal-web test
pnpm --filter @pos/application type-check
pnpm --filter @pos/api type-check
pnpm --filter @pos/terminal-web type-check
```

Full prompt-required validation was run after docs/checklist updates: `pnpm --filter @pos/domain type-check && pnpm --filter @pos/application type-check && pnpm --filter @pos/api type-check && pnpm --filter @pos/terminal-web type-check && pnpm --filter @pos/application test && pnpm --filter @pos/api test && pnpm --filter @pos/terminal-web test && pnpm type-check` passed.

## 10. Manual smoke result

Browser/manual smoke was **not run** in this terminal-only environment.

Manual smoke checklist to run in browser:

1. Retail tenant with businessType `RETAIL_MINIMARKET`: POS renders `RetailStandardPOSFlow`.
2. Retail fresh payment: Product -> Cart -> Bayar -> paid -> cart clears -> not in Draft Server/Pesanan Aktif.
3. Retail incompatible controls: no Send to Kitchen, KDS, kitchen queue, table-service controls, or pay-later active creation.
4. Non-retail tenant: POS still renders generic fallback.
5. Unknown business type: POS still renders generic fallback, no crash.
6. Entitlement check: retail full payment works without `orders_queue` and `restaurant_kitchen_ops`.

## 11. Remaining risks deferred to P5/P6/P7

- Browser component/smoke coverage is still needed to visually prove retail route rendering and button absence.
- Non-retail adapters are intentionally not routed yet; restaurant/cafe/quick-service/service tenants continue generic POS until P5/P6/P7.
- `businessProfileSource` currently supports mapping/unknown only. If a persisted explicit business-profile field is added later, the resolver/API can add `explicit_field` without changing frontend routing.
- The generic fallback still contains mixed legacy workflow behavior documented in P0/P4; this patch only gates retail tenants away from it.

## 12. Recommended next phase

Recommended next phase: P5 restaurant table-service adapter.

Why: the resolver now can identify restaurant-table-service profiles, but routing intentionally keeps them on generic POS until a dedicated adapter exists and is validated against kitchen/table/payment lifecycle rules.
