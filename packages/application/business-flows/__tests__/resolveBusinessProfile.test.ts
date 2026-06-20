import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { resolveBusinessProfileFromBusinessType } from "../resolveBusinessProfile";

describe("resolveBusinessProfileFromBusinessType", () => {
  it("maps RETAIL_MINIMARKET to retail_standard", () => {
    assert.equal(resolveBusinessProfileFromBusinessType({ businessType: "RETAIL_MINIMARKET" }), "retail_standard");
  });

  it("maps normalized retail_minimarket to retail_standard", () => {
    assert.equal(resolveBusinessProfileFromBusinessType({ businessTypeCode: "retail_minimarket" }), "retail_standard");
  });

  it("returns null for unknown, null, and undefined inputs", () => {
    assert.equal(resolveBusinessProfileFromBusinessType({ businessType: "UNKNOWN_SHOP" }), null);
    assert.equal(resolveBusinessProfileFromBusinessType({ businessType: null }), null);
    assert.equal(resolveBusinessProfileFromBusinessType({}), null);
  });

  it("does not map restaurant, cafe, or service codes to retail_standard", () => {
    for (const businessType of ["CAFE_RESTAURANT", "cafe", "LAUNDRY", "SERVICE_APPOINTMENT"]) {
      assert.notEqual(resolveBusinessProfileFromBusinessType({ businessType }), "retail_standard");
    }
  });
});
