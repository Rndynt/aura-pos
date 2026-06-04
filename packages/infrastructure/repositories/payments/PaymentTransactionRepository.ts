import { Database } from '../../database';
import { BaseRepository, RepositoryError } from '../BaseRepository';
import {
  paymentTransactions,
  type PaymentTransaction,
  type InsertPaymentTransaction,
} from '../../../../shared/schema';
import { and, eq } from 'drizzle-orm';

export interface IPaymentTransactionRepository {
  create(data: InsertPaymentTransaction): Promise<PaymentTransaction>;
  findById(id: string, tenantId: string): Promise<PaymentTransaction | null>;
  findByIntentId(paymentIntentId: string, tenantId: string): Promise<PaymentTransaction[]>;
  findByIdempotencyKey(tenantId: string, idempotencyKey: string): Promise<PaymentTransaction | null>;
}

export class PaymentTransactionRepository
  extends BaseRepository<PaymentTransaction, InsertPaymentTransaction>
  implements IPaymentTransactionRepository
{
  protected table = paymentTransactions;
  protected entityName = 'PaymentTransaction';

  constructor(db: Database) {
    super(db);
  }

  async create(data: InsertPaymentTransaction): Promise<PaymentTransaction> {
    try {
      const [result] = await this.db.insert(paymentTransactions).values(data).returning();
      return result;
    } catch (error) {
      this.handleError('create', error);
    }
  }

  async findById(id: string, tenantId: string): Promise<PaymentTransaction | null> {
    try {
      const rows = await this.db
        .select()
        .from(paymentTransactions)
        .where(and(eq(paymentTransactions.id, id), eq(paymentTransactions.tenantId, tenantId)))
        .limit(1);
      return rows[0] ?? null;
    } catch (error) {
      this.handleError('find', error);
    }
  }

  async findByIntentId(paymentIntentId: string, tenantId: string): Promise<PaymentTransaction[]> {
    try {
      return await this.db
        .select()
        .from(paymentTransactions)
        .where(
          and(
            eq(paymentTransactions.paymentIntentId, paymentIntentId),
            eq(paymentTransactions.tenantId, tenantId)
          )
        );
    } catch (error) {
      this.handleError('find by intent id', error);
    }
  }

  async findByIdempotencyKey(tenantId: string, idempotencyKey: string): Promise<PaymentTransaction | null> {
    try {
      const rows = await this.db
        .select()
        .from(paymentTransactions)
        .where(
          and(
            eq(paymentTransactions.tenantId, tenantId),
            eq(paymentTransactions.idempotencyKey, idempotencyKey)
          )
        )
        .limit(1);
      return rows[0] ?? null;
    } catch (error) {
      this.handleError('find by idempotency key', error);
    }
  }
}
