/**
 * CompleteOrder Use Case
 * Financial close: marks an order as completed and sets closed_at timestamp.
 *
 * Requires payment_status = 'paid' unless override_payment_check = true
 * (future: override requires manager role – tracked for Auth/RBAC sprint).
 *
 * For dine-in pay-later, kitchen drives the order to 'served';
 * cashier calls CompleteOrder after collecting payment.
 */

import type { Order } from '@pos/domain/orders/types';
import { assertTransition, canCompleteOrder } from '@pos/domain/orders/OrderStateValidator';

export interface CompleteOrderInput {
  order_id: string;
  tenant_id: string;
  /** Allow closing an unpaid order (house account, complimentary, write-off). Manager only – not yet enforced. */
  override_payment_check?: boolean;
}

export interface CompleteOrderOutput {
  order: Order;
}

export interface IOrderRepository {
  findById(orderId: string, tenantId: string): Promise<any | null>;
  update(orderId: string, updates: Record<string, any>, tenantId: string): Promise<any>;
}

export interface ITenantRepository {
  findById(tenantId: string): Promise<{ id: string; is_active: boolean } | null>;
}

export class CompleteOrder {
  constructor(
    private readonly orderRepository: IOrderRepository,
    private readonly tenantRepository: ITenantRepository
  ) {}

  async execute(input: CompleteOrderInput): Promise<CompleteOrderOutput> {
    try {
      const tenant = await this.tenantRepository.findById(input.tenant_id);
      if (!tenant) throw new Error('Tenant not found');
      if (!tenant.is_active) throw new Error('Tenant is not active');

      const order = await this.orderRepository.findById(input.order_id, input.tenant_id);
      if (!order) throw new Error('Order not found');

      if (!canCompleteOrder(order.status)) {
        throw new Error(
          `Cannot complete order with status '${order.status}'. ` +
          `Order must be in 'preparing', 'ready', or 'served' state.`
        );
      }

      // Payment guard (P0.3): financial close requires full payment
      if (!input.override_payment_check) {
        const totalAmount = Number(order.total_amount ?? order.total ?? 0);
        const paymentStatus = order.payment_status ?? order.paymentStatus;
        if (totalAmount > 0 && paymentStatus !== 'paid') {
          throw new Error(
            `Cannot close order: payment_status is '${paymentStatus}'. ` +
            `Order must be fully paid before financial close. ` +
            `For dine-in pay-later, use 'served' after kitchen fulfilment; ` +
            `call CompleteOrder again after collecting payment.`
          );
        }
      }

      assertTransition(order.status, 'completed');

      // Set closedAt for explicit settlement tracking (P0.3)
      const updatedOrder = await this.orderRepository.update(
        input.order_id,
        {
          status: 'completed',
          closedAt: new Date(),
        },
        input.tenant_id
      );

      return { order: updatedOrder };
    } catch (error) {
      throw new Error(
        `Failed to complete order: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }
}
