# Replit Agent Prompt — Payment Orchestration Phase 8D Standalone Service Use Case Wiring

Use this prompt in Replit Agent.

You are working in the AuraPoS repository.

This is **Payment Orchestration Phase 8D: Standalone Service Use Case Wiring**.

Phases completed:

```text
8A    — Hybrid standalone scaffold
8A-H  — Rename to @northflow/payment-orchestration-*
8B    — Core contract adoption / provider contract adapter
8C    — Standalone DB schema + repository boundary
```

Current accepted base:

- `1f22ae726aab12d8aec2570b7e98bdd3421a6699`

Read first:

- `docs/payment-orchestration-hybrid-standalone-architecture.md`
- `docs/reports/payment-orchestration-phase-8b-core-contract-adoption-report.md`
- `docs/reports/payment-orchestration-phase-8c-standalone-db-repository-boundary-report.md`
- `docs/replit-agent-payment-orchestration-phase-8c-standalone-db-repository-boundary-prompt.md`
- `docs/reports/payment-engine-phase-7a-hardening-report.md`

---

## Important user context

AuraPoS is still in development.

- No production users.
- No old payment data compatibility requirement.
- We are building the standalone service inside the AuraPoS monorepo first.
- Runtime embedded `/api/payment-engine/...` must remain untouched until Phase 8E/8F.
- The standalone service must be independently usable, but only minimum FakeGateway-based flow is required in this phase.

The selected architecture is Model 3 Hybrid:

```text
@northflow/payment-orchestration-core
@northflow/payment-orchestration-service
@northflow/payment-orchestration-client-sdk
```

---

## Guardrails

Do not implement unrelated future phases:

- no AuraPoS SDK consumption yet
- no embedded `/api/payment-engine` route deletion
- no POS UI changes
- no order adapter
- no split bill
- no customer ledger
- no stock reservation
- no PPOB wallet/credit
- no provider-level Xendit refund/cancel
- no Midtrans adapter
- no Stripe adapter
- no scheduled cron/worker layer
- no platform-managed settlement/payout
- no production provider credential management

Do not intentionally modify legacy order payment flow:

- `/api/orders/:id/payments`
- `/api/orders/create-and-pay`
- `packages/application/orders/RecordPayment.ts`
- `packages/application/orders/CreateAndPayOrder.ts`
- `apps/api/src/http/routes/orders.ts`
- `order_payments` legacy table behavior

Do not intentionally modify existing embedded payment engine behavior:

- `/api/payment-engine/...`
- `packages/application/payments/*` embedded use cases
- `packages/domain/payments/*` embedded runtime contracts
- `packages/infrastructure/payments/providers/FakeGatewayProvider.ts`
- `packages/infrastructure/payments/providers/XenditProvider.ts`
- embedded webhook handling
- embedded refund/void/reconciliation behavior

Allowed:

- Reuse provider classes by importing them if safe, but do not change their runtime behavior.
- Add adapter wrappers inside `apps/payment-orchestration-service`.
- Implement standalone repositories using the Phase 8C `payment_orchestration_*` tables.
- Implement standalone service routes under `/v1/...` only.

---

## Main goal

Make `apps/payment-orchestration-service` capable of executing a minimal real standalone payment flow using the standalone DB schema and FakeGateway provider.

Phase 8D must implement:

1. DB connection and repository wiring for the standalone service.
2. Real repository methods for the minimum flow.
3. Minimal use cases:
   - create merchant
   - create provider account placeholder/config
   - create payment intent
   - create FakeGateway payment transaction
   - confirm FakeGateway payment transaction in dev/test mode
   - get payment intent status
   - get refundability read model
4. HTTP routes for those use cases under `/v1/...`.
5. Service-token based auth for non-health routes.
6. Integration tests using a test DB strategy if available, or a well-documented repository test strategy.
7. Keep Xendit optional and not required for Phase 8D success.
8. Keep embedded AuraPoS payment engine untouched.

---

## API route scope for Phase 8D

Implement these standalone routes in `apps/payment-orchestration-service`:

### Health/version

Already exists; keep:

```text
GET /health
GET /version
```

### Merchant routes

```text
POST /v1/merchants
GET /v1/merchants/:id
```

### Provider account routes

```text
POST /v1/merchants/:merchantId/provider-accounts
GET /v1/merchants/:merchantId/provider-accounts/:id
```

### Payment intent routes

```text
POST /v1/payment-intents
GET /v1/payment-intents/:id/status
GET /v1/payment-intents/:id/refundability
```

### Gateway payment routes

```text
POST /v1/payment-intents/:id/gateway-payments
```

