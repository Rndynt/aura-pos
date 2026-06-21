/**
 * React Query API Hooks
 * Centralized hooks for all backend API interactions
 */

import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import type { Product } from "@pos/domain/catalog/types";
import type { Order, OrderItem, OrderPayment, KitchenTicket, SelectedOption, OrderType, TenantOrderType } from "@pos/domain/orders/types";
import { getActiveTenantId } from "@/lib/tenant";
import { buildApiHeaders, getActiveOutletId } from "@/lib/outlet";
import {
  getCachedOrderTypes,
  saveCachedOrderTypes,
  updateTenantCachedAt,
  getCachedProducts,
  saveCachedProducts,
  updateCatalogCachedAt,
  getOrCreateTerminalIdentity,
  generateIdempotencyKey,
} from "@pos/offline";
import type { SubmitPOSPaymentApiResult, SubmitPOSPaymentRequest } from "@/features/pos-core/services/posPaymentSubmissionService";

/**
 * Map raw API order response (camelCase) → domain Order type (snake_case)
 */
function mapApiOrder(raw: Record<string, any>): Order {
  return {
    id: raw.id,
    tenant_id: raw.tenantId,
    order_type_id: raw.orderTypeId,
    sales_channel: raw.salesChannel,
    order_number: raw.orderNumber,
    status: raw.status,
    customer_name: raw.customerName,
    table_number: raw.tableNumber,
    notes: raw.notes,
    subtotal: Number(raw.subtotal ?? 0),
    tax_amount: Number(raw.taxAmount ?? 0),
    service_charge_amount: Number(raw.serviceCharge ?? 0),
    discount_amount: Number(raw.discountAmount ?? 0),
    total_amount: Number(raw.total ?? 0),
    paid_amount: Number(raw.paidAmount ?? 0),
    payment_status: raw.paymentStatus,
    created_at: new Date(raw.createdAt),
    updated_at: raw.updatedAt ? new Date(raw.updatedAt) : undefined,
    completed_at: raw.completedAt ? new Date(raw.completedAt) : undefined,
    items: Array.isArray(raw.items ?? raw.orderItems)
      ? (raw.items ?? raw.orderItems).map((item: Record<string, any>) => ({
          id: item.id,
          product_id: item.productId,
          product_name: item.productName,
          base_price: Number(item.unitPrice ?? 0),
          variant_id: item.variantId ?? undefined,
          variant_name: item.variantName ?? undefined,
          quantity: item.quantity,
          item_subtotal: Number(item.itemSubtotal ?? 0),
          notes: item.notes ?? undefined,
          status: item.status,
          selected_options: item.selectedOptions ?? item.selected_options ?? [],
        }))
      : [],
  } as Order;
}

// Helper to add tenant header to fetch requests
async function fetchWithTenantHeader(url: string) {
  const tenantId = getActiveTenantId();
  const headers = buildApiHeaders();
  const res = await fetch(url, {
    headers,
    credentials: "include",
  });

  if (!res.ok) {
    const text = (await res.text()) || res.statusText;
    throw new Error(`${res.status}: ${text}`);
  }

  const response = await res.json();
  return response.data;
}

// Helper to add tenant header to mutations.
// P5: parse structured error body so user-facing messages (e.g. INSUFFICIENT_STOCK)
// surface in the toast verbatim instead of the technical "409: {json...}" string.
async function mutateWithTenantHeader(
  method: string,
  url: string,
  data?: unknown,
  extraHeaders?: Record<string, string>,
) {
  const headers = buildApiHeaders({ "Content-Type": "application/json", ...extraHeaders });
  const res = await fetch(url, {
    method,
    headers,
    body: data ? JSON.stringify(data) : undefined,
    credentials: "include",
  });

  if (!res.ok) {
    const rawText = (await res.text()) || res.statusText;
    let parsed: any = null;
    try {
      parsed = rawText ? JSON.parse(rawText) : null;
    } catch {
      parsed = null;
    }
    const friendlyMessage = (parsed && (parsed.message || parsed.error)) || `${res.status}: ${rawText}`;
    const err = new Error(friendlyMessage) as Error & {
      status?: number;
      code?: string;
      body?: any;
    };
    err.status = res.status;
    if (parsed?.code) err.code = parsed.code;
    if (parsed) err.body = parsed;
    throw err;
  }

  const response = await res.json();
  return response.data;
}

// ============================================================================
// CATALOG HOOKS
// ============================================================================

/**
 * Fetch products with optional filters
 */
export type UseProductsFilters = {
  category?: string;
  isActive?: boolean;
};

