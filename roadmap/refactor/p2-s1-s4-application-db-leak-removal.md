# P2 S1-S4 — Remove Application Layer DB/Infrastructure Leaks

Status: partially implemented — targeted first batch validated (2026-06-08)
Purpose: make `packages/application` depend on ports/contracts instead of infrastructure and DB schema.

## Goal

Remove direct imports from `packages/application` to:

```txt
@pos/infrastructure/database
@shared/schema
Drizzle table definitions
raw database clients as constructor dependencies
```

## S1 — Audit and order migration priority

Prioritize files with money/order/inventory impact first:

```txt
1. packages/application/orders/RecordPayment.ts
2. packages/application/orders/CreateAndPayOrder.ts
3. packages/application/orders/orderNumberSequence.ts
4. packages/application/sync/SyncOfflineOrder.ts
5. packages/application/catalog/CreateOrUpdateProduct.ts
6. packages/application/inventory/inventoryPolicy.ts
7. packages/application/inventory/inventorySyncErrors.ts
8. packages/application/inventory/stockMovements.ts
```

## S2 — Migrate read/write dependencies to ports

For each use case:

- Replace direct DB constructor dependencies with repository/service ports.
- Replace Drizzle table imports with domain/application DTOs.
- Move raw SQL and table mapping into infrastructure adapters.
- Keep public input/output contracts stable unless explicitly documented.

## S3 — Move persistence mapping to infrastructure

Infrastructure adapters should own:

- snake_case/camelCase DB mapping
- Drizzle insert/select/update code
- raw SQL details
- row locks and returning clauses
- DB-specific error mapping

Application use cases should own:

- business validation
- payment/order status decisions
- orchestration order
- idempotency policy at business level
- error intent/meaning, not DB implementation detail

## S4 — Update composition root

Update `apps/api/src/container.ts` or the new composition root to wire:

```txt
use case -> application port -> infrastructure adapter
```

No controller should instantiate repositories directly unless it is a temporary compatibility boundary documented in this phase.

## Hard rules

- Do not weaken tenant/outlet isolation.
- Do not remove idempotency behavior.
- Do not remove `SELECT FOR UPDATE`/locking behavior; move it into infrastructure or UnitOfWork adapter.
- Do not change cash, standard payment, partial payment, or order lifecycle behavior.
- Do not mix frontend refactor into this phase.

## Validation commands

```bash
pnpm --filter @pos/application type-check
pnpm --filter @pos/infrastructure type-check
pnpm --filter @pos/api type-check
pnpm --filter @pos/api test
pnpm type-check
```

## Definition of done

- Targeted application files no longer import `@pos/infrastructure/database`.
- Targeted application files no longer import `@shared/schema`.
- Runtime wiring is explicit in composition root.
- Existing payment/order/inventory tests pass or baseline failures are documented.

## Execution notes — 2026-06-08 P2 targeted batch

Status: partially implemented / targeted batch validated.

Completed in this batch:

- [x] `packages/application/orders/RecordPayment.ts` no longer imports `@pos/infrastructure/database`, `@shared/schema`/`shared/schema`, or Drizzle. The transaction-safe row lock, idempotency replay, payment insert, and tenant-filtered paid amount update moved behind `RecordPaymentRepositoryPort` into `packages/infrastructure/repositories/orders/DrizzleRecordPaymentRepository.ts`.
- [x] `packages/application/orders/CreateAndPayOrder.ts` no longer imports `@pos/infrastructure/database`, `@shared/schema`/`shared/schema`, or Drizzle. The previous create-and-pay DB transaction, idempotency replay query, order/payment inserts, payment status update, and strict inventory transaction path moved behind `CreateAndPayOrderRepositoryPort` into `packages/infrastructure/repositories/orders/DrizzleCreateAndPayOrderRepository.ts`.
- [x] `packages/application/orders/orderNumberSequence.ts` is now pure date/formatting logic only. The tenant timezone query and `order_number_sequences` upsert moved to `packages/infrastructure/repositories/orders/orderNumberSequence.ts` and are exposed through `DrizzleOrderNumberSequenceRepository`.
- [x] `packages/application/sync/SyncOfflineOrder.ts` no longer imports `@pos/infrastructure/database`, `@shared/schema`/`shared/schema`, or Drizzle. Sync batch persistence, conflict audit rows, product/table snapshots, metadata stamping, and sync event writes moved behind `SyncOfflineOrderRepositoryPort` into `packages/infrastructure/repositories/sync/DrizzleSyncOfflineOrderRepository.ts`.
- [x] `apps/api/src/container.ts` now wires `use case -> application port -> infrastructure adapter` for RecordPayment, CreateAndPayOrder, and SyncOfflineOrder without changing endpoint routes or controller contracts.

Validation:

- [x] `pnpm --filter @pos/application type-check` — pass.
- [x] `pnpm --filter @pos/infrastructure type-check` — pass.
- [x] `pnpm --filter @pos/api type-check` — pass.
- [x] `pnpm --filter @pos/api test` — pass, 195/195 tests.

Important scope notes:

- [ ] Full P2 is not complete yet. Remaining application-layer DB/schema/Drizzle imports still exist outside the four requested starting targets, including inventory helpers, catalog create/update, seating table types, and some order list/create mapper files.
- [ ] P3 was not started.
- [ ] No endpoint behavior, DB schema, cash/standard payment behavior, or partial payment behavior was intentionally changed in this batch.
