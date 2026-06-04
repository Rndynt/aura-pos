# Replit Agent Prompt — AuraPoS Generic Payment Engine Phase 1

Use this prompt in Replit Agent.

## Mission

You are working in the AuraPoS repository. Build Phase 1 of the new Generic Payment Engine.

Read and follow this roadmap first:

- `docs/payment-engine-roadmap.md`

This task is Phase 1 only. Build the independent base manual payment engine. Do not implement future phases early.

## Critical Guardrails

- Do not break the existing order payment flow.
- Do not delete or rewrite legacy order payment code.
- Do not change the behavior of `/api/orders/:id/payments`.
- Do not change the behavior of `/api/orders/create-and-pay`.
- Do not hardcode the new engine to orders only.
- The new engine must support generic payable references: `payable_type` and `payable_id`.
- All new tables must be tenant-aware.
- All new reads and writes must enforce tenant isolation.
- Manual payment recording must be idempotent.
- Manual payment recording must lock the payment intent row before calculating the remaining balance.
- Do not allow accidental overpayment.
- Keep `amount`, `received_amount`, and `change_amount` separate.
- `amount` is the applied amount.
- `received_amount` is the actual cash received.
- `change_amount` is cash change returned to the customer.
- Reject non-cash overpayment.
- Payment status must not automatically complete operational order status.
- Add tests.
- Run checks/tests.
- Commit your implementation when complete.
- Create an implementation report.

Avoid modifying these files unless only minimal wiring requires it:

- `packages/application/orders/RecordPayment.ts`
- `packages/application/orders/CreateAndPayOrder.ts`
- `apps/api/src/http/routes/orders.ts`

## Phase 1 Scope

Implement only:

- Database schema additions
- Migration
- Domain payment types
- Infrastructure repositories
- Application use cases
- API controller and route under `/api/payment-engine`
- Tests
- Implementation report

Do not implement yet:

- Real Midtrans/Xendit/Stripe integration
- Webhook processing logic
- Order adapter integration
- POS UI changes
- Split bill
- Customer ledger
- Stock reservation
- PPOB agent wallet or credit

## Database Tables

Add these tables to `shared/schema.ts` using the existing Drizzle style, then add/generate a migration.

### `payment_intents`

Columns:

- `id`
- `tenantId`
- `outletId`
- `payableType`
- `payableId`
- `currency`
- `amountDue`
- `amountPaid`
- `amountRefunded`
- `amountRemaining`
- `status`
- `allowPartial`
- `expiresAt`
- `metadata`
- `idempotencyKey`
- `createdAt`
- `updatedAt`

Indexes:

- tenant index
- outlet index
- tenant + payable type + payable id index
- tenant + status index
- created at index
- unique tenant + idempotency key where idempotency key is not null

Statuses:

- `requires_payment`
- `partially_paid`
- `paid`
- `overpaid`
- `cancelled`
- `expired`
- `refunded`
- `partially_refunded`

### `payment_transactions`

Columns:

- `id`
- `tenantId`
- `paymentIntentId`
- `direction`
- `transactionType`
- `method`
- `provider`
- `status`
- `amount`
- `receivedAmount`
- `changeAmount`
- `providerReference`
- `providerPaymentUrl`
- `providerQrString`
- `failureReason`
- `idempotencyKey`
- `metadata`
- `createdAt`
- `updatedAt`
- `succeededAt`
- `failedAt`
- `cancelledAt`

Indexes:

- tenant index
- payment intent index
- tenant + status index
- provider + provider reference index
- unique tenant + idempotency key where idempotency key is not null
- unique provider + provider reference where provider reference is not null

Statuses:

- `pending`
- `requires_action`
- `succeeded`
- `failed`
- `cancelled`
- `voided`
- `refunded`

Transaction types:

- `payment`
- `deposit`
- `settlement`
- `refund`
- `void`
- `adjustment`

Methods:

- `cash`
- `card`
- `qris`
- `ewallet`
- `bank_transfer`
- `customer_credit`
- `other`

### `payment_allocations`

Columns:

- `id`
- `tenantId`
- `paymentIntentId`
- `paymentTransactionId`
- `targetType`
- `targetId`
- `amount`
- `metadata`
- `createdAt`

Indexes:

- tenant index
- payment intent index
- payment transaction index
- tenant + target type + target id index

### `payment_provider_events`

Add this table for future gateway readiness. Do not implement real webhook processing in Phase 1.

Columns:

- `id`
- `tenantId`
- `provider`
- `providerEventId`
- `providerReference`
- `eventType`
- `rawPayload`
- `signatureValid`
- `processingStatus`
- `processedAt`
- `errorMessage`
- `createdAt`

Indexes:

- unique provider + provider event id
- provider + provider reference index
- processing status index
- created at index

