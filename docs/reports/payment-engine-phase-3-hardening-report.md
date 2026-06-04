# Payment Engine Phase 3 — Hardening Report

**Date:** 2026-06-04  
**Status:** ✅ Complete  
**Tests:** 83/83 pass (38 Phase 3 + 45 Phase 2 regression)  
**TypeScript:** 0 errors (`tsc --noEmit`)

---

## Summary

Phase 3 Hardening addresses six reviewed risks in the webhook/event processing pipeline before any real payment gateway is integrated. No legacy order payment behavior was modified. No Phase 4+ features were implemented.

---

## Confirmation

- ✅ `/api/orders/:id/payments` — not changed
- ✅ `/api/orders/create-and-pay` — not changed
- ✅ `RecordPayment.ts` — not changed
- ✅ `CreateAndPayOrder.ts` — not changed
- ✅ `apps/api/src/http/routes/orders.ts` — not changed
- ✅ `order_payments` legacy table behavior — not changed
- ✅ No refund/void flow implemented
- ✅ No real Midtrans/Xendit/Stripe integration
- ✅ No real provider credentials
- ✅ No order adapter integration, POS UI changes, split bill, customer ledger, stock reservation, or PPOB

---

## package.json Note

The root `package.json` `dev` script was **not changed** in Phase 3 or Phase 3 Hardening. Current value:

```json
"dev": "NODE_ENV=development ./node_modules/.bin/tsx --tsconfig apps/api/tsconfig.node.json apps/api/src/index.ts"
```

No webhook-related modification was made to any `package.json` scripts.

---

## Task 1 — Safe Provider Event Reservation/Upsert

### Risk (before hardening)

`HandlePaymentProviderWebhook` inserted into `payment_provider_events` inside a `db.transaction()` using a plain `INSERT`, then caught the unique constraint error in a `catch` block. In PostgreSQL, a statement error inside a transaction puts the transaction into an **aborted state** — any subsequent query (including the re-check SELECT) will fail with `current transaction is aborted`.

### Solution

Added `createOrGetByProviderEventId` to `IPaymentProviderEventRepository` and `PaymentProviderEventRepository`:

```ts
createOrGetByProviderEventId(
  data: InsertPaymentProviderEvent,
  tx?: any,
): Promise<{ event: PaymentProviderEvent; created: boolean }>
```

**Implementation:**

```sql
INSERT INTO payment_provider_events ... ON CONFLICT DO NOTHING RETURNING *
```

- If the INSERT returns a row → `{ event, created: true }` (new row).
- If the INSERT returns nothing (conflict) → SELECT the existing row → `{ event, created: false }`.
- `ON CONFLICT DO NOTHING` does **not** raise an error in PostgreSQL. The transaction stays active.

**Usage in `HandlePaymentProviderWebhook`:**

The event INSERT was moved **outside** the `db.transaction()` call. The DB transaction only handles the status update (markProcessed/markIgnored/markFailed) and the payment mutation. This means:

- No unique-violation error can abort an active transaction.
- If the DB transaction rolls back, the event row remains committed with `processingStatus = 'pending'` (see Known Limitations).

---

## Task 2 — Safe Behavior for Existing Pending Events

### Risk (before hardening)

If an event row existed with `processingStatus = 'pending'` (e.g. from a previous request where the DB transaction rolled back), the existing Step 4 idempotency check would see it and proceed to a new INSERT (since the code only returned early for non-pending statuses). The duplicate INSERT would then hit the unique constraint inside the DB transaction — triggering the aborted-transaction problem described in Task 1.

### Solution

After Task 1's refactoring, `createOrGetByProviderEventId` is called before the DB transaction. If `created: false` is returned (row already exists in **any** status, including `pending`), the use case immediately returns `idempotent_replay`:

```ts
const { event, created } = await this.eventRepo.createOrGetByProviderEventId({ ... });
if (!created) {
  return { outcome: 'idempotent_replay', eventId: event.id };
}
```

**Policy:** Stale `pending` events are NOT automatically retried in Phase 3 to prevent accidental double-processing. A safe stale-timeout retry policy with tests will be implemented in Phase 5+.

---

## Task 3 — Invalid Signature Audit

### Risk (before hardening)

Invalid signature attempts returned `{ outcome: 'invalid_signature', eventId: null }` without storing any record. Repeated or malicious invalid signature floods were invisible in the audit trail.

### Solution

Invalid signature attempts now create (or reuse) a `payment_provider_events` audit row **before** returning:

| Field | Value |
|---|---|
| `providerEventId` | `invalid_sig_<sha256(rawBody).hex()[0..31]>` |
| `eventType` | `invalid_signature` |
| `signatureValid` | `false` |
| `processingStatus` | `failed` |
| `errorMessage` | `INVALID_SIGNATURE` |
| `providerReference` | `null` |
| `tenantId` | route tenantId if available, else `null` |

**Deterministic ID:** The same raw body always maps to the same `providerEventId`. Repeated identical invalid signature attempts reuse the same audit row (no unbounded row growth).

**Non-fatal:** If `createOrGetByProviderEventId` fails for any reason, the error is swallowed and `invalid_signature` is still returned. The audit is best-effort.

**Output type updated:** `{ outcome: 'invalid_signature'; eventId: string | null }` — `eventId` is now non-null when the audit row is successfully stored.

---

## Task 4 — Valid Event Processing Atomicity

After Tasks 1–3, the processing flow remains correct and atomic:

| Scenario | Outcome |
|---|---|
| `payment.succeeded` — new event | `processed`: tx → `succeeded`, allocation created, intent recalculated |
| `payment.failed` — new event | `processed`: tx → `failed`, no allocation, intent unchanged |
| `payment.pending` / `ignored` event type | `ignored`: event marked ignored, no tx mutation |
| Event ID already exists (any status) | `idempotent_replay`: no second INSERT, no tx mutation |
| Transaction already in terminal state | `ignored` with `TRANSACTION_ALREADY_TERMINAL`: event marked ignored, no allocation |
| Transaction not found | `ignored` with `TRANSACTION_NOT_FOUND`: event marked failed |

**Lock ordering inside the DB transaction** (via `ApplyGatewayTransactionStatus`):
1. `SELECT ... FOR UPDATE` on `payment_transactions` row
2. `SELECT ... FOR UPDATE` on `payment_intents` row

This order is consistent with all other settlement flows and prevents deadlocks.

---

## Task 5 — Lock-Order Comment Correction

The comment in `ApplyGatewayTransactionStatus` previously stated:

> "Transaction row is ALWAYS locked before the intent row to maintain the same ordering used in ConfirmFakeGatewayPayment and **CreateGatewayPayment**, preventing deadlocks."

This was misleading: `CreateGatewayPayment` only creates a **pending** transaction row — it does not lock an existing transaction row. It only locks the `payment_intent` row. It does NOT follow the tx-row → intent-row settlement order because there is no existing tx row at that point.

**Corrected comment:**

```
Settlement flows ALWAYS lock payment_transactions BEFORE payment_intents.

Note: CreateGatewayPayment is NOT a settlement flow — it only creates a
pending transaction and only locks the payment_intent row (no existing
transaction row to lock yet).

All flows that mutate an existing transaction row (settlement, webhook,
confirmation) MUST acquire locks in this order:
  1. payment_transactions FOR UPDATE
  2. payment_intents FOR UPDATE
```

No behavior was changed — only the comment.

---

## Files Changed

| File | Change |
|---|---|
| `packages/infrastructure/repositories/payments/PaymentProviderEventRepository.ts` | Added `createOrGetByProviderEventId` to interface + implementation (Task 1) |
| `packages/application/payments/HandlePaymentProviderWebhook.ts` | Rewritten: event INSERT moved outside DB transaction, uses `createOrGetByProviderEventId`, invalid signature audit (Tasks 1, 2, 3, 4) |
| `packages/application/payments/ApplyGatewayTransactionStatus.ts` | Corrected lock-order comment (Task 5) |
| `apps/api/src/__tests__/payment-engine-phase3.test.ts` | Added `createOrGetByProviderEventId` to `makeFakeEventRepo`; updated `invalid_signature` test; added Suite 5b with 7 new hardening tests (Task 7) |
| `docs/reports/payment-engine-phase-3-webhook-engine-report.md` | Existing report (written with Phase 3 — no further changes needed; `package.json` is confirmed unchanged) |
| `docs/reports/payment-engine-phase-3-hardening-report.md` | **This file** |

---

## Tests Added / Updated

### Suite 5 — HandlePaymentProviderWebhook (updated)

- **`invalid_signature`** test updated: now asserts `eventId !== null`, checks audit row has `signatureValid=false`, `processingStatus=failed`, `errorMessage=INVALID_SIGNATURE`, and `providerEventId` starts with `invalid_sig_`.

### Suite 5b — HandlePaymentProviderWebhook Phase 3 Hardening (new, 7 tests)

| # | Test | Task |
|---|---|---|
| 1 | Repeated invalid signature for same payload reuses same audit event row | T3 |
| 2 | Invalid signature does not mutate any payment transaction or create allocation | T3 |
| 3 | Existing pending event returns `idempotent_replay` without mutating transaction | T2 |
| 4 | Duplicate event id after processing returns safe `idempotent_replay` without throwing | T1 |
| 5 | Different event id for already-succeeded tx is ignored without creating duplicate allocation | T4 |
| 6 | `payment.failed` event does not increase `amountPaid` on the intent | T4 |
| 7 | `payment.pending` provider event is ignored and does not mutate the transaction | T4 |

### `makeFakeEventRepo` (updated)

Added `createOrGetByProviderEventId` mock that simulates `ON CONFLICT DO NOTHING` behaviour:
- If `(provider, providerEventId)` already exists in the in-memory store → `{ event, created: false }`.
- Otherwise inserts and returns `{ event, created: true }`.
- Does NOT throw on duplicate — mirrors production PostgreSQL behaviour.

---

## Commands Run

```bash
# TypeScript check
cd apps/api && ./node_modules/.bin/tsc --noEmit
# → 0 errors

# Phase 2 + Phase 3 tests
cd apps/api && npx tsx --test \
  src/__tests__/payment-engine-phase2.test.ts \
  src/__tests__/payment-engine-phase3.test.ts
# → 83/83 pass, 0 fail
```

---

## Known Limitations (Phase 3)

1. **Orphaned pending events:** If the DB transaction rolls back after `createOrGetByProviderEventId` has committed, the event row stays with `processingStatus = 'pending'`. Retries receive `idempotent_replay` and cannot reprocess the event. A safe stale-timeout cleanup/retry job is deferred to Phase 5+.

2. **No tenant resolution for invalid signature audits:** The `tenantId` on invalid signature audit rows depends on the route context. For unauthenticated provider webhooks (future real providers), `tenantId` will be `null` in the audit row. This is acceptable and documented in the schema.

3. **No real gateway provider:** All hardening tests use `fake_gateway`. Real provider HMAC secrets and signature formats are not tested here and will be added in Phase 5+.

4. **`payment.pending` events are ignored, not queued:** Incoming `payment.pending` events are stored with `processingStatus = 'ignored'`. No polling or state-machine follow-up is implemented. A separate polling/reconciliation job is deferred to Phase 5+.
