import { useQuery } from "@tanstack/react-query";
import { useTenant } from "@/context/TenantContext";
import { buildApiHeaders, getActiveOutletId } from "@/lib/outlet";
import type { Table } from "@pos/domain/seating";
import { saveCachedTables } from "@pos/offline";

interface TablesResponse {
  tables: Table[];
  total: number;
}

interface OrderItem {
  id: string;
  productName: string;
  quantity: number;
  unitPrice: string;
  itemSubtotal: string;
}

interface Order {
  id: string;
  orderNumber: string;
  tableNumber: string;
  status: string;
  subtotal: string;
  taxAmount: string;
  serviceChargeAmount: string;
  total: string;
  paymentStatus: string;
  customerName?: string;
  orderItems?: OrderItem[];
}

interface OpenOrdersResponse {
  orders: Order[];
}

interface ApiResponse<T> {
  success: boolean;
  data: T;
}

export function useTables(status?: string, floor?: string) {
  const { tenantId } = useTenant();
  const outletId = getActiveOutletId();

  return useQuery({
    queryKey: ["/api/tables", tenantId, outletId, status, floor],
    queryFn: async (): Promise<TablesResponse> => {
      const params = new URLSearchParams();
      if (status) params.append("status", status);
      if (floor) params.append("floor", floor);
      
      const outletId = getActiveOutletId();
      const outletHeaders = buildApiHeaders();
      const response = await fetch(
        `/api/tables${params.toString() ? `?${params.toString()}` : ""}`,
        { headers: outletHeaders, credentials: "include" }
      );
      if (!response.ok) throw new Error("Failed to fetch tables");
      const json = await response.json();
      const result: TablesResponse = json.data ?? json;
      // Populate offline cache (fire-and-forget)
      saveCachedTables(tenantId, result.tables ?? []).catch(() => undefined);
      return result;
    },
    enabled: !!tenantId,
  });
}

export function useOpenOrders() {
  const { tenantId } = useTenant();
  const outletId = getActiveOutletId();

  return useQuery({
    queryKey: ["/api/orders/open", tenantId, outletId],
    queryFn: async (): Promise<OpenOrdersResponse> => {
      const ordersHeaders = buildApiHeaders();
      const response = await fetch(`/api/orders/open`, { headers: ordersHeaders, credentials: "include" });
      if (!response.ok) throw new Error("Failed to fetch open orders");
      const json = await response.json() as ApiResponse<OpenOrdersResponse>;
      return json.data;
    },
    enabled: !!tenantId,
  });
}

export function useAvailableTables() {
  return useTables("available");
}
