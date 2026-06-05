# Replit Agent Prompt — Payment Orchestration Phase 8K: SDK/API Contract Freeze + Deployment Readiness

Use this prompt in Replit Agent.

You are working in the AuraPoS repository.

Current accepted baseline:

- `a999eff2e1b2cf7ae15cfb143951ebd3f203c840`

## Goal

Freeze Northflow Payment Orchestration public contracts and make it ready for standalone deployment/extraction packaging.

This phase must not integrate any application. It must finalize contracts, docs, deployment/runtime commands, and extraction packaging readiness.

Final decision must be one of:

- `SDK_API_DEPLOYMENT_READY_FOR_EXTRACTION_REPO`
- `NOT_READY_API_CONTRACT_BLOCKER`
- `NOT_READY_SDK_CONTRACT_BLOCKER`
- `NOT_READY_DEPLOYMENT_BLOCKER`
- `NOT_READY_TEST_FAILURES`

## Guardrails

Do not implement:

- AuraPoS SDK integration
- Transity/KiosKoin/project integration
- embedded `/api/payment-engine` route deletion
- legacy order payment migration
- POS UI changes
- order adapter migration
- Midtrans/Stripe provider
- platform settlement/payout
- production secret manager

Do not intentionally modify:

- `apps/api/src/http/routes/payment-engine.ts`
- `packages/application/payments/*`
- `packages/domain/payments/*`
- `packages/infrastructure/payments/providers/*`
- `packages/application/orders/*`
- `apps/api/src/http/routes/orders.ts`
- `order_payments`

Allowed:

- `apps/payment-orchestration-service/*`
- `packages/payment-orchestration-core/*`
- `packages/payment-orchestration-client-sdk/*`
- standalone deployment docs/config/scripts
- OpenAPI/API docs
- smoke tests
- extraction packaging docs/checks

## Read first

Read:

- `docs/reports/payment-orchestration-phase-8j-standalone-extraction-completion-report.md`
- `docs/payment-orchestration-hybrid-standalone-architecture.md`
- `docs/payment-orchestration-service-smoke-test.md`
- `apps/payment-orchestration-service/src/routes/*`
- `apps/payment-orchestration-service/src/middleware/errors.ts`
- `apps/payment-orchestration-service/src/application/errors.ts`
- `packages/payment-orchestration-client-sdk/src/*`
- `packages/payment-orchestration-core/src/*`
- `scripts/payment-orchestration-extraction-check.ts`

## Task 1 — Freeze REST API response envelope

Create a consistent public response envelope for standalone service routes.

Required standard:

Success:

- `{ "ok": true, "data": ... }`

Error:

- `{ "ok": false, "error": { "code": "...", "message": "...", "details": ... } }`

Rules:

1. Apply to standalone payment-orchestration service routes only.
2. Do not change embedded AuraPoS payment routes.
3. Keep webhook endpoints compatible, but normalize response shape where safe.
4. Keep `/health`, `/version`, and `/ready` stable and documented. If they do not use envelope, explicitly document them as operational endpoints.
5. Add tests for success and error response envelopes.
6. Ensure SDK understands the frozen envelope.

## Task 2 — Freeze public error codes

Create or update:

- `docs/payment-orchestration-error-codes.md`

Document all stable public error codes, at minimum:

- `VALIDATION_ERROR`
- `MERCHANT_NOT_FOUND`
- `INTENT_NOT_FOUND`
- `TRANSACTION_NOT_FOUND`
- `PROVIDER_ACCOUNT_NOT_FOUND`
- `PROVIDER_ACCOUNT_REQUIRED`
- `PROVIDER_ACCOUNT_DISABLED`
- `PROVIDER_ACCOUNT_PROVIDER_MISMATCH`
- `PROVIDER_NOT_AVAILABLE`
- `PROVIDER_HTTP_CLIENT_UNCONFIGURED`
- `PROVIDER_CREDENTIALS_UNAVAILABLE`
- `WEBHOOK_PROVIDER_NOT_SUPPORTED`
- `WEBHOOK_SIGNATURE_INVALID`
- `WEBHOOK_SIGNATURE_MISSING`
- `WEBHOOK_BODY_INVALID`
- `OVERPAYMENT_REJECTED`
- `IDEMPOTENCY_IN_PROGRESS`
- `IDEMPOTENCY_CONFLICT`
- `IDEMPOTENCY_PREVIOUSLY_FAILED`
- `OPERATIONS_REPOSITORY_UNSUPPORTED`

Add tests that error responses return stable code/message shape.

## Task 3 — Freeze SDK method/type contract

Audit and finalize `packages/payment-orchestration-client-sdk`.

Required SDK methods:

- `createMerchant`
- `createProviderAccount`
- `createPaymentIntent`
- `getPaymentIntentStatus`
- `createGatewayPayment`
- `getRefundability`
- `reconcilePaymentIntentTotals`
- `refreshProviderStatus`
- `getReady` or `getReadiness`

If existing methods have different names, either keep backward-compatible aliases or document the frozen names.

SDK requirements:

1. Type-safe request/response types.
2. Standard error class, for example `PaymentOrchestrationApiError`.
3. Service token header support.
4. Merchant header support where relevant.
5. Idempotency key support for mutating calls where relevant.
6. No AuraPoS-specific naming.
7. Tests for each method path/method/body/header behavior.

Create:

- `docs/payment-orchestration-sdk-contract.md`

## Task 4 — OpenAPI/API documentation

Create:

