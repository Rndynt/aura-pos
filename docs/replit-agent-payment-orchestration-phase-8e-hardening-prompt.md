# Replit Agent Prompt — Payment Orchestration Phase 8E Hardening

Use this prompt in Replit Agent.

You are working in the AuraPoS repository.

This is **Payment Orchestration Phase 8E Hardening**.

Latest reviewed accepted baseline:

```text
1aabfe21f66d0068e225b29f725e7400270f9383
```

Phase 8D.1 + 8E is accepted with minor follow-up. This hardening must clean up documentation/audit gaps and add a reconciliation-safety guard for the standalone webhook/payment flow before moving toward Phase 8F.

Read first:

- `replit.md`
- `.agents/memory/MEMORY.md`
- `docs/reports/payment-orchestration-phase-8d1-8e-webhook-provider-wiring-report.md`
- `docs/reports/phase-8d-hardening-report.md`
- `docs/payment-orchestration-service-smoke-test.md`
- `docs/payment-orchestration-hybrid-standalone-architecture.md`

---

## Guardrails

Do not implement unrelated next phases:

- no AuraPoS SDK consumption yet;
- no embedded `/api/payment-engine` route deletion;
- no POS UI changes;
- no order adapter;
- no split bill/customer ledger/stock reservation/PPOB;
- no provider-level Xendit refund/cancel;
- no Midtrans/Stripe adapter;
- no scheduled cron/worker layer;
- no platform settlement/payout;
- no production credential manager.

Do not intentionally modify legacy order payment flow:

- `/api/orders/:id/payments`;
- `/api/orders/create-and-pay`;
- `packages/application/orders/RecordPayment.ts`;
- `packages/application/orders/CreateAndPayOrder.ts`;
- `apps/api/src/http/routes/orders.ts`;
- `order_payments`.

Do not intentionally modify embedded AuraPoS payment runtime:

- `apps/api/src/http/routes/payment-engine.ts`;
- `packages/application/payments/*`;
- `packages/domain/payments/*`;
- `packages/infrastructure/payments/providers/*`;
- embedded webhook/refund/void/reconciliation behavior.

Allowed:

- Standalone `apps/payment-orchestration-service` hardening.
- Standalone `@northflow/payment-orchestration-core` interfaces only if needed.
- Standalone tests/docs/reports.
- `replit.md` quick-start correction.

---

## Main goal

Close Phase 8E acceptance gaps:

1. Fix `replit.md` quick-start wording/path accuracy.
2. Add explicit Commands Run audit table to reports.
3. Add reconciliation safety for the standalone case where transaction is `succeeded` but intent totals/status are not synced.
4. Add real Express HTTP test proving webhook route bypasses service-token auth while other `/v1` routes remain protected.
5. Update smoke docs and architecture docs.

---

## Task 1 — Fix `replit.md` quick-start accuracy

Current quick-start is useful, but two lines need correction.

### 1. Legacy/embedded payment path

Current line says something like:

```text
No changes to apps/api/src/payment-engine/ (legacy) or embedded FakeGateway/Xendit in main API
```

This path is inaccurate. Replace with precise protected embedded runtime paths:

```text
No intentional changes to embedded payment runtime unless a phase explicitly says so:
- apps/api/src/http/routes/payment-engine.ts
- packages/application/payments/*
- packages/domain/payments/*
- packages/infrastructure/payments/providers/*
```

### 2. Published package wording

Current quick-start says `packages/payment-orchestration-core` is a published package. It is not published yet.

Change wording to:

```text
packages/payment-orchestration-core/ — workspace package / future standalone package containing payment domain types/interfaces
```

Also add client SDK directory if missing:

```text
packages/payment-orchestration-client-sdk/ — typed HTTP client for future app integrations
```

Keep quick-start concise.

---

## Task 2 — Add explicit Commands Run audit table

Update or create canonical reports:

