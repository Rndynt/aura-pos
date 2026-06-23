import { nanoid } from "nanoid";
import { offlineDb } from "./db";
import { generateIdempotencyKey } from "./idempotency";
import { generateLocalOrderNumber } from "./orderNumber";
import { enqueueOutbox } from "./outbox";
import { calculateOrderPricing, type PricingSelectedOption } from "@pos/core/pricing";
import type { LocalOrder, LocalOrderItem, LocalPayment } from "./types";

export type LocalOrderItem_Input = {
  product_id: string;
  product_name: string;
  base_price: number;
  quantity: number;
  variant_id?: string;
  variant_name?: string;
  variant_price_delta?: number;
  selected_options?: PricingSelectedOption[];
  notes?: string;
};

export type CreateLocalOrderInput = {
  tenantId: string;
  terminalId: string;
  items: LocalOrderItem_Input[];
  order_type_id?: string;
  customer_name?: string;
  table_number?: string;
  notes?: string;
  tax_rate?: number;
  service_charge_rate?: number;
  amount: number;
  payment_method: "CASH" | "MANUAL_TRANSFER" | "MANUAL_QRIS";
  transaction_ref?: string;
  payment_notes?: string;
  fulfillment_mode?: "standard" | "instant";
};

export type CreateLocalOrderResult = {
  order: { id: string; order_number: string; local_order_number: string; status: string; payment_status: string; customer_name?: string; table_number?: string; isLocal: true };
  payment: { id: string; amount: number; payment_method: string };
  pricing: { subtotal: number; tax_amount: number; service_charge_amount: number; total_amount: number };
  idempotencyKey: string;
};

function computePricing(items: LocalOrderItem_Input[], taxRate = 0, serviceChargeRate = 0) {
  const pricing = calculateOrderPricing({ items, tax_rate: taxRate, service_charge_rate: serviceChargeRate });
  return {
    subtotal: pricing.order_subtotal,
    tax_amount: pricing.tax_amount,
    service_charge_amount: pricing.service_charge_amount,
    total_amount: pricing.total_amount,
  };
}

export async function createLocalOrder(input: CreateLocalOrderInput): Promise<CreateLocalOrderResult> {
  const { tenantId, terminalId } = input;
  const now = new Date().toISOString();
  const localId = nanoid();
  const idempotencyKey = generateIdempotencyKey(terminalId);
  const localOrderNumber = await generateLocalOrderNumber(tenantId, terminalId);
  const fulfillmentMode = input.fulfillment_mode ?? "standard";
  const orderStatus = fulfillmentMode === "instant" ? "completed" : "confirmed";
  const pricing = computePricing(input.items, input.tax_rate ?? 0, input.service_charge_rate ?? 0);

  const order: LocalOrder = { localId, tenantId, terminalId, localOrderNumber, status: orderStatus, paymentStatus: "paid", syncStatus: "pending_sync", idempotencyKey, createdAtLocal: now };
  const orderItems: LocalOrderItem[] = input.items.map((item) => ({ id: nanoid(), localOrderId: localId, tenantId, productId: item.product_id, productName: item.product_name, quantity: item.quantity, unitPrice: item.base_price + (item.variant_price_delta ?? 0), syncStatus: "pending_sync" }));
  const paymentId = nanoid();
  const payment: LocalPayment = { id: paymentId, localOrderId: localId, tenantId, amount: input.amount, method: input.payment_method, idempotencyKey: generateIdempotencyKey(terminalId), syncStatus: "pending_sync", createdAtLocal: now };

  await offlineDb.transaction("rw", [offlineDb.local_orders, offlineDb.local_order_items, offlineDb.local_order_payments], async () => {
    await offlineDb.local_orders.put(order);
    await offlineDb.local_order_items.bulkPut(orderItems);
    await offlineDb.local_order_payments.put(payment);
  });

  await enqueueOutbox({
    tenantId,
    terminalId,
    entityType: "order",
    operation: "create",
    localEntityId: localId,
    endpoint: "/api/orders/create-and-pay",
    method: "POST",
    payload: {
      items: input.items,
      order_type_id: input.order_type_id,
      customer_name: input.customer_name,
      table_number: input.table_number,
      notes: input.notes,
      tax_rate: input.tax_rate,
      service_charge_rate: input.service_charge_rate,
      amount: input.amount,
      payment_method: input.payment_method,
      transaction_ref: input.transaction_ref,
      payment_notes: input.payment_notes,
      fulfillment_mode: fulfillmentMode,
      local_order_id: localId,
      local_order_number: localOrderNumber,
      source_terminal_id: terminalId,
      client_created_at: now,
    },
    idempotencyKey,
  });

  return {
    order: { id: localId, order_number: localOrderNumber, local_order_number: localOrderNumber, status: orderStatus, payment_status: "paid", customer_name: input.customer_name, table_number: input.table_number, isLocal: true },
    payment: { id: paymentId, amount: input.amount, payment_method: input.payment_method },
    pricing,
    idempotencyKey,
  };
}

export async function mirrorServerOrderLocally(tenantId: string, terminalId: string, serverId: string, serverOrderNumber: string, idempotencyKey: string, status = "confirmed", paymentStatus = "paid"): Promise<void> {
  const now = new Date().toISOString();
  const existing = await offlineDb.local_orders.where("idempotencyKey").equals(idempotencyKey).first();
  if (existing) {
    await offlineDb.local_orders.update(existing.localId, { serverId, serverOrderNumber, syncStatus: "synced", syncedAt: now });
    return;
  }
  await offlineDb.local_orders.put({ localId: serverId, serverId, tenantId, terminalId, localOrderNumber: serverOrderNumber, serverOrderNumber, status, paymentStatus, syncStatus: "synced", idempotencyKey, createdAtLocal: now, syncedAt: now });
}
