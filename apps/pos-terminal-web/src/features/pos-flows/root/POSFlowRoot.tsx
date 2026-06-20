import { CoreStandardPOSFlow } from "@/features/pos-flows/core";
import { FoodBeveragePOSFlow } from "@/features/pos-flows/food-beverage";
import { RetailStandardPOSFlow } from "@/features/pos-flows/retail";
import { ServiceCorePOSFlow } from "@/features/pos-flows/service";
import { resolvePOSFlowComponent } from "./resolvePOSFlowComponent";
import { useResolvedPOSBusinessProfile } from "./useResolvedPOSBusinessProfile";

export function POSFlowRoot() {
  const businessProfile = useResolvedPOSBusinessProfile();
  const flow = resolvePOSFlowComponent(businessProfile);

  if (flow === "retail_standard") return <RetailStandardPOSFlow />;
  if (flow === "food_beverage") return <FoodBeveragePOSFlow />;
  if (flow === "service") return <ServiceCorePOSFlow />;
  return <CoreStandardPOSFlow />;
}
