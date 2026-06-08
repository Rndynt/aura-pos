# P1 S1-S3 — Introduce Application Ports and Contracts

Status: implemented and validated (2026-06-08)
Purpose: introduce hexagonal ports/contracts without behavior changes.

## Goal

Create clear contracts in `packages/application` so use cases can depend on interfaces instead of infrastructure, Drizzle, or shared DB schema.

This phase is additive. It should not rewrite major use cases yet.

## S1 — Shared cross-cutting ports

Create application-level shared ports:

```txt
packages/application/shared/ports/
  UnitOfWorkPort.ts
  ClockPort.ts
  IdGeneratorPort.ts
```

Expected responsibilities:

- `UnitOfWorkPort`: transaction boundary abstraction.
- `ClockPort`: deterministic time for tests and expiry logic.
- `IdGeneratorPort`: deterministic id generation for tests and domain workflows.

## S2 — Domain-specific repository ports

Create ports for high-risk domains:

```txt
packages/application/orders/ports/
  OrderRepositoryPort.ts
  OrderPaymentRepositoryPort.ts
  OrderNumberSequencePort.ts
  OrderInventoryPort.ts

packages/application/catalog/ports/
  ProductRepositoryPort.ts

packages/application/tenants/ports/
  TenantRepositoryPort.ts
  FeatureEntitlementPort.ts

packages/application/inventory/ports/
  InventoryPolicyPort.ts
  StockMovementPort.ts
  InventorySyncErrorPort.ts
```

## S3 — Adapter naming standard

Use explicit adapter names in infrastructure:

```txt
DrizzleOrderRepository
DrizzleOrderPaymentRepository
DrizzleOrderNumberSequenceRepository
DrizzleProductRepository
DrizzleTenantRepository
DrizzleInventoryPolicyRepository
DrizzleStockMovementRepository
DrizzleInventorySyncErrorRepository
DrizzleUnitOfWork
```

Do not name infrastructure implementations exactly the same as application ports.

## Rules

- Ports live in `packages/application`.
- Ports must not import Drizzle tables or infrastructure types.
- Ports may use domain types or application DTOs.
- Use `unknown` or a narrow `TransactionContext` abstraction for transaction context until `UnitOfWorkPort` is finalized.
- Do not alter runtime behavior in this phase.
- Do not migrate all use cases yet; that is P2/P3.

## Validation commands

```bash
pnpm --filter @pos/application type-check
pnpm type-check
```

## Definition of done

- Ports exist and compile.
- No runtime behavior changed.
- Existing code still builds.
- P2 can begin migrating use cases from DB imports to ports.


## Execution update — 2026-06-08

- [x] S1 shared cross-cutting ports added under `packages/application/shared/ports`.
- [x] S2 domain-specific repository ports added for orders, catalog, tenants, and inventory under `packages/application/**/ports`.
- [x] S3 infrastructure adapter naming standard introduced with Drizzle-prefixed exports/classes while preserving existing repository names for compatibility.
- Validation completed:
  - `pnpm --filter @pos/application type-check`
  - `pnpm type-check`
- Runtime behavior note: this phase remained additive; existing use cases were not migrated wholesale.
