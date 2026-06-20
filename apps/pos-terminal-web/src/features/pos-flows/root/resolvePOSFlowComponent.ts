import type { BusinessFlowProfileId } from "@pos/domain/business-flows";

export type POSFlowComponentKey = "retail_standard" | "generic_fallback";

export function resolvePOSFlowComponent(profile: BusinessFlowProfileId | null | undefined): POSFlowComponentKey {
  return profile === "retail_standard" ? "retail_standard" : "generic_fallback";
}
