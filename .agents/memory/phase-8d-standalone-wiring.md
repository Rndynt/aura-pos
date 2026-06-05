---
name: Phase 8D standalone wiring
description: Key quirks when wiring real Drizzle repos + use cases in payment-orchestration-service
---

## Drizzle jsonb column typing

Drizzle ORM infers jsonb columns as `unknown`, not `Record<string, unknown>`.
Mapper functions (in `mappers.ts`) expect `*Row` types with `metadata: Record<string, unknown> | null`.

**Fix**: cast at the mapper call site: `mapMerchantRow(row as any)`.
For `.map()` calls: `rows.map((r) => mapFoo(r as any))`.

Do NOT try to type the `.select()` result explicitly — it's complex and Drizzle doesn't export the raw select type cleanly.

**Why**: This is a known Drizzle limitation for jsonb columns. `as any` is acceptable here because we control the schema and the mapper already handles the cast internally.

## Test import paths

Test file location: `apps/api/src/__tests__/payment-orchestration-service-fakegateway-flow.test.ts`
Service location: `apps/payment-orchestration-service/src/...`

Correct relative path: `'../../../payment-orchestration-service/src/...'` (3 levels: `__tests__` → `src` → `api` → `apps`)

Wrong (causes `ERR_MODULE_NOT_FOUND`): `'../../payment-orchestration-service/src/...'`

## Container structure

`ServiceContainer` in `container.ts` exposes:
- `config: PaymentOrchestrationServiceConfig`
- `db: PoDb`
- `repos: ServiceRepos` (6 repo instances)
- `providerRegistry: ProviderRegistry` (Map<string, StandalonePaymentProvider>)
- `useCases: ServiceUseCases` (7 use-case instances)

All route factories accept `container: ServiceContainer` as first arg.

## computeIntentStatus rule

```
amountPaid = 0              → requires_payment
0 < amountPaid < amountDue  → partially_paid
amountPaid >= amountDue     → paid
amountPaid > amountDue      → overpaid (prevented by OVERPAYMENT_REJECTED gate in CreateGatewayPayment)
```

## FakeGateway confirm idempotency

`ConfirmFakeGatewayPayment.execute()` returns `alreadyConfirmed: true` if `tx.status === 'succeeded'` — does NOT double-add to `amountPaid`. Blocked entirely in production (`FORBIDDEN_IN_PRODUCTION`).
