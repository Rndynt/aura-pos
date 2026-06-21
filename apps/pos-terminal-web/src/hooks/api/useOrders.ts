import { useMutation, useQuery } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import type { Order, OrderItem, OrderPayment } from "@pos/domain/orders/types";
import { getActiveTenantId } from "@/lib/tenant";
import { buildApiHeaders, getActiveOutletId } from "@/lib/outlet";
import { generateIdempotencyKey, getOrCreateTerminalIdentity } from "@pos/offline";

async function fetchWithTenantHeader(url: string) {
  const res = await fetch(url, {
    headers: buildApiHeaders(),
    credentials: "include",
  });
  if (!res.ok) {
    const text = (await res.text()) || res.statusText;
    throw new Error(`${res.status}: ${text}`);
  }
  return res.json();
}

async function postWithTenantHeader(url: string, data: unknown, extraHeaders?: Record<string, string>) {
  const res = await fetch(url, {
    method: "POST",
    headers: buildApiHeaders({ "Content-Type": "application/json", ...extraHeaders }),
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

  const outletId = getActiveOutletId();
  return useQuery<{ orders: Order[] }>({
    queryKey: ["/api/orders", getActiveTenantId(), outletId, filters],
    queryFn: () => fetchWithTenantHeader(url),
  });
}

export function useOpenOrders() {
  const outletId = getActiveOutletId();
  return useQuery<{ orders: Order[]; total: number }>({
    queryKey: ["/api/orders/open", getActiveTenantId(), outletId],
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
  idempotency_key?: string;
  initial_payment?: {
    amount: number;
    payment_method: "cash" | "card" | "ewallet" | "other";
  };
};


async function withCreateOrderIdempotency<T extends { idempotency_key?: string }>(data: T): Promise<T & { idempotency_key: string }> {
  if (data.idempotency_key?.trim()) {
    return { ...data, idempotency_key: data.idempotency_key.trim() };
  }

  const tenantId = getActiveTenantId();
  const terminal = await getOrCreateTerminalIdentity(tenantId);
  return {
    ...data,
    idempotency_key: generateIdempotencyKey(terminal.terminalId),
  };
}

export function useCreateOrder() {
  return useMutation<Order, Error, CreateOrderInput>({
    mutationFn: async (data) => {
      const payload = await withCreateOrderIdempotency(data);
      return postWithTenantHeader("/api/orders", payload, {
        "x-idempotency-key": payload.idempotency_key,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
    },
  });
}

type RecordPaymentInput = {
  amount: number;
  payment_method: "cash" | "card" | "ewallet" | "other";
  notes?: string;
  payment_flow?:
    | "full_payment"
    | "partial_payment_dp"
    | "full"
    | "dp"
    | "multi"
    | "split";
  payment_kind?: "full_payment" | "down_payment" | "remaining_payment" | "multi_line" | "split_line";
  received_amount?: number;
  change_amount?: number;
  split_id?: string;
  sequence?: number;
  reference_note?: string;
  metadata?: Record<string, unknown>;
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
