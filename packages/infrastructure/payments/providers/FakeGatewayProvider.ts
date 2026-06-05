import { randomBytes, createHmac } from 'crypto';
import type {
  PaymentProvider,
  ProviderCapabilities,
  CreateProviderPaymentInput,
  CreateProviderPaymentResult,
  ProviderAction,
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
 * | scenario           | status          | customer action        | notes                            |
 * |--------------------|-----------------|------------------------|----------------------------------|
 * | `redirect`         | requires_action | Redirect to URL        | Browser / webview redirect       |
 * | `qris`             | requires_action | Scan QR code           | QRIS / static QR payment         |
 * | `va`               | requires_action | Display VA number      | Bank virtual account              |
 * | `payment_code`     | requires_action | Display payment code   | Indomaret / Alfamart codes        |
 * | `immediate_success`| succeeded       | None                   | Settled immediately (no webhook) |
 * | `immediate_failure`| failed          | None                   | Rejected immediately (no webhook)|
 * | `pending_expiry`   | requires_action | Redirect to URL        | Expires in 15 minutes             |
 * | `default` (any)    | pending         | URL + QR (compat)      | Backward-compatible behavior      |
 *
 * @see CreateGatewayPayment for how each status value is handled.
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
 * │  It exists solely for local development and automated tests.           │
 * └─────────────────────────────────────────────────────────────────────────┘
 *
 * Phase 6 Scenario Support
 * ------------------------
 * `createPayment()` now dispatches on `input.metadata?.scenario` to simulate
 * various real-world gateway behaviors.  Pass the scenario name from the test
 * or dev UI; any unrecognised value (including omitted) falls through to the
 * `default` scenario for full backward compatibility with Phase 2 callers.
 *
 * Scenario details
 * ----------------
 * - `redirect`         — status: requires_action; action: redirect to fake payment URL.
 * - `qris`             — status: requires_action; action: present_qr with QR string.
 * - `va`               — status: requires_action; action: display_code (virtual account number).
 * - `payment_code`     — status: requires_action; action: display_code (retail payment code).
 * - `immediate_success`— status: succeeded; no customer action.
 *                        CreateGatewayPayment applies allocation in same DB tx.
 * - `immediate_failure`— status: failed; no customer action; failureReason set.
 * - `pending_expiry`   — status: requires_action; action: redirect; expiresAt = +15 min.
 * - `default` (any)    — status: pending; providerPaymentUrl + providerQrString set
 *                        (backward-compatible; settles via ConfirmFakeGatewayPayment
 *                        or webhook).
 *
 * Backward Compatibility
 * ----------------------
 * All Phase 2 / Phase 3 callers that do NOT pass `metadata.scenario` continue
 * to receive the `default` behavior:
 *   - `status: 'pending'`
 *   - `providerPaymentUrl` and `providerQrString` both populated
 *   - `succeededImmediately: false`
 *   - `actions: []` (empty — callers who read providerPaymentUrl/providerQrString
 *     directly are not affected)
 *
 * Webhook signature
 * -----------------
 * The provider signs the raw request body with HMAC-SHA256.
 * Secret resolution order:
 *   1. FAKE_GATEWAY_WEBHOOK_SECRET env var (all environments)
 *   2. DEFAULT_NON_PROD_SECRET constant (non-production only)
 *   3. No valid secret → signature verification fails
 *
 * Use `FakeGatewayProvider.computeSignature(rawBody)` in tests to generate
 * a valid signature for a given payload.
 *
 * Webhook payload shape (JSON)
 * ----------------------------
 * {
 *   "event_id":          "evt_fake_<random>",   // unique event identifier
 *   "event_type":        "payment.succeeded",   // | "payment.failed" | "payment.pending" | other
 *   "provider_reference": "fake_<intent>_<hex>", // matches tx.providerReference
 *   "status":            "succeeded",           // | "failed" | "pending"
 *   "failure_reason":    null,                  // string or null
 *   "metadata":          {}                     // any extra fields
 * }
 */
export class FakeGatewayProvider implements PaymentProvider {
  public readonly providerCode = 'fake_gateway';

  /**
   * Phase 6: FakeGatewayProvider capabilities.
   *
   * - canCancel / canRefund: false — Phase 4 stubs remain unchanged.
   * - supportsWebhook: true — HMAC-signed webhook events are supported.
   * - supportsPolling: false — no polling endpoint in FakeGateway.
   * - supportedScenarios: all 8 scenario names (for dev/test tooling).
   */
  public readonly capabilities: ProviderCapabilities = {
    canCancel: false,
    canRefund: false,
    supportsWebhook: true,
    supportsPolling: false,
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
   * Scenario dispatch order:
   *   1. Read `input.metadata?.scenario` (string | undefined).
   *   2. Match against known scenario names.
   *   3. Any unrecognised value → `default` behavior (backward compat).
   *
   * Each scenario returns a fully-typed `CreateProviderPaymentResult` with
   * both Phase 6 fields (`status`, `actions`) and legacy fields populated.
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
          type: 'redirect',
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
        // Deterministic-looking VA number: 10-digit numeric string
        const vaNumber = `8800${input.amount.toString().slice(-6).padStart(6, '0')}`;
        const action: ProviderAction = {
          type: 'display_code',
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
        // Alphanumeric payment code for retail payment counters (Indomaret / Alfamart)
        const code = `FAKE${suffix.toUpperCase()}`;
        const action: ProviderAction = {
          type: 'display_code',
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
        // CreateGatewayPayment is expected to apply the allocation in the same
        // DB transaction when it receives status: 'succeeded'.
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
        // Payment is rejected immediately — no customer action.
        // CreateGatewayPayment records a failed transaction.
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
        // Redirect payment with a short expiry (15 minutes from now).
        const url = `https://fake-gateway.local/pay/${providerReference}`;
        const expiresAt = new Date(Date.now() + 15 * 60 * 1000);
        const action: ProviderAction = {
          type: 'redirect',
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
        //   status: 'pending'  (transaction waits for webhook or ConfirmFakeGatewayPayment)
        //   Both providerPaymentUrl and providerQrString are set
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
   * Cancel is not supported in Phase 4.
   * Void/cancel support is planned for a future phase when real gateway adapters are added.
   */
  async cancelPayment(_input: CancelProviderPaymentInput): Promise<CancelProviderPaymentResult> {
    return {
      success: false,
      failureReason: 'FakeGatewayProvider does not support cancel. Implement in Phase 4.',
    };
  }

  /**
   * Refund is not supported in Phase 4.
   * Refund support (outgoing transactions + intent recalculation) is planned for Phase 4.
   */
  async refundPayment(_input: RefundProviderPaymentInput): Promise<RefundProviderPaymentResult> {
    return {
      providerReference: null,
      success: false,
      failureReason: 'FakeGatewayProvider does not support refund. Implement in Phase 4.',
    };
  }

  /**
   * Verify the HMAC-SHA256 signature in `x-fake-gateway-signature`.
   *
   * Returns false in production (unconditionally) to prevent accidental
   * webhook processing by a leaked fake-gateway endpoint.
   *
   * Returns false if:
   *  - NODE_ENV === 'production'
   *  - No secret is available
   *  - The provided signature does not match
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
   * Parse a fake gateway webhook payload.
   *
   * Expects JSON with:
   *   event_id, event_type, provider_reference, status, failure_reason?, metadata?
   *
   * Throws if:
   *  - The payload is not valid JSON
   *  - Required fields (event_id, event_type, provider_reference) are missing
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

    // Map event_type to canonical transactionStatus
    let transactionStatus: ParsedProviderWebhook['transactionStatus'];
    switch (eventType) {
      case 'payment.succeeded':
        transactionStatus = 'succeeded';
        break;
      case 'payment.failed':
        transactionStatus = 'failed';
        break;
      case 'payment.pending':
        transactionStatus = 'pending';
        break;
      default:
        transactionStatus = 'ignored';
        break;
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
      // Legacy convenience fields — derived from transactionStatus
      isPaymentSuccess: transactionStatus === 'succeeded',
      isPaymentFailure: transactionStatus === 'failed',
      amount: typeof body['amount'] === 'number' ? body['amount'] : null,
      rawData: body,
    };
  }

  // ── Static helpers ────────────────────────────────────────────────────────

  /**
   * Compute the HMAC-SHA256 signature for a given raw payload.
   *
   * Used in tests and dev tooling to generate a valid signature without having
   * to hand-craft the HMAC value.
   *
   * @param rawPayload  The raw request body string (same bytes the server receives).
   * @param secret      Optional secret — defaults to the non-prod constant.
   *                    Pass the value of FAKE_GATEWAY_WEBHOOK_SECRET if you set it.
   */
  static computeSignature(rawPayload: string, secret?: string): string {
    const s = secret ?? DEFAULT_NON_PROD_SECRET;
    return createHmac('sha256', s).update(rawPayload).digest('hex');
  }
}
