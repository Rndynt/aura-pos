# Advanced Stock Full Implementation Report

## Summary

Complete implementation of Phase 1–6 from `replit_codex_P1_advanced_stock_full_implementation_prompt.md`.

All phases now complete, including the Phase 2 application use-case layer that was initially missing.

---

## Phase 1 — Schema & Domain Model

### New Tables in `migrations/0008_inventory.sql`

| Table | Purpose |
|---|---|
| `inventory_balances` | Per-outlet balance ledger (quantity + low_stock_threshold) |
| `stock_opnames` | Stock count sessions (draft → submitted → approved) |
| `stock_opname_items` | Per-product line items in an opname with variance calculation |
| `stock_transfers` | Cross-outlet transfer records (draft → submitted → received) |
| `stock_transfer_items` | Per-product transfer items |
| `inventory_low_stock_alerts` | Materialized alert log for products crossing threshold |

### Drizzle Schema (`packages/infrastructure/db/schema/inventory.schema.ts`)

Six new table definitions with insert schemas, insert types, and select types. All tables include `tenant_id` for multi-tenant isolation.

---

## Phase 2 — Application Use Cases & Ports (NEW)

### New Port: `InventoryMovementWriterPort`

```
packages/application/inventory/ports/InventoryMovementWriterPort.ts
```

Abstracts writing a single inventory movement record. Accepts an optional `TransactionContext` so callers can compose movement writes with balance updates inside the same atomic boundary.

### New Use Cases

#### Opname (`packages/application/inventory/opname.ts`)

| Function | Business Rule Enforced |
|---|---|
| `createOpname()` | delegates to repo |
| `updateOpnameItem()` | guard: status must be 'draft' |
| `submitOpname()` | guard: status must be 'draft' |
| `approveOpname()` | guard: status must be 'submitted'; atomic: writes OPNAME_ADJUSTMENT + sets balance for every non-zero-variance item via UnitOfWork transaction |
| `cancelOpname()` | guard: status must not be 'approved' |

#### Transfer (`packages/application/inventory/transfer.ts`)

| Function | Business Rule Enforced |
|---|---|
| `createTransfer()` | guard: fromOutletId ≠ toOutletId |
| `submitTransfer()` | guard: status must be 'draft'; stock availability check; atomic: applyDelta(-qty) + TRANSFER_OUT per item |
| `receiveTransfer()` | guard: status must be 'submitted'; atomic: applyDelta(+qty) + TRANSFER_IN per item |
| `cancelTransfer()` | guard: not 'received' or already 'cancelled'; if 'submitted': reverses deduction with ADJUSTMENT_IN + balance restore |

### Domain Error Types

- `OpnameNotFoundError` (404) / `OpnameStatusError` (400)
- `TransferNotFoundError` (404) / `TransferStatusError` (400) / `TransferSameOutletError` (400) / `InsufficientTransferStockError` (400)

All errors carry `statusCode` so the existing Express error handler can respond correctly.

### New Infrastructure Adapter: `DrizzleInventoryMovementWriter`

```
packages/infrastructure/repositories/inventory/DrizzleInventoryMovementWriter.ts
```

Inserts into `inventory_movements` table. Accepts and respects `TransactionContext`.

### `DrizzleInventoryBalanceRepository` — stock_qty sync

`applyDelta()` and `setQuantity()` now call a local `syncProductStockQty()` helper that updates `products.stock_qty` in the same DB client/transaction, keeping the basic-stock column in sync for backward compatibility.

### Ports Index Updated

`packages/application/inventory/ports/index.ts` exports `InventoryMovementWriterPort`, `RecordMovementInput`, `MovementRecord`.

`packages/application/inventory/index.ts` exports all opname + transfer use-case functions and error types.

---

## Phase 3 — Infrastructure Repositories

