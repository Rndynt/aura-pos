# Replit Agent Prompt — Payment Engine Phase 3 Webhook/Event Engine

Use this prompt in Replit Agent.

You are working in the AuraPoS repository.

This is **Payment Engine Phase 3: Webhook/Event Handling Engine**.

Read first:

- `docs/payment-engine-roadmap.md`
- `docs/reports/payment-engine-phase-1-report.md`
- `docs/reports/payment-engine-phase-1-hardening-report.md`
- `docs/reports/payment-engine-phase-1-5-hardening-report.md`
- `docs/reports/payment-engine-phase-1-5-followup-report.md`
- `docs/reports/payment-engine-phase-2-gateway-abstraction-report.md`
- `docs/reports/payment-engine-phase-2-hardening-report.md`

Current accepted base:

- `7ed01d9a3ef59b68675301b953993916e1ace287`

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
- real provider credentials
- order adapter integration
- POS UI changes
- split bill
- customer ledger
- stock reservation
- PPOB wallet or agent credit
- refund/void flow

## Main goal

Build a generic webhook/event processing foundation for payment providers, without connecting real gateways yet.

Phase 3 must support:

1. Generic `/api/payment-engine/webhooks/:provider` route.
2. Provider lookup through `PaymentProviderRegistry`.
3. Provider signature verification seam.
4. Provider webhook parsing seam.
5. Persistent `payment_provider_events` storage before processing.
6. Idempotent event processing using `provider + provider_event_id` uniqueness.
7. Pending gateway transaction update from webhook events.
8. Atomic succeeded/failed transition with allocation/recalculation.
9. FakeGatewayProvider webhook simulation for tests only.
10. Tests and implementation report.

---

## Task 1 — Extend Provider Interface Support if Needed

Review `packages/domain/payments/provider.ts`.

The existing `PaymentProvider` interface already has:

- `verifyWebhook(input)`
- `parseWebhook(input)`

Ensure these are sufficient for generic webhook handling.

The parsed webhook result should be able to express at least:

- `provider`
- `providerEventId`
- `providerReference`
- `eventType`
- `transactionStatus`: `succeeded | failed | pending | ignored`
- `failureReason?`
- `metadata?`
- raw payload should remain available in event storage

If current types are too weak, extend them carefully without breaking existing code.

Do not add real Midtrans/Xendit/Stripe-specific fields yet.

---

## Task 2 — Implement FakeGatewayProvider webhook behavior

FakeGatewayProvider currently returns false/unsupported for webhook methods. For Phase 3, add fake webhook support for tests/dev only.

Suggested behavior:

- `verifyWebhook(input)` returns true only when fake signature is valid.
- Suggested env var: `FAKE_GATEWAY_WEBHOOK_SECRET`.
- Suggested header: `x-fake-gateway-signature`.
- Simple deterministic signature is acceptable for fake provider, for example HMAC SHA256 of raw JSON body using the fake secret.
- If no secret configured in non-production tests, allow a safe deterministic default only in `NODE_ENV !== 'production'` and document it.
- In production, fake gateway webhook should not be usable unless explicitly documented as disabled.

`parseWebhook(input)` should parse payload shape like:

```json
{
  "event_id": "evt_fake_123",
  "event_type": "payment.succeeded",
  "provider_reference": "fake_xxx",
  "status": "succeeded",
  "failure_reason": null,
  "metadata": {}
}
```

Supported fake statuses:

- `succeeded`
- `failed`
- `pending`

Rules:

- `payment.succeeded` maps to transaction status `succeeded`.
- `payment.failed` maps to transaction status `failed`.
- `payment.pending` maps to `ignored` or `pending` with no state mutation.
- Unknown event types should parse as `ignored` or throw a clear `UNSUPPORTED_WEBHOOK_EVENT` policy error. Choose one and document it.

---

## Task 3 — Repository methods for provider events

Review `PaymentProviderEventRepository`.

It must support:

- `create(data, tx?)`
- `findByProviderEventId(provider, providerEventId, tx?)`
- `markProcessed(id, data, tx?)`
- `markFailed(id, errorMessage, tx?)`
- optional `markIgnored(id, reason, tx?)`

All methods must be tenant-safe when tenantId is known, but note that some raw provider events may not know tenant until providerReference is resolved. The event table has nullable tenantId, so repository design must handle both:

- provider event uniqueness is global by `(provider, provider_event_id)`
- transaction resolution must enforce tenant once tenant is known

Do not remove existing provider event table.

---

## Task 4 — Implement HandlePaymentProviderWebhook use case

Create:

- `packages/application/payments/HandlePaymentProviderWebhook.ts`

Input:

- `provider`
- `headers`
- `rawBody` or `body`
- optional `tenantId` from route context, if available

Important:
Express JSON middleware may already parse the body. Use the current app structure. If raw body is not available yet, implement using parsed body for fake provider and document that real providers may require raw body capture in Phase 3 hardening.

Rules:

1. Lookup provider via `PaymentProviderRegistry`.
2. Verify signature via provider.
3. If signature invalid:
   - store provider event if event id can be parsed safely, or store a failed event with generated id if not practical.
   - return a clear invalid signature result.
   - do not mutate transaction.
