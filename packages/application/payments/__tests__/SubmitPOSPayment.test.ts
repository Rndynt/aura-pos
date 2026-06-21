import assert from "node:assert/strict";
import { SubmitPOSPayment, POSPaymentValidationError } from "../SubmitPOSPayment";
import type { SubmitPOSPaymentCommand } from "../POSPaymentCommand";

const baseCommand: SubmitPOSPaymentCommand = {
  tenantId: "tenant-1",
  source: "FRESH_CART",
  clientPaymentSessionId: "session-123",
  order: {
    items: [{ product_id: "product-1", product_name: "Kopi", base_price: 10000, quantity: 1 }],
    order_type_id: "type-1",
  },
  payment: {
    flow: "FULL",
    lines: [{ method: "CASH", amount: 10000, receivedAmount: 10000 }],
  },
};

const calls: SubmitPOSPaymentCommand[] = [];
const backendAllowsCartClear = true;
const useCase = new SubmitPOSPayment(
  {
    submit: async (command) => {
      calls.push(command);
      return {
        orderId: "order-1",
        orderNumber: "ORD-1",
        paymentFlow: command.payment.flow,
        paidAmount: command.payment.lines.reduce((sum, line) => sum + line.amount, 0),
        remainingAmount: 0,
        status: "PAID",
        shouldClearCart: backendAllowsCartClear,
        shouldPrintReceipt: true,
        order: { id: "order-1" },
        payments: [],
        messageTitle: "Pembayaran berhasil",
        messageDescription: "Order #ORD-1 dilunasi.",
      };
    },
  },
  {
    validateOrderTypeForTenant: async (_tenantId, orderTypeId) => ({ valid: true, orderTypeId: orderTypeId ?? null }),
  },
);

const result = await useCase.execute(baseCommand);
assert.equal(result.status, "PAID");
assert.equal(calls[0].payment.flow, "FULL");
assert.equal(calls[0].payment.lines[0].method, "CASH");

await assert.rejects(
  () => useCase.execute({ ...baseCommand, payment: { ...baseCommand.payment, flow: "full_payment" as any } }),
  (error) => error instanceof POSPaymentValidationError && error.code === "PAYMENT_FLOW_INVALID" && error.message === "Tipe pembayaran tidak valid.",
);

await assert.rejects(
  () => useCase.execute({ ...baseCommand, payment: { ...baseCommand.payment, lines: [{ method: "CARD" as any, amount: 10000 }] } }),
  (error) => error instanceof POSPaymentValidationError && error.code === "PAYMENT_METHOD_INVALID" && error.message === "Metode pembayaran tidak valid.",
);

const invalidOrderTypeUseCase = new SubmitPOSPayment(
  { submit: async () => { throw new Error("repository should not be called"); } },
  {
    validateOrderTypeForTenant: async () => ({
      valid: false,
      errorCode: "INVALID_ORDER_TYPE",
      message: "Tipe pesanan tidak valid atau belum aktif untuk tenant ini. Muat ulang POS lalu coba lagi.",
    }),
  },
);

await assert.rejects(
  () => invalidOrderTypeUseCase.execute(baseCommand),
  (error) => error instanceof POSPaymentValidationError && error.code === "INVALID_ORDER_TYPE",
);

console.log("SubmitPOSPayment tests passed");
