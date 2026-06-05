# Payment Engine Phase 7A — Hardening Report

> **Date:** 2026-06-05
> **Phase:** 7A — Xendit Sandbox Provider Hardening
> **Status:** ✅ Complete

---

## Executive Summary

Phase 7A hardens the Xendit sandbox payment provider integration across eight axes:
provider registration policy, integration test coverage, smoke tooling correctness,
`tenantId` backfill for webhook events, per-attempt `reference_id` collision prevention,
status/event policy review, and documentation accuracy. No production Xendit credentials
are introduced; all changes are sandbox-scoped.

---

## Tasks Completed

### Task 1 — Provider Registration Policy (CreateGatewayPayment)

**File:** `packages/application/payments/CreateGatewayPayment.ts`

**Problem:** The static `ALLOWED_GATEWAY_PROVIDERS = Set(['fake_gateway'])` hardcoded
allowlist meant `xendit_sandbox` could never be used even when properly registered,
and also failed to distinguish between "unrecognized code" and "recognized but not
registered" errors.

**Fix:**
- Renamed constant to `GATEWAY_PROVIDER_CODES = Set(['fake_gateway', 'xendit_sandbox'])`.
- Added explicit `manual` rejection first — `manual` is not a gateway provider.
- Added `GATEWAY_PROVIDER_CODES.has(provider)` check — rejects unrecognized codes.
- Added `providerRegistry.has(provider)` check — rejects recognized-but-not-configured providers (e.g., `xendit_sandbox` without `XENDIT_SANDBOX_ENABLED=true`).

**Policy table:**

| input.provider | registry has? | Outcome |
|----------------|---------------|---------|
| `manual` | any | `UNSUPPORTED_PROVIDER` — explicit rejection |
| `unknown_xyz` | any | `UNSUPPORTED_PROVIDER` — not in allowlist |
| `xendit_sandbox` | No | `UNSUPPORTED_PROVIDER` — not registered |
| `xendit_sandbox` | Yes | proceeds to createPayment call |
| `fake_gateway` | Yes | proceeds (unchanged behavior) |

---

### Task 2 — Integration Test Coverage

**File:** `apps/api/src/__tests__/payment-xendit-gateway-integration.test.ts` (new)

11 tests covering the full CreateGatewayPayment → XenditProvider path:

| # | Test |
|---|------|
| 1 | xendit_sandbox creates `requires_action` tx when registered |
| 2 | Response includes `providerReference` from `payment_request_id` |
| 3 | Response includes `providerActions` with WEB_URL descriptor |
| 4 | `providerPaymentUrl` derived from WEB_URL action |
| 5 | `providerQrString` derived from QR_STRING action |
| 6 | `fake_gateway` path still passes (regression) |
| 7 | `xendit_sandbox` returns `UNSUPPORTED_PROVIDER` when not registered |
| 8 | `manual` provider is rejected by gateway payment flow |
| 9 | Unknown provider code is rejected safely |
| 10 | Two attempts with different idempotency keys use different `reference_id` values |
| 11 | Idempotency replay returns existing tx without new Xendit API call |

All tests use mocked HTTP (`FetchFn` injection) — no real Xendit network calls.

---

### Task 3 — Smoke Script Correctness

**File:** `apps/api/src/scripts/payment-engine/xendit-sandbox-smoke.ts`

Four defects fixed:

| Defect | Before | After |
|--------|--------|-------|
| Missing service token guard | No check | `SERVICE_TOKEN.length < 32 → process.exit(1)` |
| Missing service token in headers | `x-tenant-id` only | Added `x-payment-engine-service-token` |
| Create intent body was camelCase | `payableType`, `payableId`, `amount` | `payable_type`, `payable_id`, `amount_due` |
| Gateway route was singular | `/gateway-payment` | `/gateway-payments` (plural) |
| Response not unwrapped | Raw `res.json()` | Unwrap `{ success, data }` envelope |

---

### Task 4 — Smoke Documentation Correctness

**File:** `docs/payment-engine-xendit-sandbox-smoke.md`

