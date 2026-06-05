# Replit Agent Prompt — Payment Orchestration Phase 8L.1: In-Repo Standalone Folder Cleanup Before AuraPoS Payment Cleanup

Use this prompt in Replit Agent.

## Repository

Work inside the AuraPoS repository.

- Source repo: `https://github.com/Rndynt/AuraPoS.git`
- Current AuraPoS baseline that contains the extracted folder: `96d77ad7f412ff220be90995183d223cc32449c9`

Important folder to fix:

- `northflow-payment-orchestration/`

This folder is the extracted standalone payment orchestration workspace inside AuraPoS. It will be used as the source for pushing/updating the real standalone repo later:

- `https://github.com/Rndynt/northflow-payment-orchestration.git`

## Goal

Clean up the in-repo standalone folder `northflow-payment-orchestration/` so it contains the latest complete payment orchestration work and is safe to push to the standalone payment repository.

Do not clean or delete AuraPoS payment files yet.

Do not integrate AuraPoS with the standalone service.

Final decision must be one of:

- `IN_REPO_STANDALONE_FOLDER_READY_TO_PUSH_TO_PAYMENT_REPO`
- `NOT_READY_MISSING_EXTRACTION_REPORT`
- `NOT_READY_PACKAGE_SCRIPT_BLOCKER`
- `NOT_READY_ENV_DOCS_BLOCKER`
- `NOT_READY_TEST_FAILURES`

## Guardrails

Do not implement app integration.

Do not delete anything from AuraPoS yet.

Do not remove these AuraPoS source/fallback areas in this phase:

- `apps/payment-orchestration-service/`
- `packages/payment-orchestration-core/`
- `packages/payment-orchestration-client-sdk/`
- `apps/api/src/http/routes/payment-engine.ts`
- `packages/application/payments/*`
- `packages/domain/payments/*`
- `packages/infrastructure/payments/providers/*`
- `packages/application/orders/*`
- `apps/api/src/http/routes/orders.ts`
- `shared/schema.ts`

Do not add provider features.

Do not add POS UI, order adapter, settlement, or production secret manager.

Work only inside:

- `northflow-payment-orchestration/`

except for adding/updating a report pointer in AuraPoS docs if absolutely needed.

## Task 1 — Verify the extracted folder contains the latest payment orchestration work

Compare the in-repo extracted folder against the current AuraPoS payment orchestration source areas.

Source areas in AuraPoS:

- `packages/payment-orchestration-core/`
- `packages/payment-orchestration-client-sdk/`
- `apps/payment-orchestration-service/`
- `apps/payment-orchestration-service/migrations/`
- `docs/openapi/payment-orchestration.openapi.json`
- `docs/payment-orchestration-api-contract.md`
- `docs/payment-orchestration-sdk-contract.md`
- `docs/payment-orchestration-error-codes.md`
- `docs/payment-orchestration-deployment.md`
- `docs/payment-orchestration-worker-operations.md`
- `docs/payment-orchestration-service-smoke-test.md`
- `scripts/payment-orchestration-extraction-check.ts`
- relevant `apps/api/src/__tests__/payment-orchestration-*.test.ts`

Target folder areas:

- `northflow-payment-orchestration/packages/core/`
- `northflow-payment-orchestration/packages/client-sdk/`
- `northflow-payment-orchestration/apps/service/`
- `northflow-payment-orchestration/migrations/`
- `northflow-payment-orchestration/docs/`
- `northflow-payment-orchestration/scripts/`
- `northflow-payment-orchestration/tests/`

If any latest payment-orchestration source file from AuraPoS is missing from the folder, copy/adapt it into `northflow-payment-orchestration/`.

Keep standalone path conventions:

- `packages/payment-orchestration-core` becomes `packages/core`
- `packages/payment-orchestration-client-sdk` becomes `packages/client-sdk`
- `apps/payment-orchestration-service` becomes `apps/service`
- `apps/api/src/__tests__/payment-orchestration-*.test.ts` becomes `tests/*.test.ts`

Do not bring AuraPoS-only adapters/tests that import embedded payment engine or `@pos/*`.

## Task 2 — Add or move Phase 8L extraction report into the standalone folder

Create inside the extracted folder:

- `northflow-payment-orchestration/docs/reports/phase-8l-standalone-repo-extraction-report.md`

If a report already exists at AuraPoS root docs, copy/adapt it into the folder.

The report must include:

- summary
- source repo and source commit
- extracted folder path
- intended standalone target repo
- extracted layout
- files copied/adapted
- package/config changes
- import/path cleanup result
- tests/checks run
- extraction-check result
- known limitations
- final decision
- next step: push this folder to the standalone payment repo, then run AuraPoS cleanup

The report must explicitly state one final decision:

- `IN_REPO_STANDALONE_FOLDER_READY_TO_PUSH_TO_PAYMENT_REPO`

or a blocker state.

## Task 3 — Fix root scripts inside the extracted folder

Update:

- `northflow-payment-orchestration/package.json`

Ensure scripts include:

