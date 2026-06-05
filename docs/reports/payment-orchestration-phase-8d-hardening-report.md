# Phase 8D Hardening Report

**Service:** `apps/payment-orchestration-service`  
**Phase:** 8D — FakeGateway End-to-End Hardening  
**Status:** ✅ Complete  
**Test results:** 20/20 unit (fakegateway-flow) + 13/13 HTTP/auth — all pass

---

## Tasks Completed

### T1: SDK/Service Response Contract Sync

Updated SDK types to match the rich shapes the service actually returns:

| Type | Before | After |
|---|---|---|
| `GatewayPaymentResponse` | Flat fields (transactionId, status, …) | `{ transaction, intent, idempotentReplay }` |
| `PaymentIntentStatusResponse` | Flat (intentId, status, …) | `{ intent, latestTransaction, isTerminal, requiresAction, canRetryPayment }` |
| `RefundabilityResponse` | `{ canRefund, refundableAmount, reason }` | `{ intentId, merchantId, totalRefundable, currency, transactions[] }` |
| `ProviderAccountResponse` | No `providerAccountRef` field | Includes `providerAccountRef: string \| null`; never `credentialsRef` |
| `ConfirmFakeGatewayPaymentRequest.merchantId` | Required `string` | Optional `string` (falls back to `config.merchantId`) |

New types added: `PaymentTransactionResponse`, `RefundableTransactionResponse`.

SDK `client.ts` updated:
- `injectMerchantId()` helper merges `config.merchantId` into POST bodies.
- `getPaymentIntentStatus()` / `getRefundability()` accept optional `{ merchantId }` option; fall back to config header.
- `confirmFakeGatewayPayment()` makes `input` optional.

---

### T2: Merchant ID Header Fallback

Created `apps/payment-orchestration-service/src/routes/utils.ts`:

```typescript
resolveMerchantId(req, bodyValue?)     // body field → x-payment-merchant-id header
resolveMerchantIdQuery(req)            // ?merchantId= query → x-payment-merchant-id header
```

Applied to all routes:

| Route | Resolution |
|---|---|
| `POST /v1/payment-intents` | body → header |
| `GET /v1/payment-intents/:id/status` | query → header |
| `GET /v1/payment-intents/:id/refundability` | query → header |
| `POST /v1/payment-intents/:id/gateway-payments` | body → header |
| `POST /v1/dev/fake-gateway/transactions/:id/confirm` | body → header |

---

### T3: Preserve `providerAccountRef`

- `mappers.ts` (`mapProviderAccountRow`): reads `row.providerAccountRef` → `pa.providerAccountRef`.
- `providerAccounts.ts` (POST + GET): returns `providerAccountRef` from DTO; `credentialsRef` **never** appears in any response.

---

### T4: Provider Account Validation in `CreateGatewayPayment`

Added `providerAccountRepo: PaymentProviderAccountRepository` to constructor (7th position).

Validation logic:
- **If `providerAccountId` provided:** must exist, status=`active`, `provider` must match — otherwise 404/422.
- **If not provided:** `fake_gateway` in non-production allowed (dev convenience). Any other provider, or `fake_gateway` in production → `PROVIDER_ACCOUNT_REQUIRED` 422.

Error codes: `PROVIDER_ACCOUNT_NOT_FOUND`, `PROVIDER_ACCOUNT_DISABLED`, `PROVIDER_ACCOUNT_PROVIDER_MISMATCH`, `PROVIDER_ACCOUNT_REQUIRED`.

---

### T5: Idempotency in `CreateGatewayPayment`

Added `idempotencyRepo: PaymentIdempotencyRepository` to constructor (8th position).  
Scope: `create_gateway_payment`.  
Hash: SHA-256 of `JSON.stringify({ merchantId, intentId, provider, method, amount, providerAccountId, metadata })`.

Flow:
1. If `idempotencyKey` present → check existing record.
2. `status=processing` → throw `IDEMPOTENCY_IN_PROGRESS` (409).
3. `status=completed`, hash mismatch → throw `IDEMPOTENCY_CONFLICT` (409).
4. `status=completed`, hash match → return cached `{ transaction, intent, idempotentReplay: true }`.
5. `status=failed` → allow retry (fall through).
6. Reserve key before provider call.
7. On provider error → `markFailed`.
8. On success → `markCompleted` with `{ transaction, intent }` snapshot.

Route returns **200** on replay, **201** on new transaction.

---

### T6: Harden `ConfirmFakeGatewayPayment`

