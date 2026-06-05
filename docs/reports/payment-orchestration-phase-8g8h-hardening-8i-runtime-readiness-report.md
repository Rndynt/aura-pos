# Payment Orchestration Phase 8G/8H Hardening + 8I Runtime Readiness Report

## Summary

Phase 8I moves the standalone payment orchestration service closer to extraction simulation by adding explicit runtime provider policy, a service-local schema boundary bridge, operations use cases/workers, a non-secret readiness endpoint, error-code normalization, and focused tests.

This phase does **not** implement AuraPoS SDK consumption, does **not** remove the embedded `/api/payment-engine` runtime, and does **not** migrate legacy `order_payments` flows.

## Files changed

- `packages/payment-orchestration-core/src/domain/PaymentIntent.ts`
- `packages/payment-orchestration-core/src/application/repositories.ts`
- `apps/payment-orchestration-service/src/application/errors.ts`
- `apps/payment-orchestration-service/src/application/use-cases/ExpireStalePaymentTransactions.ts`
- `apps/payment-orchestration-service/src/application/use-cases/ReprocessProviderEvents.ts`
- `apps/payment-orchestration-service/src/config/env.ts`
- `apps/payment-orchestration-service/src/container.ts`
- `apps/payment-orchestration-service/src/infrastructure/providers/providerRegistry.ts`
- `apps/payment-orchestration-service/src/infrastructure/providers/xenditHttpClient.ts`
- `apps/payment-orchestration-service/src/infrastructure/repositories/*`
- `apps/payment-orchestration-service/src/infrastructure/schema.ts`
- `apps/payment-orchestration-service/src/middleware/errors.ts`
- `apps/payment-orchestration-service/src/routes/health.ts`
- `apps/payment-orchestration-service/src/workers/reconcile.ts`
- `apps/payment-orchestration-service/src/workers/expireStale.ts`
- New focused tests under `apps/api/src/__tests__/payment-orchestration-*.test.ts`
- `docs/payment-orchestration-hybrid-standalone-architecture.md`
- `docs/payment-orchestration-service-smoke-test.md`
- `PLANS.md`

## Stale comment/docs cleanup

Updated misleading standalone DTO/provider-registry wording so the roadmap is standalone-first:

```text
Standalone extraction first. Source applications integrate only after service/package boundary, provider runtime, operations, and extraction simulation are stable.
```

No public API names were changed for comment cleanup.

## Xendit runtime config policy

Added `apps/payment-orchestration-service/src/infrastructure/providers/xenditHttpClient.ts`.

Policy:

- Xendit sandbox HTTP is disabled unless `PAYMENT_ORCHESTRATION_XENDIT_SANDBOX_ENABLED=true`.
- Enabled runtime uses native `fetch`.
- Disabled runtime returns stable `PROVIDER_HTTP_CLIENT_UNCONFIGURED` before network access.
- `PAYMENT_ORCHESTRATION_XENDIT_BASE_URL` defaults to `https://api.xendit.co`.
- `PAYMENT_ORCHESTRATION_XENDIT_CALLBACK_TOKEN` is read only for verification/configured status and never exposed by readiness output.
- `credentialsRef` remains an opaque environment-variable name; raw provider secrets are not persisted or returned.

## Schema boundary module status

Status: **re-export bridge**, not full schema relocation.

Added:

```text
apps/payment-orchestration-service/src/infrastructure/schema.ts
```

Standalone repositories now import payment orchestration tables through the service-local schema boundary. Full relocation of `payment_orchestration_*` definitions and migrations remains deferred to extraction simulation.

## Expire stale status

Implemented:

```text
apps/payment-orchestration-service/src/application/use-cases/ExpireStalePaymentTransactions.ts
```

Behavior:

- Finds expired active intents via `expiresAt`.
- Marks pending/requires_action transactions as `expired`.
- Skips terminal or non-expirable transactions.
- Updates owning intent status to `expired`.
- Uses merchant-scoped repository updates.
- Callable manually/future worker; no scheduler added.

## Worker/runner status

Implemented callable worker entry points without starting Express:

```text
apps/payment-orchestration-service/src/workers/reconcile.ts
apps/payment-orchestration-service/src/workers/expireStale.ts
```

No cron scheduler was added. Future scheduling can use platform cron/queue/process supervisor after extraction simulation.

## Provider event reprocess status

Implemented:

```text
apps/payment-orchestration-service/src/application/use-cases/ReprocessProviderEvents.ts
```

