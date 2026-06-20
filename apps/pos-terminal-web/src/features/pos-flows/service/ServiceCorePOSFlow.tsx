import { RetailStandardPOSFlowView } from "@/features/pos-flows/retail";
import { ServiceOptionalPanels } from "./ServiceOptionalPanels";
import { useServiceCorePOSFlow } from "./useServiceCorePOSFlow";

export function ServiceCorePOSFlow() {
  const flow = useServiceCorePOSFlow();
  return (
    <div data-testid="service-core-pos-flow">
      <ServiceOptionalPanels capabilities={flow.capabilities} />
      <RetailStandardPOSFlowView flow={flow} />
    </div>
  );
}
