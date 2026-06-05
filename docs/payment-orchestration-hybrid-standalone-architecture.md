# Payment Orchestration — Hybrid Standalone Architecture

**Phase:** 8B — Core Contract Adoption (current)
**Previous phase:** 8A — Hybrid Standalone Extraction Scaffold (Hardened)
**Status:** Provider contracts converged. SDK renamed. Adapter helpers added. Embedded engine unchanged.
**Date:** 2026-06-05
**Naming:** `@northflow/payment-orchestration-*`

---

## Overview

The AuraPoS payment engine began as an embedded subsystem inside `apps/api`.
Phases 1–7 progressively hardened it (multi-provider, partial payments, refunds,
voiding, Phase 7A resilience hardening).

Phase 8A introduces the **Hybrid Standalone** extraction pattern: a new standalone
service is scaffolded alongside the embedded engine under the `@northflow` namespace.
The embedded engine remains fully operational. A smooth migration across Phases 8B–8E
gradually shifts traffic to the standalone service.

The standalone system is intentionally branded `@northflow/payment-orchestration-*`
rather than `@pos/payment-engine-*` because it is designed to be reusable by
AuraPoS, Transity, KiosKoin, photography apps, and future projects — not tied to any
single product.

---

## Monorepo Layout

```
packages/
  payment-orchestration-core/        ← Framework-agnostic contracts (NEW, Phase 8A)
    src/
      domain/                        ← Domain types (merchantId-centric)
        PaymentScope.ts
        PaymentMerchant.ts
        PaymentProviderAccount.ts
        PaymentIntent.ts
        PaymentTransaction.ts
        PaymentErrors.ts
      application/                   ← Use-case input/output contracts + port interfaces
        contracts.ts
        ports.ts
      providers/                     ← Provider action + capability contracts
        providerActions.ts
        providerCapabilities.ts
      index.ts                       ← Public API surface

  payment-orchestration-client-sdk/  ← Typed HTTP client (NEW, Phase 8A)
    src/
      client.ts                      ← PaymentEngineClient (fetch-compatible)
      types.ts                       ← Request/response shapes (self-contained)
      errors.ts                      ← PaymentEngineClientError, PaymentEngineNetworkError
      index.ts                       ← Public API surface

apps/
  payment-orchestration-service/     ← Standalone Express service (NEW, Phase 8A skeleton)
    src/
      config/env.ts                  ← Environment variable loader (dual-env-var support)
      routes/health.ts               ← GET /health, GET /version
      routes/intents.ts              ← POST /v1/payment-intents (501 placeholder)
                                        GET  /v1/payment-intents/:id/status (501)
                                        GET  /v1/payment-intents/:id/refundability (501)
                                        POST /v1/payment-intents/:id/gateway-payments (501)
      routes/webhooks.ts             ← POST /v1/webhooks/:provider (501 placeholder)
      container.ts                   ← DI container (Phase 8A: config only)
      app.ts                         ← Express application factory
      index.ts                       ← Entry point (port 5100)

  api/                               ← Existing AuraPoS API (UNCHANGED, port 5000)
    src/payments/                    ← Embedded payment engine (UNCHANGED through Phase 8E)
```

---

## Package Names

| Package | Name |
|---------|------|
| Core contracts | `@northflow/payment-orchestration-core` |
| Standalone service | `@northflow/payment-orchestration-service` |
| HTTP client SDK | `@northflow/payment-orchestration-client-sdk` |

Do NOT use `@pos/payment-engine-*` for the standalone packages — those names are
legacy and have been replaced in Phase 8A hardening.

---

## Identity Model Change

### Embedded (current)
```
tenantId → payment intent → transactions
```

The embedded engine uses `tenantId` (AuraPoS-specific slug) as the primary
payment owner identity. This couples the payment engine to AuraPoS's multi-tenant
auth model.

### Standalone (target)
```
merchantId → payment intent → transactions
```

