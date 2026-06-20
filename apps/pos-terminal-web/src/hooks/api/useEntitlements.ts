/**
 * useEntitlements — single frontend access helper for commercial entitlements.
 *
 * Consumes GET /api/me/entitlements (effective entitlements derived from the
 * backend SOT + tenant_entitlements grants) with an offline IndexedDB fallback.
 * There is NO frontend plan/module/feature catalog — `can()` reads the
 * effective entitlement map only.
 */

import { useQuery } from "@tanstack/react-query";
import { getActiveTenantId } from "@/lib/tenant";
import { buildApiHeaders } from "@/lib/outlet";
import { saveCachedEntitlements, getCachedEntitlements } from "@pos/offline";
import type { EntitlementCode, EntitlementCatalog } from "@pos/application/entitlements";
import type { BusinessFlowProfileId } from "@pos/domain/business-flows";

export type EntitlementMap = Partial<Record<EntitlementCode, boolean>>;

export type EntitlementCatalogResponse = {
  plans: EntitlementCatalog["plans"];
  entitlements: EntitlementCatalog["entitlements"];
  offers: EntitlementCatalog["offers"];
  businessTypes: EntitlementCatalog["businessTypes"];
};

export type EntitlementTenant = {
  id: string;
  name: string;
  slug?: string;
  business_name?: string | null;
  business_address?: string | null;
  business_phone?: string | null;
  business_email?: string | null;
  businessType: string;
  business_type: string;
  businessProfile?: BusinessFlowProfileId | null;
  business_profile?: BusinessFlowProfileId | null;
  businessProfileSource?: "business_type_mapping" | "core_fallback";
  business_profile_source?: "business_type_mapping" | "core_fallback";
  planTier: string;
  plan_tier: string;
  subscription_status?: string;
  currency?: string;
  timezone?: string;
  locale?: string;
};

export type EntitlementGrant = {
  entitlement_code: string;
  status: "active" | "expired" | "cancelled";
  source: string;
  expires_at?: string | null;
};

export type EntitlementProfile = {
  tenant: EntitlementTenant;
  entitlements: EntitlementMap;
  grants: EntitlementGrant[];
  catalog: EntitlementCatalogResponse;
};

type EntitlementProfileResponse = {
  success: boolean;
  data: EntitlementProfile;
};

async function fetchEntitlements(tenantId: string): Promise<EntitlementProfile> {
  try {
    const res = await fetch("/api/me/entitlements", {
      headers: buildApiHeaders(),
      credentials: "include",
    });
    if (!res.ok) {
      const text = (await res.text()) || res.statusText;
      throw new Error(`${res.status}: ${text}`);
    }
    const body: EntitlementProfileResponse = await res.json();
    void saveCachedEntitlements(tenantId, body.data.entitlements as Record<string, boolean>).catch(() => undefined);
    return body.data;
  } catch (err) {
    const cached = await getCachedEntitlements(tenantId);
    if (cached) {
      return {
        tenant: {
          id: tenantId,
          name: "",
          businessType: "",
          business_type: "",
          businessProfile: null,
          business_profile: null,
          businessProfileSource: "core_fallback",
          business_profile_source: "core_fallback",
          planTier: "",
          plan_tier: "",
        },
        entitlements: cached as EntitlementMap,
        grants: [],
        catalog: { plans: {}, entitlements: {}, offers: {}, businessTypes: {} } as any,
      };
    }
    throw err;
  }
}

export type UseEntitlementsResult = {
  tenant: EntitlementTenant | null;
  entitlements: EntitlementMap;
  grants: EntitlementGrant[];
  catalog: EntitlementCatalogResponse | null;
  can: (code: EntitlementCode | string) => boolean;
  isLoading: boolean;
  error: Error | null;
};

export function useEntitlements(tenantId?: string): UseEntitlementsResult {
  const resolvedTenantId = tenantId || getActiveTenantId();

  const { data, isLoading, error } = useQuery<EntitlementProfile>({
    queryKey: ["/api/me/entitlements", resolvedTenantId],
    queryFn: () => fetchEntitlements(resolvedTenantId),
    enabled: !!resolvedTenantId,
    staleTime: 30_000,
  });

  const entitlements = data?.entitlements ?? {};

  return {
    tenant: data?.tenant ?? null,
    entitlements,
    grants: data?.grants ?? [],
    catalog: data?.catalog ?? null,
    can: (code) => {
      if (isLoading) return false;
      return entitlements[code as EntitlementCode] === true;
    },
    isLoading,
    error: (error as Error | null) ?? null,
  };
}
