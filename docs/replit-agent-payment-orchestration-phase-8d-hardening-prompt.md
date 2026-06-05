# Replit Agent Prompt — Payment Orchestration Phase 8D Hardening

Use this prompt in Replit Agent.

You are working in the AuraPoS repository.

This is **Payment Orchestration Phase 8D Hardening**.

Reviewed Phase 8D commit:

```text
5b3772f7ba4cdd46b158d2fc9190cc11124a08a0
```

Read first:

- `docs/reports/payment-orchestration-phase-8d-standalone-service-usecase-wiring-report.md`
- `docs/payment-orchestration-standalone-fakegateway-smoke.md`
- `docs/payment-orchestration-hybrid-standalone-architecture.md`

## Guardrails

Do not implement future phases:

- no AuraPoS SDK consumption yet
- no embedded `/api/payment-engine` route deletion
- no POS UI changes
- no order adapter
- no split bill/customer ledger/stock reservation/PPOB
- no provider-level Xendit refund/cancel
- no Midtrans/Stripe adapter
- no scheduled cron/worker layer
- no standalone webhook ingestion yet

Do not intentionally modify legacy order payment flow:

- `/api/orders/:id/payments`
- `/api/orders/create-and-pay`
- `packages/application/orders/RecordPayment.ts`
- `packages/application/orders/CreateAndPayOrder.ts`
- `apps/api/src/http/routes/orders.ts`
- `order_payments`

Do not intentionally modify embedded payment runtime:

- `/api/payment-engine/...`
- `packages/application/payments/*`
- `packages/domain/payments/*`
- embedded FakeGateway/Xendit providers
- embedded webhook/refund/void/reconciliation

## Main goal

Harden the standalone `apps/payment-orchestration-service` FakeGateway flow so it is internally consistent, SDK-compatible, retry-safe, and ready for Phase 8E.

Required hardening:

1. Sync SDK request/response contracts with actual service responses.
2. Support merchant id fallback from `x-payment-merchant-id` header.
3. Preserve `providerAccountRef` in core DTO, mapper, API response, and SDK response.
4. Validate `providerAccountId` in `CreateGatewayPayment`.
5. Implement idempotency for `CreateGatewayPayment`.
6. Make `ConfirmFakeGatewayPayment` conditional/atomic enough to prevent double counting.
7. Re-check overpayment at confirmation time.
8. Add HTTP/auth tests.
9. Fix webhook placeholder wording.
10. Update smoke docs and create hardening report.

---

## Task 1 — Sync SDK and service response contracts

Current mismatch:

- Service `createGatewayPayment` returns `{ transaction, intent }`, but SDK expects flat fields.
- Service `getPaymentIntentStatus` returns `{ intent, latestTransaction, isTerminal, requiresAction, canRetryPayment }`, but SDK expects flat fields.
- Service `getRefundability` returns `{ intentId, merchantId, totalRefundable, currency, transactions }`, but SDK expects `{ canRefund, refundableAmount, reason }`.

Required:

Update SDK types to match service. Prefer rich service response shape.

Add/reuse SDK response types:

```ts
PaymentIntentResponse
PaymentTransactionResponse
GatewayPaymentResponse = { transaction; intent; idempotentReplay?: boolean }
PaymentIntentStatusResponse = { intent; latestTransaction; isTerminal; requiresAction; canRetryPayment }
RefundabilityResponse = { intentId; merchantId; totalRefundable; currency; transactions }
RefundableTransactionResponse
```

Update SDK docs/comments accordingly.

---

## Task 2 — Merchant id fallback from header and SDK config

Service should resolve merchant id from:

```text
1. body.merchantId or query.merchantId
2. x-payment-merchant-id header
3. validation error
```

Add a service route helper, for example:

```ts
resolveMerchantId(req, source?: 'body' | 'query'): string | null
```

Update relevant routes:

- `POST /v1/payment-intents`
- `POST /v1/payment-intents/:id/gateway-payments`
- `GET /v1/payment-intents/:id/status`
- `GET /v1/payment-intents/:id/refundability`
- `POST /v1/dev/fake-gateway/transactions/:transactionId/confirm`

