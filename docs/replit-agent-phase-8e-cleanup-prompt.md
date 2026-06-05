# Replit Agent Prompt — Phase 8E Cleanup

Use this prompt in Replit Agent.

This is a small documentation/artifact cleanup only.

## Scope

Fix the remaining review items after Phase 8E Hardening.

Do not implement payment features. Do not modify embedded payment runtime, legacy order payment, POS UI, provider behavior, refund/cancel, webhook logic, SDK consumption, cron, or workers.

## Tasks

1. Update `replit.md` so the quick-start accurately says:

```text
npm run dev = starts AuraPoS API only and is used by the Replit Start application workflow
npm run dev:turbo = optional Turborepo dev workflow if needed
```

The current wording must not claim that `npm run dev` starts API + frontend through Turborepo.

2. Inspect `attached_assets/` for accidental session screenshots added during the latest payment-orchestration work. If an image is not referenced by docs, tests, or app code, remove it. Do not remove intentional application assets.

3. Create `docs/reports/payment-orchestration-phase-8e-cleanup-report.md` with:

- summary;
- files changed;
- quick-start wording fix;
- artifact cleanup status;
- commands run or not run;
- confirmation that no payment runtime behavior changed;
- confirmation that embedded payment runtime and legacy order payment were not changed.

## Checks

Run package type-checks if practical:

```bash
pnpm --filter @northflow/payment-orchestration-core type-check
pnpm --filter @northflow/payment-orchestration-service type-check
pnpm --filter @northflow/payment-orchestration-client-sdk type-check
```

If skipped because this is docs/artifact-only, say so honestly.

## Commit

Commit message:

```text
docs(payment-orchestration): clean up phase 8e quickstart artifacts
```

Final response must include commit SHA, files changed, checks run, and confirmation that no payment runtime behavior changed.