The standalone engine uses `merchantId` as the primary payment owner. A merchant
maps to a commercial entity — decoupled from any source application's auth model.

### Migration Bridge
`createAuraPosPaymentScope()` in `payment-orchestration-core` provides
a temporary compatibility adapter that maps AuraPoS `tenantId` → standalone
`merchantId`. This bridge is used during Phases 8B–8E and removed in Phase 8F.

---

## Service Boundaries (Phase 8A → 8E)

| Phase | Embedded Engine | Standalone Service | Client SDK       |
|-------|----------------|--------------------|------------------|
| 8A    | 100% traffic   | 0% (skeleton only) | Types + client   |
| 8B    | 100% traffic   | Provider migration | Internal testing |
| 8C    | 95% traffic    | 5% shadow traffic  | Validation       |
| 8D    | 50% traffic    | 50% traffic        | AuraPoS + others |
| 8E    | 0% (deprecated)| 100% traffic       | All consumers    |

---

## API Routes (Phase 8A)

### Operational
```
GET  /health                                           → 200 { ok: true, service: 'payment-orchestration-service' }
GET  /version                                          → 200 { service, version, phase }
```

### Placeholder (501 Not Implemented — Phase 8D target)
```
POST /v1/payment-intents                               → 501
GET  /v1/payment-intents/:id/status                   → 501
GET  /v1/payment-intents/:id/refundability            → 501  ← added in Phase 8A hardening
POST /v1/payment-intents/:id/gateway-payments         → 501
POST /v1/webhooks/:provider                           → 501
```

### Future Routes (Phase 8D+)
```
POST /v1/payment-intents/:id/refund                   → Phase 8D
POST /v1/payment-intents/:id/void                     → Phase 8D
```

---

## Environment Variables

### Port
| Variable | Description |
|----------|-------------|
| `PAYMENT_ORCHESTRATION_SERVICE_PORT` | Preferred. Port for the standalone service. |
| `PAYMENT_ENGINE_SERVICE_PORT` | Backwards-compat alias. |
| `PORT` | Generic fallback. |
| *(default)* | `5100` |

### Service Token
| Variable | Description |
|----------|-------------|
| `PAYMENT_ORCHESTRATION_SERVICE_TOKEN` | Preferred. Auth token for service-to-service calls. |
| `PAYMENT_ENGINE_SERVICE_TOKEN` | Backwards-compat alias during monorepo transition. |

---

## Design Principles

### No Embedded Dependencies
`packages/payment-orchestration-core` and `apps/payment-orchestration-service` MUST NOT import:
- `@pos/domain` (AuraPoS order domain)
- `@pos/application` (AuraPoS use cases)
- `@pos/infrastructure` (AuraPoS DB repositories)
- AuraPoS session middleware or tenant resolution

These packages are independently versioned and standalone by design.

### Client SDK Self-Containment
`packages/payment-orchestration-client-sdk` MUST NOT import from
`@northflow/payment-orchestration-core`. It is independently versioned for portability
(can be published to npm separately, used by non-AuraPoS apps without bringing in the core package).

### Port-Based Design
Infrastructure concerns (DB, secrets, external HTTP) are behind port interfaces
(`IPaymentMerchantRepository`, `IStandalonePaymentIntentRepository`, etc.).
Use cases depend only on these interfaces — never on concrete implementations.

### Backwards Compatibility
The embedded AuraPoS payment engine at `apps/api/src/payments/` is **unchanged**.
All existing `/api/payment-engine/...` routes continue to work normally.
No DB migrations are required in Phase 8A.

---

## Port (Default 5100)

The standalone service runs on port `5100` by default.
Set `PAYMENT_ORCHESTRATION_SERVICE_PORT` (or legacy `PAYMENT_ENGINE_SERVICE_PORT`) to override.
Port `5000` is reserved for `apps/api`.

---

## Running the Standalone Service (Phase 8A)

