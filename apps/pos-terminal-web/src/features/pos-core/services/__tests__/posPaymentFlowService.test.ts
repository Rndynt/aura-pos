import assert from "node:assert/strict";
import { calculateCashChange, calculatePaidAmount, calculateRemainingAmount, canCompleteMultiPayment, isSelectedBillPayable, resolvePaymentStatus } from "../posPaymentFlowService";

assert.equal(calculatePaidAmount([{ amount: 25000 }, { amount: 10000, status: "VOIDED" }, { amount: 75000, status: "SUCCEEDED" }]), 100000);
assert.equal(calculateRemainingAmount(120000, 50000), 70000);
assert.equal(resolvePaymentStatus(100000, 0), "UNPAID");
assert.equal(resolvePaymentStatus(100000, 25000), "PARTIAL");
assert.equal(resolvePaymentStatus(100000, 100000), "PAID");
assert.equal(calculateCashChange(80000, 100000), 20000);
assert.equal(canCompleteMultiPayment(100000, [{ method: "CASH", amount: 60000 }, { method: "MANUAL_QRIS", amount: 40000 }]), true);
assert.equal(canCompleteMultiPayment(100000, [{ method: "CASH", amount: 60000 }]), false);
assert.equal(canCompleteMultiPayment(100000, [{ method: "CASH", amount: 50000 }, { method: "MANUAL_QRIS", amount: 25000 }, { method: "MANUAL_TRANSFER", amount: 25000 }]), false);
assert.equal(isSelectedBillPayable({ billAmountDue: 50000, billAmountPaid: 0, lineTotal: 50000 }), true);
assert.equal(isSelectedBillPayable({ billAmountDue: 50000, billAmountPaid: 50000, lineTotal: 50000 }), false);
