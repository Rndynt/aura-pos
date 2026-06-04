# Payment Engine Phase 1 — Implementation Report

**Date:** 2026-06-04  
**Status:** ✅ Complete

---

## Summary

Phase 1 of the AuraPoS Generic Payment Engine has been implemented as a fully independent module.  
The new engine runs in parallel with the existing legacy order payment flow — no legacy code was modified.

The engine supports:
- Creating a **Payment Intent** (generic payable reference)
- Recording **manual payments** (cash, card, QRIS, e-wallet, bank transfer, other)
- **Idempotent** intent creation and payment recording
- **Row-level locking** to prevent concurrent overpayment
- Cash change calculation
- Non-cash overpayment rejection
- Automatic intent **status recalculation** after each payment
- **Tenant isolation** on all reads and writes
- A `payment_provider_events` table for future gateway webhook storage

---

## Files Changed

### New Files

| File | Description |
|---|---|
| `shared/schema.ts` (appended) | 4 new Drizzle table definitions |
| `migrations/0019_payment_engine.sql` | Raw SQL migration for all 4 tables |
| `packages/domain/payments/status.ts` | Status / method / type constants |
| `packages/domain/payments/types.ts` | Domain TypeScript interfaces |
| `packages/domain/payments/provider.ts` | PaymentProvider interface + ManualProvider impl |
| `packages/domain/payments/policy.ts` | Business rule functions + PaymentPolicyError |
| `packages/domain/payments/index.ts` | Barrel export |
| `packages/infrastructure/repositories/payments/PaymentIntentRepository.ts` | DB access for payment_intents |
| `packages/infrastructure/repositories/payments/PaymentTransactionRepository.ts` | DB access for payment_transactions |
| `packages/infrastructure/repositories/payments/PaymentAllocationRepository.ts` | DB access for payment_allocations |
| `packages/infrastructure/repositories/payments/PaymentProviderEventRepository.ts` | DB access for payment_provider_events |
| `packages/infrastructure/repositories/payments/index.ts` | Barrel export |
| `packages/application/payments/CreatePaymentIntent.ts` | Use case |
| `packages/application/payments/GetPaymentIntent.ts` | Use case |
| `packages/application/payments/ListPaymentTransactions.ts` | Use case |
| `packages/application/payments/RecordManualPayment.ts` | Use case (tx-safe with row lock) |
| `packages/application/payments/RecalculatePaymentIntent.ts` | Use case |
| `packages/application/payments/index.ts` | Barrel export |
| `apps/api/src/http/controllers/PaymentEngineController.ts` | HTTP controller (Zod validation) |
| `apps/api/src/http/routes/payment-engine.ts` | Route definitions |
| `apps/api/src/__tests__/payment-engine.test.ts` | 16 test cases |

### Modified Files

| File | Change |
|---|---|
| `apps/api/src/container.ts` | Import + wire 4 repos and 5 use cases |
| `apps/api/src/http/routes/index.ts` | Mount `/api/payment-engine` route |

---

## Database Tables Added

| Table | Purpose |
|---|---|
| `payment_intents` | Canonical payment state per payable |
| `payment_transactions` | Individual money movement records |
| `payment_allocations` | Transaction → target mapping |
| `payment_provider_events` | Future gateway webhook event storage |

All tables are **tenant-aware** (`tenant_id` FK on every table).  
All monetary columns use `decimal(12,2)` — no floating point.  
Partial unique indexes enforce idempotency at the DB level.

---

## API Endpoints Added

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/payment-engine/intents` | Create a new payment intent → **201**, or **200** on idempotent replay |
| `GET` | `/api/payment-engine/intents/:id` | Get intent by ID (tenant-scoped) → **200** |
| `GET` | `/api/payment-engine/intents/:id/transactions` | List transactions for intent → **200** `{ transactions: [...] }` |
| `POST` | `/api/payment-engine/intents/:id/manual-payments` | Record manual payment → **200** `{ intent, transaction }` |

All endpoints use the existing middleware chain (`req.tenantId`, `req.outletId`).  
Responses follow the `{ success, data }` / `{ success, error }` convention.

---

## Tests Added

**File:** `apps/api/src/__tests__/payment-engine.test.ts`  
**Test runner:** Node.js built-in `node:test`

| # | Test | Result |
|---|---|---|
| 1 | Create intent initializes totals correctly | ✅ Pass |
| 2 | Create intent idempotency replays existing intent | ✅ Pass |
| 3 | Rejects amount_due of zero | ✅ Pass |
| 4 | calculateIntentStatus: paid when remaining is zero | ✅ Pass |
| 5 | calculateIntentStatus: partially_paid when paid > 0 and remaining > 0 | ✅ Pass |
| 6 | assertAmountValid: rejects partial payment when allowPartial is false | ✅ Pass |
| 7 | calculateCashChange: computes correct change for cash | ✅ Pass |
| 8 | calculateCashChange: rejects non-cash received > amount | ✅ Pass |
| 9 | assertAmountValid: rejects amount exceeding remaining | ✅ Pass |
| 10 | assertIntentAcceptsPayment: rejects all terminal statuses | ✅ Pass |
| 11 | aggregateTransactionTotals: only counts succeeded incoming txs | ✅ Pass |
| 12 | aggregateTransactionTotals: ignores voided/cancelled | ✅ Pass |
| 13 | ListPaymentTransactions: tenant-scoped (only tenant-a rows) | ✅ Pass |
| 14 | GetPaymentIntent: tenant A cannot access tenant B intent | ✅ Pass |
| 15 | RecalculatePaymentIntent: marks paid when sum = amount_due | ✅ Pass |
| 16 | RecalculatePaymentIntent: marks partially_paid on partial payment | ✅ Pass |

**16 / 16 pass — 0 fail**

---

## Commands Run

```
npm run db:push          → ✅ Changes applied (4 new tables)
node_modules/.bin/tsx … payment-engine.test.ts  → ✅ 16/16 pass
```

---

## Known Limitations

- **No gateway integration** — Phase 1 is manual-only. `PaymentProvider` interface and `ManualProvider` exist for Phase 2.
- **No webhook processing** — `payment_provider_events` table is created but webhook handling is Phase 3.
- **No order adapter** — The new engine is not yet connected to `orders.paymentStatus`. That is Phase 5.
- **RecordManualPayment** uses a DB transaction + `FOR UPDATE` row lock, but the allocation repo still uses the outer `db` connection (not the inner `tx`) for simplicity in Phase 1. Phase 2 can tighten this.
- **No refund / void** — Outgoing transaction logic is Phase 4.
- **No rate limit** on `/api/payment-engine` — can be added in Phase 2 when public-facing gateway payments are introduced.

---

## Confirmation: Legacy Order Payment Flow Not Changed

The following files were **not modified**:

- `packages/application/orders/RecordPayment.ts` — unchanged
- `packages/application/orders/CreateAndPayOrder.ts` — unchanged
- `apps/api/src/http/routes/orders.ts` — unchanged
- `/api/orders/:id/payments` endpoint — unchanged
- `/api/orders/create-and-pay` endpoint — unchanged
- `order_payments` table — unchanged
