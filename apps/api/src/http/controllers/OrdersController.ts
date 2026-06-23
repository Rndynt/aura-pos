/**
 * Orders Controller compatibility exports.
 *
 * Endpoint grouping after the controller audit:
 * - create order: createOrder
 * - update order: updateOrder
 * - record payment: recordPayment
 * - create-and-pay: createAndPay
 * - list open orders: listOpenOrders
 * - order history: listOrderHistory
 * - status transition: updateOrderStatus, confirmOrder, completeOrder, cancelOrder
 * - fulfillment transition: updateOrderStatus with ?mode=kitchen, createKitchenTicket
 * - queue/read helpers: streamOrderQueue, listOrders, getOrderById
 *
 * Implementations live in small handlers under ../handlers/orders. Keep this file
 * as a stable import surface for existing routes and tests.
 */
export { streamOrderQueue } from '../handlers/orders/streamOrderQueue';
export { createOrder } from '../handlers/orders/createOrder';
export { updateOrder } from '../handlers/orders/updateOrder';
export { recordPayment } from '../handlers/orders/recordPayment';
export { createAndPay } from '../handlers/orders/createAndPay';
export { listOrders, getOrderById } from '../handlers/orders/listOrders';
export { listOpenOrders, listOrderHistory } from '../handlers/orders/history';
export { confirmOrder, completeOrder, updateOrderStatus, cancelOrder } from '../handlers/orders/transitions';
export { createKitchenTicket } from '../handlers/orders/kitchenTicket';
export { __setOrderActionPolicyBaseOverrideForTests } from '../handlers/orders/common';
