/**
 * CreateOrder Use Case
 * Creates a new order with items, modifiers, and complete pricing calculation
 */

import type { Order, OrderItem, SelectedOption, SelectedOptionGroup } from '@pos/domain/orders/types';
import type { PriceCalculation } from '@pos/domain/pricing/types';
import { DEFAULT_TAX_RATE, DEFAULT_SERVICE_CHARGE_RATE, calculateOrderPricing } from '@pos/core/pricing';
import { toInsertOrderDb, toDomainOrder, type InsertOrderPersistenceData, type PersistedOrderRecord } from './mappers';
import {
  type CheckProductAvailabilityInput,
  type CheckProductAvailabilityOutput,
} from '../catalog';
import { flattenSelectedOptions } from '../catalog';

export interface CreateOrderItemInput {
  product_id: string;
  product_name: string;
  base_price: number;
  quantity: number;
  variant_id?: string;
  variant_name?: string;
  variant_price_delta?: number;
  selected_options?: SelectedOption[];
  selected_option_groups?: SelectedOptionGroup[];
  notes?: string;
}

export interface CreateOrderInput {
  tenant_id: string;
  outlet_id?: string;
  items: CreateOrderItemInput[];
  order_type_id?: string;
  customer_name?: string;
  table_number?: string;
  notes?: string;
  tax_rate?: number;
  service_charge_rate?: number;
  idempotency_key?: string;
}

export interface CreateOrderOutput {
  order: Order;
  pricing: PriceCalculation;
  idempotent_replay?: boolean;
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
  selected_option_groups?: SelectedOptionGroup[];
  notes?: string;
  status?: string;
  item_subtotal: number;
}

export interface IOrderRepository {
  create(order: InsertOrderPersistenceData, orderItems: OrderItemInput[], tenantId: string): Promise<PersistedOrderRecord>;
  generateOrderNumber(tenantId: string): Promise<string>;
  findByIdempotencyKey?(tenantId: string, idempotencyKey: string): Promise<any | null>;
}

export interface ITenantRepository {
  findById(tenantId: string): Promise<{ id: string; is_active: boolean } | null>;
}

export interface IProductAvailabilityService {
  execute(input: CheckProductAvailabilityInput): Promise<CheckProductAvailabilityOutput>;
}

export class CreateOrder {
  constructor(
    private readonly orderRepository: IOrderRepository,
    private readonly tenantRepository: ITenantRepository,
    private readonly productAvailabilityService: IProductAvailabilityService
  ) {}

