import assert from "node:assert/strict";
import { ORDER_ACTION_DEFINITIONS } from "@pos/domain/business-flows";
import { getBusinessFlowProfile, isActionSupported, listBusinessFlowProfiles } from "../registry/businessFlowRegistry";

const requiredProfiles = ["retail_standard", "food_beverage", "service", "core_standard"] as const;

for (const profileId of requiredProfiles) {
  assert.ok(getBusinessFlowProfile(profileId), `expected ${profileId} to be registered`);
  assert.equal(isActionSupported(profileId, "CREATE_AND_PAY"), true, `${profileId} should support baseline checkout`);
}

assert.equal(listBusinessFlowProfiles().length, requiredProfiles.length);
assert.equal(isActionSupported("retail_standard", "SEND_TO_KITCHEN"), false);
assert.equal(isActionSupported("food_beverage", "SEND_TO_KITCHEN"), true);

for (const actionId of ["SPLIT_BILL", "PARTIAL_PAYMENT", "SEND_TO_KITCHEN"] as const) {
  assert.ok(ORDER_ACTION_DEFINITIONS[actionId].requiredEntitlementCodes?.length, `${actionId} should declare entitlement metadata`);
}

console.log("businessFlowRegistry.test.ts passed");
