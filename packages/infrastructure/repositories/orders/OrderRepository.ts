/**
 * Order Repository
 * Handles order CRUD operations with complete relations and tenant isolation
 */

import { Database } from '../../database';
import { BaseRepository, RepositoryError } from '../BaseRepository';
import {
  orders,
  orderItems,
  orderItemModifiers,
  orderPayments,
  products,
  kitchenTickets,
  type Order,
  type InsertOrder,
  type OrderItem,
  type OrderItemModifier,
  type OrderPayment,
} from '@pos/infrastructure/db/schema';
import { eq, and, gte, lte, inArray, desc, sql } from 'drizzle-orm';
import { toInsertOrderItemDb, toInsertOrderItemModifierDb, toDomainSelectedOption } from '../../../application/orders/mappers';
import type { OrderItem as DomainOrderItem } from '@pos/domain/orders/types';
import { nextOrderNumberForTenant } from './orderNumberSequence';
import type { TransactionContext } from '@pos/application/shared/ports';
import { DrizzleUnitOfWork } from '../../unit-of-work';

export interface OrderFilters {
  status?: string[];
  paymentStatus?: string;
  dateFrom?: Date;
  dateTo?: Date;
  limit?: number;
  offset?: number;
  outletId?: string;
}

export interface OrderItemInput {
  product_id: string;
  product_name: string;
  base_price: number;
  quantity: number;
  variant_id?: string;
  variant_name?: string;
  variant_price_delta?: number;
  selected_options?: Array<{
    group_id: string;
    group_name: string;
    option_id: string;
    option_name: string;
    price_delta: number;
  }>;
  notes?: string;
  status?: string;
  item_subtotal: number;
}

export interface IOrderRepository {
  findByTenant(tenantId: string, filters?: OrderFilters): Promise<Order[]>;
  countByTenant(
    tenantId: string,
    filters?: Omit<OrderFilters, 'limit' | 'offset'>
  ): Promise<number>;
  findById(id: string, tenantId: string, context?: TransactionContext): Promise<any | null>;
  getEditLockState(id: string, tenantId: string): Promise<{ hasKitchenTicket: boolean; hasFiredKitchenItems: boolean }>;
  findByIdempotencyKey(tenantId: string, idempotencyKey: string): Promise<any | null>;
  create(order: InsertOrder, orderItems: OrderItemInput[], tenantId: string): Promise<Order>;
  update(id: string, order: Partial<InsertOrder>, tenantId: string, context?: TransactionContext): Promise<Order>;
  updateWithItems(
    id: string,
    orderUpdates: Partial<InsertOrder>,
    orderItemsInput: OrderItemInput[],
    tenantId: string
  ): Promise<Order>;
  updatePaymentStatus(
    id: string,
    paidAmount: string,
    paymentStatus: string,
    tenantId: string
  ): Promise<Order>;
}

