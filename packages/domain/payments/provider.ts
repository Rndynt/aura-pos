import type { PaymentMethod } from './status';

// ── Phase 6: Provider action types ────────────────────────────────────────────

/**
 * ProviderActionType — the kind of customer action required to complete payment.
 *
 * - `redirect`     — customer must be redirected to a URL (e.g. card 3DS, e-wallet deeplink)
 * - `present_qr`   — customer scans a QR code string shown in the UI
 * - `display_code` — customer enters a code at a counter/ATM (VA number, payment code)
 * - `poll`         — no customer action; caller polls provider for status
 * - `none`         — no action required (payment settled immediately or failed)
 */
export type ProviderActionType = 'redirect' | 'present_qr' | 'display_code' | 'poll' | 'none';

/**
 * ProviderActionDescriptor — a single required action for the customer.
 *
 * The UI consumes this to render the correct payment widget:
 *  - `redirect`     → open `value` in browser / webview
 *  - `present_qr`   → render QR from `value` string
 *  - `display_code` → show `value` as a numeric/alphanumeric code
 *  - `poll`         → show spinner, poll backend
 *  - `none`         → advance automatically (no user interaction)
 */
export interface ProviderActionDescriptor {
  /** Category of customer action required. */
  type: ProviderActionType;
  /** Human-readable label for the action (e.g. "Scan QR", "Pay via URL"). */
  label: string;
  /** The URL, QR string, VA number, payment code, or empty string for none/poll. */
  value: string;
  /** When this action or the payment attempt expires (null = no expiry). */
  expiresAt?: Date | null;
}

/**
 * ProviderAction — canonical unit passed to the caller describing what the
 * customer must do to complete the payment.
 *
 * Typed as a union alias today; will become a discriminated union when more
 * action shapes are added in later phases.
 */
export type ProviderAction = ProviderActionDescriptor;

/**
 * ProviderCapabilities — static description of what a provider implementation
 * supports.  Read by orchestration code to gate feature access without calling
 * provider APIs.
 */
export interface ProviderCapabilities {
  /** Provider exposes a cancel/void API that CreateGatewayPayment can call. */
  canCancel: boolean;
  /** Provider exposes a refund API that RefundPaymentTransaction can call. */
  canRefund: boolean;
  /** Provider sends signed webhook events that HandlePaymentProviderWebhook processes. */
  supportsWebhook: boolean;
  /** Provider supports synchronous polling instead of (or in addition to) webhooks. */
  supportsPolling: boolean;
  /**
   * Dev/test-only: list of scenario names the provider recognises via
   * `input.metadata.scenario`.  Undefined for production providers.
   */
  supportedScenarios?: string[];
}

// ── Core provider input/output types ──────────────────────────────────────────

export interface CreateProviderPaymentInput {
  paymentIntentId: string;
  amount: number;
  currency: string;
  method: PaymentMethod;
  metadata?: Record<string, unknown>;
}

/**
 * CreateProviderPaymentResult — the normalised result of calling a gateway's
 * payment-creation API.
 *
 * Phase 6 shape
 * -------------
 * New fields (preferred):
 *  - `status`              — canonical payment status returned by provider.
 *  - `actions`             — ordered list of customer actions required.
 *  - `expiresAt`           — when the payment attempt expires (null = no expiry).
 *  - `rawProviderResponse` — verbatim provider response for audit storage.
 *
 * Legacy fields (kept for backward compatibility):
 *  - `providerReference`   — unique reference from provider (for webhook matching).
 *  - `providerPaymentUrl`  — redirect URL (populated when status=requires_action + redirect).
 *  - `providerQrString`    — QR payload string (populated when status=requires_action + present_qr).
 *  - `succeededImmediately`— true when `status === 'succeeded'` (convenience alias).
 *  - `failureReason`       — failure message when `status === 'failed'`.
 *
 * Status semantics
 * ----------------
 * - `pending`          — provider accepted the request; payment state unknown.
 *                        No customer action yet determined.  Webhook/poll needed.
 * - `requires_action`  — provider waiting on customer action (see `actions`).
 * - `succeeded`        — provider confirmed payment settled immediately.
 *                        CreateGatewayPayment will apply allocation in same DB tx.
 * - `failed`           — provider rejected the payment immediately.
 *                        CreateGatewayPayment records a failed transaction.
 */
