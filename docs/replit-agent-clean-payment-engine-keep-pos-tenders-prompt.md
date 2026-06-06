# Replit Agent Prompt — Cleanup Extracted Payment Engine, Keep POS Tender

Work in `https://github.com/Rndynt/AuraPoS.git`.

Northflow is now standalone at `https://github.com/Rndynt/northflow-payment-orchestration.git`, latest reviewed standalone commit `5ccc466d10389ebd6a3e50a37d57cef2f6dd11ab`.

## Goal

Remove local Northflow extraction artifacts and the embedded payment-engine/orchestration runtime from AuraPoS, while keeping normal POS cashier tender flow such as cash/manual checkout, paid amount, cash received, change due, local payment method label, receipt display, and order completion.

Final decision: `AURAPOS_NORTHFLOW_AND_EMBEDDED_PAYMENT_ENGINE_REMOVED_POS_TENDERS_KEPT` or a clear blocker.

## Must remove

- `northflow-payment-orchestration/`
- `packages/payment-orchestration-core/`
- `packages/payment-orchestration-client-sdk/`
- `apps/payment-orchestration-service/`
- `scripts/payment-orchestration-extraction-check.ts`
- embedded payment engine route/controller/use-cases/domain/infrastructure/repositories/providers
- provider orchestration runtime, webhooks, payment intent/transaction orchestration, refund/void/reconcile/reprocess runtime
- payment orchestration docs/prompts/reports/tests that no longer belong in AuraPoS
- local workspace/config references to `@northflow/payment-orchestration-*`

## Must keep

Keep basic POS tender recording if it exists:

- cash/manual checkout
- order paid/completed flow
- local `paymentMethod` or `tenderMethod`
- `amountPaid`, `cashReceived`, `changeDue`, `paidAt`
- local tender labels such as cash, bank transfer, QRIS label, debit, e-wallet, custom

If a file mixes POS tender logic with the embedded engine, refactor it: remove orchestration dependency and keep local tender behavior.

## Required work

1. Classify payment-related files into `remove_orchestration`, `keep_pos_tender`, and `refactor_mixed`.
2. Remove local Northflow/extraction workspace and package/config references.
3. Remove embedded payment-engine routes/controllers/use-cases/domain/infrastructure/repositories/providers.
4. Remove orchestration API registrations and tests.
5. Clean schema/migrations from payment-intent/provider-transaction/provider-account/provider-event orchestration tables, but keep local order/tender fields used by POS checkout.
6. Clean frontend/client references to orchestration while keeping cashier cash/manual payment UI.
7. Create `docs/reports/remove-northflow-and-embedded-payment-keep-pos-tenders-report.md`.
8. Run audit searches for Northflow/payment-engine/orchestration references.
9. Run `npm run check` and any relevant build/typecheck/test command.

## Audit rules

Active source/config/tests must not reference deleted local Northflow/payment-engine/orchestration modules. Historical mentions are allowed only in the final report or pointer doc.

Allowed local POS terms: `paymentMethod`, `paymentStatus`, `paidAt`, `amountPaid`, `cashReceived`, `changeDue`, `cash`, `tender`.

## Acceptance criteria

- Local Northflow/extracted workspace removed.
- Embedded payment-engine/orchestration runtime removed.
- Active source/config has no deleted orchestration references.
- Basic cash/manual POS tender checkout still works.
- Validation passes or blocker is documented.

Commit and push with:

`chore(payment): remove northflow and embedded payment engine from aurapos`
