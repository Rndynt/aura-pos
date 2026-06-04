import type { IPaymentIntentRepository } from '@pos/infrastructure/repositories/payments';
import type { IPaymentTransactionRepository } from '@pos/infrastructure/repositories/payments';
import type { DomainPaymentIntent } from '@pos/domain/payments';
import { aggregateTransactionTotals, calculateIntentStatus } from '@pos/domain/payments';
import { intentRowToDomain } from './CreatePaymentIntent';
import { txRowToDomain } from './ListPaymentTransactions';

export interface RecalculatePaymentIntentInput {
  tenantId: string;
  intentId: string;
  /** Optional transaction client — pass when called inside a db.transaction() to keep everything atomic */
  tx?: any;
}

export interface RecalculatePaymentIntentOutput {
  intent: DomainPaymentIntent;
}

export class RecalculatePaymentIntent {
  constructor(
    private readonly intentRepo: IPaymentIntentRepository,
    private readonly txRepo: IPaymentTransactionRepository
  ) {}

  async execute(input: RecalculatePaymentIntentInput): Promise<RecalculatePaymentIntentOutput> {
    const intentRow = await this.intentRepo.findById(input.intentId, input.tenantId, input.tx);

    if (!intentRow) {
      throw new Error('Payment intent not found or access denied');
    }

    const txRows = await this.txRepo.findByIntentId(input.intentId, input.tenantId, input.tx);
    const transactions = txRows.map(txRowToDomain);

    const { amountPaid, amountRefunded } = aggregateTransactionTotals(transactions);
    const amountDue = typeof intentRow.amountDue === 'string' ? parseFloat(intentRow.amountDue) : intentRow.amountDue;

    // amountRemaining = amountDue - netPaid, where netPaid = amountPaid - amountRefunded.
    // After a full refund this equals amountDue (not zero) — intentional per Phase 4 spec.
    const amountRemaining = Math.max(0, amountDue - amountPaid + amountRefunded);
    const status = calculateIntentStatus(amountDue, amountPaid, amountRefunded, amountRemaining);

    const updated = await this.intentRepo.update(input.intentId, input.tenantId, {
      amountPaid: amountPaid.toFixed(2) as any,
      amountRefunded: amountRefunded.toFixed(2) as any,
      amountRemaining: amountRemaining.toFixed(2) as any,
      status,
    }, input.tx);

    return { intent: intentRowToDomain(updated) };
  }
}
