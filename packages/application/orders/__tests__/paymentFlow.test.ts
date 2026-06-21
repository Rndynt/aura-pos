import assert from "node:assert/strict";
import { calculatePaidAmount, calculateRemainingAmount, canCompleteMultiPayment, isSelectedBillPayable, resolvePaymentStatus } from "../paymentFlow";

assert.equal(calculatePaidAmount([{ amount: 30000, status: "SUCCEEDED" }, { amount: 70000 }]), 100000);
assert.equal(calculateRemainingAmount(125000, 25000), 100000);
assert.equal(resolvePaymentStatus(125000, 25000), "PARTIAL");
assert.equal(resolvePaymentStatus(125000, 125000), "PAID");
assert.equal(canCompleteMultiPayment(125000, [{ method: "CASH", amount: 50000 }, { method: "MANUAL_QRIS", amount: 75000 }]), true);
assert.equal(canCompleteMultiPayment(125000, [{ method: "CASH", amount: 50000 }]), false);
assert.equal(isSelectedBillPayable({ billAmountDue: 62500, billAmountPaid: 0, lineTotal: 62500 }), true);
assert.equal(isSelectedBillPayable({ billAmountDue: 62500, billAmountPaid: 62500, lineTotal: 62500 }), false);
