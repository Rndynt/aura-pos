import assert from "node:assert/strict";
import { ORDER_ACTION_DEFINITIONS } from "@pos/domain/business-flows";
import { getBusinessFlowProfile, isActionSupported, listBusinessFlowProfiles } from "../registry/businessFlowRegistry";

const requiredProfiles = ["retail_standard", "restaurant_table_service", "cafe_counter", "quick_service", "service_business_later"] as const;

for (const profileId of requiredProfiles) {
  assert.ok(getBusinessFlowProfile(profileId), `expected ${profileId} to be registered`);
}

assert.equal(listBusinessFlowProfiles().length, requiredProfiles.length);
assert.equal(isActionSupported("retail_standard", "CREATE_AND_PAY"), true);
assert.equal(isActionSupported("retail_standard", "SEND_TO_KITCHEN"), false);

for (const actionId of ["SPLIT_BILL", "PARTIAL_PAYMENT", "SEND_TO_KITCHEN"] as const) {
  assert.ok(ORDER_ACTION_DEFINITIONS[actionId].requiredEntitlementCodes?.length, `${actionId} should declare entitlement metadata`);
}

console.log("businessFlowRegistry.test.ts passed");
