# Phase 8D.1 + 8E — Webhook Provider Wiring Report

**Date:** 2025-11-29 (session) / June 2026 (execution)  
**Phase:** 8D.1 (Atomic Confirm + Failed-Key Policy) + 8E (Standalone Webhook Ingestion)  
**Status:** ✅ Implemented, type-checked, tested

---

## Summary

This phase hardens the FakeGateway payment confirm flow with an atomic conditional UPDATE, enforces a strict failed-idempotency-key policy, and implements standalone webhook ingestion for Phase 8E.

---

## Part A — Phase 8D.1: Hardening

### A1: Atomic Confirm (TOCTOU Fix)

**Problem:** `ConfirmFakeGatewayPayment` used read-before-write pattern. Two concurrent confirms could both pass the status check and both call `updateStatus`, double-crediting the intent.

**Solution:**

1. Added `markSucceededIfConfirmable(input)` to `PaymentTransactionRepository` interface in `packages/payment-orchestration-core/src/application/repositories.ts`.
2. Exported `MarkSucceededIfConfirmableInput` and `MarkSucceededIfConfirmableResult` from core `index.ts`.
3. Implemented in `DrizzlePaymentTransactionRepository` as a conditional `UPDATE … WHERE status IN ('requires_action','pending') RETURNING *`.
4. Updated `ConfirmFakeGatewayPayment` to use atomic method:
   - Pre-validate status and overpayment guard before calling atomic update.
   - If `changed === true` → update intent totals (only this caller does it).
   - If `changed === false` → reload TX; if succeeded → `alreadyConfirmed=true`; else → `INVALID_TRANSACTION_STATUS`.

**Files changed:**
- `packages/payment-orchestration-core/src/application/repositories.ts` — interface + new types
- `packages/payment-orchestration-core/src/index.ts` — exports
- `apps/payment-orchestration-service/src/infrastructure/repositories/DrizzlePaymentTransactionRepository.ts` — implementation
- `apps/payment-orchestration-service/src/application/use-cases/ConfirmFakeGatewayPayment.ts` — use case rewrite

### A2: Failed-Key Policy

**Problem:** `CreateGatewayPayment` fell through for `status === 'failed'` idempotency keys, allowing the same failing request to be retried with the same key (masking root causes).

**Solution:** Changed to throw `IDEMPOTENCY_PREVIOUSLY_FAILED` (409) when existing key has `status === 'failed'`. Client must supply a new idempotency key for retry.

**Files changed:**
- `apps/payment-orchestration-service/src/application/use-cases/CreateGatewayPayment.ts` — branch logic

---

## Part B — Phase 8E: Standalone Webhook Ingestion

### B1: FakeGatewayWebhookHandler

New file: `apps/payment-orchestration-service/src/infrastructure/providers/FakeGatewayWebhookHandler.ts`

- Parses and validates FakeGateway webhook payload (`event_id`, `event_type`, `status`, `provider_reference`).
- Optional HMAC SHA-256 signature verification via `x-fakegateway-signature` header.
- Secret source: `PAYMENT_ORCHESTRATION_FAKEGATEWAY_WEBHOOK_SECRET` env var.
- Non-production without secret: unsigned accepted (dev convenience).
- Production without secret: throws `WEBHOOK_SECRET_REQUIRED` (403).
- Invalid signature: throws `WEBHOOK_SIGNATURE_INVALID` (401).
- Uses `timingSafeEqual` for constant-time HMAC comparison.

### B2: HandleProviderWebhook Use Case

New file: `apps/payment-orchestration-service/src/application/use-cases/HandleProviderWebhook.ts`

**Flow:**
1. Validate provider (only `fake_gateway` supported in Phase 8E).
2. Parse/verify event via `FakeGatewayWebhookHandler`.
3. Check duplicate by `(provider, providerEventId)` via `findByProviderEventId`.
4. If already processed → idempotent return without mutating TX.
5. Reserve provider event row (or reuse existing).
6. Resolve TX by `(provider, providerReference)`.
7. Resolve intent from TX.
8. Assign merchantId to event.
9. Apply status mutation:
   - `succeeded` → `markSucceededIfConfirmable` (atomic) + update intent totals.
   - `failed/cancelled/expired` → `updateStatus` if not terminal.
   - `ignored` → no TX mutation.
