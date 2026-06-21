# Replit/Codex Prompt P8.1 — API Direct-Bypass Tests + RBAC Permission Mapping

Repository: `Rndynt/AuraPoS`

## Goal

Add end-to-end API/controller-level tests that prove P8 backend order-action policy guards cannot be bypassed through direct HTTP/controller calls.

P8 already added backend policy enforcement in `UpdateOrder`, `recordPayment`, and `cancelOrder`. P8.1 must now prove those guards from the API layer and tighten the permission input path for active cancellation/refund/void style actions where the current RBAC model supports it.

This is a test-hardening and permission-mapping phase, not a new feature phase.

## Read first

```txt
roadmap/business-flows/P8_backend_action_policy_guard_report.md
roadmap/business-flows/replit_codex_P8_backend_action_policy_guard_prompt.md
packages/application/business-flows/policies/AssertCanPerformOrderAction.ts
packages/application/business-flows/policies/CanPerformOrderAction.ts
packages/application/orders/UpdateOrder.ts
apps/api/src/http/controllers/OrdersController.ts
apps/api/src/__tests__/record-payment-idempotency.test.ts
apps/api/src/**/__tests__/**
apps/api/src/http/routes/**/orders*
```

Search relevant code:

```bash
rg -n "assertCanPerformOrderAction|OrderActionPolicyError|CanPerformOrderAction|recordPayment|cancelOrder|UpdateOrder|ORDER_NOT_EDITABLE|KITCHEN_ORDER_LOCKED|FIRED_ITEMS_LOCKED|PARTIAL_PAYMENT_ENTITLEMENT_REQUIRED|ORDER_CANCEL_REASON_REQUIRED|CANCEL_ACTIVE_ORDER|permission|permissions|role|roles|rbac|auth" apps packages shared
```

## Scope

Allowed:

```txt
- Add API/controller direct-bypass tests for order update/payment/cancel guard behavior.
- Add small test factories/mocks if needed.
- Tighten policy permission input mapping for active cancel if current request/user/RBAC context exposes permission claims.
- Add explicit documentation when permission source is not yet available.
- Add frontend-safe error code documentation only if needed.
- Update P8.1 report, roadmap, and PLANS.
```

Forbidden:

```txt
- Do not rewrite payment engine.
- Do not implement refund/void engine.
- Do not add new DB schema/migrations.
- Do not make full payment require orders_queue.
- Do not loosen P2/P2.1 lifecycle locks.
- Do not bypass the P8 policy helper in tests or implementation.
- Do not hardcode plan names.
- Do not map business type back to paid workflow profiles.
- Do not reintroduce GenericPOSPage or old frontend shims.
```

## Required API/direct-bypass tests

Add tests using the existing API test harness. If the current test harness is controller-level rather than full HTTP server, use the existing project convention. Do not invent a large new framework unless already present.

### 1. PATCH order update bypass tests

Test direct update against active/kitchen/fired order states.

Required cases:

```txt
- PATCH/update active confirmed order -> 409 ORDER_NOT_EDITABLE
- PATCH/update kitchen-locked order -> 409 KITCHEN_ORDER_LOCKED
- PATCH/update order with fired/preparing/ready kitchen item -> 409 FIRED_ITEMS_LOCKED
- PATCH/update editable draft order -> allowed, if existing factory supports it
```

The test must prove backend rejects the action even if UI would normally hide edit controls.

### 2. recordPayment direct bypass tests

Required cases:

```txt
- full payment/cash on payable order without orders_queue entitlement -> allowed
- partial payment without payments_partial_payment entitlement -> 403 PARTIAL_PAYMENT_ENTITLEMENT_REQUIRED
- partial payment with payments_partial_payment entitlement -> allowed, if current payment use case supports it
- payment on invalid/cancelled/voided/not-payable order -> 409 PAYMENT_NOT_ALLOWED, if such state can be represented by existing factory
```

Do not regress idempotency behavior.

### 3. cancelOrder direct bypass tests

Required cases:

