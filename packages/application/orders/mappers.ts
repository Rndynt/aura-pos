/**
 * Order Mappers
 * Convert between domain Order types (snake_case) and database types (camelCase)
 */

import type { Order, OrderItem, SelectedOption } from '@pos/domain/orders/types';

export interface PersistedOrderRecord {
  id: string;
  tenantId: string;
  orderTypeId?: string | null;
  subtotal: string;
  taxAmount: string;
  serviceCharge: string;
  discountAmount: string;
  total: string;
  paidAmount: string;
  paymentStatus: string;
  orderNumber: string;
  status: string;
  customerName?: string | null;
  tableNumber?: string | null;
  notes?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface InsertOrderPersistenceData {
  tenantId: string;
  orderTypeId?: string;
  orderNumber: string;
  status: 'draft' | 'confirmed' | 'preparing' | 'ready' | 'served' | 'completed' | 'cancelled';
  subtotal: string;
  taxAmount: string;
  serviceCharge: string;
  discountAmount: string;
  total: string;
  paidAmount: string;
  paymentStatus: 'unpaid' | 'paid' | 'partial';
  customerName?: string;
  tableNumber?: string;
  notes?: string;
  idempotencyKey?: string;
  outletId?: string;
}

export interface InsertOrderItemPersistenceData {
  orderId: string;
  productId: string;
  productName: string;
  variantId?: string;
  variantName?: string;
  quantity: number;
  unitPrice: string;
  itemSubtotal: string;
  notes?: string;
  status: string;
}

export interface InsertOrderItemModifierPersistenceData {
  orderItemId: string;
  optionGroupId: string;
  optionGroupName: string;
  optionId: string;
  optionName: string;
  priceDelta: string;
}


/**
 * Convert domain Order to database InsertOrder
 */
export function toInsertOrderDb(
  tenantId: string,
  orderNumber: string,
  orderTypeId: string | undefined,
  subtotal: number,
  taxAmount: number,
  serviceChargeAmount: number,
  totalAmount: number,
  customerName?: string,
  tableNumber?: string,
  notes?: string,
  idempotencyKey?: string,
  outletId?: string,
): InsertOrderPersistenceData {
  return {
    tenantId,
    orderTypeId,
    orderNumber,
    status: 'draft',
    subtotal: subtotal.toString(),
    taxAmount: taxAmount.toString(),
    serviceCharge: serviceChargeAmount.toString(),
    discountAmount: '0',
    total: totalAmount.toString(),
    paidAmount: '0',
    paymentStatus: 'unpaid',
    customerName,
    tableNumber,
    notes,
    idempotencyKey,
    outletId,
  };
}

/**
 * Convert database Order to domain Order
 */
export function toDomainOrder(
  dbOrder: PersistedOrderRecord,
  items: OrderItem[]
): Order {
  return {
    id: dbOrder.id,
    tenant_id: dbOrder.tenantId,
    order_type_id: dbOrder.orderTypeId || undefined,
    items,
    subtotal: parseFloat(dbOrder.subtotal),
    tax_amount: parseFloat(dbOrder.taxAmount),
    service_charge_amount: parseFloat(dbOrder.serviceCharge),
    discount_amount: parseFloat(dbOrder.discountAmount),
    total_amount: parseFloat(dbOrder.total),
    paid_amount: parseFloat(dbOrder.paidAmount),
    payment_status: dbOrder.paymentStatus as 'paid' | 'partial' | 'unpaid',
    order_number: dbOrder.orderNumber,
    status: dbOrder.status as 'draft' | 'confirmed' | 'preparing' | 'ready' | 'served' | 'completed' | 'cancelled',
    customer_name: dbOrder.customerName || undefined,
    table_number: dbOrder.tableNumber || undefined,
    notes: dbOrder.notes || undefined,
    created_at: dbOrder.createdAt,
    updated_at: dbOrder.updatedAt,
  };
}

/**
 * Convert domain OrderItem to database InsertOrderItem
 */
export function toInsertOrderItemDb(
  orderItem: OrderItem,
  orderId: string
): InsertOrderItemPersistenceData {
  const variantDelta = orderItem.variant_price_delta ?? 0;
  const optionsDelta = orderItem.selected_options?.reduce(
    (sum, opt) => sum + opt.price_delta,
    0
  ) ?? 0;
  const unitPrice = orderItem.base_price + variantDelta + optionsDelta;

  return {
    orderId,
    productId: orderItem.product_id,
    productName: orderItem.product_name,
    variantId: orderItem.variant_id,
    variantName: orderItem.variant_name,
    quantity: orderItem.quantity,
    unitPrice: unitPrice.toString(),
    itemSubtotal: orderItem.item_subtotal.toString(),
    notes: orderItem.notes,
    status: orderItem.status || 'pending',
  };
}

/**
 * Convert domain SelectedOption to database InsertOrderItemModifier
 */
export function toInsertOrderItemModifierDb(
  selectedOption: SelectedOption,
  orderItemId: string
): InsertOrderItemModifierPersistenceData {
  return {
    orderItemId,
    optionGroupId: selectedOption.group_id,
    optionGroupName: selectedOption.group_name,
    optionId: selectedOption.option_id,
    optionName: selectedOption.option_name,
    priceDelta: selectedOption.price_delta.toString(),
  };
}

/**
 * Convert database modifier to domain SelectedOption
 */
export function toDomainSelectedOption(
  modifier: any
): SelectedOption {
  return {
    group_id: modifier.optionGroupId,
    group_name: modifier.optionGroupName,
    option_id: modifier.optionId,
    option_name: modifier.optionName,
    price_delta: parseFloat(modifier.priceDelta || '0'),
  };
}
