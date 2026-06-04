import type { PaymentMethod } from './status';

export interface CreateProviderPaymentInput {
  paymentIntentId: string;
  amount: number;
  currency: string;
  method: PaymentMethod;
  metadata?: Record<string, unknown>;
}

export interface CreateProviderPaymentResult {
  providerReference: string | null;
  providerPaymentUrl: string | null;
  providerQrString: string | null;
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

export interface PaymentProvider {
  providerCode: string;

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

  async createPayment(_input: CreateProviderPaymentInput): Promise<CreateProviderPaymentResult> {
    return {
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
