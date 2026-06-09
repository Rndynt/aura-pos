# P3 S1-S3 — UnitOfWork and Transaction Boundary

Status: planned
Purpose: preserve atomic order/payment/inventory behavior while removing DB knowledge from application use cases.

## Goal

Introduce a stable `UnitOfWorkPort` so transactional use cases remain safe without directly depending on Drizzle/PostgreSQL.

Critical behavior to preserve:

- Payment row locking.
- Idempotency replay.
- Partial payment remaining balance calculation.
- Atomic create-and-pay.
- Strict inventory movement inside the same transaction when required.
- No double stock deduction or reversal.

## S1 — Define transaction context

Application layer owns a framework-free abstraction:

```ts
export type TransactionContext = unknown;

export interface UnitOfWorkPort {
  transaction<T>(callback: (tx: TransactionContext) => Promise<T>): Promise<T>;
}
```

Repositories that need transaction support accept optional `tx?: TransactionContext`.

## S2 — Implement Drizzle UnitOfWork adapter

Infrastructure owns the real DB implementation:

```txt
packages/infrastructure/db/DrizzleUnitOfWork.ts
```

Responsibilities:

- Open Drizzle transaction.
- Pass transaction object as `TransactionContext`.
- Keep rollback/commit behavior unchanged.
- Avoid leaking Drizzle types back into application imports.

## S3 — Migrate transactional use cases

Primary candidates:

```txt
RecordPayment
CreateAndPayOrder
SyncOfflineOrder
ConfirmOrder inventory strict path
CancelOrder stock reversal path
```

Use cases should depend on:

```txt
UnitOfWorkPort
OrderRepositoryPort
OrderPaymentRepositoryPort
Inventory ports
OrderNumberSequencePort
```

## Hard rules

- Do not remove row-lock semantics from payment flows.
- Do not rely on in-memory concurrency tests as final proof of DB safety.
- Do not compute paid/remaining status outside the transaction if it can race.
- Do not create duplicate payments on retry with the same idempotency key.
- Do not complete operational order lifecycle automatically just because payment is paid unless existing explicit behavior requires it.

## Validation commands

```bash
pnpm --filter @pos/application type-check
pnpm --filter @pos/infrastructure type-check
pnpm --filter @pos/api test
pnpm type-check
```

If DB-backed tests exist, run the payment concurrency/idempotency tests. If not, add a task note for DB-backed concurrency coverage before production.

## Definition of done

- Transaction-safe use cases no longer inject raw DB clients.
- UnitOfWork adapter owns Drizzle transaction detail.
- Payment/order/inventory atomic behavior is preserved.
- Idempotency and row-lock behavior are explicitly covered by tests or documented as pending DB-backed test work.

## Execution notes — 2026-06-09 P3 batch

Status: partially implemented and validated with type-check; API test suite attempted but the DB-backed record-payment test requires `DATABASE_URL` in this environment.

### Completed in this batch

- [x] Stabilized `UnitOfWorkPort` as an application-owned opaque transaction boundary with `transaction(callback)` as the canonical method and a temporary `runInTransaction` compatibility alias.
- [x] Updated the Drizzle UnitOfWork adapter so Drizzle transaction objects remain infrastructure-only and application code passes an opaque `TransactionContext` between ports.
- [x] Routed `RecordPayment`, `CreateAndPayOrder`, and `SyncOfflineOrder` infrastructure adapters through the shared Drizzle UnitOfWork instance from the API composition root instead of constructing independent transaction boundaries per adapter.
- [x] Preserved payment row locking, idempotency replay, partial-payment remaining-balance calculation, and tenant-filtered payment updates inside the payment transaction.
- [x] Preserved create-and-pay order number allocation, order/payment writes, payment status calculation, and strict inventory stock deduction inside one UnitOfWork transaction.
- [x] Kept allow-negative inventory behavior outside the financial transaction with durable inventory sync error recording, matching existing behavior.
- [x] Added transaction-context propagation for confirm/cancel order status updates so strict inventory deduction and strict stock reversal can share the same transaction as the order mutation.
- [x] Kept API route paths, request bodies, response bodies, database schema, cash/standard payment behavior, and partial-payment behavior unchanged.

### Validation run

- [x] `pnpm --filter @pos/application type-check` — passed.
- [x] `pnpm --filter @pos/infrastructure type-check` — passed.
- [x] `pnpm --filter @pos/api type-check` — passed as an additional composition-root check.
- [ ] `pnpm --filter @pos/api test` — attempted; 194/195 tests passed, `record-payment-idempotency.test.ts` failed at startup because `DATABASE_URL` is not set in this environment.
- [x] `pnpm type-check` — passed, 10/10 Turbo type-check tasks.

### Pending / not completed

- [ ] Re-run the DB-backed record-payment idempotency/concurrency test with a configured `DATABASE_URL` before production sign-off.
- [ ] Keep `runInTransaction` compatibility alias only until remaining callers are fully migrated; do not remove it in this batch because it is a safe backward-compatible bridge.
- [ ] P4 was not started.

### Git status

- [x] Local commit created with message `fix: stabilize unit of work transaction boundary`.
- [ ] Push not completed: `git push` failed because the current repository has no configured push destination/remote.