### FakeGateway dev/test confirmation route

```text
POST /v1/dev/fake-gateway/transactions/:transactionId/confirm
```

Important:

- This dev route must be disabled in production.
- This route exists only to test standalone service flow before real provider webhook wiring.
- It should behave similarly to embedded FakeGateway confirm but using standalone tables.

Do not implement real Xendit webhook route in Phase 8D unless it is trivial and isolated. Prefer FakeGateway only.

---

## Auth rules

All `/v1/...` routes except `/health` and `/version` must require a service token.

Preferred env var:

```text
PAYMENT_ORCHESTRATION_SERVICE_TOKEN
```

Backwards-compatible alias:

```text
PAYMENT_ENGINE_SERVICE_TOKEN
```

Rules:

- If no token configured in non-production, allow explicit dev mode only if the existing service env design already permits it; otherwise require token.
- In production, missing token must fail startup or make protected route return 503 with clear config error.
- Header accepted:

```text
x-payment-orchestration-service-token
```

Compatibility header accepted:

```text
x-payment-engine-service-token
```

Do not use AuraPoS session/tenant middleware.
Do not use `x-tenant-id` as primary auth/scope.

---

## DB connection rules

Inspect existing DB connection style in the repo before implementing:

- `server/db.ts`
- `apps/api/src/*`
- any Drizzle setup
- migration runner behavior

For standalone service, create a separate DB module under:

```text
apps/payment-orchestration-service/src/infrastructure/db.ts
```

or the cleanest equivalent.

Requirements:

- Use existing `DATABASE_URL` unless service-specific env exists.
- Optional future env:

```text
PAYMENT_ORCHESTRATION_DATABASE_URL
```

- Prefer `PAYMENT_ORCHESTRATION_DATABASE_URL` if set, fallback to `DATABASE_URL`.
- Import standalone schema definitions from `shared/schema.ts` if that is the current schema source.
- Do not import AuraPoS tenant/session/order modules.
- Do not auto-apply migrations from service startup unless current repo pattern already does it safely.
- If migrations are not auto-applied, document exact command.

---

## Task 1 — Implement repository methods for minimum flow

Implement real Drizzle methods for the skeleton repositories from Phase 8C:

```text
apps/payment-orchestration-service/src/infrastructure/repositories/DrizzlePaymentMerchantRepository.ts
apps/payment-orchestration-service/src/infrastructure/repositories/DrizzlePaymentProviderAccountRepository.ts
apps/payment-orchestration-service/src/infrastructure/repositories/DrizzlePaymentIntentRepository.ts
apps/payment-orchestration-service/src/infrastructure/repositories/DrizzlePaymentTransactionRepository.ts
apps/payment-orchestration-service/src/infrastructure/repositories/DrizzlePaymentProviderEventRepository.ts
apps/payment-orchestration-service/src/infrastructure/repositories/DrizzlePaymentIdempotencyRepository.ts
```

Minimum required methods for Phase 8D:

### Merchant repo

```ts
findById(id)
findByExternalRef(input)
create(input)
updateStatus(id, status)
```

### Provider account repo

```ts
findById(id, merchantId)
findByMerchantAndProvider(merchantId, provider, environment?)
create(input)
updateStatus(id, merchantId, status)
```

### Intent repo

```ts
findById(id, merchantId)
findByExternalPayable(input)
create(input)
updateTotals(input)
updateStatus(input)
```

Create behavior:

- initial status: `requires_payment`
- amountPaid: `0`
- amountRefunded: `0`
- amountRemaining: `amountDue`
- default currency: `IDR`

### Transaction repo

```ts
findById(id, merchantId)
findByIntentId(intentId, merchantId)
findByProviderReference(provider, providerReference)
create(input)
updateStatus(input)
sumSucceededRefundsByParent(parentTransactionId)
```

### Provider event repo

Implement enough for future Phase 8E/9 compatibility, but it does not need full webhook use case wiring yet:

```ts
reserveEvent(input)
findByProviderEventId(provider, providerEventId)
assignMerchant(eventId, merchantId)
markProcessed(eventId)
markFailed(eventId, error)
findStalePending(input)
```

### Idempotency repo

Implement basic methods:

```ts
reserve(input)
find(input)
markCompleted(input)
markFailed(input)
```

Idempotency behavior can be simple but must respect unique `(merchantId, scope, idempotencyKey)`.

Important:

- Use mappers from Phase 8C.
- Keep `merchantId` as scope.
- Never introduce AuraPoS `tenantId` into standalone repositories.
- Do not expose raw provider secrets.

---

## Task 2 — Implement minimal standalone use cases

