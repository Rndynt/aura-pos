# Payment Engine Phase 5 Hardening Report

**Date:** 2026-06-05  
**Commit base:** `0470d892847cd5650fc12994032c33d58bff66d4` (Phase 5 reconciliation)  
**Status:** ✅ All checks pass — 36 tests, 0 failures, TypeScript clean

---

## Summary

Phase 5 Hardening resolves four concurrency/finalization issues found in the Phase 5 reconciliation baseline:

| # | Problem | Fix |
|---|---------|-----|
| 1 | `ReprocessStaleProviderEvents` listed events for all tenants; tenant-manager HTTP calls could accidentally reprocess other tenants' events | Added `tenantId?` filter to `listStalePendingEvents`; controller always passes `req.tenantId!` |
| 2 | Concurrent reconciliation jobs could double-process the same pending event (no row lock before mutation) | Added `lockByIdForUpdate(id, tx)` to `IPaymentProviderEventRepository`; actual run opens one DB transaction per event and re-checks `processingStatus` under the lock |
| 3 | Invalid-signature stale events returned `skipped_invalid_sig` but left `processingStatus = 'pending'` forever | In actual run, `markIgnored` is called with `REPROCESS_INVALID_SIGNATURE` before returning |
| 4 | Unsupported-provider stale events returned `unsupported_provider` but left `processingStatus = 'pending'` forever | In actual run, `markFailed` is called with `UNSUPPORTED_PROVIDER` before returning |

---

## Files Changed

| File | Change |
|------|--------|
| `packages/infrastructure/repositories/payments/PaymentProviderEventRepository.ts` | Added `tenantId?` to `listStalePendingEvents` options (interface + implementation); added `lockByIdForUpdate(id, tx)` to interface + implementation |
| `packages/application/payments/ReprocessStaleProviderEvents.ts` | Full rewrite: added `tenantId?` to input; moved all actual-run logic inside `db.transaction()` per event with row lock; finalize invalid-sig as `ignored`; finalize unsupported-provider as `failed`; added `skipped_already_claimed` outcome for concurrent-claim guard |
| `apps/api/src/http/controllers/PaymentEngineController.ts` | `reprocessStaleProviderEvents` handler now passes `tenantId: req.tenantId!` to use case |
| `apps/api/src/__tests__/payment-engine-phase5.test.ts` | Updated all `fakeEventRepo` mocks in Section 4 to include `lockByIdForUpdate`; updated `makeDb()` default dbTx to include `execute: async () => ({})`; added 8 new hardening tests (Tasks 1–4) |

---

## Tenant-Scoped Event Recovery Design

**Problem:** The existing `listStalePendingEvents` had no tenant filter. The HTTP endpoint was guarded by `requireManager` (so callers are authenticated to a specific tenant), but the use case would still list all-tenant events and process them under the caller's identity.

**Fix:**

1. `IPaymentProviderEventRepository.listStalePendingEvents` now accepts `options.tenantId?: string`.
2. When `tenantId` is set, a `WHERE tenant_id = $1` condition is added to the query.
3. `null`-tenant events are intentionally excluded when `tenantId` is provided — they are orphaned global events that require a future superadmin/global reconciliation job (out of scope for Phase 5).
4. The controller always passes `req.tenantId!`, so tenant-manager calls only see their own events.

**Backwards compatibility:** The `tenantId` option is optional — existing callers that pass no `tenantId` (global batch jobs, tests) continue to see all events with no filter applied.

---

## Event Row Locking / Claim Behavior

**Problem:** Without a row lock, two concurrent reconciliation runs could both pick up the same `pending` event from the initial list snapshot, both call `ApplyGatewayTransactionStatus`, and produce duplicate mutations.

**Fix:**

Each event in actual run is processed inside a dedicated `db.transaction()`:

```
1. lockByIdForUpdate(event.id, dbTx)
   — issues SELECT ... FOR UPDATE on payment_provider_events WHERE id = $1
2. Re-read processingStatus from the locked row
3. If processingStatus ≠ 'pending' → return 'skipped_already_claimed' (silent, not pushed to results)
4. All subsequent checks and mutations (signatureValid, provider lookup, parse, applyGatewayStatus, markProcessed/markIgnored/markFailed) happen inside the same transaction
```

`lockByIdForUpdate` mirrors the pattern used in `PaymentTransactionRepository.lockByIdForUpdate`:
- Issues `SELECT id FROM ... FOR UPDATE` via `tx.execute(sql`...`)` to acquire the PG row lock
- Then re-fetches the full row via the ORM for a typed return value
- Returns `null` if no row exists (treated as `skipped_already_claimed`)

**Dry-run is unaffected:** dry-run exits before the `db.transaction()` call and never acquires any lock.

---

## Invalid-Signature Finalization Behavior

**Problem:** `signatureValid = false` events returned `skipped_invalid_sig` but did not update `processingStatus`, leaving the row in `pending` forever and causing it to appear in every subsequent reconciliation run.

**Fix (Task 3):**

In actual run, after acquiring the row lock and confirming `processingStatus = 'pending'`:

```typescript
if (!locked.signatureValid) {
  await this.eventRepo.markIgnored(
    event.id,
    'REPROCESS_INVALID_SIGNATURE: stale event with invalid signature finalized without money mutation',
    dbTx,
  );
  return { kind: 'skipped_invalid_sig' };
}
```

