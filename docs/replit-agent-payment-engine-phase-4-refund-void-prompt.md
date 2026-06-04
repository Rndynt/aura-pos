# Replit Agent Prompt — Payment Engine Phase 4 Refund/Void Base Lifecycle

Use this prompt in Replit Agent.

You are working in the AuraPoS repository.

This is **Payment Engine Phase 4: Refund/Void Base Lifecycle**.

Read first:

- `docs/payment-engine-roadmap.md`
- `docs/reports/payment-engine-phase-1-report.md`
- `docs/reports/payment-engine-phase-1-hardening-report.md`
- `docs/reports/payment-engine-phase-1-5-hardening-report.md`
- `docs/reports/payment-engine-phase-1-5-followup-report.md`
- `docs/reports/payment-engine-phase-2-gateway-abstraction-report.md`
- `docs/reports/payment-engine-phase-2-hardening-report.md`
- `docs/reports/payment-engine-phase-3-webhook-engine-report.md`
- `docs/reports/payment-engine-phase-3-hardening-report.md`

Current accepted base:

- `ec0158ebcc8da868730b17c636e5c8ec430cdff7`

## Do not change legacy order payment behavior

Do not intentionally change:

- `/api/orders/:id/payments`
- `/api/orders/create-and-pay`
- `packages/application/orders/RecordPayment.ts`
- `packages/application/orders/CreateAndPayOrder.ts`
- `apps/api/src/http/routes/orders.ts`
- `order_payments` legacy table behavior

## Do not implement future phases yet

Do not implement:

- real Midtrans/Xendit/Stripe integration
- real external refund API calls
- order adapter integration
- POS UI changes
- split bill
- customer ledger
- stock reservation
- PPOB wallet or agent credit
- standalone extraction

## Main goal

Implement the base refund and void lifecycle inside the generic Payment Engine without connecting to real external providers.

Phase 4 must support:

1. Voiding pending/requires_action gateway transactions.
2. Refunding succeeded incoming transactions.
3. Partial and full refunds.
4. Refund idempotency.
5. Provider interface semantics for manual and fake providers.
6. Correct payment intent recalculation after refund.
7. Audit-safe transaction relationships.
8. API endpoints and tests.
9. Report.

---

## Important definitions

### Void

Void is for transactions that have not settled yet.

Allowed original transaction states:

- `pending`
- `requires_action`

Void behavior:

- Mark the original transaction as `voided` or `cancelled` according to existing status convention. Prefer `voided` for explicit payment semantics.
- Do not create outgoing money movement.
- Do not change `amountPaid`.
- Do not create allocation.
- Do not recalculate into paid.

Reject void for:

- `succeeded` transactions. Use refund instead.
- `failed`, `cancelled`, `voided`, `refunded` transactions.

### Refund

Refund is for transactions that have already succeeded.

Allowed original transaction states:

- original incoming transaction must be `succeeded`
- original transaction type must be `payment`, `deposit`, or `settlement`

Refund behavior:

- Create a new outgoing `payment_transactions` row.
- `direction = outgoing`
- `transactionType = refund`
- `status = succeeded` for Phase 4 internal/manual/fake lifecycle.
- Link refund transaction to the original transaction.
- Recalculate payment intent totals.

Refund must support:

- partial refund
- full refund
- multiple partial refunds until the original amount is fully refunded

Reject refund when:

- original transaction is not found
- original transaction belongs to another tenant
- original transaction is not succeeded
- refund amount is <= 0
- refund amount exceeds remaining refundable amount
- duplicate idempotency key is used for a different original transaction

---

## Task 1 — Add transaction relationship fields if needed

Review current `payment_transactions` schema.

If there is no way to link refund/void records to the original transaction, add a nullable relationship column.

Recommended column:

- `parentTransactionId uuid nullable references payment_transactions(id) on delete set null`

Alternative acceptable name:

- `originalTransactionId`
- `relatedTransactionId`

Preferred: `parentTransactionId` because it can represent refund/void/adjustment relationships generically.

Add indexes:

- `payment_transactions_parent_idx` on `parentTransactionId`
- optional tenant + parent index if useful

