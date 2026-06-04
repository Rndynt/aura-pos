import type { Database } from '@pos/infrastructure/database';
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
import { sql } from 'drizzle-orm';
import type { InsertPaymentTransaction, InsertPaymentAllocation } from '../../../shared/schema';

export interface RecordManualPaymentOutput {
  intent: DomainPaymentIntent;
  transaction: DomainPaymentTransaction;
  idempotentReplay: boolean;
}

export class RecordManualPayment {
  constructor(
    private readonly db: Database,
    private readonly txRepo: IPaymentTransactionRepository,
    private readonly allocationRepo: IPaymentAllocationRepository,
    private readonly recalculate: RecalculatePaymentIntent
  ) {}

  async execute(input: RecordManualPaymentInput): Promise<RecordManualPaymentOutput> {
    if (input.amount <= 0) {
      throw new Error('Payment amount must be greater than zero');
    }

    const result = await this.db.transaction(async (tx) => {
      // 1. Lock the intent row FOR UPDATE before calculating remaining balance
      const rows = await tx.execute(sql`
        SELECT * FROM payment_intents
        WHERE id = ${input.paymentIntentId} AND tenant_id = ${input.tenantId}
        FOR UPDATE
      `);

      const lockedRow = (rows as any).rows?.[0] ?? (rows as any)[0] ?? null;

      if (!lockedRow) {
        throw new Error('Payment intent not found or access denied');
      }

      // Map snake_case DB row to camelCase domain intent
      const intentDomain: DomainPaymentIntent = intentRowToDomain({
        id: lockedRow.id,
        tenantId: lockedRow.tenant_id,
        outletId: lockedRow.outlet_id ?? null,
        payableType: lockedRow.payable_type,
        payableId: lockedRow.payable_id,
        currency: lockedRow.currency,
        amountDue: lockedRow.amount_due,
        amountPaid: lockedRow.amount_paid,
        amountRefunded: lockedRow.amount_refunded,
        amountRemaining: lockedRow.amount_remaining,
        status: lockedRow.status,
        allowPartial: lockedRow.allow_partial,
        expiresAt: lockedRow.expires_at ?? null,
        metadata: lockedRow.metadata ?? null,
        idempotencyKey: lockedRow.idempotency_key ?? null,
        createdAt: lockedRow.created_at,
        updatedAt: lockedRow.updated_at,
      });

      // 2. Validate intent is in a payable state
      assertIntentAcceptsPayment(intentDomain);

      // 3. Idempotency: replay existing transaction for same tenant + key
      if (input.idempotencyKey) {
        const existingTx = await this.txRepo.findByIdempotencyKey(input.tenantId, input.idempotencyKey);
        if (existingTx) {
          return {
            intentDomain,
            txDomain: txRowToDomain(existingTx),
            idempotentReplay: true,
          };
        }
      }

      // 4. Validate amount against remaining balance and allow_partial setting
      assertAmountValid(input.amount, intentDomain.amountRemaining, intentDomain.allowPartial);

      // 5. Cash change calculation / non-cash overpayment guard
      const changeAmount = calculateCashChange(input.method, input.amount, input.receivedAmount);

      // 6. Insert the succeeded transaction
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

      const [createdTx] = await tx.insert(
        (await import('../../../shared/schema')).paymentTransactions
      ).values(transactionData).returning();

      // 7. Insert default allocation to the intent payable target
      const allocationData: InsertPaymentAllocation = {
        tenantId: input.tenantId,
        paymentIntentId: input.paymentIntentId,
        paymentTransactionId: createdTx.id,
        targetType: intentDomain.payableType,
        targetId: intentDomain.payableId,
        amount: input.amount.toFixed(2),
        metadata: null,
      };

      await tx.insert(
        (await import('../../../shared/schema')).paymentAllocations
      ).values(allocationData);

      return {
        intentDomain,
        txDomain: txRowToDomain(createdTx),
        idempotentReplay: false,
      };
    });

    // 8. Recalculate intent totals after transaction commit
    const { intent: updatedIntent } = await this.recalculate.execute({
      tenantId: input.tenantId,
      intentId: input.paymentIntentId,
    });

    return {
      intent: updatedIntent,
      transaction: result.txDomain,
      idempotentReplay: result.idempotentReplay,
    };
  }
}