4. Parse webhook via provider.
5. Check idempotency by `(provider, providerEventId)`.
   - If event already processed, return idempotent replay result.
   - Do not mutate transaction twice.
6. Store raw provider event before mutating transaction.
7. Resolve transaction by `(provider, providerReference)`.
8. Determine tenant from transaction. If route tenantId exists, it must match transaction tenantId.
9. Process transaction status atomically:
   - For `succeeded`: lock transaction row, lock intent row, update tx to succeeded if still pending/requires_action, create allocation exactly once, recalculate intent, mark event processed.
   - For `failed`: lock transaction row, update tx to failed if pending/requires_action, do not create allocation, mark event processed.
   - For `pending`/`ignored`: do not mutate transaction; mark event ignored/processed according to chosen design.
10. Invalid transition handling:
   - Duplicate succeeded event after tx already succeeded should be idempotent if same provider event id, or ignored/invalid-transition if different event id for already succeeded tx. Choose conservative behavior and document it.

Preferred behavior:
- Same event id repeated -> idempotent replay.
- Different event id for already succeeded tx -> mark event ignored with reason `TRANSACTION_ALREADY_TERMINAL`; do not create allocation.

---

## Task 5 — API endpoint

Add generic endpoint:

```text
POST /api/payment-engine/webhooks/:provider
```

Rules:

- Do not protect this endpoint with cashier/session auth. Real provider callbacks cannot login.
- It must be protected by provider signature verification instead.
- It must not use `requirePaymentOperator`.
- It should still pass through route-level production safety where needed.
- For Phase 3 fake provider, if `provider = fake_gateway`, allow only in non-production unless explicit test env says otherwise.
- Return provider-friendly response shape:
  - 200 for processed/idempotent ignored success
  - 400 for invalid payload
  - 401 or 403 for invalid signature
  - 404 for unknown provider or provider disabled if you choose
  - 422 for unsupported event type / policy error

Important route ordering:
- `/webhooks/:provider` must be registered before global `requirePaymentOperator`, same as `/fake-gateway/confirm` production guard logic.
- Other payment-engine routes remain protected by `requirePaymentOperator`.

---

## Task 6 — Reuse confirmation logic safely

Avoid duplicating too much transition logic between:

- `ConfirmFakeGatewayPayment`
- `HandlePaymentProviderWebhook`

Options:

A. Extract a private/shared application helper:
- `SettleGatewayTransaction` or `ApplyGatewayTransactionStatus`

B. Keep separate but ensure both use:
- `lockByProviderReferenceForUpdate`
- allocation uniqueness
- same intent recalculation rules

Preferred:
Create a reusable application use case/helper:

- `ApplyGatewayTransactionStatus.ts`

Responsibilities:

- lock tx row by provider reference
- validate provider
- handle terminal state safely
- lock intent row
- update transaction to succeeded/failed
- create allocation only for succeeded
- recalculate intent only when needed

Then both fake confirm and webhook handler can use it.

If this refactor becomes too risky, keep implementation local but document duplication and add tests.

---

## Task 7 — Tests

Add tests for:

1. Fake webhook valid signature + payment.succeeded updates pending tx to succeeded.
2. Webhook success creates exactly one allocation.
3. Webhook success recalculates intent to paid when amount covers remaining.
4. Fake webhook valid signature + payment.failed marks tx failed and does not increase amountPaid.
5. Duplicate same provider event id returns idempotent replay and does not mutate twice.
6. Different event id for already succeeded tx does not create duplicate allocation.
7. Invalid signature does not mutate transaction.
8. Unknown provider returns clear error.
9. Unsupported event type behavior matches your chosen design.
10. Route `/webhooks/:provider` bypasses cashier/session auth but requires valid signature.
11. Route ordering does not expose normal payment endpoints without auth.
12. Existing Phase 1 manual payment tests still pass.
13. Existing Phase 2 gateway tests still pass.
14. DB-backed tests if practical for duplicate webhook event processing.

Use fake provider tests first. Do not add real gateway API calls.

---

## Task 8 — Report

Create:

- `docs/reports/payment-engine-phase-3-webhook-engine-report.md`

Report must include:

- summary
- files changed
- provider webhook interface behavior
- FakeGatewayProvider webhook behavior
- provider event repository behavior
- HandlePaymentProviderWebhook behavior
- API endpoint added
- idempotency behavior
- signature verification behavior
- route ordering and security notes
- tests added/updated
- commands run
- known limitations
- raw body limitation if applicable
- confirmation that legacy order payment flow was not intentionally changed
- confirmation that real gateways/order adapter/UI/split bill/ledger/stock/PPOB/refund/void were not implemented

## Commands to run

Run available checks:

- `npm run check`
- Phase 1 payment engine tests
- Phase 2 payment engine tests
- Phase 3 webhook tests
- DB-backed payment tests if available

If a command fails, report exact relevant error summary.

## Commit

Commit all changes with a clear message, for example:

`feat(payment-engine): add generic webhook event processing`

Final Replit response must include:

- summary
- commit SHA
- files changed
- tests/checks run
- known issues
- confirmation that legacy order payment flow was not intentionally changed