- `check`
- `build`
- `dev:service`
- `start:service`
- `dev`
- `type-check`
- `test`
- `db:migrate`
- `db:generate`
- `worker`
- `extraction-check`

Suggested script values:

- `check`: `pnpm type-check`
- `build`: `turbo run build`
- `dev:service`: `pnpm --filter @northflow/payment-orchestration-service dev`
- `start:service`: `pnpm --filter @northflow/payment-orchestration-service start`

Update README/deployment docs if command names differ.

## Task 4 — Add service start/build scripts

Update:

- `northflow-payment-orchestration/apps/service/package.json`

Ensure scripts include:

- `start`
- `build`

Suggested:

- `start`: `NODE_ENV=production tsx --tsconfig tsconfig.json src/index.ts`
- `build`: `tsc -p tsconfig.json --noEmit`

If runtime uses `tsx` and does not emit compiled JS, document that clearly.

## Task 5 — Clean env placeholders inside the extracted folder

Update env examples inside:

- `northflow-payment-orchestration/.env.example`
- `northflow-payment-orchestration/apps/service/.env.example`

Replace any placeholder that looks like a real key:

- from: `xnd_development_replace_with_real_key`
- to: `replace-with-xendit-sandbox-secret-key`

No `.env` file should be committed.

No real secret should appear anywhere.

## Task 6 — Clean README and docs wording inside the extracted folder

Update:

- `northflow-payment-orchestration/README.md`
- relevant docs inside `northflow-payment-orchestration/docs/`

The README should open as a standalone product, not as an AuraPoS child.

Preferred opening description:

- `Northflow Payment Orchestration is a standalone payment orchestration service for merchant payment intents, provider accounts, webhook processing, reconciliation, worker operations, and typed SDK/API integration.`

Allowed:

- mention AuraPoS extraction only in a short history/migration note, not in the opening product description.

## Task 7 — Fix Docker docs inside the extracted folder

Current Dockerfile is at:

- `northflow-payment-orchestration/apps/service/Dockerfile`

Because Dockerfile copies root workspace files, document build from the extracted folder root using:

- `docker build -f apps/service/Dockerfile -t northflow-payment-orchestration .`

Fix any README or deployment docs that still say:

- `docker build -t northflow-payment-orchestration .`

## Task 8 — Strengthen extraction check inside the extracted folder

Update:

- `northflow-payment-orchestration/scripts/extraction-check.ts`

It must verify:

- `docs/reports/phase-8l-standalone-repo-extraction-report.md` exists
- root `package.json` has `check`, `build`, `dev:service`, `start:service`
- service `package.json` has `start` and `build`
- env examples do not contain `xnd_development_replace_with_real_key`
- README does not open with AuraPoS-child wording
- Docker docs reference `-f apps/service/Dockerfile`
- no forbidden AuraPoS imports
- no `shared/schema` references
- required packages exist
- required service files exist
- migrations exist
- OpenAPI docs exist
- no random assets/logs/build outputs

## Task 9 — Validation

Run from inside the extracted folder:

- `cd northflow-payment-orchestration`
- `pnpm install`
- `pnpm check`
- `pnpm build`
- `pnpm test`
- `pnpm extraction-check`
- `pnpm --filter @northflow/payment-orchestration-core type-check`
- `pnpm --filter @northflow/payment-orchestration-client-sdk type-check`
- `pnpm --filter @northflow/payment-orchestration-service type-check`

Do not fake results.

If any command fails, fix it or set final decision to a blocker state.

## Acceptance criteria

Accepted only if:

1. `northflow-payment-orchestration/` contains the latest complete payment orchestration work from AuraPoS.
2. Phase 8L extraction report exists inside `northflow-payment-orchestration/docs/reports/`.
3. Root scripts include `check`, `build`, `dev:service`, `start:service`.
4. Service package includes `start` and `build`.
5. Env examples contain no real-looking Xendit placeholder.
6. README opens as standalone product, not as AuraPoS child.
7. Docker docs use correct `-f apps/service/Dockerfile` build command.
8. Extraction check validates these cleanup requirements.
9. Type-check, tests, and extraction-check pass or final decision is blocker.
10. No AuraPoS cleanup/deletion is performed in this phase.
11. No app integration is implemented.

## Commit and push

Commit changes in AuraPoS with:

- `chore(payment-orchestration): finalize in-repo standalone folder cleanup`

After that, you may push the contents of `northflow-payment-orchestration/` to:

- `https://github.com/Rndynt/northflow-payment-orchestration.git`

using a separate commit in the standalone repo:

- `chore: sync standalone extraction cleanup from AuraPoS folder`

Do not delete AuraPoS source/fallback payment orchestration files yet.

## Final response required

Final Replit response must include:

- AuraPoS commit SHA
- standalone payment repo commit SHA if pushed
- files changed inside `northflow-payment-orchestration/`
- scripts added/fixed
- validation commands and results
- extraction-check result
- final decision
- confirmation that AuraPoS payment source/fallback files were not deleted yet
- confirmation that no app integration was implemented
