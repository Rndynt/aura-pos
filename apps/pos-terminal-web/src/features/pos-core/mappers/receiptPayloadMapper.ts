type PaymentMethod = "cash" | "card" | "ewallet" | "other";

export interface ReceiptCFDItem {
  name: string;
  quantity: number;
  unitPrice: number;
  itemTotal: number;
}

export interface BuildReceiptPayloadInput {
  orderNumber: string;
  tenantName: string;
  customerName?: string;
  tableNumber?: string;
  paymentMethod: PaymentMethod;
  subtotal: number;
  tax: number;
  serviceCharge: number;
  total: number;
  items: ReceiptCFDItem[];
  createdAt?: Date;
}

export function buildReceiptPayload(input: BuildReceiptPayloadInput) {
  return {
    orderNumber: input.orderNumber,
    tenantName: input.tenantName,
    customerName: input.customerName,
    tableNumber: input.tableNumber,
    paymentMethod: input.paymentMethod,
    createdAt: input.createdAt ?? new Date(),
    subtotal: input.subtotal,
    tax: input.tax,
    serviceCharge: input.serviceCharge,
    total: input.total,
    items: input.items.map((item) => ({
      name: item.name,
      qty: item.quantity,
      unitPrice: item.unitPrice,
      total: item.itemTotal,
    })),
  };
}
