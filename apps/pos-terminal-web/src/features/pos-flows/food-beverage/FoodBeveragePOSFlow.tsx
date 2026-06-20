import { RetailStandardPOSFlowView } from "@/features/pos-flows/retail";
import { FoodBeverageOptionalPanels } from "./FoodBeverageOptionalPanels";
import { useFoodBeveragePOSFlow } from "./useFoodBeveragePOSFlow";

export function FoodBeveragePOSFlow() {
  const flow = useFoodBeveragePOSFlow();
  return (
    <div data-testid="food-beverage-pos-flow">
      <FoodBeverageOptionalPanels capabilities={flow.capabilities} />
      <RetailStandardPOSFlowView flow={flow} />
    </div>
  );
}
