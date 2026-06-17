# Inventory SOT No-Legacy Flow Refactor Report

Date: 2026-06-17

## Pre-change audit summary

1. Stock reads were split between `inventory_balances.quantity` and `products.stock_qty`. The stock list used balances when present but selected `products.stock_qty` as fallback, balance initialization seeded default outlets from `products.stock_qty`, and sale/return movement infrastructure still reads `products.stock_qty`.
2. Stock writes happened in `inventory_balances` for stock page adjustments, advanced movements, low-stock threshold rows, opname, and transfers; however the balance repository mirrored default-outlet quantity back to `products.stock_qty`, and sale/return movement infrastructure still mutates `products.stock_qty`.
3. Users could input stock in the product form and in Stock & Inventaris. The product form stock input created an incorrect catalog-page mental model.
4. `GET /api/inventory/products`, `PUT /api/inventory/products/:id/adjust`, `POST /api/inventory/movements`, balance initialization, threshold missing-row creation, and stock movement infrastructure had direct or fallback references to `products.stock_qty` before this batch.
5. Backend gates use `requireTenantEntitlement` against the effective entitlement context: `inventory_basic_stock` for stock list/opening/basic adjustment, `inventory_advanced_stock` for movements/low stock/opname/report, and `inventory_advanced_stock` plus `multi_location` for transfer.
6. Outlet-specific actions include stock list, opening stock, adjustment, movement, threshold, low stock, opname, transfer source/destination lifecycle, and report filtering.
7. Stock page currently uses custom fixed overlays for several flows. The existing component system includes `Dialog` and `Drawer`; full replacement remains required for every stock dialog/drawer.
8. Removed or reduced old helpers in this batch: default-outlet `products.stock_qty` lazy seed and balance-to-product stock mirror. Remaining old helper: sale/return `DrizzleStockMovementRepository` still uses `products.stock_qty` and is documented as remaining work.

## Final stock SOT decision

Inventory stock source of truth is `inventory_balances.quantity` scoped by `tenant_id + outlet_id + product_id`. `products.stock_qty` remains physical schema debt only where unrelated catalog schema still exposes it and where the sale/return repository has not yet been safely converted.

## Removed `products.stock_qty` stock-logic usages

- Removed balance initialization from `products.stock_qty`; missing tracked balances now start at quantity `0` until the user explicitly sets opening stock or performs a stock operation.
- Removed default-outlet balance mirror that wrote `inventory_balances.quantity` back into `products.stock_qty`.
- Removed `products.stock_qty` selection from stock list, basic adjustment product lookup, manual advanced movement lookup, and opname tracked-product population.
- Threshold creation for a missing balance now creates an explicit outlet balance at quantity `0` without reading `products.stock_qty`.

## Product page flow before/after

Before: product catalog form showed stock tracking plus a stock quantity input, and product lists/cards showed ambiguous stock numbers from product fields.

After: product catalog controls catalog identity and stock-tracking toggle only. When stock tracking is enabled, the form explains that operational stock is managed in Stok & Inventaris, and catalog lists/cards no longer show operational stock numbers.

## Stock page flow before/after

Before: stock page and product page could both appear to manage stock. Stock numbers could be influenced by balance fallback/mirror behavior.

After: stock list quantities are balance-derived for the active outlet, and a dedicated `POST /api/inventory/opening-stock` endpoint exists for explicit opening stock writes to `inventory_balances` only. The stock page already contains quick adjustment, movement, low stock, opname, transfer, and report flows, but still needs component extraction and responsive Dialog/Drawer replacement for all forms.

## Single outlet proof

Single-outlet tenants use the active/default outlet context. Missing balances start at `0` and are not seeded from product catalog stock. Basic adjustment/opening stock updates only the active outlet balance. Advanced movement/opname do not require `multi_location`.

## Multi outlet proof

Balance scope remains `tenant_id + outlet_id + product_id`. Lazy balance creation no longer clones product stock into the default outlet or other outlets. Transfer remains gated by `multi_location` in backend code.

## Transfer lifecycle proof

Transfer use cases already keep draft as no stock change, submit as source deduction, and receive as destination addition. UI text describes Draft/Dikirim/Diterima lifecycle. Newly created transfer list invalidation already refreshes transfer queries.

## Entitlement matrix

| Operation | Backend entitlement |
| --- | --- |
| Stock list | `inventory_basic_stock` |
| Opening stock | `inventory_basic_stock`; logs `INITIAL` only when `inventory_advanced_stock` is effective |
| Basic adjustment | `inventory_basic_stock`; logs advanced movement only when `inventory_advanced_stock` is effective |
| Movement/history/report/low stock/threshold/opname | `inventory_advanced_stock` |
| Transfer | `inventory_advanced_stock` + `multi_location` |

## Hardcoded rule audit result

No plan-name gates were added. The remaining transfer gate checks the effective entitlement map for `multi_location`. The threshold constant remains a fallback value of `10`; no outlet name, fixed branch, or commercial plan string was added.

## Responsive UI changes and component pattern used

Product catalog UI was simplified in-place with existing rounded cards, typography, spacing, and button styles. Full stock action responsive replacement with mobile Drawer and desktop Dialog remains not completed in this batch.

## Validation output

Validation commands were run after implementation; see final agent response for exact pass/fail status.

## Remaining issues

- `packages/infrastructure/repositories/inventory/DrizzleStockMovementRepository.ts` still reads/writes `products.stock_qty` for sale/return stock effects and must be converted to outlet-scoped `inventory_balances` before claiming no stock-flow leftovers.
- `apps/pos-terminal-web/src/pages/stock.tsx` remains large and still uses custom overlays for some flows; it needs extraction into reusable responsive Dialog/Drawer components.
- Baseline migrations/meta still contain the physical `stock_qty` column. It is left as schema debt in this batch because removal affects catalog DTO/schema compatibility outside the stock flow.
