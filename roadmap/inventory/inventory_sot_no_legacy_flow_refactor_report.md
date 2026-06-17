# Inventory SOT No-Legacy Flow Refactor Report

Date: 2026-06-17 (closure pass P4)

## Pre-change audit summary

1. Stock reads were split between `inventory_balances.quantity` and `products.stock_qty`. The stock list used balances when present but selected `products.stock_qty` as fallback, balance initialization seeded default outlets from `products.stock_qty`, and sale/return movement infrastructure still read `products.stock_qty`.
2. Stock writes happened in `inventory_balances` for stock page adjustments, advanced movements, low-stock threshold rows, opname, and transfers; however the balance repository mirrored default-outlet quantity back to `products.stock_qty`, and sale/return movement infrastructure still mutated `products.stock_qty`.
3. Users could input stock in the product form and in Stock & Inventaris. The product form stock input created an incorrect catalog-page mental model.
4. `GET /api/inventory/products`, `PUT /api/inventory/products/:id/adjust`, `POST /api/inventory/movements`, balance initialization, threshold missing-row creation, and stock movement infrastructure had direct or fallback references to `products.stock_qty` before this batch.
5. Backend gates use `requireTenantEntitlement` against the effective entitlement context: `inventory_basic_stock` for stock list/opening/basic adjustment, `inventory_advanced_stock` for movements/low stock/opname/report, and `inventory_advanced_stock` plus `multi_location` for transfer.
6. Outlet-specific actions include stock list, opening stock, adjustment, movement, threshold, low stock, opname, transfer source/destination lifecycle, and report filtering.
7. Stock page currently uses custom fixed overlays for several flows. The existing component system includes `Dialog` and `Drawer`; the new Set/Ubah Stok flow uses the responsive sheet pattern, other legacy overlays remain as-is for now.
8. Removed or reduced old helpers in previous batches: default-outlet `products.stock_qty` lazy seed and balance-to-product stock mirror. Remaining old helper at the start of this batch: sale/return `DrizzleStockMovementRepository` still used `products.stock_qty`.

## Final stock SOT decision

Inventory stock source of truth is `inventory_balances.quantity` scoped by `tenant_id + outlet_id + product_id`. `products.stock_qty` is no longer used by any stock UI, stock API, sale deduction, return reversal, low stock, set stock, transfer, opname, or report path. The column remains only as physical catalog schema debt.

## Removed `products.stock_qty` stock-logic usages (this batch)

- `DrizzleStockMovementRepository.deductStockForItems` no longer selects/updates `products.stockQty`. It now locks the per-outlet `inventory_balances` row (`for('update')`), upserts the new quantity, and writes a movement row with the balance-derived `quantityBefore`/`quantityAfter`. Negative stock protection is preserved (refuses to go below 0 when `allowNegativeStock=false`).
- `DrizzleStockMovementRepository.reverseStockForItems` mirrors the same behavior for RETURN movements: balance is the SOT, missing balance starts at `0`, and the ledger row is written with balance-derived before/after.
- Both methods now throw `MissingOutletContextError` (`OUTLET_CONTEXT_REQUIRED`, HTTP 400) when a stock-tracked product is passed without an outlet context. This makes the contract explicit at the repository boundary.
- `DrizzleSyncOfflineOrderRepository` stock-conflict pre-snapshot now reads quantities from `inventory_balances` scoped to the request outlet (missing balance = 0). It no longer reads `products.stock_qty`.
- Comment in `apps/api/src/http/helpers/stockDeduction.ts` updated: the helper documents that the SOT is `inventory_balances` and the legacy column is unused.
- Comment in `packages/infrastructure/db/schema/inventory.schema.ts` updated to reflect that `products.stock_qty` is only physical schema debt now.

### Sale/return conversion proof

- `apps/api/src/__tests__/create-and-pay-stock-concurrency.test.ts` was rewritten to back its FakeDb with an `inventory_balances` store and outlet context. All 7 cases pass:
  - one of two parallel quick-pay orders is rejected with `InsufficientStockError` when stock is `1`; the surviving balance reads `0`; the movement row records `quantityBefore=1`, `quantityAfter=0`, `outletId=outlet-1`, `referenceType=sale_payment`.
  - idempotent replay does not double-deduct: balance stays at `1`, exactly one movement.
  - offline sync sale (`SyncOfflineOrder`) writes one movement, takes the balance from `5` to `3`, and tags the movement with the request outlet and terminal.