Create use cases under:

```text
apps/payment-orchestration-service/src/application/use-cases/
```

Recommended files:

```text
CreateMerchant.ts
CreateProviderAccount.ts
CreatePaymentIntent.ts
CreateGatewayPayment.ts
ConfirmFakeGatewayPayment.ts
GetPaymentIntentStatus.ts
GetRefundability.ts
```

### CreateMerchant

Input:

```ts
{
  id?: string;
  name: string;
  legalName?: string | null;
  sourceApp?: string | null;
  externalRef?: string | null;
  metadata?: Record<string, unknown>;
}
```

Rules:

- Generate id if not supplied, e.g. `merchant_<uuid>`.
- If `sourceApp + externalRef` exists, return existing merchant or controlled conflict depending on existing idempotency policy. Prefer returning existing for dev ergonomics.
- status default: `active`.

### CreateProviderAccount

Input:

```ts
{
  merchantId: string;
  id?: string;
  provider: string;
  environment: 'sandbox' | 'test' | 'production';
  providerAccountRef?: string | null;
  credentialsRef?: string | null;
  publicConfig?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}
```

Rules:

- Verify merchant exists.
- Do not validate real provider secrets.
- For FakeGateway, allow no credentialsRef.
- For Xendit sandbox, allow config but do not call Xendit in Phase 8D unless route explicitly requests xendit and env exists.

### CreatePaymentIntent

Input:

```ts
{
  merchantId: string;
  providerAccountId?: string | null;
  sourceApp?: string | null;
  externalTenantId?: string | null;
  externalOutletId?: string | null;
  externalLocationId?: string | null;
  externalPayableType: string;
  externalPayableId: string;
  currency?: string;
  amountDue: number;
  allowPartial?: boolean;
  expiresAt?: Date | null;
  metadata?: Record<string, unknown> | null;
  idempotencyKey?: string | null;
}
```

Rules:

- Verify merchant exists.
- amountDue must be positive integer.
- currency default `IDR`.
- initial status `requires_payment`.
- amountRemaining = amountDue.
- If idempotencyKey is provided, reserve idempotency under scope `create_payment_intent`.

### CreateGatewayPayment

Input:

```ts
{
  merchantId: string;
  intentId: string;
  provider: string;
  method: string;
  amount: number;
  providerAccountId?: string | null;
  idempotencyKey?: string | null;
  metadata?: Record<string, unknown> | null;
}
```

Phase 8D required provider:

```text
fake_gateway
```

Optional provider:

```text
xendit_sandbox
```

Only support Xendit if low-risk and env/provider already cleanly reusable. Do not make Phase 8D success depend on Xendit.

Rules:

- Verify merchant and intent exist.
- Verify intent belongs to merchant.
- amount must be positive integer.
- amount must not exceed intent.amountRemaining unless overpay policy explicitly allows. For Phase 8D, reject amount > remaining.
- Use FakeGatewayProvider to produce provider result.
- Create a standalone transaction row with provider result:
  - status: provider result status
  - transactionType: `payment`
  - direction: `incoming`
  - providerReference
  - providerPaymentUrl
  - providerQrString
  - rawProviderResponse
  - metadata
- If provider result is `succeeded`, update intent totals immediately.
- If provider result is `requires_action` or `pending`, do not update amountPaid yet.
- Return transaction + updated intent status/read model.

### ConfirmFakeGatewayPayment

Input:

```ts
{
  merchantId: string;
  transactionId: string;
}
```

Rules:

- Non-production only.
- Verify transaction belongs to merchant.
- Only transactions with status `requires_action` or `pending` may be confirmed.
- Update transaction status to `succeeded`.
- Update intent totals:
  - amountPaid += transaction.amount
  - amountRemaining = max(0, amountDue - amountPaid + amountRefunded?)
  - status = `paid` if amountRemaining = 0
  - status = `partially_paid` if amountPaid > 0 and amountRemaining > 0
  - status = `overpaid` if amountPaid > amountDue
- Idempotent: confirming already succeeded transaction should return current state, not double-add amountPaid.

### GetPaymentIntentStatus

Return:

```ts
{
  intent: {...};
  latestTransaction: {...} | null;
  isTerminal: boolean;
  requiresAction: boolean;
  canRetryPayment: boolean;
}
```

Reuse shape from existing standalone SDK types where possible.

### GetRefundability

Return total refundable based on standalone transactions:

- source transaction refundable if:
  - direction `incoming`
  - transactionType `payment` / `deposit` / `settlement`
  - status `succeeded`
- subtract succeeded outgoing refund transactions linked by parentTransactionId.
- No provider-level refund call in Phase 8D.

