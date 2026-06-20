import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { resolvePOSFlowCapabilities } from "../resolvePOSFlowCapabilities";

describe("resolvePOSFlowCapabilities", () => {
  it("keeps baseline checkout true with empty entitlements", () => {
    const result = resolvePOSFlowCapabilities([]);
    assert.equal(result.baselineCheckout, true);
    assert.equal(result.tableService, false);
    assert.equal(result.kitchenOps, false);
    assert.equal(result.orderQueue, false);
    assert.equal(result.partialPayment, false);
  });

  it("maps SOT entitlement keys to optional capabilities", () => {
    const result = resolvePOSFlowCapabilities(["restaurant_table_service", "restaurant_kitchen_ops", "orders_queue", "payments_split_bill", "payments_partial_payment", "payments_multi_payment"]);
    assert.equal(result.tableService, true);
    assert.equal(result.floorPlan, true);
    assert.equal(result.kitchenOps, true);
    assert.equal(result.kds, true);
    assert.equal(result.orderQueue, true);
    assert.equal(result.splitBill, true);
    assert.equal(result.partialPayment, true);
    assert.equal(result.multiPayment, true);
  });
});