Add migration and update migration journal.

Do not mutate existing rows except schema addition.

---

## Task 2 — Fix recalculation refund semantics

Review `RecalculatePaymentIntent` and status calculation.

Required calculation:

- `amountPaid` = sum of succeeded incoming transactions with transactionType in `payment`, `deposit`, `settlement`
- `amountRefunded` = sum of succeeded outgoing transactions with transactionType = `refund`
- `netPaid` = `amountPaid - amountRefunded`
- `amountRemaining` = max(0, amountDue - netPaid)

Status rules:

- `refunded` if `amountPaid > 0` and `amountRefunded >= amountPaid`
- `partially_refunded` if `amountRefunded > 0` and `amountRefunded < amountPaid`
- `paid` if `amountRefunded = 0` and `netPaid >= amountDue`
- `partially_paid` if `netPaid > 0` and `netPaid < amountDue`
- `requires_payment` if `netPaid <= 0` and amountRefunded = 0

Important:
- Avoid status `paid` when a refund has reduced the net paid amount below amountDue.
- Avoid setting amountRemaining to 0 after full refund.
- Existing manual/gateway payment tests must still pass.

Add tests for status calculation.

---

## Task 3 — Refund use case

Create:

- `packages/application/payments/RefundPaymentTransaction.ts`

Input:

- `tenantId`
- `transactionId`
- `amount`
- `reason?`
- `metadata?`
- `idempotencyKey?`

Rules:

- Lock original transaction row with `FOR UPDATE`.
- Lock related payment intent row with `FOR UPDATE`.
- Validate original transaction belongs to tenant.
- Validate original transaction is `succeeded`.
- Validate original direction is `incoming`.
- Validate original transactionType is `payment`, `deposit`, or `settlement`.
- Compute refundable remaining:
  - original amount minus sum of succeeded outgoing refund transactions where `parentTransactionId = originalTx.id`.
- Reject amount > refundable remaining.
- Idempotency:
  - same tenant + same idempotency key + same original transaction returns existing refund transaction and updated intent.
  - same key + different original transaction returns `IDEMPOTENCY_KEY_CONFLICT`.
- Create outgoing refund transaction:
  - `paymentIntentId = original.paymentIntentId`
  - `parentTransactionId = original.id`
  - `direction = outgoing`
  - `transactionType = refund`
  - `method = original.method` or input method if you add one; prefer original method for Phase 4.
  - `provider = original.provider`
  - `status = succeeded`
  - `amount = refund amount`
  - `providerReference = generated internal/fake refund reference or null`
  - `succeededAt = now`
  - `metadata` includes reason
- Recalculate intent inside the same transaction.
- Return refund transaction + updated intent + refundable remaining after refund.

Provider calls:
- Do not call real provider APIs.
- ManualProvider.refundPayment and FakeGatewayProvider.refundPayment may still return unsupported unless you explicitly implement fake internal refund semantics at use-case level.
- For Phase 4, refund transaction creation is internal engine behavior only.

---

## Task 4 — Void use case

Create:

- `packages/application/payments/VoidPaymentTransaction.ts`

Input:

- `tenantId`
- `transactionId`
- `reason?`
- `metadata?`
- `idempotencyKey?` optional

Rules:

- Lock original transaction row with `FOR UPDATE`.
- Lock related payment intent row with `FOR UPDATE`.
- Validate original belongs to tenant.
- Allowed statuses: `pending`, `requires_action`.
- Reject succeeded transactions with message: `Succeeded transactions must be refunded, not voided`.
- Reject failed/cancelled/voided/refunded transactions.
- Mark original transaction status as `voided`.
- Set `cancelledAt` or `voidedAt` if schema has field. Current schema has `cancelledAt`; use it if no `voidedAt` exists.
- Add reason/metadata if available.
- Do not create allocation.
- Do not change amountPaid.
- Recalculate intent only if needed; pending/voided tx should not affect paid totals.
- Return updated transaction + current intent.

Idempotency:
- Re-voiding an already voided transaction can return idempotent success if same transaction and same idempotency key is used, or reject as already terminal. Choose one policy and document it.
- Keep it simple: without idempotency match, already voided should reject `INVALID_TRANSITION`.

