# Replit Agent Prompt — Payment Engine Phase 4 Hardening

Use this prompt in Replit Agent.

You are working in the AuraPoS repository.

This is **Payment Engine Phase 4 Hardening**. Do not implement Phase 5 reconciliation, real provider refund APIs, order adapter, POS UI, split bill, customer ledger, stock reservation, PPOB, or standalone extraction.

Read first:

- `docs/payment-engine-roadmap.md`
- `docs/reports/payment-engine-phase-4-refund-void-report.md`
- `docs/replit-agent-payment-engine-phase-4-refund-void-prompt.md`

Reviewed Phase 4 commit:

- `bc8fd1d28d1a8a7005ab61262d3449cdd45413ab`

## Do not change legacy order payment behavior

Do not intentionally change:

- `/api/orders/:id/payments`
- `/api/orders/create-and-pay`
- `packages/application/orders/RecordPayment.ts`
- `packages/application/orders/CreateAndPayOrder.ts`
- `apps/api/src/http/routes/orders.ts`
- `order_payments` legacy table behavior

## Main goal

Fix the required Phase 4 hardening issues before moving to Phase 5:

1. Refund idempotency must align with the database tenant-wide idempotency unique index.
2. Refund idempotency must be transaction-safe and concurrency-safe.
3. Refund idempotent replay must return the correct refundable remaining amount.
4. The Phase 4 report must mention the `.replit` change or revert it if unnecessary.
5. Add focused tests and a hardening report.

---

## Task 1 — Fix refund idempotency namespace mismatch

Current problem:

The database unique index for `payment_transactions` is tenant-wide:

- `tenant_id + idempotency_key`

But `RefundPaymentTransaction` currently checks idempotency only through `findRefundByIdempotencyKey`, which filters:

- `direction = outgoing`
- `transactionType = refund`

This creates a mismatch. If an incoming payment already used `idempotencyKey = abc`, then a refund request with the same key may pass the refund-only precheck but fail at DB insert because the tenant-wide unique index rejects it.

Required behavior:

- Treat payment transaction idempotency keys as tenant-wide.
- Before creating a refund, check any existing transaction with the same tenant + idempotency key.
- If existing transaction is an outgoing refund for the same original transaction, replay it.
- If existing transaction belongs to a different parent transaction, or is not a refund transaction, return `IDEMPOTENCY_KEY_CONFLICT`.
- Do not let this become a raw DB unique constraint error.

Implementation guidance:

- Use existing `findByIdempotencyKey(tenantId, key, tx?)` instead of refund-only lookup, or add a clearly named method such as `findAnyByIdempotencyKey`.
- Keep `findRefundByIdempotencyKey` only if still useful, but do not rely on it for the primary refund idempotency check.

Acceptance tests:

- Refund replay same key + same original transaction returns existing refund.
- Same key already used by incoming payment returns conflict, not DB error.
- Same key already used by refund for different original transaction returns conflict.
- Same key already used by non-refund transaction returns conflict.

---

## Task 2 — Move refund idempotency check inside the DB transaction

Current problem:

`RefundPaymentTransaction` checks idempotency before entering `db.transaction`. Two concurrent refund requests with the same idempotency key can both pass the precheck. One succeeds and the other may hit DB unique constraint.

Required behavior:

- Start `db.transaction` first.
- Lock the original transaction with `FOR UPDATE`.
- Check tenant-wide idempotency key inside the transaction.
- If replay/conflict is detected, return/throw cleanly.
- Then lock the intent.
- Then compute refundable remaining.
- Then insert refund transaction and recalculate intent.

Recommended flow:

```text
db.transaction:
  originalTx = lockByIdForUpdate(transactionId, tenantId, tx)
  validate original tx exists

  if idempotencyKey:
    existingTx = findByIdempotencyKey(tenantId, idempotencyKey, tx)
    if existingTx:
      if existingTx is refund and existingTx.parentTransactionId === originalTx.id:
        compute correct refundable remaining using original amount - total refunded for parent
        return replay result
      else:
        throw IDEMPOTENCY_KEY_CONFLICT

  validate original tx succeeded/incoming/payment|deposit|settlement
  intent = lock intent FOR UPDATE
  alreadyRefunded = sumRefundedForParent(originalTx.id, tenantId, tx)
  refundableRemaining = originalAmount - alreadyRefunded
  validate amount <= refundableRemaining
  create outgoing refund tx
  recalculate intent inside same tx
```

