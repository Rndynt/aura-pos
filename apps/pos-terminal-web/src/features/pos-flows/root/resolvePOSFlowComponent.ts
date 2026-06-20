import type { BusinessFlowProfileId } from "@pos/domain/business-flows";

export type POSFlowComponentKey = "retail_standard" | "food_beverage" | "service" | "core_standard";

export function resolvePOSFlowComponent(profile: BusinessFlowProfileId | null | undefined): POSFlowComponentKey {
  if (profile === "retail_standard") return "retail_standard";
  if (profile === "food_beverage") return "food_beverage";
  if (profile === "service") return "service";
  return "core_standard";
}
