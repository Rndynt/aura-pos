# Payment Engine Phase 6 Hardening — Implementation Report

**Date:** 2025-06-05  
**Phase:** 6 Hardening (follows Phase 6 Provider Contract, commit d0c35e9)  
**Status:** ✅ Complete — 113/113 new tests pass, 207/207 regression tests pass

---

## Summary

Phase 6 Hardening firms up the provider abstraction before any real gateway adapter (Midtrans, Xendit, Stripe) is integrated. Seven tasks were executed:

1. **Lock-order fix** — `CreateGatewayPayment` immediate-success path no longer calls `ApplyGatewayTransactionStatus`, eliminating the `intent → tx → intent` reversed lock ordering.
2. **Machine-readable action descriptor** — every `ProviderAction` now carries a `descriptor: ProviderActionDescriptor` tag (`WEB_URL`, `QR_STRING`, `VA_NUMBER`, `PAYMENT_CODE`, `NONE`).
3. **Expanded capabilities matrix** — `ProviderCapabilities` gains 8 new boolean fields covering redirect/QR/VA/payment-code support and immediate-outcome flags.
4. **`ProviderAccountConfig` secrets model** — raw `credentials` field removed; replaced by `credentialsRef?: string` (opaque reference to a secret stored outside the domain).
5. **FakeGateway message cleanup** — stale "Phase 4 planned" references removed from cancel/refund responses.
6. **Hardening report** — this document.
7. **Test expansion** — 113 contract tests (up from 68 in Phase 6 original), covering all hardening requirements.

---

## Files Changed

| File | Change |
|------|--------|
| `packages/domain/payments/provider.ts` | Rewrote: new `ProviderActionDescriptor` union type, updated `ProviderAction` interface (added `descriptor`), canonical `redirect_customer` action type, expanded `ProviderCapabilities` (8 new fields), updated `ManualProvider` capabilities |
| `packages/domain/payments/providerAccount.ts` | Rewrote: removed `credentials: Record<string, string>`, added `credentialsRef?: string`, `publicConfig?`, `merchantId?`, `capabilitiesOverride?`, `metadata?`, `environment` |
| `packages/infrastructure/payments/providers/FakeGatewayProvider.ts` | Rewrote: all actions include `descriptor`, canonical `redirect_customer` type, expanded capabilities matrix, updated cancel/refund messages |
| `packages/application/payments/CreateGatewayPayment.ts` | Rewrote: removed `applyGatewayStatus` (5th arg), added `allocationRepo?` (5th) and `recalculate?` (6th), immediate-success path does direct settlement without re-locking |
| `apps/api/src/container.ts` | Updated `createGatewayPayment` construction: injects `paymentAllocationRepository` and `recalculatePaymentIntent` instead of `applyGatewayTransactionStatus` |
| `apps/api/src/__tests__/payment-provider-contract.test.ts` | Expanded: 113 tests across 10 suites (was 68 across 6 suites) |

---

## Task 1 — Immediate-success lock-order fix

### Problem

The Phase 6 original `CreateGatewayPayment` immediate-success path:
1. Locked `payment_intents` FOR UPDATE (Step 1 of `execute()`).
2. Created the transaction as `pending`.
3. Called `ApplyGatewayTransactionStatus`, which:
   - Locked `payment_transactions` FOR UPDATE.
   - Locked `payment_intents` FOR UPDATE **again**.

Lock sequence: **`intent → tx → intent`**

Normal settlement flows (webhook, confirm) follow `tx → intent`. This mixed pattern would become a deadlock hazard once concurrent real-provider flows exist.

### Fix

For `status: 'succeeded'` returned by the provider, `CreateGatewayPayment` now:

1. Creates the transaction **directly as `succeeded`** with `succeededAt: new Date()` — no two-step `pending → succeeded` transition, no extra `txRepo.update()` call.
2. Creates the allocation via `allocationRepo.create()` directly — using the already-locked intent data, no additional locks acquired.
3. Calls `RecalculatePaymentIntent.execute()` — reads intent via `findById` (not `lockForUpdate`, since the intent lock is already held).
4. **Does NOT call `ApplyGatewayTransactionStatus`** — eliminating the reversed lock ordering.

Lock sequence after fix: **`intent FOR UPDATE only`**  
(The tx row is brand-new and owned by the current transaction; no lock contention is possible.)

### New deps (constructor args)

```typescript
constructor(
  db,
  intentRepo,
  txRepo,
  registry,
  allocationRepo?: IPaymentAllocationRepository,  // 5th arg (was applyGatewayStatus)
  recalculate?: RecalculatePaymentIntent,          // 6th arg (new)
)
```

Both are optional for backward compatibility with 4-arg Phase 2 test constructions. If either is missing and the provider returns `succeeded`, `IMMEDIATE_SUCCESS_NOT_CONFIGURED` is thrown immediately.

