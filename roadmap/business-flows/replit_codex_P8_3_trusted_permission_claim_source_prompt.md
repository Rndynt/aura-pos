# Replit/Codex Prompt P8.3 — Trusted Permission Claim Source + Middleware Adapter

Repository: `Rndynt/AuraPoS`

## Goal

Introduce a trusted permission-claim source or middleware adapter that can populate explicit permission claims from the existing auth/RBAC model, then route order-action policy inputs through that source without weakening P8/P8.1/P8.2 safety.

P8.2 centralized role-derived order-action permissions in:

```txt
packages/application/business-flows/permissions/orderActionPermissions.ts
```

P8.3 must bridge that registry with API authentication/RBAC middleware so controllers do not rely only on scattered role strings and future modules can use the same trusted permission context.

This is an auth/RBAC integration hardening phase, not a new POS feature phase.

## Read first

```txt
roadmap/business-flows/P8_backend_action_policy_guard_report.md
roadmap/business-flows/P8_1_api_direct_bypass_tests_rbac_report.md
roadmap/business-flows/P8_2_permission_claim_registry_report.md
roadmap/business-flows/replit_codex_P8_2_permission_claim_registry_prompt.md
packages/application/business-flows/permissions/orderActionPermissions.ts
packages/application/business-flows/policies/AssertCanPerformOrderAction.ts
packages/application/business-flows/policies/CanPerformOrderAction.ts
apps/api/src/http/controllers/OrdersController.ts
apps/api/src/__tests__/order-action-direct-bypass.test.ts
apps/api/src/**/auth*
apps/api/src/**/rbac*
apps/api/src/**/middleware*
apps/api/src/**/tenant*
packages/application/**/auth*
packages/domain/**/auth*
```

Search current auth/RBAC request context:

```bash
rg -n "posRole|authTenantUser|authUser|user\.role|tenantUser|role|roles|permission|permissions|rbac|requireRole|requirePermission|authenticate|session|Better Auth|better-auth|orders:cancel_active|resolveOrderActionPermissions" apps packages shared
```

## Current limitation from P8.2

P8.2 report states:

```txt
- Permission claims are still role-derived, not persisted first-class claims.
- RBAC middleware still uses role hierarchy for route gates.
- Future refund/void/delete policy guards need a trusted permission source.
```

P8.3 must add a trusted middleware-level permission context, or document why current code cannot safely support it yet and add a safe adapter path for future persisted claims.

## Scope

Allowed:

```txt
- Add a typed request permission context interface.
- Add middleware/adapter that populates order-action permissions from trusted auth/RBAC context.
- Reuse P8.2 registry as source of truth for role-derived permissions.
- Prefer explicit permission claims if a trusted source already exists.
- Preserve least-privilege intersection behavior for untrusted/ad-hoc claims.
- Refactor OrdersController to read permission context from request adapter where appropriate.
- Add tests for middleware/adapter and controller behavior.
- Document current limitations if persisted permission claims do not exist.
- Update P8.3 report, roadmap, and PLANS.
```

Forbidden:

```txt
- Do not add DB schema/migrations for persisted permissions unless the repository already has a clear existing pattern and it is strictly necessary.
- Do not rewrite authentication or Better Auth.
- Do not rewrite route RBAC wholesale.
- Do not loosen active cancel guard.
- Do not grant refund/void/delete permissions to any role by accident.
- Do not make full payment require orders_queue.
- Do not map business type back to paid workflow profiles.
- Do not hardcode plan names.
- Do not rewrite payment engine or NorthFlow.
- Do not reintroduce GenericPOSPage or old frontend shims.
```

## Required implementation

### 1. Define trusted API permission context

Add a type/module in an appropriate API/application location, for example:

```txt
apps/api/src/http/auth/orderActionPermissionContext.ts
```

or a better existing auth/RBAC folder.

It should define a stable shape such as:

```ts
type OrderActionPermissionContext = {
  role: string | null;
  roleDerivedPermissions: OrderActionPermission[];
  explicitPermissions: OrderActionPermission[];
  effectivePermissions: OrderActionPermission[];
  source: "role-derived" | "explicit-claims" | "role-explicit-intersection";
};
```

Keep the exact shape aligned with existing code style.

### 2. Add middleware/adapter to populate request context

Create a helper/middleware that reads trusted context from:

```txt
req.posRole
req.authTenantUser.role
existing session/user context
existing explicit permission claims if any
```

It should call P8.2 registry helpers:

```txt
resolveOrderActionPermissionsFromRole
resolveOrderActionPermissionsFromRequestContext
```

Expected behavior:

```txt
- owner/manager/platform-admin can receive orders:cancel_active through registry.
- cashier cannot receive orders:cancel_active.
- kitchen/viewer/missing cannot receive orders:cancel_active.
- reserved refund/void/delete permissions are not granted by default.
- if explicit permission claims exist, apply least-privilege behavior unless the source is proven trusted.
```

