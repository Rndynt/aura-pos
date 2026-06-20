import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { resolveBusinessProfileFromBusinessType, resolveBusinessProfileSource } from "../resolveBusinessProfile";

const cases = [
  ["RETAIL_MINIMARKET", "retail_standard"],
  ["retail", "retail_standard"],
  ["minimarket", "retail_standard"],
  ["store", "retail_standard"],
  ["CAFE_RESTAURANT", "food_beverage"],
  ["restaurant", "food_beverage"],
  ["cafe", "food_beverage"],
  ["quick_service", "food_beverage"],
  ["LAUNDRY", "service"],
  ["SERVICE_APPOINTMENT", "service"],
  ["salon", "service"],
  ["barber", "service"],
  ["spa", "service"],
  ["DIGITAL_PPOB", "core_standard"],
  ["UNKNOWN_SHOP", "core_standard"],
  [null, "core_standard"],
] as const;

describe("resolveBusinessProfileFromBusinessType", () => {
  for (const [businessType, expected] of cases) {
    it(`maps ${businessType} to ${expected}`, () => {
      assert.equal(resolveBusinessProfileFromBusinessType({ businessType }), expected);
    });
  }

  it("never maps F&B/service codes to paid operational profile ids", () => {
    for (const businessType of ["CAFE_RESTAURANT", "restaurant", "cafe", "quick_service", "LAUNDRY", "SERVICE_APPOINTMENT"]) {
      const profile = resolveBusinessProfileFromBusinessType({ businessType });
      assert.notEqual(profile, "restaurant_table_service");
      assert.notEqual(profile, "cafe_counter");
      assert.notEqual(profile, "quick_service");
      assert.notEqual(profile, "service_business_later");
    }
  });

  it("marks unknown or missing business type as core fallback", () => {
    assert.equal(resolveBusinessProfileSource({ businessType: "UNKNOWN_SHOP" }), "core_fallback");
    assert.equal(resolveBusinessProfileSource({}), "core_fallback");
  });
});
