# AuraPoS Refactor — P8 S1-S3 Import Boundary Enforcement Agent Prompt

Work in `Rndynt/AuraPoS`.

## Objective

Execute **P8 S1-S3 — Import Boundary Enforcement**.

P8 is the final refactor guard phase. It must add automated architecture boundary checks so the P1-P7 cleanup does not regress.

This is not a feature phase.

## Use one enforcement approach only

Use this approach:

```txt
Custom TypeScript/Node boundary validation script + pnpm validation script
```

Do not add dependency-cruiser.

Do not add a large ESLint migration.

Do not introduce new lint framework churn.

A custom script is preferred because it is explicit, easy for Replit/Codex to understand, and can encode AuraPoS-specific rules without extra dependency noise.

## Read first

```txt
roadmap/refactor/main.md
roadmap/refactor/execution-protocol.md
roadmap/refactor/p8-s1-s3-import-boundary-enforcement.md
roadmap/refactor/p7-s1-s3-schema-boundary-cleanup.md
roadmap/refactor/p6-s1-s4-frontend-pos-feature-split.md
roadmap/refactor/p5-s1-s3-realtime-cfd-module-split.md
roadmap/refactor/p4-s1-s3-thin-controllers.md
roadmap/refactor/p3-s1-s3-unit-of-work-transaction-boundary.md
roadmap/refactor/p2-s1-s4-application-db-leak-removal.md
package.json
tsconfig.base.json
packages/application/package.json
packages/infrastructure/package.json
apps/api/package.json
apps/pos-terminal-web/package.json
shared/schema.ts
```

Audit current import patterns before editing:

```bash
rg -n "from ['\"](@pos/infrastructure|@shared/schema|shared/schema|drizzle-orm|express|react|@pos/application|@pos/domain|@pos/core|@pos/features|@pos/offline)" packages apps shared
```

## Strict scope

Work only on P8.

Do not add new features.

Do not refactor application/business logic.

Do not touch payment behavior.

Do not touch partial payment behavior.

Do not touch order lifecycle behavior.

Do not touch inventory behavior.

Do not touch frontend POS feature behavior.

Do not touch backend CFD behavior.

Do not modify DB schema shape.

Do not generate migrations.

Do not remove `shared/schema.ts`; it must remain as P7 compatibility wrapper.

Do not break current package exports.

## Required files to add/update

Create a validation script:

```txt
scripts/validate-boundaries.ts
```

Add root package script:

```json
{
  "scripts": {
    "check:boundaries": "tsx scripts/validate-boundaries.ts"
  }
}
```

Do not remove existing scripts.

Optionally update `pnpm type-check` flow only if it is safe. Prefer adding `check:boundaries` as a separate explicit validation command first.

## Boundary rules to enforce

The script must scan `.ts` and `.tsx` source files in:

```txt
packages/domain
packages/application
packages/infrastructure
packages/core
packages/features
apps/api/src
apps/pos-terminal-web/src
shared
```

Ignore:

```txt
node_modules
dist
build
.next
coverage
migrations
*.d.ts
```

The script must parse static import/export-from statements and dynamic imports where easy. It does not need full TypeScript compiler AST if a robust regex parser is simpler, but it must be deterministic and fail with clear messages.

### Rule 1 — Domain purity

Files under `packages/domain/**` must not import:

```txt
apps/**
@pos/application
@pos/infrastructure
@shared/schema
shared/schema
drizzle-orm
express
react
@tanstack/react-query
```

Allowed for domain:

```txt
relative domain imports
@pos/core only if already used safely
plain TypeScript types/utilities
```

### Rule 2 — Application boundary

Files under `packages/application/**` must not import:

```txt
@pos/infrastructure
@pos/infrastructure/*
@shared/schema
shared/schema
packages/infrastructure paths
drizzle-orm
express
react
@tanstack/react-query
apps/**
```

Application may import:

```txt
@pos/domain
@pos/core
application-relative modules
application ports
```

This is the critical P2/P3 guard.

### Rule 3 — Infrastructure direction

Files under `packages/infrastructure/**` may import:

```txt
@pos/application
@pos/domain
@pos/core
drizzle-orm
@pos/infrastructure/db/schema
```

Infrastructure must not import:

```txt
apps/api
apps/pos-terminal-web
react
frontend-only files
```

### Rule 4 — API app role

Files under `apps/api/src/**` may import application, infrastructure, domain, core, features, and schema.