```bash
# From monorepo root
PAYMENT_ORCHESTRATION_SERVICE_PORT=5100 \
  npx tsx --tsconfig apps/payment-orchestration-service/tsconfig.json \
  apps/payment-orchestration-service/src/index.ts

# Or via workspace script
pnpm --filter @northflow/payment-orchestration-service dev
```

Expected output:
```
[payment-orchestration-service] Phase 8A listening on port 5100 (NODE_ENV=development)
  GET http://localhost:5100/health
  GET http://localhost:5100/version

  Placeholder routes (501 Not Implemented):
  POST http://localhost:5100/v1/payment-intents
  GET  http://localhost:5100/v1/payment-intents/:id/status
  GET  http://localhost:5100/v1/payment-intents/:id/refundability
  POST http://localhost:5100/v1/webhooks/:provider
```

---

## Type-Check Commands

```bash
# payment-orchestration-core
pnpm --filter @northflow/payment-orchestration-core type-check

# payment-orchestration-client-sdk
pnpm --filter @northflow/payment-orchestration-client-sdk type-check

# payment-orchestration-service
pnpm --filter @northflow/payment-orchestration-service type-check
```

---

## Phase 8B — Core Contract Adoption

### What changed in Phase 8B

**SDK rename (Task 1)**

The primary public class and error names in `@northflow/payment-orchestration-client-sdk`
were renamed from `PaymentEngine*` to `PaymentOrchestration*`:

| Before (deprecated) | After (primary) |
|---------------------|-----------------|
| `PaymentEngineClient` | `PaymentOrchestrationClient` |
| `PaymentEngineClientError` | `PaymentOrchestrationClientError` |
| `PaymentEngineNetworkError` | `PaymentOrchestrationNetworkError` |
| `PaymentEngineClientConfig` | `PaymentOrchestrationClientConfig` |

Deprecated aliases remain exported for backward compatibility and are marked `@deprecated`.

**Correct SDK usage (Phase 8B+):**

```ts
import { PaymentOrchestrationClient } from '@northflow/payment-orchestration-client-sdk';

const client = new PaymentOrchestrationClient({
  baseUrl: 'http://localhost:5100',
  serviceToken: process.env.PAYMENT_ORCHESTRATION_SERVICE_TOKEN,
  merchantId: 'my-merchant-id',
  sourceApp: 'aurapos',
});
```

**Core capability contract extension (Task 5)**

`PaymentProviderCapabilities` in `@northflow/payment-orchestration-core` was extended
with three optional fields to align with the embedded `ProviderCapabilities`:

| New optional field | Maps from embedded | Meaning |
|-------------------|--------------------|---------|
| `supportsMultiplePartialRefund?` | `supportsMultiplePartialRefund` | Provider allows multiple partial refunds per tx |
| `canReturnImmediateSuccess?` | `canReturnImmediateSuccess` | Provider may settle synchronously from createPayment() |
| `canReturnImmediateFailure?` | `canReturnImmediateFailure` | Provider may reject synchronously from createPayment() |

**Provider adapter (Task 2/3)**

A new adapter module bridges embedded and core provider contracts:

```text
packages/application/payments/adapters/PaymentProviderCoreAdapter.ts
```

Exported helpers:

```ts
toCoreProviderAction(embedded: ProviderAction): PaymentProviderAction
toCoreProviderActions(embedded: ProviderAction[]): PaymentProviderAction[]
toCoreProviderCapabilities(embedded: ProviderCapabilities): PaymentProviderCapabilities
```

Key mapping decisions:
- `canCancel` → `supportsCancel`, `canRefund` → `supportsRefund` (rename only, no behavior change)
- `url` field in core: set to `value` for `WEB_URL` descriptor, `null` otherwise
- `supportedMethods` in core: always `[]` (embedded has no direct equivalent)
- `expiresAt` and `metadata` from embedded `ProviderAction` are **not** propagated to core DTO
  (core is a portable DTO; callers needing those fields retain the original embedded action)

