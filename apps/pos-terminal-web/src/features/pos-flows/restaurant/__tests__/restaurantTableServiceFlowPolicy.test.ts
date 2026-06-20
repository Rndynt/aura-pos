import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { RESTAURANT_TABLE_SERVICE_FLOW_POLICY, canResumeRestaurantOrderIntoCart, getSendToKitchenEligibility } from "../restaurantTableServiceFlowPolicy";

describe("restaurantTableServiceFlowPolicy", () => {
  it("defines canonical restaurant table-service actions", () => {
    assert.equal(RESTAURANT_TABLE_SERVICE_FLOW_POLICY.businessProfile, "food_beverage");
    assert.equal(RESTAURANT_TABLE_SERVICE_FLOW_POLICY.showKitchenActions, true);
    assert.equal(RESTAURANT_TABLE_SERVICE_FLOW_POLICY.showTableServiceActions, true);
    assert.equal(RESTAURANT_TABLE_SERVICE_FLOW_POLICY.allowFreshCreateAndPay, false);
    assert.equal(RESTAURANT_TABLE_SERVICE_FLOW_POLICY.allowSendToKitchen, true);
    assert.equal(RESTAURANT_TABLE_SERVICE_FLOW_POLICY.allowPayLaterActiveOrderCreation, true);
    assert.equal(RESTAURANT_TABLE_SERVICE_FLOW_POLICY.requireOrdersQueueForPayment, false);
    assert.equal(RESTAURANT_TABLE_SERVICE_FLOW_POLICY.allowLegacyActiveOrderCartEdit, false);
    assert.equal(RESTAURANT_TABLE_SERVICE_FLOW_POLICY.allowLegacyActiveOrderDelete, false);
  });

  it("blocks send-to-kitchen without cart, table context, or kitchen entitlement", () => {
    assert.deepEqual(getSendToKitchenEligibility({ cartItemCount: 0, diningContext: { tableNumber: "1" }, tableRequired: true, kitchenEntitlementEnabled: true }), { ok: false, reason: "EMPTY_CART" });
    assert.deepEqual(getSendToKitchenEligibility({ cartItemCount: 1, diningContext: {}, tableRequired: true, kitchenEntitlementEnabled: true }), { ok: false, reason: "DINING_CONTEXT_REQUIRED" });
    assert.deepEqual(getSendToKitchenEligibility({ cartItemCount: 1, diningContext: { tableNumber: "1" }, tableRequired: true, kitchenEntitlementEnabled: false }), { ok: false, reason: "KITCHEN_ENTITLEMENT_REQUIRED" });
  });

  it("allows send-to-kitchen with cart, dining context, and kitchen entitlement", () => {
    assert.deepEqual(getSendToKitchenEligibility({ cartItemCount: 2, diningContext: { tableNumber: "A1" }, tableRequired: true, kitchenEntitlementEnabled: true }), { ok: true });
  });

  it("keeps active kitchen orders out of editable cart", () => {
    assert.equal(canResumeRestaurantOrderIntoCart({ isEditableDraft: true, isKitchenLocked: false, lifecycleKind: "server_draft" }), true);
    assert.equal(canResumeRestaurantOrderIntoCart({ isEditableDraft: false, isKitchenLocked: true, lifecycleKind: "active_kitchen_order" }), false);
  });
});
