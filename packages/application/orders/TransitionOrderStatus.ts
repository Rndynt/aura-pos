/**
 * TransitionOrderStatus Use Case
 * Centralizes tenant-aware order status transitions for POS/KDS flows.
 */

import type { Order } from '@pos/domain/orders/types';
import { assertTransition } from '@pos/domain/orders/OrderStateValidator';

export type TransitionableOrderStatus =
  | 'confirmed'
  | 'preparing'
  | 'ready'
  | 'completed'
  | 'cancelled';

export interface TransitionOrderStatusInput {
  order_id: string;
  tenant_id: string;
  status: TransitionableOrderStatus;
}

export interface TransitionOrderStatusOutput {
  order: Order;
}

export interface IOrderRepository {
  findById(orderId: string, tenantId: string): Promise<any | null>;
  update(orderId: string, updates: Record<string, any>, tenantId: string): Promise<any>;
}

export class TransitionOrderStatus {
  constructor(private readonly orderRepository: IOrderRepository) {}

  async execute(input: TransitionOrderStatusInput): Promise<TransitionOrderStatusOutput> {
    const order = await this.orderRepository.findById(input.order_id, input.tenant_id);
    if (!order) {
      throw new Error('Order not found');
    }

    const currentStatus = order.status as TransitionableOrderStatus | 'draft';
    const targetStatus = input.status;

    assertTransition(currentStatus, targetStatus);

    if (targetStatus === 'completed') {
      const totalAmount = Number(order.total_amount ?? order.total ?? 0);
      const paymentStatus = order.payment_status ?? order.paymentStatus;

      if (totalAmount > 0 && paymentStatus !== 'paid') {
        throw new Error(
          `Cannot close order with payment status '${paymentStatus}'. Pay-later orders may be ready/served operationally, but must be paid before closing.`
        );
      }
    }

    const updatedOrder = await this.orderRepository.update(
      input.order_id,
      { status: targetStatus },
      input.tenant_id
    );

    return { order: updatedOrder };
  }
}
