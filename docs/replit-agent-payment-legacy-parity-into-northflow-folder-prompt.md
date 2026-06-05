# Replit Agent Prompt — Migrate Legacy AuraPoS Payment Features into Northflow Folder

Use this prompt in Replit Agent.

## Repository

Work in:

- `https://github.com/Rndynt/AuraPoS.git`

Current relevant baseline:

- `be1751fcf64782b674b14b075bf1499488eb405b`

Standalone Northflow target source folder inside AuraPoS:

- `northflow-payment-orchestration/`

Canonical standalone repo to sync after this work:

- `https://github.com/Rndynt/northflow-payment-orchestration.git`

## Goal

Before deleting payment from AuraPoS, migrate any remaining useful legacy/embedded AuraPoS payment features into `northflow-payment-orchestration/`.

The priority is **feature parity**, especially refund/void/cancel/refund provider contract parity.

Do not clean AuraPoS payment yet. Do not delete legacy payment code yet. First make the Northflow folder complete.

Final decision must be one of:

- `NORTHFLOW_PAYMENT_PARITY_READY_FOR_AURAPOS_PAYMENT_REMOVAL`
- `NOT_READY_REFUND_VOID_PARITY_BLOCKER`
- `NOT_READY_PROVIDER_CONTRACT_PARITY_BLOCKER`
- `NOT_READY_ROUTE_SDK_PARITY_BLOCKER`
- `NOT_READY_TEST_FAILURES`

## Important findings from review

Legacy AuraPoS still contains payment capabilities not proven present in Northflow:

- `packages/application/payments/RefundPaymentTransaction.ts`
- `packages/application/payments/VoidPaymentTransaction.ts`
- `packages/domain/payments/provider.ts` has provider-level `cancelPayment()` and `refundPayment()` contract
- `packages/infrastructure/payments/providers/FakeGatewayProvider.ts`
- `packages/infrastructure/payments/providers/XenditProvider.ts`
- `apps/api/src/http/controllers/PaymentEngineController.ts`
- `apps/api/src/http/routes/payment-engine.ts`
- tests like `payment-engine-phase4.test.ts`, `payment-provider-contract.test.ts`, `payment-xendit-provider.test.ts`, `payment-engine-fakegateway-e2e.test.ts`

Northflow already has payment orchestration foundation, but the provider runtime contract currently focuses on:

- `createPayment()`
- `parseWebhook()`
- `getPaymentStatus()`

and does not yet clearly expose:

- `cancelPayment()`
- `refundPayment()`
- transaction refund execution
- transaction void execution

## Hard guardrails

Do not delete payment from AuraPoS in this phase.

Do not modify the standalone remote repo directly until the folder is validated.

Do not implement AuraPoS integration with Northflow.

Do not add POS UI.

Do not add settlement/payout.

Do not add production secret manager.

Do not migrate unrelated AuraPoS order/product/inventory/customer modules.

Work primarily inside:

- `northflow-payment-orchestration/`

Legacy AuraPoS files may be read and used as reference only.

## Task 1 — Build complete parity matrix

Create:

- `northflow-payment-orchestration/docs/reports/legacy-payment-to-northflow-parity-matrix.md`

The matrix must compare legacy AuraPoS payment vs Northflow folder.

Include rows for at least:

- create payment intent
- create gateway payment
- list/get payment intent
- list/get transactions
- refundability calculation
- refund transaction execution
- void transaction execution
- recalculate/reconcile intent totals
- webhook verify/parse/process
- provider event idempotency
- idempotency key behavior
- FakeGateway create payment
- FakeGateway webhook
- FakeGateway refund/cancel behavior
- Xendit create payment
- Xendit webhook
- Xendit polling/status refresh
- Xendit refund/cancel behavior if legacy supports it
- provider capabilities
- provider action descriptors
- manual provider behavior
- payment route/controller behavior
- SDK method coverage
- schema/migration coverage
- tests coverage

Each row must have:

- legacy source file(s)
- Northflow target file(s)
- status: `ported`, `ported_with_design_change`, `intentionally_dropped`, `missing`, or `blocked`
- notes

Do not mark final ready if any critical row is `missing` or `blocked`.

## Task 2 — Add Northflow refund transaction execution

Implement in `northflow-payment-orchestration/` an equivalent of legacy:

- `packages/application/payments/RefundPaymentTransaction.ts`

Target suggested files:

