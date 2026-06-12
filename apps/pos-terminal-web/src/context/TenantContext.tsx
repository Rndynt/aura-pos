import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { clearActiveTenantCache, resolveInitialTenantId, setActiveTenantId } from "@/lib/tenant";
import { getSubdomainSlug, resolveTenantBySlug } from "@/lib/subdomain";
import { clearActiveOutletId } from "@/lib/outlet";
import { useEntitlements, type EntitlementMap } from "@/hooks/api/useEntitlements";
import type { EntitlementCode } from "@pos/application/entitlements";

async function syncTenantFromSession(): Promise<string | null> {
  try {
    const res = await fetch("/api/auth/me", { credentials: "include" });
    if (!res.ok) return null;
    const body = await res.json();
    return body?.data?.tenantId ?? null;
  } catch {
    return null;
  }
}

/**
 * Resolve tenantId dengan prioritas:
 * 1. Subdomain ({slug}.aurapos.my.id)
 * 2. Session cookie (login)
 * 3. localStorage fallback
 */
async function resolveActiveTenant(): Promise<string | null> {
  // 1. Subdomain
  const slug = getSubdomainSlug();
  if (slug) {
    const id = await resolveTenantBySlug(slug);
    if (id) return id;
  }
  // 2. Session
  return syncTenantFromSession();
}

export type TenantContextValue = {
  tenantId: string;
  setTenantId: (tenantId: string) => void;
  business_type: string | null;
  planTier: string | null;
  entitlements: EntitlementMap;
  /** Returns true if the tenant has the given commercial entitlement active. */
  can: (entitlementCode: EntitlementCode | string) => boolean;
  isLoading: boolean;
  error: Error | null;
};

const TenantContext = createContext<TenantContextValue | undefined>(undefined);

export function TenantProvider({ children }: { children: React.ReactNode }) {
  const [tenantId, updateTenantId] = useState(() => resolveInitialTenantId());
  // True while the async subdomain/session resolution hasn't finished yet.
  // During this window, the tenantId may still be the localStorage/fallback value
  // (which could be a stale demo tenant), so nav items must NOT be shown yet.
  const [tenantResolving, setTenantResolving] = useState(true);

  const setTenantId = useCallback((nextTenantId: string) => {
    updateTenantId(nextTenantId);
    setActiveTenantId(nextTenantId);
  }, []);

  // On every page load: subdomain → session. localStorage is display/cache only.
  useEffect(() => {
    resolveActiveTenant().then((id) => {
      if (id) {
        if (id !== tenantId) {
          clearActiveOutletId();
          setTenantId(id);
        } else {
          setActiveTenantId(id);
        }
        return;
      }

      clearActiveTenantCache();
      clearActiveOutletId();
      updateTenantId("");
    }).finally(() => {
      setTenantResolving(false);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const { tenant, entitlements, can, isLoading: entitlementsLoading, error } = useEntitlements(tenantId);

  // isLoading is true while EITHER the tenant identity is still being resolved
  // OR the entitlement fetch hasn't completed. Both must be done before
  // rendering any entitlement-gated nav items.
  const isLoading = tenantResolving || entitlementsLoading;

  const value = useMemo(
    () => ({
      tenantId,
      setTenantId,
      business_type: tenant?.business_type ?? null,
      planTier: tenant?.plan_tier ?? null,
      entitlements,
      can,
      isLoading,
      error,
    }),
    [tenantId, setTenantId, tenant, entitlements, can, isLoading, error]
  );

  return <TenantContext.Provider value={value}>{children}</TenantContext.Provider>;
}

export function useTenant() {
  const context = useContext(TenantContext);
  if (!context) throw new Error("useTenant must be used within a TenantProvider");
  return context;
}
