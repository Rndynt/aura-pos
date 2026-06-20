import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { canFoodBeverageCreateAndPay, FOOD_BEVERAGE_FLOW_POLICY } from "../foodBeverageFlowPolicy";

const emptyCapabilities = { tableService: false, floorPlan: false, kitchenOps: false, kds: false, orderQueue: false, splitBill: false, partialPayment: false, multiPayment: false };

describe("foodBeverageFlowPolicy", () => {
  it("allows baseline create-and-pay without optional capabilities", () => {
    assert.equal(FOOD_BEVERAGE_FLOW_POLICY.businessProfile, "food_beverage");
    assert.equal(FOOD_BEVERAGE_FLOW_POLICY.baselineCheckout, true);
    assert.equal(canFoodBeverageCreateAndPay(emptyCapabilities), true);
    assert.deepEqual(FOOD_BEVERAGE_FLOW_POLICY.requiredCapabilitiesForFullPayment, []);
    assert.equal(FOOD_BEVERAGE_FLOW_POLICY.requiresOrderQueueForFullPayment, false);
  });

  it("keeps restaurant/payment enhancements optional", () => {
    assert.deepEqual(FOOD_BEVERAGE_FLOW_POLICY.optionalCapabilities, ["tableService", "floorPlan", "kitchenOps", "kds", "orderQueue", "splitBill", "partialPayment", "multiPayment"]);
  });
});