  async execute(input: CreateOrderInput): Promise<CreateOrderOutput> {
    try {
      const tenant = await this.tenantRepository.findById(input.tenant_id);
      if (!tenant) {
        throw new Error('Tenant not found');
      }
      if (!tenant.is_active) {
        throw new Error('Tenant is not active');
      }

      if (input.items.length === 0) {
        throw new Error('Order must contain at least one item');
      }

      const idempotencyKey = input.idempotency_key?.trim();
      if (idempotencyKey && this.orderRepository.findByIdempotencyKey) {
        const existingOrder = await this.orderRepository.findByIdempotencyKey(
          input.tenant_id,
          idempotencyKey,
        );

        if (existingOrder) {
          return this.toReplayOutput(existingOrder);
        }
      }

      const productQuantities = new Map<string, number>();
      const productNames = new Map<string, string>();
      for (const itemInput of input.items) {
        const currentQuantity = productQuantities.get(itemInput.product_id) ?? 0;
        productQuantities.set(itemInput.product_id, currentQuantity + itemInput.quantity);
        if (!productNames.has(itemInput.product_id)) {
          productNames.set(itemInput.product_id, itemInput.product_name);
        }
      }

      for (const [productId, requestedQuantity] of productQuantities) {
        const availability = await this.productAvailabilityService.execute({
          productId,
          tenantId: input.tenant_id,
          outletId: input.outlet_id ?? null,
          requestedQuantity,
        });

        if (!availability.isAvailable) {
          const productName = productNames.get(productId) ?? availability.product?.name ?? productId;
          const available = availability.availableQuantity ?? 0;
          const message = available <= 0
            ? `Stok ${productName} di outlet ini habis.`
            : `Stok ${productName} di outlet ini tidak cukup. Tersedia: ${available}, diminta: ${requestedQuantity}.`;
          const error = new Error(message) as Error & { code?: string; statusCode?: number };
          error.code = 'INSUFFICIENT_STOCK';
          error.statusCode = 409;
          throw error;
        }
      }

      const orderNumber = await this.orderRepository.generateOrderNumber(input.tenant_id);

      const taxRate = input.tax_rate ?? DEFAULT_TAX_RATE;
      const serviceChargeRate = input.service_charge_rate ?? DEFAULT_SERVICE_CHARGE_RATE;
      const pricingResult = calculateOrderPricing({
        items: input.items,
        tax_rate: taxRate,
        service_charge_rate: serviceChargeRate,
      });
      const subtotal = pricingResult.order_subtotal;
      const taxAmount = pricingResult.tax_amount;
      const serviceChargeAmount = pricingResult.service_charge_amount;
      const totalAmount = pricingResult.total_amount;

      const orderItems: OrderItem[] = input.items.map((itemInput, index) => ({
        id: crypto.randomUUID(),
        product_id: itemInput.product_id,
        product_name: itemInput.product_name,
        base_price: itemInput.base_price,
        variant_id: itemInput.variant_id,
        variant_name: itemInput.variant_name,
        variant_price_delta: itemInput.variant_price_delta ?? 0,
        selected_options: flattenSelectedOptions(
          itemInput.selected_options,
          itemInput.selected_option_groups
        ),
        selected_option_groups: itemInput.selected_option_groups,
        quantity: itemInput.quantity,
        item_subtotal: pricingResult.items[index].item_subtotal,
        notes: itemInput.notes,
        status: 'pending',
      }));

      // Map domain Order type to database InsertOrder type (snake_case to camelCase)
      const orderForDb = toInsertOrderDb(
        input.tenant_id,
        orderNumber,
        input.order_type_id,
        subtotal,
        taxAmount,
        serviceChargeAmount,
        totalAmount,
        input.customer_name,
        input.table_number,
        input.notes,
        idempotencyKey,
        input.outlet_id,
      );

      const orderItemsForDb: OrderItemInput[] = orderItems.map(item => ({
        product_id: item.product_id,
        product_name: item.product_name,
        base_price: item.base_price,
        quantity: item.quantity,
        variant_id: item.variant_id,
        variant_name: item.variant_name,
        variant_price_delta: item.variant_price_delta,
        selected_options: item.selected_options,
        notes: item.notes,
        status: item.status,
        item_subtotal: item.item_subtotal,
      }));

      const createdOrderDb = await this.orderRepository.create(orderForDb, orderItemsForDb, input.tenant_id);
      
      // Convert back to domain type (camelCase to snake_case)
      const createdOrder = toDomainOrder(createdOrderDb, orderItems);

      const pricing: PriceCalculation = {
        base_price: 0,
        variant_delta: 0,
        options_delta: 0,
        item_price: 0,
        quantity: 0,
        item_subtotal: 0,
        order_subtotal: subtotal,
        discounts: [],
        total_discount: 0,
        subtotal_after_discount: subtotal,
        tax_amount: taxAmount,
        service_charge_amount: serviceChargeAmount,
        total_amount: totalAmount,
      };

      return {
        order: createdOrder,
        pricing,
      };
    } catch (error) {
      throw new Error(`Failed to create order: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private toReplayOutput(existingOrder: any): CreateOrderOutput {
    const items: OrderItem[] = Array.isArray(existingOrder.items)
      ? existingOrder.items.map((item: any) => ({
          id: item.id,
          product_id: item.product_id ?? item.productId,
          product_name: item.product_name ?? item.productName,
          base_price: Number(item.base_price ?? item.unitPrice ?? 0),
          variant_id: item.variant_id ?? item.variantId ?? undefined,
          variant_name: item.variant_name ?? item.variantName ?? undefined,
          variant_price_delta: Number(item.variant_price_delta ?? 0),
          selected_options: item.selected_options ?? item.selectedOptions ?? [],
          selected_option_groups: item.selected_option_groups ?? item.selectedOptionGroups ?? undefined,
          quantity: Number(item.quantity ?? 0),
          item_subtotal: Number(item.item_subtotal ?? item.itemSubtotal ?? 0),
          notes: item.notes ?? undefined,
          status: item.status ?? 'pending',
        }))
      : [];

    const order = toDomainOrder(existingOrder, items);
    const pricing = this.pricingFromOrder(order);

    return {
      order,
      pricing,
      idempotent_replay: true,
    };
  }

  private pricingFromOrder(order: Order): PriceCalculation {
    return {
      base_price: 0,
      variant_delta: 0,
      options_delta: 0,
      item_price: 0,
      quantity: 0,
      item_subtotal: 0,
      order_subtotal: order.subtotal,
      discounts: [],
      total_discount: order.discount_amount,
      subtotal_after_discount: order.subtotal - order.discount_amount,
      tax_amount: order.tax_amount,
      service_charge_amount: order.service_charge_amount,
      total_amount: order.total_amount,
    };
  }
}