Current behavior is intentionally safe:

- Finds stale pending/failed provider events through the existing provider-event repository path.
- Does not double-apply already processed events.
- Skips events without replayable parsed payload.
- Skips parsed payload events until provider-specific replay adapters are designed.
- Produces summary counts and per-event reasons.

Known limitation: raw signed provider body/signature context cannot be safely reconstructed from all stored event rows, so this phase implements safe skipped behavior rather than unsafe replay.

## Error normalization/logging status

Added:

```text
apps/payment-orchestration-service/src/application/errors.ts
```

The global error middleware now normalizes stable public error codes including:

- `PROVIDER_HTTP_CLIENT_UNCONFIGURED`
- `PROVIDER_CREDENTIALS_UNAVAILABLE`
- `PROVIDER_ACCOUNT_REQUIRED`
- `WEBHOOK_SIGNATURE_INVALID`
- `WEBHOOK_BODY_INVALID`
- `OVERPAYMENT_REJECTED`
- `IDEMPOTENCY_CONFLICT`

Existing console logging for 5xx errors remains minimal and does not log response secrets.

## Readiness endpoint status

Implemented:

```text
GET /ready
```

The endpoint reports non-secret readiness info:

- service name
- provider registration/configured booleans
- database configured/unconfigured status
- Xendit sandbox enabled/callback-token-configured booleans

It does not expose service tokens, DB URLs, provider secret values, callback token values, or raw env values.

## Tests added/updated

Added:

- `apps/api/src/__tests__/payment-orchestration-schema-boundary.test.ts`
- `apps/api/src/__tests__/payment-orchestration-xendit-runtime-config.test.ts`
- `apps/api/src/__tests__/payment-orchestration-expire-stale.test.ts`
- `apps/api/src/__tests__/payment-orchestration-workers.test.ts`
- `apps/api/src/__tests__/payment-orchestration-provider-event-reprocess.test.ts`
- `apps/api/src/__tests__/payment-orchestration-ready-endpoint.test.ts`

Updated:

- `apps/api/src/__tests__/payment-orchestration-provider-status-refresh.test.ts` for expanded repository contracts.

## Commands Run

| Command | Status | Notes |
|---|---:|---|
| `pnpm --filter @northflow/payment-orchestration-service type-check` | ✅ pass | Service type-check passed after implementation. |
| `pnpm --filter @northflow/payment-orchestration-core type-check` | ✅ pass | Core contract type-check passed. |
| `pnpm --filter @northflow/payment-orchestration-client-sdk type-check` | ✅ pass | SDK type-check passed. |
| New focused tests listed above | ✅ pass | No live Xendit network calls. |
| Required existing payment-orchestration regression tests | ✅ pass | FakeGateway flow, standalone webhook, provider status refresh, Xendit provider/webhook, boundary purity passed. |
| `npm run check` | ✅ pass | Turbo type-check passed across all 13 workspace packages. |

## Known limitations

- Schema ownership is still a bridge from `shared/schema.ts`; full relocation is deferred.
- Provider-event reprocess safely skips rather than replaying provider mutations without a provider-specific adapter.
- No cron scheduler is installed.
- Xendit sandbox HTTP requires explicit env enablement and credentialsRef env resolution.
- No real provider refund/cancel money movement was added.
- No extraction simulation was run in a clean external workspace.

## Final decision

```text
STANDALONE_RUNTIME_READY_FOR_EXTRACTION_SIMULATION
```

Reason: provider runtime policy is explicit and tested without live network, schema access is isolated behind a service-local bridge, operations use cases/workers exist, readiness is non-secret, and focused/regression validation passed. Full schema relocation remains a known extraction-simulation task but no longer blocks starting a controlled extraction simulation because the direct repository dependency has been narrowed to one service-local bridge.

## Next recommended phase

```text
8J — SDK/API Contract Freeze + Deployment Readiness
```

Recommended work:

1. Freeze public REST/SDK response and error-code contracts.
2. Add deployment-ready operational docs for worker scheduling.
3. Decide provider-event replay adapter requirements.
4. Prepare extraction simulation checklist for schema/migration relocation.
5. Keep AuraPoS integration deferred until extraction simulation is stable.

## Guardrail confirmations

- No AuraPoS SDK integration was implemented.
- No embedded `/api/payment-engine` runtime was intentionally changed.
- No legacy order payment flow or `order_payments` migration was intentionally changed.
- No POS UI changes were made.
- No raw secrets were added to code, docs, tests, or DB rows.
