import { useQuery, useMutation } from "@tanstack/react-query";
import type { Product } from "@pos/domain/catalog/types";
import { getActiveTenantId } from "@/lib/tenant";
import { getActiveOutletId } from "@/lib/outlet";
import { queryClient } from "@/lib/queryClient";
import {
  getCachedProducts,
  saveCachedProducts,
  updateCatalogCachedAt,
} from "@pos/offline";

function buildHeaders(extra?: Record<string, string>): Record<string, string> {
  const outletId = getActiveOutletId();
  const headers: Record<string, string> = { "x-tenant-id": getActiveTenantId(), ...extra };
  if (outletId) headers["x-outlet-id"] = outletId;
  return headers;
}

async function fetchWithTenantHeader(url: string) {
  const res = await fetch(url, {
    headers: buildHeaders(),
    credentials: "include",
  });
  if (!res.ok) {
    const text = (await res.text()) || res.statusText;
    throw new Error(`${res.status}: ${text}`);
  }
  return res.json();
}

async function postWithTenantHeader(url: string, body: any) {
  const res = await fetch(url, {
    method: "POST",
    headers: buildHeaders({ "Content-Type": "application/json" }),
    credentials: "include",
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = (await res.text()) || res.statusText;
    throw new Error(`${res.status}: ${text}`);
  }
  return res.json();
}

async function putWithTenantHeader(url: string, body: any) {
  const res = await fetch(url, {
    method: "PUT",
    headers: buildHeaders({ "Content-Type": "application/json" }),
    credentials: "include",
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = (await res.text()) || res.statusText;
    throw new Error(`${res.status}: ${text}`);
  }
  return res.json();
}

interface ProductsResponse {
  success: boolean;
  data: { products: Product[]; total: number };
}

export function useProducts() {
  const tenantId = getActiveTenantId();
  return useQuery<Product[]>({
    queryKey: ["/api/catalog/products"],
    queryFn: async () => {
      try {
        const response: ProductsResponse = await fetchWithTenantHeader("/api/catalog/products");
        const products: Product[] = response.data?.products ?? (response as any) ?? [];
        saveCachedProducts(tenantId, products).catch(() => undefined);
        updateCatalogCachedAt(tenantId).catch(() => undefined);
        return products;
      } catch (err) {
        const cached = await getCachedProducts(tenantId) as Product[];
        if (cached.length > 0) return cached;
        throw err;
      }
    },
  });
}

export function useProductById(id: string) {
  return useQuery<Product>({
    queryKey: ["/api/catalog/products", id],
    queryFn: async () => {
      const response = await fetchWithTenantHeader(`/api/catalog/products/${id}`);
      return response.data || response;
    },
    enabled: !!id,
  });
}

export interface CreateProductInput {
  name: string;
  description?: string;
  base_price: number;
  category: string;
  category_id?: string;
  image_url?: string;
  metadata?: Record<string, any>;
  has_variants?: boolean;
  stock_tracking_enabled?: boolean;
  stock_qty?: number;
  sku?: string;
  is_active?: boolean;
  option_groups?: Array<{
    name: string;
    selection_type: "single" | "multiple";
    min_selections: number;
    max_selections: number;
    is_required: boolean;
    display_order?: number;
    options: Array<{
      name: string;
      price_delta: number;
      inventory_sku?: string;
      is_available?: boolean;
      display_order?: number;
    }>;
  }>;
}

export interface UpdateProductInput extends CreateProductInput {
  product_id: string;
}

export function useCreateProduct() {
  return useMutation({
    mutationFn: async (input: CreateProductInput) => {
      const response = await postWithTenantHeader("/api/catalog/products", input);
      return response.data || response;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/catalog/products"] });
    },
  });
}

export function useUpdateProduct() {
  return useMutation({
    mutationFn: async (input: UpdateProductInput) => {
      const { product_id, ...body } = input;
      const response = await putWithTenantHeader(`/api/catalog/products/${product_id}`, body);
      return response.data || response;
    },
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/catalog/products"] });
      queryClient.invalidateQueries({ queryKey: ["/api/catalog/products", variables.product_id] });
    },
  });
}