### Lock ordering table (updated)

| Flow | Lock sequence |
|------|---------------|
| Webhook / HandlePaymentProviderWebhook | `tx FOR UPDATE → intent FOR UPDATE` |
| ConfirmFakeGatewayPayment | `tx FOR UPDATE → intent FOR UPDATE` |
| RefundPaymentTransaction (Phase 4) | `tx FOR UPDATE → intent FOR UPDATE` |
| VoidPaymentTransaction (Phase 4) | `tx FOR UPDATE → intent FOR UPDATE` |
| **CreateGatewayPayment immediate-success** | **`intent FOR UPDATE` only** (tx just created; allocation + recalculate run in same db.transaction()) |

---

## Task 2 — Machine-readable `ProviderAction.descriptor`

### New type

```typescript
export type ProviderActionDescriptor =
  | 'WEB_URL'
  | 'QR_STRING'
  | 'VA_NUMBER'
  | 'PAYMENT_CODE'
  | 'NONE';
```

### Updated `ProviderAction` interface

```typescript
export interface ProviderAction {
  type: ProviderActionType;
  descriptor: ProviderActionDescriptor; // machine-readable value tag (NEW)
  label: string;
  value?: string | null;
  expiresAt?: Date | null;
  metadata?: Record<string, unknown>;
}
```

### Canonical action type

The action `type` field now uses `redirect_customer` (not the deprecated `redirect`). The old `provider.ts` `ProviderActionType` still lists `redirect_customer` as the canonical value. Any code asserting `type === 'redirect'` must be updated to `type === 'redirect_customer'`.

### FakeGateway descriptor mapping

| Scenario | `type` | `descriptor` |
|---|---|---|
| `redirect` | `redirect_customer` | `WEB_URL` |
| `qris` | `present_qr` | `QR_STRING` |
| `va` | `display_code` | `VA_NUMBER` |
| `payment_code` | `display_code` | `PAYMENT_CODE` |
| `immediate_success` | (no action) | — |
| `immediate_failure` | (no action) | — |
| `pending_expiry` | `redirect_customer` | `WEB_URL` |
| `default` | (no action) | — |

---

## Task 3 — Expanded `ProviderCapabilities` matrix

### New fields added

```typescript
supportsRedirect: boolean;              // can return WEB_URL redirect action
supportsQr: boolean;                    // can return QR_STRING action
supportsVa: boolean;                    // can return VA_NUMBER action
supportsPaymentCode: boolean;           // can return PAYMENT_CODE action
supportsPartialRefund: boolean;         // provider API supports partial refund
supportsMultiplePartialRefund: boolean; // provider allows multiple partial refunds
canReturnImmediateSuccess: boolean;     // may return status:'succeeded' from createPayment
canReturnImmediateFailure: boolean;     // may return status:'failed' from createPayment
```

### Capability values

| Capability | FakeGateway | ManualProvider |
|---|---|---|
| `supportsRedirect` | true | false |
| `supportsQr` | true | false |
| `supportsVa` | true | false |
| `supportsPaymentCode` | true | false |
| `supportsPartialRefund` | false | false |
| `supportsMultiplePartialRefund` | false | false |
| `canReturnImmediateSuccess` | true | true (settles sync) |
| `canReturnImmediateFailure` | true | false |
| `canCancel` | false | false |
| `canRefund` | false | false |
| `supportsWebhook` | true | false |
| `supportsPolling` | false | false |

---

## Task 4 — `ProviderAccountConfig` secrets model

### Before (Phase 6 original)

```typescript
interface ProviderAccountConfig {
  providerCode: string;
  tenantId?: string;
  sandboxMode?: boolean;
  credentials: Record<string, string>; // ← raw secrets in domain type
  metadata?: Record<string, unknown>;
}
```

### After (Phase 6 Hardening)

```typescript
interface ProviderAccountConfig {
  provider: string;
  tenantId?: string;
  merchantId?: string;
  environment: 'sandbox' | 'production' | 'test';
  credentialsRef?: string;              // opaque reference — infrastructure resolves
  publicConfig?: Record<string, unknown>; // non-secret config only
  capabilitiesOverride?: Partial<ProviderCapabilities>;
  metadata?: Record<string, unknown>;
}
```

**Rule:** No raw API key, password, or private key may appear in `ProviderAccountConfig`. The `credentialsRef` string is an opaque handle (e.g., env-var name, vault path) that infrastructure resolves at runtime. No DB table backs this type yet.

---

## Task 5 — FakeGateway cancel/refund message cleanup

Old messages (Phase 6 original) referenced "Implement in Phase 4" or "planned for Phase 4". Phase 4 is complete — these references are stale and misleading.

**New cancel message:**
> `FakeGatewayProvider does not support provider-level cancel. Use VoidPaymentTransaction use case (Phase 4) for internal void lifecycle. Real provider cancel API will be added in a future gateway adapter phase.`

