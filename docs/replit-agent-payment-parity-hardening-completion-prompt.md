# Replit Agent Prompt — Complete Northflow Payment Legacy Parity Hardening

Use this prompt in Replit Agent.

## Repository

Work in:

- `https://github.com/Rndynt/AuraPoS.git`

Current baseline reviewed:

- `c0c96b87ec0ee0d3bf4ba1fdcd1d91f61f60ae90`

Northflow folder inside AuraPoS:

- `northflow-payment-orchestration/`

Standalone repo to sync after folder validation:

- `https://github.com/Rndynt/northflow-payment-orchestration.git`

## Goal

Finish the legacy payment parity migration that was partially implemented.

The previous implementation added initial refund/void/manual/provider parity, but review found these blockers:

1. SDK does not expose refund/void methods.
2. SDK types do not include refund/void request/response shapes.
3. OpenAPI/API/SDK docs do not clearly include refund/void endpoints and methods.
4. Required parity reports are missing.
5. Refund idempotency is incomplete.
6. Void idempotency is incomplete.
7. Provider refund/cancel fallback is unsafe because non-manual gateway providers without refund/cancel methods may be treated as successful offline operations.
8. Standalone repo sync is not proven.

Final decision must be one of:

- `NORTHFLOW_PAYMENT_PARITY_READY_FOR_AURAPOS_PAYMENT_REMOVAL`
- `NOT_READY_SDK_REFUND_VOID_BLOCKER`
- `NOT_READY_DOCS_OPENAPI_BLOCKER`
- `NOT_READY_IDEMPOTENCY_BLOCKER`
- `NOT_READY_PROVIDER_FALLBACK_BLOCKER`
- `NOT_READY_STANDALONE_SYNC_BLOCKER`
- `NOT_READY_TEST_FAILURES`

## Hard guardrails

Do not delete payment from AuraPoS in this phase.

Do not run the full payment removal cleanup yet.

Do not implement AuraPoS integration with Northflow.

Do not add POS UI.

Do not add settlement/payout.

Work primarily inside:

- `northflow-payment-orchestration/`

AuraPoS legacy files may be read only for comparison.

## Current files to inspect first

Inspect:

- `northflow-payment-orchestration/apps/service/src/application/use-cases/RefundPaymentTransaction.ts`
- `northflow-payment-orchestration/apps/service/src/application/use-cases/VoidPaymentTransaction.ts`
- `northflow-payment-orchestration/apps/service/src/infrastructure/providers/StandalonePaymentProvider.ts`
- `northflow-payment-orchestration/apps/service/src/infrastructure/providers/StandaloneManualProvider.ts`
- `northflow-payment-orchestration/apps/service/src/infrastructure/providers/FakeGatewayProvider.ts`
- `northflow-payment-orchestration/apps/service/src/infrastructure/providers/XenditSandboxProvider.ts`
- `northflow-payment-orchestration/apps/service/src/infrastructure/providers/providerRegistry.ts`
- `northflow-payment-orchestration/apps/service/src/routes/transactions.ts`
- `northflow-payment-orchestration/packages/client-sdk/src/client.ts`
- `northflow-payment-orchestration/packages/client-sdk/src/types.ts`
- `northflow-payment-orchestration/packages/core/src/application/contracts.ts`
- `northflow-payment-orchestration/packages/core/src/application/repositories.ts`
- `northflow-payment-orchestration/apps/service/src/infrastructure/repositories/*`
- `northflow-payment-orchestration/apps/service/src/infrastructure/schema.ts`
- `northflow-payment-orchestration/docs/openapi/payment-orchestration.openapi.json`
- `northflow-payment-orchestration/docs/payment-orchestration-api-contract.md`
- `northflow-payment-orchestration/docs/payment-orchestration-sdk-contract.md`
- `northflow-payment-orchestration/docs/payment-orchestration-error-codes.md`
- `northflow-payment-orchestration/scripts/extraction-check.ts`

## Task 1 — Fix SDK refund/void contract

Update:

- `northflow-payment-orchestration/packages/client-sdk/src/client.ts`
- `northflow-payment-orchestration/packages/client-sdk/src/types.ts`
- any SDK export/barrel files

Add request/response types:

- `RefundPaymentTransactionRequest`
- `RefundPaymentTransactionResponse`
- `VoidPaymentTransactionRequest`
- `VoidPaymentTransactionResponse`

Required shapes:

```ts
export interface RefundPaymentTransactionRequest {
  merchantId?: string;
  amount: number;
  reason?: string | null;
  idempotencyKey?: string | null;
  metadata?: Record<string, unknown> | null;
}

export interface RefundPaymentTransactionResponse {
  refundTransaction: PaymentTransactionResponse;
  intent: PaymentIntentResponse;
  refundableRemaining?: number;
  providerRefunded: boolean;
}

export interface VoidPaymentTransactionRequest {
  merchantId?: string;
  reason?: string | null;
  idempotencyKey?: string | null;
  metadata?: Record<string, unknown> | null;
}

export interface VoidPaymentTransactionResponse {
  transaction: PaymentTransactionResponse;
  intent: PaymentIntentResponse | null;
  providerCancelled: boolean;
}
```

