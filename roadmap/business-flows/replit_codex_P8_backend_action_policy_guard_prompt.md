# Replit/Codex Prompt P8 — Backend Action Policy Guard

Repository: `Rndynt/AuraPoS`

## Goal

Implement backend enforcement for POS/order business-flow actions using the existing business-flow policy layer.

UI routing and frontend cleanup phases are already done through P6.2. Browser smoke can remain a deferred release-gate task. P8 must now harden the backend so users cannot bypass the UI and perform invalid order actions through direct API calls.

Backend must enforce the same lifecycle/business policy that the UI assumes.

## Why this phase matters

Frontend checks are not security.

Even if the cashier UI hides edit/delete/payment actions, a user or broken client can still call backend endpoints directly. P8 must prevent these cases at API/use-case level:

```txt
- edit active kitchen order through normal order update endpoint;
- delete/cancel active kitchen order through normal cart/trash path;
- mutate fired/preparing/ready kitchen items through normal draft edit flow;
- perform payment action that violates order lifecycle policy;
- require orders_queue for normal full payment;
- return unclear technical errors instead of readable business errors.
```

## Read first

```txt
roadmap/business-flows/main.md
roadmap/business-flows/P0_current_pos_flow_audit.md
roadmap/business-flows/P2_pos_lifecycle_runtime_fix_report.md
roadmap/business-flows/P2_1_lifecycle_hardening_patch_report.md
roadmap/business-flows/P5_1_business_type_entitlement_model_correction_report.md
roadmap/business-flows/P6_food_beverage_service_core_flows_report.md
roadmap/business-flows/P6_1_cashier_ui_cleanup_report.md
roadmap/business-flows/P6_2_business_flow_browser_smoke_runtime_verification_report.md
packages/application/business-flows/policies/CanPerformOrderAction.ts
packages/application/business-flows/policies/**
packages/application/business-flows/resolveBusinessProfile.ts
packages/application/business-flows/resolveBusinessCapabilities.ts
packages/domain/business-flows/**
packages/application/orders/**
apps/api/src/http/controllers/**/Orders*
apps/api/src/http/routes/**/orders*
apps/api/src/**/orders*
```

Search current API/order mutation paths:

```bash
rg -n "UpdateOrder|updateOrder|PATCH.*orders|recordPayment|RecordPayment|cancel|void|refund|delete|trash|remove|send.*kitchen|kitchen|order item|orderItems|allowedActions|CanPerformOrderAction|ORDER_NOT_EDITABLE|KITCHEN_ORDER_LOCKED|FIRED_ITEMS_LOCKED" apps packages shared
```

## Scope

Allowed:

```txt
- Add backend/application guard helpers that call existing business-flow policy.
- Add backend guard to order update/edit endpoints.
- Add backend guard to payment/recordPayment endpoints.
- Add backend guard to cancel/delete/void/refund paths if currently exposed for POS orders.
- Add readable business error codes/messages.
- Add tests proving API/use-case bypass is blocked.
- Update reports/roadmap/PLANS.
```

Forbidden:

```txt
- Do not rewrite payment engine.
- Do not rewrite NorthFlow.
- Do not add browser-only checks as enforcement.
- Do not hardcode plan names.
- Do not map business type back to paid workflow profiles.
- Do not make orders_queue required for normal full payment.
- Do not loosen P2/P2.1 lifecycle locks.
- Do not add migrations unless absolutely required and documented.
- Do not reintroduce GenericPOSPage or old frontend shims.
```

## Existing policy model to reuse

Use or extend existing business-flow policy objects:

```txt
CanPerformOrderAction
resolveAllowedActions
BusinessFlowActionId
business profile / lifecycle / capability inputs
```

Do not create a second inconsistent policy system.

If existing policy shape is missing backend-specific data, add a small adapter to map order state + tenant entitlement/profile context into policy input.

Suggested application helper:

```txt
packages/application/business-flows/policies/AssertCanPerformOrderAction.ts
```

or equivalent.

It should return/throw typed business errors, not generic errors.

## Required backend guard points

### 1. Order update/edit guard

Guard normal order update paths such as:

```txt
PATCH /orders/:id
UpdateOrder use case
updateOrder controller/service
```

Rules:

```txt
- server draft may be edited only if lifecycle says editable draft;
- active order cannot be loaded into normal cart edit/update path;
- kitchen locked order cannot be edited through normal update;
- fired/preparing/ready kitchen items cannot be mutated through draft update;
- readable errors returned:
  ORDER_NOT_EDITABLE
  KITCHEN_ORDER_LOCKED
  FIRED_ITEMS_LOCKED
```

Preserve P2/P2.1 behavior. P8 should centralize/enforce it, not remove it.

### 2. Payment / recordPayment guard

Guard payment action endpoints/use-cases such as:

```txt
recordPayment
POST/PATCH payment endpoint used by POS
pay active order
```

Rules:

```txt
- full payment/cash must be allowed for checkout-capable baseline flows;
- full payment must not require orders_queue;
- partial payment requires payments_partial_payment entitlement;
- multi payment requires payments_multi_payment entitlement if exposed;
- split bill requires payments_split_bill or current SOT alias if exposed;
- payment on invalid/cancelled/voided order must be rejected with readable business error;
- active payable order may be paid without converting it into editable draft.
```

