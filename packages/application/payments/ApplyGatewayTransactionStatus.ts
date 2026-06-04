import type {
  IPaymentIntentRepository,
  IPaymentTransactionRepository,
  IPaymentAllocationRepository,
} from '@pos/infrastructure/repositories/payments';
import type { DomainPaymentIntent, DomainPaymentTransaction } from '@pos/domain/payments';
import { PaymentPolicyError } from '@pos/domain/payments';
import { intentRowToDomain } from './CreatePaymentIntent';
import { txRowToDomain } from './ListPaymentTransactions';
import { RecalculatePaymentIntent } from './RecalculatePaymentIntent';
import type { InsertPaymentAllocation } from '../../../shared/schema';

/**
 * The result of applying a gateway transaction status.
 *
 * - `succeeded`        — tx updated to succeeded, allocation created, intent recalculated.
 * - `failed`           — tx updated to failed, no allocation, intent not recalculated.
 * - `already_terminal` — tx was already in a terminal state (succeeded/failed/cancelled/voided).
 *                        The caller decides whether to throw or mark as ignored.
 * - `not_found`        — no transaction found for (provider, providerReference, tenantId).
 */
export type ApplyGatewayStatusOutcome =
  | { outcome: 'succeeded'; intent: DomainPaymentIntent; transaction: DomainPaymentTransaction }
  | { outcome: 'failed'; intent: DomainPaymentIntent; transaction: DomainPaymentTransaction }
  | {
      outcome: 'already_terminal';
      currentStatus: string;
      intent: DomainPaymentIntent;
      transaction: DomainPaymentTransaction;
    }
  | { outcome: 'not_found' };

export interface ApplyGatewayTransactionStatusInput {
  tenantId: string;
  provider: string;
  providerReference: string;
  status: 'succeeded' | 'failed';
  failureReason?: string | null;
  allocationMetadata?: Record<string, unknown> | null;
}

/**
 * ApplyGatewayTransactionStatus — shared application helper.
 *
 * Encapsulates the atomic transaction-status-mutation logic used by both:
 *  - `ConfirmFakeGatewayPayment` (dev/test controlled confirmation endpoint)
 *  - `HandlePaymentProviderWebhook`  (generic webhook handler)
 *
 * Responsibilities
 * ----------------
 * 1. Acquire a row-level FOR UPDATE lock on the payment_transaction row identified
 *    by (provider, providerReference, tenantId).
 * 2. Return `not_found` if no matching row exists.
 * 3. Return `already_terminal` if the row is already in a terminal state
 *    (succeeded, failed, cancelled, voided, refunded).  The caller decides what
 *    to do (throw INVALID_TRANSITION vs. mark event as ignored).
 * 4. Acquire a row-level FOR UPDATE lock on the payment_intent row.
 * 5. Update the transaction to succeeded or failed atomically.
 * 6. For succeeded: create one payment allocation (unique constraint prevents duplicates).
 * 7. For succeeded: recalculate intent totals (amountPaid, amountRemaining, status).
 * 8. Return the updated intent and transaction.
 *
 * Locking order
 * -------------
 * Settlement flows ALWAYS lock payment_transactions BEFORE payment_intents.
 *
 * Note: CreateGatewayPayment is NOT a settlement flow — it only creates a
 * pending transaction and only locks the payment_intent row (no existing
 * transaction row to lock yet). It does NOT follow the tx-row → intent-row
 * order because there is no tx row at that point.
 *
 * All flows that mutate an existing transaction row (settlement, webhook,
 * confirmation) MUST acquire locks in this order to prevent deadlocks:
 *   1. payment_transactions FOR UPDATE (by providerReference + tenantId)
 *   2. payment_intents FOR UPDATE (by paymentIntentId + tenantId)
 *
 * This helper MUST be called inside an active db.transaction() — the `tx` argument
 * must be the active Drizzle transaction client.  It does NOT create its own
 * top-level transaction.
 */
