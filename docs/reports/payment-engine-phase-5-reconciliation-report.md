# Payment Engine Phase 5 — Reconciliation & Stale Recovery Report

**Date:** 2026-06-04  
**Status:** Implemented  
**Scope:** Phase 5 of the AuraPoS Payment Engine roadmap

---

## 1. Overview

Phase 5 adds four reconciliation use cases, four HTTP endpoints, and the repository support methods needed to detect and heal stale or inconsistent payment state. All use cases run safely in parallel with live traffic because they:

- Default to **dryRun=true** — callers must explicitly opt in to mutations.
- Use **FOR UPDATE row locking** before any write to prevent concurrent double-processing.
- Isolate per-item errors so one bad row never aborts the rest of a batch.
- Enforce **tenant isolation** on every query and write.
- Guard money-movement paths so **invalid-signature events are never used to mutate transactions**.

---

## 2. Problem Context

### 2.1 Stale Provider Events (Phase 3 gap)

During Phase 3 webhook hardening, an event row is committed to `payment_provider_events` with `processingStatus='pending'` **before** the DB transaction that would mark it processed. If that DB transaction rolls back (network hiccup, constraint error, etc.), the event row stays permanently stuck in `pending` status and retries receive `idempotent_replay`, blocking further processing indefinitely.

**Phase 5 fix:** `ReprocessStaleProviderEvents` finds these orphaned rows and re-applies their gateway status using the stored `rawPayload`.

### 2.2 Stale Pending Transactions

Gateway payment transactions created but never settled (e.g. user abandoned a QRIS scan) accumulate with `status='pending'` or `'requires_action'`. These bloat the state and may cause intent status to appear `partially_paid` or `requires_payment` incorrectly if something went wrong.

**Phase 5 fix:** `ListStalePaymentTransactions` surfaces them for inspection; `ExpireStalePaymentTransactions` voids them (internal/fake providers only — real gateways require their own cancellation API, not implemented yet).

### 2.3 Intent Total Drift

Bugs, concurrent updates, or failed transactions can leave `amountPaid`/`amountRefunded`/`amountRemaining`/`status` on a `payment_intent` row out of sync with the actual transaction set.

**Phase 5 fix:** `ReconcilePaymentIntentTotals` recomputes all four fields from scratch for each intent and optionally corrects them.

---

## 3. Architecture

### 3.1 Repository Additions

#### `PaymentProviderEventRepository`
```
listStalePendingEvents(cutoffDate, { provider?, limit? })
```
- Filters: `processingStatus='pending'` AND `createdAt < cutoffDate`
- Optional `provider` filter for targeted remediation
- Default limit: 100; max configurable via `batchSize`

#### `PaymentTransactionRepository`
```
listStalePendingTransactions(cutoffDate, { tenantId?, provider?, limit? })
findAllByIntentIds(intentIds[], tenantId, tx?)
```
- `listStalePendingTransactions`: status IN `('pending','requires_action')` AND `createdAt < cutoffDate`
- `findAllByIntentIds`: single bulk query to avoid N+1 in `ReconcilePaymentIntentTotals`

#### `PaymentIntentRepository`
```
listByTenant(tenantId, { limit?, offset?, tx? })
listByIds(ids[], tenantId, tx?)
```
- `listByTenant`: paginated scan for per-tenant reconciliation jobs
- `listByIds`: targeted fetch when the caller supplies an explicit intent list

---

### 3.2 Use Cases

#### `ListStalePaymentTransactions` (read-only)
- Pure data retrieval — no mutations, no DB transaction
- Computes `ageMinutes` inline from `createdAt`
- Useful for monitoring dashboards and pre-expiry audit

#### `ReprocessStaleProviderEvents`
- Iterates stale pending events (oldest-first)
- **dry run:** returns the event list with no outcomes set; zero mutations
- **actual run:** for each event:
  1. `signatureValid=false` → `skipped_invalid_sig` (never touches money)
  2. Provider not in registry → `unsupported_provider`
  3. Re-parse `rawPayload` via `provider.parseWebhook`
  4. Resolve `tenantId` from event row or global TX lookup
  5. Run `ApplyGatewayTransactionStatus` inside a DB transaction
  6. `already_terminal` → mark event `ignored`
  7. `not_found` → mark event `failed`
  8. Success → mark event `processed`
- Per-event exceptions are caught and logged; the batch continues

#### `ExpireStalePaymentTransactions`
- **Internal-only safety guard:** `INTERNAL_PROVIDERS = {manual, cash, fake_gateway, internal}`
  - Real external providers are skipped with an explanatory message
