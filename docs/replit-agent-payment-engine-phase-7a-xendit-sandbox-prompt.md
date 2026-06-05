# Replit Agent Prompt — Payment Engine Phase 7A Xendit Sandbox Adapter

Use this prompt in Replit Agent.

You are working in the AuraPoS repository.

This is **Payment Engine Phase 7A: First Real Provider Sandbox Adapter — Xendit**.

Important:

- This is the first real provider adapter phase.
- This phase is **sandbox/test-mode only**.
- Do not implement production Xendit credentials or production enablement.
- Do not implement Midtrans or Stripe.
- Do not implement provider-level refund integration yet.
- Do not implement scheduled cron/job layer yet.
- Do not implement POS UI/order adapter yet.

Current accepted base:

- `50558d2d6325512a9973e5741a4bff4b6203f868`

Read first:

- `docs/payment-engine-roadmap.md`
- `docs/payment-engine-fakegateway-e2e-smoke.md`
- `docs/reports/payment-engine-phase-6-provider-contract-report.md`
- `docs/reports/payment-engine-phase-6-hardening-report.md`
- `docs/reports/payment-engine-phase-6-5-fakegateway-e2e-report.md`
- `docs/reports/payment-engine-phase-6-5-hardening-report.md`
- `docs/reports/payment-engine-phase-6-6-dev-ux-smoke-report.md`

Reference Xendit docs while implementing:

- Payments API overview / `v3/payment_requests`
- One-off payment flow using `type=PAY`
- Response `actions[]`, `status=REQUIRES_ACTION`, `payment_request_id`
- Webhook events: `payment.capture`, `payment.failure`, `payment_request.expiry`
- Authentication: Basic Auth with secret key as username and empty password

## Guardrails

Do not intentionally change legacy order payment behavior:

- `/api/orders/:id/payments`
- `/api/orders/create-and-pay`
- `packages/application/orders/RecordPayment.ts`
- `packages/application/orders/CreateAndPayOrder.ts`
- `apps/api/src/http/routes/orders.ts`
- `order_payments` legacy table behavior

Do not implement future phases:

- no Midtrans adapter
- no Stripe adapter
- no production Xendit enablement
- no provider-level refund/cancel API integration
- no scheduled cron/worker layer
- no external provider polling endpoint
- no POS UI changes
- no order adapter
- no split bill
- no customer ledger
- no stock reservation
- no PPOB wallet or credit
- no standalone extraction
- no platform-managed settlement/payout

## Main goal

Implement a minimal but real Xendit sandbox adapter that maps Xendit Payments API behavior into the existing generic Payment Engine provider contract.

The adapter must support:

1. Creating a Xendit sandbox payment request.
2. Mapping Xendit response statuses into internal provider result statuses.
3. Mapping Xendit actions into `ProviderAction` with descriptors.
4. Verifying Xendit webhook using sandbox webhook token/config.
5. Parsing Xendit payment webhooks into `ParsedProviderWebhook`.
6. Registering the provider only when sandbox env is enabled and configured.
7. Tests with mocked fetch only — no real network calls in automated tests.
8. Docs and report.

---

## Task 1 — Add Xendit provider config

Create infrastructure config for Xendit sandbox, for example:

- `packages/infrastructure/payments/providers/XenditProvider.ts`
- Optional helper/config file if needed.

Environment variables:

```bash
XENDIT_SANDBOX_ENABLED=false
XENDIT_SECRET_KEY_SANDBOX=""
XENDIT_WEBHOOK_TOKEN_SANDBOX=""
XENDIT_API_BASE_URL="https://api.xendit.co"
XENDIT_PAYMENT_SUCCESS_RETURN_URL="http://localhost:5000/payment/success"
XENDIT_PAYMENT_FAILURE_RETURN_URL="http://localhost:5000/payment/failure"
```

Rules:

- Default disabled.
- Provider must not register unless `XENDIT_SANDBOX_ENABLED=true` and a sandbox secret key is present.
- Never commit real secret key/token.
- Do not store raw secrets in DB/domain objects.
- Secrets are read from environment in infrastructure only.
- Do not log secrets.
- If config is missing and provider is requested, return `UNSUPPORTED_PROVIDER` or a clear config error without leaking secrets.

---

## Task 2 — Implement `XenditProvider.createPayment()`

Implement `PaymentProvider` contract.

Provider code:

```ts
providerCode = 'xendit_sandbox'
```

Capabilities should reflect Phase 7A scope:

```ts
{
  supportsRedirect: true,
  supportsQr: true,
  supportsVa: true,
  supportsPaymentCode: false, // unless implemented/mapped safely
  canCancel: false,
  canRefund: false,
  supportsPartialRefund: false,
  supportsMultiplePartialRefund: false,
  supportsWebhook: true,
  supportsPolling: false,
  canReturnImmediateSuccess: true,
  canReturnImmediateFailure: true,
}
```

Xendit request:

- Use `POST {XENDIT_API_BASE_URL}/v3/payment_requests` unless the official SDK/docs in repo indicate a different current endpoint.
- Use Basic Auth:
  - username = `XENDIT_SECRET_KEY_SANDBOX`
  - password = empty string
  - header: `Authorization: Basic base64(secret + ':')`