**tsconfig path alias added**

`@northflow/payment-orchestration-core` was added to:
- `tsconfig.base.json` (inherited by all packages)
- `apps/api/tsconfig.json` (overrides base paths; needs explicit entry)
- `apps/api/tsconfig.node.json` (used by test runner)

**Contract compatibility tests (Task 4)**

```text
apps/api/src/__tests__/payment-orchestration-core-contract-adapter.test.ts
```

14 tests across 4 suites. All pass. Covers:
- FakeGateway: qris, va, redirect, payment_code, immediate_success, immediate_failure
- Xendit (mocked): redirect, QR, VA
- Capability mapping: FakeGateway, Xendit sandbox, Manual
- Edge cases: null value, metadata/expiresAt not propagated

### What did NOT change in Phase 8B

- Runtime traffic: still 100% embedded AuraPoS API (`apps/api`)
- No DB schema additions
- `apps/payment-orchestration-service` remains a skeleton (no real use cases wired)
- Embedded `/api/payment-engine/...` routes remain the runtime source of truth
- FakeGateway scenarios unchanged
- Xendit sandbox adapter behavior unchanged
- Provider codes unchanged (`fake_gateway`, `xendit_sandbox`, `manual`)
- No provider-level refund/cancel
- No POS UI changes; no order adapter
- Legacy order payment flow untouched

---

## Phase 8C — Standalone DB Schema + Repository Boundary

### What changed in Phase 8C

**Standalone schema (Task 1)**

Six new `payment_orchestration_*` tables added to `shared/schema.ts` under a clearly
separated section. These tables are the persistence boundary for the standalone service.
No existing embedded payment engine tables were modified.

| Table | Purpose |
|-------|---------|
| `payment_orchestration_merchants` | Primary merchant identity (standalone, not tenant-bound) |
| `payment_orchestration_provider_accounts` | Links merchants to payment providers (credentials by reference only) |
| `payment_orchestration_intents` | Standalone payment intents with external AuraPoS refs |
| `payment_orchestration_transactions` | Individual payment/refund/void transactions |
| `payment_orchestration_provider_events` | Inbound provider webhooks (nullable merchantId until resolved) |
| `payment_orchestration_idempotency_keys` | Idempotency tracking for Phase 8D use cases |

Key design decisions:
- `merchant_id` is the primary owner identity — **not** `tenant_id`
- `external_tenant_id` exists only as a source-app reference (correlation, not ownership)
- `credentials_ref` is an opaque string pointing to env/secret-manager — raw API keys are never stored
- All partial unique indexes applied via Drizzle `uniqueIndex().where()` for correctness
- `payment_orchestration_provider_events.merchant_id` is nullable: real provider webhooks carry no merchant header; backfilled after `provider_reference` resolves to a known transaction

**Migration file (Task 5)**

Migration file generated:

```text
migrations/0022_payment_orchestration_standalone.sql
```

Contains only `CREATE TABLE IF NOT EXISTS` and `CREATE INDEX IF NOT EXISTS` statements
for the 6 new `payment_orchestration_*` tables. Does not touch any existing table.

To apply in a dev environment:
```bash
psql $DATABASE_URL -f migrations/0022_payment_orchestration_standalone.sql
# or let the server auto-apply on next startup via runMigrationAsync()
```

**Core repository port interfaces (Task 2)**

Six repository interfaces added to:

```text
packages/payment-orchestration-core/src/application/repositories.ts
```

Exported from `packages/payment-orchestration-core/src/index.ts`:

```ts
PaymentMerchantRepository
PaymentProviderAccountRepository
PaymentIntentRepository
PaymentTransactionRepository
PaymentProviderEventRepository
PaymentIdempotencyRepository
```

All interfaces use `merchantId` as primary owner identity. No `tenantId` in any interface.

