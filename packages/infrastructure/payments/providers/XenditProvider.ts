import { timingSafeEqual as cryptoTimingSafeEqual, randomUUID } from 'node:crypto';
import type {
  PaymentProvider,
  ProviderCapabilities,
  ProviderAction,
  ProviderActionType,
  ProviderActionDescriptor,
  CreateProviderPaymentInput,
  CreateProviderPaymentResult,
  CancelProviderPaymentInput,
  CancelProviderPaymentResult,
  RefundProviderPaymentInput,
  RefundProviderPaymentResult,
  VerifyWebhookInput,
  ParseWebhookInput,
  ParsedProviderWebhook,
} from '@pos/domain/payments';
import { PaymentPolicyError } from '@pos/domain/payments';

// ── Config ────────────────────────────────────────────────────────────────────

/**
 * Configuration for XenditProvider in sandbox mode.
 * Secrets are sourced from environment variables in `loadXenditSandboxConfig()`.
 * Never store raw secrets in domain objects or log them.
 */
export interface XenditSandboxConfig {
  /** XENDIT_SECRET_KEY_SANDBOX — Basic Auth username; password is always empty. */
  readonly secretKey: string;
  /** XENDIT_WEBHOOK_TOKEN_SANDBOX — compared against x-callback-token header. */
  readonly webhookToken: string;
  /** XENDIT_API_BASE_URL — defaults to https://api.xendit.co */
  readonly apiBaseUrl: string;
  /** XENDIT_PAYMENT_SUCCESS_RETURN_URL */
  readonly successReturnUrl: string;
  /** XENDIT_PAYMENT_FAILURE_RETURN_URL */
  readonly failureReturnUrl: string;
}

/**
 * Read Xendit sandbox config from environment.
 *
 * Returns null (provider must NOT register) when:
 *  - XENDIT_SANDBOX_ENABLED !== 'true', OR
 *  - XENDIT_SECRET_KEY_SANDBOX is missing/empty.
 *
 * Missing config must NOT crash app startup or break FakeGateway tests.
 */
export function loadXenditSandboxConfig(): XenditSandboxConfig | null {
  const enabled = process.env['XENDIT_SANDBOX_ENABLED'] === 'true';
  const secretKey = process.env['XENDIT_SECRET_KEY_SANDBOX'] ?? '';

  if (!enabled || !secretKey) return null;

  return {
    secretKey,
    webhookToken: process.env['XENDIT_WEBHOOK_TOKEN_SANDBOX'] ?? '',
    apiBaseUrl: process.env['XENDIT_API_BASE_URL'] ?? 'https://api.xendit.co',
    successReturnUrl:
      process.env['XENDIT_PAYMENT_SUCCESS_RETURN_URL'] ?? 'http://localhost:5000/payment/success',
    failureReturnUrl:
      process.env['XENDIT_PAYMENT_FAILURE_RETURN_URL'] ?? 'http://localhost:5000/payment/failure',
  };
}

// ── Minimal HTTP interface (avoids DOM/undici type dependency) ─────────────────

interface MinimalResponse {
  readonly status: number;
  json(): Promise<unknown>;
}

/**
 * FetchFn — injectable HTTP client type.
 * Use the real `globalThis.fetch` in production; inject a mock in tests.
 */
export type FetchFn = (
  url: string,
  init?: {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
  },
) => Promise<MinimalResponse>;

// ── Internal Xendit response shapes ───────────────────────────────────────────

interface XenditAction {
  type: string;       // e.g. REDIRECT_CUSTOMER, PRESENT_TO_CUSTOMER
  descriptor: string; // e.g. WEB_URL, QR_STRING, VA_NUMBER, PAYMENT_CODE
  url?: string;
  value?: string;
}

interface XenditPaymentResponse {
  payment_request_id?: string;
  reference_id?: string;
  status?: string;
  actions?: XenditAction[];
  failure_message?: string;
  failure_code?: string;
  created?: string;
  updated?: string;
  [key: string]: unknown;
}

