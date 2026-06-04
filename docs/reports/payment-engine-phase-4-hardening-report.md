# Payment Engine Phase 4 Hardening Report

**Date:** June 2026  
**Phase:** 4 Hardening  
**Base commit:** `bc8fd1d28d1a8a7005ab61262d3449cdd45413ab`  
**Status:** ✅ Complete

---

## 1. Summary

This hardening pass addresses five correctness issues in the `RefundPaymentTransaction` use case identified after the Phase 4 base implementation:

1. **Idempotency namespace mismatch** — refund idempotency check used a refund-only lookup, creating a gap where incoming-payment idempotency keys could collide silently at the DB layer.
2. **TOCTOU race in idempotency check** — the check ran outside the DB transaction, allowing two concurrent requests with the same key to both pass and double-write.
3. **Wrong `refundableRemaining` on idempotent replay** — used `existingRefund.amount - totalRefunded` instead of `originalAmount - totalRefunded`.
4. **Raw DB error leak** — a unique constraint race that slipped past the in-transaction check would surface a raw Postgres `23505` message to API callers.
5. **`.replit` scope drift** — the Phase 4 diff appeared to change `.replit`. This report resolves the question.

---

## 2. Files Changed

| File | Change |
|------|--------|
| `packages/application/payments/RefundPaymentTransaction.ts` | Full rewrite of execution flow (Tasks 1–4) |
| `apps/api/src/__tests__/payment-engine-phase4.test.ts` | 10 new hardening tests added (Tasks 1–4, 6) |
| `docs/reports/payment-engine-phase-4-hardening-report.md` | This report (Task 7) |

No other files were changed. Legacy order payment files were not touched.

---

## 3. Idempotency Namespace Fix (Task 1)

### Problem

The database unique index on `payment_transactions` is **tenant-wide**:
```sql
UNIQUE (tenant_id, idempotency_key) WHERE idempotency_key IS NOT NULL
```

The original code called `findRefundByIdempotencyKey`, which filters by `direction = 'outgoing'` and `transactionType = 'refund'`. This meant:

- If a **payment** tx already used key `abc`, the refund precheck saw **no match** (because payment is `direction=incoming`).
- The refund proceeded to DB insert, which **hit `23505` unique violation**.
- The raw error bubbled to the API client as an unhandled exception.

### Fix

Use `findByIdempotencyKey(tenantId, key, tx)` — the tenant-wide lookup — for all idempotency checking. Apply the following classification:

| Existing row type | Action |
|---|---|
| Outgoing refund, same `parentTransactionId` | Idempotent replay — return existing refund |
| Anything else (incoming payment, different parent, void, etc.) | `IDEMPOTENCY_KEY_CONFLICT` — clean error, no DB access |

`findRefundByIdempotencyKey` is retained in the repository for other potential uses (e.g., listing) but is **not used** in the primary idempotency check.

---

## 4. Transaction-Scoped Idempotency Flow (Task 2)

### Problem

The idempotency check ran **outside** `db.transaction`. Two concurrent requests with the same key could both pass the check simultaneously, then both enter the transaction and attempt to insert — the second hitting the unique constraint with a raw DB error.

### Fix

The new execution flow:

```text
db.transaction(tx):
  originalTx = txRepo.lockByIdForUpdate(transactionId, tenantId, tx)   // Step 1: lock row
  if !originalTx → throw TRANSACTION_NOT_FOUND

  if idempotencyKey:                                                     // Step 2: check inside tx
    existingTx = txRepo.findByIdempotencyKey(tenantId, key, tx)
    if existingTx:
      if is_replay(existingTx, originalTx.id) → return replay result
      else → throw IDEMPOTENCY_KEY_CONFLICT

  validate original tx (succeeded, incoming, payment|deposit|settlement) // Step 3
  intentRow = intentRepo.lockForUpdate(paymentIntentId, tenantId, tx)    // Step 4
  alreadyRefunded = txRepo.sumRefundedForParent(originalTx.id, tx)       // Step 5
  refundableRemaining = originalAmount - alreadyRefunded
  validate amount <= refundableRemaining

  try:                                                                    // Step 6
    refundRow = txRepo.create(...)
  catch UniqueConstraintError:
    throw IDEMPOTENCY_KEY_CONFLICT  (defensive)

  recalculate intent (Step 7)
  return result
```

**Lock ordering preserved:** `payment_transactions FOR UPDATE` → `payment_intents FOR UPDATE`. Consistent with Phase 3 to prevent deadlocks.

### Concurrency limitation

In-process concurrency (`Promise.all`) cannot reproduce the DB-level race in mock tests. The defensive `isUniqueConstraintError` catch in Step 6 handles the residual window between Step 2 (idempotency check) and Step 6 (insert). DB-backed integration tests are required to fully validate concurrent behavior; see section 9.

---

## 5. `refundableRemaining` Replay Fix (Task 3)

### Bug

```text
// BUGGY original code:
refundableRemaining = existingRefund.amount - alreadyRefunded

// Example:
//   original amount: 100,000
//   existing refund: 30,000
//   total refunded for parent: 30,000
//   → buggy result: 30,000 - 30,000 = 0   ← WRONG
//   → correct result: 100,000 - 30,000 = 70,000
```

