# Payment Orchestration Phase 8C — Standalone DB Schema + Repository Boundary

**Date:** 2026-06-05  
**Phase:** 8C  
**Based on:** Phase 8B (core contract adoption)  
**Status:** ✅ Complete

---

## Summary

Phase 8C establishes the standalone persistence boundary for the Northflow Payment Orchestration
service. Six new `payment_orchestration_*` tables, six repository port interfaces, six skeleton
repository classes with full type signatures, and six row→DTO mapper functions were added.
All 56 mapper unit tests pass. All type checks pass. No existing embedded payment engine
table, route, or provider behavior was modified.

---

## Files Changed

### New files

| File | Purpose |
|------|---------|
| `migrations/0022_payment_orchestration_standalone.sql` | Migration SQL for all 6 standalone tables |
| `packages/payment-orchestration-core/src/application/repositories.ts` | Core repository port interfaces |
| `apps/payment-orchestration-service/src/infrastructure/repositories/mappers.ts` | DB row → core DTO mappers |
| `apps/payment-orchestration-service/src/infrastructure/repositories/DrizzlePaymentMerchantRepository.ts` | Skeleton repository |
| `apps/payment-orchestration-service/src/infrastructure/repositories/DrizzlePaymentProviderAccountRepository.ts` | Skeleton repository |
| `apps/payment-orchestration-service/src/infrastructure/repositories/DrizzlePaymentIntentRepository.ts` | Skeleton repository |
| `apps/payment-orchestration-service/src/infrastructure/repositories/DrizzlePaymentTransactionRepository.ts` | Skeleton repository |
| `apps/payment-orchestration-service/src/infrastructure/repositories/DrizzlePaymentProviderEventRepository.ts` | Skeleton repository |
| `apps/payment-orchestration-service/src/infrastructure/repositories/DrizzlePaymentIdempotencyRepository.ts` | Skeleton repository |
| `apps/api/src/__tests__/payment-orchestration-schema-mappers.test.ts` | 56 mapper unit tests |
| `docs/reports/payment-orchestration-phase-8c-standalone-db-repository-boundary-report.md` | This report |

### Modified files

| File | Change |
|------|--------|
| `shared/schema.ts` | Added 6 `payment_orchestration_*` table definitions under clearly separated section |
| `packages/payment-orchestration-core/src/index.ts` | Exported repository interfaces and domain DTOs added in Phase 8C |
| `packages/payment-orchestration-core/src/domain/PaymentIntent.ts` | Added `StandalonePaymentIntentDTO`, `StandaloneIntentStatus` |
| `packages/payment-orchestration-core/src/domain/PaymentTransaction.ts` | Added `StandalonePaymentTransactionDTO`, `StandaloneTransactionStatus` |
| `packages/payment-orchestration-core/src/domain/PaymentProviderEvent.ts` | Added `PaymentProviderEventDTO`, `ReserveProviderEventInput`, etc. |
| `packages/payment-orchestration-core/src/domain/PaymentIdempotencyKey.ts` | Added `PaymentIdempotencyKeyDTO` and input types |
| `apps/api/tsconfig.json` | Added `allowImportingTsExtensions: true` (required for `.ts` imports in tests) |
| `docs/payment-orchestration-hybrid-standalone-architecture.md` | Added Phase 8C section |

---

## Tables Added

All 6 tables use `payment_orchestration_` prefix. None use `tenant_id` as a column name.

### `payment_orchestration_merchants`
- Primary standalone merchant identity
- `merchant_id` = text slug (e.g. `merchant-aurapos-demo`)
- Partial unique: `(source_app, external_ref)` where both non-null
- Index on `status`

### `payment_orchestration_provider_accounts`
- Links merchants to payment providers
- `credentials_ref` = opaque env/secret reference only — **no raw API keys stored**
- Partial unique: `(merchant_id, provider, environment, provider_account_ref)` where `provider_account_ref` non-null

### `payment_orchestration_intents`
- Standalone payment intents
- `merchant_id` = primary owner identity
- `external_tenant_id`, `external_outlet_id`, `external_location_id` = source-app correlation refs only
- `external_payable_type` + `external_payable_id` = the thing being paid for (e.g. AuraPoS order)
- Check constraints: `amount_due >= 0`, `amount_paid >= 0`, `amount_refunded >= 0`, `amount_remaining >= 0`
- Partial unique: `(merchant_id, source_app, external_payable_type, external_payable_id)` where `source_app` non-null

### `payment_orchestration_transactions`
- Individual payment/refund/void/settlement transactions
- Self-referential: `parent_transaction_id` for refund/void chains
- `direction` values: `incoming` | `outgoing`
- `transaction_type` values: `payment` | `deposit` | `refund` | `void` | `settlement` | `adjustment`
- Partial unique: `(merchant_id, idempotency_key)` where non-null; `(provider, provider_reference)` where non-null
- Check constraint: `amount >= 0`

### `payment_orchestration_provider_events`
- Inbound provider webhooks
- `merchant_id` is **nullable**: real provider webhooks carry no merchant header; backfilled after `provider_reference` resolves
- Global dedup: `unique(provider, provider_event_id)`
- Indexes on `processing_status`, `received_at` for stale-event queries

### `payment_orchestration_idempotency_keys`
- Tracks idempotency for standalone create-intent / create-payment calls
- `unique(merchant_id, scope, idempotency_key)` as primary dedup constraint
- Not wired into live use cases until Phase 8D

---

## Repository Ports Added

File: `packages/payment-orchestration-core/src/application/repositories.ts`

