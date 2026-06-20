import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { resolvePOSFlowComponent } from "../resolvePOSFlowComponent";

describe("resolvePOSFlowComponent", () => {
  it("routes supported profiles to explicit adapters", () => {
    assert.equal(resolvePOSFlowComponent("retail_standard"), "retail_standard");
    assert.equal(resolvePOSFlowComponent("restaurant_table_service"), "restaurant_table_service");
  });

  it("routes unimplemented profiles to unsupported flow", () => {
    assert.equal(resolvePOSFlowComponent("cafe_counter"), "unsupported");
    assert.equal(resolvePOSFlowComponent("quick_service"), "unsupported");
    assert.equal(resolvePOSFlowComponent("service_business_later"), "unsupported");
  });

  it("routes unknown/null profiles to unsupported flow", () => {
    assert.equal(resolvePOSFlowComponent(null), "unsupported");
    assert.equal(resolvePOSFlowComponent(undefined), "unsupported");
  });
});
