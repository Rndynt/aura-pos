import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { canServiceCoreCreateAndPay, SERVICE_CORE_FLOW_POLICY } from "../serviceCoreFlowPolicy";

const emptyCapabilities = { tableService: false, floorPlan: false, kitchenOps: false, kds: false, orderQueue: false, splitBill: false, partialPayment: false, multiPayment: false };

describe("serviceCoreFlowPolicy", () => {
  it("allows baseline create-and-pay without optional capabilities", () => {
    assert.equal(SERVICE_CORE_FLOW_POLICY.businessProfile, "service");
    assert.equal(SERVICE_CORE_FLOW_POLICY.baselineCheckout, true);
    assert.equal(canServiceCoreCreateAndPay(emptyCapabilities), true);
    assert.deepEqual(SERVICE_CORE_FLOW_POLICY.requiredCapabilitiesForFullPayment, []);
  });

  it("keeps service lifecycle enhancements optional/future", () => {
    assert.deepEqual(SERVICE_CORE_FLOW_POLICY.optionalCapabilities, ["orderQueue", "partialPayment", "multiPayment"]);
    assert.ok(SERVICE_CORE_FLOW_POLICY.futureOptionalModules.includes("appointmentLifecycle"));
  });
});
