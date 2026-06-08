# P0 — Baseline, Safety Net, and Architecture Audit

Status: planned
Purpose: create a reliable baseline before any large architecture movement.

## Goal

Document the current architecture state, known dependency leaks, risk points, and test/type-check baseline before changing code.

This phase must not refactor production code except tiny documentation or audit helpers.

## Scope

- Confirm current branch and latest commit.
- Record current package/app structure.
- Record current dependency leaks.
- Record controller, route, schema, and frontend risk files.
- Run baseline validation commands.
- Create a risk register.

## Required audit targets

Application DB/infrastructure leak candidates:

- `packages/application/orders/RecordPayment.ts`
- `packages/application/orders/CreateAndPayOrder.ts`
- `packages/application/orders/orderNumberSequence.ts`
- `packages/application/sync/SyncOfflineOrder.ts`
- `packages/application/catalog/CreateOrUpdateProduct.ts`
- `packages/application/inventory/inventoryPolicy.ts`
- `packages/application/inventory/inventorySyncErrors.ts`
- `packages/application/inventory/stockMovements.ts`

Controller/route risk candidates:

- `apps/api/src/http/controllers/OrdersController.ts`
- `apps/api/src/routes.ts`
- `apps/api/src/container.ts`

Frontend risk candidate:

- `apps/pos-terminal-web/src/pages/pos.tsx`

Schema boundary candidate:

- `shared/schema.ts`

## Validation commands

Run and record results:

```bash
pnpm type-check
pnpm --filter @pos/api type-check
pnpm --filter @pos/terminal-web type-check
pnpm --filter @pos/offline test
pnpm --filter @pos/api test
```

If a command fails before any refactor, record it as baseline. Do not hide it and do not fix unrelated issues inside P0.

## Deliverables

- Update this file with baseline findings.
- Add a short dependency leak list if found.
- Add risk register entries for behavior that must not regress.

## Hard rules

- Do not move source files.
- Do not rename endpoints.
- Do not change DB schema.
- Do not alter payment, order, inventory, KDS, CFD, or offline behavior.
- Do not start P1 until this phase is committed.

## Definition of done

- Baseline validation command results are recorded.
- Risk files are listed.
- Known failing tests/type-checks are documented separately from refactor work.
- Next phase can introduce ports/contracts safely.
