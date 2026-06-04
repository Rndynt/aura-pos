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
 * ManualProvider — synchronous provider for cash, card, QRIS manual, ewallet manual, etc.
 * Transactions succeed immediately; no external webhook required.
 */
export class ManualProvider implements PaymentProvider {
  public readonly providerCode = 'manual';

  async createPayment(input: CreateProviderPaymentInput): Promise<CreateProviderPaymentResult> {
    return {
      providerReference: null,
      providerPaymentUrl: null,
      providerQrString: null,
      succeededImmediately: true,
      failureReason: null,
    };
  }

  async cancelPayment(_input: CancelProviderPaymentInput): Promise<CancelProviderPaymentResult> {
    return { success: true, failureReason: null };
  }

  async refundPayment(_input: RefundProviderPaymentInput): Promise<RefundProviderPaymentResult> {
    return { providerReference: null, success: true, failureReason: null };
  }

  async verifyWebhook(_input: VerifyWebhookInput): Promise<boolean> {
    return false;
  }

  async parseWebhook(_input: ParseWebhookInput): Promise<ParsedProviderWebhook> {
    throw new Error('ManualProvider does not process webhooks');
  }
}
