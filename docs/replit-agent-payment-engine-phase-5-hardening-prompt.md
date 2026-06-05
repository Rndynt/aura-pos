# Replit Agent Prompt — Payment Engine Phase 5 Hardening

Use this prompt in Replit Agent.

You are working in the AuraPoS repository.

This is **Payment Engine Phase 5 Hardening**. Do not implement Phase 6 real provider adapters yet.

Read first:

- `docs/payment-engine-roadmap.md`
- `docs/reports/payment-engine-phase-5-reconciliation-report.md`
- `docs/replit-agent-payment-engine-phase-5-reconciliation-prompt.md`

Reviewed Phase 5 commit:

- `0470d892847cd5650fc12994032c33d58bff66d4`

## Guardrails

Do not intentionally change legacy order payment behavior:

- `/api/orders/:id/payments`
- `/api/orders/create-and-pay`
- `packages/application/orders/RecordPayment.ts`
- `packages/application/orders/CreateAndPayOrder.ts`
- `apps/api/src/http/routes/orders.ts`
- `order_payments` legacy table behavior

Do not implement future phases:

- no real Midtrans/Xendit/Stripe adapter
- no real provider credentials
- no real provider refund/cancel API
- no order adapter
- no POS UI changes
- no split bill
- no customer ledger
- no stock reservation
- no PPOB wallet or credit
- no standalone extraction

## Main goal

Fix the required Phase 5 hardening issues before moving to Phase 6.

Required fixes:

1. `ReprocessStaleProviderEvents` must be tenant-scoped for tenant-manager calls.
2. Invalid-signature stale events must be finalized as ignored/failed during actual run.
3. Unsupported-provider stale events must be finalized as failed during actual run.
4. Actual reprocess must lock/claim the provider event row before mutating anything.
5. Phase 5 report must explicitly confirm legacy order payment was not intentionally changed and future phases were not implemented.

---

## Task 1 — Tenant-scope stale provider event reprocessing

Current problem:
`ReprocessStaleProviderEvents` lists stale pending provider events without tenant filtering. The HTTP route is tenant-scoped, but the use case can process events for all tenants.

Required behavior:

- Add optional `tenantId` to `ReprocessStaleProviderEventsInput`.
- Add optional `tenantId` filter to `PaymentProviderEventRepository.listStalePendingEvents`.
- Controller must pass `req.tenantId` to the use case.
- Tenant manager requests must only reprocess events where `payment_provider_events.tenantId = req.tenantId`.
- Events with `tenantId = null` must not be processed by tenant-manager endpoint. They should require a future superadmin/global job.

Acceptance tests:

- Tenant A reconciliation does not select tenant B events.
- Tenant A reconciliation does not select null-tenant events.
- Provider filter still works together with tenant filter.
- Existing dry-run behavior still works.

---

## Task 2 — Lock or claim event row before actual reprocess

Current problem:
The use case processes stale events based on an initial list snapshot. If two reconciliation jobs run at the same time, both can process the same pending event.

Required behavior:

- Add repository method such as:
  - `lockByIdForUpdate(id, tx)`
- In actual run only, open a DB transaction and lock the provider event row before processing.
- Re-check `processingStatus` under the lock.
- If it is no longer `pending`, return a safe skipped/idempotent result and do not mutate transaction.
- Keep dry-run read-only and no locks required.

Acceptance tests:

- If event becomes processed before lock/re-check, reprocess skips it.
- Actual processing uses locked event row, not stale snapshot.
- Per-event failure isolation remains intact.

---

## Task 3 — Finalize invalid-signature stale events

Current problem:
For `signatureValid=false`, actual reprocess returns `skipped_invalid_sig` but leaves the event pending forever.

Required behavior:

- In actual run, mark invalid-signature event as `ignored` or `failed` with reason `REPROCESS_INVALID_SIGNATURE`.
- Prefer `ignored` because it should not be retried as money movement.
- Do not call provider parser.
- Do not call `ApplyGatewayTransactionStatus`.
- Do not mutate transaction or allocation.

Acceptance tests:

- Invalid-signature event becomes ignored/failed after actual run.
- Invalid-signature event does not mutate transaction.
- Dry-run still does not mutate event status.

---

## Task 4 — Finalize unsupported-provider stale events

Current problem:
Unsupported provider returns `unsupported_provider` but leaves the event pending forever.

Required behavior:

- In actual run, mark unsupported provider event as `failed` with reason `UNSUPPORTED_PROVIDER`.
- Do not abort the batch.
- Do not mutate transaction.

Acceptance tests:

- Unsupported provider event becomes failed after actual run.
- Batch continues after unsupported provider.

---

## Task 5 — Keep valid reprocess behavior safe

After adding tenant scope and event locking, keep valid event behavior correct:

- succeeded stale event can settle pending transaction;
- failed stale event can mark transaction failed;
- already-terminal transaction event is marked ignored;
- not-found transaction event is marked failed;
- ignored/pending event types are marked ignored;
- invalid signatures never mutate money;
- dry-run mutates nothing.

Add or update tests for these regressions.

---

## Task 6 — Report update

Update:

- `docs/reports/payment-engine-phase-5-reconciliation-report.md`

And create:

- `docs/reports/payment-engine-phase-5-hardening-report.md`

The hardening report must include:

- summary;
- files changed;
- tenant-scoped event recovery design;
- event row locking/claim behavior;
- invalid-signature finalization behavior;
- unsupported-provider finalization behavior;
- tests added/updated;
- commands run;
- known limitations;
- explicit confirmation that legacy order payment flow was not intentionally changed;
- explicit confirmation that Phase 6+ features were not implemented.

Also add the missing audit confirmation to the original Phase 5 report or mention the correction in the hardening report.

## Commands to run

Run available checks:

- `npm run check`
- Phase 5 tests
- Phase 1–4 regression tests if practical

If any command fails, report exact relevant error summary.

## Commit

Commit with a clear message, for example:

`fix(payment-engine): harden reconciliation tenant scope and event claiming`

Final Replit response must include summary, commit SHA, files changed, tests/checks run, known issues, and confirmation that legacy order payment flow was not intentionally changed.
