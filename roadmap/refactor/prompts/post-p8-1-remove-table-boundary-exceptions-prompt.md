# AuraPoS Refactor — Post-P8.1 Remove Table Boundary Exceptions Prompt

Work in `Rndynt/AuraPoS`.

## Objective

Execute **Post-P8.1 — Remove temporary Table boundary exceptions**.

P8 is complete, but `pnpm check:boundaries` still passes with 3 documented temporary exceptions for frontend `@shared/schema` Table type imports. This patch must remove those exceptions by moving the Table type dependency to a pure domain type.

Target after this patch:

```txt
pnpm check:boundaries = pass
violations = 0
temporary exceptions = 0
```

## Read first

```txt
roadmap/refactor/p8-s1-s3-import-boundary-enforcement.md
scripts/validate-boundaries.ts
packages/domain/package.json
packages/domain/seating/*
apps/pos-terminal-web/src/hooks/useOfflineTables.ts
apps/pos-terminal-web/src/lib/api/tableHooks.ts
apps/pos-terminal-web/src/pages/tables-management.tsx
shared/schema.ts
packages/infrastructure/db/schema/seating.schema.ts
```

## Strict scope

Work only on this cleanup.

Do not start a new feature.

Do not change DB schema.

Do not generate migrations.

Do not edit backend API behavior.

Do not edit order/payment/partial-payment/inventory behavior.

Do not edit P5 CFD backend behavior.

Do not refactor the whole frontend POS again.

Do not weaken `scripts/validate-boundaries.ts` rules.

Do not silence violations by adding broader allowlist entries.

## Current temporary exceptions to remove

Remove these 3 allowlist entries from `scripts/validate-boundaries.ts`:

```txt
apps/pos-terminal-web/src/hooks/useOfflineTables.ts        -> @shared/schema
apps/pos-terminal-web/src/lib/api/tableHooks.ts            -> @shared/schema
apps/pos-terminal-web/src/pages/tables-management.tsx      -> @shared/schema
```

These imports are currently allowed only because they need the `Table` type. Replace that dependency with a pure domain type.

## Required implementation

Create or update a pure domain type for seating tables.

Preferred location:

```txt
packages/domain/seating/Table.ts
packages/domain/seating/index.ts
```

If `packages/domain/seating` already has a suitable type/index, extend it instead of creating duplicates.

The domain type must not import Drizzle, Zod schema, `@shared/schema`, or `@pos/infrastructure`.

Example shape:

```ts
export interface Table {
  id: string;
  tenantId: string;
  outletId: string | null;
  tableNumber: string;
  tableName: string | null;
  floor: string | null;
  capacity: number | null;
  status: string;
  currentOrderId: string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
}
```

Match the actual frontend usage. Do not add unused fields unless needed for compatibility.

Then update these files to import the type from domain instead of `@shared/schema`:

```txt
apps/pos-terminal-web/src/hooks/useOfflineTables.ts
apps/pos-terminal-web/src/lib/api/tableHooks.ts
apps/pos-terminal-web/src/pages/tables-management.tsx
```

Use type-only imports where possible:

```ts
import type { Table } from "@pos/domain/seating";
```

If the domain package export map needs an update, update `packages/domain/package.json` and the relevant `index.ts` files safely.

## Boundary script cleanup

After replacing frontend imports, remove the 3 allowlist entries from `scripts/validate-boundaries.ts`.

If the allowlist becomes empty, keep the allowlist mechanism but leave it as an empty array:

```ts
const ALLOWLIST: AllowlistEntry[] = [];
```

Do not remove the allowlist system entirely because future temporary exceptions should remain explicit and documented.

## Validation

Run:

```bash
pnpm check:boundaries
pnpm --filter @pos/domain type-check
pnpm --filter @pos/terminal-web type-check
pnpm type-check
```

Expected:

```txt
pnpm check:boundaries: pass
violations: 0
temporary exceptions: 0
all type-checks: pass
```

Also run this audit:

```bash
rg -n "@shared/schema|shared/schema" apps/pos-terminal-web/src/hooks/useOfflineTables.ts apps/pos-terminal-web/src/lib/api/tableHooks.ts apps/pos-terminal-web/src/pages/tables-management.tsx scripts/validate-boundaries.ts
```

Expected:

```txt
No frontend Table import from @shared/schema remains.
No allowlist entry for these 3 files remains.
```

## Documentation update

Update `roadmap/refactor/p8-s1-s3-import-boundary-enforcement.md` with a small Post-P8.1 note:

```md
## Post-P8.1 cleanup — Table boundary exceptions removed

Status: implemented and validated

- [x] Added pure `Table` domain type under `@pos/domain/seating`.
- [x] Replaced frontend `@shared/schema` Table imports with `@pos/domain/seating` type imports.
- [x] Removed 3 temporary allowlist entries from `scripts/validate-boundaries.ts`.
- [x] `pnpm check:boundaries` passes with 0 violations and 0 temporary exceptions.
- [x] No DB schema or runtime behavior changes.
```

## Commit

Use:

```bash
git commit -m "chore(architecture): remove table boundary exceptions"
```

Then push.

## Final report required

Report:

```txt
Post-P8.1 status:
Commit SHA:
Files changed:
Domain Table type path:
Frontend imports updated:
Temporary exceptions remaining: 0
Commands run:
Boundary check result:
Type-check result:
DB schema changed: no
Runtime behavior changed: no
```
