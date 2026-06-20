import type { BusinessCapabilities } from "@pos/application/business-flows";

export const SERVICE_CORE_FLOW_POLICY = {
  businessProfile: "service",
  baselineCheckout: true,
  allowsCreateAndPay: true,
  requiresOrderQueueForFullPayment: false,
  requiredCapabilitiesForFullPayment: [] as (keyof BusinessCapabilities)[],
  optionalCapabilities: ["orderQueue", "partialPayment", "multiPayment"] as (keyof BusinessCapabilities)[],
  futureOptionalModules: ["appointmentLifecycle", "serviceProgress", "labelPrinter"] as const,
} as const;

export function canServiceCoreCreateAndPay(capabilities: BusinessCapabilities): boolean {
  void capabilities;
  return SERVICE_CORE_FLOW_POLICY.allowsCreateAndPay;
}
