# Replit Agent Prompt — Payment Engine Phase 3 Hardening

Use this prompt in Replit Agent.

You are working in the AuraPoS repository.

This is **Payment Engine Phase 3 Hardening**. Do not implement Phase 4 refund/void work yet.

Read first:

- `docs/payment-engine-roadmap.md`
- `docs/reports/payment-engine-phase-3-webhook-engine-report.md`
- `docs/replit-agent-payment-engine-phase-3-webhook-engine-prompt.md`

Reviewed Phase 3 commit:

- `fcea7069ff73113d73c73a728c5904eb85b1c8fb`

## Do not change legacy order payment behavior

Do not intentionally change:

- `/api/orders/:id/payments`
- `/api/orders/create-and-pay`
- `packages/application/orders/RecordPayment.ts`
- `packages/application/orders/CreateAndPayOrder.ts`
- `apps/api/src/http/routes/orders.ts`
- `order_payments` legacy table behavior

## Do not implement future phases

Do not implement:

- refund/void flow
- real Midtrans/Xendit/Stripe integration
- real provider credentials
- order adapter integration
- POS UI changes
- split bill
- customer ledger
- stock reservation
- PPOB wallet or agent credit

## Main goal

Harden Phase 3 webhook/event processing before Phase 4 or real gateway work.

Fix the reviewed issues:

1. Safe provider-event upsert/idempotency without relying on catching a unique violation inside an aborted PostgreSQL transaction.
2. Audit invalid signature attempts in `payment_provider_events` without mutating transactions.
3. Define safe behavior for existing `pending` provider events.
4. Correct misleading lock-order comments in `ApplyGatewayTransactionStatus`.
5. Update Phase 3 report to include `package.json` change and all hardening details.
6. Add focused tests.

---

## Task 1 — Safe provider event reservation/upsert

Current risk:
`HandlePaymentProviderWebhook` inserts into `payment_provider_events` inside a DB transaction and catches unique constraint errors. In PostgreSQL, after a statement error inside a transaction, the transaction is usually aborted until rollback. Querying again inside the same transaction may fail with `current transaction is aborted`.

Required:
- Do not rely on catching unique violations inside the same transaction.
- Add a safe repository method that reserves or gets provider events without aborting the transaction.

Preferred repository API:

```ts
createOrGetByProviderEventId(data, tx?): Promise<{
  event: PaymentProviderEvent;
  created: boolean;
}>;
```

Implementation requirements:
- Use `ON CONFLICT (provider, provider_event_id) DO NOTHING RETURNING *` if practical.
- If no row is returned, query the existing row safely.
- Do not throw unique violation for duplicate provider event id.
- Keep `(provider, providerEventId)` uniqueness global, not tenant-scoped.

Update `HandlePaymentProviderWebhook` to use this method.

Acceptance:
- Duplicate same event id returns idempotent replay or existing event result safely.
- No code path depends on a failed insert inside an active transaction.
- Existing provider event repository methods still work.

---

## Task 2 — Define behavior for existing pending event

Current risk:
If an event row exists with `processingStatus = pending`, retry currently attempts another insert and can hit the unique conflict path.

Required behavior:
Choose and implement a conservative policy:

Preferred for Phase 3:
- If existing event has `processed`, `ignored`, or `failed`: return `idempotent_replay`.
- If existing event has `pending`: return `ignored` or `idempotent_replay` with reason `EVENT_ALREADY_PENDING`; do not insert another row and do not mutate transaction.

Do not reprocess stale pending events in this phase unless you implement a safe stale timeout policy with tests.

Acceptance:
- Existing pending event does not cause duplicate insert.
- Existing pending event does not mutate transaction twice.
- Tests cover pending event behavior.

---

## Task 3 — Audit invalid signature attempts

Current behavior:
Invalid signature returns `invalid_signature` without storing an event.

Required:
- Store an audit row in `payment_provider_events` for invalid signature attempts.
- Do not mutate any payment transaction.
- Do not trust or fully parse the payload before signature is valid.
- Generate a safe provider event id, for example:
  - `invalid_sig_<sha256(rawBody).slice(0, 32)>`
  - optionally include timestamp if avoiding dedup is desired.