### 3. Cancel/delete/trash/void/refund guard

Audit exposed paths for:

```txt
cancel order
trash/delete order
void order
refund order
```

Rules:

```txt
- draft delete/trash may be allowed if policy allows;
- active/kitchen/fired order must not be deleted through normal cart trash path;
- cancel/void/refund must require explicit business action, reason, and permission if current policy supports it;
- if a path is not implemented yet, document it and ensure no unsafe fallback exists.
```

Do not invent full refund/void engine if outside current scope. Guard what exists.

### 4. Tenant/profile/capability context

Backend guard must resolve the correct baseline/capability context:

```txt
businessProfile / businessType -> baseline family
entitlements -> capabilities
order lifecycle -> editable/active/kitchen locked flags
```

Do not infer profile from plan name or missing entitlement.

If tenant profile cannot be resolved, fallback should be safe `core_standard` for baseline checkout but must not allow unsafe lifecycle mutations.

## Error response requirements

Add/standardize readable business errors. Suggested codes:

```txt
ORDER_ACTION_NOT_ALLOWED
ORDER_NOT_EDITABLE
KITCHEN_ORDER_LOCKED
FIRED_ITEMS_LOCKED
PAYMENT_NOT_ALLOWED
PARTIAL_PAYMENT_ENTITLEMENT_REQUIRED
MULTI_PAYMENT_ENTITLEMENT_REQUIRED
SPLIT_BILL_ENTITLEMENT_REQUIRED
ORDER_CANCEL_REASON_REQUIRED
```

Use existing project error shape if one already exists.

Do not leak internal stack traces to API response.

## Required tests

Add or update tests in appropriate packages.

### Application/use-case tests

Test matrix:

```txt
- update editable draft -> allowed
- update active order -> rejected
- update kitchen locked order -> rejected
- mutate fired kitchen item -> rejected
- full payment on payable order without orders_queue -> allowed
- partial payment without entitlement -> rejected
- partial payment with entitlement -> allowed if current payment flow supports it
- payment on cancelled/voided invalid order -> rejected
- active order payment does not require loading editable cart
```

### API/controller tests if existing harness supports it

Test direct endpoint bypass:

```txt
- PATCH /orders/:id active/kitchen order returns business error
- recordPayment full payment works without orders_queue
- recordPayment partial payment rejects without entitlement
- delete/trash active order path rejects if exposed
```

### Policy tests

Keep/extend pure policy tests:

```txt
- CanPerformOrderAction covers CREATE_AND_PAY, PAY_ACTIVE_ORDER, UPDATE_DRAFT_ORDER, SEND_TO_KITCHEN, CANCEL/VOID/REFUND if present
- baseline profiles retail_standard/food_beverage/service/core_standard allow checkout
- optional capabilities remain entitlement-gated
```

## Validation commands

Run:

```bash
pnpm --filter @pos/domain type-check
pnpm --filter @pos/application type-check
pnpm --filter @pos/api type-check
pnpm --filter @pos/application test
pnpm --filter @pos/api test
pnpm type-check
```

If frontend types are touched, also run:

```bash
pnpm --filter @pos/terminal-web type-check
pnpm --filter @pos/terminal-web test
```

Run cleanup check:

```bash
rg -n "orders_queue.*full payment|orders_queue.*recordPayment|recordPayment.*orders_queue|plan.*businessProfile|restaurant_table_service.*businessType|businessType.*restaurant_table_service|GenericPOSPage|features/pos/services|features/pos/mappers" apps packages shared
```

Expected:

```txt
- no full payment dependency on orders_queue;
- no business type mapped to paid profile mode;
- no GenericPOSPage or old frontend compatibility shims;
- backend guard uses policy/application layer rather than UI-only checks.
```

## Required report

Create:

```txt
roadmap/business-flows/P8_backend_action_policy_guard_report.md
```

Report must include:

```txt
1. Summary
2. Guard points added
3. Backend route/use-case audit table
4. Policy/context adapter design
5. Error code/response matrix
6. Tests added/updated
7. Validation output
8. Cleanup grep findings
9. Manual/browser smoke deferred note if still not run
10. Remaining risks and next recommended phase
```

Update:

```txt
roadmap/business-flows/main.md
PLANS.md
```

if those files track phase progress.

## Completion checklist

- [x] Order update/edit bypass guarded.
- [x] Active/kitchen/fired order mutation rejected with readable errors.
- [x] Payment action guarded by lifecycle/policy.
- [x] Full payment/cash does not require orders_queue.
- [x] Partial/multi/split remain entitlement-gated if exposed.
- [x] Cancel/delete/void/refund exposed paths audited and guarded or documented.
- [x] Tenant businessProfile/capability context resolved safely.
- [x] Tests added/updated. Application policy/use-case coverage is included; record-payment controller test mock was updated for the new guard. API bypass matrix expansion remains recommended follow-up.
- [x] Validation commands run and documented.
- [x] Cleanup grep documented.
- [x] P8 report created.

## Commit

```txt
fix(api): enforce order action policy guards
```