interface XenditWebhookPayload {
  event?: string;
  data?: {
    id?: string;
    payment_request_id?: string;
    reference_id?: string;
    status?: string;
    failure_code?: string;
    failure_reason?: string;
    request_amount?: number | string;
    currency?: string;
    [key: string]: unknown;
  };
  created?: string;
  [key: string]: unknown;
}

// ── XenditProvider ────────────────────────────────────────────────────────────

/**
 * XenditProvider — **sandbox/test-mode only** adapter for the Xendit Payments API.
 *
 * ┌───────────────────────────────────────────────────────────────────────────┐
 * │  SANDBOX ONLY — Phase 7A.                                                │
 * │  No production credentials.  No provider-level refund/cancel.            │
 * │  No cron/worker layer.  No POS UI adapter.                               │
 * └───────────────────────────────────────────────────────────────────────────┘
 *
 * Authentication
 * ──────────────
 * Basic Auth: username = XENDIT_SECRET_KEY_SANDBOX, password = '' (empty).
 * Header: `Authorization: Basic base64(secretKey + ':')`
 *
 * Webhook verification
 * ────────────────────
 * Header `x-callback-token` compared against XENDIT_WEBHOOK_TOKEN_SANDBOX
 * using constant-time comparison.  Returns false if token missing.
 *
 * Status mapping (Phase 7A)
 * ─────────────────────────
 * REQUIRES_ACTION → requires_action
 * PENDING         → pending
 * SUCCEEDED       → succeeded
 * FAILED          → failed
 * CANCELED/EXPIRED→ failed  ← documented Phase 7A limitation
 *
 * Action mapping
 * ──────────────
 * REDIRECT_CUSTOMER  + WEB_URL      → redirect_customer + WEB_URL
 * PRESENT_TO_CUSTOMER + QR_STRING   → present_qr        + QR_STRING
 * PRESENT_TO_CUSTOMER + VA_NUMBER   → display_code      + VA_NUMBER
 * PRESENT_TO_CUSTOMER + PAYMENT_CODE→ display_code      + PAYMENT_CODE
 * (unknown)                         → none              + NONE
 *
 * Known limitations (Phase 7A)
 * ────────────────────────────
 * - CANCELED and EXPIRED are mapped to `failed` (no distinct status in Phase 7A).
 * - payment_request.expiry webhook is parsed as `ignored`.
 * - No provider-level refund/cancel API call.
 * - No external polling endpoint.
 * - No cron/worker layer.
 * - No POS UI changes.
 */
export class XenditProvider implements PaymentProvider {
  public readonly providerCode = 'xendit_sandbox';

  /**
   * Phase 7A capability matrix.
   * supportsPaymentCode is false — PAYMENT_CODE channel not validated in Phase 7A.
   */
  public readonly capabilities: ProviderCapabilities = {
    supportsRedirect: true,
    supportsQr: true,
    supportsVa: true,
    supportsPaymentCode: false,
    canReturnImmediateSuccess: true,
    canReturnImmediateFailure: true,
    canCancel: false,
    canRefund: false,
    supportsPartialRefund: false,
    supportsMultiplePartialRefund: false,
    supportsWebhook: true,
    supportsPolling: false,
  };

  constructor(
    private readonly config: XenditSandboxConfig,
    private readonly httpFetch: FetchFn = defaultFetch,
  ) {}

  // ── Private helpers ─────────────────────────────────────────────────────────

  /**
   * Build Basic Auth header.
   * username = secretKey, password = '' (empty string).
   * Never log the returned header or the secretKey.
   */
  private buildAuthHeader(): string {
    const encoded = Buffer.from(`${this.config.secretKey}:`).toString('base64');
    return `Basic ${encoded}`;
  }

