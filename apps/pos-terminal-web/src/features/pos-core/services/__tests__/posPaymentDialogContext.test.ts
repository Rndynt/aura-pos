import assert from "node:assert/strict";
import { resolvePOSPaymentDialogContext } from "../posPaymentDialogContext";

const cartItems: any[] = [{ id: "cart-only", quantity: 1, product: { name: "Fresh", base_price: 10000 } }];
const orderItems: any[] = [{ id: "item-1", quantity: 2, productName: "Nasi", unitPrice: 75000 }];
const billSplits: any[] = [
  { id: "split-a", clientBillId: "A", label: "Bill A", splitNo: 1, amountDue: 58650, amountPaid: 58650, status: "PAID", items: [{ orderItemId: "item-1", clientBillId: "A", quantity: 1, amount: 58650 }] },
  { id: "split-b", clientBillId: "B", label: "Bill B", splitNo: 2, amountDue: 91350, amountPaid: 0, status: "UNPAID", items: [{ orderItemId: "item-1", clientBillId: "B", quantity: 1, amount: 91350 }] },
];

const hydratedOrder: any = {
  id: "order-171931",
  orderNumber: "171931",
  total: 150000,
  paidAmount: 58650,
  remainingAmount: 91350,
  items: orderItems,
  billSplits,
};

const pendingContext = resolvePOSPaymentDialogContext({
  pendingOrderForPayment: { orderId: hydratedOrder.id, orderNumber: hydratedOrder.orderNumber, totalAmount: 91350, order: hydratedOrder },
  continuedOrderForPayment: null,
  continueOrderId: null,
  cartTotal: 10000,
  cartItems,
});
assert.equal(pendingContext.source, "ACTIVE_ORDER");
assert.equal(pendingContext.existingSplitBills.length, 2, "pending active order context must pass persisted bill splits");
assert.equal(pendingContext.existingSplitBills[0].status, "PAID", "Bill A paid state must not reset");
assert.equal(pendingContext.cartItems[0].id, "item-1", "dialog must use hydrated order items when available");

const continuedContext = resolvePOSPaymentDialogContext({
  pendingOrderForPayment: null,
  continuedOrderForPayment: hydratedOrder,
  continueOrderId: hydratedOrder.id,
  cartTotal: 10000,
  cartItems,
});
assert.equal(continuedContext.source, "SAVED_ORDER");
assert.equal(continuedContext.totalAmount, 91350, "continued order context must use remaining amount from hydrated order");
assert.equal(continuedContext.existingSplitBills[0].amountDue, 58650, "continued order context must preserve original Bill A amount");

const routeOnlyContext = resolvePOSPaymentDialogContext({
  pendingOrderForPayment: null,
  continuedOrderForPayment: null,
  continueOrderId: hydratedOrder.id,
  cartTotal: 91350,
  cartItems,
});
assert.equal(routeOnlyContext.source, "SAVED_ORDER");
assert.deepEqual(routeOnlyContext.existingSplitBills, [], "route-only fallback remains safe until hydration finishes");

const freshContext = resolvePOSPaymentDialogContext({
  pendingOrderForPayment: null,
  continuedOrderForPayment: null,
  continueOrderId: null,
  cartTotal: 10000,
  cartItems,
});
assert.equal(freshContext.source, "FRESH_CART");
assert.deepEqual(freshContext.existingSplitBills, [], "fresh carts must start without persisted bill splits");
