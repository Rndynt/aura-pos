# Payment Orchestration — Phase 8E Hardening Report

**Date:** 2026-06-05  
**Phase:** 8E Hardening  
**Status:** ✅ Complete — all tests pass, type-checks clean

---

## Summary

Phase 8E Hardening closes the acceptance gaps from Phase 8D.1 + 8E:

1. `replit.md` quick-start corrected (accurate embedded runtime paths, package wording).
2. Commands Run audit table added to the Phase 8D.1 + 8E report.
3. Reconciliation safety use case added (`ReconcilePaymentIntentTotals`) with route and tests.
4. Real Express HTTP test added proving webhook route bypasses service-token auth.
5. Architecture doc and smoke test doc updated with Phase 8E sections.
6. Phase 8E hardening report created (this file).

---

## Files Changed

### New files
| File | Purpose |
|------|---------|
| `apps/payment-orchestration-service/src/application/use-cases/ReconcilePaymentIntentTotals.ts` | Reconciliation safety use case — recomputes intent totals from actual TX state |
| `apps/api/src/__tests__/payment-orchestration-reconcile.test.ts` | Unit tests for ReconcilePaymentIntentTotals (5 scenarios) |
| `apps/api/src/__tests__/payment-orchestration-webhook-route-auth-bypass.test.ts` | Real Express HTTP tests for webhook auth bypass (7 scenarios) |
| `docs/reports/payment-orchestration-phase-8d-hardening-report.md` | Canonical copy of phase-8d-hardening-report.md |
| `docs/reports/payment-orchestration-phase-8e-hardening-report.md` | This file |

### Modified files
| File | Change |
|------|--------|
| `apps/payment-orchestration-service/src/container.ts` | Added `ReconcilePaymentIntentTotals` to ServiceUseCases + wiring |
| `apps/payment-orchestration-service/src/routes/intents.ts` | Added `POST /v1/payment-intents/:id/reconcile` route |
| `docs/reports/payment-orchestration-phase-8d1-8e-webhook-provider-wiring-report.md` | Added Commands Run audit table |
| `docs/payment-orchestration-hybrid-standalone-architecture.md` | Updated use-cases table (9 files), routes table (added reconcile + webhook), Phase 8E sections |
| `docs/payment-orchestration-service-smoke-test.md` | Added webhook smoke test, reconcile smoke test, full automated test suite table |

---

## Task 1 — `replit.md` Quick-Start Fixes

Already applied in prior session. Verified correct:

- Embedded payment runtime paths now list the four precise files:
  ```
  apps/api/src/http/routes/payment-engine.ts
  packages/application/payments/*
  packages/domain/payments/*
  packages/infrastructure/payments/providers/*
  ```
- `payment-orchestration-core/` described as "workspace package / future standalone package" (not published).
- `payment-orchestration-client-sdk/` directory listed in key directories.

---

## Task 2 — Commands Run Audit Table

Added to `docs/reports/payment-orchestration-phase-8d1-8e-webhook-provider-wiring-report.md`.

| Command | Status | Notes |
|---|:---:|---|
| `npm run check` | not run | Root turbo; individual package checks run instead |
| `pnpm --filter @northflow/payment-orchestration-core type-check` | ✅ pass | 0 errors |
| `pnpm --filter @northflow/payment-orchestration-service type-check` | ✅ pass | 0 errors |
| `pnpm --filter @northflow/payment-orchestration-client-sdk type-check` | ✅ pass | 0 errors |
| atomic confirm test | ✅ pass | 11/11 |
| standalone webhook test | ✅ pass | 13/13 |
| service HTTP/auth test | ✅ pass | 13/13 |
| schema mapper test | ✅ pass | 56/56 |
| core contract adapter test | ✅ pass | 14/14 |
| xendit gateway integration test | ✅ pass | 11/11 — no live provider call |
| reconcile use case test | ✅ pass | 5/5 — new Phase 8E |
| webhook route auth bypass HTTP test | ✅ pass | 7/7 — new Phase 8E |

---

## Task 3 — Reconciliation Safety

### Problem
Phase 8D.1 atomic confirm prevents double-confirm for the same transaction, but transaction update and intent totals/status update still happen in separate steps. A crash between these two steps leaves the DB inconsistent: TX is `succeeded` but intent still shows `requires_payment` / stale totals.

### Solution: `ReconcilePaymentIntentTotals`

**File:** `apps/payment-orchestration-service/src/application/use-cases/ReconcilePaymentIntentTotals.ts`

**Input:** `{ merchantId: string; intentId: string }`

**Algorithm:**
1. Load intent from DB.
2. Load all transactions for the intent.
3. Recompute:
   - `amountPaid` = sum of succeeded incoming transactions
   - `amountRefunded` = sum of succeeded outgoing transactions (0 until Phase 8F refunds)
   - `amountRemaining` = `max(0, amountDue - amountPaid)`
   - `status` = `computeIntentStatus(amountDue, amountPaid)`
4. Compare before/after. If no drift → return `changed: false`, no DB write.
5. If drift → `intentRepo.updateTotals()` then `intentRepo.updateStatus()` if status changed.
6. Return `{ intent, before, after, changed }`.

**Route:** `POST /v1/payment-intents/:id/reconcile`  
Protected by service token via the global auth middleware in `app.ts`.

