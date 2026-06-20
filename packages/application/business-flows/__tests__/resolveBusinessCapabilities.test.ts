import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { resolveBusinessCapabilities } from "../resolveBusinessCapabilities";

describe("resolveBusinessCapabilities", () => {
  it("keeps core POS available when no paid entitlements are present", () => {
    assert.deepEqual(resolveBusinessCapabilities([]), {
      tableService: false,
      floorPlan: false,
      kitchenOps: false,
      kds: false,
      orderQueue: false,
      splitBill: false,
      partialPayment: false,
      multiPayment: false,
    });
  });

  it("maps existing entitlement SOT keys to optional POS capabilities", () => {
    assert.deepEqual(resolveBusinessCapabilities(["restaurant_table_service", "restaurant_kitchen_ops", "orders_queue", "payments_split_bill", "payments_partial_payment", "payments_multi_payment"]), {
      tableService: true,
      floorPlan: true,
      kitchenOps: true,
      kds: true,
      orderQueue: true,
      splitBill: true,
      partialPayment: true,
      multiPayment: true,
    });
  });
});
