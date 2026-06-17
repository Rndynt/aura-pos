# Replit/Codex Prompt P1 — Full Advanced Stock Implementation

Repository: `Rndynt/AuraPoS`

## Objective

Implement complete Advanced Stock features for AuraPoS using the existing clean architecture direction. This is not a quick route/page patch. Implement the feature cleanly across domain, application, infrastructure, API adapters, frontend hooks, and UI.

The feature must cover:

- stock balances per outlet;
- stock movements / mutasi stok;
- stock opname;
- stock transfer between outlets;
- low stock alert / threshold;
- inventory reports;
- correct entitlement gating.

## Core Business Rule

`inventory_advanced_stock` must work for single-outlet tenants without `multi_location`.

A tenant without `multi_location` has only the default/active outlet context. They can still use:

- stock movements;
- stock opname;
- low stock alerts;
- reports;
- per-outlet balance for their default outlet.

Only **cross-outlet stock transfer** requires both:

```txt
inventory_advanced_stock
multi_location
```

Do not make the entire Advanced Stock module depend on `multi_location`.

## Architecture Rules

Follow the project roadmap in `roadmap/refactor/main.md`.

Layering rules:

- `packages/domain/inventory`: pure inventory domain types and rules only.
- `packages/application/inventory`: use cases, services, ports, orchestration, entitlement boundary contracts.
- `packages/infrastructure`: Drizzle schema and repository adapters implementing application ports.
- `apps/api`: thin HTTP controllers/routes, request validation, response mapping, middleware.
- `apps/pos-terminal-web`: UI pages/components/hooks only, no database/domain logic.

Do not put business rules directly into Express routes or React pages if they belong in domain/application.

Do not import Drizzle schema/database inside `packages/application` or `packages/domain`.

## Migration Rules

The project is still development-only and now uses a clean baseline migration chain.

Do not create `ensure_*`, `repair_*`, or drift migrations.

If new tables/columns are needed, update the owning clean baseline migration file(s), not an incremental ALTER migration, unless the user explicitly asks for production-style migrations later.

Likely owning files:

- `migrations/0004_catalog.sql` for per-product low stock threshold if stored on product.
- `migrations/0008_inventory.sql` for balances, opnames, transfer tables, alert state.

No `ALTER TABLE ADD COLUMN` chain.

## Required Data Model

Audit current schema first. Then add/adjust the clean baseline schema so it supports the full model below.

### 1. Inventory Balance / Outlet Product Stock

Create a proper per-outlet stock balance table. Use a clear name such as:

```txt
inventory_balances
```

Required fields:

```txt
id uuid primary key
tenant_id uuid not null
outlet_id uuid not null
product_id uuid not null
quantity integer not null default 0
reserved_quantity integer not null default 0
low_stock_threshold integer null
last_movement_id uuid null
last_counted_at timestamp/timestamptz null
created_at timestamp not null default current timestamp
updated_at timestamp not null default current timestamp
```

Required constraints/indexes:

```txt
FK tenant_id -> tenants(id)
FK outlet_id -> outlets(id)
FK product_id -> products(id)
unique tenant_id + outlet_id + product_id
index tenant_id
index outlet_id
index product_id
index tenant_id + outlet_id
```

Important:

- This table must exist even for single-outlet tenants.
- Single-outlet tenants will just have one outlet balance row per tracked product.
- Do not rely on global `products.stock_qty` for advanced stock once balances exist.
- Keep backward/basic compatibility: basic stock list may still read global value temporarily, but advanced stock must use per-outlet balance.

### 2. Inventory Movements

Keep/enhance `inventory_movements` as stock ledger.

Required fields:

```txt
id
tenant_id
outlet_id
product_id
order_id nullable
payment_id nullable
movement_type
quantity_delta
quantity_before
quantity_after
unit_cost nullable
reference_type nullable
reference_id nullable
notes nullable
actor_id nullable
source_terminal_id nullable
metadata json/jsonb nullable
created_at
updated_at if existing schema uses it
```

Supported movement types:

```txt
SALE
OFFLINE_SALE
ADJUSTMENT_IN
ADJUSTMENT_OUT
PURCHASE
DAMAGE
RETURN
INITIAL
OPNAME_ADJUSTMENT
TRANSFER_OUT
TRANSFER_IN
```

Rules:

- Movements must be append-only ledger records.
- Balance update and movement insert must be atomic.
- Do not allow negative balance unless current business rule explicitly allows it; otherwise reject with clear error.

### 3. Stock Opname

Create complete stock opname workflow.

Tables:

```txt
stock_opnames
stock_opname_items
```

`stock_opnames` fields:

```txt
id uuid primary key
tenant_id uuid not null
outlet_id uuid not null
opname_number text/varchar not null
status varchar not null default 'draft'
notes text nullable
started_by varchar/text nullable
submitted_by varchar/text nullable
approved_by varchar/text nullable
started_at timestamp not null default current timestamp
submitted_at timestamp nullable
approved_at timestamp nullable
cancelled_at timestamp nullable
created_at timestamp not null default current timestamp
updated_at timestamp not null default current timestamp
```

Allowed statuses:

```txt
draft
submitted
approved
cancelled
```

`stock_opname_items` fields:

```txt
id uuid primary key
opname_id uuid not null
product_id uuid not null
system_quantity integer not null
counted_quantity integer not null
variance_quantity integer not null
notes text nullable
created_at timestamp not null default current timestamp
updated_at timestamp not null default current timestamp
```

Rules:

- Create draft opname for active outlet.
- Add/update item counted qty.
- Submit draft.
- Approve submitted opname.
- Approval creates `OPNAME_ADJUSTMENT` movement for each item with variance != 0.
- Approval updates `inventory_balances` atomically.
- Cancel only if not approved.
- Requires `inventory_advanced_stock`.
- Does not require `multi_location`.

### 4. Stock Transfer

Create complete transfer workflow for cross-outlet movement.

Tables:

```txt
stock_transfers
stock_transfer_items
```

`stock_transfers` fields:

```txt
id uuid primary key
tenant_id uuid not null
transfer_number text/varchar not null
from_outlet_id uuid not null
to_outlet_id uuid not null
status varchar not null default 'draft'
notes text nullable
created_by varchar/text nullable
submitted_by varchar/text nullable
received_by varchar/text nullable
cancelled_by varchar/text nullable
submitted_at timestamp nullable
received_at timestamp nullable
cancelled_at timestamp nullable
created_at timestamp not null default current timestamp
updated_at timestamp not null default current timestamp
```

Allowed statuses:

```txt
draft
submitted
received
cancelled
```

`stock_transfer_items` fields:

```txt
id uuid primary key
transfer_id uuid not null
product_id uuid not null
quantity integer not null
notes text nullable
created_at timestamp not null default current timestamp
updated_at timestamp not null default current timestamp
```

Rules:

- Requires both `inventory_advanced_stock` and `multi_location`.
- `from_outlet_id` and `to_outlet_id` must differ.
- Submitted transfer creates `TRANSFER_OUT` movement from source outlet and decreases source balance.
- Received transfer creates `TRANSFER_IN` movement to destination outlet and increases destination balance.
- If you implement direct-submit-and-receive in one step, document clearly. Prefer explicit submit/receive workflow.
- Do not show transfer UI if tenant lacks `multi_location`.
- API must return 403 if tenant lacks `multi_location` even if UI is bypassed.

### 5. Low Stock Alert

Implement low stock alert as an advanced inventory feature.

Minimum complete behavior:

- Allow per-product/per-outlet threshold via `inventory_balances.low_stock_threshold`, falling back to product/default threshold if present, then global default 10.
- Stock list marks low/out based on the effective threshold.
- Provide endpoint to list low stock products for active outlet.
- Provide endpoint or field to update threshold for product/outlet.
- UI has Low Stock tab/filter/card.

Recommended optional table if useful:

```txt
inventory_low_stock_alerts
```