- Full API test suite: 150 pass, 0 fail (with `DATABASE_URL` set so the integration-only suites can connect).

## Product page flow before/after

Before: product catalog form showed stock tracking plus a stock quantity input, and product lists/cards showed ambiguous stock numbers from product fields.

After (carried over from earlier passes): the product catalog form controls catalog identity and the stock-tracking toggle only. When tracking is enabled, the form text directs the user to Stok & Inventaris for operational stock entry. Product lists/cards no longer show operational stock numbers from `products.stock_qty`.

### Product catalog-only proof

- `apps/pos-terminal-web/src/pages/stock.tsx` is the only page that calls `useSetStock` / `useAdjustStock` / `useCreateMovement`. The product catalog page does not import any of these hooks.
- `useStockProducts` lists products with `stockTrackingEnabled = true` against the active outlet's `inventory_balances`. The product catalog page does not call this endpoint.
- `GET /api/inventory/products` derives `stockQty` from `ensureTrackedProductBalancesForOutlet` on the active outlet, not from the products row.

## Stock page flow before/after

Before: Stok & Inventaris had inline `QuickAdjust` (number stepper) and a separate Advanced Movement dialog. There was no single labeled "Set Stok" / "Ubah Stok" entry point per product row.

After:
- A new `SetStockSheet` component (`apps/pos-terminal-web/src/components/stock/SetStockSheet.tsx`) handles direct outlet stock entry. It renders as a bottom drawer/sheet on mobile (`useIsMobile`) and a centered dialog on tablet/desktop.
- Each product row in `pages/stock.tsx` exposes a labeled `Set Stok` (when current quantity is 0) / `Ubah Stok` (when there is existing stock) button. The stock badge itself is also clickable and opens the same sheet.
- The sheet writes via `useSetStock`, which hits `PUT /api/inventory/products/:id/adjust` with `mode: "set"`. The backend route is unchanged and already targets `inventory_balances` for the active outlet only; when `inventory_advanced_stock` is effective the same call also writes an `ADJUSTMENT_IN`/`ADJUSTMENT_OUT` movement row by delta (or no movement if the quantity is unchanged).
- `useSetStock` (and `useAdjustStock`) now invalidate stock list, low stock, movements, and report queries on success.
- The inline `QuickAdjust` component was removed from `stock.tsx`; the file no longer carries that dead code path.

### Set/Ubah Stok UI proof

- File: `apps/pos-terminal-web/src/components/stock/SetStockSheet.tsx` (new, extracted out of `stock.tsx`).
- Hook: `apps/pos-terminal-web/src/hooks/api/useInventory.ts` — `useSetStock` wraps the basic adjust endpoint in `set` semantics and invalidates `["/api/inventory/products"]`, `["/api/inventory/movements"]`, `["/api/inventory/low-stock"]`, and `["/api/inventory/report"]` on success.
- Entry point: each row in `apps/pos-terminal-web/src/pages/stock.tsx` shows `[badge] [Set Stok | Ubah Stok] [movement] [history]`. Set/Ubah Stok is disabled when no active outlet is selected (aggregate-style view is treated as read-only for stock-changing actions).
- Responsive: `SetStockSheet` chooses `Drawer`-style bottom sheet (`<768px`) vs centered `Dialog`-style modal (`≥768px`) via `useIsMobile`.
- First-stock vs correction: the sheet shows a one-line hint when the prior balance is zero ("Ini akan menjadi stok awal untuk outlet ini..."). The action is the same; there is no separate "Opening Stock" menu item in the page.

## Single outlet proof

Single-outlet tenants automatically use their default outlet via `OutletProvider`. `useStockProducts`, `useSetStock`, and `useAdjustStock` all send `x-outlet-id` via `buildApiHeaders`. Missing balances start at `0`; nothing is seeded from `products.stock_qty`.

## Multi outlet proof

