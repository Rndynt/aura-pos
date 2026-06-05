# Replit Agent Prompt — Payment Engine Phase 6 Provider Contract Hardening + Enhanced FakeGateway

Use this prompt in Replit Agent.

You are working in the AuraPoS repository.

This is **Payment Engine Phase 6: Provider Contract Hardening + Enhanced FakeGateway**.

Important: this is NOT the real Midtrans/Xendit adapter phase yet.

Read first:

- `docs/payment-engine-roadmap.md`
- `docs/reports/payment-engine-phase-2-gateway-abstraction-report.md`
- `docs/reports/payment-engine-phase-3-webhook-engine-report.md`
- `docs/reports/payment-engine-phase-4-refund-void-report.md`
- `docs/reports/payment-engine-phase-5-reconciliation-report.md`
- `docs/reports/payment-engine-phase-5-hardening-report.md`

Current accepted base:

- `0ea8b1b7e1c1002705d7f0cfc5c733ffbfde7cf3`

## Guardrails

Do not intentionally change legacy order payment behavior:

- `/api/orders/:id/payments`
- `/api/orders/create-and-pay`
- `packages/application/orders/RecordPayment.ts`
- `packages/application/orders/CreateAndPayOrder.ts`
- `apps/api/src/http/routes/orders.ts`
- `order_payments` legacy table behavior

Do not implement future phases:

- no real Midtrans/Xendit/Stripe API calls
- no real provider credentials
- no real provider webhook signature implementation except fake provider
- no real provider refund/cancel API
- no order adapter
- no POS UI changes
- no split bill
- no customer ledger
- no stock reservation
- no PPOB wallet or credit
- no standalone extraction

## Main principle

FakeGateway is NOT a Midtrans/Xendit emulator.

FakeGateway is the golden contract test provider for the payment engine.

The goal is to make the provider contract strong enough that future real providers can translate their provider-specific behavior into the generic payment engine contract without changing core payment logic.

---

## Main goal

Harden the generic provider contract and upgrade FakeGateway to simulate the common provider behavior patterns that real providers usually expose.

Phase 6 must support:

1. A clearer provider result contract.
2. Generic provider actions such as redirect, QR, VA/payment code, or none.
3. Provider capability matrix.
4. Provider account/config abstraction without real credentials.
5. Enhanced FakeGateway scenarios.
6. Provider contract tests.
7. Backward-compatible API response fields where practical.
8. Report.

---

## Task 1 — Harden provider domain contract

Review:

- `packages/domain/payments/provider.ts`

Add or refine types without breaking current Phase 1-5 behavior.

Recommended types:

```ts
type ProviderActionType =
  | 'redirect_customer'
  | 'present_qr'
  | 'display_code'
  | 'none';

type ProviderActionDescriptor =
  | 'WEB_URL'
  | 'QR_STRING'
  | 'VA_NUMBER'
  | 'PAYMENT_CODE'
  | 'NONE';

interface ProviderAction {
  type: ProviderActionType;
  descriptor: ProviderActionDescriptor;
  value?: string | null;
  expiresAt?: Date | null;
  metadata?: Record<string, unknown>;
}

interface ProviderCapabilities {
  supportsRedirect: boolean;
  supportsQr: boolean;
  supportsVa: boolean;
  supportsPaymentCode: boolean;
  supportsWebhook: boolean;
  supportsCancel: boolean;
  supportsRefund: boolean;
  supportsPartialRefund: boolean;
  supportsMultiplePartialRefund: boolean;
  canReturnImmediateSuccess: boolean;
  canReturnImmediateFailure: boolean;
}
```

Update `PaymentProvider` so each provider exposes capabilities.

`createPayment()` result should support:

- `providerReference`
- `status`: `pending | requires_action | succeeded | failed`
- `actions: ProviderAction[]`
- `providerPaymentUrl?` for backward compatibility
- `providerQrString?` for backward compatibility
- `expiresAt?`
- `rawProviderResponse?`
- `failureReason?`

Keep existing call sites compiling.

---

## Task 2 — Provider account/config abstraction

Add a minimal provider account/config abstraction, but do not store real credentials.

Recommended type file:

- `packages/domain/payments/providerAccount.ts`

Recommended fields:

```ts
interface ProviderAccountConfig {
  provider: string;
  merchantId?: string;
  tenantId?: string;
  environment: 'sandbox' | 'production' | 'test';
  credentialsRef?: string;
  publicConfig?: Record<string, unknown>;
  capabilitiesOverride?: Partial<ProviderCapabilities>;
}
```