Add SDK methods:

```ts
refundPaymentTransaction(transactionId: string, input: RefundPaymentTransactionRequest): Promise<RefundPaymentTransactionResponse>
voidPaymentTransaction(transactionId: string, input?: VoidPaymentTransactionRequest): Promise<VoidPaymentTransactionResponse>
```

Paths must be:

- `POST /v1/payment-transactions/:transactionId/refund`
- `POST /v1/payment-transactions/:transactionId/void`

Use existing `injectMerchantId()` behavior.

Add tests that verify:

- method name exists
- method uses correct HTTP method/path
- body includes merchantId fallback
- idempotencyKey is passed
- error envelope handling still works

## Task 2 — Fix refund idempotency parity

Update:

- `northflow-payment-orchestration/apps/service/src/application/use-cases/RefundPaymentTransaction.ts`
- repository contract/implementation if needed
- tests

Legacy parity behavior required:

1. If `idempotencyKey` is supplied, check for an existing transaction for the same merchant/key before creating a new refund.
2. If existing transaction is an outgoing refund for the same parent transaction, return idempotent replay.
3. If existing transaction uses the same key but different transaction/context/type, return stable conflict error.
4. If no existing key exists, create the refund normally.
5. Race-safe behavior should be implemented with available repo primitives; if full DB lock is not available, document the limitation and rely on DB unique constraints if present.

Required stable error code:

- `IDEMPOTENCY_CONFLICT`

or the existing frozen equivalent if already present.

Output should include either:

- `idempotentReplay: boolean`

or document why existing response contract omits it. Preferred: add it.

Do not silently create duplicate refunds with the same idempotency key.

## Task 3 — Fix void idempotency parity

Update:

- `northflow-payment-orchestration/apps/service/src/application/use-cases/VoidPaymentTransaction.ts`
- route body parsing in `transactions.ts`
- SDK types/methods
- tests

Required behavior:

1. `VoidPaymentTransactionInput` must accept `idempotencyKey?: string | null`.
2. Route `POST /v1/payment-transactions/:id/void` must accept `idempotencyKey` and pass it into use case.
3. If transaction is already cancelled/voided and idempotency key matches the stored key/metadata, return success/idempotent replay.
4. If already cancelled/voided but no matching key, reject with stable transition error.
5. New void operation should persist idempotency key either on the transaction row or metadata, depending on current schema support.
6. Response should include `idempotentReplay: boolean` or document why omitted. Preferred: add it.

Required stable error code:

- `TRANSACTION_NOT_VOIDABLE`

or a more precise frozen code if already present.

## Task 4 — Fix unsafe provider fallback behavior

Current risk: refund/void use cases may treat missing provider methods as successful offline behavior for any provider.

Fix this with explicit provider policy.

Rules:

1. Manual provider may perform offline success for refund/cancel.
2. FakeGateway may perform deterministic dev/test refund/cancel if implemented.
3. Real/sandbox gateway providers without `refundPayment()` must return `PROVIDER_REFUND_UNSUPPORTED` for refund.
4. Real/sandbox gateway providers without `cancelPayment()` must return `PROVIDER_CANCEL_UNSUPPORTED` for void/cancel.
5. Do not fake successful provider refund/cancel for Xendit sandbox unless a real/safe sandbox adapter method is implemented.
6. Provider capabilities must be checked before provider operation.

Update:

- `RefundPaymentTransaction.ts`
- `VoidPaymentTransaction.ts`
- `StandalonePaymentProvider.ts`
- `StandaloneManualProvider.ts`
- `FakeGatewayProvider.ts`
- `XenditSandboxProvider.ts`
- provider registry if needed
- error codes docs

Add helper if useful:

```ts
function isOfflineRefundProvider(providerCode: string): boolean {
  return providerCode === 'manual';
}
```

But do not hardcode broad gateway success.

## Task 5 — Complete OpenAPI/API/SDK docs

Update:

- `northflow-payment-orchestration/docs/openapi/payment-orchestration.openapi.json`
- `northflow-payment-orchestration/docs/payment-orchestration-api-contract.md`
- `northflow-payment-orchestration/docs/payment-orchestration-sdk-contract.md`
- `northflow-payment-orchestration/docs/payment-orchestration-error-codes.md`
- `northflow-payment-orchestration/docs/payment-orchestration-service-smoke-test.md`
- `northflow-payment-orchestration/README.md`

OpenAPI must include:

- `POST /v1/payment-transactions/{transactionId}/refund`
- `POST /v1/payment-transactions/{transactionId}/void`

Docs must include:

- request body
- response envelope
- error envelope
- idempotency behavior
- provider refund/cancel support rules
- manual provider behavior
- FakeGateway behavior
- Xendit sandbox unsupported behavior if not implemented

Error code docs must include:

