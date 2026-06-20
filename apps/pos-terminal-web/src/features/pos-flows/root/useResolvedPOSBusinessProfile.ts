import { useTenant } from "@/context/TenantContext";
import { useTenantProfile } from "@/hooks/api/useTenantProfile";
import type { BusinessFlowProfileId } from "@pos/domain/business-flows";

export function useResolvedPOSBusinessProfile(): BusinessFlowProfileId | null {
  const { tenantId } = useTenant();
  const { data: tenantProfile } = useTenantProfile(tenantId);
  return tenantProfile?.tenant?.businessProfile ?? tenantProfile?.tenant?.business_profile ?? null;
}