- Request body should be minimal and safe:

```json
{
  "reference_id": "<payment transaction or idempotency reference>",
  "type": "PAY",
  "country": "ID",
  "currency": "IDR",
  "request_amount": 100000,
  "capture_method": "AUTOMATIC",
  "channel_code": "<mapped channel>",
  "channel_properties": {
    "success_return_url": "...",
    "failure_return_url": "..."
  },
  "description": "AuraPoS payment <intent/tx>",
  "metadata": {
    "source_app": "aurapos",
    "tenant_id": "...",
    "payment_intent_id": "..."
  }
}
```

Channel mapping for Phase 7A:

- `method = qris` → use Xendit QR channel code if supported by docs/account; otherwise make this configurable via metadata.
- `method = ewallet` → allow `metadata.xendit_channel_code` override.
- `method = bank_transfer` → allow `metadata.xendit_channel_code` override.
- For unknown/unconfigured mapping, throw a clear `PaymentPolicyError` or provider failure, do not guess silently.

Important:

- Do not make the whole engine Xendit-specific.
- Xendit-specific fields must stay inside `XenditProvider` or `rawProviderResponse`.
- `CreateGatewayPayment` should continue working with FakeGateway unchanged.
- Do not alter existing provider contract unless absolutely necessary.

---

## Task 3 — Map Xendit create-payment response

Xendit response fields to support:

- `payment_request_id`
- `reference_id`
- `status`
- `actions[]`
- `created`
- `updated`
- raw response

Status mapping:

```text
REQUIRES_ACTION -> requires_action
PENDING         -> pending
SUCCEEDED       -> succeeded
FAILED          -> failed
CANCELED        -> failed or cancelled policy documented clearly
EXPIRED         -> failed or expired policy documented clearly
```

Because current provider result status only supports `pending | requires_action | succeeded | failed`, map `CANCELED` and `EXPIRED` to `failed` for Phase 7A unless you add a generic status extension safely. Document this limitation.

Action mapping:

Xendit action examples:

```json
{
  "type": "REDIRECT_CUSTOMER",
  "value": "https://...",
  "descriptor": "WEB_URL"
}
```

Map to:

```ts
{
  type: 'redirect_customer',
  descriptor: 'WEB_URL',
  value: action.value,
  label: 'Redirect customer',
  metadata: { providerType: action.type }
}
```

Other action mappings:

```text
REDIRECT_CUSTOMER + WEB_URL -> redirect_customer + WEB_URL
PRESENT_TO_CUSTOMER + QR_STRING -> present_qr + QR_STRING
PRESENT_TO_CUSTOMER + VA_NUMBER -> display_code + VA_NUMBER
PRESENT_TO_CUSTOMER + PAYMENT_CODE -> display_code + PAYMENT_CODE
unknown action -> type none or display_code with metadata; document behavior
```

Backward-compatible fields:

- `providerReference = payment_request_id` preferred.
- `providerPaymentUrl` derived from first WEB_URL action.
- `providerQrString` derived from first QR_STRING action.
- `rawProviderResponse` stores raw Xendit response.
- `failureReason` should include safe failure reason/status if failed.

---

## Task 4 — Implement Xendit webhook verification and parsing

Route already exists:

```text
POST /api/payment-engine/webhooks/:provider
```

For Xendit sandbox it will be:

```text
POST /api/payment-engine/webhooks/xendit_sandbox
```

Verification:

- Implement `verifyWebhook()` for `XenditProvider` using sandbox webhook token/config.
- Do not use service token/session auth on webhook route.
- If Xendit webhook verification uses `x-callback-token`, validate header against `XENDIT_WEBHOOK_TOKEN_SANDBOX`.
- If the current official docs/account settings indicate a different signature/header mechanism, use that and document it.
- Return false if token/config missing.
- Never log webhook token.

Parsing:

Support at minimum these event types:

```text
payment.capture      -> succeeded
payment.failure      -> failed
payment_request.expiry -> ignored or failed policy documented
```

Payloads may contain:

```text
event
data.payment_request_id
data.reference_id
data.status
data.failure_code
data.failure_reason
data.request_amount
data.currency
```

Parsed output:

- `provider = 'xendit_sandbox'`
- `providerEventId`: prefer stable provider event id if present, else deterministic fallback from event + payment_request_id + timestamp/payload hash.
- `providerReference`: `data.payment_request_id` preferred.
- `eventType`: payload event.
- `transactionStatus`:
  - `payment.capture` or data.status `SUCCEEDED` -> succeeded
  - `payment.failure` or data.status `FAILED` -> failed
  - `payment_request.expiry` -> ignored for Phase 7A unless current transaction status policy supports expired.
- `failureReason`: safe reason from failure fields if present.
- `amount`: numeric request/capture amount if present.
- `rawData`: full payload.

Important:

- Duplicate webhook idempotency must continue to rely on `payment_provider_events` uniqueness.
- Webhook must resolve tenant from providerReference via transaction lookup when no tenant header is present.
- Do not require `x-tenant-id` on real provider webhook.
- Invalid token/signature must create audit event and return 401, consistent with existing webhook behavior.

