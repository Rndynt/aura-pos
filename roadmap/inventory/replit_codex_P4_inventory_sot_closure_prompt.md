# Replit/Codex Prompt P4 — Inventory SOT Closure

Repository: `Rndynt/AuraPoS`

## Goal

Finish the inventory stock source-of-truth refactor after PR #92.

The final operational stock source is:

```txt
inventory_balances.quantity scoped by tenant_id + outlet_id + product_id
```

`products.stock_qty` / `products.stockQty` must not be used by stock UI, stock API, sale deduction, return reversal, low stock, opening stock, transfer, opname, or report.

## Required Fixes

1. Patch `packages/infrastructure/repositories/inventory/DrizzleStockMovementRepository.ts`.
   - Sale deduction must use `inventory_balances`.
   - Return reversal must use `inventory_balances`.
   - Require outlet context for stock-tracked sale/return.
   - Create missing outlet/product balance as 0, then apply operation.
   - Preserve negative stock protection.
   - Write movement rows with correct balance before/after.
   - Do not read or write product stock columns.

2. Add Stock page opening stock UI.
   - Use existing `POST /api/inventory/opening-stock` and `useSetOpeningStock()`.
   - Action label: `Atur Stok Awal`.
   - Product page stays catalog-only.
   - Single outlet uses active/default outlet.
   - Multi outlet requires a concrete outlet.
   - Aggregate/all-outlet view is read-only for stock-changing actions.
   - Invalidate stock list, low stock, movements, and report after success.

3. Clean Stock page interaction UI.
   - Mobile uses existing drawer/sheet pattern.
   - Tablet/desktop uses existing centered dialog/modal pattern.
   - Apply to opening stock and any touched stock forms.
   - Keep styling consistent with current AuraPoS components.
   - Extract components/hooks instead of growing `stock.tsx`.

4. Update final report:

```txt
roadmap/inventory/inventory_sot_no_legacy_flow_refactor_report.md
```

Report must include:

- final SOT decision;
- sale/return conversion proof;
- opening stock UI proof;
- Product page catalog-only proof;
- single outlet proof;
- multi outlet proof;
- entitlement matrix;
- responsive UI notes;
- validation command output;
- remaining issues: none, unless truly externally blocked.

## Entitlement Rules

```txt
inventory_basic_stock:
- stock list
- opening stock
- basic adjustment

inventory_advanced_stock:
- typed movement
- history
- report
- threshold / low stock
- opname

inventory_advanced_stock + multi_location:
- transfer
```

Do not hardcode plan names. Do not rely on UI-only gating. Backend must still return 403 when blocked.

## Validation

Run:

```bash
pnpm type-check
pnpm --filter @pos/api type-check
pnpm --filter @pos/terminal-web type-check
pnpm --filter @pos/api test
```

Manual smoke:

```txt
1. Product page: tracking toggle only, no operational stock input.
2. Stock page: Atur Stok Awal sets active outlet stock.
3. Low stock matches stock list source.
4. Sale reduces active outlet inventory balance.
5. Return restores active outlet inventory balance.
6. Multi outlet stock is independent.
7. Transfer still requires inventory_advanced_stock + multi_location.
```

## Commit

```txt
fix(inventory): close stock SOT flow without leftovers
```
