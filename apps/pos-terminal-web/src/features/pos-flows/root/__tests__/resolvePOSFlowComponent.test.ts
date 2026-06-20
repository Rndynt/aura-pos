import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { resolvePOSFlowComponent } from "../resolvePOSFlowComponent";

describe("resolvePOSFlowComponent", () => {
  it("routes baseline profiles to implemented core-compatible flows", () => {
    assert.equal(resolvePOSFlowComponent("retail_standard"), "retail_standard");
    assert.equal(resolvePOSFlowComponent("food_beverage"), "food_beverage");
    assert.equal(resolvePOSFlowComponent("service"), "service");
    assert.equal(resolvePOSFlowComponent("core_standard"), "core_standard");
  });

  it("routes unknown/null profiles to core baseline, not unsupported", () => {
    assert.equal(resolvePOSFlowComponent(null), "core_standard");
    assert.equal(resolvePOSFlowComponent(undefined), "core_standard");
  });
});
