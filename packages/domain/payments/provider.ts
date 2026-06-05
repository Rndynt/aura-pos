import type { PaymentMethod } from './status';

// ── Phase 6 Hardening: Provider action types ──────────────────────────────────

/**
 * ProviderActionType — the category of customer action required to complete payment.
 *
 * - `redirect_customer` — customer must be redirected to a URL (card 3DS, e-wallet deeplink, hosted checkout)
 * - `present_qr`        — customer scans a QR code displayed in the UI
 * - `display_code`      — customer manually enters a code at a counter/ATM (VA number, retail payment code)
 * - `poll`              — no customer action; caller polls backend for status update
 * - `none`              — no action required (payment settled or failed immediately)
 *
 * `redirect` is a deprecated alias for `redirect_customer` — do not use in new code.
 */
export type ProviderActionType =
  | 'redirect_customer'
  | 'present_qr'
  | 'display_code'
  | 'poll'
  | 'none';

/**
 * ProviderActionDescriptor — machine-readable tag for the *value* inside a `ProviderAction`.
 *
 * Allows UI adapters and integration code to switch on the value kind without
 * parsing `type` and `label` strings:
 *
 * | Descriptor     | Meaning                                     | `type`              |
 * |----------------|---------------------------------------------|---------------------|
 * | `WEB_URL`      | `value` is a full HTTPS URL to open         | `redirect_customer` |
 * | `QR_STRING`    | `value` is a raw QR-code payload to render  | `present_qr`        |
 * | `VA_NUMBER`    | `value` is a numeric virtual account number | `display_code`      |
 * | `PAYMENT_CODE` | `value` is a retail payment code            | `display_code`      |
 * | `NONE`         | no value needed; action is informational    | `poll` / `none`     |
 */
export type ProviderActionDescriptor =
  | 'WEB_URL'
  | 'QR_STRING'
  | 'VA_NUMBER'
  | 'PAYMENT_CODE'
  | 'NONE';

/**
 * ProviderAction — canonical unit describing what the customer must do to
 * complete the payment.  Returned by `createPayment()` in `actions[]`.
 *
 * Fields
 * ------
 * - `type`        — category of action (drive UI widget selection).
 * - `descriptor`  — machine-readable value tag (drive data handling without parsing labels).
 * - `label`       — human-readable label for the action button or widget header.
 * - `value`       — the URL, QR string, VA number, payment code, or null for none/poll.
 * - `expiresAt`   — when this action expires; null if no expiry.
 * - `metadata`    — optional provider-specific extra data for the action.
 */
export interface ProviderAction {
  /** Category of customer action. */
  type: ProviderActionType;
  /** Machine-readable tag for the `value` field — use for switch/dispatch in UI/adapters. */
  descriptor: ProviderActionDescriptor;
  /** Human-readable label (e.g. "Scan QR", "Pay via URL", "Virtual Account Number"). */
  label: string;
  /** The URL, QR payload, VA number, code, or null for none/poll. */
  value?: string | null;
  /** When this action or the overall payment attempt expires. Null = no expiry. */
  expiresAt?: Date | null;
  /** Optional provider-specific metadata for the action (e.g. bank name for VA). */
  metadata?: Record<string, unknown>;
}

/**
 * ProviderCapabilities — static declaration of what a provider implementation supports.
 *
 * Read by orchestration code and the UI to gate feature access without making
 * any provider API call.
 *
 * Phase 6 Hardening additions (all new fields):
 *  - `supportsRedirect`              — provider can return redirect (WEB_URL) actions.
 *  - `supportsQr`                    — provider can return QR string actions.
 *  - `supportsVa`                    — provider can return virtual account display-code actions.
 *  - `supportsPaymentCode`           — provider can return retail payment code actions.
 *  - `supportsPartialRefund`         — provider supports partial refund via its API.
 *  - `supportsMultiplePartialRefund` — provider allows multiple partial refunds per transaction.
 *  - `canReturnImmediateSuccess`     — provider may return `status: 'succeeded'` from createPayment.
 *  - `canReturnImmediateFailure`     — provider may return `status: 'failed'` from createPayment.
 */
export interface ProviderCapabilities {
  // ── Existing fields (Phase 6 original) ───────────────────────────────────
  /** Provider exposes a cancel/void API for gateway-initiated cancellation. */
  canCancel: boolean;
  /** Provider exposes a refund API that a future adapter can call. */
  canRefund: boolean;
  /** Provider sends signed webhook events processed by HandlePaymentProviderWebhook. */
  supportsWebhook: boolean;
  /** Provider supports synchronous polling instead of (or in addition to) webhooks. */
  supportsPolling: boolean;
  /**
   * Dev/test-only: list of scenario names the provider recognises via
   * `input.metadata.scenario`.  Undefined for production providers.
   */
  supportedScenarios?: string[];

