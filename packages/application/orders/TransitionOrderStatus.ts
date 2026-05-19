/**
 * TransitionOrderStatus Use Case
 * POS/cashier-scoped order status transition.
 *
 * Includes full transition map (including financial close via 'completed').
 * When transitioning to 'completed', validates payment_status = 'paid'
 * and sets closed_at timestamp for explicit settlement tracking.
 *
 * For kitchen-only transitions (up to 'served'), use TransitionOrderFulfillmentStatus.
 */

import type { Order } from '@pos/domain/orders/types';
import {
  assertTransition,
  type OrderStatusType,
} from '@pos/domain/orders/OrderStateValidator';

export type TransitionableOrderStatus =
  | 'confirmed'
  | 'preparing'
  | 'ready'
  | 'served'
  | 'completed'
  | 'cancelled';

export interface TransitionOrderStatusInput {
  order_id: string;
  tenant_id: string;
  status: TransitionableOrderStatus;
  /**
   * If true, allows closing an unpaid order (e.g. house account, complimentary, write-off).
   * Requires manager-level permission in the future (not yet enforced – tracked for RBAC sprint).
   */
  override_payment_check?: boolean;
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

    const currentStatus = (order.status ?? 'draft') as OrderStatusType;
    const targetStatus = input.status as OrderStatusType;

    // Validate transition using domain rules
    assertTransition(currentStatus, targetStatus);

    // Financial close guard (P0.3)
    // 'completed' means the order is fully settled – requires payment.
    // 'served' is the dine-in fulfillment milestone and does NOT require payment.
    if (targetStatus === 'completed' && !input.override_payment_check) {
      const totalAmount = Number(order.total_amount ?? order.total ?? 0);
      const paymentStatus = order.payment_status ?? order.paymentStatus;

      if (totalAmount > 0 && paymentStatus !== 'paid') {
        throw new Error(
          `Cannot close order: payment_status is '${paymentStatus}'. ` +
          `Order must be fully paid before financial close ('completed'). ` +
          `For dine-in eat-first-pay-later, use status 'served' after kitchen fulfilment.`
        );
      }
    }

    const updates: Record<string, any> = { status: targetStatus };

    // Set closed_at when completing (financial close)
    if (targetStatus === 'completed') {
      updates.closedAt = new Date();
    }

    const updatedOrder = await this.orderRepository.update(
      input.order_id,
      updates,
      input.tenant_id
    );

    return { order: updatedOrder };
  }
}