- `TRANSACTION_NOT_REFUNDABLE`
- `REFUND_EXCEEDS_REFUNDABLE`
- `TRANSACTION_NOT_VOIDABLE`
- `PROVIDER_REFUND_UNSUPPORTED`
- `PROVIDER_REFUND_FAILED`
- `PROVIDER_CANCEL_UNSUPPORTED`
- `PROVIDER_CANCEL_FAILED`
- `IDEMPOTENCY_CONFLICT`

## Task 6 — Add required parity reports

Create or update:

- `northflow-payment-orchestration/docs/reports/legacy-payment-to-northflow-parity-matrix.md`
- `northflow-payment-orchestration/docs/reports/legacy-payment-parity-migration-report.md`

The parity matrix must explicitly include:

- RefundPaymentTransaction
- VoidPaymentTransaction
- provider-level cancel/refund contract parity
- manual provider behavior
- legacy PaymentEngineController / payment-engine route parity
- reprocess provider events
- recalculate/reconcile intent totals
- refundability
- FakeGateway
- Xendit sandbox
- SDK method coverage
- docs/OpenAPI coverage
- tests coverage

The final migration report must include:

- files changed
- blockers fixed
- remaining limitations
- validation commands and results
- standalone sync status
- final decision

Final decision may only be:

- `NORTHFLOW_PAYMENT_PARITY_READY_FOR_AURAPOS_PAYMENT_REMOVAL`

if all critical blockers are fixed.

## Task 7 — Update extraction check

Update:

- `northflow-payment-orchestration/scripts/extraction-check.ts`

It must validate:

- `RefundPaymentTransaction.ts` exists
- `VoidPaymentTransaction.ts` exists
- `StandaloneManualProvider.ts` exists
- provider contract exposes `cancelPayment` and `refundPayment`
- SDK client exposes `refundPaymentTransaction` and `voidPaymentTransaction`
- SDK types include refund/void request/response types
- OpenAPI contains refund/void endpoints
- parity matrix exists
- final parity migration report exists
- docs mention provider unsupported behavior
- no forbidden AuraPoS imports exist inside Northflow source

## Task 8 — Tests

Add/update tests in:

- `northflow-payment-orchestration/tests/`

Required tests:

SDK:

- refund method path/body/header
- void method path/body/header
- types compile

Refund:

- refunds succeeded incoming transaction
- rejects non-positive amount
- rejects non-refundable transaction
- rejects over-refund
- idempotent replay same key
- idempotency conflict different context
- manual provider offline refund success
- non-manual provider without refund method returns unsupported

Void:

- voids pending transaction
- voids requires_action transaction
- rejects succeeded transaction
- idempotent replay same key
- already cancelled without matching key rejects
- manual provider offline cancel success
- non-manual provider without cancel method returns unsupported

Docs/checks:

- OpenAPI contains refund/void paths
- extraction-check passes

## Task 9 — Sync standalone repo after folder validation

After all validation passes in `northflow-payment-orchestration/`, push/sync the folder contents to:

- `https://github.com/Rndynt/northflow-payment-orchestration.git`

Commit in standalone repo:

- `fix: complete legacy payment parity hardening`

Do not claim standalone sync if not pushed.

## Validation commands

Run from inside folder:

```bash
cd northflow-payment-orchestration
pnpm install
pnpm check
pnpm build
pnpm test
pnpm extraction-check
pnpm --filter @northflow/payment-orchestration-core type-check
pnpm --filter @northflow/payment-orchestration-client-sdk type-check
pnpm --filter @northflow/payment-orchestration-service type-check
```

Run from AuraPoS root if needed to ensure the prompt/docs commit does not break workspace:

```bash
npm run check
```

Do not fake results. If a command fails, fix it or set a blocker final decision.

## Acceptance criteria

Accepted only if:

1. SDK refund/void methods exist and are tested.
2. SDK refund/void request/response types exist.
3. Refund idempotency replay/conflict behavior exists and is tested.
4. Void idempotency replay/conflict behavior exists and is tested.
5. Manual provider offline behavior is explicit and tested.
6. Non-manual provider missing refund/cancel does not silently succeed.
7. OpenAPI includes refund/void endpoints.
8. API/SDK/error-code/smoke docs include refund/void and provider fallback policy.
9. Parity matrix exists.
10. Final parity migration report exists.
11. Extraction check validates all critical parity artifacts.
12. Folder is synced to standalone repo or final decision is `NOT_READY_STANDALONE_SYNC_BLOCKER`.
13. No AuraPoS payment deletion occurs in this phase.

## Commit and push

Commit AuraPoS with:

- `fix(payment): complete northflow legacy parity hardening`

Push AuraPoS.

Then push standalone repo with:

- `fix: complete legacy payment parity hardening`

## Final response required

Final Replit response must include:

- AuraPoS commit SHA
- standalone repo commit SHA
- SDK changes
- idempotency fixes
- provider fallback fixes
- docs/OpenAPI updates
- parity reports created
- extraction-check result
- tests/checks run
- final decision
- confirmation that AuraPoS payment code was not deleted yet