---

## Task 3 — Wire provider registry for standalone service

Create a standalone provider registry under service infrastructure, e.g.:

```text
apps/payment-orchestration-service/src/infrastructure/providers/providerRegistry.ts
```

Requirements:

- Register FakeGateway always in non-production/dev/test.
- Xendit sandbox may be registered only if existing env config is available and low-risk.
- Do not change embedded provider registry.
- Do not change provider class behavior.
- If importing embedded FakeGatewayProvider/XenditProvider from `packages/infrastructure/payments/providers`, keep wrapper isolated in service.

Important:

- In Phase 8D, FakeGateway is the acceptance provider.
- Xendit remains optional.

---

## Task 4 — Wire service container

Update:

```text
apps/payment-orchestration-service/src/container.ts
```

Add:

- DB connection
- repository instances
- provider registry
- use case instances

But do not import AuraPoS app container.

The service container must not depend on:

```text
apps/api/src/container.ts
AuraPoS tenant middleware
AuraPoS order routes/domain
```

---

## Task 5 — Implement HTTP controllers/routes

Implement under:

```text
apps/payment-orchestration-service/src/routes/
```

Existing placeholder routes should become real for Phase 8D scope.

Suggested files:

```text
routes/merchants.ts
routes/providerAccounts.ts
routes/intents.ts
routes/devFakeGateway.ts
middleware/auth.ts
middleware/errors.ts
```

Response envelope:

Use a consistent envelope:

```json
{
  "ok": true,
  "data": {}
}
```

Errors:

```json
{
  "ok": false,
  "error": "ERROR_CODE",
  "message": "Human readable message"
}
```

Do not expose stack traces, secrets, raw credentials, or raw provider response in public API unless explicitly internal/dev-only.

Validation:

- Use zod if already used in service/app style.
- Validate `merchantId`, `amountDue`, `amount`, route params, provider, method.
- Return 400 for validation errors.
- Return 404 for missing merchant/intent/provider account/transaction.
- Return 409 for duplicate/conflict/idempotency mismatch if implemented.

---

## Task 6 — Update client SDK only if needed

The SDK already targets these routes:

```text
POST /v1/payment-intents
POST /v1/payment-intents/:id/gateway-payments
GET /v1/payment-intents/:id/status
GET /v1/payment-intents/:id/refundability
```

In Phase 8D, add optional SDK methods if needed:

```ts
createMerchant(input)
getMerchant(id)
createProviderAccount(merchantId, input)
getProviderAccount(merchantId, id)
confirmFakeGatewayPayment(transactionId, input)
```

Do not overbuild SDK.

If adding `confirmFakeGatewayPayment`, clearly mark it dev/test only.

---

## Task 7 — Tests

Add tests that prove standalone service minimal flow works.

Preferred test file:

```text
apps/payment-orchestration-service/src/__tests__/payment-orchestration-service-fakegateway-flow.test.ts
```

If the service test setup cannot run due to tsconfig/path constraints, place under `apps/api/src/__tests__` and document why.

Test strategy options:

### Preferred A — Test DB-backed repositories/use cases

Use a test database if the repo already has a safe test DB pattern.

### Acceptable B — Repository methods tested with transaction rollback

If possible, use one transaction per test and rollback.

### Acceptable C — Use-case tests with in-memory repository implementations

Only if DB setup is too heavy. But Phase 8D should still implement real Drizzle repositories.

Required coverage:

1. Create merchant.
2. Create FakeGateway provider account for merchant.
3. Create payment intent.
4. Create FakeGateway QRIS payment, status `requires_action`, intent remains `requires_payment`.
5. Get status returns latest transaction with `requiresAction=true`.
6. Confirm FakeGateway transaction, transaction becomes `succeeded`, intent becomes `paid`.
7. Confirm same transaction again is idempotent and does not double-add amountPaid.
8. Partial payment case: amount less than due -> intent `partially_paid` after confirm.
9. Reject overpayment if amount > amountRemaining.
10. Refundability returns paid transaction refundable amount.
11. Tenant terminology does not appear in standalone public response.
12. Protected route rejects missing/invalid service token.

Also run existing tests:

```text
payment-orchestration-schema-mappers.test.ts
payment-orchestration-core-contract-adapter.test.ts
payment-xendit-gateway-integration.test.ts
```

Do not require live Xendit credentials.

---

## Task 8 — Documentation

Update:

```text
docs/payment-orchestration-hybrid-standalone-architecture.md
```

Add Phase 8D section:

