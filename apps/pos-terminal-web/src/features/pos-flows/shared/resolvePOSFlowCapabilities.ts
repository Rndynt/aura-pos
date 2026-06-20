import { resolveBusinessCapabilities, type BusinessCapabilities, type EntitlementLookup } from "@pos/application/business-flows";

export type POSFlowCapabilityState = "hidden" | "disabled" | "enabled" | "not_implemented";

export type POSFlowOptionalPanelState = {
  capability: keyof BusinessCapabilities;
  label: string;
  state: POSFlowCapabilityState;
  message: string;
};

export function resolvePOSFlowCapabilities(entitlements: EntitlementLookup): BusinessCapabilities & { baselineCheckout: true } {
  return {
    ...resolveBusinessCapabilities(entitlements),
    baselineCheckout: true,
  };
}
