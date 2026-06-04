import type { IPaymentIntentRepository } from '@pos/infrastructure/repositories/payments';
import type { IPaymentTransactionRepository } from '@pos/infrastructure/repositories/payments';
import type { DomainPaymentIntent, DomainPaymentTransaction } from '@pos/domain/payments';
import { PaymentPolicyError } from '@pos/domain/payments';
import { txRowToDomain } from './ListPaymentTransactions';
import { intentRowToDomain } from './CreatePaymentIntent';
import { RecalculatePaymentIntent } from './RecalculatePaymentIntent';

export interface RefundPaymentTransactionInput {
  tenantId: string;
  transactionId: string;
  amount: number;
  reason?: string;
  metadata?: Record<string, unknown>;
  idempotencyKey?: string;
}

export interface RefundPaymentTransactionOutput {
  refundTransaction: DomainPaymentTransaction;
  intent: DomainPaymentIntent;
  /** Refundable amount remaining on the original transaction after this refund */
  refundableRemaining: number;
}

export class RefundPaymentTransaction {
  constructor(
    private readonly db: any,
    private readonly intentRepo: IPaymentIntentRepository,
    private readonly txRepo: IPaymentTransactionRepository,
    private readonly recalculate: RecalculatePaymentIntent,
  ) {}

  async execute(input: RefundPaymentTransactionInput): Promise<RefundPaymentTransactionOutput> {
    const { tenantId, transactionId, amount, reason, metadata, idempotencyKey } = input;

    if (amount <= 0) {
      throw new PaymentPolicyError('Refund amount must be greater than zero', 'INVALID_AMOUNT');
    }

    // ── Idempotency check (outside DB transaction — safe read) ─────────────────
    if (idempotencyKey) {
      const existingRefund = await this.txRepo.findRefundByIdempotencyKey(tenantId, idempotencyKey);
      if (existingRefund) {
        if (existingRefund.parentTransactionId !== transactionId) {
          throw new PaymentPolicyError(
            'Idempotency key is already associated with a different original transaction',
            'IDEMPOTENCY_KEY_CONFLICT',
          );
        }
        // Same key, same original transaction — idempotent replay
        const intentRow = await this.intentRepo.findById(existingRefund.paymentIntentId, tenantId);
        if (!intentRow) {
          throw new PaymentPolicyError('Payment intent not found', 'INTENT_NOT_FOUND');
        }
        const alreadyRefunded = await this.txRepo.sumRefundedForParent(transactionId, tenantId);
        return {
          refundTransaction: txRowToDomain(existingRefund),
          intent: intentRowToDomain(intentRow),
          refundableRemaining: Math.max(0, parseFloat(String((existingRefund as any).amount || 0)) - alreadyRefunded),
        };
      }
    }

    return this.db.transaction(async (tx: any) => {
      // ── Lock original transaction row ──────────────────────────────────────
      const originalTx = await this.txRepo.lockByIdForUpdate(transactionId, tenantId, tx);

      if (!originalTx) {
        throw new PaymentPolicyError(
          'Original transaction not found or access denied',
          'TRANSACTION_NOT_FOUND',
        );
      }

      // ── Validate original transaction state ───────────────────────────────
      if (originalTx.status !== 'succeeded') {
        throw new PaymentPolicyError(
          `Cannot refund transaction with status: ${originalTx.status}. Only succeeded transactions can be refunded.`,
          'INVALID_TRANSACTION_STATUS',
        );
      }

      if (originalTx.direction !== 'incoming') {
        throw new PaymentPolicyError(
          'Cannot refund an outgoing transaction',
          'INVALID_DIRECTION',
        );
      }

      const refundableTypes = new Set(['payment', 'deposit', 'settlement']);
      if (!refundableTypes.has(originalTx.transactionType)) {
        throw new PaymentPolicyError(
          `Cannot refund transaction of type: ${originalTx.transactionType}. Only payment, deposit, and settlement transactions can be refunded.`,
          'INVALID_TRANSACTION_TYPE',
        );
      }

      // ── Lock payment intent row ────────────────────────────────────────────
      const intentRow = await this.intentRepo.lockForUpdate(originalTx.paymentIntentId, tenantId, tx);
      if (!intentRow) {
        throw new PaymentPolicyError('Payment intent not found', 'INTENT_NOT_FOUND');
      }

      // ── Compute refundable remaining ───────────────────────────────────────
      const originalAmount = typeof originalTx.amount === 'string'
        ? parseFloat(originalTx.amount)
        : originalTx.amount;

      const alreadyRefunded = await this.txRepo.sumRefundedForParent(transactionId, tenantId, tx);
      const refundableRemaining = originalAmount - alreadyRefunded;

      if (amount > refundableRemaining + 0.001) {
        throw new PaymentPolicyError(
          `Refund amount (${amount}) exceeds refundable remaining (${refundableRemaining.toFixed(2)})`,
          'AMOUNT_EXCEEDS_REFUNDABLE',
        );
      }

      // ── Create outgoing refund transaction ────────────────────────────────
      const refundMetadata: Record<string, unknown> = { ...(metadata ?? {}) };
      if (reason) {
        refundMetadata.reason = reason;
      }

      const refundRow = await this.txRepo.create({
        tenantId,
        paymentIntentId: originalTx.paymentIntentId,
        parentTransactionId: transactionId,
        direction: 'outgoing',
        transactionType: 'refund',
        method: originalTx.method,
        provider: originalTx.provider,
        status: 'succeeded',
        amount: amount.toFixed(2) as any,
        idempotencyKey: idempotencyKey ?? null,
        metadata: Object.keys(refundMetadata).length > 0 ? refundMetadata : null,
        succeededAt: new Date(),
      }, tx);

      // ── Recalculate intent ────────────────────────────────────────────────
      const { intent } = await this.recalculate.execute({
        tenantId,
        intentId: originalTx.paymentIntentId,
        tx,
      });

      const newRefundableRemaining = Math.max(0, refundableRemaining - amount);

      return {
        refundTransaction: txRowToDomain(refundRow),
        intent,
        refundableRemaining: newRefundableRemaining,
      };
    });
  }
}