export class OrderRepository
  extends BaseRepository<Order, InsertOrder>
  implements IOrderRepository
{
  protected table = orders;
  protected entityName = 'Order';

  constructor(db: Database) {
    super(db);
  }

  private buildFilterConditions(
    tenantId: string,
    filters?: Omit<OrderFilters, 'limit' | 'offset'>
  ) {
    // Keep predicate construction aligned with the composite order indexes:
    // (tenant_id, outlet_id, status, order_date DESC) for queue/history filters
    // and (tenant_id, outlet_id, order_date DESC) for report/list ranges.
    // PostgreSQL can reorder predicates, but this makes endpoint query shape review
    // explicit and keeps generated SQL easy to compare with EXPLAIN checks.
    const conditions = [eq(orders.tenantId, tenantId)];

    if (filters?.outletId) {
      conditions.push(eq(orders.outletId, filters.outletId));
    }

    if (filters?.status && filters.status.length > 0) {
      conditions.push(inArray(orders.status, filters.status as any[]));
    }

    if (filters?.dateFrom) {
      conditions.push(gte(orders.orderDate, filters.dateFrom));
    }

    if (filters?.dateTo) {
      conditions.push(lte(orders.orderDate, filters.dateTo));
    }

    if (filters?.paymentStatus) {
      conditions.push(eq(orders.paymentStatus, filters.paymentStatus as any));
    }

    return conditions;
  }

  /**
   * Find orders by tenant with filters and pagination (includes items)
   */
  async findByTenant(
    tenantId: string,
    filters?: OrderFilters
  ): Promise<any[]> {
    try {
      const conditions = this.buildFilterConditions(tenantId, filters);

      let query = this.db
        .select()
        .from(orders)
        .where(and(...conditions))
        .orderBy(desc(orders.orderDate));

      // Apply pagination
      if (filters?.limit) {
        query = query.limit(filters.limit) as any;
      }
      if (filters?.offset) {
        query = query.offset(filters.offset) as any;
      }

      const orderList = await query;

      // Fetch items for all orders
      if (orderList.length === 0) {
        return [];
      }

      const orderIds = orderList.map((o) => o.id);
      const itemsMap = new Map<string, any[]>();

      const allItems = await this.db
        .select()
        .from(orderItems)
        .where(inArray(orderItems.orderId, orderIds));

      // Fetch all modifiers for these items
      const itemIds = allItems.map((item) => item.id);
      const modifiersMap = new Map<string, any[]>();

      if (itemIds.length > 0) {
        const allModifiers = await this.db
          .select()
          .from(orderItemModifiers)
          .where(inArray(orderItemModifiers.orderItemId, itemIds));

        allModifiers.forEach((modifier) => {
          if (!modifiersMap.has(modifier.orderItemId)) {
            modifiersMap.set(modifier.orderItemId, []);
          }
          modifiersMap.get(modifier.orderItemId)!.push(modifier);
        });
      }

      // Group items by order ID and attach modifiers
      allItems.forEach((item) => {
        const itemWithModifiers = {
          ...item,
          selectedOptions: modifiersMap.get(item.id) || [],
        };
        if (!itemsMap.has(item.orderId)) {
          itemsMap.set(item.orderId, []);
        }
        itemsMap.get(item.orderId)!.push(itemWithModifiers);
      });

      // Attach items to each order
      return orderList.map((order) => ({
        ...order,
        items: itemsMap.get(order.id) || [],
      }));
    } catch (error) {
      this.handleError('find orders by tenant', error);
    }
  }

  async countByTenant(
    tenantId: string,
    filters?: Omit<OrderFilters, 'limit' | 'offset'>
  ): Promise<number> {
    try {
      const conditions = this.buildFilterConditions(tenantId, filters);
      const result = await this.db
        .select({ value: sql<number>`count(*)::int` })
        .from(orders)
        .where(and(...conditions));

      return result[0]?.value ?? 0;
    } catch (error) {
      this.handleError('count orders by tenant', error);
    }
  }

  /**
   * Find complete order by ID with all relations (items, modifiers, payments)
   */
  async findById(id: string, tenantId: string, context?: TransactionContext): Promise<any | null> {
    try {
      const client = DrizzleUnitOfWork.fromContext(context) ?? this.db;
      // Get the order
      const orderResult = await client
        .select()
        .from(orders)
        .where(and(eq(orders.id, id), eq(orders.tenantId, tenantId)))
        .limit(1);

      if (!orderResult || orderResult.length === 0) {
        return null;
      }

      const order = orderResult[0];

      // Get order items
      const items = await client
        .select()
        .from(orderItems)
        .where(eq(orderItems.orderId, id));

      // Get all modifiers for these items
      let modifiers: OrderItemModifier[] = [];
      if (items.length > 0) {
        const itemIds = items.map((item) => item.id);
        modifiers = await client
          .select()
          .from(orderItemModifiers)
          .where(inArray(orderItemModifiers.orderItemId, itemIds));
      }

      // Get payments
      const payments = await client
        .select()
        .from(orderPayments)
        .where(eq(orderPayments.orderId, id));

      // Map modifiers to items
      const modifiersByItem = modifiers.reduce((acc, modifier) => {
        if (!acc[modifier.orderItemId]) {
          acc[modifier.orderItemId] = [];
        }
        acc[modifier.orderItemId].push(modifier);
        return acc;
      }, {} as Record<string, OrderItemModifier[]>);

      // Add modifiers to items and convert to selected_options for frontend
      const completeItems = items.map((item) => {
        const itemModifiers = modifiersByItem[item.id] || [];
        
        // Keep original item structure, just add selected_options
        return {
          ...item,
          modifiers: itemModifiers,
          // Add selected_options for frontend compatibility
          selected_options: itemModifiers.map(mod => toDomainSelectedOption(mod)),
        };
      });

      return {
        ...order,
        items: completeItems,
        payments,
      };
    } catch (error) {
      this.handleError('find order by id', error);
    }
  }

  async getEditLockState(id: string, tenantId: string): Promise<{ hasKitchenTicket: boolean; hasFiredKitchenItems: boolean }> {
    try {
      const [ticketCount] = await this.db
        .select({ value: sql<number>`count(*)::int` })
        .from(kitchenTickets)
        .where(and(eq(kitchenTickets.orderId, id), eq(kitchenTickets.tenantId, tenantId)));

      const [firedItemCount] = await this.db
        .select({ value: sql<number>`count(*)::int` })
        .from(orderItems)
        .where(and(eq(orderItems.orderId, id), inArray(orderItems.status, ['preparing', 'ready', 'delivered'] as any[])));

      return {
        hasKitchenTicket: (ticketCount?.value ?? 0) > 0,
        hasFiredKitchenItems: (firedItemCount?.value ?? 0) > 0,
      };
    } catch (error) {
      this.handleError('get order edit lock state', error);
    }
  }

  /**
   * Find a complete order by tenant-scoped idempotency key.
   * Used to replay create-order retries without creating duplicate rows.
   */
  async findByIdempotencyKey(tenantId: string, idempotencyKey: string): Promise<any | null> {
    try {
      const orderResult = await this.db
        .select({ id: orders.id })
        .from(orders)
        .where(and(eq(orders.tenantId, tenantId), eq(orders.idempotencyKey, idempotencyKey)))
        .limit(1);

      const orderId = orderResult[0]?.id;
      if (!orderId) {
        return null;
      }

      return this.findById(orderId, tenantId);
    } catch (error) {
      this.handleError('find order by idempotency key', error);
    }
  }

  /**
   * Create a new order with all relations (items and modifiers)
   * Uses database transaction to ensure atomic writes
   */
  async create(order: InsertOrder, orderItemsInput: OrderItemInput[], tenantId: string): Promise<Order> {
    try {
      // STEP 1: Validate tenant/product access BEFORE starting transaction
      if (orderItemsInput.length > 0) {
        const productIds = orderItemsInput.map(item => item.product_id);
        const validProducts = await this.db
          .select()
          .from(products)
          .where(
            and(
              inArray(products.id, productIds),
              eq(products.tenantId, tenantId)
            )
          );

        const validProductIds = new Set(validProducts.map(p => p.id));
        const invalidProductIds = productIds.filter(id => !validProductIds.has(id));
        
        if (invalidProductIds.length > 0) {
          throw new RepositoryError(
            `Invalid product IDs or products do not belong to tenant: ${invalidProductIds.join(', ')}`,
            'INVALID_PRODUCT_IDS',
            null
          );
        }
      }

      // STEP 2: Execute all writes in a single transaction
      const createdOrder = await this.db.transaction(async (tx) => {
        // Insert the order
        const data = this.injectTenantId(order, tenantId);
        const orderResult = await tx.insert(orders).values(data).returning();
        const newOrder = orderResult[0];

        // Insert order items if any
        if (orderItemsInput.length > 0) {
          // Use mapper utility to convert order items
          const itemsToInsert = orderItemsInput.map(item => 
            toInsertOrderItemDb(item as DomainOrderItem, newOrder.id)
          );

          const insertedItems = await tx.insert(orderItems).values(itemsToInsert).returning();

          // Insert order item modifiers if any
          const modifiersToInsert = [];
          for (let i = 0; i < orderItemsInput.length; i++) {
            const item = orderItemsInput[i];
            const insertedItem = insertedItems[i];
            
            if (item.selected_options && item.selected_options.length > 0) {
              // Use mapper utility for each selected option
              for (const option of item.selected_options) {
                modifiersToInsert.push(
                  toInsertOrderItemModifierDb(option, insertedItem.id)
                );
              }
            }
          }

          if (modifiersToInsert.length > 0) {
            await tx.insert(orderItemModifiers).values(modifiersToInsert);
          }
        }

        return newOrder;
      });

      return createdOrder;
    } catch (error) {
      this.handleError('create order', error);
    }
  }

  /**
   * Update an existing order
   */
  async update(
    id: string,
    order: Partial<InsertOrder>,
    tenantId: string,
    context?: TransactionContext
  ): Promise<Order> {
    try {
      const client = DrizzleUnitOfWork.fromContext(context) ?? this.db;

      const result = await client
        .update(orders)
        .set({ ...order, updatedAt: new Date() })
        .where(and(eq(orders.id, id), eq(orders.tenantId, tenantId)))
        .returning();

      if (!result || result.length === 0) {
        throw new RepositoryError('Order not found', 'NOT_FOUND', null);
      }

      return result[0];
    } catch (error) {
      if (error instanceof RepositoryError) throw error;
      this.handleError('update order', error);
    }
  }

  /**
   * Update an existing order with new items (replaces all items)
   * Uses database transaction to ensure atomic writes
   */
  async updateWithItems(
    id: string,
    orderUpdates: Partial<InsertOrder>,
    orderItemsInput: OrderItemInput[],
    tenantId: string
  ): Promise<Order> {
    try {
      await this.ensureTenantAccess(id, tenantId);

      // Validate items
      if (!orderItemsInput || orderItemsInput.length === 0) {
        throw new RepositoryError('Order must contain at least one item', 'INVALID_ITEMS', null);
      }

      // Validate products belong to tenant
      const productIds = orderItemsInput.map(item => item.product_id);
      const validProducts = await this.db
        .select()
        .from(products)
        .where(
          and(
            inArray(products.id, productIds),
            eq(products.tenantId, tenantId)
          )
        );

      const validProductIds = new Set(validProducts.map(p => p.id));
      const invalidProductIds = productIds.filter(id => !validProductIds.has(id));
      
      if (invalidProductIds.length > 0) {
        throw new RepositoryError(
          `Invalid product IDs or products do not belong to tenant: ${invalidProductIds.join(', ')}`,
          'INVALID_PRODUCT_IDS',
          null
        );
      }

      // Execute all writes in a single transaction
      const updatedOrder = await this.db.transaction(async (tx) => {
        // Update the order
        const updateData = { ...orderUpdates, updatedAt: new Date() };
        const orderResult = await tx
          .update(orders)
          .set(updateData)
          .where(and(eq(orders.id, id), eq(orders.tenantId, tenantId)))
          .returning();

        if (!orderResult || orderResult.length === 0) {
          throw new RepositoryError('Order not found', 'NOT_FOUND', null);
        }

        const updatedOrderData = orderResult[0];

        // Delete existing items and modifiers
        const existingItems = await tx
          .select()
          .from(orderItems)
          .where(eq(orderItems.orderId, id));

        if (existingItems.length > 0) {
          const existingItemIds = existingItems.map(item => item.id);
          await tx
            .delete(orderItemModifiers)
            .where(inArray(orderItemModifiers.orderItemId, existingItemIds));
          await tx.delete(orderItems).where(eq(orderItems.orderId, id));
        }

        // Insert new items
        if (orderItemsInput.length > 0) {
          const itemsToInsert = orderItemsInput.map(item =>
            toInsertOrderItemDb(item as DomainOrderItem, id)
          );

          const insertedItems = await tx.insert(orderItems).values(itemsToInsert).returning();

          // Insert modifiers for new items
          const modifiersToInsert = [];
          for (let i = 0; i < orderItemsInput.length; i++) {
            const item = orderItemsInput[i];
            const insertedItem = insertedItems[i];

            if (item.selected_options && item.selected_options.length > 0) {
              for (const option of item.selected_options) {
                modifiersToInsert.push(
                  toInsertOrderItemModifierDb(option, insertedItem.id)
                );
              }
            }
          }

          if (modifiersToInsert.length > 0) {
            await tx.insert(orderItemModifiers).values(modifiersToInsert);
          }
        }

        return updatedOrderData;
      });

      return updatedOrder;
    } catch (error) {
      if (error instanceof RepositoryError) throw error;
      this.handleError('update order with items', error);
    }
  }

  /**
   * Update payment status of an order
   */
  async updatePaymentStatus(
    id: string,
    paidAmount: string,
    paymentStatus: string,
    tenantId: string
  ): Promise<Order> {
    try {
      await this.ensureTenantAccess(id, tenantId);

      const result = await this.db
        .update(orders)
        .set({
          paidAmount,
          paymentStatus: paymentStatus as any,
          updatedAt: new Date(),
        })
        .where(and(eq(orders.id, id), eq(orders.tenantId, tenantId)))
        .returning();

      if (!result || result.length === 0) {
        throw new RepositoryError('Order not found', 'NOT_FOUND', null);
      }

      return result[0];
    } catch (error) {
      if (error instanceof RepositoryError) throw error;
      this.handleError('update payment status', error);
    }
  }

  /**
   * Generate a unique order number for a tenant-local business date.
   *
   * The sequence increment is allocated through `order_number_sequences` with
   * `INSERT ... ON CONFLICT ... DO UPDATE ... RETURNING last_seq`, so concurrent
   * requests for the same tenant/date serialize at the database row instead of
   * racing on `count(orders)`.
   */
  async generateOrderNumber(tenantId: string): Promise<string> {
    try {
      return await this.db.transaction((tx) => nextOrderNumberForTenant(tx, tenantId));
    } catch (error) {
      this.handleError('generate order number', error);
    }
  }
}
