# Payment Engine Phase 6 — Provider Contract Hardening Report

**Date:** 2026-06-05  
**Phase:** 6 — Provider Contract Hardening + Enhanced FakeGateway  
**Status:** ✅ Complete

---

## Summary

Phase 6 hardens the provider domain contract by adding explicit capabilities,
structured customer actions, and scenario-driven FakeGateway behaviors.
It also enables **immediate settlement** (provider returns `succeeded`
synchronously) by routing through `ApplyGatewayTransactionStatus` within
the same DB transaction as payment creation.

---

## Tasks Completed

### Task 1 — Harden Provider Domain Contract (`packages/domain/payments/provider.ts`)

**New types added:**

| Type | Purpose |
|------|---------|
| `ProviderActionType` | Union: `'redirect' \| 'present_qr' \| 'display_code' \| 'poll' \| 'none'` |
| `ProviderActionDescriptor` | `{ type, label, value, expiresAt? }` — one customer action |
| `ProviderAction` | Alias for `ProviderActionDescriptor`; will become discriminated union in future phases |
| `ProviderCapabilities` | `{ canCancel, canRefund, supportsWebhook, supportsPolling, supportedScenarios? }` |

**`CreateProviderPaymentResult` additions (backward-compatible):**

| Field | Type | Notes |
|-------|------|-------|
| `status` | `'pending' \| 'requires_action' \| 'succeeded' \| 'failed'` | **New — preferred** |
| `actions` | `ProviderAction[]` | **New — preferred** |
| `expiresAt` | `Date \| null \| undefined` | New optional |
| `rawProviderResponse` | `Record<string, unknown> \| undefined` | New optional |
| `providerReference` | `string \| null` | Kept (legacy) |
| `providerPaymentUrl` | `string \| null` | Kept (legacy, deprecated) |
| `providerQrString` | `string \| null` | Kept (legacy, deprecated) |
| `succeededImmediately` | `boolean` | Kept (legacy, deprecated) |
| `failureReason` | `string \| null` | Kept |

**`PaymentProvider` interface:** `capabilities: ProviderCapabilities` added as required field.

**`ManualProvider` updated:**
- `capabilities` property declared (all false, no scenarios)
- `createPayment()` now returns `status: 'succeeded'`, `actions: []`

---

### Task 2 — Provider Account/Config Abstraction (`packages/domain/payments/providerAccount.ts`)

New file introducing `ProviderAccountConfig`:

```typescript
interface ProviderAccountConfig {
  tenantId: string;
  providerCode: string;
  accountId: string;
  credentials: Record<string, string>;  // secrets — never log
  sandboxMode?: boolean;
  metadata?: Record<string, unknown>;
}
```

**No database table** in Phase 6. Credentials sourced from environment variables
or injected via constructor. A future phase will add a `provider_accounts` table
with encryption-at-rest.

Exported from `packages/domain/payments/index.ts`.

---

### Task 3 — Enhanced FakeGateway Scenarios (`packages/infrastructure/payments/providers/FakeGatewayProvider.ts`)

`capabilities` property added:

```typescript
capabilities = {
  canCancel: false,
  canRefund: false,
  supportsWebhook: true,     // HMAC-signed webhooks supported
  supportsPolling: false,
  supportedScenarios: [      // dev/test only
    'redirect', 'qris', 'va', 'payment_code',
    'immediate_success', 'immediate_failure', 'pending_expiry', 'default',
  ],
};
```

Scenario dispatch added to `createPayment()` via `input.metadata?.scenario`:

| Scenario | `status` | `actions[0].type` | Legacy fields |
|----------|----------|-------------------|---------------|
| `redirect` | `requires_action` | `redirect` | `providerPaymentUrl` set |
| `qris` | `requires_action` | `present_qr` | `providerQrString` set |
| `va` | `requires_action` | `display_code` (VA number) | both null |
| `payment_code` | `requires_action` | `display_code` (code) | both null |
| `immediate_success` | `succeeded` | _(empty)_ | both null; `succeededImmediately: true` |
| `immediate_failure` | `failed` | _(empty)_ | both null; `failureReason` set |
| `pending_expiry` | `requires_action` | `redirect` + `expiresAt` | `providerPaymentUrl` set |
| `default` (any/none) | **`pending`** | _(empty)_ | **both set** (backward compat) |

**Backward compatibility guarantee:** callers that do not pass `metadata.scenario`
receive exactly the Phase 2 behavior — `status: 'pending'`, both URL and QR
fields set, `actions: []`.

---

### Task 4 — Updated CreateGatewayPayment (`packages/application/payments/CreateGatewayPayment.ts`)

**Provider status → transaction status mapping:**

| Provider `status` | Initial tx status | Post-processing |
|-------------------|------------------|-----------------|
| `pending` | `pending` | None |
| `requires_action` | `requires_action` | None |
| `succeeded` | `pending` (temporary) | Immediately applied via `ApplyGatewayTransactionStatus` in same DB tx |
| `failed` | `failed` | `failureReason` stored |

**Immediate success path:**
1. Provider returns `status: 'succeeded'`
2. Transaction row created as `pending` (so it can be found by `lockByProviderReferenceForUpdate`)
3. `ApplyGatewayTransactionStatus.execute()` called **within the same outer DB transaction**:
   - Locks tx row FOR UPDATE
   - Updates status to `succeeded`, sets `succeededAt`
   - Creates allocation (`targetType: payableType`, `targetId: payableId`)
   - Recalculates intent (amountPaid, amountRemaining, status → `paid`)
