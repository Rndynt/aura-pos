/**
 * useOfflineProducts — offline-first product/category catalog hook.
 *
 * Strategy:
 *  1. Always try the server first (React Query manages stale-while-revalidate).
 *  2. On success → persist to IndexedDB via catalogCache.
 *  3. On network failure → fall back to IndexedDB; returns cached data so the
 *     POS page can open without internet.
 *
 * Use this hook anywhere you need offline-resilient product data.
 * The companion `useProducts()` in hooks/api/useProducts.ts covers the same
 * caching logic for product lists; this hook adds category awareness and
 * an explicit `isFromCache` flag so UIs can show a "stale data" warning.
 */

import { useQuery } from "@tanstack/react-query";
import { useNetworkStatus } from "@/hooks/useNetworkStatus";
import { getActiveTenantId } from "@/lib/tenant";
import { buildApiHeaders } from "@/lib/outlet";
import {
  getCachedProducts,
  getCachedCategories,
  saveCachedProducts,
  saveCachedCategories,
  updateCatalogCachedAt,
  getCatalogCachedAt,
} from "@pos/offline";
import type { Product, ProductCategory } from "@pos/domain/catalog/types";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface OfflineProductsResult {
  products: Product[];
  categories: ProductCategory[];
  isLoading: boolean;
  isFromCache: boolean;
  cacheAge: number | null;
  error: Error | null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function fetchWithTenant(url: string) {
  const res = await fetch(url, {
    headers: buildApiHeaders(),
    credentials: "include",
  });
  if (!res.ok) throw new Error(`${res.status}: ${res.statusText}`);
  return res.json();
}

// ─── Hook ────────────────────────────────────────────────────────────────────

export function useOfflineProducts(): OfflineProductsResult {
  const tenantId = getActiveTenantId();
  const { isOnline } = useNetworkStatus();

  const productsQuery = useQuery<{ products: Product[]; isFromCache: boolean }>({
    queryKey: ["offline-products", tenantId],
    staleTime: isOnline ? 5 * 60 * 1000 : Infinity,
    queryFn: async () => {
      try {
        const res = await fetchWithTenant("/api/catalog/products");
        const list: Product[] = res?.data?.products ?? res?.products ?? [];
        await saveCachedProducts(tenantId, list).catch(() => undefined);
        await updateCatalogCachedAt(tenantId).catch(() => undefined);
        return { products: list, isFromCache: false };
      } catch {
        const cached = (await getCachedProducts(tenantId)) as Product[];
        if (cached.length > 0) return { products: cached, isFromCache: true };
        return { products: [], isFromCache: true };
      }
    },
  });

  const categoriesQuery = useQuery<{ categories: ProductCategory[]; isFromCache: boolean }>({
    queryKey: ["offline-categories", tenantId],
    staleTime: isOnline ? 5 * 60 * 1000 : Infinity,
    queryFn: async () => {
      try {
        const res = await fetchWithTenant("/api/catalog/categories");
        const list: ProductCategory[] = res?.data?.categories ?? res?.categories ?? res ?? [];
        await saveCachedCategories(tenantId, list).catch(() => undefined);
        return { categories: list, isFromCache: false };
      } catch {
        const cached = (await getCachedCategories(tenantId)) as ProductCategory[];
        return { categories: cached, isFromCache: cached.length > 0 };
      }
    },
  });

  const cacheAgeQuery = useQuery<number | null>({
    queryKey: ["offline-catalog-age", tenantId],
    staleTime: 60 * 1000,
    queryFn: async () => {
      const ts = await getCatalogCachedAt(tenantId);
      if (!ts) return null;
      return Date.now() - new Date(ts).getTime();
    },
  });

  const isFromCache =
    (productsQuery.data?.isFromCache ?? false) ||
    (categoriesQuery.data?.isFromCache ?? false);

  return {
    products: productsQuery.data?.products ?? [],
    categories: categoriesQuery.data?.categories ?? [],
    isLoading: productsQuery.isLoading || categoriesQuery.isLoading,
    isFromCache,
    cacheAge: cacheAgeQuery.data ?? null,
    error: (productsQuery.error as Error | null) ?? (categoriesQuery.error as Error | null),
  };
}