export function useProducts(filters?: UseProductsFilters) {
  const tenantId = getActiveTenantId();
  const outletId = getActiveOutletId();
  const queryParams = new URLSearchParams();
  if (filters?.category) {
    queryParams.append("category", filters.category);
  }
  if (filters?.isActive !== undefined) {
    queryParams.append("isActive", String(filters.isActive));
  }

  const url = `/api/catalog/products${queryParams.toString() ? `?${queryParams.toString()}` : ""}`;

  return useQuery<{ products: Product[]; total: number }>({
    queryKey: ["/api/catalog/products", tenantId, outletId, JSON.stringify(filters || {})],
    queryFn: async () => {
      try {
        const data = await fetchWithTenantHeader(url);
        const products: Product[] = data?.products ?? [];
        saveCachedProducts(tenantId, products).catch(() => undefined);
        updateCatalogCachedAt(tenantId).catch(() => undefined);
        return { products, total: data?.total ?? products.length };
      } catch (err) {
        const cached = await getCachedProducts(tenantId) as Product[];
        if (cached.length > 0) return { products: cached, total: cached.length };
        throw err;
      }
    },
  });
}

/**
 * Fetch single product by ID
 */
export function useProduct(id: string | undefined) {
  return useQuery<Product>({
    queryKey: ["/api/catalog/products", id],
    queryFn: () => fetchWithTenantHeader(`/api/catalog/products/${id}`),
    enabled: !!id,
  });
}

// ============================================================================
// ORDER HOOKS
// ============================================================================

/**
 * Fetch orders with optional filters
 */
export type UseOrdersFilters = {
  status?: "draft" | "confirmed" | "completed" | "cancelled" | string;
  payment_status?: "paid" | "partial" | "unpaid";
  startDate?: Date;
  endDate?: Date;
  page?: number;
  limit?: number;
};

export type UseOrdersOptions = {
  refetchInterval?: number | false;
  enabled?: boolean;
};

export function useOrders(filters?: UseOrdersFilters, options?: UseOrdersOptions) {
  const tenantId = getActiveTenantId();
  const outletId = getActiveOutletId();
  const queryParams = new URLSearchParams();
  if (filters?.status) {
    queryParams.append("status", filters.status);
  }
  if (filters?.payment_status) {
    queryParams.append("payment_status", filters.payment_status);
  }
  if (filters?.startDate) {
    queryParams.append("startDate", filters.startDate.toISOString());
  }
  if (filters?.endDate) {
    queryParams.append("endDate", filters.endDate.toISOString());
  }
  if (filters?.page) {
    queryParams.append("page", String(filters.page));
  }
  if (filters?.limit) {
    queryParams.append("limit", String(filters.limit));
  }

  const url = `/api/orders${queryParams.toString() ? `?${queryParams.toString()}` : ""}`;

  return useQuery<{ orders: Order[]; pagination: { page: number; limit: number; total: number } }>({
    queryKey: ["/api/orders", tenantId, outletId, JSON.stringify(filters || {})],
    queryFn: async () => {
      const data = await fetchWithTenantHeader(url);
      return {
        orders: (data.orders ?? []).map(mapApiOrder),
        pagination: data.pagination,
      };
    },
    refetchInterval: options?.refetchInterval,
    enabled: options?.enabled ?? true,
  });
}

/**
 * Fetch single order by ID
 */
export function useOrder(id: string | undefined) {
  return useQuery<Order>({
    queryKey: ["/api/orders", id],
    queryFn: async () => {
      const data = await fetchWithTenantHeader(`/api/orders/${id}`);
      return mapApiOrder(data.order ?? data);
    },
    enabled: !!id,
  });
}

/**
 * Create new order
 */