  /**
   * Resolve Xendit channel_code from PaymentMethod.
   *
   * - `qris`          → QRIS (default; overridable via metadata.xendit_channel_code)
   * - `ewallet`       → requires metadata.xendit_channel_code (e.g. "OVO", "DANA")
   * - `bank_transfer` → requires metadata.xendit_channel_code (e.g. "BCA", "MANDIRI")
   * - other           → throws PaymentPolicyError('UNSUPPORTED_PROVIDER')
   */
  private resolveChannelCode(
    method: CreateProviderPaymentInput['method'],
    metadata?: Record<string, unknown>,
  ): string {
    const override =
      typeof metadata?.['xendit_channel_code'] === 'string'
        ? (metadata['xendit_channel_code'] as string)
        : null;

    if (override) return override;

    switch (method) {
      case 'qris':
        return 'QRIS';
      case 'ewallet':
        throw new PaymentPolicyError(
          `XenditProvider: method 'ewallet' requires metadata.xendit_channel_code ` +
            `(e.g. "OVO", "DANA", "LINKAJA").`,
          'UNSUPPORTED_PROVIDER',
        );
      case 'bank_transfer':
        throw new PaymentPolicyError(
          `XenditProvider: method 'bank_transfer' requires metadata.xendit_channel_code ` +
            `(e.g. "BCA", "MANDIRI", "BNI").`,
          'UNSUPPORTED_PROVIDER',
        );
      default:
        throw new PaymentPolicyError(
          `XenditProvider: method '${method}' is not supported in Phase 7A. ` +
            `Supported methods: qris, ewallet (with xendit_channel_code), ` +
            `bank_transfer (with xendit_channel_code).`,
          'UNSUPPORTED_PROVIDER',
        );
    }
  }

  /**
   * Map Xendit status string to internal provider result status.
   * CANCELED and EXPIRED are mapped to 'failed' — documented Phase 7A limitation.
   */
  private mapStatus(xenditStatus: string): CreateProviderPaymentResult['status'] {
    switch (xenditStatus.toUpperCase()) {
      case 'REQUIRES_ACTION':
        return 'requires_action';
      case 'PENDING':
        return 'pending';
      case 'SUCCEEDED':
        return 'succeeded';
      case 'FAILED':
        return 'failed';
      case 'CANCELED':
      case 'CANCELLED':
      case 'EXPIRED':
        // Phase 7A limitation: no distinct canceled/expired status in internal contract.
        // Both are treated as failed. See Phase 7A report for details.
        return 'failed';
      default:
        // Unknown Xendit status — treat as pending to avoid false failures.
        return 'pending';
    }
  }