`inventory_balances` rows are scoped by `tenant_id + outlet_id + product_id`. Switching outlet in `OutletProvider` invalidates outlet-scoped queries so the next stock list, low stock fetch, set-stock target, and report read the new outlet's balance. Transfer remains gated by `multi_location` in the backend and the page guards the tab accordingly.

## Transfer lifecycle proof

Transfer use cases keep draft as no stock change, submit as source deduction, and receive as destination addition. Backend gate is `inventory_advanced_stock + multi_location` (Express middleware via `requireTenantEntitlement`). The UI labels Draft / Dikirim / Diterima and the transfer list invalidates after each lifecycle transition.

## Entitlement matrix

| Operation                                  | Backend entitlement                                                                 |
| ------------------------------------------ | ----------------------------------------------------------------------------------- |
| Stock list                                 | `inventory_basic_stock`                                                             |
| Set/Ubah Stok (basic)                      | `inventory_basic_stock`; logs `ADJUSTMENT_IN`/`OUT` only when advanced is effective |
| Opening stock (programmatic, same outlet)  | `inventory_basic_stock`; logs `INITIAL` only when advanced is effective             |
| Manual movement / history / report / low stock / threshold / opname | `inventory_advanced_stock`                              |
| Transfer                                   | `inventory_advanced_stock` + `multi_location`                                       |

No hardcoded plan names. No UI-only gating. Backend continues to return 403 when blocked. Default low-stock threshold is `10` as a fallback constant; no outlet name, branch identifier, or commercial plan string is hardcoded.

## Hardcoded rule audit result

No plan-name gates were added. The transfer gate continues to check `multi_location` against the effective entitlement map. No new constants were introduced for plan tiers or commercial names; the only literal touched in this batch is the `OUTLET_CONTEXT_REQUIRED` error code used at the repository boundary.

## Responsive UI changes and component pattern used

- Mobile: `SetStockSheet` renders as a bottom sheet (`fixed inset-0 bg-black/50` with content `bg-white rounded-t-2xl w-full max-h-[92vh]`).
- Tablet/desktop: same component switches to a centered modal (`fixed inset-0 bg-black/50 flex items-center justify-center` with content `bg-white rounded-2xl w-full max-w-md`).
- Reuses existing typography, spacing, rounded card, and accent color tokens (`bg-slate-50`, `text-emerald-600`, `text-orange-600`, `text-red-600`) consistent with the rest of `stock.tsx`.
- Extracted to `apps/pos-terminal-web/src/components/stock/SetStockSheet.tsx` instead of growing the monolithic `stock.tsx`. The inline `QuickAdjust` was removed because the new sheet covers the same intent end-to-end with a clearer label.

## Validation output

Commands and results:

- `pnpm --filter @pos/api type-check` → no errors.
- `pnpm --filter @pos/terminal-web type-check` → no errors.
- `pnpm --filter ./packages/application type-check`, `./packages/core`, `./packages/domain`, `./packages/features`, `./packages/infrastructure`, `./packages/offline`, `./apps/web`, `./shared` → all no errors.
- `pnpm type-check` (root, via turbo) → not executed; Turborepo does not support `android-arm64`. Each workspace was type-checked individually as above.
- `pnpm --filter @pos/api test` → 150 pass, 0 fail (with `DATABASE_URL=postgresql://pos_user:pos_pass@localhost:5432/pos_db` and `BETTER_AUTH_SECRET=...` exported so the integration-style suites can connect). Without `DATABASE_URL` three suites (`inventory-advanced`, `partial-payment-lifecycle`, `record-payment-idempotency`) exit early on the existing infra precondition `[database] DATABASE_URL environment variable is not set. Exiting.` — this is an environment requirement, not a regression from this batch.

## Remaining issues

None tied to the stock SOT flow.

Externally blocked (not in scope of this batch):
- Root-level `pnpm type-check` cannot run on `android-arm64` because Turborepo lacks an arm64 Android binary; the individual `pnpm --filter ... type-check` runs are the equivalent.
- Three API test files require a reachable Postgres at `DATABASE_URL`; they pass when one is provided.
- The physical `products.stock_qty` column and its baseline migration entries remain on the catalog schema. Removing the column requires a separate catalog DTO/schema migration outside the inventory SOT path.