```txt
- cancel draft order -> allowed if current workflow supports it
- cancel active order without reason -> 400 or 409 ORDER_CANCEL_REASON_REQUIRED
- cancel active order with reason but without required permission -> rejected if permission source can be modeled
- cancel active order with reason and allowed permission -> allowed if current role/permission model supports it
```

If current RBAC/request context does not expose fine-grained permissions, document the gap and keep route-role + policy guard as current fallback.

### 4. route audit tests/documentation

Audit and document whether these exist:

```txt
DELETE /api/orders/:id
refund order route
void order route
trash server order route
```

If not present, report as not exposed and do not invent them.

If present, add direct-bypass tests proving they require explicit policy/reason/permission.

## RBAC / permission mapping requirement

P8 report noted: active cancel permission currently relies on route role plus policy input; it should be wired to a concrete authenticated permission claim/source when RBAC exposes one.

In P8.1:

```txt
- Inspect authenticated request/user context shape.
- Inspect existing RBAC/role/permission middleware.
- If permission claims are available, map them into CanPerformOrderAction permission input.
- If only roles are available, map conservatively and document exact role-to-permission mapping.
- If neither is available at controller level, do not fake it; document the limitation in the report and keep reason + route role guard.
```

Do not weaken active cancel guard.

## Error response expectations

Use existing API error response shape.

Expected codes:

```txt
ORDER_NOT_EDITABLE
KITCHEN_ORDER_LOCKED
FIRED_ITEMS_LOCKED
PAYMENT_NOT_ALLOWED
PARTIAL_PAYMENT_ENTITLEMENT_REQUIRED
MULTI_PAYMENT_ENTITLEMENT_REQUIRED
SPLIT_BILL_ENTITLEMENT_REQUIRED
ORDER_CANCEL_REASON_REQUIRED
ORDER_ACTION_NOT_ALLOWED
```

Tests should assert stable machine-readable code and status where possible.

## Validation commands

Run:

```bash
pnpm --filter @pos/application type-check
pnpm --filter @pos/api type-check
pnpm --filter @pos/application test
pnpm --filter @pos/api test
pnpm type-check
```

If frontend error mapping is touched, also run:

```bash
pnpm --filter @pos/terminal-web type-check
pnpm --filter @pos/terminal-web test
```

Run cleanup grep:

```bash
rg -n "orders_queue.*full payment|orders_queue.*recordPayment|recordPayment.*orders_queue|plan.*businessProfile|restaurant_table_service.*businessType|businessType.*restaurant_table_service|GenericPOSPage|features/pos/services|features/pos/mappers" apps packages shared
```

Expected:

```txt
- no full payment dependency on orders_queue;
- no business type mapped to paid profile mode;
- no GenericPOSPage or old frontend compatibility shims;
- tests prove API/controller bypass is blocked.
```

## Required report

Create:

```txt
roadmap/business-flows/P8_1_api_direct_bypass_tests_rbac_report.md
```

Report must include:

```txt
1. Summary
2. API/controller test harness used
3. Direct-bypass test matrix and result
4. RBAC/permission source audit
5. Active cancel permission mapping result
6. Refund/void/delete route audit result
7. Error response matrix
8. Validation output
9. Cleanup grep findings
10. Remaining risks
11. Next recommended phase
```

Update:

```txt
roadmap/business-flows/main.md
PLANS.md
```

if the repo tracks phase progress there.

## Completion checklist

- [x] PATCH/update direct-bypass tests added.
- [x] recordPayment direct-bypass tests added.
- [x] cancelOrder direct-bypass tests added.
- [x] active cancel reason requirement tested.
- [x] active cancel permission source audited and mapped or limitation documented.
- [x] refund/void/delete routes audited and guarded/tested if exposed.
- [x] full payment without orders_queue tested as allowed.
- [x] partial payment without entitlement tested as rejected.
- [x] validation commands run and documented.
- [x] cleanup grep documented.
- [x] P8.1 report created.

## Commit

```txt
test(api): cover order action policy bypass guards
```
