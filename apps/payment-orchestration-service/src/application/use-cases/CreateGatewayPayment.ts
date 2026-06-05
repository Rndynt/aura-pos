/**
 * CreateGatewayPayment — initiate a payment against a payment intent via a provider.
 *
 * Phase 8D: FakeGateway is the acceptance provider.
 * Xendit remains optional and not required.
 *
 * Rules:
 * - amount must be positive integer.
 * - amount must not exceed intent.amountRemaining (Phase 8D policy: reject overpay).
 * - If provider result is 'succeeded', update intent totals immediately.
 * - If 'requires_action' or 'pending', intent stays at requires_payment.
 */

import { randomUUID } from 'crypto';
import type {
  PaymentMerchantRepository,
  PaymentIntentRepository,
  PaymentTransactionRepository,
} from '@northflow/payment-orchestration-core';
import type {
  StandalonePaymentIntentDTO,
  StandalonePaymentTransactionDTO,
  StandaloneTransactionStatus,
} from '@northflow/payment-orchestration-core';
import type { ProviderRegistry } from '../../infrastructure/providers/providerRegistry.ts';
import { computeIntentStatus } from './intentStatusHelper.ts';

export interface CreateGatewayPaymentInput {
  merchantId: string;
  intentId: string;
  provider: string;
  method: string;
  amount: number;
  providerAccountId?: string | null;
  idempotencyKey?: string | null;
  metadata?: Record<string, unknown> | null;
}

export interface CreateGatewayPaymentOutput {
  transaction: StandalonePaymentTransactionDTO;
  intent: StandalonePaymentIntentDTO;
}

export class CreateGatewayPayment {
  constructor(
    private readonly merchantRepo: PaymentMerchantRepository,
    private readonly intentRepo: PaymentIntentRepository,
    private readonly transactionRepo: PaymentTransactionRepository,
    private readonly providerRegistry: ProviderRegistry,
  ) {}

  async execute(
    input: CreateGatewayPaymentInput,
  ): Promise<CreateGatewayPaymentOutput> {
    if (!input.merchantId || !input.intentId || !input.provider || !input.method) {
      throw Object.assign(
        new Error('merchantId, intentId, provider, and method are required'),
        { statusCode: 400, code: 'VALIDATION_ERROR' },
      );
    }
    if (!Number.isInteger(input.amount) || input.amount <= 0) {
      throw Object.assign(
        new Error('amount must be a positive integer'),
        { statusCode: 400, code: 'VALIDATION_ERROR' },
      );
    }

    const merchant = await this.merchantRepo.findById(input.merchantId);
    if (!merchant) {
      throw Object.assign(
        new Error(`Merchant not found: ${input.merchantId}`),
        { statusCode: 404, code: 'MERCHANT_NOT_FOUND' },
      );
    }

    const intent = await this.intentRepo.findById(input.intentId, input.merchantId);
    if (!intent) {
      throw Object.assign(
        new Error(`Payment intent not found: ${input.intentId}`),
        { statusCode: 404, code: 'INTENT_NOT_FOUND' },
      );
    }

    if (input.amount > intent.amountRemaining) {
      throw Object.assign(
        new Error(
          `Payment amount (${input.amount}) exceeds remaining amount (${intent.amountRemaining}). ` +
            'Overpayment is not allowed.',
        ),
        { statusCode: 422, code: 'OVERPAYMENT_REJECTED' },
      );
    }

    const provider = this.providerRegistry.get(input.provider);
    if (!provider) {
      throw Object.assign(
        new Error(`Provider not available: ${input.provider}`),
        { statusCode: 422, code: 'PROVIDER_NOT_AVAILABLE' },
      );
    }

    const providerResult = await provider.createPayment({
      intentId: intent.id,
      amount: input.amount,
      currency: intent.currency,
      method: input.method,
      metadata: input.metadata,
    });

    const txId = `tx_${randomUUID()}`;
    const txStatus = providerResult.status as StandaloneTransactionStatus;

    const transaction = await this.transactionRepo.create({
      id: txId,
      merchantId: input.merchantId,
      intentId: intent.id,
      providerAccountId: input.providerAccountId ?? null,
      provider: input.provider,
      method: input.method,
      transactionType: 'payment',
      direction: 'incoming',
      status: txStatus,
      amount: input.amount,
      currency: intent.currency,
      providerReference: providerResult.providerReference,
      providerPaymentUrl: providerResult.providerPaymentUrl,
      providerQrString: providerResult.providerQrString,
      failureReason: providerResult.failureReason,
      idempotencyKey: input.idempotencyKey ?? null,
      rawProviderResponse: providerResult.rawProviderResponse,
      metadata: input.metadata ?? null,
    });

    let updatedIntent = intent;

    if (txStatus === 'succeeded') {
      const newAmountPaid = intent.amountPaid + input.amount;
      const newAmountRemaining = Math.max(0, intent.amountDue - newAmountPaid);
      const newStatus = computeIntentStatus(
        intent.amountDue,
        newAmountPaid,
      );

      updatedIntent = await this.intentRepo.updateTotals({
        id: intent.id,
        merchantId: input.merchantId,
        amountPaid: newAmountPaid,
        amountRefunded: intent.amountRefunded,
        amountRemaining: newAmountRemaining,
      });

      updatedIntent = await this.intentRepo.updateStatus({
        id: intent.id,
        merchantId: input.merchantId,
        status: newStatus,
      });
    }

    return { transaction, intent: updatedIntent };
  }
}
