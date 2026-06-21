import assert from "node:assert/strict";
import { buildCanonicalPaymentCommand, submitPOSPayment, toUserSafePaymentError } from "../posPaymentSubmissionService";

assert.throws(() => buildCanonicalPaymentCommand({ clientPaymentSessionId: "sess-1", mode: "SAVED_ORDER", orderId: "o", totalAmount: 100, paymentMethod: "CASH", paymentDetails: { flow: "full_payment" as any, lines: [{ method: "CASH", amount: 100 }] } }));
assert.equal(buildCanonicalPaymentCommand({ clientPaymentSessionId: "sess-1", mode: "SAVED_ORDER", orderId: "o", totalAmount: 100, paymentMethod: "CASH" }).flow, "FULL");
assert.equal(buildCanonicalPaymentCommand({ clientPaymentSessionId: "sess-2", mode: "SAVED_ORDER", orderId: "o", totalAmount: 100, paymentMethod: "CASH", partialAmount: 10 }).flow, "DOWN_PAYMENT");

const calls: any[] = [];
const deps = {
  createOrder: async (payload: any) => { calls.push(["createOrder", payload]); return { order: { id: "order-1", order_number: "ORD-1" } }; },
  createAndPay: async (payload: any) => { calls.push(["createAndPay", payload]); return { order: { id: "order-1", order_number: "ORD-1" } }; },
  recordPayment: async (payload: any) => { calls.push(["recordPayment", payload]); return { payment: payload }; },
};

await submitPOSPayment({ clientPaymentSessionId: "sess-full", mode: "FRESH_CART", totalAmount: 100000, cartPayload: { items: [] }, paymentMethod: "CASH", cashReceived: 100000 }, deps);
assert.equal(calls[0][0], "createAndPay");
assert.equal(calls[0][1].payment_flow, "FULL");
assert.equal(calls[0][1].client_payment_session_id, "sess-full");

calls.length = 0;
await submitPOSPayment({ clientPaymentSessionId: "sess-dp", mode: "FRESH_CART", totalAmount: 100000, cartPayload: { items: [] }, paymentMethod: "CASH", partialAmount: 25000 }, deps);
assert.equal(calls[0][0], "createAndPay");
assert.equal(calls[0][1].payment_flow, "DOWN_PAYMENT");
assert.equal(calls[0][1].payment_kind, "DOWN_PAYMENT");

calls.length = 0;
await submitPOSPayment({ clientPaymentSessionId: "sess-multi", mode: "FRESH_CART", totalAmount: 100000, cartPayload: { items: [] }, paymentMethod: "CASH", paymentDetails: { flow: "MULTI_PAYMENT", lines: [{ method: "CASH", amount: 50000 }, { method: "MANUAL_QRIS", amount: 50000 }] } }, deps);
assert.deepEqual(calls.map((call) => call[0]), ["createOrder", "recordPayment", "recordPayment"]);
assert.equal(calls[1][1].payment_flow, "MULTI_PAYMENT");
assert.equal(calls[1][1].payment_kind, "MULTI_PAYMENT_LINE");

calls.length = 0;
await submitPOSPayment({ clientPaymentSessionId: "sess-saved", mode: "SAVED_ORDER", orderId: "order-2", orderNumber: "ORD-2", totalAmount: 100000, paymentMethod: "CASH", paymentDetails: { flow: "MULTI_PAYMENT", lines: [{ method: "CASH", amount: 50000 }, { method: "MANUAL_QRIS", amount: 50000 }] } }, deps);
assert.deepEqual(calls.map((call) => call[0]), ["recordPayment", "recordPayment"]);

calls.length = 0;
await submitPOSPayment({ clientPaymentSessionId: "sess-split", mode: "FRESH_CART", totalAmount: 100000, cartPayload: { items: [] }, paymentMethod: "CASH", paymentDetails: { flow: "SPLIT_BILL", lines: [{ method: "CASH", amount: 25000, splitId: "ui-split-1" }], splits: [{ id: "ui-split-1", amountDue: 25000, amountPaid: 25000 }] } }, deps);
assert.equal(calls[1][1].payment_flow, "SPLIT_BILL");
assert.equal(calls[1][1].split_id, undefined);
assert.equal(calls[1][1].metadata.session_split_id, "ui-split-1");

assert.throws(() => buildCanonicalPaymentCommand({ clientPaymentSessionId: "sess-too-many", mode: "SAVED_ORDER", orderId: "o", totalAmount: 100, paymentMethod: "CASH", paymentDetails: { flow: "MULTI_PAYMENT", lines: [{ method: "CASH", amount: 30 }, { method: "MANUAL_QRIS", amount: 30 }, { method: "MANUAL_TRANSFER", amount: 40 }] } }));
assert.throws(() => buildCanonicalPaymentCommand({ clientPaymentSessionId: "sess-split-many", mode: "SAVED_ORDER", orderId: "o", totalAmount: 100, paymentMethod: "CASH", paymentDetails: { flow: "SPLIT_BILL", lines: [{ method: "CASH", amount: 20 }, { method: "CASH", amount: 20 }, { method: "CASH", amount: 20 }, { method: "CASH", amount: 20 }, { method: "CASH", amount: 20 }] } }));
assert.equal(toUserSafePaymentError(new Error(['Invalid', 'enum value. Expected FULL', 'DOWN_PAYMENT'].join(' | '))), "Pembayaran gagal dicatat. Silakan coba lagi.");
