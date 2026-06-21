import assert from "node:assert/strict";
import { normalizePOSPaymentFlow, normalizePOSPaymentLines, submitPOSPayment, toUserSafePaymentError } from "../posPaymentSubmissionService";

assert.equal(normalizePOSPaymentFlow("full_payment"), "full");
assert.equal(normalizePOSPaymentFlow("partial_payment_dp"), "dp");
assert.equal(normalizePOSPaymentFlow("full"), "full");
assert.equal(normalizePOSPaymentFlow("dp"), "dp");
assert.equal(normalizePOSPaymentFlow("multi"), "multi");
assert.equal(normalizePOSPaymentFlow("split"), "split");
assert.equal(normalizePOSPaymentFlow(undefined), "full");
assert.equal(normalizePOSPaymentFlow(undefined, 1000), "dp");

const calls: any[] = [];
const deps = {
  createOrder: async () => ({ order: { id: "order-1", order_number: "ORD-1" } }),
  createAndPay: async (payload: any) => { calls.push(["createAndPay", payload]); return { order: { id: "order-1", order_number: "ORD-1" } }; },
  recordPayment: async (payload: any) => { calls.push(["recordPayment", payload]); return { payment: payload }; },
};

await submitPOSPayment({ mode: "fresh_cart", totalAmount: 100000, cartPayload: { items: [] }, paymentMethod: "cash", cashReceived: 100000 }, deps);
assert.equal(calls[0][0], "createAndPay");
assert.equal(calls[0][1].payment_flow, "full");

calls.length = 0;
await submitPOSPayment({ mode: "fresh_cart", totalAmount: 100000, cartPayload: { items: [] }, paymentMethod: "cash", partialAmount: 25000 }, deps);
assert.equal(calls[0][0], "createAndPay");
assert.equal(calls[0][1].payment_flow, "dp");
assert.equal(calls[0][1].payment_kind, "down_payment");

calls.length = 0;
await submitPOSPayment({ mode: "fresh_cart", totalAmount: 100000, cartPayload: { items: [] }, paymentMethod: "cash", paymentDetails: { flow: "multi", lines: [{ method: "cash", amount: 50000 }, { method: "ewallet", amount: 50000 }] } }, deps);
assert.deepEqual(calls.map((call) => call[0]), ["recordPayment", "recordPayment"]);
assert.equal(calls[0][1].payment_flow, "multi");
assert.equal(calls[0][1].payment_kind, "multi_line");

calls.length = 0;
await submitPOSPayment({ mode: "saved_order", orderId: "order-2", orderNumber: "ORD-2", totalAmount: 100000, paymentMethod: "cash", paymentDetails: { flow: "multi", lines: [{ method: "cash", amount: 50000 }, { method: "ewallet", amount: 50000 }] } }, deps);
assert.deepEqual(calls.map((call) => call[0]), ["recordPayment", "recordPayment"]);

calls.length = 0;
await submitPOSPayment({ mode: "fresh_cart", totalAmount: 100000, cartPayload: { items: [] }, paymentMethod: "cash", paymentDetails: { flow: "split", lines: [{ method: "cash", amount: 25000, splitId: "ui-split-1" }, { method: "ewallet", amount: 75000, splitId: "123e4567-e89b-12d3-a456-426614174000" }], splits: [{ id: "ui-split-1", amountDue: 25000, amountPaid: 25000 }] } }, deps);
assert.equal(calls[0][1].payment_flow, "split");
assert.equal(calls[0][1].split_id, undefined);
assert.equal(calls[0][1].metadata.session_split_id, "ui-split-1");
assert.equal(calls[1][1].split_id, "123e4567-e89b-12d3-a456-426614174000");

const multiCapped = normalizePOSPaymentLines({ mode: "saved_order", orderId: "o", totalAmount: 100, paymentMethod: "cash", paymentDetails: { flow: "multi", lines: [{ method: "cash", amount: 30 }, { method: "ewallet", amount: 30 }, { method: "card", amount: 40 }] } });
assert.equal(multiCapped.lines.length, 2);
const splitCapped = normalizePOSPaymentLines({ mode: "saved_order", orderId: "o", totalAmount: 100, paymentMethod: "cash", paymentDetails: { flow: "split", lines: [{ method: "cash", amount: 20 }, { method: "cash", amount: 20 }, { method: "cash", amount: 20 }, { method: "cash", amount: 20 }, { method: "cash", amount: 20 }] } });
assert.equal(splitCapped.lines.length, 4);
assert.equal(toUserSafePaymentError(new Error(['Invalid', 'enum value. Expected full_payment', 'partial_payment_dp'].join(' | '))), "Pembayaran gagal dicatat. Silakan coba lagi.");
