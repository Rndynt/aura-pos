/**
 * client — typed HTTP client for payment-orchestration-service.
 *
 * Targets `/v1/...` paths for the standalone payment-orchestration-service.
 * Supports custom headers: x-payment-orchestration-service-token, x-payment-merchant-id, x-source-app.
 *
 * Fetch-compatible; uses the global `fetch` API (Node 18+ / modern browsers).
 * No React dependency. No AuraPoS tenant dependency.
 *
 * Phase 8A: methods implemented as real HTTP wrappers.
 * Phase 8B: class renamed to PaymentOrchestrationClient. PaymentEngineClient is a deprecated alias.
 * The service returns 501 for most routes in Phase 8A/8B — this is expected.
 */

import { PaymentOrchestrationClientError, PaymentOrchestrationNetworkError } from './errors.ts';
import type {
  PaymentOrchestrationClientConfig,
  CreatePaymentIntentRequest,
  PaymentIntentResponse,
  CreateGatewayPaymentRequest,
  GatewayPaymentResponse,
  PaymentIntentStatusResponse,
  RefundabilityResponse,
  CreateMerchantRequest,
  MerchantResponse,
  CreateProviderAccountRequest,
  ProviderAccountResponse,
  ConfirmFakeGatewayPaymentRequest,
  ConfirmFakeGatewayPaymentResponse,
} from './types.ts';

export class PaymentOrchestrationClient {
  private readonly baseUrl: string;
  private readonly defaultHeaders: Record<string, string>;

  constructor(config: PaymentOrchestrationClientConfig) {
    this.baseUrl = config.baseUrl.replace(/\/$/, '');
    this.defaultHeaders = {
      'Content-Type': 'application/json',
    };
    if (config.serviceToken) {
      this.defaultHeaders['x-payment-orchestration-service-token'] = config.serviceToken;
    }
    if (config.merchantId) {
      this.defaultHeaders['x-payment-merchant-id'] = config.merchantId;
    }
    if (config.sourceApp) {
      this.defaultHeaders['x-source-app'] = config.sourceApp;
    }
  }

  // ── Internal helpers ────────────────────────────────────────────────────────

  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
    extraHeaders?: Record<string, string>,
  ): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const headers: Record<string, string> = { ...this.defaultHeaders, ...extraHeaders };

    let response: Response;
    try {
      response = await fetch(url, {
        method,
        headers,
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });
    } catch (err: unknown) {
      throw new PaymentOrchestrationNetworkError(
        `Network error calling payment-orchestration-service: ${String(err)}`,
        err,
      );
    }

    const data = await response.json().catch(() => null);

    if (!response.ok) {
      const code =
        data != null && typeof data === 'object' && 'code' in data
          ? String((data as Record<string, unknown>)['code'])
          : undefined;
      const message =
        data != null && typeof data === 'object' && 'message' in data
          ? String((data as Record<string, unknown>)['message'])
          : `HTTP ${response.status} from payment-orchestration-service`;

      throw new PaymentOrchestrationClientError(message, response.status, code, data);
    }

    // Unwrap { ok, data } envelope if present; otherwise return data as-is.
    if (data != null && typeof data === 'object' && 'data' in data) {
      return (data as Record<string, unknown>)['data'] as T;
    }
    return data as T;
  }

  // ── Public methods ──────────────────────────────────────────────────────────

  /**
   * createPaymentIntent — create a new payment intent.
   *
   * POST /v1/payment-intents
   *
   * Phase 8A/8B: service returns 501. Call will throw PaymentOrchestrationClientError with status=501.
   * Phase 8D: fully implemented.
   */
  async createPaymentIntent(
    input: CreatePaymentIntentRequest,
  ): Promise<PaymentIntentResponse> {
    return this.request<PaymentIntentResponse>('POST', '/v1/payment-intents', input);
  }

  /**
   * createGatewayPayment — create a gateway payment for an existing intent.
   *
   * POST /v1/payment-intents/:intentId/gateway-payments
   *
   * Phase 8A/8B: service returns 501.
   */
  async createGatewayPayment(
    intentId: string,
    input: CreateGatewayPaymentRequest,
  ): Promise<GatewayPaymentResponse> {
    return this.request<GatewayPaymentResponse>(
      'POST',
      `/v1/payment-intents/${intentId}/gateway-payments`,
      input,
    );
  }

  /**
   * getPaymentIntentStatus — poll the status of a payment intent.
   *
   * GET /v1/payment-intents/:intentId/status
   *
   * Phase 8A/8B: service returns 501.
   */
  async getPaymentIntentStatus(intentId: string): Promise<PaymentIntentStatusResponse> {
    return this.request<PaymentIntentStatusResponse>(
      'GET',
      `/v1/payment-intents/${intentId}/status`,
    );
  }

  /**
   * getRefundability — check whether a payment intent can be refunded.
   *
   * GET /v1/payment-intents/:intentId/refundability
   *
   * Phase 8D: fully implemented.
   */
  async getRefundability(intentId: string): Promise<RefundabilityResponse> {
    return this.request<RefundabilityResponse>(
      'GET',
      `/v1/payment-intents/${intentId}/refundability`,
    );
  }

  // ── Phase 8D: merchant + provider account methods ────────────────────────────

  /**
   * createMerchant — create or return an existing merchant.
   *
   * POST /v1/merchants
   * Phase 8D.
   */
  async createMerchant(input: CreateMerchantRequest): Promise<MerchantResponse> {
    return this.request<MerchantResponse>('POST', '/v1/merchants', input);
  }

  /**
   * getMerchant — retrieve a merchant by ID.
   *
   * GET /v1/merchants/:id
   * Phase 8D.
   */
  async getMerchant(id: string): Promise<MerchantResponse> {
    return this.request<MerchantResponse>('GET', `/v1/merchants/${id}`);
  }

  /**
   * createProviderAccount — create a provider account for a merchant.
   *
   * POST /v1/merchants/:merchantId/provider-accounts
   * Phase 8D.
   */
  async createProviderAccount(
    merchantId: string,
    input: CreateProviderAccountRequest,
  ): Promise<ProviderAccountResponse> {
    return this.request<ProviderAccountResponse>(
      'POST',
      `/v1/merchants/${merchantId}/provider-accounts`,
      input,
    );
  }

  /**
   * getProviderAccount — retrieve a provider account.
   *
   * GET /v1/merchants/:merchantId/provider-accounts/:id
   * Phase 8D.
   */
  async getProviderAccount(
    merchantId: string,
    id: string,
  ): Promise<ProviderAccountResponse> {
    return this.request<ProviderAccountResponse>(
      'GET',
      `/v1/merchants/${merchantId}/provider-accounts/${id}`,
    );
  }

  /**
   * confirmFakeGatewayPayment — manually confirm a FakeGateway transaction.
   *
   * POST /v1/dev/fake-gateway/transactions/:transactionId/confirm
   *
   * ⚠ DEV/TEST ONLY. Not available in production.
   * Phase 8D.
   */
  async confirmFakeGatewayPayment(
    transactionId: string,
    input: ConfirmFakeGatewayPaymentRequest,
  ): Promise<ConfirmFakeGatewayPaymentResponse> {
    return this.request<ConfirmFakeGatewayPaymentResponse>(
      'POST',
      `/v1/dev/fake-gateway/transactions/${transactionId}/confirm`,
      input,
    );
  }
}
