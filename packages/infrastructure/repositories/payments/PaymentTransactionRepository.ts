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
  /**
   * Acquire a row-level FOR UPDATE lock on the payment_transaction row identified
   * by (id, tenantId), then return the typed row.
   * Must be called inside an active DB transaction.
   * Returns null if no matching row exists.
   *
   * Phase 4: Used by RefundPaymentTransaction and VoidPaymentTransaction.
   * Lock ordering: always lock the transaction row BEFORE the intent row to
   * prevent deadlocks.
   */
  lockByIdForUpdate(id: string, tenantId: string, tx: any): Promise<PaymentTransaction | null>;
  /**
   * Find a transaction by (provider, providerReference) across ALL tenants.
   *
   * This is used exclusively by webhook handlers that do not know the tenant
   * upfront — the tenantId is resolved from the transaction row itself.
   *
   * Tenant isolation is still enforced by subsequently using the resolved
   * tenantId for all write operations (lockByProviderReferenceForUpdate,
   * update, etc.).
   *
   * Because (provider, provider_reference) is guaranteed unique by a DB index,
   * this will always return at most one row.
   */
  findByProviderReferenceGlobal(provider: string, providerReference: string, tx?: any): Promise<PaymentTransaction | null>;
  update(id: string, tenantId: string, data: Partial<PaymentTransaction>, tx?: any): Promise<PaymentTransaction>;
  /**
   * Phase 4: Sum the amounts of all succeeded outgoing refund transactions
   * where parentTransactionId = the given originalTransactionId.
   * Used to compute refundable remaining before creating a new refund.
   */
  sumRefundedForParent(parentTransactionId: string, tenantId: string, tx?: any): Promise<number>;
  /**
   * Phase 4: Find a refund transaction (direction=outgoing, transactionType=refund)
   * by idempotency key for a given tenant.
   */
  findRefundByIdempotencyKey(tenantId: string, idempotencyKey: string, tx?: any): Promise<PaymentTransaction | null>;
  /**
   * Phase 4: Find all refund transactions linked to a parent transaction.
   */
  findByParentTransactionId(parentTransactionId: string, tenantId: string, tx?: any): Promise<PaymentTransaction[]>;
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
   * Phase 4: Acquire a row-level FOR UPDATE lock on the payment_transaction
   * row identified by (id, tenantId), then return the typed row.
   *
   * Lock ordering (settlement flows):
   *   1. payment_transactions FOR UPDATE  ← this method
   *   2. payment_intents     FOR UPDATE
   *
   * Must be called inside an active DB transaction.
   * Returns null if no matching row found.
   */
  async lockByIdForUpdate(
    id: string,
    tenantId: string,
    tx: any,
  ): Promise<PaymentTransaction | null> {
    try {
      await tx.execute(sql`
        SELECT id FROM payment_transactions
        WHERE id = ${id}
          AND tenant_id = ${tenantId}
        FOR UPDATE
      `);
      const rows = await tx
        .select()
        .from(paymentTransactions)
        .where(
          and(
            eq(paymentTransactions.id, id),
            eq(paymentTransactions.tenantId, tenantId),
          ),
        )
        .limit(1);
      return rows[0] ?? null;
    } catch (error) {
      this.handleError('lock by id', error);
    }
  }

  /**
   * Find a transaction by (provider, providerReference) across ALL tenants.
   * No tenant filter applied — used by webhook handlers to resolve tenantId.
   */
  async findByProviderReferenceGlobal(
    provider: string,
    providerReference: string,
    tx?: any,
  ): Promise<PaymentTransaction | null> {
    try {
      const client = tx ?? this.db;
      const rows = await client
        .select()
        .from(paymentTransactions)
        .where(
          and(
            eq(paymentTransactions.provider, provider),
            eq(paymentTransactions.providerReference, providerReference),
          ),
        )
        .limit(1);
      return rows[0] ?? null;
    } catch (error) {
      this.handleError('find by provider reference (global)', error);
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

  /**
   * Phase 4: Sum the amounts of all succeeded outgoing refund transactions
   * where parentTransactionId matches the given originalTransactionId.
   *
   * Used by RefundPaymentTransaction to compute refundable remaining before
   * inserting a new refund row.
   */
  async sumRefundedForParent(
    parentTransactionId: string,
    tenantId: string,
    tx?: any,
  ): Promise<number> {
    try {
      const client = tx ?? this.db;
      const rows = await client.execute(sql`
        SELECT COALESCE(SUM(amount), 0) AS total
        FROM payment_transactions
        WHERE parent_transaction_id = ${parentTransactionId}
          AND tenant_id = ${tenantId}
          AND direction = 'outgoing'
          AND transaction_type = 'refund'
          AND status = 'succeeded'
      `);
      const total = rows[0]?.total ?? rows?.rows?.[0]?.total ?? 0;
      return typeof total === 'string' ? parseFloat(total) : Number(total);
    } catch (error) {
      this.handleError('sum refunded for parent', error);
    }
  }

  /**
   * Phase 4: Find a refund transaction by idempotency key.
   * Only matches outgoing refund transactions (not incoming payments that happen
   * to share the same idempotency key namespace).
   */
  async findRefundByIdempotencyKey(
    tenantId: string,
    idempotencyKey: string,
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
            eq(paymentTransactions.idempotencyKey, idempotencyKey),
            eq(paymentTransactions.direction, 'outgoing'),
            eq(paymentTransactions.transactionType, 'refund'),
          )
        )
        .limit(1);
      return rows[0] ?? null;
    } catch (error) {
      this.handleError('find refund by idempotency key', error);
    }
  }

  /**
   * Phase 4: Find all transactions that reference a given parent transaction.
   * Used to list all refunds linked to an original payment transaction.
   */
  async findByParentTransactionId(
    parentTransactionId: string,
    tenantId: string,
    tx?: any,
  ): Promise<PaymentTransaction[]> {
    try {
      const client = tx ?? this.db;
      return await client
        .select()
        .from(paymentTransactions)
        .where(
          and(
            eq(paymentTransactions.tenantId, tenantId),
            eq(paymentTransactions.parentTransactionId, parentTransactionId),
          )
        );
    } catch (error) {
      this.handleError('find by parent transaction id', error);
    }
  }
}
