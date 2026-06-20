import type { PaymentMethod } from "@/hooks/useCart";

export interface POSCFDSnapshot<TItem = unknown> {
  tenantName: string;
  orderNumber: string;
  items: TItem[];
  subtotal: number;
  tax: number;
  serviceCharge: number;
  total: number;
  customerName?: string;
  tableNumber?: string;
}

export function buildOrderingCFDPayload<TItem>(snapshot: POSCFDSnapshot<TItem>) {
  return {
    type: "ordering" as const,
    tenantName: snapshot.tenantName,
    orderNumber: snapshot.orderNumber,
    items: snapshot.items,
    subtotal: snapshot.subtotal,
    tax: snapshot.tax,
    serviceCharge: snapshot.serviceCharge,
    total: snapshot.total,
    customerName: snapshot.customerName,
    tableNumber: snapshot.tableNumber,
  };
}

export function buildPaymentCFDPayload<TItem>(snapshot: POSCFDSnapshot<TItem>, method: PaymentMethod) {
  return {
    ...buildOrderingCFDPayload(snapshot),
    type: "payment" as const,
    method,
  };
}

export function buildCompletedCFDPayload<TItem>(snapshot: POSCFDSnapshot<TItem>, amountPaid: number, change = 0) {
  return {
    ...buildOrderingCFDPayload(snapshot),
    type: "completed" as const,
    amountPaid,
    change,
  };
}