Update SDK:

- If constructor has `merchantId`, inject it into create intent/gateway payment/confirm bodies when missing.
- For status/refundability, append `?merchantId=...` from config unless explicit option provided.
- Add overload/options:

```ts
getPaymentIntentStatus(intentId, options?: { merchantId?: string })
getRefundability(intentId, options?: { merchantId?: string })
confirmFakeGatewayPayment(transactionId, input?: { merchantId?: string })
```

---

## Task 3 — Preserve providerAccountRef and hide credential refs from public API

Current issue: `providerAccountRef` is persisted but lost in DTO/API response.

Required:

- Add `providerAccountRef?: string | null` to core `PaymentProviderAccount`.
- Update `mapProviderAccountRow()`.
- Update service provider account responses to return `providerAccountRef` from DTO.
- Update SDK `ProviderAccountResponse`.
- Public API responses must not include `credentialsRef`.

Acceptance:

- Create provider account with `providerAccountRef` returns it.
- Get provider account returns it.
- No public response exposes `credentialsRef`.

---

## Task 4 — Validate provider account in CreateGatewayPayment

Current issue: `providerAccountId` is accepted but not validated.

Required:

- Inject `PaymentProviderAccountRepository` into `CreateGatewayPayment`.
- If `providerAccountId` is provided, verify:
  - exists;
  - belongs to merchant;
  - status is `active`;
  - provider matches input.provider.
- If missing:
  - `fake_gateway` may run without provider account in non-production as dev convenience.
  - any non-fake provider must require a valid provider account.

Add tests for wrong merchant, disabled account, provider mismatch, and fake_gateway dev convenience.

---

## Task 5 — Implement CreateGatewayPayment idempotency

Current issue: `idempotencyKey` exists but does not prevent duplicate provider calls.

Required:

- Inject `PaymentIdempotencyRepository` into `CreateGatewayPayment`.
- Use scope: `create_gateway_payment`.
- Compute stable request hash from merchantId, intentId, provider, method, amount, providerAccountId, and canonical metadata.
- If existing completed key with same hash, return same transaction/intent and `idempotentReplay: true`.
- If same key with different hash, throw `IDEMPOTENCY_CONFLICT` 409.
- If key exists with processing status, throw `IDEMPOTENCY_IN_PROGRESS` 409.
- If absent, reserve before provider call, mark completed after transaction creation, mark failed on safe failure.
- Tests must prove provider is not called twice on replay.

---

## Task 6 — Harden FakeGateway confirmation

Current issue: confirm is read-then-write and can double-add under retry/race.

Required:

- Add conditional transaction status update, e.g. update only when status in `requires_action` or `pending`.
- If no row changed, reload transaction:
  - if `succeeded`, return `alreadyConfirmed: true`;
  - otherwise reject invalid status.
- Update intent totals only when the transaction changed to succeeded in this call.
- Prefer DB transaction if practical; otherwise document conditional-update limitation.

Also re-check overpayment at confirmation time:

- Reload latest intent before adding payment.
- If transaction.amount > current amountRemaining, reject with `OVERPAYMENT_REJECTED`.
- Add test: two pending payments cannot both confirm into overpaid state.

---

## Task 7 — Add HTTP/auth tests

Current Phase 8D tests use in-memory use cases only. Add HTTP tests using `createApp()` and fake/in-memory container if DB is too heavy.

Test file suggestion:

```text
apps/api/src/__tests__/payment-orchestration-service-http-auth.test.ts
```

Required coverage:

1. `GET /health` succeeds without token.
2. `GET /version` succeeds without token.
3. `POST /v1/merchants` without token returns 401.
4. Wrong token returns 401.
5. Correct primary header succeeds.
6. Compat header `x-payment-engine-service-token` succeeds.
7. `x-payment-merchant-id` fallback works for create intent, status, refundability, and fake confirm.
8. Provider account response includes `providerAccountRef` and excludes `credentialsRef`.
9. Public responses do not include `tenantId`.