Defects fixed to match the implementation:

| Section | Before | After |
|---------|--------|-------|
| Prerequisites | No service token requirement | Added `PAYMENT_ENGINE_SERVICE_TOKEN` env var with guidance |
| All curl examples | No `x-payment-engine-service-token` header | Added service token header to all payment-engine routes |
| Create intent body | `payableType`, `payableId`, `amount` | `payable_type`, `payable_id`, `amount_due` |
| Create intent example | No response envelope shown | Shows full `{ success, data }` envelope |
| Gateway route | `/gateway-payment` | `/gateway-payments` |
| Step 8 note | No auth distinction | Added note: webhook uses `x-callback-token`, others use service token |
| All GET routes | No service token | Added service token header |

**Auth contract clarified:**
- All `/api/payment-engine/intents/...` routes: `x-payment-engine-service-token`
- Webhook route `/api/payment-engine/webhooks/xendit_sandbox`: `x-callback-token` (Xendit-provided)

---

### Task 5 — Backfill `tenantId` on Provider Events After Webhook Tenant Resolution

**Files:**
- `packages/infrastructure/repositories/payments/PaymentProviderEventRepository.ts`
- `packages/application/payments/HandlePaymentProviderWebhook.ts`

**Problem:** Real provider webhooks (Xendit) do not carry an `x-tenant-id` header.
Provider events were inserted with `tenantId = null`, leaving them invisible to
tenant-scoped stale reconciliation queries (`listStalePendingEvents` with `tenantId` filter).

**Fix — Repository:**
Added `assignTenant(id, tenantId, tx?)` to `IPaymentProviderEventRepository` interface
and `PaymentProviderEventRepository` implementation.

Safety rules:
- No-op if `event.tenantId === tenantId` (already assigned, same tenant).
- Throws `TENANT_MISMATCH` if `event.tenantId` is non-null and conflicts with the incoming `tenantId`.
- Uses `UPDATE ... WHERE tenant_id IS NULL` for concurrent-safety (prevents cross-tenant clobber from racing requests).
- On lost UPDATE race: re-reads row and returns if same tenant won; throws if different tenant won.

**Fix — Webhook Handler (Step 5b):**
Added a backfill step in `HandlePaymentProviderWebhook.execute()` between Step 5 (tenant
resolution) and Step 6 (DB transaction):

```
// Step 5b: Backfill event tenantId after tenant resolution
if (resolvedTenantId && !event.tenantId) {
  await this.eventRepo.assignTenant(event.id, resolvedTenantId);
}
```

Placed **outside** the DB transaction deliberately: if the mutation transaction (Step 6)
rolls back, the event stays `status='pending'` with `tenantId` set — the stale recovery
job can repick it with the correct tenant scope on its next scan.

Errors are caught and logged as warnings (non-fatal): missing `tenantId` is observable
via global stale event scan and auditable in `event.errorMessage`.

---

### Task 6 — Per-Attempt `reference_id` Collision Prevention

**Files:**
- `packages/application/payments/CreateGatewayPayment.ts`
- `packages/infrastructure/payments/providers/XenditProvider.ts`

**Problem:** `reference_id` was computed as `aurapos-${paymentIntentId}` — constant for
all gateway payment attempts on the same intent. If a user retried after a failed Xendit
call, Xendit would reject the second request with a reference_id collision error.

**Fix — CreateGatewayPayment (Step 5):**
Generates `providerRequestId` before calling `createPayment`:

```ts
const providerRequestId = `aurapos-${input.paymentIntentId}-${input.idempotencyKey ?? randomUUID()}`;
```

Source order: caller-supplied idempotency key (stable for retries, unique across attempts)
→ fresh UUID (when no idempotency key provided). Passed via `metadata.provider_request_id`.

**Fix — XenditProvider:**
Reads `metadata.provider_request_id` as `reference_id`:

```ts
const referenceId =
  typeof input.metadata?.['provider_request_id'] === 'string'
    ? input.metadata['provider_request_id']
    : `aurapos-${input.paymentIntentId}-${randomUUID().slice(0, 8)}`;
```