**Test scenarios (RC01–RC05):**
| ID | Scenario | Result |
|----|----------|--------|
| RC01 | TX succeeded, intent stale (requires_payment) | fixes to paid, changed=true |
| RC02 | Totals already correct | changed=false, no DB write |
| RC03 | Partial payment (amountPaid < amountDue) | status=partially_paid |
| RC04 | Unknown intentId | throws INTENT_NOT_FOUND (404) |
| RC05 | Failed/pending TXs do not count toward amountPaid | changed=false |

---

## Task 4 — Webhook Route Auth Bypass HTTP Test

**File:** `apps/api/src/__tests__/payment-orchestration-webhook-route-auth-bypass.test.ts`

Tests call the real Express application (`createApp()`) with in-memory repositories. No live DB required.

| Test | Scenario | Result |
|------|----------|--------|
| WR01 | Webhook POST succeeds without service token (dev/test) | ✅ 200, intent=paid |
| WR02 | POST /v1/payment-intents without service token | ✅ 401 |
| WR03 | Malicious `x-payment-merchant-id` header ignored; merchant from providerReference | ✅ resolves correct intent |
| WR04 | Duplicate `event_id` → idempotentReplay=true, amountPaid unchanged | ✅ no double-credit |
| WR05 | Invalid payload (missing event_id) | ✅ 400 INVALID_WEBHOOK_PAYLOAD |
| WR06a | Secret configured + missing signature | ✅ 401 WEBHOOK_SIGNATURE_MISSING |
| WR06b | Secret configured + wrong signature | ✅ 401 WEBHOOK_SIGNATURE_INVALID |

**Key design points proven by these tests:**
- Webhook route is registered before `app.use('/v1', auth)` → no service token required for webhook.
- All other `/v1` routes still require service token.
- Merchant resolution uses `providerReference → TX → intent` chain, not request header.
- `timingSafeEqual` HMAC comparison: missing header returns distinct `WEBHOOK_SIGNATURE_MISSING` code; wrong signature returns `WEBHOOK_SIGNATURE_INVALID`.

---

## Task 5 — Updated Docs

### `docs/payment-orchestration-hybrid-standalone-architecture.md`
- Use-cases table updated: 9 use cases (added `HandleProviderWebhook`, `ReconcilePaymentIntentTotals`).
- Routes table updated: added `/v1/payment-intents/:id/reconcile` and `/v1/webhooks/:provider` with auth column.
- New section documenting webhook auth bypass design, HMAC signature policy, and reconciliation safety.
- Phase 8D.1+8E section added explaining atomic confirm, webhook ingestion, and reconciliation.
- Next Phases table updated: 8D.1 and 8E marked ✅.

### `docs/payment-orchestration-service-smoke-test.md`
- Phase updated from 8D Hardening → 8E Hardening.
- Step 9 added: FakeGateway webhook smoke test with dev/secret/idempotent-replay examples.
- Step 10 added: Reconcile smoke test.
- Automated test suites section replaced with full table (all 9 test files, 150 total tests).
- Phase 8E roadmap renamed to Phase 8F roadmap.

### `docs/reports/payment-orchestration-phase-8d-hardening-report.md`
- Canonical copy created from `docs/reports/phase-8d-hardening-report.md` (historical file retained).

---

## Tests Added / Updated

| File | Type | Scenarios | Pass |
|------|------|-----------|------|
| `payment-orchestration-reconcile.test.ts` | New — use-case unit tests | 5 | ✅ 5/5 |
| `payment-orchestration-webhook-route-auth-bypass.test.ts` | New — Express HTTP tests | 7 | ✅ 7/7 |
| `payment-orchestration-webhook-route-auth-bypass.test.ts` WR06a | Fixed — error code assertion | `WEBHOOK_SIGNATURE_MISSING` (not `WEBHOOK_SIGNATURE_INVALID`) | ✅ |

---

## Known Limitations

- `npm run check` (Turborepo root) not run — includes Next.js `apps/web` build unrelated to this phase. Individual payment-orchestration package type-checks ran and pass.
- `ReconcilePaymentIntentTotals` is not idempotency-key protected — it is a correction tool, not a transactional endpoint. Multiple concurrent calls against the same intent are safe (last-write-wins on totals, which are always recomputed from source of truth).
- No scheduled reconciliation worker yet (Phase 8F+).
- Refund totals (`amountRefunded`) will always be 0 until Phase 8F provider-level refund is implemented.

---

## Confirmations

| Guardrail | Status |
|-----------|--------|
| No AuraPoS SDK consumption implemented | ✅ confirmed |
| Embedded `/api/payment-engine/...` not intentionally changed | ✅ confirmed |
| Legacy order payment (`/api/orders/:id/payments`, `RecordPayment`, `CreateAndPayOrder`) not changed | ✅ confirmed |
| No provider-level Xendit refund/cancel implemented | ✅ confirmed |
| No scheduled cron/worker implemented | ✅ confirmed |
| No live Xendit dependency added | ✅ confirmed |
| No Midtrans/Stripe adapter added | ✅ confirmed |
| No POS UI changes | ✅ confirmed |
| No split bill/customer ledger/stock reservation/PPOB | ✅ confirmed |
