# P8 S1-S3 — Import Boundary Enforcement

Status: implemented and validated
Purpose: keep the architecture clean after the refactor.

## Goal

Add automated checks so dependency boundaries do not drift after the refactor.

## S1 — Boundary categories

Domain package:

- pure business code only
- no framework dependency
- no persistence dependency

Application package:

- use cases and ports only
- no direct database dependency
- no HTTP or React dependency

Infrastructure package:

- database, repository, cache, pubsub, provider adapters
- implements application ports

API app:

- composition root and HTTP transport
- wires application use cases to infrastructure adapters

POS frontend app:

- UI and frontend feature flows
- no backend infrastructure imports

## S2 — Enforcement tooling

Chosen approach: **custom TypeScript/Node boundary validation script**.

- No dependency-cruiser added.
- No ESLint migration added.
- Script is explicit, AuraPoS-specific, easy to read and extend.

Script path: `scripts/validate-boundaries.ts`

Root package script added: `"check:boundaries": "tsx scripts/validate-boundaries.ts"`

## S3 — Contributor guidance

### Adding a new application port

1. Define the port interface in `packages/application/<domain>/ports/<PortName>Port.ts`.
2. Implement the adapter in `packages/infrastructure/repositories/<domain>/Drizzle<PortName>Repository.ts`.
3. Wire the implementation in `apps/api/src/container.ts` (composition root).
4. The use case constructor receives the port interface — never the concrete adapter.

Example:

```ts
// packages/application/orders/ports/OrderRepositoryPort.ts
export interface OrderRepositoryPort {
  findById(id: string, tx?: TransactionContext): Promise<Order | null>;
  save(order: Order, tx?: TransactionContext): Promise<void>;
}

// packages/infrastructure/repositories/orders/DrizzleOrderRepository.ts
export class DrizzleOrderRepository implements OrderRepositoryPort {
  // Drizzle-specific implementation here
}

// apps/api/src/container.ts
const orderRepo = new DrizzleOrderRepository(db);
const createOrder = new CreateOrder(orderRepo, ...);
```

### Adding a Drizzle schema table

1. Add the table definition to the relevant schema file in `packages/infrastructure/db/schema/`.
2. Do NOT add `pgTable(` calls to `shared/schema.ts` — it is a compatibility re-export only.
3. Export the new table from `packages/infrastructure/db/schema/index.ts`.
4. Run `pnpm db:push` to sync the schema.
5. Run `pnpm check:boundaries` to confirm no boundary violations.

### Wiring dependencies in the API composition root

All infrastructure adapters are instantiated in `apps/api/src/container.ts`.
Use cases receive port interfaces via constructor injection.
Never instantiate adapters inside use cases or application packages.

### Fixing a boundary violation

When `pnpm check:boundaries` reports a violation:

```
Boundary violation: Rule 2 — Application boundary
File:              packages/application/orders/SomeUseCase.ts
Import:            @pos/infrastructure/database
Reason:            packages/application must not import infrastructure...
Suggested fix:     Define an application port in packages/application/orders/ports/
```

Steps to fix:

1. Create a port interface in the application layer for the capability needed.
2. Implement the port in the infrastructure layer.
3. Inject the port via the use case constructor.
4. Wire in `apps/api/src/container.ts`.
5. Remove the direct infrastructure import from the application file.
6. Re-run `pnpm check:boundaries` to confirm resolved.

### Temporary exceptions

If a temporary exception is genuinely required, add it to the `ALLOWLIST` array
inside `scripts/validate-boundaries.ts` with:

- `file`: path relative to workspace root
- `importPattern`: the specifier or prefix to allow
- `reason`: why it is allowed temporarily
- `expiryPhase`: which phase or condition removes it

Do not add silent ignores. All exceptions must be visible and documented.

## Validation commands

```bash
pnpm check:boundaries
pnpm --filter @pos/application type-check
pnpm --filter @pos/infrastructure type-check
pnpm --filter @pos/api type-check
pnpm --filter @pos/terminal-web type-check
pnpm type-check
```

## Definition of done

- Boundary checks exist.
- Violations fail validation.
- Exceptions are documented and temporary.
- Future contributors and agents have clear architecture rules.

---

## Execution notes — P8 S1-S3

Status: implemented and validated

### Enforcement approach

Custom TypeScript/Node boundary validation script (`scripts/validate-boundaries.ts`).
No dependency-cruiser. No new ESLint migration.

### Affected files

- `scripts/validate-boundaries.ts` — new; 379 source files scanned across 8 zones
- `package.json` — added `"check:boundaries"` script
- `roadmap/refactor/p8-s1-s3-import-boundary-enforcement.md` — this file

### Completed

- [x] Added `scripts/validate-boundaries.ts`.
- [x] Added root `pnpm check:boundaries` script.
- [x] Enforced domain purity rules (Rule 1).
- [x] Enforced application no-infrastructure/no-schema/no-framework rules (Rule 2).
- [x] Enforced infrastructure no-app/no-frontend rules (Rule 3).
- [x] Enforced API no-frontend imports (Rule 4).
- [x] Enforced frontend no-infrastructure/no-server imports (Rule 5).
- [x] Verified `shared/schema.ts` remains compatibility wrapper only (Rule 6).
- [x] Enforced no package→app cross-imports (Rule 7).
- [x] Documented 3 temporary exceptions (frontend `@shared/schema` type-only, per P7).
- [x] Test files in frontend excluded from Node built-in check (run in Node.js, not browser).

### Validation results

- `pnpm check:boundaries`: **pass** — 379 files, 0 violations (3 documented temporary exceptions)
- `pnpm --filter @pos/application type-check`: **pass**
- `pnpm --filter @pos/infrastructure type-check`: **pass**
- `pnpm --filter @pos/api type-check`: **pass**
- `pnpm --filter @pos/terminal-web type-check`: **pass**
- `pnpm type-check`: **pass** — 10/10 Turbo tasks successful

### Temporary exceptions (3)

All in `apps/pos-terminal-web/src`:

| File | Import | Reason | Expiry |
|------|--------|--------|--------|
| `hooks/useOfflineTables.ts` | `@shared/schema` | P7 compatibility wrapper, Table type-only | Post-P8: define Table in @pos/domain |
| `lib/api/tableHooks.ts` | `@shared/schema` | P7 compatibility wrapper, Table type-only | Post-P8: define Table in @pos/domain |
| `pages/tables-management.tsx` | `@shared/schema` | P7 compatibility wrapper, Table type-only | Post-P8: define Table in @pos/domain |

### Behavior preservation

- Runtime behavior changed: **no**
- DB schema changed: **no**
- Migration generated: **no**
- Payment/partial payment changed: **no**
- Order workflow changed: **no**
- Inventory changed: **no**
- CFD backend changed: **no**
- POS frontend behavior changed: **no**
- `shared/schema.ts` wrapper preserved: **yes**

### Continuation

P8 is complete. Refactor roadmap can be marked complete after user approval.