- `northflow-payment-orchestration/apps/service/src/application/use-cases/RefundPaymentTransaction.ts`
- core request/response contract in `northflow-payment-orchestration/packages/core/src/application/contracts.ts`
- repository port changes in `northflow-payment-orchestration/packages/core/src/application/repositories.ts`
- route in service, suggested: `POST /v1/payment-transactions/:transactionId/refund`
- SDK method, suggested: `refundPaymentTransaction()`

Behavior parity requirements:

- amount must be greater than zero
- original transaction must exist for merchant
- original transaction must be `succeeded`
- original transaction must be incoming
- original transaction type must be refundable, e.g. payment/deposit/settlement if these types exist in Northflow
- compute already refunded amount from child refund transactions
- reject amount exceeding refundable remaining
- create outgoing refund transaction linked to parent transaction
- update/recalculate intent totals/status safely
- support idempotency key replay
- reject idempotency key conflict
- return refund transaction, updated intent, and refundable remaining

Important design point:

- If provider-level refund is not yet safe for real provider, implement internal refund ledger behavior first and expose provider refund as optional capability.
- Do not fake real provider refund success for production providers.
- FakeGateway may support test refund behavior if useful.

## Task 3 — Add Northflow void transaction execution

Implement in `northflow-payment-orchestration/` an equivalent of legacy:

- `packages/application/payments/VoidPaymentTransaction.ts`

Target suggested files:

- `northflow-payment-orchestration/apps/service/src/application/use-cases/VoidPaymentTransaction.ts`
- core request/response contract in `northflow-payment-orchestration/packages/core/src/application/contracts.ts`
- repository port changes in `northflow-payment-orchestration/packages/core/src/application/repositories.ts`
- route in service, suggested: `POST /v1/payment-transactions/:transactionId/void`
- SDK method, suggested: `voidPaymentTransaction()`

Behavior parity requirements:

- transaction must exist for merchant
- allow void only for `pending` or `requires_action`
- reject succeeded transaction with message that it must be refunded, not voided
- reject failed/cancelled/refunded/terminal states
- already voided with same idempotency key returns success
- already voided with different/no idempotency key rejects
- set status to `voided` or canonical Northflow equivalent
- set `cancelledAt` if schema supports it, or add field/migration if needed
- preserve/add metadata reason
- return updated transaction and intent

If Northflow currently uses `cancelled` instead of `voided`, make an explicit decision:

- either add `voided` status for parity
- or map legacy void to `cancelled` with documented semantic difference

Preferred: support `voided` because legacy uses it and previous docs mention void/refund.

## Task 4 — Add provider contract parity for cancel/refund

Update Northflow provider runtime contract in:

- `northflow-payment-orchestration/apps/service/src/infrastructure/providers/StandalonePaymentProvider.ts`

Add optional methods:

- `cancelPayment?(input): Promise<...>`
- `refundPayment?(input): Promise<...>`

Add types for:

- cancel input/result
- refund input/result

Update provider capabilities if needed:

- canCancel / supportsCancel
- canRefund / supportsRefund
- supportsPartialRefund
- supportsMultiplePartialRefund

Update providers:

- FakeGateway provider: implement deterministic dev/test cancel/refund behavior if suitable
- XenditSandbox provider: do not fake real refund/cancel if not implemented; return clear unsupported/configuration error or leave optional method undefined, depending on contract

Acceptance:

- service can tell whether provider supports cancel/refund without calling provider
- unsupported provider returns stable public error code, e.g. `PROVIDER_REFUND_UNSUPPORTED` or `PROVIDER_CANCEL_UNSUPPORTED`

## Task 5 — Add/adjust schema and migration for refund/void parity

Audit Northflow schema:

- `northflow-payment-orchestration/apps/service/src/infrastructure/schema.ts`
- `northflow-payment-orchestration/migrations/*`

Ensure transaction rows can represent:

- parent transaction id
- direction incoming/outgoing
- transaction type refund/payment/deposit/settlement if needed
- refunded child transaction
- voided/cancelled status
- cancelledAt/voidedAt timestamp if needed
- idempotency key
- refund reason/metadata

If missing, add a standalone migration:

- `northflow-payment-orchestration/migrations/0002_refund_void_parity.sql`

Do not touch AuraPoS root migrations in this phase.

## Task 6 — Add API routes and SDK methods

Add service routes under Northflow:

- `POST /v1/payment-transactions/:transactionId/refund`
- `POST /v1/payment-transactions/:transactionId/void`

Request examples:

Refund:

```json
{
  "merchantId": "merchant_123",
  "amount": 50000,
  "reason": "Customer request",
  "metadata": {},
  "idempotencyKey": "refund-key-123"
}
```

Void:

