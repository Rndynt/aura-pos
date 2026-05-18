/**
 * CancelOrder Use Case
 * Cancels an order and updates its status
 */

import type { Order } from '@pos/domain/orders/types';
import { assertTransition, canCancelOrder } from '@pos/domain/orders/OrderStateValidator';

export interface CancelOrderInput {
  order_id: string;
  tenant_id: string;
  cancellation_reason?: string;
}

export interface CancelOrderOutput {
  order: Order;
}

export interface IOrderRepository {
  findById(orderId: string, tenantId: string): Promise<any | null>;
  update(orderId: string, updates: Record<string, any>, tenantId: string): Promise<any>;
}

export interface ITenantRepository {
  findById(tenantId: string): Promise<{ id: string; is_active: boolean } | null>;
}

export class CancelOrder {
  constructor(
    private readonly orderRepository: IOrderRepository,
    private readonly tenantRepository: ITenantRepository
  ) {}

  async execute(input: CancelOrderInput): Promise<CancelOrderOutput> {
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

      // Validate that order can be cancelled (not in terminal state)
      if (!canCancelOrder(order.status)) {
        throw new Error(`Cannot cancel order in '${order.status}' status`);
      }

      // Validate state transition
      assertTransition(order.status, 'cancelled');

      // Prepare notes with warnings and cancellation reason
      let updatedNotes = order.notes || '';
      
      // Add refund warning if order has payments
      const paidAmount = Number(order.paid_amount ?? order.paidAmount ?? 0);
      if (paidAmount > 0) {
        const refundWarning = `[WARNING] Order has payments totaling Rp ${paidAmount}. Refund may be required.`;
        updatedNotes = updatedNotes 
          ? `${updatedNotes}\n${refundWarning}`
          : refundWarning;
      }

      // Append cancellation reason if provided
      if (input.cancellation_reason) {
        const cancellationNote = `[CANCELLED] ${input.cancellation_reason}`;
        updatedNotes = updatedNotes
          ? `${updatedNotes}\n${cancellationNote}`
          : cancellationNote;
      }

      // Update order status to cancelled
      const updatedOrder = await this.orderRepository.update(input.order_id, {
        status: 'cancelled',
        notes: updatedNotes || undefined,
      }, input.tenant_id);

      return {
        order: updatedOrder,
      };
    } catch (error) {
      throw new Error(`Failed to cancel order: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
}