  /**
   * Map Xendit actions[] to internal ProviderAction[].
   *
   * Xendit action shape:
   *   { type: 'REDIRECT_CUSTOMER', descriptor: 'WEB_URL', url: 'https://...' }
   *   { type: 'PRESENT_TO_CUSTOMER', descriptor: 'QR_STRING', value: '...' }
   *   { type: 'PRESENT_TO_CUSTOMER', descriptor: 'VA_NUMBER', value: '...' }
   */
  private mapActions(xenditActions: XenditAction[]): ProviderAction[] {
    return xenditActions.map((raw): ProviderAction => {
      const xType = typeof raw.type === 'string' ? raw.type.toUpperCase() : '';
      const xDescriptor = typeof raw.descriptor === 'string' ? raw.descriptor.toUpperCase() : '';
      // Xendit uses 'url' for redirect and 'value' for others
      const rawValue =
        typeof raw.url === 'string' ? raw.url
        : typeof raw.value === 'string' ? raw.value
        : null;

      if (xType === 'REDIRECT_CUSTOMER' && xDescriptor === 'WEB_URL') {
        return {
          type: 'redirect_customer' as ProviderActionType,
          descriptor: 'WEB_URL' as ProviderActionDescriptor,
          label: 'Complete payment',
          value: rawValue,
          expiresAt: null,
          metadata: { providerType: raw.type },
        };
      }

      if (xType === 'PRESENT_TO_CUSTOMER' && xDescriptor === 'QR_STRING') {
        return {
          type: 'present_qr' as ProviderActionType,
          descriptor: 'QR_STRING' as ProviderActionDescriptor,
          label: 'Scan QR code to pay',
          value: rawValue,
          expiresAt: null,
          metadata: { providerType: raw.type },
        };
      }

      if (xType === 'PRESENT_TO_CUSTOMER' && xDescriptor === 'VA_NUMBER') {
        return {
          type: 'display_code' as ProviderActionType,
          descriptor: 'VA_NUMBER' as ProviderActionDescriptor,
          label: 'Virtual Account Number',
          value: rawValue,
          expiresAt: null,
          metadata: { providerType: raw.type },
        };
      }

      if (xType === 'PRESENT_TO_CUSTOMER' && xDescriptor === 'PAYMENT_CODE') {
        return {
          type: 'display_code' as ProviderActionType,
          descriptor: 'PAYMENT_CODE' as ProviderActionDescriptor,
          label: 'Payment Code',
          value: rawValue,
          expiresAt: null,
          metadata: { providerType: raw.type },
        };
      }

      // Unknown action — surface as 'none' so callers can observe without crashing.
      return {
        type: 'none' as ProviderActionType,
        descriptor: 'NONE' as ProviderActionDescriptor,
        label: 'Unknown action',
        value: null,
        expiresAt: null,
        metadata: { providerType: raw.type, providerDescriptor: raw.descriptor, rawAction: raw },
      };
    });
  }

  // ── PaymentProvider interface ────────────────────────────────────────────────

  /**
   * createPayment — call Xendit POST /v3/payment_requests and map the response.
   *
   * Channel code resolution order:
   *   1. metadata.xendit_channel_code override (any method)
   *   2. method-based default (qris → QRIS)
   *   3. PaymentPolicyError for methods requiring explicit override
   *
   * On non-2xx from Xendit: returns status='failed' (stores failed tx, no throw).
   * On network error: throws Error (propagates to CreateGatewayPayment).
   */
  async createPayment(input: CreateProviderPaymentInput): Promise<CreateProviderPaymentResult> {
    const channelCode = this.resolveChannelCode(input.method, input.metadata);

    // reference_id is OUR stable reference sent to Xendit.
    // Use the per-attempt provider_request_id injected by CreateGatewayPayment (Task 6).
    // This prevents reference_id collisions when the same intent has multiple gateway attempts.
    // Falls back to a generated unique suffix if not provided (e.g. direct provider calls in tests).
    const referenceId =
      typeof input.metadata?.['provider_request_id'] === 'string'
        ? (input.metadata['provider_request_id'] as string)
        : `aurapos-${input.paymentIntentId}-${randomUUID().slice(0, 8)}`;

    const requestBody = {
      reference_id: referenceId,
      type: 'PAY',
      country: 'ID',
      currency: input.currency ?? 'IDR',
      request_amount: input.amount,
      capture_method: 'AUTOMATIC',
      channel_code: channelCode,
      channel_properties: {
        success_return_url: this.config.successReturnUrl,
        failure_return_url: this.config.failureReturnUrl,
      },
      description: `AuraPoS payment ${input.paymentIntentId}`,
      metadata: {
        source_app: 'aurapos',
        payment_intent_id: input.paymentIntentId,
      },
    };

    let httpStatus: number;
    let responseBody: XenditPaymentResponse;

    try {
      const res = await this.httpFetch(`${this.config.apiBaseUrl}/v3/payment_requests`, {
        method: 'POST',
        headers: {
          Authorization: this.buildAuthHeader(),
          'Content-Type': 'application/json',
          'api-version': '2022-07-31',
        },
        body: JSON.stringify(requestBody),
      });
      httpStatus = res.status;
      responseBody = (await res.json()) as XenditPaymentResponse;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      throw new Error(`XenditProvider.createPayment: network error — ${message}`);
    }

    // Non-2xx: return failed result (let CreateGatewayPayment store a failed transaction)
    if (httpStatus < 200 || httpStatus >= 300) {
      const errorCode =
        typeof responseBody['error_code'] === 'string' ? responseBody['error_code'] : 'API_ERROR';
      const message =
        typeof responseBody['message'] === 'string'
          ? responseBody['message']
          : `Xendit API error (HTTP ${httpStatus})`;
      return {
        status: 'failed',
        actions: [],
        expiresAt: null,
        rawProviderResponse: responseBody as Record<string, unknown>,
        providerReference: null,
        providerPaymentUrl: null,
        providerQrString: null,
        succeededImmediately: false,
        failureReason: `[${errorCode}] ${message}`,
      };
    }

    // Map Xendit response to internal result
    const xenditStatus = typeof responseBody.status === 'string' ? responseBody.status : 'PENDING';
    const internalStatus = this.mapStatus(xenditStatus);

    const xenditActions = Array.isArray(responseBody.actions) ? responseBody.actions : [];
    const mappedActions = this.mapActions(xenditActions);

    const providerReference =
      typeof responseBody.payment_request_id === 'string'
        ? responseBody.payment_request_id
        : null;

    // Derive legacy fields from actions (backward compatibility)
    const webUrlAction = mappedActions.find((a) => a.descriptor === 'WEB_URL');
    const qrAction = mappedActions.find((a) => a.descriptor === 'QR_STRING');
    const providerPaymentUrl = webUrlAction?.value ?? null;
    const providerQrString = qrAction?.value ?? null;

    const failureReason =
      internalStatus === 'failed'
        ? (responseBody.failure_message ??
          responseBody.failure_code ??
          `Payment ${xenditStatus.toLowerCase()}`)
        : null;

    return {
      status: internalStatus,
      actions: mappedActions,
      expiresAt: null,
      rawProviderResponse: responseBody as Record<string, unknown>,
      providerReference,
      providerPaymentUrl: typeof providerPaymentUrl === 'string' ? providerPaymentUrl : null,
      providerQrString: typeof providerQrString === 'string' ? providerQrString : null,
      succeededImmediately: internalStatus === 'succeeded',
      failureReason: typeof failureReason === 'string' ? failureReason : null,
    };
  }