Also update existing fakegateway flow tests for:

- gateway idempotency replay;
- idempotency conflict;
- provider call count;
- provider account validation;
- confirm overpayment protection.

---

## Task 8 — Fix webhook placeholder wording

Update `apps/payment-orchestration-service/src/routes/webhooks.ts`:

- Phase 8D is placeholder only.
- Phase 8E will implement webhook ingestion.
- Response should not say use embedded route until Phase 8D; say standalone webhook is planned for Phase 8E.
- Keep status 501.
- Do not implement webhook ingestion.

---

## Task 9 — Docs and report

Create:

```text
docs/reports/payment-orchestration-phase-8d-hardening-report.md
```

Report must include:

- summary;
- files changed;
- SDK/service contract sync;
- merchantId header fallback;
- providerAccountRef preservation;
- provider account validation;
- gateway idempotency behavior;
- confirm conditional/atomic behavior;
- overpayment-at-confirm policy;
- HTTP/auth tests;
- commands run with pass/fail/not-run;
- known limitations;
- explicit confirmation that no AuraPoS SDK consumption was implemented;
- explicit confirmation that embedded `/api/payment-engine/...` was not intentionally changed;
- explicit confirmation that legacy order payment was not intentionally changed;
- explicit confirmation that Xendit behavior was not changed;
- explicit confirmation that provider-level refund/cancel and webhook ingestion were not implemented.

Update:

```text
docs/payment-orchestration-standalone-fakegateway-smoke.md
```

Ensure curl examples:

- include service token header;
- optionally show `x-payment-merchant-id` header;
- match actual response shapes;
- warn FakeGateway confirm is dev/test only.

---

## Commands to run

Run:

```bash
npm run check
pnpm --filter @northflow/payment-orchestration-core type-check
pnpm --filter @northflow/payment-orchestration-service type-check
pnpm --filter @northflow/payment-orchestration-client-sdk type-check
```

Run tests:

```bash
npx tsx --tsconfig apps/api/tsconfig.node.json --test apps/api/src/__tests__/payment-orchestration-service-http-auth.test.ts
npx tsx --tsconfig apps/api/tsconfig.node.json --test apps/api/src/__tests__/payment-orchestration-service-fakegateway-flow.test.ts
npx tsx --tsconfig apps/api/tsconfig.node.json --test apps/api/src/__tests__/payment-orchestration-schema-mappers.test.ts
npx tsx --tsconfig apps/api/tsconfig.node.json --test apps/api/src/__tests__/payment-orchestration-core-contract-adapter.test.ts
npx tsx --tsconfig apps/api/tsconfig.node.json --test apps/api/src/__tests__/payment-xendit-gateway-integration.test.ts
```

Do not run live Xendit tests unless configured. Do not fake success; report exact failures.

---

## Acceptance criteria

1. SDK response types match service response shapes.
2. SDK can use constructor `merchantId` for merchant-scoped routes.
3. Service supports `x-payment-merchant-id` fallback.
4. Provider account DTO/API preserves `providerAccountRef`.
5. API responses do not expose `credentialsRef`.
6. `CreateGatewayPayment` validates provider account ownership/status/provider.
7. `CreateGatewayPayment` idempotency prevents duplicate provider calls.
8. `ConfirmFakeGatewayPayment` cannot double-add payments on retry/race.
9. Confirmation re-checks overpayment against latest intent state.
10. HTTP/auth tests cover token and merchant header fallback.
11. Existing use-case and Xendit tests still pass.
12. Webhook placeholder wording corrected; no webhook ingestion implemented.
13. No embedded payment engine route changed intentionally.
14. No legacy order payment flow changed intentionally.
15. Report and smoke docs updated.

---

## Commit

Commit with a clear message, for example:

```text
fix(payment-orchestration): harden standalone fakegateway flow
```

Final Replit response must include summary, commit SHA, files changed, tests/checks run, known issues, and confirmations that no embedded payment route, legacy order payment, AuraPoS SDK consumption, webhook ingestion, or provider-level refund/cancel was implemented.
