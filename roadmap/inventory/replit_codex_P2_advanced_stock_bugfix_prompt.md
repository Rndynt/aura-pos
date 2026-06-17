# Replit/Codex Prompt P2 — Advanced Stock Bugfix & Stock Source-of-Truth Hardening

Repository: `Rndynt/AuraPoS`

## Context

P1 advanced stock implementation is already done, but QA found several bugs:

1. Stock transfer can be created, but it does not appear in the transfer list.
2. Stock transfer draft does not affect stock, but the UI makes it look like the transfer is done.
3. Products show stock in `Daftar Stok`, but `Stok Rendah` shows quantity `0` for the same products.
4. When product stock tracking is enabled and stock is input as 50, the same 50 can appear across all branches, which is wrong for real multi-branch onboarding.
5. Single-outlet and multi-outlet tenants must both work correctly.

## Current Root Causes To Verify

Before coding, verify these current code paths:

- `apps/api/src/http/routes/inventory.ts` still reads and writes `products.stock_qty` directly for product stock list, basic adjust, and manual movements.
- `apps/api/src/http/routes/inventory-advanced.ts` low-stock reads `inventory_balances` only.
- `DrizzleInventoryBalanceRepository.setThreshold()` creates a missing balance row with quantity `0`; therefore setting/checking threshold can show 0 even when `products.stock_qty` is 50.
- `GET /api/inventory/transfers` currently filters by `fromOutletId: req.outletId`; this can hide transfers where the active outlet is the destination or where the selected active outlet does not match the source outlet.
- `POST /api/inventory/transfers` creates only a draft. Actual stock effect happens on submit/receive. UI must make this explicit and should open the created transfer detail so user can submit.

## Objective

Fix advanced stock so `inventory_balances` becomes the real stock source of truth for advanced inventory, without breaking basic stock compatibility.

This must be a clean architecture patch. Do not dump more business logic into route files or the React page.

## Non-negotiable Rules

1. Do not remove entitlement gates.
2. `inventory_advanced_stock` must work without `multi_location` for single-outlet tenants.
3. Only stock transfer requires both `inventory_advanced_stock` and `multi_location`.
4. Do not clone the same initial product stock into every outlet automatically.
5. Do not add `ensure_*`, `repair_*`, drift, or hotfix migration files.
6. If schema/baseline changes are required, update the owning clean baseline migration file and report.
7. Keep code aligned with roadmap clean architecture: domain/application/infrastructure/API/UI separation.
8. Do not make unrelated payment, KDS, CFD, auth, or entitlement changes.

## Correct Stock Model

### Single outlet tenant

- There is one active/default outlet.
- `inventory_balances` has one row per tracked product for that outlet.
- Advanced movement, opname, low-stock, report all operate on that outlet balance.
- Transfer tab is hidden/locked because `multi_location` is not active.

### Multi outlet tenant

- `inventory_balances` stores separate stock per `outlet_id + product_id`.
- Stock list must show stock for the active outlet, not global copied stock.
- Transfer uses source outlet balance and destination outlet balance.
- Creating a product with initial stock should not automatically set that stock into every outlet.

## Required Behavioral Fixes

### 1. Balance initialization must be deterministic

Add a use case/service such as:

```txt
EnsureProductBalanceForOutlet
EnsureTrackedProductBalancesForOutlet
```

Rules:

- If an active outlet has no balance row for a tracked product, lazily create one.
- For single-outlet/default outlet, initial balance may use `products.stock_qty` as legacy seed.
- For multi-outlet tenants, only the current active/default outlet may inherit initial `products.stock_qty` as legacy seed.
- Other outlets should start at 0 until set by opname, movement, or transfer.
- Never blindly copy `products.stock_qty` to all outlets.

### 2. Stock list must read active outlet balance

Patch `GET /api/inventory/products`:

