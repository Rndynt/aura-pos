# P4 S1-S3 — Thin Controllers

Status: planned
Purpose: move business orchestration out of HTTP controllers.

## Goal

Controllers should only handle HTTP concerns:

- parse request
- validate DTO
- read tenant/outlet/user context
- call use case
- map response
- pass errors to middleware

Controllers must not own order/payment/inventory business workflow.

## S1 — Audit controller responsibilities

Primary target:

```txt
apps/api/src/http/controllers/OrdersController.ts
```

Identify logic that must move to application layer:

- inventory movement policy
- stock deduction/reversal
- inventory sync error recording
- order lifecycle transition rules
- payment/fulfillment orchestration
- emit decision coupling when it represents business workflow

## S2 — Create application orchestration services/use cases

Move business workflow to application use cases or services:

```txt
packages/application/orders/use-cases/
packages/application/orders/services/
packages/application/inventory/services/
```

Examples:

```txt
ConfirmOrderWithInventory
CancelOrderWithInventoryReversal
CreateKitchenTicketForOrder
RecordOrderPayment
CompleteOrderWorkflow
```

Names may be adjusted, but responsibility must be explicit.

## S3 — Keep transport layer stable

Routes and public API responses must remain compatible unless a dedicated compatibility note is written.

Controller after refactor should look conceptually like:

```ts
const result = await container.confirmOrderWorkflow.execute({
  tenantId: req.tenantId!,
  outletId: req.outletId ?? null,
  orderId: req.params.id,
  actorId: req.user?.id,
});

res.status(200).json({ success: true, data: result });
```

## Hard rules

- Do not remove existing RBAC/feature guard behavior.
- Do not remove outlet ownership enforcement; move it to use case or keep it as transport guard if appropriate.
- Do not move HTTP request/response objects into application layer.
- Do not make application layer import Express.
- Do not change endpoint path or response shape unless documented.

## Validation commands

```bash
pnpm --filter @pos/api type-check
pnpm --filter @pos/application type-check
pnpm --filter @pos/api test
pnpm type-check
```

## Definition of done

- OrdersController is significantly thinner.
- Business workflows are in application layer.
- Application layer has no Express imports.
- Existing order/payment/inventory behavior is preserved.