export class ApplyGatewayTransactionStatus {
  constructor(
    private readonly intentRepo: IPaymentIntentRepository,
    private readonly txRepo: IPaymentTransactionRepository,
    private readonly allocationRepo: IPaymentAllocationRepository,
    private readonly recalculate: RecalculatePaymentIntent,
  ) {}

  async execute(
    input: ApplyGatewayTransactionStatusInput,
    tx: any,
  ): Promise<ApplyGatewayStatusOutcome> {
    // Step 1 — Acquire FOR UPDATE lock on the transaction row.
    // This prevents two concurrent requests from both seeing 'pending' and
    // proceeding to create duplicate allocations.
    const txRow = await this.txRepo.lockByProviderReferenceForUpdate(
      input.provider,
      input.providerReference,
      input.tenantId,
      tx,
    );

    if (!txRow) {
      return { outcome: 'not_found' };
    }

    // Step 2 — Check whether the transaction is already in a terminal state.
    // Since we hold the FOR UPDATE lock, this status is authoritative.
    const activeStatuses = new Set(['pending', 'requires_action']);
    if (!activeStatuses.has(txRow.status)) {
      // Resolve the intent for the caller (read-only, no lock needed here — intent
      // status cannot change without also mutating the transaction).
      const intentRow = await this.intentRepo.findById(txRow.paymentIntentId, input.tenantId, tx);
      return {
        outcome: 'already_terminal',
        currentStatus: txRow.status,
        intent: intentRow ? intentRowToDomain(intentRow) : ({} as DomainPaymentIntent),
        transaction: txRowToDomain(txRow),
      };
    }

    // Step 3 — Acquire FOR UPDATE lock on the intent row.
    // Lock order: transaction row → intent row (consistent across all use cases).
    const intentRow = await this.intentRepo.lockForUpdate(
      txRow.paymentIntentId,
      input.tenantId,
      tx,
    );

    if (!intentRow) {
      throw new PaymentPolicyError(
        'Payment intent not found or access denied',
        'INTENT_NOT_FOUND',
      );
    }

    const intentDomain = intentRowToDomain(intentRow);

    if (input.status === 'succeeded') {
      // Step 4a — Update transaction to succeeded.
      const updatedTxRow = await this.txRepo.update(
        txRow.id,
        input.tenantId,
        {
          status: 'succeeded',
          succeededAt: new Date(),
          updatedAt: new Date(),
        },
        tx,
      );

      // Step 4b — Create the default allocation from this transaction to the
      // intent's payable target.  The unique index
      // payment_allocations_tx_target_unique on (payment_transaction_id,
      // target_type, target_id) acts as a schema-level safety net against
      // duplicate allocations from concurrent requests.
      const txAmount =
        typeof txRow.amount === 'string' ? parseFloat(txRow.amount) : Number(txRow.amount);

      const allocationData: InsertPaymentAllocation = {
        tenantId: input.tenantId,
        paymentIntentId: txRow.paymentIntentId,
        paymentTransactionId: txRow.id,
        targetType: intentDomain.payableType,
        targetId: intentDomain.payableId,
        amount: txAmount.toFixed(2),
        metadata: input.allocationMetadata ?? null,
      };
      await this.allocationRepo.create(allocationData, tx);

      // Step 4c — Recalculate intent totals (amountPaid, amountRemaining, status).
      const { intent: updatedIntent } = await this.recalculate.execute({
        tenantId: input.tenantId,
        intentId: txRow.paymentIntentId,
        tx,
      });

      return {
        outcome: 'succeeded',
        intent: updatedIntent,
        transaction: txRowToDomain(updatedTxRow),
      };
    } else {
      // status === 'failed'
      // Step 4a — Update transaction to failed.
      const updatedTxRow = await this.txRepo.update(
        txRow.id,
        input.tenantId,
        {
          status: 'failed',
          failedAt: new Date(),
          failureReason: input.failureReason ?? 'Payment failed',
          updatedAt: new Date(),
        },
        tx,
      );

      // No allocation created for failed transactions.
      // No recalculate needed — failed tx does not change amountPaid.
      return {
        outcome: 'failed',
        intent: intentDomain,
        transaction: txRowToDomain(updatedTxRow),
      };
    }
  }
}
