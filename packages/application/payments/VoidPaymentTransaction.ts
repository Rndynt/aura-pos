import type { IPaymentIntentRepository } from '@pos/infrastructure/repositories/payments';
import type { IPaymentTransactionRepository } from '@pos/infrastructure/repositories/payments';
import type { DomainPaymentIntent, DomainPaymentTransaction } from '@pos/domain/payments';
import { PaymentPolicyError } from '@pos/domain/payments';
import { txRowToDomain } from './ListPaymentTransactions';
import { intentRowToDomain } from './CreatePaymentIntent';

export interface VoidPaymentTransactionInput {
  tenantId: string;
  transactionId: string;
  reason?: string;
  metadata?: Record<string, unknown>;
  idempotencyKey?: string;
}

export interface VoidPaymentTransactionOutput {
  transaction: DomainPaymentTransaction;
  intent: DomainPaymentIntent;
}

/**
 * VoidPaymentTransaction — Phase 4
 *
 * Voids a pending or requires_action transaction.
 * Does NOT create outgoing money movement, does NOT change amountPaid, does NOT create allocation.
 * The transaction's status is updated to 'voided' and cancelledAt is set.
 *
 * Idempotency policy:
 *   - An already-voided transaction with a matching idempotency key returns success.
 *   - An already-voided transaction without a matching idempotency key is rejected with INVALID_TRANSITION.
 */
export class VoidPaymentTransaction {
  constructor(
    private readonly db: any,
    private readonly intentRepo: IPaymentIntentRepository,
    private readonly txRepo: IPaymentTransactionRepository,
  ) {}

  async execute(input: VoidPaymentTransactionInput): Promise<VoidPaymentTransactionOutput> {
    const { tenantId, transactionId, reason, metadata, idempotencyKey } = input;

    return this.db.transaction(async (tx: any) => {
      // ── Lock transaction row ───────────────────────────────────────────────
      const originalTx = await this.txRepo.lockByIdForUpdate(transactionId, tenantId, tx);

      if (!originalTx) {
        throw new PaymentPolicyError(
          'Transaction not found or access denied',
          'TRANSACTION_NOT_FOUND',
        );
      }

      // ── Idempotency: already voided ───────────────────────────────────────
      if (originalTx.status === 'voided') {
        if (idempotencyKey && originalTx.idempotencyKey === idempotencyKey) {
          // Same key, already voided — idempotent success
          const intentRow = await this.intentRepo.findById(originalTx.paymentIntentId, tenantId, tx);
          return {
            transaction: txRowToDomain(originalTx),
            intent: intentRowToDomain(intentRow!),
          };
        }
        throw new PaymentPolicyError(
          'Transaction has already been voided',
          'INVALID_TRANSITION',
        );
      }

      // ── Reject non-voidable statuses ──────────────────────────────────────
      if (originalTx.status === 'succeeded') {
        throw new PaymentPolicyError(
          'Succeeded transactions must be refunded, not voided',
          'INVALID_TRANSITION',
        );
      }

      const terminalStatuses = new Set(['failed', 'cancelled', 'refunded']);
      if (terminalStatuses.has(originalTx.status)) {
        throw new PaymentPolicyError(
          `Cannot void a transaction with status: ${originalTx.status}`,
          'INVALID_TRANSITION',
        );
      }

      // ── Allowed statuses: pending, requires_action ────────────────────────
      const allowedStatuses = new Set(['pending', 'requires_action']);
      if (!allowedStatuses.has(originalTx.status)) {
        throw new PaymentPolicyError(
          `Cannot void transaction with status: ${originalTx.status}. Only pending or requires_action transactions can be voided.`,
          'INVALID_TRANSITION',
        );
      }

      // ── Lock payment intent row ────────────────────────────────────────────
      const intentRow = await this.intentRepo.lockForUpdate(originalTx.paymentIntentId, tenantId, tx);
      if (!intentRow) {
        throw new PaymentPolicyError('Payment intent not found', 'INTENT_NOT_FOUND');
      }

      // ── Update transaction to voided ───────────────────────────────────────
      const voidMetadata: Record<string, unknown> = {
        ...(originalTx.metadata as Record<string, unknown> ?? {}),
        ...(metadata ?? {}),
      };
      if (reason) {
        voidMetadata.voidReason = reason;
      }

      const updatedTx = await this.txRepo.update(transactionId, tenantId, {
        status: 'voided',
        cancelledAt: new Date(),
        metadata: Object.keys(voidMetadata).length > 0 ? voidMetadata : originalTx.metadata,
      }, tx);

      // ── Pending/voided transactions do not affect amountPaid ─────────────
      // No recalculation needed — pending transactions were never counted in
      // aggregateTransactionTotals (only succeeded transactions count).
      // Return the current intent state without mutation.

      return {
        transaction: txRowToDomain(updatedTx),
        intent: intentRowToDomain(intentRow),
      };
    });
  }
}