4. Updated intent + succeeded transaction returned to caller

**Output additions:**

| Field | Type | Notes |
|-------|------|-------|
| `providerActions` | `ProviderAction[]` | Propagated from provider result |
| `immediateSuccess` | `boolean` | True when provider settled immediately |

**5th constructor argument:** `applyGatewayStatus?: ApplyGatewayTransactionStatus` (optional)
- Optional to preserve Phase 2 test compatibility (4-arg form)
- If missing and provider returns `succeeded`, throws `IMMEDIATE_SUCCESS_NOT_CONFIGURED`

**Error codes added:**
- `IMMEDIATE_SUCCESS_NOT_CONFIGURED` — `applyGatewayStatus` not injected
- `MISSING_PROVIDER_REFERENCE` — provider returned `succeeded` but no reference

---

### Task 5 — Provider Contract Tests (`apps/api/src/__tests__/payment-provider-contract.test.ts`)

**6 test suites, 50 test cases:**

| Suite | Tests | What it validates |
|-------|-------|-------------------|
| ProviderCapabilities contract | 5 | FakeGateway + Manual capabilities fields and values |
| CreateProviderPaymentResult shape | 8 | All 8 scenarios return complete Phase 6 result shape |
| FakeGateway scenarios | 27 | Status, actions, legacy fields, expiresAt for each scenario |
| CreateGatewayPayment Phase 6 paths | 15 | requires_action / immediate_success / immediate_failure / pending_expiry / missing dep |
| ProviderAccountConfig type | 2 | TypeScript structural validation |
| Phase 2 regression | 2 | Default scenario and ManualProvider backward compat |

---

### Task 6 — API/Response Compatibility

`CreateGatewayPaymentOutput` extended with `providerActions` and `immediateSuccess`.
All existing fields (`providerReference`, `providerPaymentUrl`, `providerQrString`,
`idempotentReplay`) are preserved unchanged — no breaking change to API consumers.

HTTP route handlers reading `result.providerPaymentUrl` or `result.providerQrString`
continue to work. The new fields are additive.

---

### Task 7 — Container Wiring (`apps/api/src/container.ts`)

`applyGatewayTransactionStatus` construction moved **before** `createGatewayPayment`
so it can be injected as the 5th constructor argument.

```typescript
// Phase 3 helper built first
this.applyGatewayTransactionStatus = new ApplyGatewayTransactionStatus(...);

// Phase 2 use-case receives it as optional 5th arg (Phase 6 addition)
this.createGatewayPayment = new CreateGatewayPayment(
  db,
  intentRepo,
  txRepo,
  registry,
  this.applyGatewayTransactionStatus,  // Phase 6
);
```

---

## Design Decisions

### Backward Compatibility Strategy

Every change was made additive:
1. **`CreateProviderPaymentResult`**: new fields added alongside old ones. Old fields
   marked `@deprecated` in JSDoc but not removed.
2. **`default` scenario**: returns `status: 'pending'` (not `requires_action`) so
   Phase 2 tests that assert `result.transaction.status === 'pending'` still pass.
3. **5th constructor arg**: optional so 4-arg Phase 2 test constructions compile.
4. **`PaymentProvider.capabilities`**: added as required field. Both existing providers
   (ManualProvider, FakeGatewayProvider) updated simultaneously.

### Immediate Success Locking Order

`CreateGatewayPayment` normally locks `payment_intents FOR UPDATE` (Step 1).  
For immediate success, `ApplyGatewayTransactionStatus` then locks
`payment_transactions FOR UPDATE → payment_intents FOR UPDATE` (standard settlement order).

Both locks live within the same PostgreSQL transaction, so no deadlock is possible.
The intent lock from Step 1 is compatible with the re-lock in Step 3 of
`ApplyGatewayTransactionStatus` (same transaction, same row — PostgreSQL upgrades the lock).

### Why `pending` first for immediate_success

Creating the transaction as `pending` before calling `ApplyGatewayTransactionStatus`
allows `lockByProviderReferenceForUpdate` to find the row. Creating directly as
`succeeded` would bypass the `ApplyGatewayTransactionStatus` allocation logic,
requiring duplicate code. The two-step approach reuses the proven atomic helper.

### No DB Table for ProviderAccountConfig

Phase 6 introduces the type only. Persisting credentials requires encryption-at-rest
(key management, rotation, audit log) — out of scope for Phase 6. The type gives
future phases a stable interface to implement against.

---

## Phase 2–5 Regression Summary

All prior tests continue to pass:
- `payment-engine.test.ts` — Phase 1 (manual payment flow)
- `payment-engine-phase2.test.ts` — Gateway abstraction (36 tests)
- `payment-engine-phase3.test.ts` — Webhook engine
- `payment-engine-phase4.test.ts` — Refund/void lifecycle (39 tests)
- `payment-engine-phase5.test.ts` — Reconciliation & stale recovery (36 tests)

---

## Known Limitations / Future Work

| Item | Notes |
|------|-------|
| `ProviderAction` is not yet a discriminated union | Planned when `poll` action type is introduced |
| `ProviderAccountConfig` has no DB backing | Requires encryption-at-rest infra — planned future phase |
| `canCancel / canRefund` always false on FakeGateway | Cancel/refund provider API calls planned for real gateway adapters |
| Polling flow not implemented | `supportsPolling: false` on all current providers |
| `rawProviderResponse` not stored in DB | Would require a `jsonb` column on `payment_transactions` — future phase |
| Real gateway adapters (Midtrans, Xendit, Stripe) | Out of scope — Phase 6 establishes the contract they must implement |
