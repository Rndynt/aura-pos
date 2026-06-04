import { Database } from '../../database';
import { BaseRepository, RepositoryError } from '../BaseRepository';
import {
  paymentTransactions,
  type PaymentTransaction,
  type InsertPaymentTransaction,
} from '../../../../shared/schema';
import { and, eq } from 'drizzle-orm';

export interface IPaymentTransactionRepository {
  create(data: InsertPaymentTransaction, tx?: any): Promise<PaymentTransaction>;
  findById(id: string, tenantId: string): Promise<PaymentTransaction | null>;
  findByIntentId(paymentIntentId: string, tenantId: string, tx?: any): Promise<PaymentTransaction[]>;
  findByIdempotencyKey(tenantId: string, idempotencyKey: string, tx?: any): Promise<PaymentTransaction | null>;
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

  async create(data: InsertPaymentTransaction, tx?: any): Promise<PaymentTransaction> {
    try {
      const client = tx ?? this.db;
      const [result] = await client.insert(paymentTransactions).values(data).returning();
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

  async findByIntentId(paymentIntentId: string, tenantId: string, tx?: any): Promise<PaymentTransaction[]> {
    try {
      const client = tx ?? this.db;
      return await client
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

  async findByIdempotencyKey(tenantId: string, idempotencyKey: string, tx?: any): Promise<PaymentTransaction | null> {
    try {
      const client = tx ?? this.db;
      const rows = await client
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