- keep `inventory_basic_stock` gate;
- require/resolve active outlet context;
- for tracked products, return quantity from `inventory_balances` for that outlet;
- if balance missing, create/synthesize balance using the initialization rule above;
- use effective low-stock threshold from balance threshold, then default 10;
- return stock summary based on balance quantity, not raw global `products.stock_qty`.

### 3. Basic adjust must update balance too

Patch `PUT /api/inventory/products/:id/adjust`:

- for tracked product + active outlet, update `inventory_balances` quantity for the active outlet;
- update `products.stock_qty` only as compatibility mirror for single outlet or aggregate policy decided below;
- if advanced entitlement active, write movement ledger;
- if only basic entitlement active, still update the active outlet balance so low-stock and future advanced upgrade are consistent.

### 4. Manual advanced movements must update balance, not only products.stock_qty

Patch `POST /api/inventory/movements`:

- use `InventoryBalanceRepository.applyDelta()` or application use case;
- write movement and balance update atomically;
- do not update only `products.stock_qty` directly;
- reject negative stock unless current business rule explicitly allows it.

### 5. Low stock must use the same source as stock list

Patch `GET /api/inventory/low-stock`:

- ensure balances for all tracked products for active outlet before query, or join products with balances and coalesce missing balance using initialization rule;
- do not let missing balance default to 0 when product stock is actually 50 in the active outlet;
- threshold update must preserve current balance quantity when it creates a missing balance row.

Specific bug to fix:

```txt
setThreshold() must not insert quantity = 0 blindly.
```

It must either:

- load current product/active outlet stock via balance initialization service; or
- require balance exists by calling ensureBalance first.

### 6. Transfer list must show created transfers

Patch `GET /api/inventory/transfers`:

- do not filter only `fromOutletId = req.outletId` by default.
- for tenant owner/admin, list tenant transfers for the current tenant.
- if outlet scoping is required for staff, include transfers where active outlet is either source or destination.
- support query params:

```txt
scope=all|source|destination|involved
status=draft|submitted|received|cancelled
```

Default should be `involved` for outlet-scoped users and `all` for owner/admin if role info is available. If role info is not available yet, use `involved` but include both from/to.

### 7. Transfer creation UX must be clear

Creating a transfer creates a draft only. It should not reduce stock yet.

Patch UI:

- success toast should say `Draft transfer dibuat` not imply stock moved;
- after create, open the created transfer detail drawer or insert the created transfer into list immediately;
- show clear action buttons:
  - Draft: `Kirim Transfer` -> deducts source stock;
  - Submitted: `Terima Stok` -> adds destination stock;
- after submit/receive/cancel, invalidate:
  - transfers;
  - stock products;
  - low-stock;
  - movements;
  - report.

### 8. Product initial stock with multiple outlets

Patch product creation/edit stock behavior if needed:

- Do not clone initial stock to every outlet.
- Treat initial stock input as stock for active/default outlet only.
- For a tenant that already has multiple outlets and is onboarding existing stock, provide explicit options in UI/API:
  - set opening stock for current outlet;
  - later use stock opname per outlet;
  - or import/set per-outlet balances in a future import flow.

At minimum in this patch:

- document this rule in UI copy/help text;
- ensure code does not create identical balances across every outlet.

## Required Clean Architecture Work

Do not leave all fixes inside `inventory.ts` route.

Create/update application-level services/use cases under:

```txt
packages/application/inventory/
```

Suggested:

```txt
balance.ts
stockList.ts
lowStock.ts
movement.ts
transfer.ts
opname.ts
```

Suggested ports:

```txt
InventoryBalanceRepositoryPort
InventoryMovementWriterPort
ProductStockReaderPort
OutletContextPort if needed
```

Infrastructure must implement ports in:

```txt
packages/infrastructure/repositories/inventory/
```

API routes should only:

- check entitlement;
- parse request;
- call use case;
- map response.

## Required API Acceptance Criteria

### Single-outlet tenant with inventory_basic_stock only

