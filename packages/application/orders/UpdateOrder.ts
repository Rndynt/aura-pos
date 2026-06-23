/**
 * UpdateOrder Use Case
 * Updates an existing order with new items and recalculates pricing
 */

import type { Order, OrderItem, SelectedOption } from '@pos/domain/orders/types';
import type { PriceCalculation } from '@pos/domain/pricing/types';
import { DEFAULT_TAX_RATE, DEFAULT_SERVICE_CHARGE_RATE } from '@pos/core/pricing';
import { calculateSelectedOptionsDelta, flattenSelectedOptions } from '../catalog';
import { assertCanPerformOrderAction } from '../business-flows';

export interface UpdateOrderItemInput {
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
}

export interface UpdateOrderInput {
  order_id: string;
  tenant_id: string;
  items: UpdateOrderItemInput[];
  order_type_id?: string;
  customer_name?: string;
  table_number?: string;
  notes?: string;
  tax_rate?: number;
  service_charge_rate?: number;
}

export interface UpdateOrderOutput {
  order: Order;
  pricing: PriceCalculation;
}

export interface UpdateOrderItemPersistenceData extends UpdateOrderItemInput {
  item_subtotal: number;
  status?: string;
}

export interface UpdateOrderPersistenceData {
  orderTypeId?: string;
  subtotal?: string;
  taxAmount?: string;
  serviceCharge?: string;
  discountAmount?: string;
  total?: string;
  customerName?: string;
  tableNumber?: string;
  notes?: string;
}

export interface IOrderRepository {
  findById(orderId: string, tenantId?: string): Promise<Order | null>;
  getEditLockState?(orderId: string, tenantId: string): Promise<{
    hasKitchenTicket: boolean;
    hasFiredKitchenItems: boolean;
  }>;
  updateWithItems(
    orderId: string,
    orderUpdates: UpdateOrderPersistenceData,
    newItems: UpdateOrderItemPersistenceData[],
    tenantId: string
  ): Promise<Order>;
}

export interface ITenantRepository {
  findById(tenantId: string): Promise<{ id: string; is_active: boolean } | null>;
}

export class UpdateOrder {
  constructor(
    private readonly orderRepository: IOrderRepository,
    private readonly tenantRepository: ITenantRepository
  ) {}

  async execute(input: UpdateOrderInput): Promise<UpdateOrderOutput> {
    try {
      // Validate tenant exists and is active
      const tenant = await this.tenantRepository.findById(input.tenant_id);
      if (!tenant) {
        throw new Error('Tenant not found');
      }
      if (!tenant.is_active) {
        throw new Error('Tenant is not active');
      }

      // Validate order exists (findById already checks tenant isolation)
      const order = await this.orderRepository.findById(input.order_id, input.tenant_id);
      if (!order) {
        throw new Error('Order not found');
      }

      const lockState = await this.orderRepository.getEditLockState?.(input.order_id, input.tenant_id);
      const hasKitchenTicket = lockState?.hasKitchenTicket ?? false;
      const hasFiredKitchenItems =
        lockState?.hasFiredKitchenItems ??
        (Array.isArray((order as any).items) &&
          (order as any).items.some((item: any) =>
            ['preparing', 'ready', 'delivered'].includes(String(item.status ?? '').toLowerCase())
          ));

      assertCanPerformOrderAction({
        businessProfile: 'core_standard',
        entitlements: [],
        action: 'UPDATE_DRAFT_ITEMS',
        orderOperationalStatus: (order as any).status,
        paymentStatus: (order as any).paymentStatus ?? (order as any).payment_status,
        hasKitchenTicket,
        hasFiredKitchenItems,
      });

      if (['paid', 'refunded', 'voided'].includes(String((order as any).paymentStatus ?? (order as any).payment_status ?? '').toLowerCase())) {
        const error = new Error('Pesanan sudah aktif atau sudah dikirim ke dapur dan tidak bisa diedit dari keranjang.');
        (error as any).code = 'ORDER_NOT_EDITABLE';
        throw error;
      }

      // Validate items
      if (!input.items || input.items.length === 0) {
        throw new Error('Order must contain at least one item');
      }

      // Calculate new pricing
      const orderItems: OrderItem[] = [];
      let subtotal = 0;

      for (const itemInput of input.items) {
        const variantDelta = itemInput.variant_price_delta ?? 0;
        const optionsDelta = calculateSelectedOptionsDelta(itemInput.selected_options, undefined);

        const flattenedOptions = flattenSelectedOptions(itemInput.selected_options, undefined);

        const itemPrice = itemInput.base_price + variantDelta + optionsDelta;
        const itemSubtotal = itemPrice * itemInput.quantity;

        const orderItem: OrderItem = {
          id: crypto.randomUUID(),
          product_id: itemInput.product_id,
          product_name: itemInput.product_name,
          base_price: itemInput.base_price,
          variant_id: itemInput.variant_id,
          variant_name: itemInput.variant_name,
          variant_price_delta: variantDelta,
          selected_options: flattenedOptions,
          selected_option_groups: undefined,
          quantity: itemInput.quantity,
          item_subtotal: itemSubtotal,
          notes: itemInput.notes,
          status: 'pending',
        };

        orderItems.push(orderItem);
        subtotal += itemSubtotal;
      }

      const taxRate = input.tax_rate ?? DEFAULT_TAX_RATE;
      const serviceChargeRate = input.service_charge_rate ?? DEFAULT_SERVICE_CHARGE_RATE;

      const taxAmount = subtotal * taxRate;
      const serviceChargeAmount = subtotal * serviceChargeRate;
      const totalAmount = subtotal + taxAmount + serviceChargeAmount;

      // Prepare order updates (only include defined fields to avoid Drizzle issues with undefined)
      const orderUpdates: Record<string, any> = {
        subtotal: subtotal.toString(),
        taxAmount: taxAmount.toString(),
        serviceCharge: serviceChargeAmount.toString(),
        total: totalAmount.toString(),
      };

      // Only add optional fields if they're actually provided
      if (input.order_type_id !== undefined) {
        orderUpdates.orderTypeId = input.order_type_id;
      }
      if (input.customer_name !== undefined) {
        orderUpdates.customerName = input.customer_name;
      }
      if (input.table_number !== undefined) {
        orderUpdates.tableNumber = input.table_number;
      }
      if (input.notes !== undefined) {
        orderUpdates.notes = input.notes;
      }

      // Convert orderItems back to OrderItemInput format (required by repository)
      const itemsForUpdate: UpdateOrderItemPersistenceData[] = orderItems.map(item => ({
        product_id: item.product_id,
        product_name: item.product_name,
        base_price: item.base_price,
        quantity: item.quantity,
        variant_id: item.variant_id,
        variant_name: item.variant_name,
        variant_price_delta: item.variant_price_delta,
        selected_options: item.selected_options,
        notes: item.notes,
        item_subtotal: item.item_subtotal,  // REQUIRED BY REPOSITORY
        status: item.status,
      }));

      // Update order with new items
      const updatedOrder = await this.orderRepository.updateWithItems(
        input.order_id,
        orderUpdates,
        itemsForUpdate,
        input.tenant_id
      );

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
        order: updatedOrder,
        pricing,
      };
    } catch (error) {
      if (error instanceof Error && (error as any).code) {
        throw error;
      }
      throw new Error(`Failed to update order: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
}