export interface CreateProviderPaymentResult {
  // ── Phase 6: preferred fields ──────────────────────────────────────────────
  /**
   * Canonical status of the payment after the createPayment call.
   * Use this to drive transaction status in CreateGatewayPayment.
   */
  status: 'pending' | 'requires_action' | 'succeeded' | 'failed';
  /**
   * Ordered list of customer actions the UI must present.
   * Empty when status is 'pending', 'succeeded', or 'failed'.
   */
  actions: ProviderAction[];
  /** When this payment attempt expires. Null means no server-imposed expiry. */
  expiresAt?: Date | null;
  /** Verbatim provider response object for audit storage. */
  rawProviderResponse?: Record<string, unknown>;

  // ── Legacy fields — kept for backward compatibility ────────────────────────
  /**
   * Provider-assigned unique reference for webhook matching and lookup.
   * Null for immediate success/failure cases that have no pending state.
   */
  providerReference: string | null;
  /**
   * Redirect URL for browser/webview navigation.
   * Populated when actions contains a `redirect` action.
   * @deprecated Prefer reading from actions[].value
   */
  providerPaymentUrl: string | null;
  /**
   * QR code payload string.
   * Populated when actions contains a `present_qr` action.
   * @deprecated Prefer reading from actions[].value
   */
  providerQrString: string | null;
  /**
   * True when status === 'succeeded' (immediate settlement).
   * @deprecated Prefer checking status === 'succeeded'
   */
  succeededImmediately: boolean;
  /**
   * Human-readable failure reason when status === 'failed'.
   */
  failureReason: string | null;
}

export interface CancelProviderPaymentInput {
  providerReference: string;
  metadata?: Record<string, unknown>;
}

export interface CancelProviderPaymentResult {
  success: boolean;
  failureReason: string | null;
}

export interface RefundProviderPaymentInput {
  providerReference: string;
  amount: number;
  metadata?: Record<string, unknown>;
}

export interface RefundProviderPaymentResult {
  providerReference: string | null;
  success: boolean;
  failureReason: string | null;
}

export interface VerifyWebhookInput {
  rawPayload: string;
  signature: string;
  headers: Record<string, string>;
}

export interface ParseWebhookInput {
  rawPayload: string;
  headers: Record<string, string>;
}

/**
 * The status that the webhook event implies for the associated transaction.
 *
 * - `succeeded`  — transaction should be marked as succeeded; create allocation.
 * - `failed`     — transaction should be marked as failed; no allocation.
 * - `pending`    — event acknowledges a still-pending state; no state mutation.
 * - `ignored`    — event type is recognised but does not affect transaction state
 *                  (e.g. notification-only, expiry, unknown sub-type).
 */
export type WebhookTransactionStatus = 'succeeded' | 'failed' | 'pending' | 'ignored';

/**
 * ParsedProviderWebhook — the normalised result of parsing a raw provider webhook.
 *
 * Phase 3 extensions (added without breaking existing callers):
 *  - `provider`            — echo of the provider code, for traceability in logs.
 *  - `transactionStatus`   — canonical status to apply; preferred over isPaymentSuccess/isPaymentFailure.
 *  - `failureReason`       — optional failure reason from provider payload.
 *  - `metadata`            — optional provider-specific extra fields, kept for auditing.
 *
 * Legacy convenience fields kept for backward compatibility:
 *  - `isPaymentSuccess`    — derived from transactionStatus === 'succeeded'.
 *  - `isPaymentFailure`    — derived from transactionStatus === 'failed'.
 *  - `amount`              — optional amount from provider payload.
 *  - `rawData`             — the full raw payload for audit storage.
 */