---

## Task 5 — Register provider conditionally

Update DI container:

- Always register `ManualProvider` and `FakeGatewayProvider` as before.
- Register `XenditProvider` only if sandbox env is enabled and configured.

Example:

```ts
const registry = new PaymentProviderRegistry()
  .register(new ManualProvider())
  .register(new FakeGatewayProvider());

if (xenditSandboxEnabled) {
  registry.register(new XenditProvider(config));
}
```

Rules:

- Missing Xendit config must not break app startup.
- Missing Xendit config must not break FakeGateway tests.
- Real network calls only occur when `provider='xendit_sandbox'` and `createGatewayPayment` is called.

---

## Task 6 — Add tests with mocked HTTP only

Create tests, for example:

- `apps/api/src/__tests__/payment-xendit-provider.test.ts`

Do not call the real Xendit API in automated tests.

Test with mocked fetch or injected HTTP client.

Required tests:

1. Provider is disabled when env is not enabled/configured.
2. Provider capabilities are correct.
3. `createPayment()` sends Basic Auth with `secret + ':'` encoded.
4. `createPayment()` maps `REQUIRES_ACTION` + `REDIRECT_CUSTOMER/WEB_URL` to internal `requires_action` and `redirect_customer/WEB_URL`.
5. `createPayment()` maps QR action to `present_qr/QR_STRING` if payload present.
6. `createPayment()` maps VA action to `display_code/VA_NUMBER` if payload present.
7. `createPayment()` maps `SUCCEEDED` to internal `succeeded`.
8. `createPayment()` maps `FAILED` to internal `failed` with safe failure reason.
9. Provider network error returns a clear provider failure or throws controlled error without leaking secret.
10. Webhook valid token verifies true.
11. Webhook invalid token verifies false.
12. Webhook `payment.capture` parses to `succeeded`.
13. Webhook `payment.failure` parses to `failed`.
14. Webhook `payment_request.expiry` parses to ignored/failed according to documented Phase 7A policy.
15. Existing FakeGateway contract tests still pass.
16. Existing Phase 1–6.6 payment engine tests still pass if practical.

---

## Task 7 — Add manual sandbox smoke documentation

Create:

- `docs/payment-engine-xendit-sandbox-smoke.md`

Include:

- sandbox-only warning;
- how to create Xendit test API key/token in dashboard;
- required env vars;
- never commit secrets;
- how to start AuraPoS API;
- how to create payment intent;
- how to create Xendit sandbox gateway payment:

```json
{
  "provider": "xendit_sandbox",
  "method": "qris",
  "amount": 100000,
  "metadata": {
    "xendit_channel_code": "QRIS"
  }
}
```

- expected response with provider reference and actions;
- how to configure Xendit webhook URL:

```text
POST /api/payment-engine/webhooks/xendit_sandbox
```

- how to validate final status with:

```text
GET /api/payment-engine/intents/:id/status
```

- known limitations:
  - no production support;
  - no provider-level refund;
  - no provider-level cancel;
  - no external polling;
  - no POS UI;
  - status for expired/canceled mapped according to Phase 7A policy.

Do not include real secret values.

---

## Task 8 — Update smoke assets carefully

Do not replace FakeGateway smoke.

Optional:

- Add a separate `xendit-sandbox-smoke.ts` only if practical.
- If added, it must require explicit:

```bash
XENDIT_SANDBOX_SMOKE_TEST=true
XENDIT_SANDBOX_ENABLED=true
XENDIT_SECRET_KEY_SANDBOX=...
XENDIT_WEBHOOK_TOKEN_SANDBOX=...
```

and must refuse to run in production.

If not added, document manual curl flow only.

---

## Task 9 — Report

Create:

- `docs/reports/payment-engine-phase-7a-xendit-sandbox-report.md`

Report must include:

- summary;
- files changed;
- Xendit provider contract mapping;
- status mapping table;
- action mapping table;
- webhook verification strategy;
- webhook parsing strategy;
- provider registration strategy;
- tests added/updated;
- commands run;
- known limitations;
- explicit confirmation that this is sandbox-only;
- explicit confirmation that no production credentials/support were added;
- explicit confirmation that provider-level refund/cancel was not implemented;
- explicit confirmation that scheduled cron/job layer was not implemented;
- explicit confirmation that POS UI/order adapter was not implemented;
- explicit confirmation that legacy order payment flow was not intentionally changed;
- explicit confirmation that FakeGateway remains unchanged and still works.

---

## Commands to run

Run available checks:

- `npm run check`
- new Xendit provider tests
- provider contract tests
- Phase 6.5/6.6 FakeGateway tests if practical
- Phase 1–6.6 payment engine regression tests if practical

Do not run live Xendit network tests unless explicitly configured via sandbox env and documented. If not run, report as not run and explain prerequisites.

## Commit

Commit with a clear message, for example:

`feat(payment-engine): add xendit sandbox provider adapter`

Final Replit response must include summary, commit SHA, files changed, tests/checks run, known issues, and confirmation that legacy order payment flow was not intentionally changed.
