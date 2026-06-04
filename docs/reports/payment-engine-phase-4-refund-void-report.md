# Payment Engine Phase 4 — Refund / Void Base Lifecycle
## Implementation Report

**Date:** June 2026  
**Phase:** 4 of N  
**Status:** ✅ Complete

---

## 1. Overview

Phase 4 implements the Refund and Void base lifecycle for the AuraPoS Payment Engine.
It adds a nullable self-reference column `parent_transaction_id` to `payment_transactions`,
introduces two new use cases (`RefundPaymentTransaction`, `VoidPaymentTransaction`),
fixes the `calculateIntentStatus` policy function to correctly derive refund-related
intent statuses, and exposes two new REST endpoints.

No real external provider API calls are made — all refund/void logic runs within the
engine itself, consistent with the Phase 4 spec ("base lifecycle, no real provider calls").

---

## 2. Changes by Layer

### 2.1 Database / Schema

| File | Change |
|------|--------|
| `shared/schema.ts` | Added nullable `parentTransactionId` column (self-referential FK) to `paymentTransactions`. Added `payment_transactions_parent_idx` index. |
| `migrations/0021_payment_transactions_parent_id.sql` | DDL: `ALTER TABLE payment_transactions ADD COLUMN parent_transaction_id uuid REFERENCES payment_transactions(id) ON DELETE SET NULL` + index. |
| `migrations/meta/_journal.json` | Added journal entry idx=11 for migration 0021. |

**Parent transaction ID semantics:**
- `NULL` on all original incoming payment transactions.
- Set on outgoing `refund` transactions to point at the original succeeded incoming transaction.
- `ON DELETE SET NULL` — if an original transaction is deleted, child refund rows lose their parent pointer but are not deleted.

### 2.2 Domain Layer

**`packages/domain/payments/types.ts`**
- Added `parentTransactionId: string | null` field to `DomainPaymentTransaction`.

**`packages/domain/payments/policy.ts`**  
Fixed `calculateIntentStatus` with correct Phase 4 priority order:

| Priority | Status | Condition |
|----------|--------|-----------|
| 1 | `refunded` | `amountPaid > 0` AND `amountRefunded >= amountPaid` |
| 2 | `partially_refunded` | `amountRefunded > 0` AND `amountRefunded < amountPaid` |
| 3 | `paid` | `amountRefunded = 0` AND `netPaid >= amountDue` |
| 4 | `partially_paid` | `netPaid > 0` AND `netPaid < amountDue` |
| 5 | `requires_payment` | fallthrough |

**Key invariants upheld:**
- `paid` is **never** returned when any refund has occurred.
- `amountRemaining` is **not** set to `0` after a full refund (`max(0, amountDue - amountPaid + amountRefunded) = amountDue`).
- Refund checks take priority over payment status checks.

**`packages/domain/payments/provider.ts`**  
Updated `ManualProvider` comments on `cancelPayment` / `refundPayment` to clarify the provider methods are intentionally unsupported; Phase 4 logic runs internally through use cases, not provider API calls.

### 2.3 Application Layer (Use Cases)

#### `packages/application/payments/RefundPaymentTransaction.ts`

**Input:** `{ tenantId, transactionId, amount, reason?, metadata?, idempotencyKey? }`  
**Output:** `{ refundTransaction: DomainPaymentTransaction, intent: DomainPaymentIntent, refundableRemaining: number }`

**Flow:**
1. Idempotency check (outside DB tx — safe read): if key exists and matches same parent → return existing refund. If key exists but different parent → `IDEMPOTENCY_KEY_CONFLICT`.
2. Open DB transaction.
3. `txRepo.lockByIdForUpdate(transactionId)` — acquire row lock on original tx.
4. Validate: status = `succeeded`, direction = `incoming`, transactionType ∈ `{payment, deposit, settlement}`.
5. `intentRepo.lockForUpdate(paymentIntentId)` — acquire intent lock.
6. `txRepo.sumRefundedForParent(transactionId)` — compute already-refunded amount.
7. Validate amount ≤ refundableRemaining.
8. `txRepo.create(...)` — insert outgoing refund transaction (status=`succeeded`, direction=`outgoing`, transactionType=`refund`, parentTransactionId=originalTx.id, succeededAt=now).
9. `recalculate.execute(...)` — update intent totals and status.
10. Return result.

**Lock ordering:** Transaction row → Intent row (consistent with Phase 3 to prevent deadlocks).

#### `packages/application/payments/VoidPaymentTransaction.ts`

**Input:** `{ tenantId, transactionId, reason?, metadata?, idempotencyKey? }`  
**Output:** `{ transaction: DomainPaymentTransaction, intent: DomainPaymentIntent }`

**Flow:**
1. Open DB transaction.
2. `txRepo.lockByIdForUpdate(transactionId)` — acquire row lock.
3. Check if already `voided`: if idempotency key matches → return success; otherwise → `INVALID_TRANSITION`.
4. Guard: `succeeded` → `INVALID_TRANSITION` (use refund instead).
5. Guard: `{failed, cancelled, refunded}` → `INVALID_TRANSITION` (terminal states).
6. Allowed statuses: `{pending, requires_action}`.
7. `intentRepo.lockForUpdate(paymentIntentId)` — acquire intent lock.
8. `txRepo.update(...)` — set `status=voided`, `cancelledAt=now`, merge metadata.
9. No intent recalculation needed — pending/voided transactions were never counted in `aggregateTransactionTotals` (only `succeeded` rows count).
10. Return result.

#### Other Application Layer Updates

