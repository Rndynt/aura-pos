import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { clearActiveTenantCache, resolveInitialTenantId, setActiveTenantId } from "@/lib/tenant";
import { getSubdomainSlug, resolveTenantBySlug } from "@/lib/subdomain";
import { clearActiveOutletId } from "@/lib/outlet";
import { useTenantProfile } from "@/hooks/api/useTenantProfile";
import type { BusinessType } from "@pos/core";
import type { TenantModuleConfig } from "@pos/domain/tenants/types";
import { MODULE_REQUIRED_PLAN, PLAN_RANK, type PlanTier } from "@/lib/featureCatalog";

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

export type { PlanTier };

export type TenantContextValue = {
  tenantId: string;
  setTenantId: (tenantId: string) => void;
  business_type: BusinessType | null;
  planTier: PlanTier | null;
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
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const { data: profile, isLoading, error } = useTenantProfile(tenantId);

  const hasModule = useCallback(
    (moduleName: keyof TenantModuleConfig): boolean => {
      if (!profile?.moduleConfig) return false;

      // Plan-tier ceiling derived from MODULE_CATALOG_DATA in featureCatalog.ts.
      // No hardcoded lists here — add new modules to featureCatalog.ts only.
      const tenantPlan = normalisePlanTier(profile.tenant.plan_tier);
      const required = MODULE_REQUIRED_PLAN[moduleName as string];
      if (required && PLAN_RANK[tenantPlan] < PLAN_RANK[required]) return false;

      const value = profile.moduleConfig[moduleName];
      return typeof value === "boolean" ? value : false;
    },
    [profile]
  );

  const planTier = useMemo(
    (): PlanTier | null => (profile ? normalisePlanTier(profile.tenant.plan_tier) : null),
    [profile]
  );

  const value = useMemo(
    () => ({
      tenantId,
      setTenantId,
      business_type: profile?.tenant.business_type ?? null,
      planTier,
      moduleConfig: profile?.moduleConfig ?? null,
      hasModule,
      isLoading,
      error: error as Error | null,
    }),
    [tenantId, setTenantId, profile, planTier, hasModule, isLoading, error]
  );

  return <TenantContext.Provider value={value}>{children}</TenantContext.Provider>;
}

export function useTenant() {
  const context = useContext(TenantContext);
  if (!context) throw new Error("useTenant must be used within a TenantProvider");
  return context;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function normalisePlanTier(raw: string | null | undefined): PlanTier {
  if (raw === "free" || raw === "growth" || raw === "pro") return raw;
  // Legacy seed values
  if (raw === "premium" || raw === "standard") return "growth";
  return "free";
}
