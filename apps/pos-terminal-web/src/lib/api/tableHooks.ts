import { useQuery } from "@tanstack/react-query";
import { useTenant } from "@/context/TenantContext";
import type { Table } from "@shared/schema";

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

  return useQuery({
    queryKey: ["/api/tables", tenantId, status, floor],
    queryFn: async (): Promise<TablesResponse> => {
      const params = new URLSearchParams();
      if (status) params.append("status", status);
      if (floor) params.append("floor", floor);
      
      const response = await fetch(
        `/api/tables${params.toString() ? `?${params.toString()}` : ""}`,
        {
          headers: {
            "x-tenant-id": tenantId,
          },
        }
      );
      if (!response.ok) throw new Error("Failed to fetch tables");
      const json = await response.json();
      return json.data ?? json;
    },
    enabled: !!tenantId,
  });
}

export function useOpenOrders() {
  const { tenantId } = useTenant();

  return useQuery({
    queryKey: ["/api/orders/open", tenantId],
    queryFn: async (): Promise<OpenOrdersResponse> => {
      const response = await fetch(
        `/api/orders/open`,
        {
          headers: {
            "x-tenant-id": tenantId,
          },
        }
      );
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
