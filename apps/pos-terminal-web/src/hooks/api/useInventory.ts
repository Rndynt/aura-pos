import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getActiveTenantId } from "@/lib/tenant";

function buildHeaders(extra?: Record<string, string>): Record<string, string> {
  return { "x-tenant-id": getActiveTenantId(), "Content-Type": "application/json", ...extra };
}

async function apiFetch(url: string) {
  const res = await fetch(url, { headers: buildHeaders(), credentials: "include" });
  if (!res.ok) { const t = await res.text(); throw new Error(t || res.statusText); }
  return res.json();
}

async function apiPut(url: string, body: unknown) {
  const res = await fetch(url, { method: "PUT", headers: buildHeaders(), credentials: "include", body: JSON.stringify(body) });
  if (!res.ok) { const t = await res.text(); throw new Error(t || res.statusText); }
  return res.json();
}

async function apiPost(url: string, body: unknown) {
  const res = await fetch(url, { method: "POST", headers: buildHeaders(), credentials: "include", body: JSON.stringify(body) });
  if (!res.ok) { const t = await res.text(); throw new Error(t || res.statusText); }
  return res.json();
}

export type StockProduct = {
  id: string;
  name: string;
  category: string;
  basePrice: string;
  imageUrl: string | null;
  sku: string | null;
  stockQty: number;
  isActive: boolean;
  isLowStock: boolean;
  isOutOfStock: boolean;
  lowStockThreshold: number;
};

export type StockSummary = {
  total: number;
  lowStock: number;
  outOfStock: number;
};

export type InventoryMovement = {
  id: string;
  productId: string;
  productName?: string;
  productCategory?: string;
  movementType: string;
  quantityDelta: number;
  quantityBefore: number | null;
  quantityAfter: number | null;
  unitCost: string | null;
  notes: string | null;
  actorId: string | null;
  orderId: string | null;
  createdAt: string;
};

export type MovementsFilter = {
  type?: string;
  productId?: string;
  dateFrom?: string;
  dateTo?: string;
  limit?: number;
  offset?: number;
};

export type InventoryReportData = {
  period: { from: string; to: string; days: number };
  topSold: Array<{
    productId: string;
    productName: string;
    category: string;
    totalSold: number;
  }>;
  movementBreakdown: Array<{
    movementType: string;
    count: number;
    totalIn: number;
    totalOut: number;
  }>;
  stockValue: {
    totalValue: number;
    totalTracked: number;
    totalUnits: number;
  };
  salesSummary: {
    totalOrders: number;
    totalUnitsSold: number;
  };
};

export const MOVEMENT_TYPE_LABELS: Record<string, { label: string; color: string }> = {
  SALE:           { label: "Terjual",        color: "text-blue-600 bg-blue-50 border-blue-200" },
  OFFLINE_SALE:   { label: "Terjual Offline", color: "text-indigo-600 bg-indigo-50 border-indigo-200" },
  ADJUSTMENT_IN:  { label: "Tambah Stok",    color: "text-emerald-600 bg-emerald-50 border-emerald-200" },
  ADJUSTMENT_OUT: { label: "Kurang Stok",    color: "text-orange-600 bg-orange-50 border-orange-200" },
  PURCHASE:       { label: "Pembelian",      color: "text-teal-600 bg-teal-50 border-teal-200" },
  DAMAGE:         { label: "Rusak/Terbuang", color: "text-red-600 bg-red-50 border-red-200" },
  RETURN:         { label: "Retur",          color: "text-violet-600 bg-violet-50 border-violet-200" },
  INITIAL:        { label: "Stok Awal",      color: "text-slate-600 bg-slate-50 border-slate-200" },
};

// ── FREE ──────────────────────────────────────────────────────────────────────

export function useStockProducts() {
  const tenantId = getActiveTenantId();
  return useQuery<{ success: boolean; data: { items: StockProduct[]; summary: StockSummary } }>({
    queryKey: ["/api/inventory/products", tenantId],
    queryFn: () => apiFetch("/api/inventory/products"),
    enabled: !!tenantId,
    staleTime: 30_000,
  });
}

export function useAdjustStock() {
  const tenantId = getActiveTenantId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ productId, qty, mode = "set", notes }: { productId: string; qty: number; mode?: "set" | "delta"; notes?: string }) =>
      apiPut(`/api/inventory/products/${productId}/adjust`, { qty, mode, notes }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/inventory/products", tenantId] }),
  });
}

// ── ADVANCED ──────────────────────────────────────────────────────────────────

export function useInventoryMovements(filters: MovementsFilter = {}) {
  const tenantId = getActiveTenantId();
  const params = new URLSearchParams();
  if (filters.type) params.set("type", filters.type);
  if (filters.productId) params.set("productId", filters.productId);
  if (filters.dateFrom) params.set("dateFrom", filters.dateFrom);
  if (filters.dateTo) params.set("dateTo", filters.dateTo);
  if (filters.limit) params.set("limit", String(filters.limit));
  if (filters.offset) params.set("offset", String(filters.offset));
  const qs = params.toString();

  return useQuery<{ success: boolean; data: { movements: InventoryMovement[]; limit: number; offset: number } }>({
    queryKey: ["/api/inventory/movements", tenantId, filters],
    queryFn: () => apiFetch(`/api/inventory/movements${qs ? `?${qs}` : ""}`),
    enabled: !!tenantId,
    staleTime: 30_000,
  });
}

export function useProductMovements(productId: string | null) {
  const tenantId = getActiveTenantId();
  return useQuery<{ success: boolean; data: { movements: InventoryMovement[] } }>({
    queryKey: ["/api/inventory/movements", tenantId, productId],
    queryFn: () => apiFetch(`/api/inventory/movements/${productId}`),
    enabled: !!tenantId && !!productId,
    staleTime: 30_000,
  });
}

export function useCreateMovement() {
  const tenantId = getActiveTenantId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { productId: string; movementType: string; quantityDelta: number; notes?: string; unitCost?: string }) =>
      apiPost("/api/inventory/movements", body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/inventory/products", tenantId] });
      qc.invalidateQueries({ queryKey: ["/api/inventory/movements", tenantId] });
      qc.invalidateQueries({ queryKey: ["/api/inventory/report", tenantId] });
    },
  });
}

export function useInventoryReport(period: number = 30, dateFrom?: string, dateTo?: string) {
  const tenantId = getActiveTenantId();
  const params = new URLSearchParams({ period: String(period) });
  if (dateFrom) params.set("dateFrom", dateFrom);
  if (dateTo) params.set("dateTo", dateTo);

  return useQuery<{ success: boolean; data: InventoryReportData }>({
    queryKey: ["/api/inventory/report", tenantId, period, dateFrom, dateTo],
    queryFn: () => apiFetch(`/api/inventory/report?${params.toString()}`),
    enabled: !!tenantId,
    staleTime: 60_000,
  });
}
