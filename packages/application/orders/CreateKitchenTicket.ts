/**
 * CreateKitchenTicket Use Case
 * Generates a kitchen ticket from an order for preparation tracking
 */

import type { Order, OrderItem, KitchenTicket } from '@pos/domain/orders/types';

export interface CreateKitchenTicketInput {
  order_id: string;
  tenant_id: string;
  priority?: 'normal' | 'high' | 'urgent';
}

export interface CreateKitchenTicketOutput {
  ticket: KitchenTicket;
}

export interface IOrderRepository {
  findById(orderId: string, tenantId: string): Promise<Order | null>;
}

export interface IKitchenTicketRepository {
  create(ticket: Omit<KitchenTicket, 'id' | 'created_at'>, tenantId: string): Promise<KitchenTicket>;
  generateTicketNumber(tenantId: string): Promise<string>;
}

export class CreateKitchenTicket {
  constructor(
    private readonly orderRepository: IOrderRepository,
    private readonly kitchenTicketRepository: IKitchenTicketRepository
  ) {}

  async execute(input: CreateKitchenTicketInput): Promise<CreateKitchenTicketOutput> {
    try {
      const order = await this.orderRepository.findById(input.order_id, input.tenant_id);
      if (!order) {
        throw new Error('Order not found');
      }

      if (order.tenant_id !== input.tenant_id) {
        throw new Error('Order does not belong to the specified tenant');
      }

      if (order.status === 'cancelled') {
        throw new Error('Cannot create kitchen ticket for cancelled order');
      }

      if (order.items.length === 0) {
        throw new Error('Order has no items to prepare');
      }

      const items: OrderItem[] = order.items.filter(
        item => item.status === 'pending' || item.status === 'preparing'
      );

      if (items.length === 0) {
        throw new Error('No pending items to prepare');
      }

      const ticketNumber = await this.kitchenTicketRepository.generateTicketNumber(input.tenant_id);

      const ticket: Omit<KitchenTicket, 'id' | 'created_at'> = {
        order_id: input.order_id,
        tenant_id: input.tenant_id,
        items,
        table_number: order.table_number,
        priority: input.priority ?? 'normal',
        status: 'pending',
      };

      const createdTicket = await this.kitchenTicketRepository.create(ticket, input.tenant_id);

      return {
        ticket: createdTicket,
      };
    } catch (error) {
      throw new Error(`Failed to create kitchen ticket: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
}
