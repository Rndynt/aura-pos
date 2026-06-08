# P8 S1-S3 — Import Boundary Enforcement

Status: planned
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

Choose one approach:

- ESLint import restrictions
- dependency-cruiser
- custom boundary validation script

The check must run through normal validation or CI.

## S3 — Contributor guidance

Add examples for:

- adding a new application port
- adding a Drizzle adapter
- wiring dependencies in the API composition root
- fixing a boundary violation

## Validation commands

```bash
pnpm lint
pnpm type-check
pnpm --filter @pos/api type-check
pnpm --filter @pos/application type-check
pnpm --filter @pos/infrastructure type-check
pnpm --filter @pos/terminal-web type-check
```

## Definition of done

- Boundary checks exist.
- Violations fail validation.
- Exceptions are documented and temporary.
- Future contributors and agents have clear architecture rules.