Acceptance:

- Duplicate concurrent refund with same idempotency key must not double-refund.
- Duplicate concurrent refund must not surface raw DB unique violation.
- Add `Promise.all` concurrency-style test if practical.
- If DB-backed concurrency tests are not practical, add strong fake/transaction tests and clearly document limitation.

---

## Task 3 — Fix refundableRemaining on idempotent replay

Current bug:

Idempotent replay currently calculates:

```text
existingRefund.amount - alreadyRefunded
```

This is wrong.

Correct calculation:

```text
originalAmount - totalRefundedForParent(originalTransactionId)
```

Example:

- Original amount: 100000
- Existing refund amount: 30000
- Total refunded for parent: 30000
- Correct refundable remaining: 70000
- Current buggy calculation: 30000 - 30000 = 0

Required:

- On idempotent replay, compute refundable remaining from the original transaction amount and total refunded amount for the original transaction.
- Make sure replay returns the current recalculated intent, not stale pre-refund intent if practical.

Acceptance tests:

- Idempotent replay after a 30k refund on a 100k transaction returns refundableRemaining = 70k.
- Idempotent replay after full refund returns refundableRemaining = 0.

---

## Task 4 — Catch and map unique constraint defensively

Even after moving checks inside the transaction, keep defensive behavior for DB unique violations.

Required:

- If insert refund still hits tenant idempotency unique constraint due to race, catch it at use-case or controller level and return clean `IDEMPOTENCY_KEY_CONFLICT` or replay if safe.
- Do not leak raw SQL/Drizzle error messages to API clients.
- Add tests if practical.

---

## Task 5 — Report `.replit` change or revert it

Phase 4 diff changed `.replit`, but `docs/reports/payment-engine-phase-4-refund-void-report.md` does not mention it.

Required:

Choose one:

A. If `.replit` change is unnecessary, revert it.
B. If it is necessary for Replit runtime, keep it but update the report to include it under `Scope Drift / Replit Runtime Change` with a short explanation.

Do not hide scope drift.

---

## Task 6 — Tests

Add or update tests for:

1. Refund idempotency key already used by incoming payment returns conflict.
2. Refund idempotency key already used by another refund parent returns conflict.
3. Refund idempotency replay same key + same parent returns existing refund.
4. Replay refundableRemaining calculation is correct for partial refund.
5. Replay refundableRemaining calculation is correct for full refund.
6. Idempotency check is performed inside transaction after original row lock.
7. Duplicate concurrent refund with same key does not double-refund if practical.
8. Existing Phase 4 refund/void tests still pass.
9. Phase 1–3 payment engine regression tests still pass if practical.

---

## Task 7 — Hardening report

Create:

- `docs/reports/payment-engine-phase-4-hardening-report.md`

Report must include:

- summary
- files changed
- idempotency namespace fix
- transaction-scoped idempotency flow
- refundableRemaining replay fix
- defensive unique constraint behavior
- `.replit` decision
- tests added/updated
- commands run
- known limitations
- confirmation that legacy order payment flow was not intentionally changed
- confirmation that Phase 5+ features were not implemented

## Commands to run

Run available checks:

- `npm run check`
- Phase 4 refund/void tests
- Phase 1–3 payment engine regression tests if practical
- DB-backed payment tests if practical
- `npm run db:check` if available

If a command fails, report exact relevant error summary.

## Commit

Commit all changes with a clear message, for example:

`fix(payment-engine): harden refund idempotency semantics`

Final Replit response must include:

- summary
- commit SHA
- files changed
- tests/checks run
- known issues
- confirmation that legacy order payment flow was not intentionally changed
