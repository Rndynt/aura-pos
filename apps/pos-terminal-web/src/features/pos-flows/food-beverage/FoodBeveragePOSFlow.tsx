import { RetailStandardPOSFlowView } from "@/features/pos-flows/retail";
import { useFoodBeveragePOSFlow } from "./useFoodBeveragePOSFlow";

export function FoodBeveragePOSFlow() {
  const flow = useFoodBeveragePOSFlow();
  return <RetailStandardPOSFlowView flow={flow} />;
}
