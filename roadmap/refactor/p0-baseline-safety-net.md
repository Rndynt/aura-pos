# P0 — Baseline, Safety Net, and Architecture Audit

Status: completed (baseline documented 2026-06-08)
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

---

## P0 Baseline Findings — 2026-06-08

### Branch and commit baseline

- Current branch: `work`
- Latest commit before this P0 documentation batch: `aea3c55 docs: add refactor execution protocol`
- Working tree before this P0 batch: clean except for documentation changes made by this batch.

### Current package/app structure

Root workspace files observed for this baseline:

- Workspace/package orchestration: `package.json`, `pnpm-workspace.yaml`, `turbo.json`, `tsconfig.base.json`, `tsconfig.json`, `pnpm-lock.yaml`.
- Application packages:
  - `apps/api` — Express/API server package.
  - `apps/pos-terminal-web` — Vite/React POS terminal package.
  - `apps/web` — web app package.
- Shared/domain packages:
  - `packages/domain`
  - `packages/application`
  - `packages/infrastructure`
  - `packages/core`
  - `packages/features`
  - `packages/offline`
  - `shared`
- Documentation and roadmap roots:
  - `docs`
  - `roadmap/refactor`

Package manifests present at baseline:

- `package.json`
- `apps/api/package.json`
- `apps/pos-terminal-web/package.json`
- `apps/web/package.json`
- `packages/application/package.json`
- `packages/core/package.json`
- `packages/domain/package.json`
- `packages/features/package.json`
- `packages/infrastructure/package.json`
- `packages/offline/package.json`
- `shared/package.json`

### Source files inspected

Application DB/infrastructure leak candidates inspected:

| File | Lines | Baseline finding |
| --- | ---: | --- |
| `packages/application/orders/RecordPayment.ts` | 154 | Application use case imports `Database` from infrastructure, imports Drizzle schema from `shared/schema`, uses Drizzle operators, opens a DB transaction, uses `SELECT ... FOR UPDATE`, inserts `orderPayments`, and updates `orders` through raw SQL. |
| `packages/application/orders/CreateAndPayOrder.ts` | 405 | Application use case imports infrastructure `Database`, shared schema tables/types, Drizzle operators, inventory helpers that also touch DB, order number sequence helper, and opens the create/pay transaction directly. |
| `packages/application/orders/orderNumberSequence.ts` | 81 | Application helper imports Drizzle `sql`/`eq`, shared `tenants`, and infrastructure `DbClient`; it performs sequence upsert SQL directly. |
| `packages/application/sync/SyncOfflineOrder.ts` | 372 | Application sync use case imports infrastructure `Database`, shared schema tables, and Drizzle operators while orchestrating offline order conflict/idempotency behavior. |
| `packages/application/catalog/CreateOrUpdateProduct.ts` | 488 | Application catalog use case imports shared schema tables/types plus infrastructure `Database`/`DbClient`, and owns product option/variant transaction orchestration. |
| `packages/application/inventory/inventoryPolicy.ts` | 91 | Application inventory policy imports infrastructure `db` singleton and shared `tenantModuleConfigs`, creating a direct default DB dependency in application code. |
| `packages/application/inventory/inventorySyncErrors.ts` | 109 | Application inventory error helper imports infrastructure `db` singleton, shared `inventorySyncErrors`, and Drizzle query helpers. |
| `packages/application/inventory/stockMovements.ts` | 223 | Application stock movement helper imports infrastructure `db` singleton, shared schema tables, Drizzle operators, and can open its own transaction when no transaction client is passed. |

Controller/route/schema/frontend risk files inspected:

| File | Lines | Baseline finding |
| --- | ---: | --- |
| `apps/api/src/http/controllers/OrdersController.ts` | 896 | Large order controller coordinates request validation, use cases, stock deduction/reversal helpers, inventory sync errors, queue events, status transitions, payment endpoints, and response mapping. |
| `apps/api/src/routes.ts` | 474 | Route bootstrap contains API route registration plus CFD WebSocket/device activation handling with raw SQL, hashing, distributed cache/pubsub, and auth/session-derived tenant lookup. |
| `apps/api/src/container.ts` | 209 | DI composition root directly wires infrastructure repositories and DB-backed application use cases; this is expected as a composition boundary but is high-impact during port migration. |
| `apps/pos-terminal-web/src/pages/pos.tsx` | 1078 | POS page is a large orchestration surface for products, cart, order queue, offline submission, payment, kitchen ticketing, CFD updates, local drafts, printing, tenant/outlet headers, and direct fetch calls. |
| `shared/schema.ts` | 736 | Single shared Drizzle schema boundary defines DB tables, Zod insert/select schemas, indexes, idempotency constraints, tenant-owned tables, and order/payment/inventory/offline-related schema. |

### Dependency leak list

These are baseline observations only. No production code was changed in P0.

