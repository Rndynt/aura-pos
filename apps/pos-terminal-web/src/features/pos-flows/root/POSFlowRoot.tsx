import GenericPOSPage from "@/features/pos/pages/GenericPOSPage";
import { RetailStandardPOSFlow } from "@/features/pos-flows/retail";
import { resolvePOSFlowComponent } from "./resolvePOSFlowComponent";
import { useResolvedPOSBusinessProfile } from "./useResolvedPOSBusinessProfile";

export function POSFlowRoot() {
  const businessProfile = useResolvedPOSBusinessProfile();
  const flow = resolvePOSFlowComponent(businessProfile);

  if (flow === "retail_standard") {
    return <RetailStandardPOSFlow />;
  }

  return <GenericPOSPage />;
}