export interface ParsedProviderWebhook {
  provider: string;
  providerEventId: string;
  providerReference: string;
  eventType: string;
  transactionStatus: WebhookTransactionStatus;
  failureReason?: string | null;
  metadata?: Record<string, unknown> | null;
  isPaymentSuccess: boolean;
  isPaymentFailure: boolean;
  amount: number | null;
  rawData: Record<string, unknown>;
}

/**
 * PaymentProvider — the interface every gateway adapter must implement.
 *
 * Phase 6 addition: `capabilities` is now a required field.  Existing adapters
 * (ManualProvider, FakeGatewayProvider) have been updated.  Any new adapter
 * must declare its capabilities at construction time.
 */
export interface PaymentProvider {
  providerCode: string;
  /** Static capability declaration — read without calling any provider API. */
  capabilities: ProviderCapabilities;

  createPayment(input: CreateProviderPaymentInput): Promise<CreateProviderPaymentResult>;
  cancelPayment(input: CancelProviderPaymentInput): Promise<CancelProviderPaymentResult>;
  refundPayment(input: RefundProviderPaymentInput): Promise<RefundProviderPaymentResult>;
  verifyWebhook(input: VerifyWebhookInput): Promise<boolean>;
  parseWebhook(input: ParseWebhookInput): Promise<ParsedProviderWebhook>;
}

/**
 * ManualProvider — synchronous provider for cash, card, QRIS manual, e-wallet
 * manual, bank transfer, and other manual collection methods.
 *
 * Transactions succeed immediately — no external gateway or webhook required.
 *
 * Provider-level notes (Phase 4)
 * --------------------------------
 * - `cancelPayment` is NOT supported at provider level. Manual payments do not
 *   go through an external gateway, so void/cancel is handled internally by
 *   VoidPaymentTransaction use case, not by calling a provider API.
 * - `refundPayment` is NOT supported at provider level. Phase 4 refund lifecycle
 *   is internal engine behavior: RefundPaymentTransaction creates an outgoing
 *   refund transaction directly without calling any external provider API.
 *   Real provider refund API calls (Midtrans, Xendit, Stripe) will be added
 *   in a future phase when real gateway integration is implemented.
 * - `verifyWebhook` / `parseWebhook` are unsupported (no external gateway).
 */
export class ManualProvider implements PaymentProvider {
  public readonly providerCode = 'manual';

  /** Phase 6: ManualProvider capabilities declaration. */
  public readonly capabilities: ProviderCapabilities = {
    canCancel: false,
    canRefund: false,
    supportsWebhook: false,
    supportsPolling: false,
  };

  async createPayment(_input: CreateProviderPaymentInput): Promise<CreateProviderPaymentResult> {
    return {
      // Phase 6 fields
      status: 'succeeded',
      actions: [],
      expiresAt: null,
      rawProviderResponse: {},
      // Legacy fields
      providerReference: null,
      providerPaymentUrl: null,
      providerQrString: null,
      succeededImmediately: true,
      failureReason: null,
    };
  }

  /**
   * Cancel/void is not implemented at provider level for manual payments.
   * Phase 4 void is handled internally by VoidPaymentTransaction use case —
   * no external provider API call is required.
   */
  async cancelPayment(_input: CancelProviderPaymentInput): Promise<CancelProviderPaymentResult> {
    return {
      success: false,
      failureReason: 'ManualProvider does not call an external cancel API. Use VoidPaymentTransaction use case instead.',
    };
  }

  /**
   * Refund is not implemented at provider level for manual payments.
   * Phase 4 refund is handled internally by RefundPaymentTransaction use case —
   * no external provider API call is required.
   * Real provider refund API calls will be added in a future phase.
   */
  async refundPayment(_input: RefundProviderPaymentInput): Promise<RefundProviderPaymentResult> {
    return {
      providerReference: null,
      success: false,
      failureReason: 'ManualProvider does not call an external refund API. Use RefundPaymentTransaction use case instead.',
    };
  }

  async verifyWebhook(_input: VerifyWebhookInput): Promise<boolean> {
    return false;
  }

  async parseWebhook(_input: ParseWebhookInput): Promise<ParsedProviderWebhook> {
    throw new Error('ManualProvider does not process webhooks');
  }
}
