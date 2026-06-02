import { useQuery } from "@tanstack/react-query";
import type { Tenant, TenantFeature, TenantModuleConfig } from "@pos/domain/tenants/types";

/**
 * Tenant profile response from API
 */
export type TenantProfile = {
  tenant: Tenant;
  features: TenantFeature[];
  moduleConfig: TenantModuleConfig;
};

/**
 * API response wrapper
 */
type TenantProfileResponse = {
  success: boolean;
  data: TenantProfile;
};

/**
 * Fetch tenant profile from API
 */
async function fetchTenantProfile(): Promise<TenantProfile> {
  const res = await fetch("/api/tenants/profile", {
    credentials: "include",
  });

  if (!res.ok) {
    const text = (await res.text()) || res.statusText;
    throw new Error(`${res.status}: ${text}`);
  }

  const response: TenantProfileResponse = await res.json();
  return response.data;
}

/**
 * Hook to fetch tenant profile including business type and module configuration
 * 
 * @param tenantId - The ID of the tenant to fetch profile for
 * @returns Query result with tenant profile data
 * 
 * @example
 * ```tsx
 * const { data, isLoading, error } = useTenantProfile(tenantId);
 * 
 * if (isLoading) return <div>Loading...</div>;
 * if (error) return <div>Error loading profile</div>;
 * 
 * console.log(data.tenant.business_type); // "CAFE_RESTAURANT"
 * console.log(data.moduleConfig.enable_table_management); // true
 * ```
 */
export function useTenantProfile(tenantId: string) {
  return useQuery<TenantProfile>({
    queryKey: ["/api/tenants/profile", tenantId],
    queryFn: () => fetchTenantProfile(),
    enabled: !!tenantId,
  });
}