  // ── Phase 6 Hardening additions ───────────────────────────────────────────
  /** Provider can present a redirect (WEB_URL) action to the customer. */
  supportsRedirect: boolean;
  /** Provider can present a QRIS/QR-code action to the customer. */
  supportsQr: boolean;
  /** Provider can present a virtual account (VA_NUMBER) action. */
  supportsVa: boolean;
  /** Provider can present a retail payment code (PAYMENT_CODE) action. */
  supportsPaymentCode: boolean;
  /** Provider API supports partial refund (less than the original transaction amount). */
  supportsPartialRefund: boolean;
  /** Provider API supports multiple partial refunds on the same transaction. */
  supportsMultiplePartialRefund: boolean;
  /**
   * Provider may return `status: 'succeeded'` synchronously from `createPayment()`.
   * When true, `CreateGatewayPayment` applies the immediate settlement inline.
   */
  canReturnImmediateSuccess: boolean;
  /**
   * Provider may return `status: 'failed'` synchronously from `createPayment()`.
   * When true, `CreateGatewayPayment` stores a failed transaction.
   */
  canReturnImmediateFailure: boolean;
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
 * Preferred fields (Phase 6):
 *  - `status`              — canonical payment status returned by provider.
 *  - `actions`             — ordered list of customer actions required.
 *  - `expiresAt`           — when the payment attempt expires (null = no expiry).
 *  - `rawProviderResponse` — verbatim provider response for audit storage.
 *
 * Legacy fields (kept for backward compatibility):
 *  - `providerReference`   — unique reference from provider (for webhook matching).
 *  - `providerPaymentUrl`  — redirect URL (populated when actions contain WEB_URL).
 *  - `providerQrString`    — QR payload (populated when actions contain QR_STRING).
 *  - `succeededImmediately`— true when `status === 'succeeded'` (convenience alias).
 *  - `failureReason`       — failure message when `status === 'failed'`.
 *
 * Status semantics
 * ----------------
 * - `pending`          — provider accepted; payment state unknown. Webhook/poll needed.
 * - `requires_action`  — customer action required (see `actions`).
 * - `succeeded`        — provider confirmed immediate settlement.
 *                        CreateGatewayPayment applies allocation inline.
 * - `failed`           — provider rejected immediately. CreateGatewayPayment stores failed tx.
 */
export interface CreateProviderPaymentResult {
  // ── Preferred fields ───────────────────────────────────────────────────────
  status: 'pending' | 'requires_action' | 'succeeded' | 'failed';
  actions: ProviderAction[];
  expiresAt?: Date | null;
  rawProviderResponse?: Record<string, unknown>;

  // ── Legacy fields — kept for backward compatibility ────────────────────────
  providerReference: string | null;
  /** @deprecated Prefer actions[descriptor=WEB_URL].value */
  providerPaymentUrl: string | null;
  /** @deprecated Prefer actions[descriptor=QR_STRING].value */
  providerQrString: string | null;
  /** @deprecated Prefer checking status === 'succeeded' */
  succeededImmediately: boolean;
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
 * - `ignored`    — event type is recognised but does not affect transaction state.
 */
export type WebhookTransactionStatus = 'succeeded' | 'failed' | 'pending' | 'ignored';

/**
 * ParsedProviderWebhook — the normalised result of parsing a raw provider webhook.
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
 * `capabilities` is a required static declaration — read without any API call.
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
 * Provider-level notes
 * --------------------------------
 * - `cancelPayment` / `refundPayment` are NOT supported at provider level.
 *   Internal void/refund lifecycle exists via `VoidPaymentTransaction` and
 *   `RefundPaymentTransaction` use cases (Phase 4). Real provider-level cancel/
 *   refund API calls will be added in a future real-provider adapter phase.
 * - `verifyWebhook` / `parseWebhook` are unsupported (no external gateway).
 */
export class ManualProvider implements PaymentProvider {
  public readonly providerCode = 'manual';

  public readonly capabilities: ProviderCapabilities = {
    // Existing fields
    canCancel: false,
    canRefund: false,
    supportsWebhook: false,
    supportsPolling: false,
    // Phase 6 Hardening additions — ManualProvider has no external gateway features
    supportsRedirect: false,
    supportsQr: false,
    supportsVa: false,
    supportsPaymentCode: false,
    supportsPartialRefund: false,
    supportsMultiplePartialRefund: false,
    // Manual collection succeeds synchronously — no async gateway required
    canReturnImmediateSuccess: true,
    canReturnImmediateFailure: false,
  };

  async createPayment(_input: CreateProviderPaymentInput): Promise<CreateProviderPaymentResult> {
    return {
      status: 'succeeded',
      actions: [],
      expiresAt: null,
      rawProviderResponse: {},
      providerReference: null,
      providerPaymentUrl: null,
      providerQrString: null,
      succeededImmediately: true,
      failureReason: null,
    };
  }

  async cancelPayment(_input: CancelProviderPaymentInput): Promise<CancelProviderPaymentResult> {
    return {
      success: false,
      failureReason:
        'ManualProvider does not call an external cancel API. ' +
        'Use VoidPaymentTransaction use case (Phase 4) instead.',
    };
  }

  async refundPayment(_input: RefundProviderPaymentInput): Promise<RefundProviderPaymentResult> {
    return {
      providerReference: null,
      success: false,
      failureReason:
        'ManualProvider does not call an external refund API. ' +
        'Use RefundPaymentTransaction use case (Phase 4) instead.',
    };
  }

  async verifyWebhook(_input: VerifyWebhookInput): Promise<boolean> {
    return false;
  }

  async parseWebhook(_input: ParseWebhookInput): Promise<ParsedProviderWebhook> {
    throw new Error('ManualProvider does not process webhooks');
  }
}
