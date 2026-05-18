/**
 * ConfirmOrder Use Case
 * Confirms a draft order, changing status from draft to confirmed
 */

import type { Order } from '@pos/domain/orders/types';
import { assertTransition, canConfirmOrder } from '@pos/domain/orders/OrderStateValidator';

export interface ConfirmOrderInput {
  order_id: string;
  tenant_id: string;
}

export interface ConfirmOrderOutput {
  order: Order;
}

export interface IOrderRepository {
  findById(orderId: string, tenantId: string): Promise<any | null>;
  update(orderId: string, updates: Record<string, any>, tenantId: string): Promise<any>;
}

export interface ITenantRepository {
  findById(tenantId: string): Promise<{ id: string; is_active: boolean } | null>;
}

export class ConfirmOrder {
  constructor(
    private readonly orderRepository: IOrderRepository,
    private readonly tenantRepository: ITenantRepository
  ) {}

  async execute(input: ConfirmOrderInput): Promise<ConfirmOrderOutput> {
    try {
      // Validate tenant exists and is active
      const tenant = await this.tenantRepository.findById(input.tenant_id);
      if (!tenant) {
        throw new Error('Tenant not found');
      }
      if (!tenant.is_active) {
        throw new Error('Tenant is not active');
      }

      // Validate order exists
      const order = await this.orderRepository.findById(input.order_id, input.tenant_id);
      if (!order) {
        throw new Error('Order not found');
      }

      // Validate order belongs to tenant
      if ((order.tenant_id || order.tenantId) !== input.tenant_id) {
        throw new Error('Order does not belong to the specified tenant');
      }

      // Validate order has at least one item
      if (!order.items || order.items.length === 0) {
        throw new Error('Order must have at least one item');
      }

      // Validate current status is draft
      if (!canConfirmOrder(order.status)) {
        throw new Error(
          `Cannot confirm order with status '${order.status}'. Order must be in draft status.`
        );
      }

      // Assert transition is valid (will throw if invalid)
      assertTransition(order.status, 'confirmed');

      // Update order status to confirmed
      const updatedOrder = await this.orderRepository.update(input.order_id, {
        status: 'confirmed',
      }, input.tenant_id);

      return {
        order: updatedOrder,
      };
    } catch (error) {
      throw new Error(
        `Failed to confirm order: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }
}
