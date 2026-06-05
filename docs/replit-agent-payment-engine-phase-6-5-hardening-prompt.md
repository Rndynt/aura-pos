# Replit Agent Prompt — Payment Engine Phase 6.5 Hardening

Use this prompt in Replit Agent.

You are working in the AuraPoS repository.

This is **Payment Engine Phase 6.5 Hardening**. Do not implement Xendit/Midtrans/Stripe sandbox adapter yet.

Read first:

- `docs/payment-engine-fakegateway-e2e-smoke.md`
- `docs/reports/payment-engine-phase-6-5-fakegateway-e2e-report.md`
- `docs/replit-agent-payment-engine-phase-6-5-fakegateway-e2e-prompt.md`

Reviewed Phase 6.5 commit:

- `a4c98b218bb3dec535588de37023d869f331ceac`

## Guardrails

Do not intentionally change legacy order payment behavior:

- `/api/orders/:id/payments`
- `/api/orders/create-and-pay`
- `packages/application/orders/RecordPayment.ts`
- `packages/application/orders/CreateAndPayOrder.ts`
- `apps/api/src/http/routes/orders.ts`
- `order_payments` legacy table behavior

Do not implement future phases:

- no Xendit adapter
- no Midtrans adapter
- no Stripe adapter
- no real provider API call
- no real provider credentials
- no real provider webhook signature implementation except FakeGateway
- no order adapter
- no POS UI changes
- no split bill
- no customer ledger
- no stock reservation
- no PPOB wallet or credit
- no standalone extraction

## Main goal

Fix the Phase 6.5 smoke-testing issues before moving to real provider sandbox work.

Required fixes:

1. Make the smoke script safety guard effective by avoiding static DB imports before guard execution.
2. Correct reconciliation request field names in docs and smoke script.
3. Correct refund expected status from `200` to `201` in docs and smoke script, unless intentionally changing controller behavior.
4. Add `.replit` runtime/dev port change to the report or revert it if unnecessary.
5. Add/update tests and report.

---

## Task 1 — Fix smoke script DB import safety

Current issue:

`apps/api/src/scripts/payment-engine/fakegateway-smoke.ts` visually checks:

- `PAYMENT_ENGINE_SMOKE_TEST === 'true'`
- `NODE_ENV !== 'production'`
- `PAYMENT_ENGINE_SERVICE_TOKEN` exists and has 32+ chars

before the DB section.

But it still uses static imports later:

```ts
import { db } from '@pos/infrastructure/database';
import { tenants } from '@shared/schema';
import { eq } from 'drizzle-orm';
```

In ESM/TypeScript, static imports are evaluated before the module body, so the DB module can load before the safety guard exits.

Required fix:

- Replace those static imports with dynamic imports after all safety guards pass.
- Example:

```ts
const { db } = await import('@pos/infrastructure/database');
const { tenants } = await import('@shared/schema');
const { eq } = await import('drizzle-orm');
```

Acceptance:

- If `PAYMENT_ENGINE_SMOKE_TEST !== 'true'`, the script exits before importing DB modules.
- If `NODE_ENV === 'production'`, the script exits before importing DB modules.
- Keep script behavior the same after guards pass.
- Add a comment explaining why dynamic import is used.

If adding a direct test for import timing is impractical, document the reason and validate by code review/report.

---

## Task 2 — Fix reconciliation request fields in docs and script

Current issue:

Phase 5 controller schemas use:

- `cutoff_minutes`
- `provider`
- `batch_size`
- `dry_run`

But docs and smoke script currently use some wrong names:

- `age_minutes`
- `providers`

Required changes:

In `docs/payment-engine-fakegateway-e2e-smoke.md` and `apps/api/src/scripts/payment-engine/fakegateway-smoke.ts`, replace:

```text
age_minutes -> cutoff_minutes
providers -> provider
```

Correct examples:

```json
{ "dry_run": true, "cutoff_minutes": 30 }
```

```text
/api/payment-engine/reconciliation/stale-transactions?cutoff_minutes=30
```

```json
{ "dry_run": true, "cutoff_minutes": 60, "provider": "fake_gateway" }
```

Acceptance:

- Docs use only controller-supported field names.
- Smoke script uses only controller-supported field names.
- No reliance on Zod stripping unknown fields.

---

## Task 3 — Fix refund expected HTTP status

Current issue:

`refundTransaction` controller returns `201` on success.

But smoke docs and script expect `200`.

Required:

- Update docs expected response for refund to `201`.
- Update smoke script assertion for refund to expect `201`.

Do not change controller behavior in this phase unless there is a deliberate reason. This phase is about correcting smoke assets.

Acceptance:

- Refund smoke script uses `assert.equal(r.status, 201, ...)`.
- Documentation says expected response is `201` for refund.
- Other endpoint expected statuses remain accurate.

---

## Task 4 — Report `.replit` change or revert it

Current issue:

Phase 6.5 diff changed `.replit` by adding/changing runtime/dev port configuration, but the report's files changed table does not mention `.replit`.

Required:

Choose one:

A. If `.replit` change is unnecessary, revert it.
B. If it is necessary for Replit runtime/dev behavior, keep it and update the report to include `.replit` under files changed / scope note.

Do not hide scope drift.

Acceptance:

- Report accurately lists `.replit` if kept.
- Or `.replit` is reverted if not needed.

---

## Task 5 — Update Phase 6.5 report

Update:

- `docs/reports/payment-engine-phase-6-5-fakegateway-e2e-report.md`

Create if desired:

- `docs/reports/payment-engine-phase-6-5-hardening-report.md`

The hardening report must include:

- summary;
- files changed;
- smoke script dynamic import fix;
- reconciliation parameter fix;
- refund status expectation fix;
- `.replit` decision;
- tests/checks run;
- known limitations;
- explicit confirmation that FakeGateway is not a Midtrans/Xendit emulator;
- explicit confirmation that no real provider adapter/API/credential was implemented;
- explicit confirmation that legacy order payment flow was not intentionally changed;
- explicit confirmation that future phases were not implemented.

---

## Task 6 — Tests and commands

Update existing tests only if needed. The main fixes are script/docs/report level.

Run available checks:

- `npm run check`
- new FakeGateway E2E tests
- provider contract tests if practical
- Phase 1-6 payment engine regression tests if practical
- TypeScript check

If a command fails, report the exact relevant error summary.

If the HTTP smoke script cannot be run because no live server is running, do not fake success. Report it as not run and explain the prerequisite.

## Commit

Commit with a clear message, for example:

`fix(payment-engine): harden fake gateway smoke assets`

Final Replit response must include summary, commit SHA, files changed, tests/checks run, known issues, and confirmation that legacy order payment flow was not intentionally changed.