---

## Task 5 — Repository additions

Add transaction repository methods as needed:

- `lockByIdForUpdate(id, tenantId, tx)`
- `sumRefundedForParent(parentTransactionId, tenantId, tx?)`
- `findRefundByIdempotencyKey(tenantId, idempotencyKey, tx?)`
- `findByParentTransactionId(parentTransactionId, tenantId, tx?)`

Update types and mappings for new `parentTransactionId` field.

Keep all repository reads tenant-scoped unless explicitly global for webhooks.

---

## Task 6 — API endpoints

Add endpoints under `/api/payment-engine`.

Required endpoints:

```text
POST /api/payment-engine/transactions/:id/refund
POST /api/payment-engine/transactions/:id/void
```

Refund body:

```json
{
  "amount": 50000,
  "reason": "Customer returned item",
  "metadata": {},
  "idempotency_key": "optional-key"
}
```

Void body:

```json
{
  "reason": "Customer cancelled before payment",
  "metadata": {},
  "idempotency_key": "optional-key"
}
```

Security:

- Use existing payment engine operator guard.
- Do not expose these routes without auth/service-token path already established.
- Do not make them provider webhooks.

Error mapping:

- not found: 404
- invalid transition: 422
- idempotency conflict: 409
- amount exceeds refundable remaining: 422
- validation error: 400

---

## Task 7 — Domain/provider behavior

Update provider comments or behavior to align with Phase 4:

- ManualProvider refund/cancel may remain unsupported if use cases are internal-only, but comments should no longer say Phase 1 only if misleading.
- FakeGatewayProvider refund/cancel may remain unsupported unless explicitly implemented.
- Document that Phase 4 refund/void is internal engine lifecycle; real provider refund API will be implemented later.

Do not add real external calls.

---

## Task 8 — Tests

Add tests for:

Refund:

1. Refund succeeded incoming manual/gateway transaction.
2. Partial refund updates `amountRefunded`, `amountRemaining`, and `partially_refunded` status.
3. Full refund updates status to `refunded`.
4. Multiple partial refunds cannot exceed original amount.
5. Refund amount greater than refundable remaining is rejected.
6. Refund failed/pending/voided transaction is rejected.
7. Refund outgoing transaction is rejected.
8. Refund idempotency replay same key same original transaction.
9. Refund idempotency conflict same key different original transaction.
10. Refund transaction has `parentTransactionId` linked to original.

Void:

11. Void pending transaction marks original transaction voided.
12. Void does not change `amountPaid`.
13. Void does not create allocation.
14. Void succeeded transaction is rejected and instructs refund instead.
15. Void already failed/voided/refunded transaction is rejected.
16. Void tenant isolation works.

Regression:

17. Manual payment tests still pass.
18. Gateway pending/succeeded tests still pass.
19. Webhook tests still pass.
20. Recalculate status tests cover paid, partially_paid, partially_refunded, refunded.

Prefer application-level tests plus DB-backed tests if practical.

---

## Task 9 — Report

Create:

- `docs/reports/payment-engine-phase-4-refund-void-report.md`

Report must include:

- summary
- files changed
- schema/migration changes
- refund lifecycle design
- void lifecycle design
- recalculation/status changes
- idempotency behavior
- API endpoints added
- tests added/updated
- commands run
- known limitations
- confirmation that legacy order payment flow was not intentionally changed
- confirmation that real provider refund APIs/order adapter/UI/split bill/ledger/stock/PPOB/standalone extraction were not implemented

## Commands to run

Run available checks:

- `npm run check`
- Phase 1 payment engine tests
- Phase 2 gateway tests
- Phase 3 webhook tests
- Phase 4 refund/void tests
- DB-backed payment tests if available
- `npm run db:check` if available

If a command fails, report exact relevant error summary.

## Commit

Commit all changes with a clear message, for example:

`feat(payment-engine): add base refund and void lifecycle`

Final Replit response must include:

- summary
- commit SHA
- files changed
- tests/checks run
- known issues
- confirmation that legacy order payment flow was not intentionally changed
