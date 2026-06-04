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

export interface ParsedProviderWebhook {
  providerEventId: string;
  providerReference: string;
  eventType: string;
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
 * Phase 1 limitations
 * -------------------
 * - `cancelPayment` is NOT supported. Returns success:false with an explicit
 *   reason. Void/cancel flow will be implemented in Phase 4.
 * - `refundPayment` is NOT supported. Returns success:false with an explicit
 *   reason. Refund flow (outgoing transactions + status recalculation) will be
 *   implemented in Phase 4.
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
   * Cancel is not implemented for manual payments in Phase 1.
   * Void/cancel support is planned for Phase 4.
   */
  async cancelPayment(_input: CancelProviderPaymentInput): Promise<CancelProviderPaymentResult> {
    return {
      success: false,
      failureReason: 'ManualProvider does not support cancel/void in Phase 1. This will be implemented in Phase 4.',
    };
  }

  /**
   * Refund is not implemented for manual payments in Phase 1.
   * Refund support (outgoing transactions + intent recalculation) is planned for Phase 4.
   */
  async refundPayment(_input: RefundProviderPaymentInput): Promise<RefundProviderPaymentResult> {
    return {
      providerReference: null,
      success: false,
      failureReason: 'ManualProvider does not support refund in Phase 1. This will be implemented in Phase 4.',
    };
  }

  async verifyWebhook(_input: VerifyWebhookInput): Promise<boolean> {
    return false;
  }

  async parseWebhook(_input: ParseWebhookInput): Promise<ParsedProviderWebhook> {
    throw new Error('ManualProvider does not process webhooks');
  }
}