- `docs/openapi/payment-orchestration.openapi.json`
- `docs/payment-orchestration-api-contract.md`

Document at minimum:

- `GET /health`
- `GET /version`
- `GET /ready`
- `POST /v1/merchants`
- `POST /v1/merchants/:merchantId/provider-accounts`
- `POST /v1/payment-intents`
- `GET /v1/payment-intents/:id/status`
- `GET /v1/payment-intents/:id/refundability`
- `POST /v1/payment-intents/:id/gateway-payments`
- `POST /v1/payment-intents/:id/reconcile`
- `POST /v1/payment-transactions/:id/refresh-provider-status`
- `POST /v1/webhooks/fake_gateway`
- `POST /v1/webhooks/xendit_sandbox`

Include:

- auth headers
- request bodies
- response envelope
- error envelope
- webhook security notes
- idempotency notes

## Task 5 — Deployment readiness

Create standalone deployment docs/config.

Required files:

- `apps/payment-orchestration-service/.env.example`
- `apps/payment-orchestration-service/Dockerfile` if practical
- `docs/payment-orchestration-deployment.md`
- `docs/payment-orchestration-worker-operations.md`

Document env vars:

- `NODE_ENV`
- `PORT`
- `DATABASE_URL`
- `PAYMENT_ORCHESTRATION_SERVICE_TOKEN`
- `PAYMENT_ORCHESTRATION_FAKEGATEWAY_WEBHOOK_SECRET`
- `PAYMENT_ORCHESTRATION_XENDIT_SANDBOX_ENABLED`
- `PAYMENT_ORCHESTRATION_XENDIT_BASE_URL`
- `PAYMENT_ORCHESTRATION_XENDIT_CALLBACK_TOKEN`
- credential env vars referenced by `credentialsRef`

Document commands:

- install
- type-check
- test
- start service
- run migrations
- run worker `expire-stale`
- run worker `reconcile-intent`
- run worker `reprocess-provider-events`
- run worker `all-safe`
- run extraction check

Do not put real secrets in docs.

## Task 6 — Final smoke test docs

Update:

- `docs/payment-orchestration-service-smoke-test.md`

Add a clean standalone smoke sequence:

1. Start service.
2. Check `/health`, `/version`, `/ready`.
3. Create merchant.
4. Create provider account.
5. Create payment intent.
6. Create FakeGateway payment.
7. Confirm/process webhook.
8. Check status.
9. Refresh provider status.
10. Run reconcile.
11. Run expire-stale worker.
12. Run reprocess-provider-events worker.
13. Run extraction check.

All examples must use placeholder tokens/secrets.

## Task 7 — Extraction packaging readiness

Create:

- `docs/payment-orchestration-standalone-repo-layout.md`

Include final target repo layout:

- `packages/core`
- `packages/client-sdk`
- `apps/service`
- `migrations`
- `docs`
- `scripts`
- `docker`
- `.github/workflows`

Add checklist:

- package names
- package exports
- build outputs
- tsconfig paths
- migrations ownership
- env files
- CI jobs
- Docker build
- versioning/changelog
- release tag strategy

Update extraction check script if needed so it validates contract/deployment files added in this phase.

## Task 8 — Tests and validation

Add/update tests for:

- response envelope success/error
- SDK method coverage
- SDK error handling
- readiness SDK method
- OpenAPI file exists and valid JSON
- `.env.example` does not contain real secrets
- deployment docs include required env/worker commands
- extraction check includes new contract/deployment files

Do not skip tests silently.

## Task 9 — Final report

Create:

- `docs/reports/payment-orchestration-phase-8k-sdk-api-freeze-deployment-readiness-report.md`

Report must include:

- summary
- files changed
- API envelope result
- error code freeze result
- SDK contract result
- OpenAPI/API docs result
- deployment readiness result
- smoke docs result
- extraction packaging readiness result
- tests/checks run
- known limitations
- final decision
- next phase recommendation
- guardrail confirmations

Next phase after successful 8K:

- `8L — Extract to Standalone Repo/Package`

## Commands to run

Run:

- `pnpm --filter @northflow/payment-orchestration-core type-check`
- `pnpm --filter @northflow/payment-orchestration-service type-check`
- `pnpm --filter @northflow/payment-orchestration-client-sdk type-check`
- `npm run check`
- all payment-orchestration tests
- extraction check script
- any new contract/deployment tests

Do not fake results. If any command fails, fix it or set final decision to blocker.

## Acceptance criteria

Accepted only if:

1. REST response envelope is frozen and tested.
2. Public error codes are documented and tested.
3. SDK method/type contract is frozen and tested.
4. OpenAPI/API docs exist.
5. Deployment docs and env example exist.
6. Worker operation docs exist.
7. Final standalone smoke test docs exist.
8. Extraction repo layout docs exist.
9. Extraction check validates required standalone files.
10. Package/root checks pass, or final decision is a blocker state.
11. No app integration was implemented.
12. No embedded payment runtime or legacy order flow was intentionally changed.

## Commit

If implementation succeeds:

- `feat(payment-orchestration): freeze sdk api contracts and deployment readiness`

If blocked:

- `docs(payment-orchestration): document sdk api deployment blockers`

Final Replit response must include:

- summary
- commit SHA
- files changed
- contract freeze result
- deployment readiness result
- tests/checks run
- final decision
- next phase
- confirmation that no app integration was implemented
- confirmation that no embedded payment runtime was intentionally changed
- confirmation that no legacy order payment flow was intentionally changed
