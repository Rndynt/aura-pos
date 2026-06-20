import { useTenant } from "@/context/TenantContext";
import { useEntitlements } from "@/hooks/api/useEntitlements";
import { resolvePOSFlowCapabilities } from "@/features/pos-flows/shared/resolvePOSFlowCapabilities";
import { useRetailStandardPOSFlow } from "@/features/pos-flows/retail/useRetailStandardPOSFlow";

export function useFoodBeveragePOSFlow() {
  const baseFlow = useRetailStandardPOSFlow();
  const { tenantId } = useTenant();
  const { entitlements } = useEntitlements(tenantId);
  const capabilities = resolvePOSFlowCapabilities(entitlements);

  return {
    ...baseFlow,
    capabilities,
    hasPartialPayment: capabilities.partialPayment,
    hasMultiPayment: capabilities.multiPayment,
    hasSplitBill: capabilities.splitBill,
  };
}
