import { Database } from '../../database';
import { BaseRepository, RepositoryError } from '../BaseRepository';
import {
  paymentTransactions,
  type PaymentTransaction,
  type InsertPaymentTransaction,
} from '../../../../shared/schema';
import { and, eq, sql } from 'drizzle-orm';

export interface IPaymentTransactionRepository {
  create(data: InsertPaymentTransaction, tx?: any): Promise<PaymentTransaction>;
  findById(id: string, tenantId: string): Promise<PaymentTransaction | null>;
  findByIntentId(paymentIntentId: string, tenantId: string, tx?: any): Promise<PaymentTransaction[]>;
  findByIdempotencyKey(tenantId: string, idempotencyKey: string, tx?: any): Promise<PaymentTransaction | null>;
  findByProviderReference(provider: string, providerReference: string, tenantId: string, tx?: any): Promise<PaymentTransaction | null>;
  /**
   * Acquire a row-level FOR UPDATE lock on the payment_transaction row identified
   * by (provider, providerReference, tenantId), then return the typed row.
   * Must be called inside an active DB transaction.
   * Returns null if no matching row exists (no lock acquired).
   */
  lockByProviderReferenceForUpdate(provider: string, providerReference: string, tenantId: string, tx: any): Promise<PaymentTransaction | null>;
  update(id: string, tenantId: string, data: Partial<PaymentTransaction>, tx?: any): Promise<PaymentTransaction>;
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

  /**
   * Find a transaction by provider code + providerReference within a tenant.
   * Tenant filtering is mandatory to ensure data isolation.
   */
  async findByProviderReference(
    provider: string,
    providerReference: string,
    tenantId: string,
    tx?: any,
  ): Promise<PaymentTransaction | null> {
    try {
      const client = tx ?? this.db;
      const rows = await client
        .select()
        .from(paymentTransactions)
        .where(
          and(
            eq(paymentTransactions.tenantId, tenantId),
            eq(paymentTransactions.provider, provider),
            eq(paymentTransactions.providerReference, providerReference),
          )
        )
        .limit(1);
      return rows[0] ?? null;
    } catch (error) {
      this.handleError('find by provider reference', error);
    }
  }

  /**
   * Acquire a row-level FOR UPDATE lock on the payment_transaction row, then
   * return the fully-typed Drizzle row (still within the same transaction).
   *
   * Lock ordering: always lock the transaction row BEFORE the intent row to
   * avoid deadlocks with ConfirmFakeGatewayPayment.
   *
   * Returns null if no matching row exists (no lock acquired in that case).
   */
  async lockByProviderReferenceForUpdate(
    provider: string,
    providerReference: string,
    tenantId: string,
    tx: any,
  ): Promise<PaymentTransaction | null> {
    try {
      // Acquire the row-level lock
      await tx.execute(sql`
        SELECT id FROM payment_transactions
        WHERE tenant_id = ${tenantId}
          AND provider = ${provider}
          AND provider_reference = ${providerReference}
        FOR UPDATE
      `);
      // Return typed ORM row (already locked — safe to use within same tx)
      const rows = await tx
        .select()
        .from(paymentTransactions)
        .where(
          and(
            eq(paymentTransactions.tenantId, tenantId),
            eq(paymentTransactions.provider, provider),
            eq(paymentTransactions.providerReference, providerReference),
          ),
        )
        .limit(1);
      return rows[0] ?? null;
    } catch (error) {
      this.handleError('lock by provider reference', error);
    }
  }

  /**
   * Partial update of a transaction row.
   * Tenant filtering is mandatory; throws RepositoryError if row not found.
   */
  async update(
    id: string,
    tenantId: string,
    data: Partial<PaymentTransaction>,
    tx?: any,
  ): Promise<PaymentTransaction> {
    try {
      const client = tx ?? this.db;
      const [result] = await client
        .update(paymentTransactions)
        .set({ ...data, updatedAt: new Date() })
        .where(and(eq(paymentTransactions.id, id), eq(paymentTransactions.tenantId, tenantId)))
        .returning();

      if (!result) {
        throw new RepositoryError('PaymentTransaction not found or access denied', 'NOT_FOUND', null);
      }
      return result;
    } catch (error) {
      if (error instanceof RepositoryError) throw error;
      this.handleError('update', error);
    }
  }
}
