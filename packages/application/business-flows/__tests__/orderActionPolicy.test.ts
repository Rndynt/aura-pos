import assert from "node:assert/strict";
import { CanPerformOrderAction, ResolveAllowedOrderActions } from "../index";

assert.equal(CanPerformOrderAction({ businessProfile: "food_beverage", entitlements: [], action: "SEND_TO_KITCHEN", orderOperationalStatus: "draft" }).allowed, false);
assert.equal(CanPerformOrderAction({ businessProfile: "food_beverage", entitlements: ["restaurant_kitchen_ops"], action: "SEND_TO_KITCHEN", orderOperationalStatus: "draft" }).allowed, true);

assert.equal(CanPerformOrderAction({ businessProfile: "retail_standard", entitlements: [], action: "UPDATE_DRAFT_ITEMS", orderOperationalStatus: "draft" }).allowed, true);
for (const status of ["confirmed", "preparing", "ready", "served"] as const) {
  const result = CanPerformOrderAction({ businessProfile: "retail_standard", entitlements: [], action: "UPDATE_DRAFT_ITEMS", orderOperationalStatus: status });
  assert.equal(result.allowed, false, `UPDATE_DRAFT_ITEMS should be denied for ${status}`);
  assert.equal(result.reasonCode, "ORDER_NOT_DRAFT");
}
assert.equal(CanPerformOrderAction({ businessProfile: "retail_standard", entitlements: [], action: "UPDATE_DRAFT_ITEMS", orderOperationalStatus: "draft", hasKitchenTicket: true }).reasonCode, "KITCHEN_ORDER_LOCKED");
assert.equal(CanPerformOrderAction({ businessProfile: "retail_standard", entitlements: [], action: "UPDATE_DRAFT_ITEMS", orderOperationalStatus: "draft", hasFiredKitchenItems: true }).reasonCode, "FIRED_ITEMS_LOCKED");

assert.equal(CanPerformOrderAction({ businessProfile: "food_beverage", entitlements: [], action: "PAY_ACTIVE_ORDER", orderOperationalStatus: "served", paymentStatus: "unpaid" }).allowed, true);
assert.equal(CanPerformOrderAction({ businessProfile: "food_beverage", entitlements: [], action: "PAY_ACTIVE_ORDER", orderOperationalStatus: "served", paymentStatus: "partial" }).allowed, true);
assert.equal(CanPerformOrderAction({ businessProfile: "food_beverage", entitlements: ["orders_queue"], action: "PAY_ACTIVE_ORDER", orderOperationalStatus: "served", paymentStatus: "unpaid" }).allowed, true);
assert.ok(ResolveAllowedOrderActions({ businessProfile: "food_beverage", entitlements: [], orderOperationalStatus: "served", paymentStatus: "unpaid" }).includes("PAY_ACTIVE_ORDER"));

assert.equal(CanPerformOrderAction({ businessProfile: "retail_standard", entitlements: [], action: "DELETE_LOCAL_DRAFT", isLocalDraft: true }).allowed, true);
assert.equal(CanPerformOrderAction({ businessProfile: "retail_standard", entitlements: [], action: "DELETE_LOCAL_DRAFT", isLocalDraft: false }).reasonCode, "LOCAL_DRAFT_ONLY");

assert.equal(CanPerformOrderAction({ businessProfile: "food_beverage", entitlements: [], action: "SPLIT_BILL" }).reasonCode, "MISSING_ENTITLEMENT");
assert.equal(CanPerformOrderAction({ businessProfile: "food_beverage", entitlements: ["payments_split_bill"], action: "SPLIT_BILL" }).allowed, true);
assert.equal(CanPerformOrderAction({ businessProfile: "food_beverage", entitlements: [], action: "PARTIAL_PAYMENT" }).reasonCode, "MISSING_ENTITLEMENT");
assert.equal(CanPerformOrderAction({ businessProfile: "food_beverage", entitlements: ["payments_partial_payment"], action: "PARTIAL_PAYMENT" }).allowed, true);

console.log("orderActionPolicy.test.ts passed");