1. `packages/application` currently imports infrastructure database types/singletons (`Database`, `DbClient`, `db`) in multiple use cases/helpers instead of depending only on application-level ports.
2. `packages/application` currently imports concrete Drizzle tables/types from `shared/schema` in order, sync, catalog, and inventory flows.
3. `packages/application` currently uses Drizzle operators/raw SQL directly for critical order/payment/inventory paths, including transactions, row locks, sequence upserts, and conditional stock updates.
4. `inventoryPolicy.ts`, `inventorySyncErrors.ts`, and `stockMovements.ts` expose a default infrastructure `db` fallback, which makes dependency injection optional and increases coupling to runtime infrastructure.
5. `shared/schema.ts` is both a database schema and a type/schema export source; future P1 ports/contracts must avoid accidentally moving schema concerns into domain models or breaking table/index constraints.
6. `apps/api/src/http/controllers/OrdersController.ts` and `apps/api/src/routes.ts` still contain high-impact orchestration and raw SQL surfaces that should be wrapped carefully rather than refactored in bulk.
7. `apps/pos-terminal-web/src/pages/pos.tsx` centralizes multiple frontend behaviors; future refactors should extract behavior only behind stable hooks/components with parity tests where practical.

### Risk register — behavior that must not regress

| ID | Area | Risk | Guardrail for later phases |
| --- | --- | --- | --- |
| P0-R1 | Tenant isolation | Tenant-owned order, product, inventory, table, outlet, CFD, KDS, and reporting reads/writes can leak cross-tenant data if ports omit tenant filters. | Keep tenant ID sourced from request/session/device context; every tenant-owned repository/port method must accept/enforce tenant scope. |
| P0-R2 | Payment integrity | `RecordPayment` relies on row locking, tenant-filtered order lookup, idempotency replay, remaining-balance checks, and payment status updates. | Preserve transaction + `FOR UPDATE` semantics and idempotency behavior when introducing payment/order ports. |
| P0-R3 | Create-and-pay integrity | `CreateAndPayOrder` is atomic and coordinates order creation, payment creation, stock deduction, order numbers, and idempotency. | Do not split create/pay operations across non-atomic boundaries; preserve retry replay and stock/idempotency semantics. |
| P0-R4 | Order lifecycle | Payment status and operational fulfillment/order status are intentionally separate. | Later refactors must not auto-complete/close operational orders merely because payment is paid. |
| P0-R5 | Inventory consistency | Stock movement helpers use transactions/conditional updates and record sync errors for failed deduction/reversal paths. | Preserve conditional stock guards, movement ledger writes, feature/policy checks, and retryable sync error recording. |
| P0-R6 | Offline sync | Offline order sync handles idempotency, conflict detection, inventory behavior, and mapping between local/offline and server records. | Ports must preserve local ID/idempotency matching, conflict classification, and exactly-once stock deduction expectations. |
| P0-R7 | Order numbering | Tenant/business-date order number sequence uses database-backed upsert semantics. | Preserve uniqueness and tenant/business-date scoping under concurrent order creation. |
| P0-R8 | API route compatibility | Existing order, payment, KDS, CFD, tenant, catalog, and inventory routes are client-facing contracts. | Do not rename endpoints or change request/response/error shapes without an explicit later-phase API migration and docs update. |
| P0-R9 | POS terminal UX | `pos.tsx` controls the cashier flow, offline fallback, local draft/print queues, kitchen sending, and CFD state. | Extract only in small parity-preserving steps; keep pay-later/dine-in, partial payment, kitchen ticket, offline, and printing flows valid. |
| P0-R10 | Schema/index constraints | `shared/schema.ts` includes indexes, unique constraints, idempotency keys, and tenant foreign keys. | P1 ports must not imply schema changes; DB schema changes require a separate migration phase and validation. |
| P0-R11 | Composition root | `apps/api/src/container.ts` is where concrete repositories/use cases are wired. | Treat container changes as high-impact; ports should be introduced by adapter wiring here while preserving existing use-case behavior. |
| P0-R12 | Cache/pubsub/device state | CFD/KDS/order queue behaviors depend on route/controller events and distributed cache/pubsub. | Preserve tenant-scoped channels, token/device validation, payload size/type guards, and WebSocket subscription isolation. |

### Baseline validation results

All required P0 baseline commands passed on 2026-06-08. No known failing type-checks/tests were found in this baseline run.

| Command | Result | Notes |
| --- | --- | --- |
| `pnpm type-check` | Pass | Turbo ran type-check for 10 packages: `@pos/api`, `@pos/application`, `@pos/core`, `@pos/domain`, `@pos/features`, `@pos/infrastructure`, `@pos/offline`, `@pos/shared`, `@pos/terminal-web`, and `@pos/web`. Summary: 10 successful, 10 total; time 1m45.573s. |
| `pnpm --filter @pos/api type-check` | Pass | `tsc --noEmit` completed successfully for `apps/api`. |
| `pnpm --filter @pos/terminal-web type-check` | Pass | `tsc --noEmit` completed successfully for `apps/pos-terminal-web`. |
| `pnpm --filter @pos/offline test` | Pass | Node test runner completed 2 tests, 2 pass, 0 fail; duration 1567.844525ms. |
| `pnpm --filter @pos/api test` | Pass | Node test runner completed 195 tests across 39 suites, 195 pass, 0 fail; duration 60975.756509ms. |

### Known failing tests/type-checks at P0 baseline

None observed in the required P0 validation commands.

### P0 completion notes

- No production source files were moved, renamed, or refactored in this P0 batch.
- No endpoints were renamed.
- No DB schema was changed.
- No payment, order, inventory, KDS, CFD, or offline behavior was altered.
- The next phase can introduce application ports/contracts safely, but should start with the highest-risk dependency leaks listed above and preserve the risk-register guardrails.