- `markIgnored` is called **inside** the locked transaction — atomic with the status re-check.
- `processingStatus` changes from `pending` → `ignored` so the event is never selected again.
- No provider parser is called.
- No `ApplyGatewayTransactionStatus` is called.
- No transaction or allocation is mutated.
- The API response outcome remains `'skipped_invalid_sig'` (unchanged) — callers see the same structure.
- **Dry-run is unaffected** — dry-run exits before any lock or `markIgnored` call.

---

## Unsupported-Provider Finalization Behavior

**Problem:** Events for providers not present in the registry returned `unsupported_provider` but did not update `processingStatus`, leaving the row in `pending` forever.

**Fix (Task 4):**

In actual run, after the signature check:

```typescript
if (!this.registry.has(locked.provider)) {
  await this.eventRepo.markFailed(
    event.id,
    `UNSUPPORTED_PROVIDER: provider "${locked.provider}" is not registered`,
    dbTx,
  );
  return { kind: 'unsupported_provider', error: `Provider "${locked.provider}" is not registered` };
}
```

- `markFailed` is called **inside** the locked transaction.
- `processingStatus` changes from `pending` → `failed` so the event is never selected again.
- No transaction is mutated.
- **Batch continues** — the `try/catch` around the event loop catches any unexpected errors per event; this path returns from the transaction normally so the outer loop continues to the next event.
- The API response outcome remains `'unsupported_provider'` (unchanged).

---

## Tests Added / Updated

### Updated existing tests (Section 4 — ReprocessStaleProviderEvents)

All existing Section 4 `fakeEventRepo` mocks updated to include `lockByIdForUpdate: async () => event` (returns the mock event as locked). The `makeDb()` helper now includes `execute: async () => ({})` in the default dbTx for safety.

### New hardening tests (8 new, 36 total across all 5 suites)

| Test | Covers |
|------|--------|
| `passes tenantId filter to listStalePendingEvents` | Task 1: tenantId forwarded to repo |
| `dry-run passes tenantId filter and makes no mutations` | Task 1 + dry-run safety |
| `silently skips event already claimed (lockByIdForUpdate returns non-pending)` | Task 2: claim guard |
| `dry-run does not call lockByIdForUpdate` | Task 2: dry-run never locks |
| `marks invalid-signature event as ignored (not left pending) in actual run` | Task 3: finalization |
| `dry-run does not call markIgnored for invalid-signature event` | Task 3: dry-run safety |
| `marks unsupported-provider event as failed (not left pending) in actual run` | Task 4: finalization |
| `batch continues after unsupported-provider event` | Task 4: batch isolation |

---

## Commands Run

```bash
# Tests
cd apps/api && tsx --test src/__tests__/payment-engine-phase5.test.ts
# Result: 36 tests, 36 pass, 0 fail

cd apps/api && tsx --test src/__tests__/payment-engine-phase4.test.ts
# Result: 39 tests, 39 pass, 0 fail (no regressions)

# TypeScript
pnpm --filter @pos/api exec tsc --noEmit
# Result: no errors
```

---

## Known Limitations

1. **`lockByIdForUpdate` without tenantId**: The provider event table does not require `tenantId` on the lock query (unlike `PaymentTransactionRepository` which locks by `id AND tenant_id`). This is intentional — `payment_provider_events.id` is a global UUID primary key and `tenantId` can be `null` for unresolved events. The tenant-scope guarantee comes from the `listStalePendingEvents` filter, not from the lock query.

2. **null-tenant event recovery**: Events with `tenantId = null` are excluded from tenant-manager reconciliation. They must be recovered by a future superadmin/global reconciliation job (Phase 6+).

3. **`lockByIdForUpdate` in tests uses fake repo**: The test `lockByIdForUpdate` mock returns the event object directly without exercising the real `SELECT ... FOR UPDATE` SQL. Concurrency guarantee is verified at the use-case level (re-check logic), not via integration test.

4. **No real-provider finalization**: `ExpireStalePaymentTransactions` still skips real-gateway providers (Midtrans, Xendit, Stripe) — voiding requires a real provider cancel API which is Phase 6+.

---

## Legacy Order Payment Audit Confirmation

**Explicit confirmation:** The following files and behaviors were **not intentionally changed** during Phase 5 Hardening:

- `apps/api/src/http/routes/orders.ts` — not modified
- `packages/application/orders/RecordPayment.ts` — not modified
- `packages/application/orders/CreateAndPayOrder.ts` — not modified
- `/api/orders/:id/payments` endpoint behavior — unchanged
- `/api/orders/create-and-pay` endpoint behavior — unchanged
- `order_payments` legacy table — not touched

All changes are isolated to the `payment_provider_events` repository and the `ReprocessStaleProviderEvents` use case.

---

## Phase 6+ Feature Confirmation

**Explicit confirmation:** The following features were **not implemented** in Phase 5 Hardening:

- No real Midtrans / Xendit / Stripe adapter
- No real provider credentials
- No real provider refund or cancel API call
- No order adapter
- No POS UI changes
- No split bill
- No customer ledger
- No stock reservation
- No PPOB wallet or credit
- No standalone extraction
- No superadmin/global reconciliation job
