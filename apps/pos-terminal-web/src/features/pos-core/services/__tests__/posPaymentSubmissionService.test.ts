import assert from "node:assert/strict";
import { buildCanonicalPaymentCommand, buildSubmitPOSPaymentRequest, submitPOSPayment, toUserSafePaymentError } from "../posPaymentSubmissionService";

assert.throws(() => buildCanonicalPaymentCommand({ clientPaymentSessionId: "sess-1", mode: "SAVED_ORDER", orderId: "o", totalAmount: 100, paymentMethod: "CASH", paymentDetails: { flow: "full_payment" as any, lines: [{ method: "CASH", amount: 100 }] } }));
assert.equal(buildCanonicalPaymentCommand({ clientPaymentSessionId: "sess-1", mode: "SAVED_ORDER", orderId: "o", totalAmount: 100, paymentMethod: "CASH" }).flow, "FULL");
assert.equal(buildCanonicalPaymentCommand({ clientPaymentSessionId: "sess-2", mode: "SAVED_ORDER", orderId: "o", totalAmount: 100, paymentMethod: "CASH", partialAmount: 10 }).flow, "DOWN_PAYMENT");

const fullRequest = buildSubmitPOSPaymentRequest({ clientPaymentSessionId: "sess-full", mode: "FRESH_CART", totalAmount: 100000, cartPayload: { items: [{ product_id: "p1" }], order_type_id: "type-1" }, paymentMethod: "CASH", cashReceived: 100000 });
assert.equal(fullRequest.source, "FRESH_CART");
assert.equal(fullRequest.payment.flow, "FULL");
assert.equal(fullRequest.payment.lines[0].method, "CASH");
assert.equal(fullRequest.order?.order_type_id, "type-1");
assert.equal((fullRequest.order as any)?.amount, undefined);
assert.equal((fullRequest.order as any)?.payment_method, undefined);

const multiRequest = buildSubmitPOSPaymentRequest({ clientPaymentSessionId: "sess-multi", mode: "FRESH_CART", totalAmount: 100000, cartPayload: { items: [] }, paymentMethod: "CASH", paymentDetails: { flow: "MULTI_PAYMENT", lines: [{ method: "CASH", amount: 50000 }, { method: "MANUAL_QRIS", amount: 50000 }] } });
assert.equal(multiRequest.payment.flow, "MULTI_PAYMENT");
assert.equal(multiRequest.payment.lines.length, 2);

const splitRequest = buildSubmitPOSPaymentRequest({ clientPaymentSessionId: "sess-split", mode: "FRESH_CART", totalAmount: 100000, cartPayload: { items: [] }, paymentMethod: "CASH", paymentDetails: { flow: "SPLIT_BILL", targetBillId: "ui-split-1", lines: [{ method: "CASH", amount: 25000, splitId: "ui-split-1" }], splits: [{ id: "ui-split-1", label: "Bill A", amountDue: 25000, amountPaid: 0 }] } });
assert.equal(splitRequest.payment.flow, "SPLIT_BILL");
assert.equal(splitRequest.payment.lines[0].clientBillId, "ui-split-1");
assert.equal(splitRequest.payment.splits?.[0].clientBillId, "ui-split-1");

const calls: any[] = [];
const deps = {
  submitPayment: async (payload: any) => {
    calls.push(["submitPayment", payload]);
    return {
      orderId: "order-1",
      orderNumber: "ORD-1",
      paymentFlow: payload.payment.flow,
      paidAmount: payload.payment.lines.reduce((sum: number, line: any) => sum + line.amount, 0),
      remainingAmount: payload.payment.flow === "DOWN_PAYMENT" ? 75000 : 0,
      status: (payload.payment.flow === "DOWN_PAYMENT" ? "PARTIAL" : "PAID") as "PARTIAL" | "PAID",
      shouldClearCart: payload.payment.flow !== "DOWN_PAYMENT",
      shouldPrintReceipt: payload.payment.flow !== "DOWN_PAYMENT",
      messageTitle: payload.payment.flow === "DOWN_PAYMENT" ? "Pembayaran sebagian tersimpan" : "Pembayaran berhasil",
      messageDescription: "OK",
    };
  },
};

const fullResult = await submitPOSPayment({ clientPaymentSessionId: "sess-submit-full", mode: "FRESH_CART", totalAmount: 100000, cartPayload: { items: [] }, paymentMethod: "CASH", cashReceived: 100000 }, deps);
assert.equal(calls[0][0], "submitPayment");
assert.equal(calls[0][1].payment.flow, "FULL");
assert.equal(fullResult.shouldClearCart, true);