- **dry run:** lists rows that would be voided, no mutations
- **actual run:** locks each row with `lockByIdForUpdate`, re-checks status under lock, sets `status='voided'` with `cancelledAt` and a descriptive `failureReason`
- Per-row exceptions are isolated; batch continues

#### `ReconcilePaymentIntentTotals`
- Fetches all intents for a tenant (or explicit list)
- **Single bulk query** via `findAllByIntentIds` to get all transactions — no N+1
- Uses the same `aggregateTransactionTotals` + `calculateIntentStatus` as `RecalculatePaymentIntent`
- Compares expected vs stored values with epsilon tolerance (`0.001`)
- **dry run:** returns `mismatches` list, `fixed=false`, no writes
- **actual run:** for each mismatch:
  1. Lock intent row with `lockForUpdate`
  2. Re-aggregate transactions inside the lock (fresh data)
  3. Call `intentRepo.update` with corrected values
  4. Errors per-intent are caught → `fixError` recorded, batch continues

---

### 3.3 HTTP Endpoints

All four endpoints live under `/api/payment-engine/reconciliation` and require **manager** role or higher (role hierarchy score ≥ 40). The `requirePaymentOperator` service-token bypass is intentionally NOT applied here — these are admin-only operations.

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/reconciliation/reprocess-stale-events` | Reprocess orphaned pending events |
| `GET`  | `/reconciliation/stale-transactions` | List stale pending/requires_action TXs |
| `POST` | `/reconciliation/expire-stale-transactions` | Void stale internal pending TXs |
| `POST` | `/reconciliation/reconcile-intent-totals` | Fix intent total/status drift |

**Request schemas with defaults:**

```json
// POST /reconciliation/reprocess-stale-events
{
  "cutoff_minutes": 15,   // events older than this
  "provider": "fake_gateway",  // optional
  "batch_size": 50,
  "dry_run": true          // ALWAYS defaults to true
}

// GET /reconciliation/stale-transactions?cutoff_minutes=30&provider=fake_gateway&limit=100

// POST /reconciliation/expire-stale-transactions
{
  "cutoff_minutes": 30,
  "provider": "fake_gateway",  // optional
  "batch_size": 50,
  "dry_run": true              // ALWAYS defaults to true
}