**New refund message:**
> `FakeGatewayProvider does not support provider-level refund. Use RefundPaymentTransaction use case (Phase 4) for internal refund lifecycle. Real provider refund API will be added in a future gateway adapter phase.`

---

## Tests Added / Updated

### New test suites in `payment-provider-contract.test.ts`

| Suite | Tests | What it covers |
|---|---|---|
| `ProviderCapabilities contract` | 5 | Original capabilities check (unchanged) |
| `Phase 6 Hardening — expanded ProviderCapabilities matrix` | 17 | All 8 new capability fields on FakeGateway + ManualProvider |
| `CreateProviderPaymentResult Phase 6 shape` | 8 | Result shape for all 8 scenarios |
| `Phase 6 Hardening — ProviderAction descriptor field` | 8 | descriptor value per scenario |
| `Phase 6 Hardening — canonical action types` | 5 | `redirect_customer` canonical type |
| `FakeGatewayProvider scenarios` | 39 | All 8 scenarios, full field assertions |
| `CreateGatewayPayment — Phase 6 scenario paths` | 21 | Lock-order fix, direct settlement, failed tx, missing deps |
| `ProviderAccountConfig type` | 3 | credentialsRef, no raw credentials, all environments |
| `Phase 6 Hardening — FakeGateway cancel/refund message cleanup` | 7 | Updated messages, no stale Phase 4 text |
| `Phase 2 regression — default scenario still works` | 2 | Backward compat |
| **Total** | **113** | |

### Key lock-order test

```
immediate_success: transaction created directly as succeeded (no two-step)
immediate_success: succeededAt is populated on the created tx
immediate_success: exactly one tx row in store (no extra pending row)
```
These verify that direct settlement (one `txRepo.create()` with `status: 'succeeded'`) is used — not the old two-step `create(pending) → update(succeeded)` via `ApplyGatewayTransactionStatus`.

### Regression test counts (unchanged)

| Suite | Tests |
|---|---|
| Phase 1 (payment engine) | 49 |
| Phase 2 (gateway abstraction) | 45 |
| Phase 3 (webhook engine) | 38 |
| Phase 4 (refund/void lifecycle) | 39 |
| Phase 5 (reconciliation) | 36 |
| **Phase 1–5 total** | **207** |

---

## Commands Run

```bash
# TypeScript check
cd apps/api && npx tsc --noEmit
# → clean (zero errors)

# Phase 6 Hardening tests
cd apps/api && npx tsx --test src/__tests__/payment-provider-contract.test.ts
# → 113/113 pass

# Phase 1–5 regression
cd apps/api && npx tsx --test src/__tests__/payment-engine.test.ts
# → 49/49 pass

cd apps/api && npx tsx --test src/__tests__/payment-engine-phase2.test.ts
# → 45/45 pass

cd apps/api && npx tsx --test src/__tests__/payment-engine-phase3.test.ts
# → 38/38 pass

cd apps/api && npx tsx --test src/__tests__/payment-engine-phase4.test.ts
# → 39/39 pass

cd apps/api && npx tsx --test src/__tests__/payment-engine-phase5.test.ts
# → 36/36 pass
```

---

## Known Limitations

1. **No real provider adapter** — FakeGateway is a local dev/test simulator only. It is not a Midtrans, Xendit, or Stripe emulator.
2. **No DB table for `ProviderAccountConfig`** — the type is a domain descriptor only. Persistence is deferred to a future phase.
3. **`credentialsRef` resolution is undefined** — the contract says "infrastructure resolves this at runtime", but no resolver is implemented yet. Future phases will define the vault/env-var lookup.
4. **`canCancel: false` / `canRefund: false` on both providers** — provider-level cancel/refund API calls are not yet implemented. Phase 4 internal void/refund lifecycle handles the business logic without a real provider API call.
5. **`supportsPolling: false` on all providers** — polling-based status checks will be implemented in a future phase when a real provider requires it.

---

## Explicit Audit Confirmations

- ✅ **FakeGateway is NOT a Midtrans/Xendit/Stripe emulator.** It is a local dev/test fixture that simulates provider behavior via scenario tags. No real money movement occurs.
- ✅ **No real gateway adapter, API call, or credential was implemented.** The `fake_gateway` provider is the only gateway, and it makes no HTTP calls.
- ✅ **Legacy order payment flow was not intentionally changed.** The following files were not touched: `/api/orders/:id/payments`, `/api/orders/create-and-pay`, `RecordPayment.ts`, `CreateAndPayOrder.ts`, `apps/api/src/http/routes/orders.ts`, `order_payments` table.
- ✅ **Future phases were not implemented.** No split bill, customer ledger, stock reservation, PPOB, real Midtrans/Xendit/Stripe adapter, order adapter, or POS UI changes were made.
