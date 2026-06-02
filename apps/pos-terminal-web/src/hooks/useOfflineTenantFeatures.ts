/**
 * useOfflineTenantFeatures — offline-first tenant features + order types hook.
 *
 * Strategy:
 *  1. Try server first.
 *  2. On success → persist to IndexedDB via tenantCache.
 *  3. On failure → fall back to IndexedDB so features/order-types remain
 *     available when the terminal is offline.
 *
 * Use this hook in the POS page, feature-gate checks, and anywhere you need
 * tenant configuration that must survive loss of connectivity.
 */

import { useQuery } from "@tanstack/react-query";
import { useNetworkStatus } from "@/hooks/useNetworkStatus";
import { getActiveTenantId } from "@/lib/tenant";
import { buildApiHeaders } from "@/lib/outlet";
import {
  getCachedOrderTypes,
  saveCachedOrderTypes,
  getCachedFeatures,
  saveCachedFeatures,
  updateTenantCachedAt,
  getTenantCachedAt,
} from "@pos/offline";
import type { OrderType } from "@pos/domain/orders/types";
import type { TenantFeature } from "@pos/domain/tenants/types";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface OfflineTenantFeaturesResult {
  orderTypes: OrderType[];
  features: TenantFeature[];
  isLoading: boolean;
  isFromCache: boolean;
  cacheAge: number | null;
  hasFeature: (key: string) => boolean;
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

export function useOfflineTenantFeatures(): OfflineTenantFeaturesResult {
  const tenantId = getActiveTenantId();
  const { isOnline } = useNetworkStatus();

  const orderTypesQuery = useQuery<{ orderTypes: OrderType[]; isFromCache: boolean }>({
    queryKey: ["offline-order-types", tenantId],
    staleTime: isOnline ? 10 * 60 * 1000 : Infinity,
    queryFn: async () => {
      try {
        const data = await fetchWithTenant("/api/orders/order-types");
        const list: OrderType[] = Array.isArray(data)
          ? data
          : (data?.orderTypes ?? data?.data?.orderTypes ?? []);
        await saveCachedOrderTypes(tenantId, list).catch(() => undefined);
        await updateTenantCachedAt(tenantId).catch(() => undefined);
        return { orderTypes: list, isFromCache: false };
      } catch {
        const cached = (await getCachedOrderTypes(tenantId)) as OrderType[];
        return { orderTypes: cached, isFromCache: cached.length > 0 };
      }
    },
  });

  const featuresQuery = useQuery<{ features: TenantFeature[]; isFromCache: boolean }>({
    queryKey: ["offline-features", tenantId],
    staleTime: isOnline ? 10 * 60 * 1000 : Infinity,
    queryFn: async () => {
      try {
        const data = await fetchWithTenant("/api/tenants/features");
        const list: TenantFeature[] =
          data?.features ?? data?.data?.features ?? (Array.isArray(data) ? data : []);
        await saveCachedFeatures(tenantId, list).catch(() => undefined);
        await updateTenantCachedAt(tenantId).catch(() => undefined);
        return { features: list, isFromCache: false };
      } catch {
        const cached = (await getCachedFeatures(tenantId)) as TenantFeature[];
        return { features: cached, isFromCache: cached.length > 0 };
      }
    },
  });

  const cacheAgeQuery = useQuery<number | null>({
    queryKey: ["offline-tenant-age", tenantId],
    staleTime: 60 * 1000,
    queryFn: async () => {
      const ts = await getTenantCachedAt(tenantId);
      if (!ts) return null;
      return Date.now() - new Date(ts).getTime();
    },
  });

  const featureSet = new Set<string>(
    (featuresQuery.data?.features ?? []).map((f: TenantFeature) => f.feature_code ?? "")
  );

  const isFromCache =
    (orderTypesQuery.data?.isFromCache ?? false) ||
    (featuresQuery.data?.isFromCache ?? false);

  return {
    orderTypes: orderTypesQuery.data?.orderTypes ?? [],
    features: featuresQuery.data?.features ?? [],
    isLoading: orderTypesQuery.isLoading || featuresQuery.isLoading,
    isFromCache,
    cacheAge: cacheAgeQuery.data ?? null,
    hasFeature: (key: string) => featureSet.has(key),
    error:
      (orderTypesQuery.error as Error | null) ??
      (featuresQuery.error as Error | null),
  };
}
