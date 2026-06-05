# Codex Prompt — Payment Orchestration Phase 8F: Standalone Readiness + Parity Closure

Use this prompt in Codex.

You are working in the AuraPoS repository.

This is **Payment Orchestration Phase 8F: Standalone Readiness + Parity Closure**.

This phase must not become another loose audit-only phase. It must produce a clear readiness decision and close small parity gaps directly in the same phase.

Current accepted baseline:

```text
a156659e64d9ab354badd44032b24321d1f3e5d1
```

## Context

The project now has standalone payment orchestration packages and service:

```text
packages/payment-orchestration-core
packages/payment-orchestration-client-sdk
apps/payment-orchestration-service
```

Completed phases:

```text
8A   — Hybrid standalone scaffold
8A-H — Rename to @northflow/payment-orchestration-*
8B   — Core provider contract adoption
8C   — Standalone DB schema + repository boundary
8D   — Standalone FakeGateway service flow
8D-H — SDK/service/idempotency/auth hardening
8D.1 — Atomic confirm + failed idempotency key policy
8E   — Standalone FakeGateway webhook + provider event wiring
8E-H — Reconciliation safety + webhook route auth bypass tests
8E-C — Quick-start/docs/artifact cleanup
```

Important: **Do not integrate AuraPoS with the SDK in this phase.** Phase 8F decides whether standalone service is ready for integration, but does not perform the integration.

---

## Read first

Read:

```text
replit.md
.agents/memory/MEMORY.md

docs/payment-orchestration-hybrid-standalone-architecture.md
docs/payment-orchestration-service-smoke-test.md

docs/reports/payment-orchestration-phase-8d-hardening-report.md
docs/reports/payment-orchestration-phase-8d1-8e-webhook-provider-wiring-report.md
docs/reports/payment-orchestration-phase-8e-hardening-report.md
docs/reports/payment-orchestration-phase-8e-cleanup-report.md
```

Inspect embedded payment runtime, but do not change it:

```text
apps/api/src/http/routes/payment-engine.ts
packages/application/payments/*
packages/domain/payments/*
packages/infrastructure/payments/providers/*
```

Inspect standalone runtime:

```text
apps/payment-orchestration-service/*
packages/payment-orchestration-core/*
packages/payment-orchestration-client-sdk/*
shared/schema.ts
migrations/*payment_orchestration*
```

---

## Hard rule for this phase

Do not mark this phase complete unless all are true:

```text
1. Parity matrix exists.
2. Existing embedded payment use cases are mapped to standalone status.
3. Small gaps discovered during audit are fixed in this same phase.
4. Large gaps are explicitly deferred with reason.
5. Tests are added/updated for fixed gaps.
6. Docs are updated.
7. Report contains Commands Run table.
8. Final readiness decision is explicit.
9. Accidental files/assets are checked.
10. Embedded payment runtime and legacy order payment are not intentionally changed.
```

Final decision must be one of:

```text
READY_FOR_AURAPOS_FAKEGATEWAY_INTEGRATION
NOT_READY_BLOCKED_BY_PROVIDER_PARITY
NOT_READY_BLOCKED_BY_RUNTIME_GAPS
```

---

## Guardrails

Do not implement in Phase 8F:

```text
AuraPoS SDK consumption
embedded /api/payment-engine route deletion
POS UI changes
order adapter migration
split bill UI
customer ledger
stock reservation
PPOB wallet/credit
provider-level Xendit refund/cancel
Midtrans adapter
Stripe adapter
scheduled cron/worker
platform settlement/payout
production credential manager
```

Do not intentionally modify legacy order payment flow:

```text
/api/orders/:id/payments
/api/orders/create-and-pay
packages/application/orders/RecordPayment.ts
packages/application/orders/CreateAndPayOrder.ts
apps/api/src/http/routes/orders.ts
order_payments
```

Do not intentionally modify embedded payment runtime behavior:

```text
apps/api/src/http/routes/payment-engine.ts
packages/application/payments/*
packages/domain/payments/*
packages/infrastructure/payments/providers/*
```

---

