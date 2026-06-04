import { Database } from '../../database';
import { BaseRepository, RepositoryError } from '../BaseRepository';
import {
  paymentIntents,
  type PaymentIntent,
  type InsertPaymentIntent,
} from '../../../../shared/schema';
import { and, eq, sql } from 'drizzle-orm';

export interface IPaymentIntentRepository {
  create(data: InsertPaymentIntent): Promise<PaymentIntent>;
  findById(id: string, tenantId: string): Promise<PaymentIntent | null>;
  findByIdempotencyKey(tenantId: string, idempotencyKey: string): Promise<PaymentIntent | null>;
  lockForUpdate(id: string, tenantId: string, tx: any): Promise<PaymentIntent | null>;
  update(id: string, tenantId: string, data: Partial<PaymentIntent>): Promise<PaymentIntent>;
}

export class PaymentIntentRepository
  extends BaseRepository<PaymentIntent, InsertPaymentIntent>
  implements IPaymentIntentRepository
{
  protected table = paymentIntents;
  protected entityName = 'PaymentIntent';

  constructor(db: Database) {
    super(db);
  }

  async create(data: InsertPaymentIntent): Promise<PaymentIntent> {
    try {
      const [result] = await this.db.insert(paymentIntents).values(data).returning();
      return result;
    } catch (error) {
      this.handleError('create', error);
    }
  }

  async findById(id: string, tenantId: string): Promise<PaymentIntent | null> {
    try {
      const rows = await this.db
        .select()
        .from(paymentIntents)
        .where(and(eq(paymentIntents.id, id), eq(paymentIntents.tenantId, tenantId)))
        .limit(1);
      return rows[0] ?? null;
    } catch (error) {
      this.handleError('find', error);
    }
  }

  async findByIdempotencyKey(tenantId: string, idempotencyKey: string): Promise<PaymentIntent | null> {
    try {
      const rows = await this.db
        .select()
        .from(paymentIntents)
        .where(
          and(
            eq(paymentIntents.tenantId, tenantId),
            eq(paymentIntents.idempotencyKey, idempotencyKey)
          )
        )
        .limit(1);
      return rows[0] ?? null;
    } catch (error) {
      this.handleError('find by idempotency key', error);
    }
  }

  /**
   * Lock the intent row FOR UPDATE inside a transaction to prevent concurrent payment race.
   */
  async lockForUpdate(id: string, tenantId: string, tx: any): Promise<PaymentIntent | null> {
    try {
      const rows = await tx.execute(sql`
        SELECT * FROM payment_intents
        WHERE id = ${id} AND tenant_id = ${tenantId}
        FOR UPDATE
      `);
      const row = (rows as any).rows?.[0] ?? (rows as any)[0] ?? null;
      return row ?? null;
    } catch (error) {
      this.handleError('lock', error);
    }
  }

  async update(id: string, tenantId: string, data: Partial<PaymentIntent>): Promise<PaymentIntent> {
    try {
      const [result] = await this.db
        .update(paymentIntents)
        .set({ ...data, updatedAt: new Date() })
        .where(and(eq(paymentIntents.id, id), eq(paymentIntents.tenantId, tenantId)))
        .returning();

      if (!result) {
        throw new RepositoryError('PaymentIntent not found or access denied', 'NOT_FOUND', null);
      }
      return result;
    } catch (error) {
      if (error instanceof RepositoryError) throw error;
      this.handleError('update', error);
    }
  }
}