| Repository | Key Behaviors |
|---|---|
| `DrizzleInventoryBalanceRepository` | applyDelta uses SELECT FOR UPDATE; setQuantity uses upsert; both sync products.stock_qty |
| `DrizzleStockOpnameRepository` | create, findById (with items join), list, upsertItem (variance computed), updateStatus |
| `DrizzleStockTransferRepository` | create (header + items in one TX), findById, list, updateStatus |
| `DrizzleInventoryMovementWriter` | record() inserts into inventory_movements, ctx-aware |

---

## Phase 4 — API Layer

Routes are now thin: entitlement check → body parse → use-case call → JSON response.
Business logic (status guards, atomic balance+movement writes) lives entirely in application layer.

### Low Stock & Threshold
| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/api/inventory/low-stock` | user | List products at/below threshold |
| `PUT` | `/api/inventory/products/:id/threshold` | manager | Set per-product threshold |

### Stock Opname
| Method | Path | Auth | Description |
|---|---|---|---|
| `POST` | `/api/inventory/opnames` | manager | Create opname (auto-populates items) |
| `GET` | `/api/inventory/opnames` | user | List opnames with optional status filter |
| `GET` | `/api/inventory/opnames/:id` | user | Detail opname with items |
| `PUT` | `/api/inventory/opnames/:id/items/:productId` | manager | Update counted quantity |
| `POST` | `/api/inventory/opnames/:id/submit` | manager | Submit for approval |
| `POST` | `/api/inventory/opnames/:id/approve` | manager | Approve: write OPNAME_ADJUSTMENT + update balances |
| `POST` | `/api/inventory/opnames/:id/cancel` | manager | Cancel (draft/submitted only) |

### Stock Transfer
| Method | Path | Auth | Requires | Description |
|---|---|---|---|---|
| `POST` | `/api/inventory/transfers` | manager | advanced + multi_location | Create transfer with items |
| `GET` | `/api/inventory/transfers` | user | advanced + multi_location | List transfers |
| `GET` | `/api/inventory/transfers/:id` | user | advanced + multi_location | Detail + items |
| `POST` | `/api/inventory/transfers/:id/submit` | manager | advanced + multi_location | Deduct source balance + TRANSFER_OUT |
| `POST` | `/api/inventory/transfers/:id/receive` | manager | advanced + multi_location | Add dest balance + TRANSFER_IN |
| `POST` | `/api/inventory/transfers/:id/cancel` | manager | advanced + multi_location | Cancel (reverses if submitted) |

---

## Phase 5 — Frontend

### Hooks (`useInventoryAdvanced.ts`)

15 hooks: `useLowStockItems`, `useSetLowStockThreshold`, `useOpnames`, `useOpnameDetail`, `useCreateOpname`, `useUpdateOpnameItem`, `useSubmitOpname`, `useApproveOpname`, `useCancelOpname`, `useTransfers`, `useTransferDetail`, `useCreateTransfer`, `useSubmitTransfer`, `useReceiveTransfer`, `useCancelTransfer`.

### Tab Components in `stock.tsx`

| Component | Description |
|---|---|
| `LowStockTab` | Products below threshold; inline threshold editing |
| `OpnameTab` | List + create opname; `OpnameDetailDrawer` for counting + submit + approve |
| `TransferTab` | List transfers; `TransferDetailDrawer` for submit + receive + cancel |

### Transfer Tab Gating (Fixed)

Three-way conditional render based on entitlements:
- `isAdvanced && isMultiLocation` → `<TransferTab />` (full)
- `isAdvanced && !isMultiLocation` → locked state with "Modul Multi Lokasi Diperlukan" message (client-side, no API round-trip)
- `!isAdvanced` → `<UpgradePrompt />` for advanced inventory

Transfer tab button now shows lock icon when `!isAdvanced || !isMultiLocation`.

---

## Phase 6 — Tests

**14 tests** in `apps/api/src/__tests__/inventory-advanced.test.ts` — all pass.

Coverage:
- Repository API surface (method existence)
- Variance calculation logic
- Transfer from/to outlet validation
- Status flow transitions (opname + transfer)
- Low stock threshold logic (7 cases)
- Movement type enumeration
- Number generation format (OPN-/TRF-)

---

## Entitlement Gating

| Feature | Required Entitlements |
|---|---|
| Low Stock list | `inventory_advanced_stock` |
| Threshold per-product | `inventory_advanced_stock` |
| Stock Opname (all) | `inventory_advanced_stock` |
| Stock Transfer (all) | `inventory_advanced_stock` + `multi_location` |

---

## Architecture Decisions

1. **`inventory_balances` as source of truth** — Advanced stock reads/writes here; `products.stock_qty` kept in sync by the balance repo for backward compat
2. **Atomic opname approval** — `UnitOfWork.transaction()` wraps all movement writes + balance updates + status change
3. **Transfer submit decrements source, receive increments dest** — Two-phase confirms physical handover
4. **Cancel of submitted transfer reverses deduction** — ADJUSTMENT_IN written to source outlet
5. **SELECT FOR UPDATE in applyDelta** — Prevents lost updates under concurrent writes
6. **Threshold nullable = use default** — Null threshold means system default (10); explicit 0 = "never alert"
7. **Auto-populate opname items** — On creation, all `stock_tracking_enabled` products for the outlet are seeded
8. **Use-case layer for business rules** — Routes are thin; domain errors carry `statusCode` for Express error handler
9. **`products.stock_qty` sync at infrastructure layer** — Balance repo syncs the legacy column internally so use cases stay clean

---

## Files Created / Modified

| File | Action |
|---|---|
| `migrations/0008_inventory.sql` | Modified — added 6 tables + indexes |
| `packages/infrastructure/db/schema/inventory.schema.ts` | Modified — 6 Drizzle table definitions |
| `packages/application/inventory/ports/InventoryMovementWriterPort.ts` | **New** |
| `packages/application/inventory/ports/InventoryBalanceRepositoryPort.ts` | New |
| `packages/application/inventory/ports/StockOpnameRepositoryPort.ts` | New |
| `packages/application/inventory/ports/StockTransferRepositoryPort.ts` | New |
| `packages/application/inventory/ports/index.ts` | Modified — re-exports all ports |
| `packages/application/inventory/opname.ts` | **New** — 5 use-case functions + domain errors |
| `packages/application/inventory/transfer.ts` | **New** — 4 use-case functions + domain errors |
| `packages/application/inventory/index.ts` | Modified — exports use cases |
| `packages/infrastructure/repositories/inventory/DrizzleInventoryBalanceRepository.ts` | Modified — products.stock_qty sync in applyDelta + setQuantity |
| `packages/infrastructure/repositories/inventory/DrizzleStockOpnameRepository.ts` | New |
| `packages/infrastructure/repositories/inventory/DrizzleStockTransferRepository.ts` | New |
| `packages/infrastructure/repositories/inventory/DrizzleInventoryMovementWriter.ts` | **New** |
| `packages/infrastructure/repositories/inventory/index.ts` | Modified — exports all repos + writer |
| `apps/api/src/http/routes/inventory-advanced.ts` | Modified — refactored to call use cases (thin routes) |
| `apps/api/src/http/routes/index.ts` | Modified — registered inventoryAdvancedRoutes |
| `apps/api/src/http/routes/inventory.ts` | Modified — MOVEMENT_TYPES extended |
| `apps/pos-terminal-web/src/hooks/api/useInventoryAdvanced.ts` | New — 15 hooks |
| `apps/pos-terminal-web/src/pages/stock.tsx` | Modified — 3 tabs + 2 drawers + Transfer tab gating fix |
| `apps/api/src/__tests__/inventory-advanced.test.ts` | New — 14 tests |
| `roadmap/inventory/advanced_stock_full_implementation_report.md` | Updated — this file |
