import { randomBytes, createHmac } from 'crypto';
import type {
  PaymentProvider,
  ProviderCapabilities,
  ProviderAction,
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

/**
 * The default HMAC secret used in non-production environments when
 * FAKE_GATEWAY_WEBHOOK_SECRET env var is not set.
 *
 * ⚠️  NOT suitable for production — the name makes this intent clear.
 */
const DEFAULT_NON_PROD_SECRET = 'fake-gateway-test-secret-default-dev-only-NOT-for-prod';

/**
 * FakeGatewayScenario — the set of scenario names understood by FakeGatewayProvider.
 *
 * Pass `metadata.scenario` in `createPayment()` input to select a scenario:
 *
 * | scenario           | status          | action descriptor | notes                              |
 * |--------------------|-----------------|-------------------|------------------------------------|
 * | `redirect`         | requires_action | WEB_URL           | Browser / webview redirect         |
 * | `qris`             | requires_action | QR_STRING         | QRIS / static QR payment           |
 * | `va`               | requires_action | VA_NUMBER         | Bank virtual account               |
 * | `payment_code`     | requires_action | PAYMENT_CODE      | Indomaret / Alfamart codes         |
 * | `immediate_success`| succeeded       | NONE (no action)  | Settled immediately (no webhook)   |
 * | `immediate_failure`| failed          | NONE (no action)  | Rejected immediately (no webhook)  |
 * | `pending_expiry`   | requires_action | WEB_URL + expiry  | Expires in 15 minutes              |
 * | `default` (any)    | pending         | NONE (no action)  | Backward-compatible behavior        |
 */
export type FakeGatewayScenario =
  | 'redirect'
  | 'qris'
  | 'va'
  | 'payment_code'
  | 'immediate_success'
  | 'immediate_failure'
  | 'pending_expiry'
  | 'default';

/**
 * FakeGatewayProvider — dev/test-only simulated payment gateway.
 *
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │  DO NOT use in production.  This provider has no real money movement.  │
 * │  It is NOT a Midtrans, Xendit, or Stripe emulator.                     │
 * │  It exists solely for local development and automated tests.           │
 * └─────────────────────────────────────────────────────────────────────────┘
 *
 * Phase 6 Hardening additions
 * ---------------------------
 * 1. All actions now include `descriptor` (WEB_URL, QR_STRING, VA_NUMBER,
 *    PAYMENT_CODE, NONE) for machine-readable dispatch in UI/adapters.
 * 2. Action `type` uses canonical `redirect_customer` (was `redirect`).
 * 3. Expanded `capabilities` matrix (supportsRedirect, supportsQr, supportsVa,
 *    supportsPaymentCode, canReturnImmediateSuccess, canReturnImmediateFailure, etc.)
 * 4. cancel/refund messages updated: Phase 4 internal lifecycle exists;
 *    provider-level API will be in a future real-provider adapter phase.
 *
 * Backward Compatibility
 * ----------------------
 * Callers that do NOT pass `metadata.scenario` receive the `default` behavior:
 *   - `status: 'pending'`
 *   - `providerPaymentUrl` and `providerQrString` both populated
 *   - `actions: []` (empty — legacy callers read legacy fields directly)
 *
 * Webhook signature
 * -----------------
 * HMAC-SHA256 via `x-fake-gateway-signature` header.
 * Secret: FAKE_GATEWAY_WEBHOOK_SECRET env var, or DEFAULT_NON_PROD_SECRET in non-prod.
 * Use `FakeGatewayProvider.computeSignature(rawBody)` in tests.
 */
export class FakeGatewayProvider implements PaymentProvider {
  public readonly providerCode = 'fake_gateway';

  /**
   * Phase 6 Hardening: expanded capability matrix.
   *
   * FakeGateway supports all action types and both immediate outcomes
   * (for scenario-driven testing). Cancel/refund provider API is not supported —
   * internal void/refund lifecycle exists via Phase 4 use cases.
   */
  public readonly capabilities: ProviderCapabilities = {
    // ── Gateway action capabilities ───────────────────────────────────────
    supportsRedirect: true,
    supportsQr: true,
    supportsVa: true,
    supportsPaymentCode: true,
    canReturnImmediateSuccess: true,
    canReturnImmediateFailure: true,
    // ── Refund/cancel API (provider-level) ────────────────────────────────
    canCancel: false,
    canRefund: false,
    supportsPartialRefund: false,
    supportsMultiplePartialRefund: false,
    // ── Communication model ───────────────────────────────────────────────
    supportsWebhook: true,
    supportsPolling: false,
    // ── Dev/test scenario list ────────────────────────────────────────────
    supportedScenarios: [
      'redirect',
      'qris',
      'va',
      'payment_code',
      'immediate_success',
      'immediate_failure',
      'pending_expiry',
      'default',
    ],
  };

  // ── Private helpers ──────────────────────────────────────────────────────

  private getWebhookSecret(): string | null {
    const envSecret = process.env.FAKE_GATEWAY_WEBHOOK_SECRET;
    if (envSecret) return envSecret;
    if (process.env.NODE_ENV !== 'production') return DEFAULT_NON_PROD_SECRET;
    return null;
  }

  // ── PaymentProvider interface ─────────────────────────────────────────────

  /**
   * createPayment — generate a fake payment with scenario-driven behavior.
   *
   * Dispatch order:
   *   1. Read `input.metadata?.scenario`.
   *   2. Match against known scenario names.
   *   3. Any unrecognised value (including omitted) → `default` behavior.
   *
   * All actions include the `descriptor` field for machine-readable dispatch.
   */
  async createPayment(input: CreateProviderPaymentInput): Promise<CreateProviderPaymentResult> {
    const scenario = (input.metadata?.['scenario'] as string | undefined) ?? 'default';
    const suffix = randomBytes(4).toString('hex');
    const providerReference = `fake_${input.paymentIntentId}_${suffix}`;

    switch (scenario) {
      // ── redirect ──────────────────────────────────────────────────────────
      case 'redirect': {
        const url = `https://fake-gateway.local/pay/${providerReference}`;
        const action: ProviderAction = {
          type: 'redirect_customer',
          descriptor: 'WEB_URL',
          label: 'Complete payment',
          value: url,
          expiresAt: null,
        };
        return {
          status: 'requires_action',
          actions: [action],
          expiresAt: null,
          rawProviderResponse: { scenario, provider_reference: providerReference },
          providerReference,
          providerPaymentUrl: url,
          providerQrString: null,
          succeededImmediately: false,
          failureReason: null,
        };
      }

      // ── qris ─────────────────────────────────────────────────────────────
      case 'qris': {
        const qrString = `FAKE_QR:${providerReference}:${input.amount}:${input.currency}`;
        const action: ProviderAction = {
          type: 'present_qr',
          descriptor: 'QR_STRING',
          label: 'Scan QR code',
          value: qrString,
          expiresAt: null,
        };
        return {
          status: 'requires_action',
          actions: [action],
          expiresAt: null,
          rawProviderResponse: { scenario, provider_reference: providerReference },
          providerReference,
          providerPaymentUrl: null,
          providerQrString: qrString,
          succeededImmediately: false,
          failureReason: null,
        };
      }

      // ── va (virtual account) ─────────────────────────────────────────────
      case 'va': {
        const vaNumber = `8800${input.amount.toString().slice(-6).padStart(6, '0')}`;
        const action: ProviderAction = {
          type: 'display_code',
          descriptor: 'VA_NUMBER',
          label: 'Virtual Account Number',
          value: vaNumber,
          expiresAt: null,
        };
        return {
          status: 'requires_action',
          actions: [action],
          expiresAt: null,
          rawProviderResponse: { scenario, provider_reference: providerReference, va_number: vaNumber },
          providerReference,
          providerPaymentUrl: null,
          providerQrString: null,
          succeededImmediately: false,
          failureReason: null,
        };
      }

      // ── payment_code (retail counter) ────────────────────────────────────
      case 'payment_code': {
        const code = `FAKE${suffix.toUpperCase()}`;
        const action: ProviderAction = {
          type: 'display_code',
          descriptor: 'PAYMENT_CODE',
          label: 'Payment Code',
          value: code,
          expiresAt: null,
        };
        return {
          status: 'requires_action',
          actions: [action],
          expiresAt: null,
          rawProviderResponse: { scenario, provider_reference: providerReference, payment_code: code },
          providerReference,
          providerPaymentUrl: null,
          providerQrString: null,
          succeededImmediately: false,
          failureReason: null,
        };
      }

      // ── immediate_success ────────────────────────────────────────────────
      case 'immediate_success': {
        // Payment settles immediately — no customer action required.
        // CreateGatewayPayment handles allocation inline without calling
        // ApplyGatewayTransactionStatus (no reversed lock ordering).
        return {
          status: 'succeeded',
          actions: [],
          expiresAt: null,
          rawProviderResponse: { scenario, provider_reference: providerReference },
          providerReference,
          providerPaymentUrl: null,
          providerQrString: null,
          succeededImmediately: true,
          failureReason: null,
        };
      }

      // ── immediate_failure ────────────────────────────────────────────────
      case 'immediate_failure': {
        // Payment rejected immediately — no customer action.
        return {
          status: 'failed',
          actions: [],
          expiresAt: null,
          rawProviderResponse: { scenario, provider_reference: providerReference },
          providerReference,
          providerPaymentUrl: null,
          providerQrString: null,
          succeededImmediately: false,
          failureReason: 'Payment rejected by fake gateway (immediate_failure scenario)',
        };
      }

      // ── pending_expiry ───────────────────────────────────────────────────
      case 'pending_expiry': {
        const url = `https://fake-gateway.local/pay/${providerReference}`;
        const expiresAt = new Date(Date.now() + 15 * 60 * 1000);
        const action: ProviderAction = {
          type: 'redirect_customer',
          descriptor: 'WEB_URL',
          label: 'Complete payment (expires soon)',
          value: url,
          expiresAt,
        };
        return {
          status: 'requires_action',
          actions: [action],
          expiresAt,
          rawProviderResponse: {
            scenario,
            provider_reference: providerReference,
            expires_at: expiresAt.toISOString(),
          },
          providerReference,
          providerPaymentUrl: url,
          providerQrString: null,
          succeededImmediately: false,
          failureReason: null,
        };
      }

      // ── default (backward-compatible behavior) ───────────────────────────
      default: {
        // Preserves Phase 2 / Phase 3 behavior exactly:
        //   status: 'pending'  (waits for webhook or ConfirmFakeGatewayPayment)
        //   Both providerPaymentUrl and providerQrString populated
        //   actions: [] (empty — legacy callers read legacy fields directly)
        const url = `https://fake-gateway.local/pay/${providerReference}`;
        const qrString = `FAKE_QR:${providerReference}:${input.amount}:${input.currency}`;
        return {
          status: 'pending',
          actions: [],
          expiresAt: null,
          rawProviderResponse: { scenario: 'default', provider_reference: providerReference },
          providerReference,
          providerPaymentUrl: url,
          providerQrString: qrString,
          succeededImmediately: false,
          failureReason: null,
        };
      }
    }
  }

  /**
   * cancelPayment — provider-level gateway cancellation is not implemented.
   *
   * Phase 4 introduced the internal void lifecycle via `VoidPaymentTransaction`
   * use case (no external provider API call required for FakeGateway).
   * Real provider-level cancel API calls will be added in a future phase when
   * a real gateway adapter (Midtrans, Xendit, Stripe) is integrated.
   */
  async cancelPayment(_input: CancelProviderPaymentInput): Promise<CancelProviderPaymentResult> {
    return {
      success: false,
      failureReason:
        'FakeGatewayProvider does not support provider-level cancel. ' +
        'Use VoidPaymentTransaction use case (Phase 4) for internal void lifecycle. ' +
        'Real provider cancel API will be added in a future gateway adapter phase.',
    };
  }

  /**
   * refundPayment — provider-level gateway refund is not implemented.
   *
   * Phase 4 introduced the internal refund lifecycle via `RefundPaymentTransaction`
   * use case (no external provider API call required for FakeGateway).
   * Real provider-level refund API calls will be added in a future phase when
   * a real gateway adapter (Midtrans, Xendit, Stripe) is integrated.
   */
  async refundPayment(_input: RefundProviderPaymentInput): Promise<RefundProviderPaymentResult> {
    return {
      providerReference: null,
      success: false,
      failureReason:
        'FakeGatewayProvider does not support provider-level refund. ' +
        'Use RefundPaymentTransaction use case (Phase 4) for internal refund lifecycle. ' +
        'Real provider refund API will be added in a future gateway adapter phase.',
    };
  }

  /**
   * verifyWebhook — verify the HMAC-SHA256 signature in `x-fake-gateway-signature`.
   *
   * Returns false in production (unconditionally).
   */
  async verifyWebhook(input: VerifyWebhookInput): Promise<boolean> {
    if (process.env.NODE_ENV === 'production') return false;

    const secret = this.getWebhookSecret();
    if (!secret) return false;

    const signature =
      input.signature ||
      input.headers['x-fake-gateway-signature'] ||
      '';

    if (!signature) return false;

    const expected = FakeGatewayProvider.computeSignature(input.rawPayload, secret);
    return signature === expected;
  }

  /**
   * parseWebhook — parse a fake gateway webhook payload.
   *
   * Expects JSON with: event_id, event_type, provider_reference, status, failure_reason?, metadata?
   */
  async parseWebhook(input: ParseWebhookInput): Promise<ParsedProviderWebhook> {
    let body: Record<string, unknown>;
    try {
      body = JSON.parse(input.rawPayload);
    } catch {
      throw new Error('FakeGatewayProvider.parseWebhook: payload is not valid JSON');
    }

    const providerEventId = body['event_id'];
    const eventType = body['event_type'];
    const providerReference = body['provider_reference'];

    if (typeof providerEventId !== 'string' || !providerEventId) {
      throw new Error('FakeGatewayProvider.parseWebhook: missing or invalid "event_id"');
    }
    if (typeof eventType !== 'string' || !eventType) {
      throw new Error('FakeGatewayProvider.parseWebhook: missing or invalid "event_type"');
    }
    if (typeof providerReference !== 'string' || !providerReference) {
      throw new Error('FakeGatewayProvider.parseWebhook: missing or invalid "provider_reference"');
    }

    let transactionStatus: ParsedProviderWebhook['transactionStatus'];
    switch (eventType) {
      case 'payment.succeeded': transactionStatus = 'succeeded'; break;
      case 'payment.failed':    transactionStatus = 'failed';    break;
      case 'payment.pending':   transactionStatus = 'pending';   break;
      default:                  transactionStatus = 'ignored';   break;
    }

    const failureReason =
      typeof body['failure_reason'] === 'string' ? body['failure_reason'] : null;

    const metadata =
      body['metadata'] && typeof body['metadata'] === 'object' && !Array.isArray(body['metadata'])
        ? (body['metadata'] as Record<string, unknown>)
        : null;

    return {
      provider: this.providerCode,
      providerEventId,
      providerReference,
      eventType,
      transactionStatus,
      failureReason,
      metadata,
      isPaymentSuccess: transactionStatus === 'succeeded',
      isPaymentFailure: transactionStatus === 'failed',
      amount: typeof body['amount'] === 'number' ? body['amount'] : null,
      rawData: body,
    };
  }

  // ── Static helpers ────────────────────────────────────────────────────────

  /**
   * Compute the HMAC-SHA256 signature for a given raw payload.
   * Use in tests to generate a valid signature without hand-crafting the HMAC.
   */
  static computeSignature(rawPayload: string, secret?: string): string {
    const s = secret ?? DEFAULT_NON_PROD_SECRET;
    return createHmac('sha256', s).update(rawPayload).digest('hex');
  }
}
