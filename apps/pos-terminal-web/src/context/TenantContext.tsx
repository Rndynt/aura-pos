import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { resolveInitialTenantId, setActiveTenantId } from "@/lib/tenant";
import { useTenantProfile } from "@/hooks/api/useTenantProfile";
import type { BusinessType } from "@pos/core";
import type { TenantModuleConfig } from "@pos/domain/tenants/types";

const DEMO_TENANT_ID = "demo-tenant";

/**
 * On initial load (or page refresh), resolve the tenantId from the active
 * session. This handles the case where the user is already logged in but the
 * localStorage still holds the "demo-tenant" fallback.
 */
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

export type TenantContextValue = {
  tenantId: string;
  setTenantId: (tenantId: string) => void;
  business_type: BusinessType | null;
  moduleConfig: TenantModuleConfig | null;
  hasModule: (moduleName: keyof TenantModuleConfig) => boolean;
  isLoading: boolean;
  error: Error | null;
};

const TenantContext = createContext<TenantContextValue | undefined>(undefined);

export function TenantProvider({ children }: { children: React.ReactNode }) {
  const [tenantId, updateTenantId] = useState(() => resolveInitialTenantId());

  const setTenantId = useCallback((nextTenantId: string) => {
    updateTenantId(nextTenantId);
    setActiveTenantId(nextTenantId);
  }, []);

  // On every page load, if we're still on the demo fallback, try to resolve
  // the real tenant from the active session cookie.
  useEffect(() => {
    if (tenantId !== DEMO_TENANT_ID) return;
    syncTenantFromSession().then((sessionTenantId) => {
      if (sessionTenantId && sessionTenantId !== tenantId) {
        setTenantId(sessionTenantId);
      }
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const { data: profile, isLoading, error } = useTenantProfile(tenantId);

  const hasModule = useCallback(
    (moduleName: keyof TenantModuleConfig): boolean => {
      if (!profile?.moduleConfig) {
        return false;
      }

      const value = profile.moduleConfig[moduleName];
      
      if (typeof value === "boolean") {
        return value;
      }

      return false;
    },
    [profile]
  );

  const value = useMemo(
    () => ({
      tenantId,
      setTenantId,
      business_type: profile?.tenant.business_type ?? null,
      moduleConfig: profile?.moduleConfig ?? null,
      hasModule,
      isLoading,
      error: error as Error | null,
    }),
    [tenantId, setTenantId, profile, hasModule, isLoading, error]
  );

  return <TenantContext.Provider value={value}>{children}</TenantContext.Provider>;
}

export function useTenant() {
  const context = useContext(TenantContext);

  if (!context) {
    throw new Error("useTenant must be used within a TenantProvider");
  }

  return context;
}