export type CreateOrderInput = {
  items: Array<{
    product_id: string;
    product_name: string;
    base_price: number;
    quantity: number;
    variant_id?: string;
    variant_name?: string;
    variant_price_delta?: number;
    selected_options?: SelectedOption[];
    notes?: string;
  }>;
  order_type_id?: string;
  idempotency_key?: string;
  customer_name?: string;
  table_number?: string;
  notes?: string;
  tax_rate?: number;
  service_charge_rate?: number;
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

export type CreateOrderResponse = {
  order: Order;
  pricing: {
    subtotal: number;
    tax_amount: number;
    service_charge_amount: number;
    total_amount: number;
  };
};

export function useCreateOrder() {
  return useMutation<CreateOrderResponse, Error, CreateOrderInput>({
    mutationFn: async (data) => {
      const payload = await withCreateOrderIdempotency(data);
      return mutateWithTenantHeader("POST", "/api/orders", payload, {
        "x-idempotency-key": payload.idempotency_key,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
      queryClient.invalidateQueries({ queryKey: ["/api/orders/open"] });
      queryClient.invalidateQueries({ queryKey: ["/api/tables"] });
    },
  });
}

/**
 * Record payment for an order (supports partial payments)
 */
export type RecordPaymentInput = {
  amount: number;
  payment_method: "CASH" | "MANUAL_TRANSFER" | "MANUAL_QRIS";
  transaction_ref?: string;
  notes?: string;
  payment_flow?: "FULL" | "DOWN_PAYMENT" | "MULTI_PAYMENT" | "SPLIT_BILL";
  payment_kind?: "FULL_PAYMENT" | "DOWN_PAYMENT" | "REMAINING_PAYMENT" | "MULTI_PAYMENT_LINE" | "SPLIT_BILL_LINE";
  received_amount?: number;
  change_amount?: number;
  split_id?: string;
  sequence?: number;
  reference_note?: string;
  metadata?: Record<string, unknown>;
  client_payment_session_id?: string;
};

export type RecordPaymentResponse = {
  payment: OrderPayment;
  order: Order;
  remainingAmount: number;
};

export type RecordPaymentVariables = RecordPaymentInput & { orderId: string };

export function useRecordPayment() {
  return useMutation<RecordPaymentResponse, Error, RecordPaymentVariables>({
    mutationFn: ({ orderId, ...payload }) =>
      mutateWithTenantHeader("POST", `/api/orders/${orderId}/payments`, payload),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
      queryClient.invalidateQueries({ queryKey: ["/api/orders", variables.orderId] });
      // P5: refresh outlet-scoped catalog stock so cards show updated qty/badges.
      queryClient.invalidateQueries({ queryKey: ["/api/catalog/products"] });
    },
  });
}

/**
 * Create kitchen ticket for an order
 */
export type CreateKitchenTicketInput = {
  priority?: "normal" | "high" | "urgent";
};

export type CreateKitchenTicketResponse = {
  ticket: KitchenTicket;
};

export type CreateKitchenTicketVariables = CreateKitchenTicketInput & { orderId: string };

export function useCreateKitchenTicket() {
  return useMutation<CreateKitchenTicketResponse, Error, CreateKitchenTicketVariables>({
    mutationFn: ({ orderId, ...payload }) =>
      mutateWithTenantHeader("POST", `/api/orders/${orderId}/kitchen-ticket`, payload),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/orders", variables.orderId] });
    },
  });
}

/**
 * Update existing order with new items (for continuing unpaid orders)
 */
export type UpdateOrderInput = {
  items: Array<{
    product_id: string;
    product_name: string;
    base_price: number;
    quantity: number;
    variant_id?: string;
    variant_name?: string;
    variant_price_delta?: number;
    selected_options?: SelectedOption[];
    notes?: string;
  }>;
  customer_name?: string;
  tax_rate?: number;
  service_charge_rate?: number;
};

export type UpdateOrderVariables = UpdateOrderInput & { orderId: string };

export type UpdateOrderResponse = {
  order: Order;
  pricing: {
    subtotal: number;
    tax_amount: number;
    service_charge_amount: number;
    total_amount: number;
  };
};

export function useUpdateOrder() {
  return useMutation<UpdateOrderResponse, Error, UpdateOrderVariables>({
    mutationFn: ({ orderId, ...payload }) =>
      mutateWithTenantHeader("PATCH", `/api/orders/${orderId}`, payload),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
      queryClient.invalidateQueries({ queryKey: ["/api/orders/open"] });
      queryClient.invalidateQueries({ queryKey: ["/api/orders", variables.orderId] });
    },
  });
}

/**
 * Create order and record payment atomically [P3]
 * Prevents orphaned orders if payment fails
 */
export type CreateAndPayInput = CreateOrderInput & {
  amount: number;
  payment_method: "CASH" | "MANUAL_TRANSFER" | "MANUAL_QRIS";
  transaction_ref?: string;
  payment_notes?: string;
  fulfillment_mode?: "standard" | "instant";
  payment_flow?: "FULL" | "DOWN_PAYMENT" | "MULTI_PAYMENT" | "SPLIT_BILL";
  payment_kind?: "FULL_PAYMENT" | "DOWN_PAYMENT" | "REMAINING_PAYMENT" | "MULTI_PAYMENT_LINE" | "SPLIT_BILL_LINE";
  received_amount?: number;
  change_amount?: number;
  split_id?: string;
  sequence?: number;
  reference_note?: string;
  metadata?: Record<string, unknown>;
  client_payment_session_id?: string;
};

export type CreateAndPayResponse = CreateOrderResponse & {
  payment: OrderPayment;
  remainingAmount?: number;
  idempotent_replay?: boolean;
};

