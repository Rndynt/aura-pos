import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTenant } from "@/context/TenantContext";
import type { Outlet } from "@/context/OutletContext";
import { getActiveOutletId } from "@/lib/outlet";

type OutletsResponse = { outlets: Outlet[] };

type CreateOutletBody = {
  name: string;
  slug: string;
  address?: string;
  phone?: string;
};

type UpdateOutletBody = Partial<CreateOutletBody & { isActive: boolean }>;

function apiHeaders(tenantId: string): Record<string, string> {
  return { "x-tenant-id": tenantId, "Content-Type": "application/json" };
}

export function useOutlets() {
  const { tenantId } = useTenant();

  return useQuery<OutletsResponse>({
    queryKey: ["/api/outlets", tenantId],
    queryFn: async () => {
      const res = await fetch("/api/outlets", {
        headers: { "x-tenant-id": tenantId },
        credentials: "include",
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    enabled: !!tenantId,
  });
}

export function useCreateOutlet() {
  const { tenantId } = useTenant();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (body: CreateOutletBody) => {
      const res = await fetch("/api/outlets", {
        method: "POST",
        headers: apiHeaders(tenantId),
        credentials: "include",
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: res.statusText }));
        throw new Error(err.message ?? res.statusText);
      }
      return res.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/outlets", tenantId] }),
  });
}

export function useUpdateOutlet() {
  const { tenantId } = useTenant();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...body }: UpdateOutletBody & { id: string }) => {
      const res = await fetch(`/api/outlets/${id}`, {
        method: "PATCH",
        headers: apiHeaders(tenantId),
        credentials: "include",
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: res.statusText }));
        throw new Error(err.message ?? res.statusText);
      }
      return res.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/outlets", tenantId] }),
  });
}

export function useDeleteOutlet() {
  const { tenantId } = useTenant();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/outlets/${id}`, {
        method: "DELETE",
        headers: { "x-tenant-id": tenantId },
        credentials: "include",
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: res.statusText }));
        throw new Error(err.message ?? res.statusText);
      }
      return res.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/outlets", tenantId] }),
  });
}

export type OutletProductConfig = {
  id: string;
  outletId: string;
  productId: string;
  isAvailable: boolean;
};

export function useOutletProductConfigs() {
  const { tenantId } = useTenant();
  return useQuery<{ configs: OutletProductConfig[] }>({
    queryKey: ["/api/outlets/product-configs", tenantId],
    queryFn: async () => {
      const res = await fetch("/api/outlets/product-configs", {
        headers: { "x-tenant-id": tenantId },
        credentials: "include",
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    enabled: !!tenantId,
  });
}

export function useToggleOutletProductConfig() {
  const { tenantId } = useTenant();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({
      outletId,
      productId,
      isAvailable,
    }: {
      outletId: string;
      productId: string;
      isAvailable: boolean;
    }) => {
      const res = await fetch(`/api/outlets/${outletId}/product-configs/${productId}`, {
        method: "PUT",
        headers: { "x-tenant-id": tenantId, "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ isAvailable }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: res.statusText }));
        throw new Error(err.message ?? res.statusText);
      }
      return res.json();
    },
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ["/api/outlets/product-configs", tenantId] }),
  });
}
