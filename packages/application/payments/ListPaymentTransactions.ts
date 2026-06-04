import type { IPaymentIntentRepository } from '@pos/infrastructure/repositories/payments';
import type { IPaymentTransactionRepository } from '@pos/infrastructure/repositories/payments';
import type { DomainPaymentTransaction } from '@pos/domain/payments';

export interface ListPaymentTransactionsInput {
  tenantId: string;
  intentId: string;
}

export interface ListPaymentTransactionsOutput {
  transactions: DomainPaymentTransaction[];
}

function toNumber(v: string | number | null | undefined): number {
  return typeof v === 'string' ? parseFloat(v) : (v ?? 0);
}

function txRowToDomain(row: any): DomainPaymentTransaction {
  return {
    id: row.id,
    tenantId: row.tenantId,
    paymentIntentId: row.paymentIntentId,
    parentTransactionId: row.parentTransactionId ?? null,
    direction: row.direction,
    transactionType: row.transactionType,
    method: row.method,
    provider: row.provider,
    status: row.status,
    amount: toNumber(row.amount),
    receivedAmount: row.receivedAmount != null ? toNumber(row.receivedAmount) : null,
    changeAmount: row.changeAmount != null ? toNumber(row.changeAmount) : null,
    providerReference: row.providerReference ?? null,
    providerPaymentUrl: row.providerPaymentUrl ?? null,
    providerQrString: row.providerQrString ?? null,
    failureReason: row.failureReason ?? null,
    idempotencyKey: row.idempotencyKey ?? null,
    metadata: row.metadata ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    succeededAt: row.succeededAt ?? null,
    failedAt: row.failedAt ?? null,
    cancelledAt: row.cancelledAt ?? null,
  };
}

export class ListPaymentTransactions {
  constructor(
    private readonly intentRepo: IPaymentIntentRepository,
    private readonly txRepo: IPaymentTransactionRepository
  ) {}

  async execute(input: ListPaymentTransactionsInput): Promise<ListPaymentTransactionsOutput> {
    const intent = await this.intentRepo.findById(input.intentId, input.tenantId);

    if (!intent) {
      throw new Error('Payment intent not found or access denied');
    }

    const rows = await this.txRepo.findByIntentId(input.intentId, input.tenantId);

    return { transactions: rows.map(txRowToDomain) };
  }
}

export { txRowToDomain };