Rules:

- No real API keys.
- No encrypted secret store yet.
- Do not create DB table unless necessary.
- If a repository/table is too much, keep this as domain type only and document future persistence.

---

## Task 3 — Upgrade FakeGatewayProvider scenarios

Update `FakeGatewayProvider` so it can simulate multiple generic provider behavior patterns using input metadata.

Suggested `metadata.scenario` values:

- `redirect`
- `qris`
- `va`
- `payment_code`
- `immediate_success`
- `immediate_failure`
- `pending_expiry`
- `default`

Expected behavior:

- `redirect`: status `requires_action`, action `redirect_customer`, descriptor `WEB_URL`, fake payment URL.
- `qris`: status `requires_action`, action `present_qr`, descriptor `QR_STRING`, fake QR string.
- `va`: status `requires_action`, action `display_code`, descriptor `VA_NUMBER`, fake VA number.
- `payment_code`: status `requires_action`, action `display_code`, descriptor `PAYMENT_CODE`, fake payment code.
- `immediate_success`: status `succeeded`, no customer action, `succeededImmediately = true` if old field exists.
- `immediate_failure`: status `failed`, no customer action, clear `failureReason`.
- `pending_expiry`: status `pending` or `requires_action`, `expiresAt` set.
- `default`: preserve current fake payment URL/QR behavior as much as possible.

Rules:

- Do not call external APIs.
- Keep fake webhook support working.
- Keep existing Phase 2/3/4/5 tests passing.
- Do not remove existing fields if current controller/tests depend on them.

---

## Task 4 — Update CreateGatewayPayment behavior carefully

Review `CreateGatewayPayment` and API response.

Required:

- Store/create transaction in a way that remains compatible with current schema.
- If provider result status is `requires_action`, transaction should be `requires_action` or `pending` according to current internal enum support. Prefer `requires_action` if already supported.
- If provider result status is `succeeded`, create succeeded transaction and apply allocation/recalculate intent in the same DB transaction, or explicitly document if immediate success is deferred to webhook.
- If provider result status is `failed`, create failed transaction or return provider failure cleanly. Choose one policy and document it.
- Continue supporting idempotency replay.
- Continue not increasing amountPaid for pending/requires_action transactions.

If immediate success/failure is too risky for this phase, keep FakeGateway scenarios but make `CreateGatewayPayment` return a clear unsupported scenario error for immediate final statuses. Document it. Preferred: implement immediate success correctly.

---

## Task 5 — Provider contract tests

Add a provider contract test suite.

Suggested file:

- `apps/api/src/__tests__/payment-provider-contract.test.ts`

Tests should verify FakeGateway as the golden contract provider:

1. exposes capabilities;
2. redirect scenario returns redirect action;
3. qris scenario returns QR action;
4. va scenario returns display code action with VA descriptor;
5. payment_code scenario returns display code action with payment code descriptor;
6. pending_expiry returns expiresAt;
7. immediate_failure returns failed status and failure reason;
8. fake webhook parser still maps succeeded/failed/pending correctly;
9. fake webhook verifier still rejects invalid signatures;
10. unsupported scenario returns safe failure or default behavior, as documented.

Also add regression tests for `CreateGatewayPayment` if behavior changes.

---

## Task 6 — API/response compatibility

If API response changes, keep old fields where practical:

- `providerReference`
- `providerPaymentUrl`
- `providerQrString`

Add new field:

- `providerActions` or `actions`

Do not break existing smoke/manual tests.

---

## Task 7 — Report

Create:

- `docs/reports/payment-engine-phase-6-provider-contract-report.md`

Report must include:

- summary;
- files changed;
- provider contract changes;
- provider action model;
- provider capability model;
- provider account/config abstraction;
- enhanced FakeGateway scenarios;
- CreateGatewayPayment behavior changes;
- tests added/updated;
- commands run;
- known limitations;
- explicit confirmation that FakeGateway is not a Midtrans/Xendit emulator;
- explicit confirmation that no real gateway adapter/API/credential was implemented;
- explicit confirmation that legacy order payment flow was not intentionally changed.

## Commands to run

Run available checks:

- `npm run check`
- provider contract tests
- Phase 1-5 payment engine regression tests if practical
- TypeScript check

If any command fails, report exact relevant error summary.

## Commit

Commit with a clear message, for example:

`feat(payment-engine): harden provider contract and fake gateway scenarios`

Final Replit response must include summary, commit SHA, files changed, tests/checks run, known issues, and confirmation that legacy order payment flow was not intentionally changed.