export function useCreateAndPay() {
  return useMutation<CreateAndPayResponse, Error, CreateAndPayInput>({
    mutationFn: async (data) => {
      const payload = await withCreateOrderIdempotency(data);
      return mutateWithTenantHeader("POST", "/api/orders/create-and-pay", payload, {
        "x-idempotency-key": payload.idempotency_key,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
      // P5: stock was deducted from inventory_balances — refresh catalog so
      // out-of-stock / low-stock states update immediately. Query key prefix
      // match invalidates every per-outlet variant of the catalog query.
      queryClient.invalidateQueries({ queryKey: ["/api/catalog/products"] });
    },
  });
}

export function useSubmitPOSPayment() {
  return useMutation<SubmitPOSPaymentApiResult, Error, SubmitPOSPaymentRequest>({
    mutationFn: (payload) => mutateWithTenantHeader("POST", "/api/pos/payments/submit", payload),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
      queryClient.invalidateQueries({ queryKey: ["/api/orders/open"] });
      if (result?.orderId) queryClient.invalidateQueries({ queryKey: ["/api/orders", result.orderId] });
      queryClient.invalidateQueries({ queryKey: ["/api/catalog/products"] });
    },
  });
}

/**
 * Fetch order types for tenant — with offline IndexedDB fallback
 */
export function useOrderTypes() {
  const tenantId = getActiveTenantId();
  return useQuery<OrderType[]>({
    queryKey: ["/api/orders/order-types"],
    queryFn: async () => {
      try {
        const data = await fetchWithTenantHeader("/api/orders/order-types");
        const orderTypes: OrderType[] = Array.isArray(data) ? data : (data?.orderTypes ?? []);
        saveCachedOrderTypes(tenantId, orderTypes).catch(() => undefined);
        updateTenantCachedAt(tenantId).catch(() => undefined);
        return orderTypes;
      } catch (err) {
        const cached = await getCachedOrderTypes(tenantId) as OrderType[];
        if (cached.length > 0) return cached;
        throw err;
      }
    },
  });
}

/**
 * Fetch all order types (master data)
 */
export function useAllOrderTypes() {
  return useQuery<OrderType[]>({
    queryKey: ["/api/orders/order-types/all"],
    queryFn: () => fetchWithTenantHeader("/api/orders/order-types/all"),
  });
}

/**
 * Enable order type for tenant
 */
export type EnableOrderTypeInput = {
  orderTypeId: string;
  config?: Record<string, any>;
};

export function useEnableOrderType() {
  return useMutation<TenantOrderType, Error, EnableOrderTypeInput>({
    mutationFn: ({ orderTypeId, config }) =>
      mutateWithTenantHeader("POST", `/api/orders/order-types/${orderTypeId}/enable`, { config }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/orders/order-types"] });
    },
  });
}

/**
 * Disable order type for tenant
 */
export type DisableOrderTypeInput = {
  orderTypeId: string;
};

export function useDisableOrderType() {
  return useMutation<void, Error, DisableOrderTypeInput>({
    mutationFn: ({ orderTypeId }) =>
      mutateWithTenantHeader("POST", `/api/orders/order-types/${orderTypeId}/disable`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/orders/order-types"] });
    },
  });
}

/**
 * Confirm an order (transition from draft to confirmed)
 */
export type ConfirmOrderInput = {
  orderId: string;
};

export function useConfirmOrder() {
  return useMutation<Order, Error, ConfirmOrderInput>({
    mutationFn: ({ orderId }) =>
      mutateWithTenantHeader("POST", `/api/orders/${orderId}/confirm`, {}),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
      queryClient.invalidateQueries({ queryKey: ["/api/orders/open"] });
      queryClient.invalidateQueries({ queryKey: ["/api/orders/history"] });
      queryClient.invalidateQueries({ queryKey: ["/api/orders", variables.orderId] });
    },
  });
}

/**
 * Complete an order (mark as completed)
 */
export type CompleteOrderInput = {
  orderId: string;
};

export function useCompleteOrder() {
  return useMutation<Order, Error, CompleteOrderInput>({
    mutationFn: ({ orderId }) =>
      mutateWithTenantHeader("POST", `/api/orders/${orderId}/complete`, {}),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
      queryClient.invalidateQueries({ queryKey: ["/api/orders/open"] });
      queryClient.invalidateQueries({ queryKey: ["/api/orders/history"] });
      queryClient.invalidateQueries({ queryKey: ["/api/orders", variables.orderId] });
    },
  });
}

/**
 * Cancel an order
 */
export type CancelOrderInput = {
  orderId: string;
};

export function useCancelOrder() {
  return useMutation<Order, Error, CancelOrderInput>({
    mutationFn: ({ orderId }) =>
      mutateWithTenantHeader("POST", `/api/orders/${orderId}/cancel`, {}),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
      queryClient.invalidateQueries({ queryKey: ["/api/orders/open"] });
      queryClient.invalidateQueries({ queryKey: ["/api/orders/history"] });
      queryClient.invalidateQueries({ queryKey: ["/api/orders", variables.orderId] });
    },
  });
}
