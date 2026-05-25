/**
 * ListOpenOrders Use Case
 * Fetches open orders (draft, confirmed, preparing, ready) for a tenant with pagination
 */

import type { Order } from '../../../shared/schema';

export interface IOrderRepository {
  findByTenant(
    tenantId: string,
    filters?: {
      status?: string[];
      limit?: number;
      offset?: number;
    }
  ): Promise<Order[]>;
}

export interface ITenantRepository {
  findById(tenantId: string): Promise<{ id: string; is_active: boolean } | null>;
}

export interface ListOpenOrdersInput {
  tenant_id: string;
  outlet_id?: string;
  limit?: number;
  offset?: number;
}

export interface ListOpenOrdersOutput {
  orders: Order[];
}

export class ListOpenOrders {
  constructor(
    private readonly orderRepository: IOrderRepository,
    private readonly tenantRepository: ITenantRepository
  ) {}

  async execute(input: ListOpenOrdersInput): Promise<ListOpenOrdersOutput> {
    // Check tenant exists and is active
    const tenant = await this.tenantRepository.findById(input.tenant_id);
    if (!tenant) {
      throw new Error('Tenant not found');
    }
    if (!tenant.is_active) {
      throw new Error('Tenant is not active');
    }

    // Validate pagination params
    const limit = input.limit ?? 50;
    const offset = input.offset ?? 0;

    if (limit <= 0) {
      throw new Error('Limit must be greater than 0');
    }
    if (offset < 0) {
      throw new Error('Offset must be greater than or equal to 0');
    }

    const orders = await this.orderRepository.findByTenant(
      input.tenant_id,
      {
        status: ["draft", "confirmed", "preparing", "ready", "served"],
        ...(input.outlet_id ? { outletId: input.outlet_id } : {}),
        limit,
        offset,
      }
    );

    return {
      orders,
    };
  }
}
