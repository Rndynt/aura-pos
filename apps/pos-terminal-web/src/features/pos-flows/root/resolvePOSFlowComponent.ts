import type { BusinessFlowProfileId } from "@pos/domain/business-flows";

export type POSFlowComponentKey = "retail_standard" | "restaurant_table_service" | "unsupported";

export function resolvePOSFlowComponent(profile: BusinessFlowProfileId | null | undefined): POSFlowComponentKey {
  if (profile === "retail_standard") return "retail_standard";
  if (profile === "restaurant_table_service") return "restaurant_table_service";
  return "unsupported";
}