**Service infrastructure repository skeletons (Task 3)**

Six skeleton classes created in:

```text
apps/payment-orchestration-service/src/infrastructure/repositories/
  DrizzlePaymentMerchantRepository.ts
  DrizzlePaymentProviderAccountRepository.ts
  DrizzlePaymentIntentRepository.ts
  DrizzlePaymentTransactionRepository.ts
  DrizzlePaymentProviderEventRepository.ts
  DrizzlePaymentIdempotencyRepository.ts
```

All implement the core port interfaces with full method signatures.
Methods throw `Error('Not implemented until Phase 8D')` — this is intentional.
Phase 8D will wire real Drizzle queries.

**DB row ↔ core DTO mappers (Task 4)**

Pure-function mappers in:

```text
apps/payment-orchestration-service/src/infrastructure/repositories/mappers.ts
```

```ts
mapMerchantRow(row: MerchantRow): PaymentMerchant
mapProviderAccountRow(row: ProviderAccountRow): PaymentProviderAccount
mapIntentRow(row: IntentRow): StandalonePaymentIntentDTO
mapTransactionRow(row: TransactionRow): StandalonePaymentTransactionDTO
mapProviderEventRow(row: ProviderEventRow): PaymentProviderEventDTO
mapIdempotencyKeyRow(row: IdempotencyKeyRow): PaymentIdempotencyKeyDTO
```

Rules enforced:
- snake_case DB → camelCase DTO
- `merchantId` preserved in all standalone DTOs
- No `tenantId` in any mapper output
- Nullable fields defaulted explicitly (`?? null`, `?? {}`)
- `credentialsRef` preserved as opaque string; never stripped

**Tests (Task 6)**

```text
apps/api/src/__tests__/payment-orchestration-schema-mappers.test.ts
```

56 tests across 7 suites. **All pass.** No live DB required.

Covers all 7 acceptance criteria from the prompt:
1. Merchant row → `PaymentMerchant` with `id`/`displayName`
2. Provider account row → no raw credentials exposed
3. Intent row → all 6 external ref fields mapped correctly
4. Transaction row → provider ref/action fields mapped safely
5. Provider event row → nullable `merchantId` supported before resolution
6. Idempotency key row → status/resource snapshot mapped correctly
7. No mapper output includes `tenantId`

### What did NOT change in Phase 8C

- No existing embedded `payment_engine_*`, `payment_intents`, `payment_transactions`,
  `payment_allocations`, or `payment_provider_events` tables modified
- No legacy order payment flow touched (`/api/orders/:id/payments`, `order_payments` table)
- `apps/payment-orchestration-service` routes remain 501 skeleton — no real use cases wired
- Embedded `/api/payment-engine/...` remains the runtime source of truth for all live payments
- FakeGateway behavior unchanged
- Xendit sandbox adapter behavior unchanged
- No provider-level refund/cancel implemented
- No POS UI changes; no order adapter; no split bill; no customer ledger
- No AuraPoS SDK consumption (Phase 8E)

---

## Phase 8D — Real Use-Case Wiring

### What changed in Phase 8D

Phase 8D upgrades the standalone service from a Phase 8A skeleton (all `/v1/...` routes → 501) to a fully functional payment microservice.

#### Foundation
- `src/config/env.ts` — added `dbUrl` (resolves `PAYMENT_ORCHESTRATION_DATABASE_URL` → `DATABASE_URL`), phase updated to `'8D'`
- `src/infrastructure/db.ts` — `createPoDb(dbUrl)`: Drizzle/postgres.js connection, pool max 3, `prepare: false` for NeonDB/PgBouncer compatibility
- `src/infrastructure/providers/StandaloneFakeGatewayProvider.ts` — 7-scenario FakeGateway (qris, redirect, va, payment_code, immediate_success, immediate_failure, pending_expiry)
- `src/infrastructure/providers/providerRegistry.ts` — registers FakeGateway in non-production; empty in production
- `src/middleware/auth.ts` — dual-header service token: `x-payment-orchestration-service-token` (primary) + `x-payment-engine-service-token` (compat alias)
- `src/middleware/errors.ts` — global Express error handler, sanitizes 5xx messages

