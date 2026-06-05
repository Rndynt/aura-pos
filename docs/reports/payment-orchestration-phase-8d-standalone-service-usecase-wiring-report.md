# Phase 8D Report: Standalone Service Use-Case Wiring

**Service**: `apps/payment-orchestration-service`
**Phase**: 8D — Real Drizzle repositories, use cases, HTTP routes, provider registry, service-token auth
**Date**: June 2026
**Status**: ✅ COMPLETE

---

## Summary

Phase 8D upgrades `apps/payment-orchestration-service` from a Phase 8A skeleton (all routes returned 501) to a fully wired standalone microservice with:
- Real Drizzle ORM repositories for all 6 payment orchestration tables
- 7 use-case classes implementing the full payment lifecycle
- HTTP routes for merchants, provider accounts, payment intents, and FakeGateway dev confirm
- Service-token authentication middleware
- Standalone FakeGateway provider (isolated, no `@pos/domain` dep)
- 14 integration tests (in-memory repos, real use cases)
- SDK updated with 5 new methods and Phase 8D request/response types

---

## Files Changed

### Foundation (T001)
| File | Status |
|------|--------|
| `src/config/env.ts` | ✅ Updated — added `dbUrl`, `phase: '8D'` |
| `src/infrastructure/db.ts` | ✅ Created — `createPoDb(dbUrl)` Drizzle connection |
| `src/infrastructure/providers/StandaloneFakeGatewayProvider.ts` | ✅ Created |
| `src/infrastructure/providers/providerRegistry.ts` | ✅ Created |
| `src/middleware/auth.ts` | ✅ Created — dual-header service token auth |
| `src/middleware/errors.ts` | ✅ Created — global error handler |

### Repositories (T002)
| File | Status |
|------|--------|
| `src/infrastructure/repositories/DrizzlePaymentMerchantRepository.ts` | ✅ Real implementation |
| `src/infrastructure/repositories/DrizzlePaymentProviderAccountRepository.ts` | ✅ Real implementation |
| `src/infrastructure/repositories/DrizzlePaymentIntentRepository.ts` | ✅ Real implementation |
| `src/infrastructure/repositories/DrizzlePaymentTransactionRepository.ts` | ✅ Real implementation |
| `src/infrastructure/repositories/DrizzlePaymentProviderEventRepository.ts` | ✅ Real implementation |
| `src/infrastructure/repositories/DrizzlePaymentIdempotencyRepository.ts` | ✅ Real implementation |

### Use Cases (T003)
| File | Status |
|------|--------|
| `src/application/use-cases/CreateMerchant.ts` | ✅ Idempotent by sourceApp+externalRef |
| `src/application/use-cases/CreateProviderAccount.ts` | ✅ Verifies merchant exists |
| `src/application/use-cases/CreatePaymentIntent.ts` | ✅ With idempotency key support |
| `src/application/use-cases/CreateGatewayPayment.ts` | ✅ Calls provider, creates tx, updates intent |
| `src/application/use-cases/ConfirmFakeGatewayPayment.ts` | ✅ Dev-only, idempotent |
| `src/application/use-cases/GetPaymentIntentStatus.ts` | ✅ Read model with isTerminal/requiresAction |
| `src/application/use-cases/GetRefundability.ts` | ✅ Sum-based refundability calculation |
| `src/application/use-cases/intentStatusHelper.ts` | ✅ `computeIntentStatus()` shared helper |

### Routes + Wiring (T004)
| File | Status |
|------|--------|
| `src/routes/merchants.ts` | ✅ POST /v1/merchants, GET /v1/merchants/:id |
| `src/routes/providerAccounts.ts` | ✅ POST/GET /v1/merchants/:merchantId/provider-accounts |
| `src/routes/devFakeGateway.ts` | ✅ POST /v1/dev/fake-gateway/transactions/:id/confirm |
| `src/routes/intents.ts` | ✅ All 4 intent routes: real implementation |
| `src/container.ts` | ✅ Full DI wiring |
| `src/app.ts` | ✅ Auth middleware, all routes, error handler |
| `src/index.ts` | ✅ Updated startup log |

### SDK (T005)
| File | Status |
|------|--------|
| `packages/payment-orchestration-client-sdk/src/client.ts` | ✅ 5 new methods |
| `packages/payment-orchestration-client-sdk/src/types.ts` | ✅ 6 new types |
| `packages/payment-orchestration-client-sdk/src/index.ts` | ✅ New type exports |

### Tests + Docs (T006)
| File | Status |
|------|--------|
| `apps/api/src/__tests__/payment-orchestration-service-fakegateway-flow.test.ts` | ✅ 14 scenarios |
| `docs/payment-orchestration-standalone-fakegateway-smoke.md` | ✅ Curl guide |
| `docs/reports/payment-orchestration-phase-8d-standalone-service-usecase-wiring-report.md` | ✅ This file |

