# Post-P8.3 Inventory Traceability + Stock Listing Report

## Environment

- Commit SHA: 4aeb8c7ab6b6b580ec2958ba60e8c7c90d20c683 (pre-commit SHA when validation report was written)
- Database/environment: local workspace validation; `pnpm run db:check` used the repository default `postgresql://drizzle:drizzle@localhost:5432/drizzle` unless `DATABASE_URL` is provided by the runner.
- Tenant/outlet tested: automated unit/fake-repository tenant `tenant-1`; manual browser/database smoke not run in this non-interactive batch.

## Production bug

- Case: tracked product did not appear on stock page.
- Root cause: stock page/API needed an explicit response boundary that starts from stock-tracked catalog products and normalizes missing/null stock to visible zero-stock rows. The product table already stores current stock lazily, so a movement-ledger-only source would miss products without movements.
- Fix: `/api/inventory/products` selects `products.stock_tracking_enabled = true`, includes `stockTrackingEnabled` in the selected row, and maps rows through `toStockListResponse`, which keeps tracked products visible even when `stockQty` is `null` or `0`.
- Validation evidence: `apps/api/src/__tests__/inventory-stock-listing.test.ts` covers tracked/null stock, tracked/zero stock, non-tracked filtering, and scoped caller-provided row sets.

## Inventory movement traceability

- Schema fields added/changed: `inventory_movements.payment_id`, `inventory_movements.reference_type`, `inventory_movements.reference_id`, and `inventory_movements.metadata`.
- Migration file: `migrations/0019_inventory_movement_traceability.sql`.
- SALE reference behavior: quick-pay/order payment stock deductions now pass `paymentId`, `referenceType = 'sale_payment'`, `referenceId` from transaction ref or payment id, plus metadata containing payment method/idempotency/transaction reference. The stock movement repository persists these values and falls back to order/payment ids if callers omit explicit references.
- ADJUSTMENT reference behavior: basic adjustments set `referenceType = 'manual_adjustment'`; advanced inventory movements set `manual_adjustment` for adjustment movement types and `manual_movement` otherwise.
- Backward compatibility: migration backfills `reference_type`/`reference_id` for existing rows without changing movement type, quantity delta, quantity before/after, or product stock calculation.

## Tests

- Backend tests:
  - `apps/api/src/__tests__/inventory-stock-listing.test.ts`
  - updated `apps/api/src/__tests__/create-and-pay-stock-concurrency.test.ts` traceability assertions
- Frontend tests: not added; stock page behavior is driven by the API hook/response shape and no existing stock page frontend test harness was present in this batch.
- Manual smoke: not run; requires an interactive browser plus seeded/running API database.

## Validation commands

- `pnpm check:boundaries`: pass
- `pnpm --filter @pos/domain type-check`: pass
- `pnpm --filter @pos/application type-check`: pass
- `pnpm --filter @pos/infrastructure type-check`: pass
- `pnpm --filter @pos/api type-check`: pass
- `pnpm --filter @pos/terminal-web type-check`: pass
- `pnpm type-check`: pass
- `pnpm run db:check`: pass
- `pnpm --filter @pos/api exec tsx --test src/__tests__/inventory-stock-listing.test.ts src/__tests__/create-and-pay-stock-concurrency.test.ts`: pass
- `pnpm --filter @pos/api test -- src/__tests__/inventory-stock-listing.test.ts src/__tests__/create-and-pay-stock-concurrency.test.ts`: warning/fail due to the package script still running the full `src/__tests__/**/*.test.ts` glob; unrelated `record-payment-idempotency.test.ts` exits when `DATABASE_URL` is not set.

## Final decision

- Tracked product stock page visibility fixed: yes
- Inventory movement traceability fixed: yes
- DB schema changed: yes
- Migration generated: yes
- Runtime stock behavior changed: no stock-math/deduction timing change; stock list response now exposes tracked products with null stock as zero-stock rows, and movement writes include audit references.
- Ready for next task: yes, after applying migration in the target environment and running an interactive manual smoke.
