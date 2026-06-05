# Payment Orchestration Phase 8J — Standalone Extraction Completion Report

## Summary

Phase 8J closes the remaining standalone extraction blockers for Northflow Payment Orchestration inside AuraPoS. The service now owns its Drizzle schema locally, models transaction-level expiration, persists verified parsed webhook payloads, reprocesses supported stored provider events safely, exposes an operational no-Express worker runner, and includes an extraction simulation check.

Final decision: `READY_TO_EXTRACT_TO_STANDALONE_REPO`.

Next phase: `8K — SDK/API Contract Freeze + Deployment Readiness`.

## Files changed

- Standalone schema/config/migrations:
  - `apps/payment-orchestration-service/src/infrastructure/schema.ts`
  - `apps/payment-orchestration-service/src/infrastructure/db.ts`
  - `apps/payment-orchestration-service/drizzle.config.ts`
  - `apps/payment-orchestration-service/migrations/0001_payment_orchestration_initial.sql`
  - `migrations/0023_payment_orchestration_transaction_expires_at.sql`
  - `shared/schema.ts` (monorepo compatibility only)
- Core contracts and mappers:
  - `packages/payment-orchestration-core/src/domain/PaymentTransaction.ts`
  - `packages/payment-orchestration-core/src/domain/PaymentProviderEvent.ts`
  - `packages/payment-orchestration-core/src/application/repositories.ts`
  - `apps/payment-orchestration-service/src/infrastructure/repositories/mappers.ts`
- Use cases and repositories:
  - `apps/payment-orchestration-service/src/application/use-cases/CreateGatewayPayment.ts`
  - `apps/payment-orchestration-service/src/application/use-cases/ExpireStalePaymentTransactions.ts`
  - `apps/payment-orchestration-service/src/application/use-cases/HandleProviderWebhook.ts`
  - `apps/payment-orchestration-service/src/application/use-cases/ReprocessProviderEvents.ts`
  - `apps/payment-orchestration-service/src/infrastructure/repositories/DrizzlePaymentTransactionRepository.ts`
  - `apps/payment-orchestration-service/src/infrastructure/repositories/DrizzlePaymentProviderEventRepository.ts`
  - `apps/payment-orchestration-service/src/container.ts`
- Worker/extraction scripts:
  - `apps/payment-orchestration-service/src/workers/run.ts`
  - `scripts/payment-orchestration-extraction-check.ts`
  - `apps/payment-orchestration-service/package.json`
  - `package.json`
- Tests:
  - `apps/api/src/__tests__/payment-orchestration-expire-stale.test.ts`
  - `apps/api/src/__tests__/payment-orchestration-provider-event-reprocess.test.ts`
  - `apps/api/src/__tests__/payment-orchestration-schema-boundary.test.ts`
  - Existing payment-orchestration test fixtures updated for transaction `expiresAt`.
- Docs/plans:
  - `docs/payment-orchestration-hybrid-standalone-architecture.md`
  - `docs/payment-orchestration-service-smoke-test.md`
  - `PLANS.md`

## Schema ownership result

`apps/payment-orchestration-service/src/infrastructure/schema.ts` now declares the service-local `payment_orchestration_*` Drizzle tables directly instead of re-exporting from `shared/schema.ts`. Service repositories import table definitions through the service-local module. The root/shared schema remains only as monorepo compatibility until extraction.

Standalone migration ownership exists at `apps/payment-orchestration-service/migrations/0001_payment_orchestration_initial.sql`. Root migration `migrations/0023_payment_orchestration_transaction_expires_at.sql` is compatibility-only for current monorepo databases.

## Transaction expiry result

Transaction DTOs and create inputs now include `expiresAt: Date | null`. The transaction table includes `expires_at` with an index. Provider `expiresAt` is persisted into transaction rows, with an explicit `rawProviderResponse.expires_at` parser fallback.

`ExpireStalePaymentTransactions` expires pending/requires_action transactions by transaction `expiresAt` first, then uses intent `expiresAt` as a fallback. Terminal transactions are skipped and the operation is idempotent.

## Provider event parsedPayload/reprocess result

`ReserveProviderEventInput` accepts `parsedPayload`; `HandleProviderWebhook` stores the parsed payload only after provider parsing/verification succeeds. `DrizzlePaymentProviderEventRepository.reserveEvent()` persists it.

`ReprocessProviderEvents` now supports safe replay for stored `fake_gateway` and `xendit_sandbox` parsed payloads. It does not reverify signatures during reprocess, skips already processed events, skips missing payload/dependency cases, and uses the same atomic transaction/intent mutation guards as webhook processing for succeeded events.

## Worker runner result

`apps/payment-orchestration-service/src/workers/run.ts` supports:

- `expire-stale`
- `reconcile-intent`
- `reprocess-provider-events`
- `all-safe`

It runs without Express, emits JSON, returns non-zero exit codes on errors, and does not require provider network calls for safe operations.

## Extraction simulation check result

`scripts/payment-orchestration-extraction-check.ts` verifies forbidden embedded runtime imports, service-local schema usage, standalone migrations, worker runner, ready endpoint, package files, and absence of random build/log/assets in extraction roots. It passes in this batch.

## Commands run

| Command | Result | Notes |
| --- | --- | --- |
| `pnpm --filter @northflow/payment-orchestration-core type-check` | Pass | Core contracts type-check. |
| `pnpm --filter @northflow/payment-orchestration-service type-check` | Pass | Standalone service type-check. |
| `pnpm --filter @northflow/payment-orchestration-client-sdk type-check` | Pass | SDK type-check. |
| `npm run check` | Pass | Turbo type-check across workspace. |
| `npx tsx --tsconfig apps/api/tsconfig.node.json --test apps/api/src/__tests__/payment-orchestration-expire-stale.test.ts apps/api/src/__tests__/payment-orchestration-provider-event-reprocess.test.ts apps/api/src/__tests__/payment-orchestration-schema-boundary.test.ts` | Pass | Focused Phase 8J tests. |
| `npx tsx --tsconfig apps/api/tsconfig.node.json --test apps/api/src/__tests__/payment-orchestration-*.test.ts` | Pass | All payment-orchestration tests. |
| `pnpm payment-orchestration:extraction-check` | Pass | Extraction simulation. |

## Known limitations

- Root `shared/schema.ts` still contains compatibility payment-orchestration definitions while this repository remains a monorepo; standalone ownership is the service schema and migration set.
- Reprocess supports only `fake_gateway` and `xendit_sandbox` stored parsed payloads.
- No cron scheduler is included; worker execution is intentionally command/operations driven.
- No SDK/API contract freeze was performed in this phase.

## Guardrail confirmations

- No AuraPoS SDK integration was implemented.
- No embedded `/api/payment-engine` route deletion was implemented.
- No legacy order payment migration was implemented.
- No POS UI changes were implemented.
- No order adapter migration was implemented.
- No Midtrans/Stripe provider was implemented.
- No platform settlement/payout or production secret manager was implemented.
- No embedded payment runtime was intentionally changed.
- No legacy order flow was intentionally changed.