Recommended behavior:
- `provider`: route provider value
- `providerEventId`: deterministic hash-based invalid signature id
- `providerReference`: null, unless safe extraction is intentionally implemented
- `eventType`: `invalid_signature`
- `rawPayload`: parsed JSON if parseable, otherwise `{ raw: rawBody }`
- `signatureValid`: false
- `processingStatus`: `failed`
- `errorMessage`: `INVALID_SIGNATURE`
- `tenantId`: route tenant if available, otherwise null

If the same invalid signature payload repeats, it is acceptable to replay/get the existing audit event. Do not crash.

Acceptance:
- Invalid signature creates or reuses a failed audit event.
- Invalid signature does not mutate transaction.
- Repeated invalid signature does not create unlimited duplicate rows if using deterministic id.
- Tests cover invalid signature audit.

---

## Task 4 — Keep valid event processing atomic and idempotent

After introducing safe event reservation, ensure successful webhook processing remains correct:

- Store/reserve provider event before transaction mutation.
- For `succeeded`: lock tx row, lock intent row, update tx, create allocation once, recalculate intent, mark event processed.
- For `failed`: lock tx row, update tx failed, no allocation, mark event processed.
- For `pending`/`ignored`: no transaction mutation, mark event ignored.
- For already terminal transaction with a different event id: mark event ignored with `TRANSACTION_ALREADY_TERMINAL`; do not create allocation.

Acceptance tests:
- Duplicate same event id after processed returns idempotent replay.
- Different event id for already succeeded transaction is ignored and creates no allocation.
- Pending event is ignored and creates no allocation.
- Failed event does not increase amountPaid.

---

## Task 5 — Correct lock-order comments

In `ApplyGatewayTransactionStatus`, update misleading comments saying the lock order is consistent with `CreateGatewayPayment`.

Correct wording:
- Settlement flows lock `payment_transactions` before `payment_intents`.
- `CreateGatewayPayment` only creates a pending transaction and only locks the intent.
- Future settlement-like flows must follow tx-row → intent-row lock order.

Do not change behavior unless needed.

---

## Task 6 — Update report accuracy

Update or amend:

- `docs/reports/payment-engine-phase-3-webhook-engine-report.md`

It currently misses `package.json`, which changed the root `dev` script.

Required:
- Add `package.json` to files changed, or explicitly explain if that change is reverted.
- If the `package.json` change is unrelated and unnecessary, revert it.
- Add a hardening section explaining safe event reservation/upsert, invalid signature audit, pending event behavior, and known limitations.

Create a new report:

- `docs/reports/payment-engine-phase-3-hardening-report.md`

Report must include:
- summary
- files changed
- event upsert/idempotency design
- invalid signature audit behavior
- pending event behavior
- lock-order comment correction
- tests added/updated
- commands run
- known limitations
- confirmation that legacy order payment flow was not intentionally changed
- confirmation that Phase 4+ features were not implemented

---

## Task 7 — Tests

Add or update tests for:

1. Duplicate provider event id does not rely on thrown unique violation.
2. Duplicate same event id after processed returns idempotent replay.
3. Existing pending event returns safe ignored/replay behavior and does not mutate transaction.
4. Invalid signature stores failed provider event audit row.
5. Repeated invalid signature payload does not create unlimited duplicate rows if deterministic id is used.
6. Invalid signature does not mutate transaction or allocation.
7. Different event id for already succeeded tx is ignored and does not create duplicate allocation.
8. Pending provider event is ignored and does not mutate transaction.
9. Phase 1 manual payment tests still pass.
10. Phase 2 gateway tests still pass.
11. Phase 3 webhook tests still pass.

Prefer application-level tests first. Add DB-backed event idempotency test if practical, especially for `ON CONFLICT DO NOTHING` behavior.

---

## Commands to run

Run available checks:

- `npm run check`
- Phase 1 payment engine tests
- Phase 2 payment engine tests
- Phase 3 webhook tests
- DB-backed payment tests if available

If a command fails, report the exact relevant error summary.

## Commit

Commit all changes with a clear message, for example:

`fix(payment-engine): harden webhook event idempotency and audit`

Final Replit response must include:

- summary
- commit SHA
- files changed
- tests/checks run
- known issues
- confirmation that legacy order payment flow was not intentionally changed
