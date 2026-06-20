import assert from "node:assert/strict";
import { resolvePOSActiveOrderPaymentAmount } from "../posPaymentAmountService";
import type { POSLifecycleOrder } from "../posLifecycleService";

function activeOrder(overrides: Partial<POSLifecycleOrder> = {}): POSLifecycleOrder {
  return {
    id: "order-1",
    order_number: "ORD-1",
    status: "confirmed",
    payment_status: "unpaid",
    total_amount: 100_000,
    paid_amount: 0,
    isActiveOrder: true,
    allowedActions: ["PAY_ACTIVE_ORDER"],
    ...overrides,
  };
}

assert.deepEqual(resolvePOSActiveOrderPaymentAmount(activeOrder()), {
  ok: true,
  amount: 100_000,
  orderNumber: "ORD-1",
});

assert.deepEqual(
  resolvePOSActiveOrderPaymentAmount(
    activeOrder({ payment_status: "partial", paid_amount: 40_000, remaining_amount: 60_000 } as any),
  ),
  { ok: true, amount: 60_000, orderNumber: "ORD-1" },
);

assert.deepEqual(
  resolvePOSActiveOrderPaymentAmount(
    activeOrder({ payment_status: "partial", total_amount: 100_000, paid_amount: 35_000 }),
  ),
  { ok: true, amount: 65_000, orderNumber: "ORD-1" },
);

const paidResult = resolvePOSActiveOrderPaymentAmount(
  activeOrder({ payment_status: "paid", paid_amount: 100_000 }),
);
assert.equal(paidResult.ok, false);
assert.equal(paidResult.amount, 0);

const invalidResult = resolvePOSActiveOrderPaymentAmount(
  activeOrder({ total_amount: "not-a-number", paid_amount: 0 }),
);
assert.equal(invalidResult.ok, false);
assert.equal(invalidResult.amount, 0);

console.log("posPaymentAmountService tests passed");
