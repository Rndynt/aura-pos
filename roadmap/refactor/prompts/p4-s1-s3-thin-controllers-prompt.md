# AuraPoS Refactor — P4 S1-S3 Thin Controllers Agent Prompt

You are working in the `Rndynt/AuraPoS` repository.

This prompt is the updated P4 prompt that must be used after P2 and P3 have been completed and validated.

## Objective

Execute **P4 S1-S3 — Thin Controllers** safely.

The goal is to make HTTP controllers thinner by moving business orchestration out of controllers and into application-layer use cases/services, while preserving all behavior validated in P2 and P3.

Primary target:

```txt
apps/api/src/http/controllers/OrdersController.ts
```

P4 is a behavior-preserving refactor. It is not a feature phase.

## Read first

Read these files before making changes:

```txt
roadmap/refactor/main.md
roadmap/refactor/execution-protocol.md
roadmap/refactor/p4-s1-s3-thin-controllers.md
roadmap/refactor/p3-s1-s3-unit-of-work-transaction-boundary.md
roadmap/refactor/p2-s1-s4-application-db-leak-removal.md

apps/api/src/http/controllers/OrdersController.ts
apps/api/src/container.ts

packages/application/orders/ConfirmOrder.ts
packages/application/orders/CancelOrder.ts
packages/application/orders/RecordPayment.ts
packages/application/orders/CreateAndPayOrder.ts
packages/application/sync/SyncOfflineOrder.ts

packages/application/inventory/inventoryPolicy.ts
packages/application/inventory/stockMovements.ts
packages/application/inventory/inventorySyncErrors.ts

packages/application/shared/ports/UnitOfWorkPort.ts
packages/infrastructure/unit-of-work/DrizzleUnitOfWork.ts

packages/infrastructure/repositories/orders/OrderRepository.ts
packages/infrastructure/repositories/orders/DrizzleRecordPaymentRepository.ts
packages/infrastructure/repositories/orders/DrizzleCreateAndPayOrderRepository.ts
packages/infrastructure/repositories/sync/DrizzleSyncOfflineOrderRepository.ts
```

## Current context

P2 removed DB/schema/Drizzle leaks from the targeted application layer.

P3 is fully validated and introduced a stable transaction boundary through `UnitOfWorkPort.transaction(callback)`.

Therefore P4 must treat the P3 transaction boundary as a contract that cannot be weakened.

## Strict scope

Work only on P4.

Do not start P5.

Do not touch frontend POS.

Do not split CFD/WebSocket/realtime modules.

Do not move schema files.

Do not enforce import-boundary lint rules yet.

Do not rename public endpoints.

Do not change request body shape.

Do not change response body shape.

Do not change DB schema.

Do not change migrations.

Do not change authentication behavior.

Do not change RBAC behavior.

Do not change feature guard behavior.

Do not change tenant middleware behavior.

Do not change outlet middleware behavior.

Do not change cash payment behavior.

Do not change standard payment behavior.

Do not change partial payment behavior.

Do not change payment idempotency behavior.

Do not change order lifecycle behavior.

Do not change offline sync behavior.

Do not weaken tenant/outlet isolation.

Do not reintroduce Northflow/embedded payment code into AuraPoS.

Do not remove or alter standard POS tender/payment functionality.

## P3 behavior that must be preserved

P3 is already fully validated. Do not break it.

Preserve:

```txt
1. UnitOfWorkPort.transaction(callback)
2. RecordPayment idempotency replay
3. RecordPayment row-lock / concurrent payment safety
4. Partial-payment remaining-balance calculation
5. CreateAndPayOrder atomic create + payment + inventory behavior
6. SyncOfflineOrder transaction boundary
7. Strict inventory deduction inside transaction boundary
8. Stock reversal inside transaction boundary
9. Tenant-scoped reads/writes
```

Any P4 extraction must keep those semantics exactly intact.

## P4 goal

Controllers should only handle HTTP concerns:

```txt
- parse request
- validate request DTO or simple params
- read tenant/outlet/user context
- call container/use case/application service
- emit transport-level events if still appropriate
- map result to response
- pass errors to error middleware
```

Controllers must not own order/payment/inventory business workflow.

## Audit target

Audit `apps/api/src/http/controllers/OrdersController.ts` and identify business workflow currently sitting inside the controller.

Target logic to extract:

```txt
1. confirm order + inventory deduction workflow
2. cancel order + inventory reversal workflow
3. inventory policy decision
4. stock deduction/reversal orchestration
5. inventory sync error recording orchestration
6. order lifecycle workflow decisions
7. any controller helper that exists mainly to coordinate domain/application behavior
```

Do not move generic HTTP parsing/response mapping into application services.

## Suggested application services

Create explicit application-layer workflow services if needed:

```txt
packages/application/orders/services/ConfirmOrderWorkflow.ts
packages/application/orders/services/CancelOrderWorkflow.ts
```

Equivalent names are allowed if they are more consistent with the repository conventions.

The service input should be plain data only, for example:

```ts
export type ConfirmOrderWorkflowInput = {
  tenantId: string;
  outletId?: string | null;
  orderId: string;
  actorId?: string | null;
};
```

For cancellation:

```ts
export type CancelOrderWorkflowInput = {
  tenantId: string;
  outletId?: string | null;
  orderId: string;
  actorId?: string | null;
  cancellationReason?: string | null;
};
```

Do not pass Express `Request`, `Response`, or middleware objects to application services.

## Application-layer import rules

Application layer must not import:

```txt
express
@pos/infrastructure/database
@shared/schema
shared/schema
drizzle-orm
apps/api/*
```

