# Replit/Codex Prompt P3 — Inventory SOT No-Legacy Flow Refactor

Repository: `Rndynt/AuraPoS`

## Objective

Refactor inventory so the feature is clear, usable, and has one source of truth.

This is not another patch to hide bugs. Remove confusing stock behavior and remove legacy compatibility assumptions from the inventory feature.

The final result must feel like a normal POS inventory module:

- Product page manages catalog identity only.
- Stock & Inventaris manages all stock operations.
- Every stock number shown to the user comes from the same source of truth.
- Entitlements control access consistently.
- UI is mobile-first and responsive, using existing app components/styles.
- No hardcoded commercial rules, entitlement bypasses, fake stock values, or leftover compatibility hacks.

## Mandatory Deep Analysis Before Editing

Before changing files, perform a full audit and write notes in the final report.

Audit all current stock-related code:

```txt
apps/api/src/http/routes/inventory.ts
apps/api/src/http/routes/inventory-advanced.ts
apps/api/src/http/helpers/inventoryEntitlement.ts
apps/api/src/services/tenantEntitlements.ts
apps/pos-terminal-web/src/pages/stock.tsx
apps/pos-terminal-web/src/hooks/api/useInventory.ts
apps/pos-terminal-web/src/hooks/api/useInventoryAdvanced.ts
apps/pos-terminal-web/src/lib/outlet.ts
packages/application/inventory/**
packages/application/entitlements/**
packages/infrastructure/repositories/inventory/**
packages/infrastructure/db/schema/inventory.schema.ts
packages/infrastructure/db/schema/catalog.schema.ts
migrations/0004_catalog.sql
migrations/0008_inventory.sql
```

Run searches before editing:

```bash
rg -n "stock_qty|stockQty|legacy|compat|mirror|LOW_STOCK_THRESHOLD|inventory_balances|inventoryBalances" apps packages migrations roadmap
rg -n "inventory_basic_stock|inventory_advanced_stock|multi_location|requireTenantEntitlement|can\(" apps packages
rg -n "Dialog|Drawer|Sheet|Modal|stock.tsx|Atur Stok|Transfer|Opname" apps/pos-terminal-web/src
```

The audit must answer:

1. Where is stock currently read?
2. Where is stock currently written?
3. Which UI screen lets users input stock?
4. Which endpoints depend on `products.stock_qty`?
5. Which entitlements gate stock operations?
6. Which stock actions are outlet-specific?
7. Which UI dialogs/drawers need responsive replacement?
8. Which old/unused stock helpers should be deleted?

Do not start coding until this analysis is complete.

## Final Product Decision

Inventory stock source of truth is only:

```txt
inventory_balances.quantity
```

Scope:

```txt
tenant_id + outlet_id + product_id
```

Do not use `products.stock_qty` as stock source anymore.

Do not show `products.stock_qty` in UI.

Do not keep stock mirror logic.

Do not keep legacy compatibility logic for inventory stock.

If `products.stock_qty` still exists in schema, remove it from stock feature reads/writes. If safe in this development project, remove it from schema and clean baseline migrations. If removal impacts many unrelated catalog DTOs, leave the physical column only as unused schema debt and document exact remaining reference. It must not drive UI/API/business logic.

## Cleanup Requirements

This task must finish cleanly. Do not leave intentional leftovers for another patch.

Required cleanup:

- Remove unused stock helpers, duplicate mapping functions, obsolete DTO aliases, and dead UI states.
- Remove or rename ambiguous `stockQty` UI/API fields where practical.
- If a deprecated alias must remain temporarily for frontend compatibility inside the same patch, it must be mapped from `inventory_balances.quantity`, not from `products.stock_qty`, and documented in the report.
- Remove old comments that mention legacy mirror/compatibility if they no longer apply.
- Delete unused imports and dead code.
- Keep `stock.tsx` from growing into an unmaintainable file; extract components/hooks.
- Do not add new roadmap files except the required implementation report.

## Hardcoded Rule Ban

Do not hardcode commercial/entitlement behavior in UI or API.

Allowed:

- default threshold constant as a fallback config value, preferably centralized.
- movement type enum/constants in domain/application.

Forbidden:

- hardcoded plan names to decide access;
- hardcoded `starter/growth/pro` gates in stock logic;
- UI-only gating without backend entitlement enforcement;
- transfer enabled only because tab exists;
- stock behavior that depends on a string label like `Cabang Utama`;
- fixed outlet IDs or branch names;
- fake stock values for missing balances.

Entitlements must come from current entitlement SOT/effective entitlement context.

## Correct User Mental Model

### Product page

Product page is catalog only:

- name;
- price;
- category;
- SKU/barcode;
- image;
- available/not available;
- stock tracking on/off.

Product page is not the place to input stock quantity.

If stock tracking is enabled, show guidance:

```txt
Stok produk ini dikelola di Stok & Inventaris.
Atur stok awal, mutasi, opname, stok rendah, dan transfer dari halaman Stok.
```

Remove ambiguous `Stok: 50` badge from Product page unless it clearly says outlet scope or aggregate scope and is read-only.

Preferred: no operational stock number on Product page.

### Stok & Inventaris page

This page is the only operational stock control center.

It owns:

- opening stock / stok awal;
- stock list per outlet;
- basic stock adjustment;
- advanced movement / mutasi;
- low stock threshold;
- opname;
- transfer;
- report.

## Required UI Flow

### Opening stock

Add clear action:

```txt
Atur Stok Awal
```

Rules:

- Must be in Stok & Inventaris, not Product page.
- Requires active outlet.
- For single outlet tenant, use default outlet automatically.
- For multi outlet tenant, user must select a specific outlet.
- Disabled in `Semua Cabang` aggregate view.
- Writes `inventory_balances` only.
- If advanced stock is active, write movement type `INITIAL`.

### Stock adjustment

Basic quick edit in stock list updates `inventory_balances` for active outlet.

Advanced movement writes:

- balance update;
- `inventory_movements` ledger.

No direct product stock update.

### Low stock

Low stock uses the exact same source as stock list:

```txt
inventory_balances.quantity
```

Threshold update must not create fake zero stock.

If balance does not exist, create balance using explicit selected outlet and quantity 0 only when user intentionally sets opening stock or threshold for that outlet. Do not infer stock from product global field.

### Opname

Opname works per outlet.

Rules:

- Requires `inventory_advanced_stock`.
- Does not require `multi_location`.
- Single outlet tenant can use it normally.
- Multi outlet tenant must select one outlet.
- Approval writes `OPNAME_ADJUSTMENT` movements and updates `inventory_balances`.

### Transfer

Transfer is a multi-location feature only.

Rules:

- Requires `inventory_advanced_stock` and `multi_location`.
- Draft does not change stock.
- Submit decreases source outlet.
- Receive increases destination outlet.
- UI must clearly show lifecycle:

```txt
Draft = stok belum berubah
Dikirim = stok outlet asal berkurang
Diterima = stok outlet tujuan bertambah
```

After creating transfer, show the draft immediately and open detail or show row in list.

## Single Outlet Behavior

Tenant without `multi_location`:

- no confusing branch selector;
- one default outlet context;
- stock list works;
- opening stock works;
- adjustment works;
- mutasi works if advanced active;
- low stock works;
- opname works if advanced active;
- report works;
- transfer locked/hidden.

## Multi Outlet Behavior

Tenant with `multi_location`:

- stock is independent per outlet;
- setting stock in Cabang Utama must not set stock in outlet lain;
- `Semua Cabang` is aggregate read-only;
- stock-changing actions require specific outlet;
- transfer moves stock between outlet balances.

## Backend Refactor Requirements

Remove stock business dependency on `products.stock_qty` from:

```txt
apps/api/src/http/routes/inventory.ts
apps/api/src/http/routes/inventory-advanced.ts
packages/infrastructure/repositories/inventory/*
packages/application/inventory/*
```

Required application use cases:

```txt
GetStockListForOutlet
GetStockAggregate
SetOpeningStock
AdjustStockBalance
RecordStockMovement
GetLowStockForOutlet
UpdateLowStockThreshold
CreateStockOpname
ApproveStockOpname
CreateStockTransfer
SubmitStockTransfer
ReceiveStockTransfer
```

Routes must stay thin:

- entitlement check;
- active outlet/scope resolution;
- request validation;
- use case call;
- response mapping.

## API Rules

`GET /api/inventory/products`

- returns balance-based stock for active outlet;
- supports aggregate scope for `Semua Cabang` if needed;
- does not read `products.stock_qty`.

`PUT /api/inventory/products/:id/adjust`

- updates `inventory_balances` only.

`POST /api/inventory/opening-stock`

- create/set opening stock for selected outlet and product.

`GET /api/inventory/low-stock`

- reads same balance source as stock list.

`PUT /api/inventory/products/:id/threshold`

- updates threshold on balance row for selected outlet;
- does not overwrite or fake quantity.

Transfer endpoints:

- list includes transfers where active outlet is source or destination;
- admin/owner can see all tenant transfers if supported;
- create draft appears immediately;
- submit and receive update balances.

## Entitlement Rules

Entitlements must be checked on the backend and reflected in UI from the same effective entitlement source.

`inventory_basic_stock`:

- stock list;
- opening stock;
- basic adjustment.

`inventory_advanced_stock`:

- typed movements;
- history;
- reports;
- threshold/low stock management;
- opname.

`inventory_advanced_stock + multi_location`:

- transfer.

Do not require `multi_location` for normal advanced stock.

Backend must return 403 for blocked operations even if the UI is bypassed.