API must not import from frontend app:

```txt
apps/pos-terminal-web
@pos/offline frontend-only modules if any are browser-only
```

If an existing API import is ambiguous, document it and avoid broad rule breakage.

### Rule 5 — POS frontend boundary

Files under `apps/pos-terminal-web/src/**` must not import:

```txt
@pos/infrastructure
@pos/infrastructure/*
drizzle-orm
apps/api
server-only modules
Node-only modules like fs, path, crypto unless already browser-safe/polyfilled and documented
```

Frontend may import:

```txt
@pos/domain
@pos/core
@pos/offline
@shared/schema only for temporary type compatibility if currently required
```

The `@shared/schema` frontend allowance must be documented as temporary because P7 kept `shared/schema.ts` as compatibility wrapper.

### Rule 6 — Shared schema compatibility

`shared/schema.ts` must remain a wrapper after P7:

```ts
export * from "@pos/infrastructure/db/schema";
```

The boundary script should verify that `shared/schema.ts` does not reintroduce canonical table definitions such as `pgTable(`.

### Rule 7 — No direct app cross-imports

No package should import from app source paths unless explicitly allowed.

Forbidden generally:

```txt
packages/** importing apps/api/**
packages/** importing apps/pos-terminal-web/**
```

## Error output requirement

When violations are found, the script must print clear actionable output:

```txt
Boundary violation: <rule name>
File: <path>
Import: <specifier>
Reason: <why this is forbidden>
Suggested fix: <what layer/port/adapter to use instead>
```

Then exit with non-zero status.

When no violations are found, print:

```txt
Architecture boundary check passed.
```

## Temporary exceptions

Do not silently ignore violations.

If an exception is truly required, put it in an explicit allowlist inside the script with:

```txt
file path
import specifier
reason
expiry / follow-up phase
```

The default goal is zero exceptions.

## Documentation update

Update:

```txt
roadmap/refactor/p8-s1-s3-import-boundary-enforcement.md
```

Add execution notes with:

```md
## Execution notes — P8 S1-S3

Status: implemented and validated / blocked

### Enforcement approach

Custom TypeScript/Node boundary validation script.

### Completed

- [x] Added `scripts/validate-boundaries.ts`.
- [x] Added root `pnpm check:boundaries` script.
- [x] Enforced domain purity rules.
- [x] Enforced application no-infrastructure/no-schema/no-framework rules.
- [x] Enforced infrastructure no-app/no-frontend rules.
- [x] Enforced API no-frontend imports.
- [x] Enforced frontend no-infrastructure/no-server imports.
- [x] Verified `shared/schema.ts` remains compatibility wrapper only.
- [x] Documented any temporary exceptions, or confirmed zero exceptions.

### Validation

- `pnpm check:boundaries`: pass/fail
- `pnpm --filter @pos/application type-check`: pass/fail
- `pnpm --filter @pos/infrastructure type-check`: pass/fail
- `pnpm --filter @pos/api type-check`: pass/fail
- `pnpm --filter @pos/terminal-web type-check`: pass/fail
- `pnpm type-check`: pass/fail

### Behavior preservation

- Runtime behavior changed: no
- DB schema changed: no
- Migration generated: no
- Payment/partial payment changed: no
- Order workflow changed: no
- Inventory changed: no
- CFD backend changed: no
- POS frontend behavior changed: no
- `shared/schema.ts` wrapper preserved: yes/no

### Continuation

P8 is complete. Refactor roadmap can be marked complete after user approval.
```

## Validation commands

Run:

```bash
pnpm check:boundaries
pnpm --filter @pos/application type-check
pnpm --filter @pos/infrastructure type-check
pnpm --filter @pos/api type-check
pnpm --filter @pos/terminal-web type-check
pnpm type-check
```

If unrelated known DB-backed API tests are run and hit `DATABASE_URL`, document it only if relevant. P8 does not require full API DB-backed tests unless changed files make it necessary.

## Commit

Use:

```bash
git commit -m "chore(architecture): enforce import boundaries"
```

Then push.

## Final report required

Report:

```txt
P8 status:
Commit SHA:
Files changed:
Boundary script path:
Root script added:
Rules enforced:
Temporary exceptions: none / list
Commands run:
Validation result:
Runtime behavior changed: no/yes with details
DB schema changed: no/yes with details
Migration generated: no/yes
Payment/order/inventory/CFD/POS behavior preserved: yes/no
Roadmap complete: yes/no
```
