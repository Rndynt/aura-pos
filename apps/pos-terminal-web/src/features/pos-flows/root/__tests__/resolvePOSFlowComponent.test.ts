import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { resolvePOSFlowComponent } from "../resolvePOSFlowComponent";

describe("resolvePOSFlowComponent", () => {
  it("selects retail flow only for retail_standard", () => {
    assert.equal(resolvePOSFlowComponent("retail_standard"), "retail_standard");
  });

  it("keeps non-retail profiles on generic fallback", () => {
    assert.equal(resolvePOSFlowComponent("restaurant_table_service"), "generic_fallback");
    assert.equal(resolvePOSFlowComponent("cafe_counter"), "generic_fallback");
    assert.equal(resolvePOSFlowComponent("quick_service"), "generic_fallback");
    assert.equal(resolvePOSFlowComponent("service_business_later"), "generic_fallback");
  });

  it("keeps unknown/null profiles on generic fallback", () => {
    assert.equal(resolvePOSFlowComponent(null), "generic_fallback");
    assert.equal(resolvePOSFlowComponent(undefined), "generic_fallback");
  });
});