  /**
   * cancelPayment — NOT implemented in Phase 7A.
   * Use VoidPaymentTransaction use case (Phase 4) for internal void lifecycle.
   */
  async cancelPayment(_input: CancelProviderPaymentInput): Promise<CancelProviderPaymentResult> {
    return {
      success: false,
      failureReason:
        'XenditProvider Phase 7A: provider-level cancel is not implemented. ' +
        'Use VoidPaymentTransaction use case (Phase 4) for internal void lifecycle.',
    };
  }

  /**
   * refundPayment — NOT implemented in Phase 7A.
   * Use RefundPaymentTransaction use case (Phase 4) for internal refund lifecycle.
   */
  async refundPayment(_input: RefundProviderPaymentInput): Promise<RefundProviderPaymentResult> {
    return {
      providerReference: null,
      success: false,
      failureReason:
        'XenditProvider Phase 7A: provider-level refund is not implemented. ' +
        'Use RefundPaymentTransaction use case (Phase 4) for internal refund lifecycle.',
    };
  }

  /**
   * verifyWebhook — validate x-callback-token header against XENDIT_WEBHOOK_TOKEN_SANDBOX.
   *
   * - Uses constant-time comparison to prevent timing attacks.
   * - Returns false if webhookToken config is missing/empty.
   * - Never logs the token.
   */
  async verifyWebhook(input: VerifyWebhookInput): Promise<boolean> {
    if (!this.config.webhookToken) return false;

    // Xendit sends the token in x-callback-token header (case-insensitive on their side)
    const providedToken =
      input.headers['x-callback-token'] ||
      input.headers['X-CALLBACK-TOKEN'] ||
      input.headers['X-Callback-Token'] ||
      input.signature ||
      '';

    if (!providedToken) return false;

    return safeCompareTokens(providedToken, this.config.webhookToken);
  }

