/**
 * TransitionOrderFulfillmentStatus Use Case (P0.3)
 *
 * Kitchen/KDS-scoped order status transition.
 * Restricts transitions to fulfillment-only path (up to 'served').
 * Kitchen staff CANNOT financially close an order ('completed').
 *
 * POS/cashier order closing is handled by CompleteOrder use case
 * which validates payment_status = 'paid' before setting closed_at.
 */

import type { Order } from '@pos/domain/orders/types';
import {
  assertKitchenTransition,
  type OrderStatusType,
} from '@pos/domain/orders/OrderStateValidator';

/** Statuses reachable from kitchen/KDS context */
export type FulfillmentStatus =
  | 'confirmed'
  | 'preparing'
  | 'ready'
  | 'served';

export interface TransitionOrderFulfillmentStatusInput {
  order_id: string;
  tenant_id: string;
  status: FulfillmentStatus;
}

export interface TransitionOrderFulfillmentStatusOutput {
  order: Order;
}

export interface IOrderRepository {
  findById(orderId: string, tenantId: string): Promise<any | null>;
  update(orderId: string, updates: Record<string, any>, tenantId: string): Promise<any>;
}

export class TransitionOrderFulfillmentStatus {
  constructor(private readonly orderRepository: IOrderRepository) {}

  async execute(
    input: TransitionOrderFulfillmentStatusInput
  ): Promise<TransitionOrderFulfillmentStatusOutput> {
    const order = await this.orderRepository.findById(input.order_id, input.tenant_id);
    if (!order) {
      throw new Error('Order not found');
    }

    const currentStatus = (order.status ?? 'draft') as OrderStatusType;
    const targetStatus = input.status as OrderStatusType;

    // Kitchen-scoped validation – cannot trigger financial close
    assertKitchenTransition(currentStatus, targetStatus);

    const updatedOrder = await this.orderRepository.update(
      input.order_id,
      { status: targetStatus },
      input.tenant_id
    );

    return { order: updatedOrder };
  }
}
