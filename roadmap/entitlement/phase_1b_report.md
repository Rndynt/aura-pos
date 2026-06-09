# Entitlement Phase 1B Report

## Summary

Phase 1B corrected the entitlement SOT scope so `packages/application/entitlements/entitlementCatalog.ts` contains only tenant-access-controlled commercial entitlements, not base POS operations, catalog primitives, order lifecycle actions, base receipt behavior, or base cash/manual payments.

Implemented changes:

- Reduced the commercial SOT to 18 Phase 1B entitlement codes.
- Cleaned `starter`, `growth`, and `pro` plan included arrays so each plan lists only its own commercial entitlements and relies on cumulative engine behavior.
- Collapsed inventory commercial gating to `inventory_basic_stock` and `inventory_advanced_stock`.
- Replaced granular restaurant entitlements with `restaurant_table_service` and `restaurant_kitchen_ops`.
- Replaced granular multi-location entitlements with `multi_location`.
- Updated offer purchase logic so a plan-included entitlement cannot be purchased again.
- Updated focused entitlement tests for commercial-only scope, cumulative plans, offer double-charge prevention, inventory guard mapping, and base order/catalog route non-gating.
- Updated billing entitlement documentation with the Phase 1B commercial list.

## Root cause of Phase 1 mistake

Phase 1 treated too many internal application capabilities as sellable tenant entitlements. Base POS actions such as opening/cancelling orders, catalog CRUD primitives, cash/manual payment methods, standard receipt behavior, and inventory sub-capabilities were modeled alongside commercial add-ons. That blurred commercial gating, RBAC/permissions, and base product functionality.

## Removed non-commercial entitlement codes

Removed from `ENTITLEMENT_CATALOG.entitlements`, plan included arrays, offers where applicable, and business type defaults/recommendations:

```txt
orders_open_order
orders_cancel
orders_void
orders_refund
catalog_products
catalog_categories
catalog_variants
catalog_options
catalog_sku
catalog_barcode
payments_cash
payments_manual_qris
payments_manual_bank_transfer
receipt_standard
receipt_reprint
inventory_stock_adjustment
inventory_stock_movement_history
inventory_stock_opname
inventory_stock_transfer
inventory_low_stock_alert
inventory_reports
hardware_receipt_printer
hardware_cash_drawer
restaurant_table_management
restaurant_floor_layout
restaurant_kitchen_ticket
restaurant_kds
restaurant_kitchen_printer
reports_sales_basic
reports_sales_advanced
reports_inventory
reports_cashier
multi_location_outlets
multi_location_stock
multi_location_reports
```

## Final commercial entitlement list

```txt
inventory_basic_stock
inventory_advanced_stock
payments_partial_payment
payments_multi_payment
payments_split_payment
receipt_compact
orders_queue
restaurant_table_service
restaurant_kitchen_ops
reports_advanced
reports_export
multi_location
hardware_label_printer
hardware_barcode_scanner
integrations_payment_gateway
integrations_accounting
integrations_webhook
integrations_api_access
```

Final entitlement count: 18.

## Plan cleanup

Plan included arrays now contain only commercial entitlement keys:

- `starter`: `inventory_basic_stock`, `payments_partial_payment`
- `growth`: `orders_queue`, `restaurant_kitchen_ops`, `reports_advanced`
- `pro`: `inventory_advanced_stock`, `payments_multi_payment`, `payments_split_payment`, `reports_export`, `multi_location`, `integrations_payment_gateway`, `integrations_api_access`

The engine still makes plans cumulative by `sortOrder`, so `pro` receives `starter + growth + pro` entitlements without duplicating lower-tier arrays.

## Offer cleanup

Offers now reference only commercial entitlements:

- `receipt_compact_monthly` -> `receipt_compact`
- `inventory_advanced_stock_addon` -> `inventory_advanced_stock`
- `orders_queue_addon` -> `orders_queue`
- `integrations_webhook_monthly` -> `integrations_webhook`

`canPurchaseOffer` now returns `false` when the tenant's cumulative plan already includes the offer entitlement, preventing double-charge for plan-included access.

## Business type cleanup

Business type defaults now only include `inventory_basic_stock` for the current Phase 1B policy. Recommendations use commercial entitlements only, for example restaurant recommendations use `restaurant_table_service`, `restaurant_kitchen_ops`, `reports_advanced`, and `inventory_advanced_stock` instead of KDS/kitchen-ticket/printer sub-capabilities.

## Route guard cleanup

Inventory route guard mapping is coarse-grained:

- Stock list and basic adjustment entry points use `inventory_basic_stock`.
- Movement/history/report routes use `inventory_advanced_stock`.
- The adjustment route keeps the existing policy where the basic adjustment endpoint is accessible with Basic Stock and advanced movement logging is only performed when `inventory_advanced_stock` is effective.