Application workflow services may depend on application use cases, application ports, and domain types.

Infrastructure remains responsible for Drizzle and DB implementation details.

API remains responsible for HTTP request/response mapping.

## Container wiring

Update `apps/api/src/container.ts` only as needed to expose the new workflow services.

The controller should call the new workflow service from the container, conceptually like:

```ts
const result = await container.confirmOrderWorkflow.execute({
  tenantId: req.tenantId!,
  outletId: req.outletId ?? null,
  orderId: req.params.id,
  actorId: req.user?.id ?? null,
});
```

Keep actual naming consistent with the existing codebase.

## Event emission rule

If `OrdersController.ts` currently emits order queue, KDS, CFD, customer display, or realtime events after a workflow succeeds, preserve that behavior.

Do not silently remove event emission.

If event emission is transport-level, it may remain in the controller.

If event emission represents business workflow, move it carefully and document why.

## Outlet and tenant isolation rule

Do not remove outlet ownership enforcement.

Outlet ownership enforcement may remain a transport guard if it is truly HTTP-context-related.

If moved into an application service, it must still be tenant-scoped and outlet-scoped.

Never replace scoped lookup with `WHERE id = ...` only. All relevant reads/writes must remain scoped by tenant and, where applicable, outlet/location.

## Inventory behavior rule

Preserve the existing distinction between strict inventory and allow-negative inventory.

Strict inventory behavior must remain transaction-safe.

Allow-negative behavior must preserve existing inventory sync error recording behavior.

Do not double-deduct stock.

Do not skip stock reversal for cancel flows that previously reversed stock.

Do not move inventory policy logic into HTTP-only code.

## Payment behavior rule

P4 must not alter RecordPayment, CreateAndPayOrder, or payment status semantics unless a P4 test failure proves a controller extraction issue.

Preserve:

```txt
- cash payment behavior
- standard payment behavior
- partial payment behavior
- idempotency replay
- row lock safety
- remaining balance calculation
- payment_status transitions
```

## Recommended implementation order

1. Read P4 roadmap and P3 sign-off.
2. Inspect current `OrdersController.ts` and list controller business responsibilities before editing.
3. Create application workflow service(s) for confirm/cancel with inventory behavior.
4. Move business workflow from controller helpers into those services.
5. Wire services in `apps/api/src/container.ts`.
6. Replace controller helper calls with container workflow calls.
7. Keep response shape and event emission behavior stable.
8. Run validation.
9. Update P4 roadmap execution notes.
10. Commit and push.

## Required validation

Run:

```bash
pnpm --filter @pos/application type-check
pnpm --filter @pos/api type-check
pnpm --filter @pos/api test
pnpm type-check
```

Also run or confirm coverage for:

```txt
record-payment-idempotency.test.ts
create-and-pay-stock-concurrency.test.ts
```

If DB-backed tests require `DATABASE_URL`, configure it before running.

## Required audits before commit

Run forbidden import audit:

```bash
rg -n "(express|@pos/infrastructure/database|@shared/schema|shared/schema|drizzle-orm|apps/api)" packages/application
```

Expected result:

```txt
No forbidden application imports introduced by P4.
```

Run endpoint-change audit:

```bash
git diff -- apps/api/src/http/routes apps/api/src/http/controllers
```

Confirm no endpoint path or public response shape changed unless explicitly documented.

Run schema-change audit:

```bash
git diff -- shared/schema.ts packages/infrastructure/db
```

Expected result for P4:

```txt
No DB schema or migration changes.
```

## Documentation update

Update:

```txt
roadmap/refactor/p4-s1-s3-thin-controllers.md
```

Add execution notes with this structure:

```md
## Execution notes — P4 S1-S3

Status: implemented and validated / partially implemented / blocked

### Completed

- [x] Audited OrdersController responsibilities.
- [x] Moved confirm/cancel inventory workflow into application service/use case.
- [x] Kept controller focused on HTTP request/response mapping.
- [x] Preserved endpoint paths and response shapes.
- [x] Preserved P3 UnitOfWork transaction behavior.

### Validation

- `pnpm --filter @pos/application type-check`: pass/fail
- `pnpm --filter @pos/api type-check`: pass/fail
- `pnpm --filter @pos/api test`: pass/fail
- `pnpm type-check`: pass/fail

### Behavior preservation

- Endpoint behavior changed: no
- DB schema changed: no
- Cash payment behavior changed: no
- Standard payment behavior changed: no
- Partial payment behavior changed: no
- Order lifecycle behavior changed: no
- Offline sync behavior changed: no
- Tenant/outlet isolation weakened: no
- P3 transaction boundary weakened: no

### Continuation

P4 is complete. Next safe phase is P5 only after user approval.
```

## Commit and push

Use commit message:

```bash
git commit -m "refactor(api): move order workflows out of controller"
```

Then push the branch.

## If validation fails

Do not start P5.

Do not hide the failure.

Do not weaken tests.

Do not delete DB-backed payment/idempotency/concurrency tests.

Document the exact failure in `roadmap/refactor/p4-s1-s3-thin-controllers.md` under a validation blocker section.

If a fix is required, keep it limited to P4 controller extraction and application workflow wiring.

## Final report required from agent

Report:

```txt
P4 status:
Commit SHA:
Files changed:
Controllers thinned:
Application services/use cases added:
Commands run:
Tests passed:
Endpoint changes: none / documented
DB schema changes: none
Cash/standard/partial payment behavior preserved: yes/no
Order lifecycle behavior preserved: yes/no
Tenant/outlet isolation preserved: yes/no
P3 transaction boundary preserved: yes/no
Whether P5 was started: no
```
