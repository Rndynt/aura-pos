/**
 * ExpireStalePaymentTransactions — operations use case for stale standalone payments.
 *
 * Finds expired active intents via `expiresAt`, marks non-terminal pending/requires_action
 * transactions as expired, and then expires the intent when it still has an amount remaining.
 * Merchant safety is preserved by updating each transaction using its own merchantId.
 */

import type {
  PaymentIntentRepository,
  PaymentTransactionRepository,
  StandalonePaymentIntentDTO,
  StandalonePaymentTransactionDTO,
} from '@northflow/payment-orchestration-core';

const TERMINAL_TRANSACTION_STATUSES = new Set([
  'succeeded',
  'failed',
  'cancelled',
  'expired',
  'voided',
  'refunded',
  'reversed',
  'ignored',
]);

const EXPIRABLE_TRANSACTION_STATUSES = new Set(['pending', 'requires_action']);

export interface ExpireStalePaymentTransactionsInput {
  now?: Date;
  limit?: number;
}

export interface ExpiredIntentSummary {
  intentId: string;
  merchantId: string;
  expiredTransactionIds: string[];
  skippedTransactionIds: string[];
  intentStatus: StandalonePaymentIntentDTO['status'];
}

export interface ExpireStalePaymentTransactionsResult {
  expiredIntents: number;
  expiredTransactions: number;
  skippedTransactions: number;
  summaries: ExpiredIntentSummary[];
}

export class ExpireStalePaymentTransactions {
  constructor(
    private readonly intentRepo: PaymentIntentRepository,
    private readonly transactionRepo: PaymentTransactionRepository,
  ) {}

  async execute(input: ExpireStalePaymentTransactionsInput = {}): Promise<ExpireStalePaymentTransactionsResult> {
    const now = input.now ?? new Date();
    const limit = input.limit ?? 100;
    if (!this.intentRepo.findExpiredActive) {
      throw Object.assign(new Error('Payment intent repository does not support stale expiration queries.'), {
        statusCode: 501,
        code: 'OPERATIONS_REPOSITORY_UNSUPPORTED',
      });
    }
    const staleIntents = await this.intentRepo.findExpiredActive({ now, limit });

    let expiredTransactions = 0;
    let skippedTransactions = 0;
    const summaries: ExpiredIntentSummary[] = [];

    for (const intent of staleIntents) {
      const transactions = await this.transactionRepo.findByIntentId(intent.id, intent.merchantId);
      const expiredTransactionIds: string[] = [];
      const skippedTransactionIds: string[] = [];

      for (const transaction of transactions) {
        if (TERMINAL_TRANSACTION_STATUSES.has(transaction.status)) {
          skippedTransactions += 1;
          skippedTransactionIds.push(transaction.id);
          continue;
        }
        if (!EXPIRABLE_TRANSACTION_STATUSES.has(transaction.status)) {
          skippedTransactions += 1;
          skippedTransactionIds.push(transaction.id);
          continue;
        }
        const updated = await this.transactionRepo.updateStatus({
          id: transaction.id,
          merchantId: transaction.merchantId,
          status: 'expired',
          failureReason: 'Payment transaction expired by standalone operations runner.',
        });
        if (updated.status === 'expired') {
          expiredTransactions += 1;
          expiredTransactionIds.push(updated.id);
        }
      }

      const updatedIntent = intent.status === 'expired'
        ? intent
        : await this.intentRepo.updateStatus({
            id: intent.id,
            merchantId: intent.merchantId,
            status: 'expired',
          });

      summaries.push({
        intentId: intent.id,
        merchantId: intent.merchantId,
        expiredTransactionIds,
        skippedTransactionIds,
        intentStatus: updatedIntent.status,
      });
    }

    return {
      expiredIntents: summaries.length,
      expiredTransactions,
      skippedTransactions,
      summaries,
    };
  }
}