## Domain Files

Create:

- `packages/domain/payments/types.ts`
- `packages/domain/payments/status.ts`
- `packages/domain/payments/provider.ts`
- `packages/domain/payments/policy.ts`
- `packages/domain/payments/index.ts`

Define reusable status/type/method constants and TypeScript types.

Also define a `PaymentProvider` interface for future gateway support. The interface should exist in Phase 1, but do not add real external providers yet.

## Infrastructure Repositories

Create under:

- `packages/infrastructure/repositories/payments/`

Suggested files:

- `PaymentIntentRepository.ts`
- `PaymentTransactionRepository.ts`
- `PaymentAllocationRepository.ts`
- `PaymentProviderEventRepository.ts`
- `index.ts`

Repositories must be tenant-safe and transaction-compatible where needed.

## Application Use Cases

Create under:

- `packages/application/payments/`

Required use cases:

- `CreatePaymentIntent`
- `GetPaymentIntent`
- `ListPaymentTransactions`
- `RecordManualPayment`
- `RecalculatePaymentIntent`

### CreatePaymentIntent Rules

- `amount_due` must be greater than zero.
- Currency defaults to `IDR`.
- `amount_paid` starts at zero.
- `amount_refunded` starts at zero.
- `amount_remaining` equals `amount_due`.
- Status starts as `requires_payment`.
- If an idempotency key already exists for the same tenant, return the existing intent with `idempotent_replay: true`.

### RecordManualPayment Rules

- `amount` must be greater than zero.
- Lock the payment intent row before calculating remaining balance.
- Reject if the intent does not belong to the tenant.
- Reject if intent is cancelled, expired, paid, refunded, or overpaid.
- Replay existing transaction when the same tenant/idempotency key is used.
- If `allowPartial` is false, payment must settle the remaining amount.
- If `allowPartial` is true, payment may be lower than remaining amount.
- `amount` cannot exceed remaining amount.
- Cash may have `receivedAmount` greater than `amount`; calculate `changeAmount`.
- Non-cash `receivedAmount` greater than `amount` must be rejected.
- Insert a succeeded manual incoming transaction.
- Insert a default allocation to the intent payable target.
- Recalculate intent totals after insert.

### RecalculatePaymentIntent Rules

- `amountPaid` equals sum of succeeded incoming payment/deposit/settlement transactions.
- `amountRefunded` equals sum of succeeded outgoing refund transactions.
- `amountRemaining = max(0, amountDue - amountPaid + amountRefunded)`.
- Mark paid when remaining is zero.
- Mark partially paid when paid amount is greater than zero and remaining is greater than zero.
- Mark requires payment when paid amount is zero.

## API

Create:

- `apps/api/src/http/controllers/PaymentEngineController.ts`
- `apps/api/src/http/routes/payment-engine.ts`

Mount the new route in:

- `apps/api/src/http/routes/index.ts`

Base path:

- `/api/payment-engine`

Required endpoints:

- `POST /api/payment-engine/intents`
- `GET /api/payment-engine/intents/:id`
- `GET /api/payment-engine/intents/:id/transactions`
- `POST /api/payment-engine/intents/:id/manual-payments`

Use existing middleware context:

- `req.tenantId`
- `req.outletId`

Use Zod validation and the existing response style.

## Dependency Wiring

Inspect the existing container/dependency pattern and register new repositories/use cases consistently. Do not invent a second architecture if the repo already has one.

## Tests

Add tests following the repo's existing test style.

Minimum cases:

1. Create intent initializes totals correctly.
2. Create intent idempotency replays existing intent.
3. Manual full cash payment marks intent as paid.
4. Manual partial payment marks intent as partially paid.
5. Partial payment is rejected when `allowPartial` is false.
6. Cash `receivedAmount` greater than `amount` calculates `changeAmount`.
7. Non-cash overpayment is rejected.
8. Duplicate manual payment idempotency key does not duplicate transaction.
9. List transactions is tenant-scoped.
10. Tenant A cannot access tenant B intent.

## Checks

Run available commands before final report. Try at minimum:

- `npm run check`
- the repo's test command
- migration generation/check command if available

If a command fails because of pre-existing unrelated repo issues, report it honestly with the relevant error summary.

## Report

Create:

- `docs/reports/payment-engine-phase-1-report.md`

The report must include:

- Summary
- Files changed
- Database tables added
- API endpoints added
- Tests added
- Commands run
- Test/check results
- Known limitations
- Confirmation that legacy order payment flow was not intentionally changed

## Final Commit

Commit all changes with a clear message, for example:

- `feat(payment-engine): add independent base manual payment engine`

Final response must include:

- Summary
- Tests/checks run
- Commit SHA
- Files changed
- Known issues