#### Real Repository Implementations (6 files)
All 6 `Drizzle*Repository.ts` files now execute real Drizzle ORM queries against `payment_orchestration_*` tables. Uses `as any` cast at mapper call sites to bridge Drizzle's `unknown`-typed jsonb columns.

#### Use Cases (7 files)
| Class | Key rule |
|-------|----------|
| `CreateMerchant` | Idempotent: returns existing if `sourceApp+externalRef` match |
| `CreateProviderAccount` | Verifies merchant exists (404 if not) |
| `CreatePaymentIntent` | Validates positive integer amountDue; supports idempotency key |
| `CreateGatewayPayment` | Rejects overpayment (`OVERPAYMENT_REJECTED`); updates intent immediately on `succeeded` |
| `ConfirmFakeGatewayPayment` | Dev-only (`FORBIDDEN_IN_PRODUCTION` in production); idempotent on already-succeeded |
| `GetPaymentIntentStatus` | Returns `isTerminal`, `requiresAction`, `canRetryPayment` computed fields |
| `GetRefundability` | Sums succeeded incoming txns minus outgoing refund txns by `parentTransactionId` |
| `intentStatusHelper.ts` | `computeIntentStatus(amountDue, amountPaid)`: 0→requires_payment, partial→partially_paid, equal→paid, over→overpaid |

#### Routes
| Method | Path | Notes |
|--------|------|-------|
| POST | `/v1/merchants` | CreateMerchant |
| GET | `/v1/merchants/:id` | Direct repo read |
| POST | `/v1/merchants/:merchantId/provider-accounts` | CreateProviderAccount |
| GET | `/v1/merchants/:merchantId/provider-accounts/:id` | Direct repo read |
| POST | `/v1/payment-intents` | CreatePaymentIntent |
| GET | `/v1/payment-intents/:id/status` | GetPaymentIntentStatus |
| GET | `/v1/payment-intents/:id/refundability` | GetRefundability |
| POST | `/v1/payment-intents/:id/gateway-payments` | CreateGatewayPayment |
| POST | `/v1/dev/fake-gateway/transactions/:id/confirm` | ConfirmFakeGatewayPayment (non-prod only) |

Auth middleware (`createAuthMiddleware`) applied to all `/v1/...` routes. Health + version remain unprotected.

#### SDK
`@northflow/payment-orchestration-client-sdk` updated with 5 new methods: `createMerchant`, `getMerchant`, `createProviderAccount`, `getProviderAccount`, `confirmFakeGatewayPayment`. 6 new request/response types exported.

#### Tests
`apps/api/src/__tests__/payment-orchestration-service-fakegateway-flow.test.ts` — 14 scenarios, in-memory repos, real use-case classes. All 14 pass. Run:
```bash
npx tsx --tsconfig apps/api/tsconfig.node.json --test \
  apps/api/src/__tests__/payment-orchestration-service-fakegateway-flow.test.ts
```

### What did NOT change in Phase 8D
- Embedded AuraPoS payment engine (`apps/api/src/payment-engine/`) — still active
- Xendit/real provider wiring — Phase 8E+
- Webhook ingestion (`/v1/webhooks/:provider`) — still 501
- No Drizzle migrations auto-run at startup; run manually via `psql $DATABASE_URL -f migrations/...`
- No POS UI changes

---

## Next Phases

| Phase | Description |
|-------|-------------|
| 8D    | ✅ Full use-case wiring in payment-orchestration-service (this phase) |
| 8E    | AuraPoS consumes client SDK; embedded engine deprecated |
| 8F    | Remove migration bridge (`createAuraPosPaymentScope`); standalone-only |
