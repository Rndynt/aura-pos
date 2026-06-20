import assert from "node:assert/strict";
import { RETAIL_STANDARD_FLOW_POLICY } from "../retailStandardFlowPolicy";

assert.equal(RETAIL_STANDARD_FLOW_POLICY.businessProfile, "retail_standard");
assert.equal(RETAIL_STANDARD_FLOW_POLICY.showKitchenActions, false);
assert.equal(RETAIL_STANDARD_FLOW_POLICY.showTableServiceActions, false);
assert.equal(RETAIL_STANDARD_FLOW_POLICY.showActiveOrderQueueByDefault, false);
assert.equal(RETAIL_STANDARD_FLOW_POLICY.allowFreshCreateAndPay, true);
assert.equal(RETAIL_STANDARD_FLOW_POLICY.allowPayLaterActiveOrderCreation, false);
assert.equal(RETAIL_STANDARD_FLOW_POLICY.allowLocalDraft, true);
assert.equal(RETAIL_STANDARD_FLOW_POLICY.allowServerDraft, true);
assert.equal(RETAIL_STANDARD_FLOW_POLICY.requireOrdersQueueForPayment, false);
assert.equal(RETAIL_STANDARD_FLOW_POLICY.allowLegacyActiveOrderCartEdit, false);
assert.equal(RETAIL_STANDARD_FLOW_POLICY.allowLegacyActiveOrderDelete, false);
assert.ok(RETAIL_STANDARD_FLOW_POLICY.supportedActions.includes("CREATE_AND_PAY"));
assert.ok(RETAIL_STANDARD_FLOW_POLICY.supportedActions.includes("SAVE_DRAFT"));
assert.ok(RETAIL_STANDARD_FLOW_POLICY.blockedActions.includes("SEND_TO_KITCHEN"));