calls.length = 0;
const partialResult = await submitPOSPayment({ clientPaymentSessionId: "sess-submit-dp", mode: "FRESH_CART", totalAmount: 100000, cartPayload: { items: [] }, paymentMethod: "CASH", partialAmount: 25000 }, deps);
assert.equal(calls[0][1].payment.flow, "DOWN_PAYMENT");
assert.equal(partialResult.status, "PARTIAL");
assert.equal(partialResult.shouldClearCart, false);

assert.throws(() => buildCanonicalPaymentCommand({ clientPaymentSessionId: "sess-too-many", mode: "SAVED_ORDER", orderId: "o", totalAmount: 100, paymentMethod: "CASH", paymentDetails: { flow: "MULTI_PAYMENT", lines: [{ method: "CASH", amount: 30 }, { method: "MANUAL_QRIS", amount: 30 }, { method: "MANUAL_TRANSFER", amount: 40 }] } }));
assert.throws(() => buildCanonicalPaymentCommand({ clientPaymentSessionId: "sess-split-many", mode: "SAVED_ORDER", orderId: "o", totalAmount: 100, paymentMethod: "CASH", paymentDetails: { flow: "SPLIT_BILL", lines: [{ method: "CASH", amount: 20 }, { method: "CASH", amount: 20 }, { method: "CASH", amount: 20 }, { method: "CASH", amount: 20 }, { method: "CASH", amount: 20 }] } }));
assert.equal(toUserSafePaymentError(new Error(['Invalid', 'enum value. Expected FULL', 'DOWN_PAYMENT'].join(' | '))), "Pembayaran gagal dicatat. Silakan coba lagi.");

// Fix B: clientBillId is preserved via clientBillId field (not just splitId fallback)
const splitWithClientBillIdOnly = buildSubmitPOSPaymentRequest({ clientPaymentSessionId: "sess-cbid", mode: "FRESH_CART", totalAmount: 25000, cartPayload: { items: [] }, paymentMethod: "CASH", paymentDetails: { flow: "SPLIT_BILL", targetBillId: "B", lines: [{ method: "CASH", amount: 25000, clientBillId: "B" }], splits: [{ id: "B", label: "Bill B", amountDue: 25000, amountPaid: 0 }] } });
assert.equal(splitWithClientBillIdOnly.payment.lines[0].clientBillId, "B", "clientBillId must be mapped from line.clientBillId");
assert.equal(splitWithClientBillIdOnly.payment.lines[0].orderBillSplitId, undefined, "orderBillSplitId must not be set from clientBillId");
assert.equal(splitWithClientBillIdOnly.payment.targetBillId, "B", "targetBillId fallback must use clientBillId");

// Fix A: only non-zero splits are built by buildSplitPayload (dialog filters before calling, service passes through)
const splitOnlyBillA = buildSubmitPOSPaymentRequest({ clientPaymentSessionId: "sess-split-a-only", mode: "FRESH_CART", totalAmount: 14000, cartPayload: { items: [] }, paymentMethod: "CASH", paymentDetails: { flow: "SPLIT_BILL", targetBillId: "A", lines: [{ method: "CASH", amount: 14000, clientBillId: "A" }], splits: [{ id: "A", label: "Bill A", amountDue: 14000, amountPaid: 0 }] } });
assert.equal(splitOnlyBillA.payment.splits?.length, 1, "only Bill A with amountDue>0 should be in splits");
assert.equal(splitOnlyBillA.payment.splits?.[0].amountDue, 14000);
assert.equal(splitOnlyBillA.payment.splits?.[0].clientBillId, "A");

const splitWithPersistedItems = buildSubmitPOSPaymentRequest({
  clientPaymentSessionId: "sess-split-items",
  mode: "SAVED_ORDER",
  orderId: "00000000-0000-0000-0000-000000000001",
  totalAmount: 26000,
  paymentMethod: "CASH",
  paymentDetails: {
    flow: "SPLIT_BILL",
    targetBillId: "A",
    lines: [{ method: "CASH", amount: 26000, clientBillId: "A", orderBillSplitId: "11111111-1111-1111-1111-111111111111" }],
    splits: [{
      id: "A",
      label: "Bill A",
      amountDue: 26000,
      amountPaid: 0,
      orderBillSplitId: "11111111-1111-1111-1111-111111111111",
      items: [{ orderItemId: "22222222-2222-2222-2222-222222222222", quantity: 1, amount: 26000 }],
    }],
  },
});
assert.equal(splitWithPersistedItems.payment.lines[0].orderBillSplitId, "11111111-1111-1111-1111-111111111111");
assert.equal(splitWithPersistedItems.payment.splits?.[0].items?.[0].orderItemId, "22222222-2222-2222-2222-222222222222");
assert.equal(splitWithPersistedItems.payment.splits?.[0].items?.[0].amount, 26000);