Fallback generates a unique suffix for direct provider calls (e.g., unit tests) that
don't go through `CreateGatewayPayment`.

---

### Task 7 — Status and Event Policy Review

**Review scope:** `XenditProvider.createPayment()` status mapping and `parseWebhook()` event routing.

**Findings — `createPayment` status mapping:**

| Xendit status | Phase 7A action | Assessment |
|---------------|-----------------|------------|
| `REQUIRES_ACTION` | `requires_action` + map actions | ✅ Correct |
| `SUCCEEDED` | `succeeded` + `succeededImmediately: true` | ✅ Correct |
| `PENDING` | `pending` | ✅ Correct |
| `FAILED` | `failed` + safe failure reason | ✅ Correct — no secret leakage |
| HTTP non-2xx | `failed` + safe message | ✅ Correct — raw Xendit error body not exposed |
| Network error | throws controlled Error | ✅ Correct — no secret in message |
| `CANCELED`/`EXPIRED` | falls to `failed` (catch-all) | ⚠️ Known Phase 7A limitation — documented |

**Findings — `parseWebhook` event routing:**

| Xendit event | Phase 7A action | Assessment |
|--------------|-----------------|------------|
| `payment.capture` | `succeeded` | ✅ Correct |
| `payment.failure` | `failed` + failure reason | ✅ Correct |
| `payment_request.expiry` | `ignored` | ✅ Correct per Phase 7A policy |
| unknown events | `ignored` | ✅ Safe default |

**Failure reason safety:** `XenditProvider` uses an allowlist of safe failure reason
strings for both `createPayment` and `parseWebhook`. Raw Xendit failure codes not in the
allowlist fall back to `"Payment failed"`. No Xendit error bodies are surfaced to callers.

**Verdict:** No policy changes needed. Existing behavior is sound for Phase 7A.
`payment_request.expiry` → `ignored` is correct — Xendit sends expiry events asynchronously;
handling will be added in a future phase when expiry-driven cancellation is implemented.

---

### Task 8 — This Report

**File:** `docs/reports/payment-engine-phase-7a-hardening-report.md` (this document)

---

## Files Changed

| File | Type | Tasks |
|------|------|-------|
| `packages/application/payments/CreateGatewayPayment.ts` | Modified | 1, 6 |
| `packages/infrastructure/payments/providers/XenditProvider.ts` | Modified | 6 |
| `packages/infrastructure/repositories/payments/PaymentProviderEventRepository.ts` | Modified | 5 |
| `packages/application/payments/HandlePaymentProviderWebhook.ts` | Modified | 5 |
| `apps/api/src/scripts/payment-engine/xendit-sandbox-smoke.ts` | Modified | 3 |
| `docs/payment-engine-xendit-sandbox-smoke.md` | Modified | 4 |
| `apps/api/src/__tests__/payment-xendit-gateway-integration.test.ts` | New | 2 |
| `docs/reports/payment-engine-phase-7a-hardening-report.md` | New | 8 |

---

## Security Notes

- No production Xendit credentials introduced.
- No real-money Xendit API calls at any point.
- All smoke tooling gated behind `XENDIT_SANDBOX_SMOKE_TEST=true` + `NODE_ENV !== 'production'`.
- `XenditProvider` failure reason allowlist unchanged — no raw Xendit error bodies surfaced.
- `assignTenant` concurrent-safety prevents cross-tenant mutation via `WHERE tenant_id IS NULL`.

---

## Known Limitations Carried Forward (Phase 7A)

| Limitation | Future phase |
|------------|-------------|
| No production Xendit adapter | Phase 7B+ |
| `payment_request.expiry` → `ignored` (no cancellation) | Phase 7B+ |
| No Midtrans / Stripe | Out of scope |
| No POS UI for gateway payments | Out of scope (separate effort) |
| No cron/worker layer for polling | Out of scope (Xendit is webhook-first) |
