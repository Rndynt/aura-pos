import type { Database } from '@pos/infrastructure/database';
import type { IPaymentIntentRepository } from '@pos/infrastructure/repositories/payments';
import type { IPaymentTransactionRepository, IPaymentAllocationRepository } from '@pos/infrastructure/repositories/payments';
import type { RecordManualPaymentInput, DomainPaymentIntent, DomainPaymentTransaction } from '@pos/domain/payments';
import {
  assertIntentAcceptsPayment,
  assertAmountValid,
  calculateCashChange,
} from '@pos/domain/payments';
import { RecalculatePaymentIntent } from './RecalculatePaymentIntent';
import { intentRowToDomain } from './CreatePaymentIntent';
import { txRowToDomain } from './ListPaymentTransactions';
import type { InsertPaymentTransaction, InsertPaymentAllocation } from '../../../shared/schema';
import { paymentTransactions, paymentAllocations } from '../../../shared/schema';

export interface RecordManualPaymentOutput {
  intent: DomainPaymentIntent;
  transaction: DomainPaymentTransaction;
  idempotentReplay: boolean;
}

export class RecordManualPayment {
  constructor(
    private readonly db: Database,
    private readonly intentRepo: IPaymentIntentRepository,
    private readonly txRepo: IPaymentTransactionRepository,
    private readonly allocationRepo: IPaymentAllocationRepository,
    private readonly recalculate: RecalculatePaymentIntent
  ) {}

  async execute(input: RecordManualPaymentInput): Promise<RecordManualPaymentOutput> {
    if (input.amount <= 0) {
      throw new Error('Payment amount must be greater than zero');
    }

    // All operations run inside a single DB transaction.
    // If any step fails the whole operation rolls back — no orphaned rows.
    return await this.db.transaction(async (tx) => {
      // Step 1 — Lock the intent row FOR UPDATE to prevent concurrent overpayment.
      const intentRow = await this.intentRepo.lockForUpdate(input.paymentIntentId, input.tenantId, tx);

      if (!intentRow) {
        throw new Error('Payment intent not found or access denied');
      }

      const intentDomain = intentRowToDomain(intentRow);

      // Step 2 — Idempotency check (inside transaction, using same tx client).
      // Must happen BEFORE terminal-state guard: a replayed key should always
      // succeed even if the intent has since moved to a terminal state.
      if (input.idempotencyKey) {
        const existingTx = await this.txRepo.findByIdempotencyKey(input.tenantId, input.idempotencyKey, tx);
        if (existingTx) {
          // Return the current intent state alongside the replayed transaction.
          // Do NOT re-aggregate — the original payment was already recorded.
          return {
            intent: intentDomain,
            transaction: txRowToDomain(existingTx),
            idempotentReplay: true,
          };
        }
      }

      // Step 3 — Validate the intent is in a payable state.
      assertIntentAcceptsPayment(intentDomain);

      // Step 4 — Validate the payment amount against remaining balance + allow_partial.
      assertAmountValid(input.amount, intentDomain.amountRemaining, intentDomain.allowPartial);

      // Step 5 — Cash change calculation / non-cash overpayment guard.
      const changeAmount = calculateCashChange(input.method, input.amount, input.receivedAmount);

      // Step 6 — Insert the succeeded transaction record (within tx).
      const transactionData: InsertPaymentTransaction = {
        tenantId: input.tenantId,
        paymentIntentId: input.paymentIntentId,
        direction: 'incoming',
        transactionType: input.transactionType ?? 'payment',
        method: input.method,
        provider: 'manual',
        status: 'succeeded',
        amount: input.amount.toFixed(2),
        receivedAmount: input.receivedAmount != null ? input.receivedAmount.toFixed(2) : null,
        changeAmount: changeAmount > 0 ? changeAmount.toFixed(2) : null,
        providerReference: input.providerReference ?? null,
        idempotencyKey: input.idempotencyKey ?? null,
        metadata: input.metadata ?? null,
        succeededAt: new Date(),
      };

      const createdTx = await this.txRepo.create(transactionData, tx);

      // Step 7 — Insert the default allocation (intent payable → transaction, within tx).
      const allocationData: InsertPaymentAllocation = {
        tenantId: input.tenantId,
        paymentIntentId: input.paymentIntentId,
        paymentTransactionId: createdTx.id,
        targetType: intentDomain.payableType,
        targetId: intentDomain.payableId,
        amount: input.amount.toFixed(2),
        metadata: null,
      };

      await this.allocationRepo.create(allocationData, tx);

      // Step 8 — Recalculate intent totals and update intent row (within tx).
      // This is now fully atomic: if the update fails the transaction rolls back.
      const { intent: updatedIntent } = await this.recalculate.execute({
        tenantId: input.tenantId,
        intentId: input.paymentIntentId,
        tx,
      });

      return {
        intent: updatedIntent,
        transaction: txRowToDomain(createdTx),
        idempotentReplay: false,
      };
    });
  }
}
