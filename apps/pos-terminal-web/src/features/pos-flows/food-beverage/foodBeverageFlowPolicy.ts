import type { BusinessCapabilities } from "@pos/application/business-flows";

export const FOOD_BEVERAGE_FLOW_POLICY = {
  businessProfile: "food_beverage",
  baselineCheckout: true,
  allowsCreateAndPay: true,
  requiresOrderQueueForFullPayment: false,
  requiredCapabilitiesForFullPayment: [] as (keyof BusinessCapabilities)[],
  optionalCapabilities: [
    "tableService",
    "floorPlan",
    "kitchenOps",
    "kds",
    "orderQueue",
    "splitBill",
    "partialPayment",
    "multiPayment",
  ] as (keyof BusinessCapabilities)[],
} as const;

export function canFoodBeverageCreateAndPay(capabilities: BusinessCapabilities): boolean {
  void capabilities;
  return FOOD_BEVERAGE_FLOW_POLICY.allowsCreateAndPay;
}