- GET stock products shows correct stock.
- PUT adjust changes visible stock.
- low-stock advanced endpoints remain 403 if no advanced entitlement.

### Single-outlet tenant with inventory_advanced_stock only

- GET stock products shows active outlet balance.
- POST movement updates balance and visible stock.
- Low-stock tab matches stock list quantity.
- Opname approval updates balance and stock list.
- Transfer API returns 403 because no `multi_location`.
- Transfer UI is locked/hidden.

### Multi-location tenant with inventory_advanced_stock + multi_location

- Each outlet has independent product balance.
- Product with initial stock 50 does not create 50 in every outlet.
- Transfer draft appears immediately in transfer list.
- Submit transfer reduces source outlet stock.
- Receive transfer increases destination outlet stock.
- Transfer movement ledger contains TRANSFER_OUT and TRANSFER_IN.
- Low-stock for each outlet uses that outlet's balance.

## Required Frontend Acceptance Criteria

- Daftar Stok quantity and Stok Rendah quantity must match for the same active outlet.
- Transfer tab must show the draft after create.
- Transfer create toast must say draft, not completed stock movement.
- Transfer detail must explain status and available actions.
- Product transfer selector must display source outlet stock, not global product stock.
- If active tenant lacks `multi_location`, Transfer tab locked with clear reason.

## Tests Required

Add/update tests for:

```txt
- balance initialization from products.stock_qty for single/default outlet only
- no stock cloning to all outlets
- stock list reads active outlet balance
- low-stock reads active outlet balance and preserves quantity on threshold update
- basic adjust updates balance
- advanced movement updates balance and movement ledger
- transfer draft appears in list
- transfer list includes source and destination outlet involvement
- transfer submit decreases source
- transfer receive increases destination
- transfer blocked without multi_location
- advanced stock works without multi_location
```

## Validation

Run:

```bash
pnpm type-check
pnpm --filter @pos/api type-check
pnpm --filter @pos/terminal-web type-check
pnpm test -- --runInBand
```

If full test suite is not available, run the most relevant API/inventory tests and document exact commands.

Manual smoke:

```txt
1. Single outlet + advanced:
   - product stock 50
   - low-stock shows no 0 bug
   - threshold update preserves 50
   - movement -5 makes 45
   - opname counted 40 makes 40
   - transfer locked

2. Multi outlet + advanced + multi_location:
   - outlet A product stock 50
   - outlet B same product stock 0 or unset
   - create transfer A -> B qty 10
   - draft appears in list
   - stock remains A=50 B=0 while draft
   - submit makes A=40 B=0
   - receive makes A=40 B=10
   - low-stock per outlet matches those numbers
```

## Required Report

Create:

```txt
roadmap/inventory/advanced_stock_bugfix_report.md
```

Report must include:

```txt
- root cause summary
- files changed
- balance source-of-truth decision
- single-outlet behavior proof
- multi-location behavior proof
- transfer status lifecycle proof
- low-stock consistency proof
- entitlement gate matrix
- tests/validation output
- remaining issues if any
```

## Completion Checklist

- [ ] Stock list uses active outlet balance.
- [ ] Low-stock uses same source as stock list.
- [ ] Threshold update does not create fake zero stock.
- [ ] Basic adjust updates balance.
- [ ] Advanced movement updates balance atomically.
- [ ] Product initial stock does not clone into all outlets.
- [ ] Transfer draft appears after creation.
- [ ] Transfer submit decreases source outlet.
- [ ] Transfer receive increases destination outlet.
- [ ] Transfer list includes both source/destination involvement.
- [ ] Single-outlet advanced works without multi_location.
- [ ] Transfer remains gated by multi_location.
- [ ] UI copy clarifies Draft/Submit/Receive lifecycle.
- [ ] Tests added/updated.
- [ ] Report created.

## Commit

Commit message:

```txt
fix(inventory): harden advanced stock balances and transfers
```
