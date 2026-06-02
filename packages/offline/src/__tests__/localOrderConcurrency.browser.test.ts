import "fake-indexeddb/auto";
import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { offlineDb } from "../db";
import { createLocalOrder } from "../localOrderService";
import { generateLocalOrderNumber } from "../orderNumber";

const tenantId = "tenant-browser-concurrency";
const terminalId = "terminal-browser-001";

afterEach(async () => {
  if (offlineDb.isOpen()) {
    offlineDb.close();
  }
  await offlineDb.delete();
});

test("parallel browser local order creation allocates unique local order numbers", async () => {
  await offlineDb.open();

  const orderInputs = Array.from({ length: 25 }, (_, index) => ({
    tenantId,
    terminalId,
    items: [
      {
        product_id: `product-${index}`,
        product_name: `Product ${index}`,
        base_price: 10_000,
        quantity: 1,
      },
    ],
    amount: 10_000,
    payment_method: "cash" as const,
  }));

  const results = await Promise.all(orderInputs.map((input) => createLocalOrder(input)));
  const localOrderNumbers = results.map((result) => result.order.local_order_number);
  const uniqueLocalOrderNumbers = new Set(localOrderNumbers);

  assert.equal(uniqueLocalOrderNumbers.size, localOrderNumbers.length);
  assert.equal(await offlineDb.local_orders.count(), orderInputs.length);

  const sequenceRows = await offlineDb.sync_meta
    .where("key")
    .startsWith(`order_seq:${tenantId}:${terminalId}:`)
    .toArray();

  assert.equal(sequenceRows.length, 1);
  assert.equal(sequenceRows[0]?.value, String(orderInputs.length));
});

test("duplicate local order number detection uses a fallback suffix", async () => {
  await offlineDb.open();

  const firstNumber = await generateLocalOrderNumber(tenantId, terminalId);
  await offlineDb.local_orders.put({
    localId: "existing-local-order",
    tenantId,
    terminalId,
    localOrderNumber: firstNumber,
    status: "confirmed",
    paymentStatus: "paid",
    syncStatus: "pending_sync",
    idempotencyKey: "existing-idempotency-key",
    createdAtLocal: new Date().toISOString(),
  });

  const sequenceRow = await offlineDb.sync_meta
    .where("key")
    .startsWith(`order_seq:${tenantId}:${terminalId}:`)
    .first();
  assert.ok(sequenceRow);

  await offlineDb.sync_meta.put({ ...sequenceRow, value: "0" });

  const nextNumber = await generateLocalOrderNumber(tenantId, terminalId);

  assert.notEqual(nextNumber, firstNumber);
  assert.match(nextNumber, /^OFF-.*-\d{8}-\d{4}-[A-Z0-9]+$/);
});
