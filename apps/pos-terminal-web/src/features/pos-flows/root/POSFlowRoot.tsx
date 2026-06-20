import { RetailStandardPOSFlow } from "@/features/pos-flows/retail";
import { RestaurantTableServicePOSFlow } from "@/features/pos-flows/restaurant";
import { UnsupportedPOSFlow } from "@/features/pos-flows/unsupported";
import { resolvePOSFlowComponent } from "./resolvePOSFlowComponent";
import { useResolvedPOSBusinessProfile } from "./useResolvedPOSBusinessProfile";

export function POSFlowRoot() {
  const businessProfile = useResolvedPOSBusinessProfile();
  const flow = resolvePOSFlowComponent(businessProfile);

  if (flow === "retail_standard") return <RetailStandardPOSFlow />;
  if (flow === "restaurant_table_service") return <RestaurantTableServicePOSFlow />;
  return <UnsupportedPOSFlow profile={businessProfile ?? "unknown"} />;
}
