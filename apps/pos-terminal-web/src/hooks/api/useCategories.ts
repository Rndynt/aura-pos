import { useMutation, useQuery } from '@tanstack/react-query';
import { queryClient } from '@/lib/queryClient';
import { getActiveTenantId } from '@/lib/tenant';
import { buildApiHeaders, getActiveOutletId } from '@/lib/outlet';
import {
  getCachedCategories,
  saveCachedCategories,
  updateCatalogCachedAt,
} from '@pos/offline';

async function req(url: string, init?: RequestInit) {
  const res = await fetch(url, {
    credentials: 'include',
    headers: buildApiHeaders(init?.headers as Record<string, string> | undefined),
    ...init,
  });
  const payload = await res.json().catch(() => null);
  if (!res.ok || (payload && payload.success === false)) {
    const message =
      payload?.error?.message ||
      payload?.message ||
      payload?.error ||
      (await res.text().catch(() => 'Request failed'));
    throw new Error(message || 'Request failed');
  }
  return payload;
}

export type CategoryItem = { id: string; name: string; is_active: boolean; display_order: number };

export function useCategories() {
  const tenantId = getActiveTenantId();
  const outletId = getActiveOutletId();
  return useQuery<CategoryItem[]>({
    queryKey: ['/api/catalog/categories', tenantId, outletId],
    queryFn: async () => {
      try {
        const data = await req('/api/catalog/categories');
        const categories: CategoryItem[] = data?.data?.categories ?? [];
        saveCachedCategories(tenantId, categories).catch(() => undefined);
        updateCatalogCachedAt(tenantId).catch(() => undefined);
        return categories;
      } catch (err) {
        const cached = await getCachedCategories(tenantId) as CategoryItem[];
        if (cached.length > 0) return cached;
        throw err;
      }
    },
  });
}

export function useRenameCategory() {
  return useMutation({
    mutationFn: (payload: { old_name: string; new_name: string }) =>
      req('/api/catalog/categories', { method: 'PATCH', body: JSON.stringify(payload) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/catalog/categories'] });
      queryClient.invalidateQueries({ queryKey: ['/api/catalog/products'] });
    },
  });
}

export function useCreateCategory() {
  return useMutation({
    mutationFn: (payload: { name: string; description?: string }) =>
      req('/api/catalog/categories', { method: 'POST', body: JSON.stringify(payload) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/catalog/categories'] });
      queryClient.invalidateQueries({ queryKey: ['/api/catalog/products'] });
    },
  });
}

export function useDeleteCategory() {
  return useMutation({
    mutationFn: (payload: { id?: string; name?: string; fallback_name: string }) =>
      req('/api/catalog/categories', { method: 'DELETE', body: JSON.stringify(payload) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/catalog/categories'] });
      queryClient.invalidateQueries({ queryKey: ['/api/catalog/products'] });
    },
  });
}

export function useReorderCategories() {
  return useMutation({
    mutationFn: (payload: { ordered_ids: string[] }) =>
      req('/api/catalog/categories/reorder', { method: 'PUT', body: JSON.stringify(payload) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/catalog/categories'] });
      queryClient.invalidateQueries({ queryKey: ['/api/catalog/products'] });
    },
  });
}