- **Fresh reload** of transaction before checking status (reduce TOCTOU window).
- **Conditional guard:** only `requires_action` or `pending` may be confirmed → `INVALID_TRANSACTION_STATUS` 422.
- **Idempotent replay:** already `succeeded` → reload intent, return `alreadyConfirmed: true` without re-applying totals.
- **Overpayment guard at confirmation time:** `tx.amount > intent.amountRemaining` → `OVERPAYMENT_REJECTED` 422 (fresh read of intent before update).

---

### T7: HTTP/Auth Integration Tests

Created `apps/api/src/__tests__/payment-orchestration-service-http-auth.test.ts`.

Real HTTP server (port 0, in-memory repos) — 13 scenarios:

| Scenario | Description |
|---|---|
| A01–A02 | Health/version unprotected |
| A03–A04 | Missing/wrong token → 401 |
| A05 | Correct primary token → 201 |
| A06 | Compat header `x-payment-engine-service-token` → success |
| A07–A10 | `x-payment-merchant-id` header fallback for all routes |
| A11–A12 | `providerAccountRef` present, `credentialsRef` absent |
| A13 | No `tenantId` or AuraPoS internals in responses |

---

### T8: Webhook Wording Fix

Updated `apps/payment-orchestration-service/src/routes/webhooks.ts`:
- Changed route response phase from `8D` to `8E` (webhook wiring is Phase 8E work).
- Updated comment: `TODO(Phase 8E): wire to HandlePaymentProviderWebhook use case.`

---

### T9: Documentation

- This hardening report: `docs/reports/phase-8d-hardening-report.md`
- Smoke doc updated: `docs/payment-orchestration-service-smoke-test.md`

---

## Constructor Signature Change Summary

```typescript
// CreateGatewayPayment — BEFORE (Phase 8D initial)
new CreateGatewayPayment(merchantRepo, intentRepo, transactionRepo, providerRegistry)

// CreateGatewayPayment — AFTER (Phase 8D Hardening)
new CreateGatewayPayment(
  merchantRepo,
  intentRepo,
  transactionRepo,
  providerRegistry,
  providerAccountRepo,   // NEW: T4 provider account validation
  idempotencyRepo,       // NEW: T5 idempotency guard
  nodeEnv,               // NEW: T4 fake_gateway dev convenience flag
)
```

`container.ts` updated accordingly.

---

## Test Coverage Summary

**Fakegateway flow (use-case level) — 20/20 pass:**
- S01–S05: merchant + provider account + intent creation
- S06–S08: gateway payment (QRIS, immediate_success, overpayment)
- S09–S10: confirm + idempotent confirm
- S11: status read model
- S12: refundability
- S13: production guard
- S14: immediate_failure
- **S15: idempotency replay** ← new
- **S16: idempotency conflict** ← new
- **S17/S17b: provider account validation** ← new
- **S18: overpayment at confirm** ← new
- **S19: invalid tx status at confirm** ← new

**HTTP/Auth (real HTTP) — 13/13 pass:**
- A01–A13 as listed above.

---

## Files Changed

| File | Change |
|---|---|
| `packages/payment-orchestration-core/src/domain/PaymentProviderAccount.ts` | Added `providerAccountRef?: string \| null` |
| `packages/payment-orchestration-client-sdk/src/types.ts` | Rich response shapes, optional merchantId |
| `packages/payment-orchestration-client-sdk/src/client.ts` | merchantId injection, options overloads |
| `packages/payment-orchestration-client-sdk/src/index.ts` | Export new types |
| `apps/payment-orchestration-service/src/routes/utils.ts` | New: resolveMerchantId helpers |
| `apps/payment-orchestration-service/src/routes/intents.ts` | Header fallback, rich response |
| `apps/payment-orchestration-service/src/routes/devFakeGateway.ts` | Header fallback, rich response |
| `apps/payment-orchestration-service/src/routes/providerAccounts.ts` | providerAccountRef exposed, credentialsRef hidden |
| `apps/payment-orchestration-service/src/routes/webhooks.ts` | Phase 8E wording |
| `apps/payment-orchestration-service/src/infrastructure/repositories/mappers.ts` | providerAccountRef from row |
| `apps/payment-orchestration-service/src/application/use-cases/CreateGatewayPayment.ts` | 7-arg constructor, T4+T5 |
| `apps/payment-orchestration-service/src/application/use-cases/ConfirmFakeGatewayPayment.ts` | T6 hardening |
| `apps/payment-orchestration-service/src/container.ts` | Updated DI wiring |
| `apps/api/src/__tests__/payment-orchestration-service-fakegateway-flow.test.ts` | Constructor updates + S15–S19 |
| `apps/api/src/__tests__/payment-orchestration-service-http-auth.test.ts` | New: A01–A13 |