## Main objective

Answer this question reliably:

```text
Is Northflow Payment Orchestration standalone-ready enough for AuraPoS to start SDK integration behind a feature flag?
```

This phase may close small gaps directly, but must not become full provider implementation.

---

## Task 1 — Inventory embedded payment engine

Inspect embedded AuraPoS payment engine and list all runtime capabilities.

Minimum areas:

```text
routes
use cases
domain contracts
provider registry
FakeGateway provider
Xendit provider
manual payment provider
webhook parsing/verification
payment intent lifecycle
payment transaction lifecycle
refundability
refund/void behavior
expire stale payment transactions
reconciliation
provider events
idempotency
status polling
HTTP response shapes
error codes
tests
docs/reports
```

Create an inventory section in the final report. Do not change embedded files.

---

## Task 2 — Inventory standalone payment orchestration

Inspect standalone implementation and list current capabilities.

Minimum areas:

```text
@northflow/payment-orchestration-core
@northflow/payment-orchestration-client-sdk
apps/payment-orchestration-service
payment_orchestration_* schema
repository ports
Drizzle repository implementations
CreateMerchant
CreateProviderAccount
CreatePaymentIntent
CreateGatewayPayment
ConfirmFakeGatewayPayment
GetPaymentIntentStatus
GetRefundability
HandleProviderWebhook
ReconcilePaymentIntentTotals
FakeGateway standalone provider
FakeGateway webhook handler
provider event repository
idempotency repository
HTTP auth middleware
webhook auth bypass
SDK methods/types
tests
docs
smoke guide
```

Create standalone inventory section in the final report.

---

## Task 3 — Create parity matrix

Create:

```text
docs/reports/payment-orchestration-phase-8f-parity-matrix.md
```

Use this format:

```markdown
| Capability | Embedded AuraPoS Status | Standalone Status | Parity | Action |
|---|---|---|---|---|
| Create payment intent | implemented | implemented | full | none |
```

Minimum capabilities:

```text
merchant/tenant ownership model
payment intent create
payment intent status
partial payment
multi-payment transaction allocation
gateway payment create
manual payment
FakeGateway payment create
FakeGateway confirm
FakeGateway webhook
Xendit create payment
Xendit webhook
provider event dedupe
webhook signature/security
idempotency
refundability
refund transaction
void/cancel transaction
stale transaction expiration
reconciliation
polling/status refresh
provider account handling
service-token auth
merchantId/sourceApp/externalTenantId model
SDK methods
HTTP response envelopes
error normalization
tests
smoke docs
deployment/run docs
```

Parity values must be:

```text
full
partial
missing
intentionally excluded
POS-specific
not applicable
```

Action values must be:

```text
none
fix-now
defer-8G
defer-8H
defer-8I
exclude-from-standalone
```

---

## Task 4 — Close small gaps in this phase

If audit finds small safe gaps, fix them immediately.

Allowed small gaps:

```text
SDK type mismatch
missing SDK method for existing route
missing response field serialization
missing test for existing behavior
missing docs section
missing report table
wrong route status code
small error normalization
missing guardrail confirmation
missing smoke command
missing exported type
minor env docs mismatch
```

Large gaps not allowed in 8F:

```text
full Xendit standalone implementation
Xendit live webhook integration
provider-level refund/cancel implementation
scheduled worker/cron
AuraPoS SDK migration
embedded route removal
large schema migration
major provider abstraction rewrite
POS UI changes
```

Large gaps must be deferred with reason.

---

## Task 5 — Create readiness decision

Create:

```text
docs/reports/payment-orchestration-phase-8f-readiness-decision.md
```

It must contain one final decision:

```text
READY_FOR_AURAPOS_FAKEGATEWAY_INTEGRATION
```

or:

```text
NOT_READY_BLOCKED_BY_PROVIDER_PARITY
```

or:

```text
NOT_READY_BLOCKED_BY_RUNTIME_GAPS
```

Rules:

Use `READY_FOR_AURAPOS_FAKEGATEWAY_INTEGRATION` only if FakeGateway standalone flow is complete enough for dev feature-flag integration: SDK can call required routes, webhook works, idempotency works, reconciliation safety exists, service-token auth works, docs/smoke exist, and no critical runtime gap blocks dev integration.

This does not mean production real-provider readiness. If choosing READY, explicitly state:

```text
Ready only for FakeGateway/dev feature-flag integration.
Not ready for production payment provider migration.
Xendit/provider runtime completion remains Phase 8G.
```

Use `NOT_READY_BLOCKED_BY_PROVIDER_PARITY` if FakeGateway is ready but provider runtime such as Xendit is too incomplete to proceed with any integration.

Use `NOT_READY_BLOCKED_BY_RUNTIME_GAPS` if runtime gaps remain even for FakeGateway integration.

---

## Task 6 — Add tests for any fixed gap

For every code gap fixed, add or update tests.

Preferred test locations:

```text
apps/api/src/__tests__/payment-orchestration-service-fakegateway-flow.test.ts
apps/api/src/__tests__/payment-orchestration-service-http-auth.test.ts
apps/api/src/__tests__/payment-orchestration-atomic-confirm.test.ts
apps/api/src/__tests__/payment-orchestration-standalone-webhook.test.ts
apps/api/src/__tests__/payment-orchestration-webhook-route-auth-bypass.test.ts
apps/api/src/__tests__/payment-orchestration-reconcile.test.ts
apps/api/src/__tests__/payment-orchestration-schema-mappers.test.ts
apps/api/src/__tests__/payment-orchestration-core-contract-adapter.test.ts
```

If no code gap is fixed, no new code test is required, but report must explain that no code changed.

---

## Task 7 — Update architecture docs

Update:

```text
docs/payment-orchestration-hybrid-standalone-architecture.md
```

Add Phase 8F section with:

```text
parity matrix created
readiness decision created
what is ready
what is not ready
what is deferred to 8G/8H/8I
explicit warning: AuraPoS SDK integration is not performed in 8F
```

Update roadmap table to:

```text
8F — Standalone Readiness + Parity Closure
8G — Provider Runtime Completion
8H — SDK/API Freeze + Deployment Readiness
8I — AuraPoS Integration Behind Feature Flag
8J — Embedded Engine Deprecation
```

---

## Task 8 — Create final 8F report

Create:

```text
docs/reports/payment-orchestration-phase-8f-standalone-readiness-report.md
```

Report must include:

```text
summary
files inspected
files changed
embedded inventory summary
standalone inventory summary
parity matrix link
readiness decision link
small gaps fixed now
large gaps deferred
tests added/updated
commands run table
known limitations
final decision
next phase recommendation
guardrail confirmations
```

Commands Run table must include:

```text
npm run check
pnpm --filter @northflow/payment-orchestration-core type-check
pnpm --filter @northflow/payment-orchestration-service type-check
pnpm --filter @northflow/payment-orchestration-client-sdk type-check
payment-orchestration-service-fakegateway-flow.test.ts
payment-orchestration-service-http-auth.test.ts
payment-orchestration-atomic-confirm.test.ts
payment-orchestration-standalone-webhook.test.ts
payment-orchestration-webhook-route-auth-bypass.test.ts
payment-orchestration-reconcile.test.ts
payment-orchestration-schema-mappers.test.ts
payment-orchestration-core-contract-adapter.test.ts
payment-xendit-gateway-integration.test.ts
```

If a command is not run, mark `not run` and explain honestly. Do not fake command results.

---

## Task 9 — Check accidental files/assets

Before committing, inspect changed files.

Do not commit random screenshots, temporary logs, debug dumps, coverage folders, build output, node_modules, env files, or secrets.

---

## Commands to run

Run package checks:

```bash
pnpm --filter @northflow/payment-orchestration-core type-check
pnpm --filter @northflow/payment-orchestration-service type-check
pnpm --filter @northflow/payment-orchestration-client-sdk type-check
```

Run relevant tests:

```bash
npx tsx --tsconfig apps/api/tsconfig.node.json --test apps/api/src/__tests__/payment-orchestration-service-fakegateway-flow.test.ts
npx tsx --tsconfig apps/api/tsconfig.node.json --test apps/api/src/__tests__/payment-orchestration-service-http-auth.test.ts
npx tsx --tsconfig apps/api/tsconfig.node.json --test apps/api/src/__tests__/payment-orchestration-atomic-confirm.test.ts
npx tsx --tsconfig apps/api/tsconfig.node.json --test apps/api/src/__tests__/payment-orchestration-standalone-webhook.test.ts
npx tsx --tsconfig apps/api/tsconfig.node.json --test apps/api/src/__tests__/payment-orchestration-webhook-route-auth-bypass.test.ts
npx tsx --tsconfig apps/api/tsconfig.node.json --test apps/api/src/__tests__/payment-orchestration-reconcile.test.ts
npx tsx --tsconfig apps/api/tsconfig.node.json --test apps/api/src/__tests__/payment-orchestration-schema-mappers.test.ts
npx tsx --tsconfig apps/api/tsconfig.node.json --test apps/api/src/__tests__/payment-orchestration-core-contract-adapter.test.ts
npx tsx --tsconfig apps/api/tsconfig.node.json --test apps/api/src/__tests__/payment-xendit-gateway-integration.test.ts
```

Run root check if practical:

```bash
npm run check
```

If root check is too broad or fails due unrelated app, document exact reason.

---

## Acceptance criteria

Accepted only if:

```text
1. Parity matrix exists.
2. Readiness decision exists.
3. Final report exists.
4. Embedded payment engine was inspected but not modified.
5. Standalone payment orchestration was inspected.
6. Small safe gaps were fixed directly if found.
7. Large gaps were explicitly deferred.
8. Tests/checks were run or honestly marked not run.
9. No accidental assets/logs/build outputs were committed.
10. Final decision is one of the three allowed decisions.
```

---

## Commit

Use commit message:

```text
docs(payment-orchestration): add phase 8f standalone readiness audit
```

If code fixes are made in addition to docs:

```text
chore(payment-orchestration): close phase 8f standalone parity gaps
```

Final Codex response must include:

```text
summary
commit SHA
files changed
small gaps fixed
large gaps deferred
tests/checks run
final readiness decision
next recommended phase
confirmation that no AuraPoS SDK integration was implemented
confirmation that no embedded payment runtime was intentionally changed
confirmation that no legacy order payment flow was intentionally changed
```

---

## Phase 8F Execution Status — 2026-06-05

- [x] Task 1 — Embedded payment engine inventory completed in `docs/reports/payment-orchestration-phase-8f-standalone-readiness-report.md`.
- [x] Task 2 — Standalone payment orchestration inventory completed in `docs/reports/payment-orchestration-phase-8f-standalone-readiness-report.md`.
- [x] Task 3 — Parity matrix created at `docs/reports/payment-orchestration-phase-8f-parity-matrix.md`.
- [x] Task 4 — Small safe gap fixed: SDK now exposes `reconcilePaymentIntentTotals()` for the existing standalone reconcile route, with exported request/response types.
- [x] Task 5 — Readiness decision created at `docs/reports/payment-orchestration-phase-8f-readiness-decision.md`.
- [x] Task 6 — Test added for the fixed SDK gap at `apps/api/src/__tests__/payment-orchestration-client-sdk.test.ts`.
- [x] Task 7 — Architecture docs updated with Phase 8F section and refreshed roadmap.
- [x] Task 8 — Final 8F report created at `docs/reports/payment-orchestration-phase-8f-standalone-readiness-report.md`.
- [x] Task 9 — Accidental files/assets check completed via `git status --short` and changed-file review; no screenshots/logs/build output/env files/node_modules were staged.

Final decision:

```text
READY_FOR_AURAPOS_FAKEGATEWAY_INTEGRATION
```

Validation note: targeted Phase 8F package checks and payment orchestration tests passed. Root `npm run check` was attempted and failed in `@pos/api` due pre-existing type errors in older payment orchestration test helper typings; the new Phase 8F SDK test was not among the reported failures.