  /**
   * parseWebhook — parse a Xendit payment webhook payload.
   *
   * Supported events (Phase 7A):
   *   payment.capture          → transactionStatus: 'succeeded'
   *   payment.failure          → transactionStatus: 'failed'
   *   payment_request.expiry   → transactionStatus: 'ignored'  (Phase 7A limitation)
   *   (any other)              → transactionStatus: 'ignored'
   *
   * providerEventId is deterministic: `${event}:${data.payment_request_id}`
   * This allows duplicate webhook idempotency via payment_provider_events uniqueness.
   *
   * providerReference = data.payment_request_id (Xendit's stable payment reference).
   */
  async parseWebhook(input: ParseWebhookInput): Promise<ParsedProviderWebhook> {
    let body: XenditWebhookPayload;
    try {
      body = JSON.parse(input.rawPayload) as XenditWebhookPayload;
    } catch {
      throw new Error('XenditProvider.parseWebhook: payload is not valid JSON');
    }

    const event = typeof body.event === 'string' ? body.event : '';
    const data = body.data ?? {};

    const paymentRequestId =
      typeof data.payment_request_id === 'string' ? data.payment_request_id : '';

    if (!paymentRequestId) {
      throw new Error(
        'XenditProvider.parseWebhook: missing data.payment_request_id in webhook payload',
      );
    }

    // Deterministic event ID — stable across retries of the same webhook delivery.
    const providerEventId = `${event}:${paymentRequestId}`;

    let transactionStatus: ParsedProviderWebhook['transactionStatus'];
    switch (event) {
      case 'payment.capture':
        transactionStatus = 'succeeded';
        break;
      case 'payment.failure':
        transactionStatus = 'failed';
        break;
      case 'payment_request.expiry':
        // Phase 7A: expiry events are ignored — no distinct 'expired' status in contract.
        // A future phase may map this to 'failed' or add an 'expired' status.
        transactionStatus = 'ignored';
        break;
      default:
        transactionStatus = 'ignored';
    }

    // Safe failure reason: combine code + message if both present
    const failureCode = typeof data.failure_code === 'string' ? data.failure_code : null;
    const failureMsg = typeof data.failure_reason === 'string' ? data.failure_reason : null;
    const failureReason =
      failureCode && failureMsg
        ? `${failureCode}: ${failureMsg}`
        : failureCode ?? failureMsg ?? null;

    const rawAmount = data.request_amount;
    const amount =
      typeof rawAmount === 'number'
        ? rawAmount
        : typeof rawAmount === 'string'
          ? parseFloat(rawAmount)
          : null;

    return {
      provider: this.providerCode,
      providerEventId,
      providerReference: paymentRequestId,
      eventType: event,
      transactionStatus,
      failureReason,
      metadata: null,
      isPaymentSuccess: transactionStatus === 'succeeded',
      isPaymentFailure: transactionStatus === 'failed',
      amount: amount !== null && !isNaN(amount) ? amount : null,
      rawData: body as Record<string, unknown>,
    };
  }
}

// ── Module-level helpers ───────────────────────────────────────────────────────

/**
 * Constant-time token comparison to prevent timing-based token extraction.
 * Returns false immediately if lengths differ (length is not considered secret).
 */
function safeCompareTokens(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  return cryptoTimingSafeEqual(bufA, bufB);
}

/**
 * defaultFetch — thin wrapper over globalThis.fetch for Node.js 18+ environments.
 * Provides the `MinimalResponse` interface expected by XenditProvider.
 */
const defaultFetch: FetchFn = async (url: string, init?) => {
  // Node 18+ has globalThis.fetch (undici-based).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const res = await (globalThis as any).fetch(url, init);
  return {
    status: res.status as number,
    json: () => res.json() as Promise<unknown>,
  };
};
