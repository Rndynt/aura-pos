import { Database } from '../../database';
import { BaseRepository } from '../BaseRepository';
import {
  paymentAllocations,
  type PaymentAllocation,
  type InsertPaymentAllocation,
} from '../../../../shared/schema';
import { and, eq } from 'drizzle-orm';

export interface IPaymentAllocationRepository {
  create(data: InsertPaymentAllocation): Promise<PaymentAllocation>;
  findByIntentId(paymentIntentId: string, tenantId: string): Promise<PaymentAllocation[]>;
  findByTransactionId(paymentTransactionId: string, tenantId: string): Promise<PaymentAllocation[]>;
}

export class PaymentAllocationRepository
  extends BaseRepository<PaymentAllocation, InsertPaymentAllocation>
  implements IPaymentAllocationRepository
{
  protected table = paymentAllocations;
  protected entityName = 'PaymentAllocation';

  constructor(db: Database) {
    super(db);
  }

  async create(data: InsertPaymentAllocation): Promise<PaymentAllocation> {
    try {
      const [result] = await this.db.insert(paymentAllocations).values(data).returning();
      return result;
    } catch (error) {
      this.handleError('create', error);
    }
  }

  async findByIntentId(paymentIntentId: string, tenantId: string): Promise<PaymentAllocation[]> {
    try {
      return await this.db
        .select()
        .from(paymentAllocations)
        .where(
          and(
            eq(paymentAllocations.paymentIntentId, paymentIntentId),
            eq(paymentAllocations.tenantId, tenantId)
          )
        );
    } catch (error) {
      this.handleError('find by intent id', error);
    }
  }

  async findByTransactionId(paymentTransactionId: string, tenantId: string): Promise<PaymentAllocation[]> {
    try {
      return await this.db
        .select()
        .from(paymentAllocations)
        .where(
          and(
            eq(paymentAllocations.paymentTransactionId, paymentTransactionId),
            eq(paymentAllocations.tenantId, tenantId)
          )
        );
    } catch (error) {
      this.handleError('find by transaction id', error);
    }
  }
}
