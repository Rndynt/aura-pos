# Entitlement Phase 1B — Commercial Entitlement Cleanup

## Context

Phase 1 was merged in PR #84 and successfully created a single `entitlementCatalog.ts`, `tenant_entitlements`, and a read-only entitlement engine. However, the first entitlement catalog was scoped incorrectly.

It included many base application operations as commercial entitlements, for example:

```txt
orders_open_order
orders_cancel
orders_void
orders_refund
catalog_products
catalog_categories
catalog_sku
catalog_barcode
inventory_stock_adjustment
inventory_stock_movement_history
inventory_stock_opname
inventory_stock_transfer
inventory_low_stock_alert
inventory_reports
payments_cash
receipt_standard
receipt_reprint
```

This is wrong.

Entitlement must mean:

```txt
A tenant-access-controlled commercial module/feature/add-on that can be included in a plan, sold separately, gated by minimum plan, trialed, manually granted, or expired.
```

Entitlement must not mean:

```txt
Every internal app capability.
Every CRUD action.
Every base POS operation.
Every RBAC permission.
Every system/admin/platform function.
Every catalog/order primitive.
```

## Objective

Fix Phase 1 catalog scope.

Keep the clean architecture goals from Phase 1:

```txt
1. One SOT file.
2. One tenant_entitlements table.
3. No tenant_features table.
4. No tenant_module_configs table.
5. No runtime self-heal resolver.
6. No legacy compatibility mapping.
```

But correct the content of the SOT so it only contains real commercial entitlements.

## SOT file remains

Keep the single SOT file:

```txt
packages/application/entitlements/entitlementCatalog.ts
```

Do not create a second SOT file.

Do not recreate:

```txt
planFeatureMap.ts as independent SOT
businessTypeTemplates.ts as independent SOT
featureCatalog.ts as independent SOT
```

If wrapper files remain temporarily, they must be generated from `entitlementCatalog.ts` and must not contain independent commercial config.

## Core correction rule

Do not put base POS/application functions into commercial entitlements.

### Base operations that must NOT be entitlements

Remove these from `ENTITLEMENT_CATALOG.entitlements`, plan included arrays, offers, and business type defaults/recommendations:

```txt
orders_open_order
orders_cancel
orders_void
orders_refund
catalog_products
catalog_categories
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
```

Reason:

```txt
These are base POS operations, core catalog primitives, base payment methods, or sub-capabilities of a broader commercial module. They should not be independently sold or entitlement-gated.
```

## Inventory correction

Inventory must be coarse-grained.

Allowed inventory entitlements:

```txt
inventory_basic_stock
inventory_advanced_stock
```

Do not split advanced stock into separate commercial entitlements such as:

```txt
inventory_stock_adjustment
inventory_stock_movement_history
inventory_stock_opname
inventory_stock_transfer
inventory_low_stock_alert
inventory_reports
```

Those capabilities belong under:

```txt
inventory_advanced_stock
```

`inventory_basic_stock` covers simple product stock tracking and simple quantity visibility/adjustment if product policy says Basic Stock includes it.

`inventory_advanced_stock` covers advanced stock functionality such as:

```txt
movement history
manual movement ledger
advanced adjustment
opname
transfer
low stock alerts
inventory reports
stock audit
```

Do not create separate offers for those sub-capabilities in Phase 1B.

## Orders correction

Allowed order commercial entitlements:

```txt
orders_queue
```

Do not use these as entitlements:

```txt
orders_open_order
orders_cancel
orders_void
orders_refund
```

Reason:

```txt
Create/open/cancel/void/refund are order lifecycle/base business operations, not commercial features to sell as independent flags.
```

If refund/void logic needs role approval later, that belongs to RBAC/permission policy, not commercial entitlement.

## Catalog correction

Remove all catalog entries from commercial entitlement catalog for this phase:

```txt
catalog_products
catalog_categories
catalog_variants
catalog_options
catalog_sku
catalog_barcode
```

Reason:

```txt
Product/category/SKU/barcode are base catalog primitives. They should not become commercial tenant entitlements in this cleanup phase.
```

If a future product decision makes something like advanced variants/bundles/import a sellable feature, it must be proposed separately and explicitly named as a commercial add-on. Do not infer it now.

## Payment correction

Base payment methods are not entitlements.

Remove:

```txt
payments_cash
payments_manual_qris
payments_manual_bank_transfer
```

Allowed commercial payment entitlements for Phase 1B:

```txt
payments_partial_payment
payments_multi_payment
payments_split_payment
integrations_payment_gateway
```

Interpretation:

```txt
cash/manual basic payment = base POS
partial/multi/split payment = commercial feature if product policy wants it
payment gateway = integration/commercial entitlement
```

## Receipt correction

Base receipt is not an entitlement.

Remove:

```txt
receipt_standard
receipt_reprint
```

Allowed receipt commercial entitlement:

```txt
receipt_compact
```

Reason:

```txt
Standard receipt/reprint is base POS. Compact receipt / custom receipt formatting can be sold or gated separately.
```

## Restaurant correction

Allowed restaurant commercial entitlements for Phase 1B:

```txt
restaurant_table_service
restaurant_kitchen_ops
```

Replace the previous separate entries:

```txt
restaurant_table_management
restaurant_floor_layout
restaurant_kitchen_ticket
restaurant_kds
restaurant_kitchen_printer
```

With coarse modules:

```txt
restaurant_table_service
restaurant_kitchen_ops
```

Definitions:

```txt
restaurant_table_service = table management + floor layout + table operational workflow
restaurant_kitchen_ops = kitchen ticket + KDS + kitchen printer workflow
```

Do not sell KDS and kitchen ticket separately in Phase 1B unless a later product decision explicitly requires it.

## Reports correction

Allowed report commercial entitlements:

```txt
reports_advanced
reports_export
```

Remove:

```txt
reports_sales_basic
reports_cashier
reports_inventory
```

Reason:

```txt
Basic sales/cashier report can be base POS. Inventory report belongs under inventory_advanced_stock unless the product later decides it is separately commercialized. Export/advanced analytics can be commercial.
```

## Multi-location correction

Allowed multi-location commercial entitlement:

```txt
multi_location
```

Replace:

```txt
multi_location_outlets
multi_location_stock
multi_location_reports
```

With one coarse module:

```txt
multi_location
```

Definition:

```txt
multi_location = multiple outlets + outlet stock + outlet reporting + outlet access workflow
```

Do not split it into multiple sellable items in Phase 1B.

## Hardware correction

Allowed hardware commercial entitlements:

```txt
hardware_label_printer
hardware_barcode_scanner
```

Remove:

```txt
hardware_receipt_printer
hardware_cash_drawer
```

Reason:

```txt
Receipt printer and cash drawer are base POS hardware support. Label printer/barcode scanner can be commercial add-ons if product policy wants them gated.
```

## Integrations correction

Allowed integration commercial entitlements:

```txt
integrations_payment_gateway
integrations_accounting
integrations_webhook
integrations_api_access
```

Keep these as commercial entitlements.

## Final allowed commercial entitlement list for Phase 1B

The Phase 1B SOT should contain only this initial list unless strong code evidence proves another item is a real commercial tenant entitlement:

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

Do not add more items without explicit product justification.

## Plan correction

Plans should include only commercial entitlements.

Plan included arrays must not include base operations.

Example:

```txt
starter may include:
- inventory_basic_stock
- payments_partial_payment if product policy wants it base

growth may include:
- orders_queue
- restaurant_kitchen_ops
- reports_advanced

pro may include:
- inventory_advanced_stock
- multi_location
- integrations_api_access
```

Do not include:

```txt
catalog_products
catalog_categories
payments_cash
receipt_standard
orders_cancel
orders_void
```

Plan hierarchy remains cumulative by `sortOrder`.

A higher plan must automatically get lower plan included entitlements through engine logic, not duplicated arrays.

## Offers correction

Offers should only exist for commercial entitlements that are sold separately.

Allowed examples:

```txt
receipt_compact_monthly -> receipt_compact, requiredPlan starter
orders_queue_addon -> orders_queue, requiredPlan growth
inventory_advanced_stock_addon -> inventory_advanced_stock, requiredPlan growth
integrations_webhook_monthly -> integrations_webhook, requiredPlan growth
```

Do not create offers for base operations.

Do not charge a tenant for an entitlement already included in their effective plan hierarchy.

## Business type correction

Business type defaults should only include commercial entitlements that are truly default for that business type.

Do not put base POS/catalog/order/payment operations in business type defaults.

Examples:

```txt
CAFE_RESTAURANT.defaultEntitlements may include:
- inventory_basic_stock

CAFE_RESTAURANT.recommendedEntitlements may include:
- restaurant_table_service
- restaurant_kitchen_ops
- reports_advanced
- inventory_advanced_stock

RETAIL_MINIMARKET.defaultEntitlements may include:
- inventory_basic_stock

RETAIL_MINIMARKET.recommendedEntitlements may include:
- inventory_advanced_stock
- hardware_barcode_scanner
- hardware_label_printer
```

Do not include:

```txt
catalog_barcode
hardware_receipt_printer
orders_open_order
payments_cash
receipt_standard
```

## Engine behavior stays

Keep the engine concept:

```txt
getPlanIncludedEntitlements
getBusinessTypeDefaultEntitlements
getActiveTenantEntitlementGrants
getEffectiveEntitlements
hasEntitlement
requireEntitlement
canPurchaseOffer
```

But ensure it only operates on commercial entitlements.

It must remain read-only:

```txt
No runtime self-heal.
No DB repair while checking access.
No automatic insert/update tenant entitlement rows during API request authorization.
```

## Database stays clean

Keep the single table from Phase 1:

```txt
tenant_entitlements
```

Do not restore:

```txt
tenant_features
tenant_module_configs
```

Do not introduce projection/legacy/adapters.

`tenant_entitlements` stores only:

```txt
purchase
manual_grant
trial
```

Do not store plan defaults or business defaults in DB.

Those are derived from SOT.

## API guard correction

Inventory route examples:

```txt
GET /api/inventory/products -> inventory_basic_stock
PUT /api/inventory/products/:id/adjust -> inventory_basic_stock or inventory_advanced_stock depending current product policy; choose and document
GET /api/inventory/movements -> inventory_advanced_stock
POST /api/inventory/movements -> inventory_advanced_stock
GET /api/inventory/report -> inventory_advanced_stock
```

Order lifecycle routes must not require commercial entitlement for base lifecycle actions:

```txt
create/open/cancel/void/refund order = no commercial entitlement in Phase 1B
```

If those actions need protection, use RBAC/permission system, not commercial entitlement.

Catalog CRUD routes must not require commercial entitlement in Phase 1B.

Payment cash/manual basic routes must not require commercial entitlement.

## Hardcode cleanup

Run and clean or document:

```bash
rg -n "orders_open_order|orders_cancel|orders_void|orders_refund|catalog_products|catalog_categories|catalog_sku|catalog_barcode|payments_cash|payments_manual_qris|payments_manual_bank_transfer|receipt_standard|receipt_reprint|inventory_stock_adjustment|inventory_stock_movement_history|inventory_stock_opname|inventory_stock_transfer|inventory_low_stock_alert|inventory_reports|hardware_receipt_printer|hardware_cash_drawer" apps packages roadmap docs
```

These should not remain as commercial entitlement codes after this phase except in migration/report history references.

Also run:

```bash
rg -n "tenantModuleConfigs|tenant_module_configs|tenantFeatures|tenant_features|enableInventory|enableInventoryAdvanced|resolveBasicStockEntitlement|repairBasicStockEntitlement|BASIC_STOCK_DEFAULT_PLAN_TIERS" apps packages migrations docs roadmap
```

There must be no active runtime references to removed legacy entitlement tables/resolver. Historical roadmap/report references are acceptable only if clearly marked as history.

## Required tests

Update tests so they reflect commercial entitlement scope.

Required tests:

```txt
1. entitlement catalog does not contain base order lifecycle codes.
2. entitlement catalog does not contain catalog CRUD/base catalog codes.
3. entitlement catalog does not contain base cash/manual payment codes.
4. entitlement catalog does not contain split inventory sub-capabilities that belong under inventory_advanced_stock.
5. plans reference only existing commercial entitlement keys.
6. offers reference only existing commercial entitlement keys.
7. business type defaults/recommendations reference only existing commercial entitlement keys.
8. Pro gets Starter + Growth + Pro entitlements cumulatively.
9. included plan entitlement cannot be purchased/charged again through offer flow.
10. inventory_basic_stock gates stock list.
11. inventory_advanced_stock gates movement/history/report.
12. base order lifecycle route is not blocked by commercial entitlement in tests if route test exists.
13. catalog base route is not blocked by commercial entitlement in tests if route test exists.
```

## Required validation commands

Run:

```bash
pnpm check:boundaries
pnpm --filter @pos/application type-check
pnpm --filter @pos/infrastructure type-check
pnpm --filter @pos/api type-check
pnpm --filter @pos/terminal-web type-check
pnpm type-check
pnpm run db:check
```

Run focused entitlement catalog/engine/API tests.

## Required report

Create:

```txt
roadmap/entitlement/phase_1b_report.md
```

Report must include:

```md
# Entitlement Phase 1B Report

## Summary

## Root cause of Phase 1 mistake

## Removed non-commercial entitlement codes

## Final commercial entitlement list

## Plan cleanup

## Offer cleanup

## Business type cleanup

## Route guard cleanup

## Database status
- tenant_entitlements kept: yes/no
- tenant_features restored: no
- tenant_module_configs restored: no
- legacy resolver restored: no

## Hardcode audit

Include output summary for:
`rg -n "orders_open_order|orders_cancel|orders_void|orders_refund|catalog_products|catalog_categories|catalog_sku|catalog_barcode|payments_cash|payments_manual_qris|payments_manual_bank_transfer|receipt_standard|receipt_reprint|inventory_stock_adjustment|inventory_stock_movement_history|inventory_stock_opname|inventory_stock_transfer|inventory_low_stock_alert|inventory_reports|hardware_receipt_printer|hardware_cash_drawer" apps packages roadmap docs`

## Tests

## Validation commands

## Final decision
- SOT commercial-only: yes/no
- Base operations removed from entitlement: yes/no
- Inventory collapsed to basic/advanced: yes/no
- Catalog base removed: yes/no
- Order lifecycle base removed: yes/no
- Payment base removed: yes/no
- Legacy tables remain removed: yes/no
- Ready for Phase 2: yes/no
```

## Commit

Use commit message:

```bash
git commit -m "fix(entitlement): limit SOT to commercial tenant entitlements"
```

Then push.

## Final response required

Return:

```txt
Entitlement Phase 1B status:
Commit SHA:
Files changed:
Final entitlement count:
Removed non-commercial codes:
Inventory collapsed: yes/no
Catalog base removed: yes/no
Order lifecycle base removed: yes/no
Payment base removed: yes/no
Legacy tables still removed: yes/no
Tests added/run:
Commands run:
Remaining blockers:
```
