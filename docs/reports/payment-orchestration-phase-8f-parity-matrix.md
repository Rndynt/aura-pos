# Payment Orchestration Phase 8F — Parity Matrix

**Date:** 2026-06-05
**Phase:** 8F — Standalone Readiness + Parity Closure
**Scope:** Compare embedded AuraPoS payment engine with standalone Northflow Payment Orchestration for integration readiness.
**Guardrail:** AuraPoS SDK integration was not implemented in Phase 8F.

## Parity Values

Allowed parity values: `full`, `partial`, `missing`, `intentionally excluded`, `POS-specific`, `not applicable`.

Allowed action values: `none`, `fix-now`, `defer-8G`, `defer-8H`, `defer-8I`, `exclude-from-standalone`.

## Matrix

| Capability | Embedded AuraPoS Status | Standalone Status | Parity | Action |
|---|---|---|---|---|
| merchant/tenant ownership model | Tenant-scoped (`tenantId`, tenant middleware, repository filtering). | Merchant-scoped (`merchantId`) with `sourceApp`, `externalTenantId`, and external payable references. | full | none |
| payment intent create | `CreatePaymentIntent` use case and `/api/payment-engine/intents`. | `CreatePaymentIntent` use case and `POST /v1/payment-intents`. | full | none |
| payment intent status | `GetPaymentIntentStatus` and `/intents/:id/status`. | `GetPaymentIntentStatus` and `GET /v1/payment-intents/:id/status`. | full | none |
| partial payment | `allowPartial`, amount remaining, partial/paid status computation. | `allowPartial`, amount remaining, partial/paid status computation. | full | none |
| multi-payment transaction allocation | Embedded domain includes payment allocation DTOs and order/payment settlement context. | Standalone tracks multiple transactions per intent but does not expose allocation rows. | partial | defer-8I |
| gateway payment create | `CreateGatewayPayment`; idempotent pending/requires-action gateway transaction creation. | `CreateGatewayPayment`; idempotent FakeGateway transaction creation. | full | none |
| manual payment | `RecordManualPayment` use case and `/manual-payments` route. | Not implemented as standalone endpoint/use case. | missing | defer-8I |
| FakeGateway payment create | FakeGateway provider creates fake references/actions for dev. | `StandaloneFakeGatewayProvider` creates fake references/actions for dev. | full | none |
| FakeGateway confirm | Dev/test confirm route and use case. | Dev/test confirm route and atomic use case. | full | none |
| FakeGateway webhook | Embedded webhook parse/verify/use case. | Standalone webhook route, handler, dedupe, signature verification. | full | none |
| Xendit create payment | Xendit provider path exists in embedded runtime/tests. | Not implemented in standalone provider registry. | missing | defer-8G |
| Xendit webhook | Embedded webhook parsing/verification path exists. | Not implemented in standalone webhook handler registry. | missing | defer-8G |
| provider event dedupe | Provider event repository/use cases for webhook and stale reprocess. | Provider event repository with reserve/dedupe and idempotent replay. | full | none |
| webhook signature/security | HMAC/provider verification; fake gateway disabled in production for dev-only confirm/webhook. | Webhook route bypasses service-token auth; FakeGateway HMAC required in production when configured; timing-safe compare. | full | none |
| idempotency | Intent and gateway payment idempotency keys; failed-key policy. | Gateway payment idempotency repository; failed-key policy; webhook event dedupe. | full | none |
| refundability | `GetPaymentIntentRefundability` endpoint/use case. | `GetRefundability` endpoint/use case. | full | none |
| refund transaction | `RefundPaymentTransaction` use case and route. | Refund rows/status model exists, but no refund endpoint/use case/provider action. | partial | defer-8G |
| void/cancel transaction | `VoidPaymentTransaction` use case and route. | Cancel/void statuses exist, but no void endpoint/use case/provider action. | partial | defer-8G |
| stale transaction expiration | `ExpireStalePaymentTransactions` and stale listing route. | No scheduled/list/expire stale transaction use case. | missing | defer-8H |
| reconciliation | `ReconcilePaymentIntentTotals` and stale provider event reprocess. | `ReconcilePaymentIntentTotals` route/use case; no scheduled worker. | partial | defer-8H |
| polling/status refresh | Status polling endpoint exists. | Status polling endpoint exists. | full | none |
| provider account handling | Embedded provider registry/config account handling. | Merchant provider account use cases/routes/schema. | full | none |
| service-token auth | Embedded uses AuraPoS session/role/service-token style guards. | Standalone `/v1` routes protected by `x-payment-orchestration-service-token`; webhooks bypass and verify provider signature. | full | none |
| merchantId/sourceApp/externalTenantId model | Embedded uses AuraPoS tenant/outlet/payable identifiers directly. | Standalone stores `merchantId`, `sourceApp`, `externalTenantId`, `externalOutletId`, `externalLocationId`, payable type/id. | full | none |
| SDK methods | Embedded not SDK-based. | SDK covers merchant/provider account/intent/gateway/status/refundability/dev confirm; Phase 8F added reconcile method. | full | fix-now |
| HTTP response envelopes | Embedded uses `{ success, data/error }` style. | Standalone uses `{ ok, data/error }`; SDK unwraps `data`. | partial | defer-8H |
| error normalization | Embedded has payment-domain errors mapped in route layer. | Standalone middleware normalizes domain/service errors; webhook route maps provider errors inline. | partial | defer-8H |
| tests | Embedded payment tests cover providers/routes/use cases. | Standalone flow/auth/webhook/reconcile/schema/contract tests exist; Phase 8F added SDK reconcile test. | full | fix-now |
| smoke docs | Embedded docs/reports exist. | Standalone smoke guide exists and references service flow. | full | none |
| deployment/run docs | Root/replit and standalone docs include service run/type-check commands. | Standalone has package scripts and smoke guide. | partial | defer-8H |

## Phase 8F Fix-Now Items Closed

1. **Missing SDK method for existing route:** added `PaymentOrchestrationClient.reconcilePaymentIntentTotals()` for `POST /v1/payment-intents/:id/reconcile`.
2. **Missing SDK response types:** added `ReconcilePaymentIntentTotalsRequest`, `ReconcileTotalsSnapshot`, and `ReconcilePaymentIntentTotalsResponse` exports.
3. **Missing SDK test for fixed gap:** added `payment-orchestration-client-sdk.test.ts` covering route path, method, service token header, merchant header, and merchant body injection.

## Large Gaps Deferred

| Gap | Deferred Phase | Reason |
|---|---:|---|
| Standalone Xendit create-payment runtime | 8G | Requires real provider adapter, credential handling, and provider-specific contract work. |
| Standalone Xendit webhook runtime | 8G | Requires provider signature verification and event mapping beyond FakeGateway. |
| Provider-level refund/cancel | 8G | Requires provider action contracts and careful financial integrity tests. |
| Scheduled stale expiration/reconciliation worker | 8H | Requires deployment/runtime scheduling decision and observability. |
| SDK/API freeze and deployment readiness | 8H | Requires response/error contract freeze and deployment docs. |
| AuraPoS SDK consumption/feature flag integration | 8I | Explicitly forbidden in Phase 8F. |
| Embedded engine deprecation/removal | 8J | Must happen only after feature-flag integration proves stable. |