Only add this table if implementing alert state/acknowledgement. If added, include:

```txt
id
tenant_id
outlet_id
product_id
threshold
current_quantity
status open|acknowledged|resolved
acknowledged_by
acknowledged_at
resolved_at
created_at
updated_at
```

Rules:

- Requires `inventory_advanced_stock` for threshold management/alert management.
- Basic stock may still show simple low/out labels, but advanced adds configurable threshold and alert workflow.

## Required Application Layer

Create/organize ports and use cases under `packages/application/inventory`.

Suggested ports:

```txt
InventoryBalanceRepositoryPort
InventoryMovementRepositoryPort
StockOpnameRepositoryPort
StockTransferRepositoryPort
InventoryReportRepositoryPort
```

Suggested use cases:

```txt
GetStockProducts
RecordStockMovement
GetInventoryMovements
GetProductInventoryMovements
GetInventoryReport
CreateStockOpname
UpdateStockOpnameItem
SubmitStockOpname
ApproveStockOpname
CancelStockOpname
CreateStockTransfer
SubmitStockTransfer
ReceiveStockTransfer
CancelStockTransfer
UpdateLowStockThreshold
GetLowStockAlerts
```

Use cases must enforce business rules. Repositories only persist/query.

Entitlement checks can remain at API helper/middleware boundary, but the API must call the correct gates consistently.

## Required Infrastructure Layer

Implement Drizzle repositories under `packages/infrastructure/repositories/inventory` or the nearest current repository convention.

Repositories must:

- use transactions for movement + balance update;
- support row lock or equivalent safe update for balance rows when adjusting stock;
- create missing balance row for tracked product/outlet when needed;
- write movement rows after every stock-changing operation;
- return typed DTOs expected by application/API.

## Required API Layer

Existing `/api/inventory` routes must be kept but cleaned/thin where practical.

Required endpoints:

```txt
GET    /api/inventory/products
PUT    /api/inventory/products/:id/adjust
POST   /api/inventory/movements
GET    /api/inventory/movements
GET    /api/inventory/movements/:productId
GET    /api/inventory/report
GET    /api/inventory/low-stock
PUT    /api/inventory/products/:id/threshold
POST   /api/inventory/opnames
GET    /api/inventory/opnames
GET    /api/inventory/opnames/:id
PUT    /api/inventory/opnames/:id/items/:productId
POST   /api/inventory/opnames/:id/submit
POST   /api/inventory/opnames/:id/approve
POST   /api/inventory/opnames/:id/cancel
POST   /api/inventory/transfers
GET    /api/inventory/transfers
GET    /api/inventory/transfers/:id
POST   /api/inventory/transfers/:id/submit
POST   /api/inventory/transfers/:id/receive
POST   /api/inventory/transfers/:id/cancel
```

Entitlement gates:

```txt
inventory_basic_stock:
- GET /products
- PUT /products/:id/adjust basic mode

inventory_advanced_stock:
- movements
- report
- low stock threshold/alert
- opnames

inventory_advanced_stock + multi_location:
- transfers
```

Also respect active outlet context from request headers/middleware.

## Required Frontend

Keep frontend code clean. Do not pile all logic into `stock.tsx` if it becomes too large.

Suggested structure:

```txt
apps/pos-terminal-web/src/features/inventory/components/
apps/pos-terminal-web/src/features/inventory/hooks/
apps/pos-terminal-web/src/features/inventory/services/
```

If project has not fully migrated to `features/`, use current structure but extract components/hooks instead of putting everything in one giant page.

Required UI:

```txt
Daftar Stok
Riwayat Mutasi
Laporan
Opname
Transfer
Low Stock Alert
```

UI rules:

- Basic tenant sees basic stock list and basic adjust.
- Advanced tenant sees Mutasi, Riwayat, Laporan, Opname, Low Stock Alert.
- Transfer tab/action only appears if `can("inventory_advanced_stock") && can("multi_location")`.
- If advanced is active but multi location is not active, show no transfer action or show locked state explaining that transfer needs Multi Lokasi.
- Never show transfer as usable without backend entitlement.