- standalone service now has minimum real FakeGateway flow;
- service DB connection and repositories wired;
- routes implemented under `/v1/...`;
- service token auth added;
- FakeGateway confirm route is dev/test only;
- Xendit remains optional/not required;
- embedded `/api/payment-engine/...` remains runtime source of truth for AuraPoS;
- Phase 8E will make AuraPoS consume the SDK.

Create service smoke doc:

```text
docs/payment-orchestration-standalone-fakegateway-smoke.md
```

Must include:

- env vars:
  - `DATABASE_URL` or `PAYMENT_ORCHESTRATION_DATABASE_URL`
  - `PAYMENT_ORCHESTRATION_SERVICE_TOKEN`
  - `PAYMENT_ORCHESTRATION_SERVICE_PORT`
- migrate/apply SQL note;
- start command;
- curl flow:
  1. create merchant
  2. create provider account
  3. create intent
  4. create gateway payment
  5. get status
  6. confirm fake gateway
  7. get status again
  8. get refundability
- expected response snippets;
- warning that FakeGateway is dev/test only;
- warning that this does not replace AuraPoS runtime until Phase 8E.

---

## Task 9 — Report

Create:

```text
docs/reports/payment-orchestration-phase-8d-standalone-service-usecase-wiring-report.md
```

Report must include:

- summary;
- files changed;
- routes implemented;
- use cases implemented;
- repositories implemented;
- auth middleware behavior;
- provider registry behavior;
- tests added/updated;
- commands run with pass/fail/not-run;
- known limitations;
- explicit confirmation that FakeGateway is the acceptance provider;
- explicit confirmation that Xendit remains optional/not required;
- explicit confirmation that no provider behavior was changed;
- explicit confirmation that no embedded `/api/payment-engine/...` route was deleted or changed intentionally;
- explicit confirmation that no legacy order payment flow was intentionally changed;
- explicit confirmation that no AuraPoS SDK consumption was implemented;
- explicit confirmation that no POS UI/order adapter was implemented;
- explicit confirmation that provider-level refund/cancel was not implemented.

---

## Commands to run

Run:

```bash
npm run check
```

Package checks:

```bash
pnpm --filter @northflow/payment-orchestration-core type-check
pnpm --filter @northflow/payment-orchestration-service type-check
pnpm --filter @northflow/payment-orchestration-client-sdk type-check
```

New service tests:

```bash
npx tsx --tsconfig apps/payment-orchestration-service/tsconfig.json --test apps/payment-orchestration-service/src/__tests__/payment-orchestration-service-fakegateway-flow.test.ts
```

If service tsconfig cannot run tests, use documented fallback:

```bash
npx tsx --tsconfig apps/api/tsconfig.node.json --test apps/api/src/__tests__/payment-orchestration-service-fakegateway-flow.test.ts
```

Existing regression tests:

```bash
npx tsx --tsconfig apps/api/tsconfig.node.json --test apps/api/src/__tests__/payment-orchestration-schema-mappers.test.ts
npx tsx --tsconfig apps/api/tsconfig.node.json --test apps/api/src/__tests__/payment-orchestration-core-contract-adapter.test.ts
npx tsx --tsconfig apps/api/tsconfig.node.json --test apps/api/src/__tests__/payment-xendit-gateway-integration.test.ts
```

Do not run live Xendit tests unless explicitly configured.
Do not fake success. If a command cannot run, report the exact reason.

---

## Acceptance criteria

1. `apps/payment-orchestration-service` can create merchant through HTTP.
2. It can create provider account through HTTP.
3. It can create payment intent through HTTP.
4. It can create FakeGateway payment through HTTP.
5. It can confirm FakeGateway payment through dev/test route.
6. It can return intent status through HTTP.
7. It can return refundability through HTTP.
8. Protected routes require service token.
9. Re-confirming succeeded FakeGateway transaction does not double-count paid amount.
10. Overpayment is rejected for Phase 8D.
11. No standalone public response includes `tenantId` as a primary field.
12. Real repositories are implemented for minimum flow.
13. Embedded `/api/payment-engine/...` remains untouched.
14. FakeGateway/Xendit provider behavior remains unchanged.
15. Report and smoke doc are created.

---

## Commit

Commit with a clear message, for example:

```text
feat(payment-orchestration): wire standalone fakegateway service flow
```

Final Replit response must include:

- summary;
- commit SHA;
- files changed;
- routes implemented;
- tests/checks run;
- known issues;
- confirmation that no embedded payment-engine route was intentionally changed;
- confirmation that no legacy order payment flow was intentionally changed;
- confirmation that no AuraPoS SDK consumption was implemented;
- confirmation that no POS UI/order adapter was implemented.
