export interface POSOrderPayloadInput<TItem> {
  items: TItem[];
  taxRate: number;
  serviceChargeRate: number;
  selectedOrderTypeId?: string | null;
  customerName?: string | null;
  tableNumber?: string | null;
  orderDiscount?: { type?: string; value?: number } | null;
  orderDiscountAmount?: number;
  itemsDiscountTotal?: number;
}

export function cartToOrderPayload<TItem>(input: POSOrderPayloadInput<TItem>) {
  return {
    items: input.items,
    tax_rate: input.taxRate,
    service_charge_rate: input.serviceChargeRate,
    order_type_id: input.selectedOrderTypeId || undefined,
    customer_name: input.customerName || undefined,
    table_number: input.tableNumber || undefined,
    order_discount_type: input.orderDiscount?.type,
    order_discount_value: input.orderDiscount?.value,
    order_discount_amount: input.orderDiscountAmount && input.orderDiscountAmount > 0 ? input.orderDiscountAmount : undefined,
    items_discount_total: input.itemsDiscountTotal && input.itemsDiscountTotal > 0 ? input.itemsDiscountTotal : undefined,
  };
}