```json
{
  "merchantId": "merchant_123",
  "reason": "Cancelled before payment",
  "metadata": {},
  "idempotencyKey": "void-key-123"
}
```

Update SDK:

- `refundPaymentTransaction(transactionId, input)`
- `voidPaymentTransaction(transactionId, input)`

Update OpenAPI docs:

- `northflow-payment-orchestration/docs/openapi/payment-orchestration.openapi.json`

Update API contract docs:

- `northflow-payment-orchestration/docs/payment-orchestration-api-contract.md`

Update SDK contract docs:

- `northflow-payment-orchestration/docs/payment-orchestration-sdk-contract.md`

Update error codes docs:

- `northflow-payment-orchestration/docs/payment-orchestration-error-codes.md`

## Task 7 — Port parity tests from legacy

Use legacy tests as reference:

- `apps/api/src/__tests__/payment-engine-phase4.test.ts`
- `apps/api/src/__tests__/payment-provider-contract.test.ts`
- `apps/api/src/__tests__/payment-xendit-provider.test.ts`
- `apps/api/src/__tests__/payment-engine-fakegateway-e2e.test.ts`

Add or update tests in:

- `northflow-payment-orchestration/tests/`

Required test coverage:

Refund:

- can refund succeeded incoming transaction
- rejects refund amount <= 0
- rejects refund of pending/requires_action/failed transaction
- rejects over-refund
- supports partial refund
- supports multiple partial refunds if contract allows
- idempotent replay with same key
- idempotency conflict with different transaction/key context
- updates/reconciles intent totals

Void:

- can void pending transaction
- can void requires_action transaction
- rejects succeeded transaction
- rejects failed/cancelled/refunded terminal transaction
- idempotent replay with same key
- rejects already voided without matching key
- preserves metadata/reason

Provider contract:

- provider capabilities expose cancel/refund support
- FakeGateway cancel/refund behavior deterministic
- Xendit sandbox unsupported behavior clear and stable if not implemented

SDK/API:

- refund endpoint envelope success/error
- void endpoint envelope success/error
- SDK calls correct methods/paths/body/headers

## Task 8 — Update extraction check and docs

Update:

- `northflow-payment-orchestration/scripts/extraction-check.ts`
- `northflow-payment-orchestration/README.md`
- `northflow-payment-orchestration/docs/payment-orchestration-service-smoke-test.md`
- `northflow-payment-orchestration/docs/payment-orchestration-worker-operations.md` if affected

Extraction check must assert refund/void parity files exist and OpenAPI includes refund/void endpoints.

Smoke docs must include a refund/void sequence.

## Task 9 — Final report

Create:

- `northflow-payment-orchestration/docs/reports/legacy-payment-parity-migration-report.md`

Report must include:

- summary
- legacy files audited
- features ported
- intentionally dropped features, if any
- refund parity result
- void parity result
- provider contract parity result
- route/API/SDK parity result
- schema/migration changes
- tests added/updated
- validation commands and results
- final decision

## Validation commands

Run from inside the folder:

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

If integration tests need database env and cannot run, run unit/contract tests that do not need DB, document exact skipped DB tests, and do not claim full DB runtime validation.

Do not fake results.

## Acceptance criteria

Accepted only if:

1. Legacy payment parity matrix exists.
2. Refund transaction execution exists in Northflow.
3. Void transaction execution exists in Northflow.
4. Provider runtime contract supports optional cancel/refund parity.
5. FakeGateway and Xendit sandbox behavior are explicit for cancel/refund.
6. API routes exist for refund and void.
7. SDK methods exist for refund and void.
8. OpenAPI/API/SDK docs include refund and void.
9. Tests cover refund/void/provider parity.
10. Extraction check validates refund/void parity files/endpoints.
11. Final decision is `NORTHFLOW_PAYMENT_PARITY_READY_FOR_AURAPOS_PAYMENT_REMOVAL` or a clear blocker state.
12. No AuraPoS payment deletion occurs in this phase.

## Commit and push

Commit AuraPoS changes with:

- `feat(payment): port legacy refund void parity into northflow folder`

Then push the updated `northflow-payment-orchestration/` folder contents to the standalone repo with:

- `feat: add legacy refund void parity`

Do not run the full AuraPoS payment removal prompt until this parity migration is reviewed and accepted.

## Final response required

Final Replit response must include:

- AuraPoS commit SHA
- standalone repo commit SHA if pushed
- files changed inside `northflow-payment-orchestration/`
- parity matrix final status
- refund/void/provider parity summary
- routes and SDK methods added
- tests/checks run
- final decision
- confirmation that AuraPoS payment code was not deleted yet