10. Mark event processed or failed.
11. Return read model.

**Security:** Merchant resolved from providerReference → TX → intent (not from request headers).

### B3: Webhook Route (Phase 8E Upgrade)

Updated: `apps/payment-orchestration-service/src/routes/webhooks.ts`

- `POST /v1/webhooks/:provider` wired to `HandleProviderWebhook.execute()`.
- Passes raw body Buffer when available (for HMAC), falls back to parsed body.
- Returns `200` with processing result or `422` for failed events.

### B4: Auth Bypass + RawBody Capture

Updated: `apps/payment-orchestration-service/src/app.ts`

- `express.json({ verify: (req, _res, buf) => { req.rawBody = buf; } })` captures raw bytes for HMAC.
- `app.use('/v1/webhooks', createWebhooksRouter(container))` registered **BEFORE** `app.use('/v1', auth)`.
- Guarantees webhook routes bypass service-token auth.

### B5: Container Wiring

Updated: `apps/payment-orchestration-service/src/container.ts`

- `FakeGatewayWebhookHandler` instantiated with `PAYMENT_ORCHESTRATION_FAKEGATEWAY_WEBHOOK_SECRET` env.
- `HandleProviderWebhook` added to `ServiceUseCases` interface and `createContainer`.

---

## Tests

### Atomic Confirm Tests (`payment-orchestration-atomic-confirm.test.ts`)

| ID   | Scenario |
|------|----------|
| AC01 | `markSucceededIfConfirmable` transitions `requires_action` → `succeeded` |
| AC02 | `markSucceededIfConfirmable` transitions `pending` → `succeeded` |
| AC03 | `markSucceededIfConfirmable` returns `changed=false` for already-succeeded TX |
| AC04 | `markSucceededIfConfirmable` returns `changed=false` for `failed`/`cancelled` |
| AC05 | `ConfirmFakeGatewayPayment` idempotent on already-succeeded TX |
| AC06 | No double-credit on concurrent confirms (simulated with `Promise.allSettled`) |
| AC07 | Rejects `failed` TX with `INVALID_TRANSACTION_STATUS` (422) |
| AC08 | Throws `IDEMPOTENCY_PREVIOUSLY_FAILED` (409) for pre-failed key |
| AC09 | Idempotency replay still works for `completed` key |
| AC10 | Overpayment guard blocks confirm when `tx.amount > amountRemaining` |

### Standalone Webhook Tests (`payment-orchestration-standalone-webhook.test.ts`)

| ID   | Scenario |
|------|----------|
| WH01 | `payment.succeeded` → TX succeeded, intent paid |
| WH02 | `payment.failed` → TX failed, intent amountPaid unchanged |
| WH03 | `payment.cancelled` → TX cancelled |
| WH04 | `payment.expired` → TX expired |
| WH05 | Idempotent replay — same `event_id` → `idempotentReplay=true`, no double-credit |
| WH06 | Unknown `providerReference` → event marked failed, TX null |
| WH07 | Unsupported provider → `WEBHOOK_PROVIDER_NOT_SUPPORTED` (400) |
| WH08 | Invalid payload → `INVALID_WEBHOOK_PAYLOAD` (400) |
| WH09 | Valid HMAC signature accepted |
| WH10 | Invalid HMAC signature rejected (`WEBHOOK_SIGNATURE_INVALID` 401) |
| WH11 | Production mode rejects unsigned webhook (`WEBHOOK_SECRET_REQUIRED` 403) |
| WH12 | Already-succeeded TX → processed, no re-credit |

---

## Commands Run