```text
docs/reports/payment-orchestration-phase-8d-hardening-report.md
docs/reports/payment-orchestration-phase-8d1-8e-webhook-provider-wiring-report.md
```

If `docs/reports/phase-8d-hardening-report.md` exists, keep it only as historical or add a note pointing to the canonical file. Prefer creating/copying the canonical `payment-orchestration-phase-8d-hardening-report.md` if it does not exist.

Add a clear **Commands Run** table to the Phase 8D.1 + 8E report:

```text
| Command | Status | Notes |
|---|---:|---|
| npm run check | pass/fail/not run | ... |
| pnpm --filter @northflow/payment-orchestration-core type-check | pass/fail/not run | ... |
| pnpm --filter @northflow/payment-orchestration-service type-check | pass/fail/not run | ... |
| pnpm --filter @northflow/payment-orchestration-client-sdk type-check | pass/fail/not run | ... |
| atomic confirm test | pass/fail/not run | ... |
| standalone webhook test | pass/fail/not run | ... |
| service HTTP/auth test | pass/fail/not run | ... |
| schema mapper test | pass/fail/not run | ... |
| core contract adapter test | pass/fail/not run | ... |
| xendit gateway integration test | pass/fail/not run | no live provider call |
```

Do not fake command results. If a command cannot run, mark `not run` and explain why.

---

## Task 3 — Add standalone reconciliation safety for transaction/intent mismatch

Problem:

Phase 8D.1 atomic confirm prevents double-confirm for the same transaction, but transaction update and intent totals/status update still happen in separate steps. If the process crashes after transaction is marked `succeeded` but before intent totals/status update, the standalone DB can become inconsistent.

Required:

Add a small, isolated standalone reconciliation use case, not a scheduled cron:

```text
apps/payment-orchestration-service/src/application/use-cases/ReconcilePaymentIntentTotals.ts
```

Behavior:

- Input: `{ merchantId: string; intentId: string }`.
- Load intent.
- Load all transactions for the intent.
- Compute:
  - succeeded incoming payments/deposits/settlements total;
  - succeeded outgoing refunds total;
  - amountPaid;
  - amountRefunded;
  - amountRemaining = max(0, amountDue - amountPaid + amountRefunded) or the existing policy used in service.
- Compute status from totals using existing helper/policy.
- Update intent totals and status.
- Return before/after totals/status plus `changed: boolean`.

Important:

- No scheduled worker yet.
- No provider-level refund implementation.
- No embedded AuraPoS route changes.
- This is a manual/use-case safety tool for Phase 8E/8F.

Optional route if low-risk:

```text
POST /v1/payment-intents/:id/reconcile
```

Protected by service token. Requires `merchantId` from body/query/header using existing resolver.

If adding the route, add SDK method only if very small. Do not overbuild.

Acceptance:

- If a transaction is manually/fixture-set to `succeeded` while intent remains `requires_payment`, reconciliation fixes intent to `paid` or `partially_paid`.
- If totals are already correct, returns `changed: false`.

---

## Task 4 — Add HTTP test for webhook auth bypass route ordering

Existing webhook tests focus on use case/handler. Add real Express app test proving route ordering:

Suggested test file:

```text
apps/api/src/__tests__/payment-orchestration-webhook-route-auth-bypass.test.ts
```

Use `createApp()` with in-memory/fake container if DB is heavy.

Required coverage:

1. `POST /v1/webhooks/fake_gateway` succeeds without service token in non-production when no webhook secret configured.
2. Same app still rejects `POST /v1/payment-intents` without service token.
3. Webhook route ignores malicious `x-payment-merchant-id` and resolves merchant from providerReference.
4. Duplicate webhook event through HTTP does not double-add amountPaid.
5. Invalid FakeGateway payload through HTTP returns 400.
6. If webhook secret is configured, missing or wrong `x-fakegateway-signature` returns 401/403 according to current handler policy.

This test should call Express route, not only the use case.

---

## Task 5 — Update docs

Update:

```text
docs/payment-orchestration-hybrid-standalone-architecture.md
docs/payment-orchestration-service-smoke-test.md
```

Add/confirm:

- standalone webhook route bypasses service-token auth intentionally;
- provider verification replaces service-token auth for webhook route;
- FakeGateway unsigned webhook is dev-only convenience;
- production FakeGateway webhook requires `PAYMENT_ORCHESTRATION_FAKEGATEWAY_WEBHOOK_SECRET`;
- reconciliation use case/route exists to fix transaction/intent total drift after crash;
- no scheduled reconciliation worker yet;
- no AuraPoS SDK consumption yet.

---

## Task 6 — Add hardening report

Create:

```text
docs/reports/payment-orchestration-phase-8e-hardening-report.md
```

Report must include:

- summary;
- files changed;
- `replit.md` fixes;
- Commands Run table;
- reconciliation safety design;
- webhook route auth bypass HTTP test;
- tests added/updated;
- known limitations;
- explicit confirmation that no AuraPoS SDK consumption was implemented;
- explicit confirmation that embedded `/api/payment-engine/...` was not intentionally changed;
- explicit confirmation that legacy order payment was not intentionally changed;
- explicit confirmation that no provider-level refund/cancel was implemented;
- explicit confirmation that no scheduled cron/worker was implemented;
- explicit confirmation that no live Xendit dependency was added.

---

## Commands to run

Run:

```bash
npm run check
pnpm --filter @northflow/payment-orchestration-core type-check
pnpm --filter @northflow/payment-orchestration-service type-check
pnpm --filter @northflow/payment-orchestration-client-sdk type-check
```

Run tests:

```bash
npx tsx --tsconfig apps/api/tsconfig.node.json --test apps/api/src/__tests__/payment-orchestration-webhook-route-auth-bypass.test.ts
npx tsx --tsconfig apps/api/tsconfig.node.json --test apps/api/src/__tests__/payment-orchestration-standalone-webhook.test.ts
npx tsx --tsconfig apps/api/tsconfig.node.json --test apps/api/src/__tests__/payment-orchestration-atomic-confirm.test.ts
npx tsx --tsconfig apps/api/tsconfig.node.json --test apps/api/src/__tests__/payment-orchestration-service-http-auth.test.ts
npx tsx --tsconfig apps/api/tsconfig.node.json --test apps/api/src/__tests__/payment-orchestration-service-fakegateway-flow.test.ts
npx tsx --tsconfig apps/api/tsconfig.node.json --test apps/api/src/__tests__/payment-orchestration-schema-mappers.test.ts
npx tsx --tsconfig apps/api/tsconfig.node.json --test apps/api/src/__tests__/payment-orchestration-core-contract-adapter.test.ts
npx tsx --tsconfig apps/api/tsconfig.node.json --test apps/api/src/__tests__/payment-xendit-gateway-integration.test.ts
```

Do not run live Xendit tests unless explicitly configured. Do not fake success.

---

## Acceptance criteria

1. `replit.md` quick-start uses correct embedded payment runtime paths.
2. `replit.md` no longer calls the core package published.
3. Phase 8D.1 + 8E report has explicit Commands Run table.
4. Reconciliation use case exists and passes tests.
5. Optional reconcile route, if added, is service-token protected.
6. Real Express HTTP test proves webhook route bypasses service-token auth.
7. Real Express HTTP test proves other `/v1` routes remain service-token protected.
8. Webhook route still resolves merchant from providerReference, not request header.
9. No embedded payment runtime changed intentionally.
10. No legacy order payment changed intentionally.
11. Report and docs updated.

---

## Commit

Commit with a clear message, for example:

```text
fix(payment-orchestration): harden webhook docs and reconciliation safety
```

Final Replit response must include summary, commit SHA, files changed, tests/checks run, known issues, and confirmations that no AuraPoS SDK consumption, embedded route deletion, legacy order payment changes, provider-level refund/cancel, scheduled worker, or live Xendit dependency was implemented.
