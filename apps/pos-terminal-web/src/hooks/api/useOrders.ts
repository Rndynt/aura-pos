import { useMutation, useQuery } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import type { Order, OrderItem, OrderPayment } from "@pos/domain/orders/types";
import { getActiveTenantId } from "@/lib/tenant";

async function fetchWithTenantHeader(url: string) {
  const res = await fetch(url, {
    headers: { "x-tenant-id": getActiveTenantId() },
    credentials: "include",
  });
  if (!res.ok) {
    const text = (await res.text()) || res.statusText;
    throw new Error(`${res.status}: ${text}`);
  }
  return res.json();
}

async function postWithTenantHeader(url: string, data: unknown) {
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-tenant-id": getActiveTenantId(),
    },
    body: JSON.stringify(data),
    credentials: "include",
  });
  if (!res.ok) {
    const text = (await res.text()) || res.statusText;
    throw new Error(`${res.status}: ${text}`);
  }
  return res.json();
}

type OrderFilters = {
  status?: string;
  order_type_id?: string;
  table_number?: string;
  startDate?: Date;
  endDate?: Date;
  limit?: number;
};

export function useOrders(filters?: OrderFilters) {
  const queryParams = new URLSearchParams();
  if (filters?.status) queryParams.append("status", filters.status);
  if (filters?.order_type_id) queryParams.append("order_type_id", filters.order_type_id);
  if (filters?.table_number) queryParams.append("table_number", filters.table_number);
  if (filters?.startDate) queryParams.append("startDate", filters.startDate.toISOString());
  if (filters?.endDate) queryParams.append("endDate", filters.endDate.toISOString());
  if (filters?.limit) queryParams.append("limit", String(filters.limit));

  const queryString = queryParams.toString();
  const url = queryString ? `/api/orders?${queryString}` : "/api/orders";

  return useQuery<{ orders: Order[] }>({
    queryKey: ["/api/orders", filters],
    queryFn: () => fetchWithTenantHeader(url),
  });
}

export function useOpenOrders() {
  return useQuery<{ orders: Order[]; total: number }>({
    queryKey: ["/api/orders/open"],
    queryFn: () => fetchWithTenantHeader("/api/orders/open"),
  });
}

export function useOrderById(orderId: string) {
  return useQuery<Order>({
    queryKey: ["/api/orders", orderId],
    queryFn: () => fetchWithTenantHeader(`/api/orders/${orderId}`),
    enabled: !!orderId,
  });
}

type CreateOrderInput = {
  items: OrderItem[];
  subtotal: number;
  tax_amount: number;
  service_charge_amount: number;
  discount_amount?: number;
  total_amount: number;
  customer_name?: string;
  table_number?: string;
  notes?: string;
  order_type_id?: string;
  initial_payment?: {
    amount: number;
    payment_method: "cash" | "card" | "ewallet" | "other";
  };
};

export function useCreateOrder() {
  return useMutation<Order, Error, CreateOrderInput>({
    mutationFn: (data) => postWithTenantHeader("/api/orders", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
    },
  });
}

type RecordPaymentInput = {
  amount: number;
  payment_method: "cash" | "card" | "ewallet" | "other";
  notes?: string;
};

export function useRecordPayment(orderId: string) {
  return useMutation<OrderPayment, Error, RecordPaymentInput>({
    mutationFn: (data) => postWithTenantHeader(`/api/orders/${orderId}/payments`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
      queryClient.invalidateQueries({ queryKey: ["/api/orders", orderId] });
    },
  });
}

export function useCreateKitchenTicket(orderId: string) {
  return useMutation<any, Error, void>({
    mutationFn: () => postWithTenantHeader(`/api/orders/${orderId}/kitchen-ticket`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/orders", orderId] });
    },
  });
}