Do not accept arbitrary client-sent permission arrays.

### 3. Refactor OrdersController policy input

`OrdersController` should not re-resolve role strings manually when a trusted permission context is already available.

Required outcome:

```txt
- active cancel uses effective order-action permissions from trusted request context/helper;
- tests still pass for cashier rejected, manager/owner/platform-admin allowed;
- no local role-to-permission mapping reappears in controller;
- P8.1/P8.2 direct-bypass behavior is preserved.
```

### 4. Document persisted permission claim gap

If the current system has no persisted permission claims, do not invent fake claims.

Document:

```txt
- current permission source is role-derived registry;
- where future persisted claims should be loaded from;
- how explicit claims should be validated before changing merge behavior;
- why intersection is safer than union until claims are trusted.
```

### 5. Route RBAC integration audit

Audit whether existing route guards can import/use the registry, but do not rewrite all routes unless simple and safe.

Report:

```txt
- current route role gate behavior;
- whether permission context middleware can run after auth/tenant middleware;
- any route ordering constraints;
- which routes now receive order-action permission context;
- which routes remain role-gated only.
```

## Required tests

### Adapter/middleware tests

Add tests for the permission context adapter:

```txt
- owner role -> includes orders:cancel_active
- manager role -> includes orders:cancel_active
- platform-admin role -> includes orders:cancel_active
- cashier role -> excludes orders:cancel_active
- kitchen/viewer/missing role -> excludes orders:cancel_active
- reserved refund/void/delete permissions are not included
- explicit claims are intersected with role-derived baseline unless trusted source is clearly available
```

### Controller/direct-bypass regression tests

Keep or extend existing direct-bypass tests:

```txt
- active cancel with reason as cashier -> rejected
- active cancel with reason as manager -> allowed
- active cancel with reason as owner -> allowed
- active cancel with reason as platform-admin -> allowed
- active cancel with missing role -> rejected
- full payment without orders_queue -> allowed
- partial payment without entitlement -> rejected
- active/kitchen/fired update bypass -> rejected
```

### Registry tests

Keep P8.2 registry tests passing. Add tests only if registry behavior changes.

## Validation commands

Run:

```bash
pnpm --filter @pos/application type-check
pnpm --filter @pos/api type-check
pnpm --filter @pos/application test
pnpm --filter @pos/api test
pnpm type-check
```

If frontend is touched, also run:

```bash
pnpm --filter @pos/terminal-web type-check
pnpm --filter @pos/terminal-web test
```

Run cleanup grep:

```bash
rg -n "orders_queue.*full payment|orders_queue.*recordPayment|recordPayment.*orders_queue|plan.*businessProfile|restaurant_table_service.*businessType|businessType.*restaurant_table_service|GenericPOSPage|features/pos/services|features/pos/mappers" apps packages shared
```

Run controller mapping grep:

```bash
rg -n "owner.*orders:cancel_active|manager.*orders:cancel_active|platform-admin.*orders:cancel_active|cancel_active.*owner|cancel_active.*manager|cancel_active.*platform-admin" apps/api/src/http/controllers
```

Expected:

```txt
- no full payment dependency on orders_queue;
- no business type mapped to paid workflow profile mode;
- no GenericPOSPage or old frontend compatibility shims;
- no controller-local role-to-cancel-active mapping;
- permission context resolved through shared registry/middleware/helper.
```

## Required report

Create:

```txt
roadmap/business-flows/P8_3_trusted_permission_claim_source_report.md
```

Report must include:

```txt
1. Summary
2. Files changed
3. Permission context design
4. Middleware/adapter placement
5. Permission source and trust model
6. Role/claim/effective permission matrix
7. OrdersController refactor summary
8. Route RBAC integration audit
9. Test matrix and result
10. Validation output
11. Cleanup grep findings
12. Remaining risks
13. Next recommended phase
```

Update:

```txt
roadmap/business-flows/main.md
PLANS.md
```

if those files track phase progress.

## Completion checklist

- [ ] Trusted permission context type/helper added.
- [ ] Middleware/adapter added or safe limitation documented.
- [ ] Request context permission resolution uses P8.2 registry.
- [ ] OrdersController uses permission context/helper, not local role mapping.
- [ ] Adapter/middleware tests added.
- [ ] Direct-bypass regression tests still pass.
- [ ] Reserved refund/void/delete permissions are not granted by default.
- [ ] Full payment without orders_queue remains tested/passing.
- [ ] Validation commands run and documented.
- [ ] Cleanup greps documented.
- [ ] P8.3 report created.

## Commit

```txt
refactor(api): add trusted order action permission context
```