---

## API Routes (Phase 8D)

### Unprotected
| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Health check |
| GET | `/version` | Version info |

### Protected (service token required)
| Method | Path | Use Case |
|--------|------|----------|
| POST | `/v1/merchants` | CreateMerchant |
| GET | `/v1/merchants/:id` | — |
| POST | `/v1/merchants/:merchantId/provider-accounts` | CreateProviderAccount |
| GET | `/v1/merchants/:merchantId/provider-accounts/:id` | — |
| POST | `/v1/payment-intents` | CreatePaymentIntent |
| GET | `/v1/payment-intents/:id/status` | GetPaymentIntentStatus |
| GET | `/v1/payment-intents/:id/refundability` | GetRefundability |
| POST | `/v1/payment-intents/:id/gateway-payments` | CreateGatewayPayment |

### Dev/test only (non-production)
| Method | Path | Use Case |
|--------|------|----------|
| POST | `/v1/dev/fake-gateway/transactions/:id/confirm` | ConfirmFakeGatewayPayment |

---

## Intent Status State Machine

```
requires_payment
    │
    ├── gateway-payment (immediate_success) ──────────► paid
    │
    ├── gateway-payment (qris/redirect/va/etc.)
    │       │
    │       └── transaction: requires_action
    │               │
    │               └── confirm (FakeGateway dev) ──► paid
    │
    ├── gateway-payment (immediate_failure)
    │       │
    │       └── transaction: failed → stays requires_payment
    │
    └── allow_partial=true ─────────────────────────► partially_paid ──► paid
```

### computeIntentStatus logic
```
amountPaid = 0                   → requires_payment
0 < amountPaid < amountDue      → partially_paid
amountPaid = amountDue          → paid
amountPaid > amountDue          → overpaid (prevented by OVERPAYMENT_REJECTED)
```

---

## FakeGateway Scenarios (metadata.scenario)

| scenario | TX status | Action URL | QR string |
|----------|-----------|------------|-----------|
| `qris` (default) | requires_action | null | ✅ |
| `immediate_success` | succeeded | null | null |
| `immediate_failure` | failed | null | null |
| `redirect` | requires_action | ✅ | null |
| `va` | requires_action | null | null |
| `payment_code` | requires_action | null | null |
| `pending_expiry` | requires_action | ✅ + expiresAt | null |

---

## Auth Middleware

Header names accepted (both resolve to the same `serviceToken`):
- `x-payment-orchestration-service-token` (primary)
- `x-payment-engine-service-token` (backwards-compat alias)

Env var resolution:
- `PAYMENT_ORCHESTRATION_SERVICE_TOKEN` → `PAYMENT_ENGINE_SERVICE_TOKEN` (alias)

Behavior when token empty in production → 503 (service misconfigured).
Behavior when token empty in non-production → 401.

---

## Test Coverage (14 scenarios)

| # | Scenario | Result |
|---|----------|--------|
| S01 | CreateMerchant — new merchant | id starts with `merchant_` |
| S02 | CreateMerchant — idempotent same sourceApp+externalRef | returns same id, created=false |
| S03 | CreateProviderAccount — merchant not found | throws MERCHANT_NOT_FOUND |
| S04 | CreateProviderAccount — creates under existing merchant | id starts with `pa_` |
| S05 | CreatePaymentIntent — correct initial state | status=requires_payment, amountPaid=0 |
| S06 | CreateGatewayPayment QRIS — requires_action, intent unchanged | tx.status=requires_action |
| S07 | CreateGatewayPayment immediate_success — intent paid | tx.status=succeeded, intent.status=paid |
| S08 | CreateGatewayPayment overpayment rejected | throws OVERPAYMENT_REJECTED |
| S09 | ConfirmFakeGatewayPayment — QRIS → paid | intent.status=paid after confirm |
| S10 | ConfirmFakeGatewayPayment — idempotent | alreadyConfirmed=true on second call |
| S11 | GetPaymentIntentStatus — correct read model | requiresAction/isTerminal fields |
| S12 | GetRefundability — correct refundable amount | totalRefundable=80000 |
| S13 | ConfirmFakeGateway blocked in production | throws FORBIDDEN_IN_PRODUCTION |
| S14 | immediate_failure — intent stays requires_payment | tx.failureReason=INSUFFICIENT_FUNDS |

---

## What's NOT in Phase 8D

- Webhook ingestion (Phase 8E): `/v1/webhooks/:provider` returns 501
- Real Xendit/Stripe provider wiring (Phase 8E+)
- Drizzle migrations for payment_orchestration_* tables (run manually)
- Background job reconciliation (Phase 8F+)
- Multi-currency FX (not planned)

---

## Phase 8E Preview

Phase 8E will add:
- Xendit webhook signature verification
- `ProcessWebhookEvent` use case
- Automatic intent status sync from real provider callbacks
- Retry queue for failed webhook processing