Focused tests verify that order lifecycle and catalog route sources do not call `requireTenantEntitlement` and do not reference removed base operation entitlement codes.

## Database status

- tenant_entitlements kept: yes
- tenant_features restored: no by this Phase 1B change
- tenant_module_configs restored: no by this Phase 1B change
- legacy resolver restored: no

Important audit note: migration `migrations/0022_single_tenant_entitlements.sql` drops `tenant_features` and `tenant_module_configs`, but active compatibility/schema/repository code still contains legacy table symbols and feature/module flag references. This batch did not remove those compatibility areas because doing so safely requires a broader Phase 2-style removal across tenant admin, marketplace, feature guard middleware, seeds, repositories, and old tests.

## Hardcode audit

Command:

```bash
rg -n "orders_open_order|orders_cancel|orders_void|orders_refund|catalog_products|catalog_categories|catalog_sku|catalog_barcode|payments_cash|payments_manual_qris|payments_manual_bank_transfer|receipt_standard|receipt_reprint|inventory_stock_adjustment|inventory_stock_movement_history|inventory_stock_opname|inventory_stock_transfer|inventory_low_stock_alert|inventory_reports|hardware_receipt_printer|hardware_cash_drawer" apps packages roadmap docs
```

Summary:

- Total matches after cleanup: 133.
- Active SOT matches: 0.
- Active inventory route guard matches for removed inventory entitlement codes: 0.
- Remaining `apps`/`packages` matches are legacy feature-code references (`inventory_reports`) and test assertions that removed entitlement codes are absent.
- Remaining `roadmap`/`docs` matches are historical roadmap/checklist/report text or Phase 1B documentation that intentionally names removed codes.

Legacy runtime/reference audit command:

```bash
rg -n "tenantModuleConfigs|tenant_module_configs|tenantFeatures|tenant_features|enableInventory|enableInventoryAdvanced|resolveBasicStockEntitlement|repairBasicStockEntitlement|BASIC_STOCK_DEFAULT_PLAN_TIERS" apps packages migrations docs roadmap
```

Summary:

- Total matches after cleanup: 342.
- No `resolveBasicStockEntitlement`, `repairBasicStockEntitlement`, or `BASIC_STOCK_DEFAULT_PLAN_TIERS` active references were introduced by this batch.
- `tenantFeatures`, `tenantModuleConfigs`, `enableInventory`, and `enableInventoryAdvanced` still exist in compatibility/schema/repository/admin/seed/test areas and should be treated as a follow-up blocker for a complete legacy feature/module subsystem removal.

## Tests

Focused entitlement test updated and run:

```bash
pnpm --filter @pos/api exec tsx --test src/__tests__/inventory-entitlement.test.ts
```

Result: passed, 12 tests.

Covered assertions:

1. Entitlement catalog does not contain base order lifecycle codes.
2. Entitlement catalog does not contain catalog CRUD/base catalog codes.
3. Entitlement catalog does not contain base cash/manual payment codes.
4. Entitlement catalog does not contain split inventory sub-capabilities that belong under `inventory_advanced_stock`.
5. Plans reference only existing commercial entitlement keys.
6. Offers reference only existing commercial entitlement keys.
7. Business type defaults/recommendations reference only existing commercial entitlement keys.
8. Pro gets Starter + Growth + Pro entitlements cumulatively.
9. Included plan entitlement cannot be purchased/charged again through offer flow.
10. `inventory_basic_stock` gates stock list route source.
11. `inventory_advanced_stock` gates movement/history/report route source.
12. Base order lifecycle route source is not commercially entitlement-gated.
13. Catalog base route source is not commercially entitlement-gated.

## Validation commands

Required validation commands were run:

```bash
pnpm check:boundaries
pnpm --filter @pos/application type-check
pnpm --filter @pos/infrastructure type-check
pnpm --filter @pos/api type-check
pnpm --filter @pos/terminal-web type-check
pnpm type-check
pnpm run db:check
```

All commands passed in this environment.

## Final decision

- SOT commercial-only: yes
- Base operations removed from entitlement: yes for `ENTITLEMENT_CATALOG`; remaining references are historical docs, legacy feature-code names, or tests proving absence.
- Inventory collapsed to basic/advanced: yes
- Catalog base removed: yes
- Order lifecycle base removed: yes
- Payment base removed: yes
- Legacy tables remain removed: partially; migration drop exists and this batch did not restore them, but active compatibility/schema/repository references still exist and need a broader cleanup.
- Ready for Phase 2: no, because legacy compatibility references outside the SOT cleanup path remain and should be planned explicitly.