- `ListPaymentTransactions.ts` / `txRowToDomain`: Added `parentTransactionId: row.parentTransactionId ?? null` field mapping.
- `RecalculatePaymentIntent.ts`: Removed stale "Phase 4 note" comment, updated `amountRemaining` formula comment.
- `index.ts`: Exported `RefundPaymentTransaction` and `VoidPaymentTransaction`.

### 2.4 Infrastructure Layer

**`packages/infrastructure/repositories/payments/PaymentTransactionRepository.ts`**

New methods added to `IPaymentTransactionRepository` interface and implementation:

| Method | Purpose |
|--------|---------|
| `lockByIdForUpdate(id, tenantId, tx)` | Phase 4: acquire `FOR UPDATE` lock by PK+tenant. Used by Refund + Void. |
| `sumRefundedForParent(parentTxId, tenantId, tx?)` | Phase 4: sum of `succeeded` outgoing `refund` amounts for a parent. |
| `findRefundByIdempotencyKey(tenantId, key, tx?)` | Phase 4: find outgoing refund tx by idempotency key (pre-transaction idempotency check). |
| `findByParentTransactionId(parentTxId, tenantId, tx?)` | Phase 4: list all child transactions of a parent. |

### 2.5 HTTP Layer

**New endpoints:**

| Method | Path | Handler |
|--------|------|---------|
| `POST` | `/api/payment-engine/transactions/:id/refund` | `refundTransaction` |
| `POST` | `/api/payment-engine/transactions/:id/void` | `voidTransaction` |

**Refund request body:**
```json
{
  "amount": 50000,
  "reason": "Customer requested partial refund",
  "idempotency_key": "refund-order-123-v1"
}
```

**Void request body:**
```json
{
  "reason": "Customer cancelled before payment completed",
  "idempotency_key": "void-order-123-v1"
}
```

**HTTP status codes:**
- `201` — Refund created successfully
- `200` — Void succeeded / idempotent replay
- `400` — Validation error
- `404` — Transaction not found
- `409` — Idempotency key conflict (refund only)
- `422` — Invalid transition / amount exceeds refundable

### 2.6 DI Container

`apps/api/src/container.ts` wired up:
- `refundPaymentTransaction: new RefundPaymentTransaction(db, intentRepo, txRepo, recalculate)`
- `voidPaymentTransaction: new VoidPaymentTransaction(db, intentRepo, txRepo)`

---

## 3. Design Decisions

### 3.1 amountRemaining after full refund = amountDue (not 0)

After a full refund (`amountPaid = amountRefunded`), `amountRemaining = max(0, amountDue - amountPaid + amountRefunded) = amountDue`. This is intentional:
- Prevents the misleading reading "nothing owed" on a fully-refunded intent.
- Signals the intent is back to requiring the original payment if re-payment is needed.

### 3.2 Void does not recalculate intent

Pending transactions are never counted in `aggregateTransactionTotals` (only `succeeded` rows count). Therefore, voiding a pending transaction does not change `amountPaid` or `amountRefunded`, and no recalculation is needed. The intent state remains valid.

### 3.3 Lock ordering

`payment_transactions FOR UPDATE` is always acquired before `payment_intents FOR UPDATE`. This ordering is consistent with Phase 3 (`ConfirmFakeGatewayPayment`, `ApplyGatewayTransactionStatus`) and prevents deadlocks when multiple concurrent refund/payment operations target the same intent.

### 3.4 Idempotency scope for refunds

Idempotency keys for refunds are checked against the `direction=outgoing, transactionType=refund` namespace specifically via `findRefundByIdempotencyKey`. This prevents cross-namespace collisions between a payment idempotency key and a refund idempotency key that happen to be the same string.

### 3.5 No real provider API calls

`ManualProvider.refundPayment` and `ManualProvider.cancelPayment` remain as stubs that return `success: false`. Phase 4 refund/void lifecycle is entirely internal. Real provider API calls (Midtrans `POST /v2/{orderId}/refund`, Xendit `POST /refunds`, etc.) will be implemented in a future phase as part of gateway refund integration.

---

## 4. Test Coverage

File: `apps/api/src/__tests__/payment-engine-phase4.test.ts`

| Section | Tests |
|---------|-------|
| `calculateIntentStatus` — Phase 4 rules | 9 cases |
| `aggregateTransactionTotals` — refund rows | 3 cases |
| `RefundPaymentTransaction` | 7 cases |
| `VoidPaymentTransaction` | 7 cases |
| Intent status lifecycle (pay → refund) | 3 cases |
| **Total** | **29 test cases** |

All tests use in-memory mocks — no real database connection required.

---

## 5. Backwards Compatibility

- All existing Phase 1–3 tests remain unaffected. The `calculateIntentStatus` fix only changes behavior for cases that involved refunds (which were untested / unreachable in Phase 1–3).
- `DomainPaymentTransaction.parentTransactionId` is a new nullable field; all existing code that constructs `DomainPaymentTransaction` objects will receive `null` from `txRowToDomain` for the new field, which is correct.
- `InsertPaymentTransaction` schema change (`parentTransactionId` is optional/nullable) — all existing inserts that omit the field will default to `null`.

---

## 6. Future Work (Phase 5+)

- Real provider refund API calls (Midtrans, Xendit, Stripe, etc.).
- `VoidPaymentTransaction` calling `provider.cancelPayment()` for gateway transactions.
- Refund allocations — tracking which allocation is being reversed.
- Webhook-driven refund confirmation (for async provider refunds).
- Admin UI for refund/void operations.
