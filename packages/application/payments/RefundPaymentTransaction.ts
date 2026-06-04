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
  /** Refundable amount remaining on the original transaction after this refund. */
  refundableRemaining: number;
}

/**
 * Detect a PostgreSQL unique constraint violation.
 * Drizzle/pg surfaces `code: '23505'` on the error or its `.cause`.
 * We also check the message as a fallback.
 */
function isUniqueConstraintError(err: any): boolean {
  const code: string = err?.code ?? err?.cause?.code ?? '';
  const msg: string = (err?.message ?? err?.cause?.message ?? '').toLowerCase();
  return (
    code === '23505' ||
    msg.includes('unique constraint') ||
    msg.includes('unique violation') ||
    msg.includes('payment_transactions_tenant_idempotency_unique')
  );
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

    return this.db.transaction(async (tx: any) => {
      // ── Step 1: Lock original transaction row first ───────────────────────
      // Lock ordering: payment_transactions FOR UPDATE → payment_intents FOR UPDATE.
      // This must come before the idempotency check to prevent TOCTOU races.
      const originalTx = await this.txRepo.lockByIdForUpdate(transactionId, tenantId, tx);

      if (!originalTx) {
        throw new PaymentPolicyError(
          'Original transaction not found or access denied',
          'TRANSACTION_NOT_FOUND',
        );
      }

      // ── Step 2: Tenant-wide idempotency check INSIDE the transaction ──────
      //
      // Phase 4 Hardening: idempotency keys are scoped tenant-wide per the DB
      // unique index (tenant_id + idempotency_key). Checking only the refund
      // namespace would let an incoming-payment key silently collide with a
      // refund key at DB insert time.  We check the full tenant namespace here,
      // inside the transaction after the row lock, to eliminate any TOCTOU gap.
      if (idempotencyKey) {
        const existingTx = await this.txRepo.findByIdempotencyKey(tenantId, idempotencyKey, tx);

        if (existingTx) {
          const isReplay =
            existingTx.direction === 'outgoing' &&
            existingTx.transactionType === 'refund' &&
            existingTx.parentTransactionId === originalTx.id;

          if (isReplay) {
            // ── Idempotent replay ────────────────────────────────────────
            // Compute correct refundableRemaining from the original amount and
            // total already-refunded for this parent — NOT from existingRefund.amount.
            //
            // Example: original 100k, existing refund 30k, total refunded 30k
            //   → refundableRemaining = 100k - 30k = 70k  (NOT 30k - 30k = 0)
            const originalAmount =
              typeof originalTx.amount === 'string'
                ? parseFloat(originalTx.amount)
                : (originalTx.amount as number);

            const totalRefunded = await this.txRepo.sumRefundedForParent(
              originalTx.id,
              tenantId,
              tx,
            );

            const intentRow = await this.intentRepo.findById(
              existingTx.paymentIntentId,
              tenantId,
              tx,
            );

            return {
              refundTransaction: txRowToDomain(existingTx),
              intent: intentRowToDomain(intentRow!),
              refundableRemaining: Math.max(0, originalAmount - totalRefunded),
            };
          }

          // Key is used by a different transaction or a non-refund type
          throw new PaymentPolicyError(
            'Idempotency key is already associated with a different transaction',
            'IDEMPOTENCY_KEY_CONFLICT',
          );
        }
      }

      // ── Step 3: Validate original transaction state ───────────────────────
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

      // ── Step 4: Lock payment intent row ───────────────────────────────────
      const intentRow = await this.intentRepo.lockForUpdate(
        originalTx.paymentIntentId,
        tenantId,
        tx,
      );
      if (!intentRow) {
        throw new PaymentPolicyError('Payment intent not found', 'INTENT_NOT_FOUND');
      }

      // ── Step 5: Compute refundable remaining ───────────────────────────────
      const originalAmount =
        typeof originalTx.amount === 'string'
          ? parseFloat(originalTx.amount)
          : (originalTx.amount as number);

      const alreadyRefunded = await this.txRepo.sumRefundedForParent(
        transactionId,
        tenantId,
        tx,
      );
      const refundableRemaining = originalAmount - alreadyRefunded;

      if (amount > refundableRemaining + 0.001) {
        throw new PaymentPolicyError(
          `Refund amount (${amount}) exceeds refundable remaining (${refundableRemaining.toFixed(2)})`,
          'AMOUNT_EXCEEDS_REFUNDABLE',
        );
      }

      // ── Step 6: Create outgoing refund transaction ────────────────────────
      // Defensive: if a race slips past our in-transaction idempotency check and
      // the DB unique index fires, catch the error and surface a clean conflict.
      const refundMetadata: Record<string, unknown> = { ...(metadata ?? {}) };
      if (reason) {
        refundMetadata.reason = reason;
      }

      let refundRow: any;
      try {
        refundRow = await this.txRepo.create(
          {
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
          },
          tx,
        );
      } catch (err: any) {
        if (isUniqueConstraintError(err)) {
          throw new PaymentPolicyError(
            'Idempotency key conflict: a concurrent refund was already created with this key',
            'IDEMPOTENCY_KEY_CONFLICT',
          );
        }
        throw err;
      }

      // ── Step 7: Recalculate intent ─────────────────────────────────────────
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