| Interface | Methods |
|-----------|---------|
| `PaymentMerchantRepository` | `findById`, `findByExternalRef`, `create`, `updateStatus` |
| `PaymentProviderAccountRepository` | `findById`, `findByMerchantAndProvider`, `create`, `updateStatus` |
| `PaymentIntentRepository` | `findById`, `findByExternalPayable`, `create`, `updateTotals`, `updateStatus` |
| `PaymentTransactionRepository` | `findById`, `findByIntentId`, `findByProviderReference`, `create`, `updateStatus`, `sumSucceededRefundsByParent` |
| `PaymentProviderEventRepository` | `reserveEvent`, `findByProviderEventId`, `assignMerchant`, `markProcessed`, `markFailed`, `findStalePending` |
| `PaymentIdempotencyRepository` | `reserve`, `find`, `markCompleted`, `markFailed` |

All interfaces use `merchantId` as primary identity. No `tenantId` in any interface signature.

---

## Repository Skeletons / Mappers Added

### Skeleton classes (Phase 8D will implement)

All 6 `Drizzle*Repository` classes implement the core port interfaces with full method signatures.
All methods throw `Error('Not implemented until Phase 8D')`. Full TypeScript interface compliance verified.

### Mappers (Phase 8C — fully implemented)

| Mapper | Input | Output |
|--------|-------|--------|
| `mapMerchantRow` | `MerchantRow` | `PaymentMerchant` |
| `mapProviderAccountRow` | `ProviderAccountRow` | `PaymentProviderAccount` |
| `mapIntentRow` | `IntentRow` | `StandalonePaymentIntentDTO` |
| `mapTransactionRow` | `TransactionRow` | `StandalonePaymentTransactionDTO` |
| `mapProviderEventRow` | `ProviderEventRow` | `PaymentProviderEventDTO` |
| `mapIdempotencyKeyRow` | `IdempotencyKeyRow` | `PaymentIdempotencyKeyDTO` |

---

## Migration Status

**Migration file generated:** `migrations/0022_payment_orchestration_standalone.sql`

- Contains only `CREATE TABLE IF NOT EXISTS` and `CREATE INDEX IF NOT EXISTS` — fully idempotent
- Does **not** modify any existing table
- Auto-applied by `runMigrationAsync()` on next server startup
- To apply manually: `psql $DATABASE_URL -f migrations/0022_payment_orchestration_standalone.sql`

---

## Tests Added / Updated

### New tests

**File:** `apps/api/src/__tests__/payment-orchestration-schema-mappers.test.ts`

**Runner:** `npx tsx --tsconfig apps/api/tsconfig.node.json --test <file>`

| Suite | Tests | Result |
|-------|-------|--------|
| `mapMerchantRow` | 6 | ✅ PASS |
| `mapProviderAccountRow` | 6 | ✅ PASS |
| `mapIntentRow` | 11 | ✅ PASS |
| `mapTransactionRow` | 10 | ✅ PASS |
| `mapProviderEventRow` | 9 | ✅ PASS |
| `mapIdempotencyKeyRow` | 8 | ✅ PASS |
| `No tenantId in any mapper output` | 6 | ✅ PASS |
| **Total** | **56** | **✅ 56/56 PASS** |

No live DB required. Pure unit tests on mapper functions.

---

## Commands Run

| Command | Result |
|---------|--------|
| `npx tsx --tsconfig apps/api/tsconfig.node.json --test apps/api/src/__tests__/payment-orchestration-schema-mappers.test.ts` | ✅ 56/56 pass |
| `npx tsx --tsconfig apps/api/tsconfig.node.json --test apps/api/src/__tests__/payment-orchestration-core-contract-adapter.test.ts` | ✅ 14/14 pass |
| `pnpm --filter @northflow/payment-orchestration-core type-check` | ✅ Pass |
| `pnpm --filter @northflow/payment-orchestration-service type-check` | ✅ Pass |
| `npm run check` (full monorepo) | ✅ Pass (after adding `allowImportingTsExtensions: true` to `apps/api/tsconfig.json`) |
| Xendit sandbox smoke test | ⏭️ Not run — no live Xendit credentials configured (expected) |

---

## Known Limitations

1. **Repository skeletons throw** — all `Drizzle*Repository` methods throw until Phase 8D
   wires real Drizzle queries. This is intentional.
2. **No DB integration test** — mapper tests are pure unit tests; no live DB round-trip
   until Phase 8D.
3. **Migration auto-applied on startup** — the `runMigrationAsync()` runner will apply
   `0022_payment_orchestration_standalone.sql` automatically. Any Postgres transient error
   on the migration run will be logged but will not crash the server.
4. **`allowImportingTsExtensions`** added to `apps/api/tsconfig.json` — required because
   the schema-mappers test imports from a cross-package `.ts` path directly. This is
   acceptable since `noEmit: true` is set in the same tsconfig.

---

## Explicit Confirmations

| Confirmation | Status |
|-------------|--------|
| No existing embedded payment table (`payment_intents`, `payment_transactions`, `payment_allocations`, `payment_provider_events`) was intentionally modified | ✅ Confirmed |
| No legacy order payment flow (`/api/orders/:id/payments`, `order_payments`, `RecordPayment.ts`, `CreateAndPayOrder.ts`) was intentionally changed | ✅ Confirmed |
| No real provider behavior changed | ✅ Confirmed |
| Xendit sandbox adapter remains intact | ✅ Confirmed |
| FakeGateway remains intact | ✅ Confirmed |
| Provider-level refund/cancel was NOT implemented | ✅ Confirmed |
| `apps/payment-orchestration-service` remains skeleton; all routes still 501 | ✅ Confirmed |
| Embedded `/api/payment-engine/...` remains runtime source of truth for all live payments | ✅ Confirmed |
| No POS UI changes, no order adapter, no split bill, no customer ledger | ✅ Confirmed |
| No AuraPoS SDK consumption | ✅ Confirmed |