// POST /reconciliation/reconcile-intent-totals
{
  "intent_ids": ["uuid1", "uuid2"],  // optional — omit to check all intents
  "batch_size": 200,
  "dry_run": true                     // ALWAYS defaults to true
}
```

---

## 4. Safety Guarantees

### 4.1 dry_run defaults to true
Every mutating endpoint defaults to `dry_run: true`. Callers must explicitly set `"dry_run": false` to write. This prevents accidental mutations from tooling bugs or misconfigured cron jobs.

### 4.2 Invalid-signature events never touch money
`ReprocessStaleProviderEvents` checks `signatureValid` first. Events with `signatureValid=false` are immediately categorized as `skipped_invalid_sig` — the `ApplyGatewayTransactionStatus` use case is never called for them.

### 4.3 Real gateway transactions not expired
`ExpireStalePaymentTransactions` maintains a hardcoded allowlist: `{manual, cash, fake_gateway, internal}`. Any transaction from a real external gateway (Midtrans, Xendit, Stripe, etc.) is reported as `skipped` with an explanation. Real cancellations require the provider's cancellation API.

### 4.4 FOR UPDATE row locking
Both `ExpireStalePaymentTransactions` and `ReconcilePaymentIntentTotals` lock the target row before writing. Status is re-checked **under the lock** to detect concurrent settlement:
- If a TX was settled between the initial list and the lock → update is skipped (no double-void)
- If an intent was updated between the list and the lock → fresh re-aggregate is computed

### 4.5 Tenant isolation preserved
All repository queries include `tenantId` in WHERE conditions. The reconciliation endpoints read `req.tenantId!` from the request context (set by the tenant middleware). Cross-tenant operations are architecturally impossible.

### 4.6 Per-item error isolation
All three batch use cases catch exceptions per item and continue the batch. The output includes `error` / `skippedReason` / `fixError` fields so operators can identify which items failed without losing results for the rest of the batch.

---

## 5. Test Coverage

`apps/api/src/__tests__/payment-engine-phase5.test.ts` — 24 test cases across 5 describe blocks:

### Section 1: ListStalePaymentTransactions (4 tests)
- Empty repo → empty result
- Age minutes computed correctly from `createdAt`
- Query args (tenantId, provider, limit, cutoffDate) forwarded correctly
- String amounts parsed to number

### Section 2: ExpireStalePaymentTransactions (6 tests)
- Dry run: no mutations
- Real gateway provider: skipped with explanatory message
- `fake_gateway`: row locked, voided, result.voided incremented
- Row already settled under lock: skip without error
- `cash` and `manual` both treated as internal (voided)
- Per-row error isolation: one bad row → skipped, rest continues

### Section 3: ReconcilePaymentIntentTotals (7 tests)
- No mismatch: returns 0 totalMismatches
- Mismatch detected: stored vs expected values shown
- Dry run: `update` never called
- Actual run: fix applied, `fixed=true`
- `listByIds` used when `intentIds` provided
- Empty tenant: returns 0 checked
- Multi-intent bulk: `findAllByIntentIds` called once (no N+1)
- Fix error recorded without aborting batch

### Section 4: ReprocessStaleProviderEvents (8 tests)
- Dry run: no mutations, no outcome set
- `signatureValid=false`: `skipped_invalid_sig`
- Unknown provider: `unsupported_provider`
- Transaction already terminal: `ignored_terminal`, event marked ignored
- Success: event marked processed, `reprocessed` incremented
- Per-event error isolation
- tenantId resolved from global TX lookup
- Unresolvable tenantId: `failed`, event marked failed

### Section 5: Repository method contracts (2 tests)
- `listStalePendingTransactions` receives correct cutoff date and options
- `findAllByIntentIds` called exactly once for a multi-intent batch (N+1 guard)

---

## 6. Files Changed

### New files
- `packages/application/payments/ReprocessStaleProviderEvents.ts`
- `packages/application/payments/ListStalePaymentTransactions.ts`
- `packages/application/payments/ExpireStalePaymentTransactions.ts`
- `packages/application/payments/ReconcilePaymentIntentTotals.ts`
- `apps/api/src/__tests__/payment-engine-phase5.test.ts`
- `docs/reports/payment-engine-phase-5-reconciliation-report.md` (this file)

### Modified files
- `packages/infrastructure/repositories/payments/PaymentProviderEventRepository.ts`
  — Added `listStalePendingEvents` to interface + implementation; added `lt` to imports
- `packages/infrastructure/repositories/payments/PaymentTransactionRepository.ts`
  — Added `listStalePendingTransactions`, `findAllByIntentIds` to interface + implementation; added `inArray`, `lt` to imports
- `packages/infrastructure/repositories/payments/PaymentIntentRepository.ts`
  — Added `listByTenant`, `listByIds` to interface + implementation; added `inArray` to imports
- `packages/application/payments/index.ts`
  — Exported all 4 new use cases and their types
- `apps/api/src/container.ts`
  — Imported and wired all 4 use cases; added 4 public properties
- `apps/api/src/http/controllers/PaymentEngineController.ts`
  — Added 4 Zod schemas and 4 handler functions for reconciliation endpoints
- `apps/api/src/http/routes/payment-engine.ts`
  — Added `requireManager` import and 4 reconciliation routes

---

## 7. Known Limitations & Future Work

| Limitation | Future Phase |
|------------|-------------|
| Real gateway transactions cannot be expired — cancellation API not implemented | Phase 6+ |
| ~~`reprocessStaleProviderEvents` processes events for ALL tenants (no tenantId filter on the event repo query)~~ **Fixed in Phase 5 Hardening** | ✅ Done |
| No scheduled/cron job wiring — reconciliation must be triggered manually via HTTP | Phase 6 (cron layer) |
| `listByTenant` for reconciliation is limited to 200 intents per call — needs cursor-based pagination for very large tenants | Phase 6 |
| `ReprocessStaleProviderEvents` re-parses `rawPayload` using the current provider version — if payload format changed, parsing may fail (safe failure, event marked `failed`) | Inherent |

---

## 8. Legacy Order Payment Audit (Added by Phase 5 Hardening)

**Explicit confirmation:** The following files and behaviors were **not intentionally changed** during Phase 5 base implementation:

- `apps/api/src/http/routes/orders.ts` — not modified
- `packages/application/orders/RecordPayment.ts` — not modified
- `packages/application/orders/CreateAndPayOrder.ts` — not modified
- `/api/orders/:id/payments` endpoint behavior — unchanged
- `/api/orders/create-and-pay` endpoint behavior — unchanged
- `order_payments` legacy table — not touched

All Phase 5 changes are isolated to the `payment_provider_events` / `payment_transactions` / `payment_intents` reconciliation path.

## 9. Phase 6+ Feature Confirmation (Added by Phase 5 Hardening)

**Explicit confirmation:** The following features were **not implemented** in Phase 5:

- No real Midtrans / Xendit / Stripe adapter
- No real provider credentials
- No real provider refund or cancel API call
- No order adapter
- No POS UI changes
- No split bill, customer ledger, stock reservation, PPOB wallet, or standalone extraction
