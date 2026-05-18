/**
 * Order Payment Repository
 * Handles order payment CRUD operations with tenant isolation through parent orders
 */

import { Database } from '../../database';
import { BaseRepository, RepositoryError } from '../BaseRepository';
import {
  orders,
  orderPayments,
  type OrderPayment,
  type InsertOrderPayment,
} from '../../../../shared/schema';
import { and, eq } from 'drizzle-orm';

export interface IOrderPaymentRepository {
  findByOrder(orderId: string, tenantId: string): Promise<OrderPayment[]>;
  create(payment: InsertOrderPayment, tenantId: string): Promise<OrderPayment>;
}

export class OrderPaymentRepository
  extends BaseRepository<OrderPayment, InsertOrderPayment>
  implements IOrderPaymentRepository
{
  protected table = orderPayments;
  protected entityName = 'OrderPayment';

  constructor(db: Database) {
    super(db);
  }

  private async ensureOrderBelongsToTenant(orderId: string, tenantId: string): Promise<void> {
    const result = await this.db
      .select({ id: orders.id })
      .from(orders)
      .where(and(eq(orders.id, orderId), eq(orders.tenantId, tenantId)))
      .limit(1);

    if (!result[0]) {
      throw new RepositoryError('Order not found or access denied', 'NOT_FOUND', null);
    }
  }

  /**
   * Find all payments for an order after validating parent order tenant access.
   */
  async findByOrder(orderId: string, tenantId: string): Promise<OrderPayment[]> {
    try {
      await this.ensureOrderBelongsToTenant(orderId, tenantId);

      return await this.db
        .select()
        .from(orderPayments)
        .where(eq(orderPayments.orderId, orderId));
    } catch (error) {
      if (error instanceof RepositoryError) throw error;
      this.handleError('find order payments', error);
    }
  }

  /**
   * Create a new payment after validating parent order tenant access.
   */
  async create(
    payment: InsertOrderPayment,
    tenantId: string
  ): Promise<OrderPayment> {
    try {
      await this.ensureOrderBelongsToTenant(payment.orderId, tenantId);

      const result = await this.db
        .insert(orderPayments)
        .values(payment)
        .returning();
      return result[0];
    } catch (error) {
      if (error instanceof RepositoryError) throw error;
      this.handleError('create order payment', error);
    }
  }
}