| Command | Status | Notes |
|---|:---:|---|
| `npm run check` | not run | Root turbo type-check; individual package checks run instead (see below) |
| `pnpm --filter @northflow/payment-orchestration-core type-check` | ✅ pass | 0 errors |
| `pnpm --filter @northflow/payment-orchestration-service type-check` | ✅ pass | 0 errors |
| `pnpm --filter @northflow/payment-orchestration-client-sdk type-check` | ✅ pass | 0 errors |
| atomic confirm test (`payment-orchestration-atomic-confirm.test.ts`) | ✅ pass | 11/11 pass |
| standalone webhook test (`payment-orchestration-standalone-webhook.test.ts`) | ✅ pass | 13/13 pass |
| service HTTP/auth test (`payment-orchestration-service-http-auth.test.ts`) | ✅ pass | 13/13 pass |
| schema mapper test (`payment-orchestration-schema-mappers.test.ts`) | ✅ pass | 56/56 pass |
| core contract adapter test (`payment-orchestration-core-contract-adapter.test.ts`) | ✅ pass | 14/14 pass |
| xendit gateway integration test (`payment-xendit-gateway-integration.test.ts`) | ✅ pass | 11/11 pass — no live provider call |
| reconcile use case test (`payment-orchestration-reconcile.test.ts`) | ✅ pass | 5/5 pass — Phase 8E hardening |
| webhook route auth bypass HTTP test (`payment-orchestration-webhook-route-auth-bypass.test.ts`) | ✅ pass | 7/7 pass — Phase 8E hardening |

> Note: `npm run check` (Turborepo root) was not run because the full monorepo check includes the Next.js `apps/web` build which is unrelated to this phase. Individual payment-orchestration package type-checks were run and all pass.

---

## Updated Test Infrastructure

- `payment-orchestration-service-fakegateway-flow.test.ts` — added `markSucceededIfConfirmable` to `InMemoryTransactionRepo`.
- `payment-orchestration-service-http-auth.test.ts` — added `markSucceededIfConfirmable` to `InMemoryTransactionRepo`, fixed `StubProviderEventRepo` to implement correct interface, added `HandleProviderWebhook` to test container.

---

## Guardrails Respected

- ✅ No changes to `/api/payment-engine/` (legacy).
- ✅ No changes to `packages/application/payments/` (legacy).
- ✅ No changes to embedded FakeGateway/Xendit in main API.
- ✅ No AuraPoS tenantId anywhere in webhook flow.
- ✅ No import from `apps/api/src/container.ts`.
- ✅ `PAYMENT_ORCHESTRATION_FAKEGATEWAY_WEBHOOK_SECRET` env configures HMAC; no secrets hardcoded.

---

## Environment Variable

```
PAYMENT_ORCHESTRATION_FAKEGATEWAY_WEBHOOK_SECRET=<shared-secret>
```

Optional in non-production (unsigned webhooks accepted for dev convenience).  
**Required in production** — omitting it will cause all webhook requests to fail with `WEBHOOK_SECRET_REQUIRED` (403).

---

## Architecture Diagram

```
POST /v1/webhooks/fake_gateway
  │
  ├── [No service-token required — registered before auth middleware]
  │
  ├── webhooks.ts router
  │     ├── Read req.rawBody (Buffer captured by express.json verify)
  │     └── HandleProviderWebhook.execute()
  │           ├── FakeGatewayWebhookHandler.parse() — signature + payload validation
  │           ├── providerEventRepo.findByProviderEventId() — duplicate check
  │           ├── providerEventRepo.reserveEvent() — idempotency reserve
  │           ├── transactionRepo.findByProviderReference() — merchant resolution
  │           ├── intentRepo.findById() — intent resolution
  │           ├── transactionRepo.markSucceededIfConfirmable() — atomic update (Phase 8D.1)
  │           ├── intentRepo.updateTotals() / updateStatus() — if changed
  │           └── providerEventRepo.markProcessed() / markFailed()
  │
  └── Response: { ok, eventId, processingStatus, transaction, intent }
```