Frontend must not show usable controls that backend will reject, except locked/upgrade state.

## Frontend and UI/UX Requirements

Do not grow `stock.tsx` further into unreadable code. Extract components/hooks if needed.

Required UX:

- Product page stock input removed or converted to guidance.
- Stock page has obvious `Atur Stok Awal` flow.
- Stock page labels current outlet clearly.
- Aggregate `Semua Cabang` view is read-only for stock-changing actions.
- Low stock quantity matches stock list quantity.
- Transfer list shows newly created draft.
- Transfer detail has explicit Draft/Dikirim/Diterima explanation.

Responsive UI rule:

- On mobile, stock forms/actions must use existing drawer/sheet-style mobile pattern.
- On tablet/desktop, stock forms/actions must use the existing Dialog/Modal component pattern.
- Desktop dialogs must be centered on screen, not bottom-sheet style.
- Dialog/drawer content must be responsive, scroll-safe, and not overflow viewport.
- Styling must match current AuraPoS component language: rounded panels, existing spacing, typography, buttons, cards, tabs, and colors.
- Do not introduce random one-off styling that does not match existing components.

Affected UI patterns include:

- Opening stock form.
- Basic adjust form.
- Advanced movement form.
- Threshold edit.
- Opname create/detail/approval.
- Transfer create/detail/submit/receive.

## Tests Required

Add/update tests:

- product stock no longer uses `products.stock_qty`;
- opening stock writes one outlet only;
- stock list reads `inventory_balances`;
- low stock reads same quantity as stock list;
- threshold update preserves quantity;
- single outlet advanced works without multi location;
- multi outlet stock is independent;
- aggregate view sums balances and blocks edits;
- transfer draft appears;
- submit decreases source;
- receive increases destination;
- transfer blocked without multi location;
- entitlement checks are enforced on API, not only UI;
- no hardcoded plan gates for inventory behavior.

## Validation

Run:

```bash
pnpm type-check
pnpm --filter @pos/api type-check
pnpm --filter @pos/terminal-web type-check
pnpm --filter @pos/api test
```

Manual smoke:

1. Create product with stock tracking on.
2. Product page must not ask for operational stock quantity.
3. Go to Stok & Inventaris.
4. Set opening stock 50 for Cabang Utama.
5. Stock list shows 50.
6. Low stock does not show fake 0.
7. Switch outlet lain: stock is 0/unset, not copied 50.
8. Transfer 10 from Cabang Utama to outlet lain.
9. Draft appears and stock unchanged.
10. Submit makes source 40.
11. Receive makes destination 10.
12. Try transfer without `multi_location`: UI locked and API returns 403.
13. Confirm mobile uses drawer and desktop uses centered dialog.

## Report

Create:

```txt
roadmap/inventory/inventory_sot_no_legacy_flow_refactor_report.md
```

Report must include:

- pre-change audit summary;
- final stock SOT decision;
- removed `products.stock_qty` stock-logic usages;
- removed cleanup/dead-code list;
- Product page flow before/after;
- Stock page flow before/after;
- single outlet proof;
- multi outlet proof;
- transfer lifecycle proof;
- entitlement matrix;
- hardcoded rule audit result;
- responsive UI changes and component pattern used;
- validation output;
- remaining issues if any.

Remaining issues should be `none` unless truly blocked by external dependency. Do not leave intentional P4/P5 patch work for the same stock flow.

## Completion Checklist

> 2026-06-17 batch note: partially implemented. Completed audit/report, removed product-page operational stock entry/display, removed balance lazy seeding/mirroring from `products.stock_qty`, and added an opening-stock API. Checklist items remain unchecked unless the full prompt requirement is completely validated; remaining blockers are documented in `roadmap/inventory/inventory_sot_no_legacy_flow_refactor_report.md`.

- [ ] Deep analysis completed before code changes.
- [ ] Product page no longer manages operational stock.
- [ ] Stock page owns opening stock.
- [ ] API stock list reads inventory balances.
- [ ] API low stock reads same source as stock list.
- [ ] Adjustment updates inventory balances only.
- [ ] Movement updates inventory balances + ledger.
- [ ] No stock cloning to all outlets.
- [ ] Aggregate view read-only for stock-changing actions.
- [ ] Transfer lifecycle clear and functional.
- [ ] Single outlet advanced works without multi location.
- [ ] Transfer API blocked without multi_location.
- [ ] Entitlement checks use effective SOT, no hardcoded plan gate.
- [ ] Mobile forms use drawer/sheet pattern.
- [ ] Desktop/tablet forms use centered dialog pattern.
- [ ] UI styling matches existing component system.
- [ ] Dead code and obsolete stock compatibility logic removed.
- [ ] Tests pass.
- [ ] Report created.
- [ ] No intentional leftover stock-flow patches remain.

## Commit

Commit message:

```txt
refactor(inventory): clarify stock source of truth and flow
```