### Fix

```typescript
const originalAmount = parseFloat(originalTx.amount);
const totalRefunded = await this.txRepo.sumRefundedForParent(originalTx.id, tenantId, tx);
return {
  ...
  refundableRemaining: Math.max(0, originalAmount - totalRefunded),
};
```

The fix is inside the transaction after locking `originalTx`, so `originalTx.amount` is the locked, authoritative value. `sumRefundedForParent` also runs inside the transaction, reading consistent data.

---

## 6. Defensive Unique Constraint Catch (Task 4)

```typescript
function isUniqueConstraintError(err: any): boolean {
  const code = err?.code ?? err?.cause?.code ?? '';
  const msg = (err?.message ?? err?.cause?.message ?? '').toLowerCase();
  return (
    code === '23505' ||
    msg.includes('unique constraint') ||
    msg.includes('unique violation') ||
    msg.includes('payment_transactions_tenant_idempotency_unique')
  );
}
```

- PostgreSQL unique violation code `23505` is matched on `err.code` or `err.cause.code` (Drizzle nests the pg error in some versions).
- String fallback ensures resilience if the pg driver version changes the error structure.
- Non-unique errors are re-thrown unchanged so they surface normally.
- Raw `23505` messages are never forwarded to API clients.

---

## 7. `.replit` Decision (Task 5)

**`.replit` was NOT changed in Phase 4.**

MD5 hash comparison confirms the file is identical between the Phase 4 base commit (`bc8fd1d`) and the current HEAD. The Phase 4 base report omission was a non-issue — there is no scope drift to document.

---

## 8. Tests Added / Updated (Task 6)

File: `apps/api/src/__tests__/payment-engine-phase4.test.ts`

New hardening test IDs:

| ID | Test | Covers |
|----|------|--------|
| H1 | Idempotent replay — same key + same original tx | Task 1, 2 |
| H2 | Replay refundableRemaining = 70k (not 0) for 30k refund on 100k tx | Task 3 |
| H3 | Replay after full refund → refundableRemaining = 0 | Task 3 |
| H4 | Key used by incoming payment → IDEMPOTENCY_KEY_CONFLICT | Task 1 |
| H5 | Key used by refund for different parent → IDEMPOTENCY_KEY_CONFLICT | Task 1 |
| H6 | Key used by non-refund outgoing tx (void) → IDEMPOTENCY_KEY_CONFLICT | Task 1 |
| H7 | Idempotency check runs inside tx, after row lock | Task 2 |
| H8 | DB unique constraint error → clean IDEMPOTENCY_KEY_CONFLICT | Task 4 |
| H9 | Non-unique DB error passes through unchanged | Task 4 |
| H10 | Concurrent simulation — second call replays safely | Task 2, 3 |

All 10 previous Phase 4 tests (Section 1–2, VoidPaymentTransaction, e2e) are preserved.

---

## 9. Commands Run

```bash
# Type checking
npm run check   →  10/10 tasks successful, 0 errors

# Phase 4 hardening tests
tsx --tsconfig apps/api/tsconfig.node.json --test apps/api/src/__tests__/payment-engine-phase4.test.ts
  → 39 tests, 5 suites, 0 failures

# Phase 1 regression tests
tsx --tsconfig apps/api/tsconfig.node.json --test apps/api/src/__tests__/payment-engine.test.ts
  → 49 tests, 14 suites, 0 failures

# Phase 3 regression tests
tsx --tsconfig apps/api/tsconfig.node.json --test apps/api/src/__tests__/payment-engine-phase3.test.ts
  → 38 tests, 7 suites, 0 failures
```

DB-backed concurrency tests are not run in CI. To test the actual DB-level race:
```bash
tsx --tsconfig apps/api/tsconfig.node.json --test apps/api/src/__tests__/payment-engine-db-concurrency.test.ts
```
(Requires a live Postgres DB; the test is excluded from standard CI.)

---

## 10. Known Limitations

1. **DB-backed concurrency gap**: The in-transaction idempotency check + defensive catch covers the race for a single DB node. Under extreme network partitions or multi-master setups, a brief window remains. For the current architecture (single Postgres primary), this is acceptable.

2. **`findRefundByIdempotencyKey` retained but unused in primary path**: It remains in `IPaymentTransactionRepository` for potential future use (reporting, admin). It is not called by `RefundPaymentTransaction`.

3. **No integration test for `.replit`**: Confirmed via `git show` + `md5sum` comparison; no automated check.

---

## 11. Legacy Order Payment Flow — Not Changed

The following files were **not touched** in this hardening pass:

- `/api/orders/:id/payments` route
- `/api/orders/create-and-pay` route
- `packages/application/orders/RecordPayment.ts`
- `packages/application/orders/CreateAndPayOrder.ts`
- `apps/api/src/http/routes/orders.ts`
- `order_payments` table behavior

---

## 12. Phase 5+ Features — Not Implemented

This hardening pass does **not** implement:

- Phase 5 reconciliation
- Real provider refund APIs (Midtrans, Xendit, Stripe)
- Order adapter
- POS UI refund integration
- Split bill, customer ledger, stock reservation, PPOB
