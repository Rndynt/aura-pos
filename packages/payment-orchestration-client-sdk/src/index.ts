/**
 * @northflow/payment-orchestration-client-sdk — Phase 8B Public API
 *
 * Typed HTTP client for the payment-orchestration-service standalone API.
 *
 * Features:
 * - Fetch-compatible (Node 18+ / modern browsers)
 * - Typed request/response shapes
 * - Custom header injection (service token, merchant ID, source app)
 * - Typed error classes (PaymentOrchestrationClientError, PaymentOrchestrationNetworkError)
 * - No React dependency
 * - No AuraPoS tenant/session dependency
 * - No @northflow/payment-orchestration-core dependency (self-contained)
 *
 * Usage:
 * ```ts
 * import { PaymentOrchestrationClient } from '@northflow/payment-orchestration-client-sdk';
 *
 * const client = new PaymentOrchestrationClient({
 *   baseUrl: 'http://localhost:5100',
 *   serviceToken: process.env.PAYMENT_ORCHESTRATION_SERVICE_TOKEN,
 *   merchantId: 'my-merchant-id',
 *   sourceApp: 'aurapos',
 * });
 *
 * const intent = await client.createPaymentIntent({
 *   externalPayableType: 'order',
 *   externalPayableId: 'order-123',
 *   currency: 'IDR',
 *   amountDue: 100000,
 *   sourceApp: 'aurapos',
 * });
 * ```
 */

// ── Primary exports (Phase 8D) ─────────────────────────────────────────────────

export { PaymentOrchestrationClient } from './client.ts';
export { PaymentOrchestrationClientError, PaymentOrchestrationNetworkError } from './errors.ts';
export type {
  PaymentOrchestrationClientConfig,
  CreatePaymentIntentRequest,
  PaymentIntentResponse,
  CreateGatewayPaymentRequest,
  GatewayPaymentResponse,
  PaymentIntentStatusResponse,
  RefundabilityResponse,
  ProviderActionResponse,
  CreateMerchantRequest,
  MerchantResponse,
  CreateProviderAccountRequest,
  ProviderAccountResponse,
  ConfirmFakeGatewayPaymentRequest,
  ConfirmFakeGatewayPaymentResponse,
} from './types.ts';

// ── Deprecated aliases (Phase 8B) — will be removed in a future major version ──

/** @deprecated Use PaymentOrchestrationClient instead. */
export { PaymentOrchestrationClient as PaymentEngineClient } from './client.ts';
/** @deprecated Use PaymentOrchestrationClientError instead. */
export { PaymentOrchestrationClientError as PaymentEngineClientError } from './errors.ts';
/** @deprecated Use PaymentOrchestrationNetworkError instead. */
export { PaymentOrchestrationNetworkError as PaymentEngineNetworkError } from './errors.ts';
/** @deprecated Use PaymentOrchestrationClientConfig instead. */
export type { PaymentOrchestrationClientConfig as PaymentEngineClientConfig } from './types.ts';
