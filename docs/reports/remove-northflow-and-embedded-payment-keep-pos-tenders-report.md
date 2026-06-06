# Remove Northflow and Embedded Payment Engine, Keep POS Tenders Report

Date: 2026-06-06

## Decision

`AURAPOS_NORTHFLOW_AND_EMBEDDED_PAYMENT_ENGINE_REMOVED_POS_TENDERS_KEPT`

AuraPoS no longer contains the local Northflow extraction workspace, the standalone payment-orchestration service workspace, the local Northflow packages, or the embedded provider/payment-engine runtime. Basic POS tender recording remains in the order lifecycle through `order_payments`, `payment_method`, `payment_status`, order payment use cases, POS cashier UI state, and receipt display.

## Classification

### `remove_orchestration`

Removed as extraction/provider-orchestration artifacts:

- `northflow-payment-orchestration/`
- `apps/payment-orchestration-service/`
- `packages/payment-orchestration-core/`
- `packages/payment-orchestration-client-sdk/`
- `scripts/payment-orchestration-extraction-check.ts`
- `apps/api/src/http/controllers/PaymentEngineController.ts`
- `apps/api/src/http/routes/payment-engine.ts`
- `apps/api/src/scripts/payment-engine/`
- `packages/application/payments/`
- `packages/domain/payments/`
- `packages/infrastructure/payments/`
- `packages/infrastructure/repositories/payments/`
- Embedded payment-engine, payment-orchestration, provider-contract, FakeGateway, and Xendit tests under `apps/api/src/__tests__/`.
- Payment engine/orchestration migration SQL files `0019` through `0023`.
- Payment engine/orchestration docs, prompts, reports, OpenAPI artifacts, and local extraction smoke guides that no longer belong in AuraPoS.

### `keep_pos_tender`

Kept because these are normal POS cashier tender/order behaviors, not provider orchestration:

- `shared/schema.ts` order-level `paymentStatus` and `orderPayments` table fields such as `paymentMethod`, `amount`, `transactionRef`, and `paidAt`.
- `packages/application/orders/RecordPayment.ts` for tenant-scoped order payment recording.
- `packages/application/orders/CreateAndPayOrder.ts` for atomic quick-sale order creation plus local payment recording.
- `packages/infrastructure/repositories/orders/OrderPaymentRepository.ts`.
- `apps/api/src/http/controllers/OrdersController.ts` and order routes for `/api/orders/:id/payments` and create-and-pay behavior.
- POS cashier UI state and labels in `apps/pos-terminal-web/src/hooks/useCart.ts`, `PaymentMethodDialog.tsx`, `CartPanel.tsx`, receipt printer helpers, and reports/order pages.
- Offline local order tender storage in `packages/offline/src/localOrderService.ts`.

### `refactor_mixed`

Refactored mixed wiring/configuration files so they no longer reference deleted orchestration modules while preserving order/tender behavior:

- `apps/api/src/container.ts` now wires only catalog, order, sync, tenant, and related POS use cases.
- `apps/api/src/http/routes/index.ts` no longer registers `/api/payment-engine`.
- `package.json`, `tsconfig.json`, `tsconfig.base.json`, `apps/api/tsconfig.json`, and `apps/api/tsconfig.node.json` no longer reference local Northflow/payment-orchestration workspaces or aliases.
- `packages/infrastructure/package.json` no longer exports deleted provider/repository payment-engine paths.
- `shared/schema.ts` removed payment intent/transaction/allocation/provider-event and payment-orchestration tables while preserving order payment schema.
- `migrations/meta/_journal.json` no longer lists deleted payment-engine migration entries.
- `replit.md` no longer points new sessions at removed payment-orchestration workspaces or commands.

## Schema and Migration Cleanup

Removed active schema definitions and migration entries for:

- `payment_intents`
- `payment_transactions`
- `payment_allocations`
- `payment_provider_events`
- `payment_orchestration_merchants`
- `payment_orchestration_provider_accounts`
- `payment_orchestration_intents`
- `payment_orchestration_transactions`
- `payment_orchestration_provider_events`
- `payment_orchestration_idempotency_keys`

Kept local order/tender schema:

- `orders.payment_status`
- `order_payments.payment_method`
- `order_payments.amount`
- `order_payments.transaction_ref`
- `order_payments.paid_at`
- `order_payments.idempotency_key`

## Workspace and Config Cleanup

Removed local workspace/config references to deleted payment orchestration packages:

- Root TypeScript project references no longer include payment-orchestration packages or service.
- TypeScript path aliases no longer include `@northflow/payment-orchestration-core`.
- Root package scripts no longer expose `payment-orchestration:extraction-check`.
- Lockfile was regenerated with `pnpm install --lockfile-only` after workspace removal.

## Audit Results

Audit command:

```bash
rg -n "@northflow|northflow|payment-orchestration|PaymentOrchestration|payment orchestration|payment-engine|PaymentIntent|paymentIntents|payment_intents|paymentTransactions|payment_transactions|paymentProviderEvents|payment_provider_events|provider_accounts|provider_events|CreatePaymentIntent|PaymentProvider|FakeGateway|XenditProvider|RecordManualPayment|RefundPaymentTransaction|VoidPaymentTransaction|ReconcilePaymentIntent|ReprocessStaleProviderEvents" -S --glob '!node_modules/**' --glob '!.git/**' --glob '!docs/**' --glob '!PLANS.md' --glob '!pnpm-lock.yaml'
```

Result: no active source/config/test references to deleted Northflow/payment-engine/orchestration modules remained.

Broad documentation/config audit command:

```bash
rg -n "northflow|payment-orchestration|payment orchestration|payment-engine|PaymentIntent|payment_intents|paymentTransactions|PaymentProvider|FakeGateway|Xendit|RecordManualPayment" -S --glob '!node_modules/**' --glob '!.git/**' --glob '!PLANS.md' --glob '!docs/reports/remove-northflow-and-embedded-payment-keep-pos-tenders-report.md'
```

Result: no references remained outside `PLANS.md` historical execution notes and this final report.

## Validation

- `npm run check` passed: Turbo type-check succeeded for 10 of 10 packages.
- `pnpm build` passed: API, POS terminal web, and web builds succeeded; Vite emitted only existing bundle-size/PostCSS warnings.
- `pnpm test` passed: Turbo tests succeeded for API and offline packages; API reported 195 passing tests and offline reported 2 passing tests.
- `pnpm run db:check` passed: Drizzle reported `Everything's fine`.

## Notes and Follow-up

- No POS checkout UI screenshot was taken because this cleanup removed backend/runtime/docs artifacts and preserved existing POS tender UI without changing visual behavior.
- Push was requested by the source prompt, but this execution environment requires only a local commit and PR recording; no remote push was performed.
