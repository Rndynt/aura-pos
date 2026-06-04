import type { IPaymentIntentRepository } from '@pos/infrastructure/repositories/payments';
import type { CreatePaymentIntentInput, DomainPaymentIntent } from '@pos/domain/payments';
import type { InsertPaymentIntent } from '../../../shared/schema';

export interface CreatePaymentIntentOutput {
  intent: DomainPaymentIntent;
  idempotentReplay: boolean;
}

function toNumber(v: string | number | null | undefined): number {
  return typeof v === 'string' ? parseFloat(v) : (v ?? 0);
}

function rowToDomain(row: any): DomainPaymentIntent {
  return {
    id: row.id,
    tenantId: row.tenantId,
    outletId: row.outletId ?? null,
    payableType: row.payableType,
    payableId: row.payableId,
    currency: row.currency,
    amountDue: toNumber(row.amountDue),
    amountPaid: toNumber(row.amountPaid),
    amountRefunded: toNumber(row.amountRefunded),
    amountRemaining: toNumber(row.amountRemaining),
    status: row.status,
    allowPartial: row.allowPartial,
    expiresAt: row.expiresAt ?? null,
    metadata: row.metadata ?? null,
    idempotencyKey: row.idempotencyKey ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export class CreatePaymentIntent {
  constructor(private readonly intentRepo: IPaymentIntentRepository) {}

  async execute(input: CreatePaymentIntentInput): Promise<CreatePaymentIntentOutput> {
    if (input.amountDue <= 0) {
      throw new Error('amount_due must be greater than zero');
    }

    // Idempotency: return existing intent if key already used for this tenant
    if (input.idempotencyKey) {
      const existing = await this.intentRepo.findByIdempotencyKey(input.tenantId, input.idempotencyKey);
      if (existing) {
        return { intent: rowToDomain(existing), idempotentReplay: true };
      }
    }

    const amountDue = input.amountDue.toFixed(2);
    const data: InsertPaymentIntent = {
      tenantId: input.tenantId,
      outletId: input.outletId ?? null,
      payableType: input.payableType,
      payableId: input.payableId,
      currency: input.currency ?? 'IDR',
      amountDue,
      amountPaid: '0',
      amountRefunded: '0',
      amountRemaining: amountDue,
      status: 'requires_payment',
      allowPartial: input.allowPartial ?? false,
      expiresAt: input.expiresAt ?? null,
      metadata: input.metadata ?? null,
      idempotencyKey: input.idempotencyKey ?? null,
    };

    const created = await this.intentRepo.create(data);
    return { intent: rowToDomain(created), idempotentReplay: false };
  }
}

export { rowToDomain as intentRowToDomain };
