# Replit Agent Prompt — Payment Engine Phase 6.5 FakeGateway E2E Smoke & Dev Testing

Use this prompt in Replit Agent.

You are working in the AuraPoS repository.

This is **Payment Engine Phase 6.5: FakeGateway E2E Smoke & Dev Testing**.

Important:

- This is NOT the Xendit/Midtrans sandbox phase yet.
- FakeGateway is NOT a Midtrans/Xendit emulator.
- FakeGateway is the local golden contract provider used to prove the Payment Engine lifecycle end-to-end before adding any real provider.

Read first:

- `docs/payment-engine-roadmap.md`
- `docs/reports/payment-engine-phase-6-provider-contract-report.md`
- `docs/reports/payment-engine-phase-6-hardening-report.md`
- `docs/replit-agent-payment-engine-phase-6-provider-contract-prompt.md`
- `docs/replit-agent-payment-engine-phase-6-hardening-prompt.md`

Current accepted base:

- `51980ed3b49fc126abc681f972642ca4a408f6f6`

## Guardrails

Do not intentionally change legacy order payment behavior:

- `/api/orders/:id/payments`
- `/api/orders/create-and-pay`
- `packages/application/orders/RecordPayment.ts`
- `packages/application/orders/CreateAndPayOrder.ts`
- `apps/api/src/http/routes/orders.ts`
- `order_payments` legacy table behavior

Do not implement future phases:

- no real Xendit adapter
- no real Midtrans adapter
- no real Stripe adapter
- no real provider API call
- no real provider credentials
- no real provider webhook signature implementation except FakeGateway
- no order adapter
- no POS UI changes
- no split bill
- no customer ledger
- no stock reservation
- no PPOB wallet or credit
- no standalone extraction

## Main goal

Create a reliable FakeGateway end-to-end smoke testing layer so we can manually and automatically prove the Payment Engine lifecycle before implementing a real provider sandbox adapter.

This phase should produce:

1. A clear developer smoke-test document.
2. A runnable smoke-test script if practical.
3. Integration tests or route-level tests covering FakeGateway scenarios.
4. Confirmation that all FakeGateway scenarios work through actual Payment Engine API/use cases.
5. A report.

---

## Task 1 — Create FakeGateway E2E smoke documentation

Create:

- `docs/payment-engine-fakegateway-e2e-smoke.md`

The document must explain:

- What FakeGateway is.
- What FakeGateway is not.
- FakeGateway is not a Midtrans/Xendit emulator.
- FakeGateway is the golden contract provider for local/dev/test flows.
- Required environment variables.
- Required tenant context header.
- Required non-production service token header if using the dev service token path.
- All endpoints used.
- Exact curl examples.
- Expected responses and state transitions.

Include curl flows for:

1. Create payment intent.
2. Create FakeGateway payment with `default` scenario.
3. Create FakeGateway payment with `redirect` scenario.
4. Create FakeGateway payment with `qris` scenario.
5. Create FakeGateway payment with `va` scenario.
6. Create FakeGateway payment with `payment_code` scenario.
7. Create FakeGateway payment with `immediate_success` scenario.
8. Create FakeGateway payment with `immediate_failure` scenario.
9. Create FakeGateway payment with `pending_expiry` scenario.
10. Confirm FakeGateway transaction as `succeeded` via `/fake-gateway/confirm`.
11. Confirm FakeGateway transaction as `failed` via `/fake-gateway/confirm`.
12. List transactions for an intent.
13. Refund a succeeded transaction.
14. Void a pending/requires_action transaction.
15. Run reconciliation dry-run endpoints.

Use placeholders like:

```bash
BASE_URL="http://localhost:5000"
TENANT_ID="dev-tenant"
PAYMENT_ENGINE_SERVICE_TOKEN="replace-with-local-token"
```

Headers:

```bash
-H "content-type: application/json"
-H "x-tenant-id: $TENANT_ID"
-H "x-payment-engine-service-token: $PAYMENT_ENGINE_SERVICE_TOKEN"
```

Do not include real secrets.

---

## Task 2 — Add a local smoke test script if practical

Create a script such as:

- `apps/api/src/scripts/payment-engine/fakegateway-smoke.ts`

or another existing scripts folder if the repo has a better convention.

The script should:

- call the running API over HTTP, OR call use cases directly if HTTP bootstrapping is too heavy;
- be non-production only;
- require explicit env flag such as `PAYMENT_ENGINE_SMOKE_TEST=true`;
- require `PAYMENT_ENGINE_SERVICE_TOKEN` if using HTTP route testing;
- create unique idempotency keys using timestamp/random suffix;
- create one intent per scenario or a controlled set of test intents;
- run the main scenarios:
  - default + fake confirm succeeded;
  - qris + fake confirm succeeded;
  - va requires_action;
  - payment_code requires_action;
  - redirect requires_action;
  - immediate_success;
  - immediate_failure;
  - pending_expiry;
  - void pending/requires_action;
  - refund succeeded transaction;
  - reconciliation dry-run;
- print a concise summary table;
- exit non-zero if any assertion fails.

If the project does not have a good script runner setup, document the script command but do not overbuild.

Do not run against production.

---

## Task 3 — Add route-level or integration tests for FakeGateway E2E

Add tests if practical, for example:

- `apps/api/src/__tests__/payment-engine-fakegateway-e2e.test.ts`

Tests should verify:

1. Create intent → create `qris` FakeGateway payment returns `requires_action` with `providerActions[0].descriptor = QR_STRING`.
2. Create intent → create `redirect` FakeGateway payment returns `WEB_URL` action.
3. Create intent → create `va` FakeGateway payment returns `VA_NUMBER` action.
4. Create intent → create `payment_code` FakeGateway payment returns `PAYMENT_CODE` action.
5. Default scenario remains backward-compatible: transaction `pending`, `providerPaymentUrl` and `providerQrString` set, `providerActions` empty.
6. Fake confirm `succeeded` changes transaction to succeeded and intent to paid when full amount is covered.
7. Fake confirm `failed` changes transaction to failed and does not increase amountPaid.
8. `immediate_success` creates succeeded transaction, creates allocation, and marks intent paid.
9. `immediate_failure` creates failed transaction and does not create allocation.
10. `pending_expiry` returns `expiresAt` and `requires_action`.
11. Void endpoint can void pending/requires_action FakeGateway transaction.
12. Refund endpoint can refund succeeded FakeGateway transaction.
13. Reconciliation dry-run endpoints return success and mutate nothing.
14. Production guard for `/fake-gateway/confirm` still returns 404 when `NODE_ENV=production` if tested safely.

Prefer use-case/in-memory tests if route bootstrapping is difficult. If route-level testing is too much, document why and add use-case E2E tests.

---

## Task 4 — Add npm script if practical

If the repo has scripts convention, add a script such as:

```json
"payment:fakegateway:smoke": "tsx apps/api/src/scripts/payment-engine/fakegateway-smoke.ts"
```

Only add if it fits the existing project setup.

Do not break existing scripts.

---

## Task 5 — Clean minor Phase 6 documentation issue

In `apps/api/src/container.ts`, update stale comments that still imply `CreateGatewayPayment` uses `ApplyGatewayTransactionStatus` for immediate success.

Correct comment:

- `ApplyGatewayTransactionStatus` is used by `ConfirmFakeGatewayPayment` and `HandlePaymentProviderWebhook`.
- `CreateGatewayPayment` immediate-success path uses direct settlement via `PaymentAllocationRepository` + `RecalculatePaymentIntent` to avoid reversed lock ordering.

Do not change behavior unless required by tests.

---

## Task 6 — Report

Create:

- `docs/reports/payment-engine-phase-6-5-fakegateway-e2e-report.md`

Report must include:

- summary;
- files changed;
- what FakeGateway is and is not;
- smoke documentation added;
- script added or reason not added;
- tests added/updated;
- endpoint flows covered;
- commands run;
- known limitations;
- explicit confirmation that FakeGateway is not a Midtrans/Xendit emulator;
- explicit confirmation that no real provider adapter/API/credential was implemented;
- explicit confirmation that legacy order payment flow was not intentionally changed;
- explicit confirmation that future phases were not implemented.

---

## Commands to run

Run available checks:

- `npm run check`
- provider contract tests
- Phase 1-6 payment engine regression tests if practical
- new FakeGateway E2E tests
- TypeScript check

If any command fails, report exact relevant error summary.

## Commit

Commit with a clear message, for example:

`test(payment-engine): add fake gateway e2e smoke coverage`

Final Replit response must include summary, commit SHA, files changed, tests/checks run, known issues, and confirmation that legacy order payment flow was not intentionally changed.