## Current Feature Gaps To Close

Current implementation only covers movement/history/report and simple low stock display. Close these gaps:

```txt
- No stock opname workflow.
- No stock transfer workflow.
- No configurable threshold per outlet/product.
- No true per-outlet stock balance table.
- Transfer cannot be correct while stock lives only on products.stock_qty.
```

## Compatibility Rule

Keep current basic stock behavior working.

When introducing `inventory_balances`, ensure existing tracked products get or can lazily create a balance row for active/default outlet. Since this is development, a clean baseline is enough, but runtime should still handle missing balance rows gracefully.

## Tests

Add/update tests for:

```txt
- advanced stock requires inventory_advanced_stock
- transfer requires both inventory_advanced_stock and multi_location
- advanced stock works without multi_location
- single outlet tenant can create movement/opname/low-stock threshold
- transfer is blocked without multi_location
- opname approval writes movement and updates balance
- transfer submit/receive writes TRANSFER_OUT and TRANSFER_IN
- low stock threshold affects low stock result
```

## Validation

Run:

```bash
pnpm type-check
pnpm --filter @pos/api type-check
pnpm --filter @pos/terminal-web type-check
pnpm test -- --runInBand
```

If full test suite is not available, run the relevant API/inventory tests and document exact commands.

Manual smoke:

```txt
1. Tenant with inventory_basic_stock only:
   - stock list works
   - advanced tabs locked

2. Tenant with inventory_advanced_stock only:
   - movement works
   - opname works
   - low stock threshold works
   - report works
   - transfer blocked/hidden

3. Tenant with inventory_advanced_stock + multi_location:
   - transfer draft works
   - submit decreases source outlet
   - receive increases target outlet
   - movements show TRANSFER_OUT/TRANSFER_IN
```

## Required Report

Create:

```txt
roadmap/inventory/advanced_stock_full_implementation_report.md
```

Report must include:

```txt
- implemented tables/schema changes
- entitlement gate matrix
- API endpoints added/changed
- UI tabs/components added/changed
- single-outlet behavior proof
- multi-location transfer behavior proof
- validation commands and results
- known remaining issues, if any
```

## Completion Checklist

### Phase 1 — Schema and domain model

- [ ] `inventory_balances` implemented.
- [ ] `stock_opnames` implemented.
- [ ] `stock_opname_items` implemented.
- [ ] `stock_transfers` implemented.
- [ ] `stock_transfer_items` implemented.
- [ ] low stock threshold storage implemented.
- [ ] clean baseline migration updated without ALTER/ensure/repair.

### Phase 2 — Application use cases and ports

- [ ] ports created.
- [ ] movement use case uses balance table.
- [ ] opname use cases complete.
- [ ] transfer use cases complete.
- [ ] low stock use cases complete.
- [ ] report reads balance/movement correctly.

### Phase 3 — Infrastructure repositories

- [ ] Drizzle repositories implemented.
- [ ] movement + balance update atomic.
- [ ] opname approval atomic.
- [ ] transfer submit/receive atomic.
- [ ] low stock queries efficient.

### Phase 4 — API

- [ ] all required endpoints exist.
- [ ] entitlement gates correct.
- [ ] transfer requires `multi_location`.
- [ ] active outlet respected.
- [ ] errors clear and typed.

### Phase 5 — Frontend

- [ ] UI has stock, history, report, opname, transfer, low alert.
- [ ] transfer hidden/locked without `multi_location`.
- [ ] advanced stock works without multi location.
- [ ] UI code extracted cleanly, no giant messy page growth.

### Phase 6 — Tests, report, commit

- [ ] tests added/updated.
- [ ] validation commands pass or failures documented.
- [ ] report created.
- [ ] commit created.

## Commit

Commit message:

```txt
feat(inventory): implement complete advanced stock workflows
```

Only include inventory feature implementation, schema/baseline updates, tests, and report. Do not include unrelated entitlement, payment, KDS, CFD, POS, or migration-runner changes.
