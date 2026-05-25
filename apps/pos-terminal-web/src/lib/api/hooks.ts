/**
 * React Query API Hooks
 * Centralized hooks for all backend API interactions
 */

import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { Product } from "@pos/domain/catalog/types";
import type { Order, OrderItem, OrderPayment, KitchenTicket, SelectedOption, OrderType, TenantOrderType } from "@pos/domain/orders/types";
import type { TenantFeature, FeatureCheck } from "@pos/domain/tenants/types";
import { getActiveTenantId } from "@/lib/tenant";
import {
  getCachedOrderTypes,
  saveCachedOrderTypes,
  updateTenantCachedAt,
  getCachedFeatures,
  saveCachedFeatures,
  getCachedProducts,
  saveCachedProducts,
  updateCatalogCachedAt,
} from "@pos/offline";

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
    items: Array.isArray(raw.orderItems)
      ? raw.orderItems.map((item: Record<string, any>) => ({
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
          selected_options: item.selectedOptions ?? [],
        }))
      : [],
  } as Order;
}

// Helper to add tenant header to fetch requests
async function fetchWithTenantHeader(url: string) {
  const tenantId = getActiveTenantId();
  const { getActiveOutletId } = await import("@/lib/outlet");
  const outletId = getActiveOutletId();
  const headers: Record<string, string> = { "x-tenant-id": tenantId };
  if (outletId) headers["x-outlet-id"] = outletId;
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

// Helper to add tenant header to mutations
async function mutateWithTenantHeader(method: string, url: string, data?: unknown) {
  const tenantId = getActiveTenantId();
  const { getActiveOutletId } = await import("@/lib/outlet");
  const outletId = getActiveOutletId();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "x-tenant-id": tenantId,
  };
  if (outletId) headers["x-outlet-id"] = outletId;
  const res = await fetch(url, {
    method,
    headers,
    body: data ? JSON.stringify(data) : undefined,
    credentials: "include",
  });

  if (!res.ok) {
    const text = (await res.text()) || res.statusText;
    throw new Error(`${res.status}: ${text}`);
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
  const queryParams = new URLSearchParams();
  if (filters?.category) {
    queryParams.append("category", filters.category);
  }
  if (filters?.isActive !== undefined) {
    queryParams.append("isActive", String(filters.isActive));
  }

  const url = `/api/catalog/products${queryParams.toString() ? `?${queryParams.toString()}` : ""}`;

  return useQuery<{ products: Product[]; total: number }>({
    queryKey: ["/api/catalog/products", JSON.stringify(filters || {})],
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
    queryKey: ["/api/orders", JSON.stringify(filters || {})],
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
  customer_name?: string;
  table_number?: string;
  notes?: string;
  tax_rate?: number;
  service_charge_rate?: number;
};

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
    mutationFn: (data) => mutateWithTenantHeader("POST", "/api/orders", data),
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
  payment_method: "cash" | "card" | "ewallet" | "other";
  transaction_ref?: string;
  notes?: string;
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
  payment_method: "cash" | "card" | "ewallet" | "other";
  transaction_ref?: string;
  payment_notes?: string;
};

export type CreateAndPayResponse = CreateOrderResponse & {
  payment: OrderPayment;
};

export function useCreateAndPay() {
  return useMutation<CreateAndPayResponse, Error, CreateAndPayInput>({
    mutationFn: (data) => mutateWithTenantHeader("POST", "/api/orders/create-and-pay", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
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

// ============================================================================
// TENANT HOOKS
// ============================================================================

/**
 * Fetch active features for tenant — with offline IndexedDB fallback
 */
export function useTenantFeatures() {
  const tenantId = getActiveTenantId();
  return useQuery<{ features: TenantFeature[]; total: number }>({
    queryKey: ["/api/tenants/features"],
    queryFn: async () => {
      try {
        const data = await fetchWithTenantHeader("/api/tenants/features");
        const features: TenantFeature[] = data?.features ?? (Array.isArray(data) ? data : []);
        saveCachedFeatures(tenantId, features).catch(() => undefined);
        updateTenantCachedAt(tenantId).catch(() => undefined);
        return { features, total: features.length };
      } catch (err) {
        const cached = await getCachedFeatures(tenantId) as TenantFeature[];
        if (cached.length > 0) return { features: cached, total: cached.length };
        throw err;
      }
    },
  });
}

/**
 * Check feature access for tenant
 */
export type CheckFeatureInput = {
  feature_code: string;
};

export function useCheckFeature() {
  return useMutation<FeatureCheck, Error, CheckFeatureInput>({
    mutationFn: (data) => mutateWithTenantHeader("POST", "/api/tenants/features/check", data),
  });
}
