/**
 * useTenantProfile — tenant identity + effective entitlements.
 *
 * Backed by GET /api/me/entitlements (the single entitlement SOT endpoint).
 * Retained as a thin wrapper over useEntitlements so existing callers can read
 * `data.tenant.*`. No legacy feature/module tables are read here.
 */

import { useQuery } from "@tanstack/react-query";
import { buildApiHeaders } from "@/lib/outlet";
import type { EntitlementProfile } from "./useEntitlements";

export type TenantProfile = EntitlementProfile;

type TenantProfileResponse = {
  success: boolean;
  data: TenantProfile;
};

async function fetchTenantProfile(): Promise<TenantProfile> {
  const res = await fetch("/api/me/entitlements", {
    headers: buildApiHeaders(),
    credentials: "include",
  });

  if (!res.ok) {
    const text = (await res.text()) || res.statusText;
    throw new Error(`${res.status}: ${text}`);
  }

  const response: TenantProfileResponse = await res.json();
  return response.data;
}

export function useTenantProfile(tenantId: string) {
  return useQuery<TenantProfile>({
    queryKey: ["/api/me/entitlements", tenantId],
    queryFn: () => fetchTenantProfile(),
    enabled: !!tenantId,
    staleTime: 30_000,
  });
}
