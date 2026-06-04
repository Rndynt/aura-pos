# Replit Agent Prompt — Payment Engine Phase 1 Hardening

You are working in the AuraPoS repository.

Your task is to harden the existing Generic Payment Engine Phase 1 implementation. This is not Phase 2. Do not add real payment gateway integration, webhook processing, order adapter integration, POS UI changes, split bill, customer ledger, stock reservation, PPOB wallet, or agent credit.

Read these files first:

- `docs/payment-engine-roadmap.md`
- `docs/reports/payment-engine-phase-1-report.md`
- `docs/replit-agent-payment-engine-prompt.md`
- `packages/application/payments/RecordManualPayment.ts`
- `packages/application/payments/RecalculatePaymentIntent.ts`
- `packages/infrastructure/repositories/payments/PaymentIntentRepository.ts`
- `packages/infrastructure/repositories/payments/PaymentTransactionRepository.ts`
- `packages/infrastructure/repositories/payments/PaymentAllocationRepository.ts`
- `packages/domain/payments/policy.ts`
- `packages/domain/payments/provider.ts`
- `apps/api/src/http/routes/payment-engine.ts`
- `apps/api/src/http/controllers/PaymentEngineController.ts`
- `apps/api/src/__tests__/payment-engine.test.ts`

Do not intentionally change the legacy order payment flow:

- `/api/orders/:id/payments`
- `/api/orders/create-and-pay`
- `packages/application/orders/RecordPayment.ts`
- `packages/application/orders/CreateAndPayOrder.ts`
- `apps/api/src/http/routes/orders.ts`

## Required hardening work

### 1. Atomic manual payment

`RecordManualPayment` must become fully atomic. The same database transaction must lock the payment intent row, check idempotency, insert the payment transaction, insert the default allocation, recalculate payment totals, update the payment intent, and return the updated intent.

If any part fails, the whole manual payment operation must roll back. Do not leave a transaction row without a synchronized payment intent state.

### 2. Transaction-aware repositories

Make payment repositories accept an optional transaction client for the methods used during payment recording.

At minimum, support transaction clients for intent lookup, idempotency lookup, transaction creation, allocation creation, transaction listing for recalculation, and intent update.

Existing non-transactional calls must still work.

### 3. Idempotency hardening

For the same tenant and idempotency key, manual payment recording must replay the existing transaction instead of creating duplicates. It must not double-count `amountPaid` and must not create duplicate allocations. Add a concurrency-style test if practical.

### 4. Payment engine route protection

Inspect existing middleware patterns and add the simplest appropriate protection to `/api/payment-engine` routes. At minimum, requests without resolved tenant context must be rejected clearly. Prefer existing cashier/manager style middleware if the repo already has one.

### 5. ManualProvider semantics

`ManualProvider.createPayment` may still succeed immediately. However, `ManualProvider.cancelPayment` and `ManualProvider.refundPayment` must not report success in Phase 1 because refund and void are not implemented yet. Make this behavior explicit and add tests.

### 6. Refund limitation documentation

Do not implement refund or void now. Document that refund and void status calculation must be revisited in Phase 4. Preserve current correct behavior for `requires_payment`, `partially_paid`, and `paid`.

### 7. Tests

Add or update tests for:

- atomic manual payment behavior
- rollback behavior when allocation or intent update fails
- duplicate idempotency key behavior
- concurrency-style duplicate idempotency behavior if practical
- missing tenant context route rejection
- ManualProvider cancel/refund unsupported behavior
- existing create intent, partial payment, and full payment behavior

Use DB-backed tests if practical. If DB-backed transaction tests are not practical, use strong transaction fakes and explain the limitation in the report.

### 8. Report

Create:

- `docs/reports/payment-engine-phase-1-hardening-report.md`

The report must include summary, files changed, atomicity fix, transaction-aware repository changes, idempotency behavior, route protection behavior, ManualProvider behavior, tests added or updated, commands run, check results, known limitations, and confirmation that legacy order payment flow was not intentionally changed.

## Commands

Run the available project checks before the final report:

- `npm run check`
- the repo test command
- payment engine specific tests
- `npm run db:check` if available

If a command fails, report the exact relevant error summary.

## Commit

Commit all changes with a clear message, for example:

`fix(payment-engine): harden phase 1 manual payment atomicity`

Final response must include summary, commit SHA, files changed, tests/checks run, known issues, and confirmation that legacy order payment flow was not intentionally changed.
