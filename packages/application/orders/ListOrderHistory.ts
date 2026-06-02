/**
 * ListOrderHistory Use Case
 * Fetches completed and cancelled orders with pagination support
 */

import type { Order } from '../../../shared/schema';

export interface IOrderRepository {
  findByTenant(tenantId: string, filters?: {
    status?: string[];
    paymentStatus?: string;
    dateFrom?: Date;
    dateTo?: Date;
    limit?: number;
    offset?: number;
    outletId?: string;
  }): Promise<Order[]>;
  countByTenant(
    tenantId: string,
    filters?: {
      status?: string[];
      paymentStatus?: string;
      dateFrom?: Date;
      dateTo?: Date;
      outletId?: string;
    }
  ): Promise<number>;
}

export interface ITenantRepository {
  findById(tenantId: string): Promise<{ id: string; is_active: boolean } | null>;
}

export interface ListOrderHistoryInput {
  tenant_id: string;
  limit?: number;
  offset?: number;
  from_date?: Date;
  to_date?: Date;
  outlet_id?: string;
}

export interface PaginationMetadata {
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
}

export interface ListOrderHistoryOutput {
  orders: Order[];
  pagination: PaginationMetadata;
}

export class ListOrderHistory {
  constructor(
    private readonly orderRepository: IOrderRepository,
    private readonly tenantRepository: ITenantRepository
  ) {}

  async execute(input: ListOrderHistoryInput): Promise<ListOrderHistoryOutput> {
    // Check tenant exists and is active
    const tenant = await this.tenantRepository.findById(input.tenant_id);
    if (!tenant) {
      throw new Error('Tenant not found');
    }
    if (!tenant.is_active) {
      throw new Error('Tenant is not active');
    }

    // Validate pagination params
    const limit = input.limit ?? 20;
    const offset = input.offset ?? 0;

    if (limit <= 0) {
      throw new Error('Limit must be greater than 0');
    }
    if (offset < 0) {
      throw new Error('Offset must be greater than or equal to 0');
    }

    // Build filters for completed and cancelled orders
    const filters = {
      status: ["completed", "cancelled"] as string[],
      dateFrom: input.from_date,
      dateTo: input.to_date,
      limit,
      offset,
      outletId: input.outlet_id,
    };

    // Fetch orders with pagination
    const orders = await this.orderRepository.findByTenant(input.tenant_id, filters);

    // Get total count for pagination metadata
    const total = await this.orderRepository.countByTenant(input.tenant_id, {
      status: filters.status,
      dateFrom: filters.dateFrom,
      dateTo: filters.dateTo,
      outletId: filters.outletId,
    });

    // Calculate hasMore based on total and current pagination
    const hasMore = offset + limit < total;

    return {
      orders,
      pagination: {
        total,
        limit,
        offset,
        hasMore,
      },
    };
  }
}
