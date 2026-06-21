/**
 * DrizzleSubmitPOSPaymentRepository — P9.3
 *
 * Unified repository for the SubmitPOSPayment use case.
 * Executes ALL critical operations (create order, persist splits, insert payment rows,
 * update order totals) inside a single DB transaction.
 *
 * Supports:
 *   FULL        — one line, covers full remaining amount
 *   DOWN_PAYMENT — one line, partial, max two DP rows
 *   MULTI_PAYMENT — max two lines, must cover remaining amount together
 *   SPLIT_BILL   — one line per call (selected bill), persists order_bill_splits
 *
 * Idempotency:
 *   - FRESH_CART order lookup by tenant_id + idempotencyKey (= clientPaymentSessionId)
 *   - Payment line lookup by order_id + idempotencyKey (deterministic key per line)
 */

import type { Database } from "../../database";
import { DrizzleUnitOfWork } from "../../unit-of-work";
import {
  orders,
  orderItems,
  orderItemModifiers,
  orderPayments,
  orderBillSplits,
  type InsertOrder,
  type InsertOrderPayment,
} from "@pos/infrastructure/db/schema";
import { eq, and, sql } from "drizzle-orm";
import { toInsertOrderItemDb, toInsertOrderItemModifierDb } from "@pos/application/orders/mappers";
import { DEFAULT_TAX_RATE, DEFAULT_SERVICE_CHARGE_RATE } from "@pos/core/pricing";
import { calculateSelectedOptionsDelta, flattenSelectedOptions } from "@pos/application/catalog";
import { nextOrderNumberForTenant } from "../orders/orderNumberSequence";
import type { SubmitPOSPaymentRepositoryPort } from "@pos/application/payments";
import type { SubmitPOSPaymentCommand, SubmitPOSPaymentCommandItem } from "@pos/application/payments";
import type { SubmitPOSPaymentResult, SubmitPOSPaymentResultSplit } from "@pos/application/payments";

type TxClient = ReturnType<typeof DrizzleUnitOfWork.fromContext>;

function roundCurrency(n: number): number {
  return Math.round(n * 100) / 100;
}

function buildDeterministicIdempotencyKey(
  sessionId: string,
  flow: string,
  targetBillId: string | undefined,
  lineIndex: number,
  method: string,
  amount: number,
): string {
  return `${sessionId}:${flow}:${targetBillId ?? "none"}:${lineIndex}:${method}:${amount}`;
}

function computeOrderTotals(
  items: SubmitPOSPaymentCommandItem[],
  taxRate: number,
  serviceChargeRate: number,
): {
  subtotal: number;
  taxAmount: number;
  serviceChargeAmount: number;
  totalAmount: number;
  computedItems: Array<{
    product_id: string;
    product_name: string;
    base_price: number;
    quantity: number;
    variant_id?: string;
    variant_name?: string;
    variant_price_delta: number;
    selected_options: any[];
    notes?: string;
    item_subtotal: number;
    status: string;
  }>;
} {
  let subtotal = 0;
  const computedItems = items.map((item) => {
    const variantDelta = item.variant_price_delta ?? 0;
    const rawOptions = (item.selected_options ?? []).map((o) => ({
      group_id: o.group_id,
      group_name: o.group_name,
      option_id: o.option_id,
      option_name: o.option_name,
      price_delta: o.price_delta,
    }));
    const optionsDelta = calculateSelectedOptionsDelta(rawOptions, item.selected_option_groups as any);
    const flatOptions = flattenSelectedOptions(rawOptions, item.selected_option_groups as any);
    const itemPrice = item.base_price + variantDelta + optionsDelta;
    const itemSubtotal = itemPrice * item.quantity;
    subtotal += itemSubtotal;
    return {
      product_id: item.product_id,
      product_name: item.product_name,
      base_price: item.base_price,
      quantity: item.quantity,
      variant_id: item.variant_id,
      variant_name: item.variant_name,
      variant_price_delta: variantDelta,
      selected_options: flatOptions,
      notes: item.notes,
      item_subtotal: itemSubtotal,
      status: "pending",
    };
  });
  const taxAmount = subtotal * taxRate;
  const serviceChargeAmount = subtotal * serviceChargeRate;
  const totalAmount = subtotal + taxAmount + serviceChargeAmount;
  return { subtotal, taxAmount, serviceChargeAmount, totalAmount, computedItems };
}

export class DrizzleSubmitPOSPaymentRepository implements SubmitPOSPaymentRepositoryPort {
  private readonly unitOfWork: DrizzleUnitOfWork;

  constructor(
    private readonly db: Database,
    unitOfWork?: DrizzleUnitOfWork,
  ) {
    this.unitOfWork = unitOfWork ?? new DrizzleUnitOfWork(db);
  }

  async submit(command: SubmitPOSPaymentCommand): Promise<SubmitPOSPaymentResult> {
    const { tenantId, outletId, source, clientPaymentSessionId } = command;
    const flow = command.payment.flow;
    const lines = command.payment.lines;
    const targetBillId = command.payment.targetBillId ?? lines[0]?.clientBillId;
    const splits = command.payment.splits ?? [];

    const result = await this.unitOfWork.transaction(async (context) => {
      const tx = DrizzleUnitOfWork.fromContext(context)!;

      // ── 1. Resolve / create parent order ──────────────────────────────
      let orderId = command.orderId ?? "";
      let orderNumber = command.orderNumber ?? "";
      let orderTotal = 0;
      let orderPaidBefore = 0;

      if (source === "FRESH_CART" && !orderId) {
        // Check idempotency: existing order by session id
        const existingBySession = await tx
          .select({ id: orders.id, orderNumber: orders.orderNumber, total: orders.total, paidAmount: orders.paidAmount })
          .from(orders)
          .where(and(eq(orders.tenantId, tenantId), eq(orders.idempotencyKey, clientPaymentSessionId)))
          .limit(1)
          .for("update");

        if (existingBySession[0]) {
          orderId = existingBySession[0].id;
          orderNumber = existingBySession[0].orderNumber;
          orderTotal = parseFloat(existingBySession[0].total ?? "0");
          orderPaidBefore = parseFloat(existingBySession[0].paidAmount ?? "0");
        } else {
          // Create new order
          const orderData = command.order!;
          const taxRate = orderData.tax_rate ?? DEFAULT_TAX_RATE;
          const serviceChargeRate = orderData.service_charge_rate ?? DEFAULT_SERVICE_CHARGE_RATE;
          const { subtotal, taxAmount, serviceChargeAmount, totalAmount, computedItems } =
            computeOrderTotals(orderData.items, taxRate, serviceChargeRate);

          const newOrderNumber = await nextOrderNumberForTenant(tx, tenantId);

          const insertOrderData: Omit<InsertOrder, "id" | "createdAt" | "updatedAt"> = {
            tenantId,
            outletId: outletId ?? null,
            orderTypeId: orderData.order_type_id ?? null,
            orderNumber: newOrderNumber,
            status: "confirmed" as any,
            subtotal: subtotal.toString(),
            taxAmount: taxAmount.toString(),
            serviceCharge: serviceChargeAmount.toString(),
            discountAmount: "0",
            total: totalAmount.toString(),
            paidAmount: "0",
            paymentStatus: "unpaid" as any,
            customerName: orderData.customer_name,
            tableNumber: orderData.table_number,
            notes: orderData.notes,
            idempotencyKey: clientPaymentSessionId,
            orderDate: new Date(),
          };

          const [newOrder] = await tx.insert(orders).values(insertOrderData).returning();
          orderId = newOrder.id;
          orderNumber = newOrder.orderNumber;
          orderTotal = totalAmount;
          orderPaidBefore = 0;

          // Insert items
          if (computedItems.length > 0) {
            const itemsToInsert = computedItems.map((item) => toInsertOrderItemDb(item as any, newOrder.id));
            const insertedItems = await tx.insert(orderItems).values(itemsToInsert).returning();
            const modifiersToInsert: any[] = [];
            for (let i = 0; i < computedItems.length; i++) {
              const item = computedItems[i];
              const insertedItem = insertedItems[i];
              if (item.selected_options && item.selected_options.length > 0) {
                for (const option of item.selected_options) {
                  modifiersToInsert.push(toInsertOrderItemModifierDb(option, insertedItem.id));
                }
              }
            }
            if (modifiersToInsert.length > 0) {
              await tx.insert(orderItemModifiers).values(modifiersToInsert);
            }
          }
        }
      } else {
        // Lock existing order row
        const lockedOrder = await tx.execute(sql`
          SELECT id, order_number, total, paid_amount, status, payment_status
          FROM orders
          WHERE id = ${orderId} AND tenant_id = ${tenantId}
          FOR UPDATE
        `);
        const row = (lockedOrder as any).rows?.[0] ?? (lockedOrder as any)[0];
        if (!row) throw new Error("Order tidak ditemukan atau akses ditolak.");
        if (row.status === "cancelled") throw new Error("Tidak dapat mencatat pembayaran untuk order yang dibatalkan.");
        orderId = row.id;
        orderNumber = row.order_number;
        orderTotal = parseFloat(row.total ?? "0");
        orderPaidBefore = parseFloat(row.paid_amount ?? "0");
      }

      const remaining = roundCurrency(orderTotal - orderPaidBefore);

      // ── 2. Validate payment amounts against current remaining ──────────
      const lineTotal = roundCurrency(lines.reduce((s, l) => s + l.amount, 0));

      if (flow === "FULL" || flow === "DOWN_PAYMENT") {
        if (lineTotal > remaining + 0.001) {
          throw new Error("Jumlah pembayaran melebihi sisa tagihan.");
        }
      }

      if (flow === "MULTI_PAYMENT") {
        if (Math.abs(lineTotal - remaining) > 0.001) {
          throw new Error("Total multi payment harus sama dengan sisa tagihan.");
        }
      }

      // ── 3. Persist bill splits for SPLIT_BILL ─────────────────────────
      const splitIdMap = new Map<string, string>(); // clientBillId → db split id

      if (flow === "SPLIT_BILL" && splits.length > 0) {
        for (const split of splits) {
          // Look for existing split row by clientBillId on this order
          const existingSplits = await tx
            .select()
            .from(orderBillSplits)
            .where(
              and(
                eq(orderBillSplits.orderId, orderId),
                eq(orderBillSplits.splitNo, split.splitNo),
              ),
            )
            .limit(1);

          if (existingSplits[0]) {
            const existing = existingSplits[0];
            splitIdMap.set(split.clientBillId, existing.id);
            // Update amountPaid and status if this is the selected bill
            if (split.clientBillId === targetBillId) {
              const newPaid = roundCurrency(parseFloat(existing.amountPaid ?? "0") + lineTotal);
              const due = parseFloat(existing.amountDue);
              const splitStatus =
                newPaid >= due - 0.001 ? "paid" : newPaid > 0 ? "partial" : "unpaid";
              await tx
                .update(orderBillSplits)
                .set({
                  amountPaid: newPaid.toString(),
                  status: splitStatus,
                  updatedAt: new Date(),
                })
                .where(eq(orderBillSplits.id, existing.id));
            }
          } else {
            const isTargetBill = split.clientBillId === targetBillId;
            const paidNow = isTargetBill ? lineTotal : 0;
            const due = split.amountDue;
            const splitStatus =
              paidNow >= due - 0.001 ? "paid" : paidNow > 0 ? "partial" : "unpaid";

            const [newSplit] = await tx
              .insert(orderBillSplits)
              .values({
                tenantId,
                orderId,
                splitNo: split.splitNo,
                splitLabel: split.label,
                clientBillId: split.clientBillId,
                amountDue: due.toString(),
                amountPaid: paidNow.toString(),
                status: splitStatus,
              })
              .returning();
            splitIdMap.set(split.clientBillId, newSplit.id);
          }
        }
      }

      // ── 4. Check existing payment rows for DP/MULTI limits ────────────
      if (flow === "DOWN_PAYMENT") {
        const dpRows = await tx
          .select({ id: orderPayments.id })
          .from(orderPayments)
          .where(and(eq(orderPayments.orderId, orderId), eq(orderPayments.status, "succeeded"), eq(orderPayments.paymentFlow, "DOWN_PAYMENT" as any)))
          .for("update");
        if (dpRows.length >= 2) {
          throw new Error("DP payment sudah mencapai batas maksimum 2 baris.");
        }
      }

      if (flow === "MULTI_PAYMENT") {
        const multiRows = await tx
          .select({ id: orderPayments.id })
          .from(orderPayments)
          .where(and(eq(orderPayments.orderId, orderId), eq(orderPayments.status, "succeeded"), eq(orderPayments.paymentFlow, "MULTI_PAYMENT" as any)))
          .for("update");
        if (multiRows.length >= 2) {
          throw new Error("Multi payment sudah mencapai batas maksimum 2 baris.");
        }
      }

      // ── 5. Determine payment kind ──────────────────────────────────────
      function resolveKind(
        lineIdx: number,
        lineAmount: number,
      ): string {
        if (command.payment.paymentKind) return command.payment.paymentKind;
        if (flow === "DOWN_PAYMENT") {
          return lineAmount >= remaining - 0.001 ? "REMAINING_PAYMENT" : "DOWN_PAYMENT";
        }
        if (flow === "MULTI_PAYMENT") return "MULTI_PAYMENT_LINE";
        if (flow === "SPLIT_BILL") return "SPLIT_BILL_LINE";
        return "FULL_PAYMENT";
      }

      // ── 6. Insert payment rows with deterministic idempotency ─────────
      const insertedPayments: any[] = [];

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const idempotencyKey = buildDeterministicIdempotencyKey(
          clientPaymentSessionId,
          flow,
          targetBillId,
          i,
          line.method,
          line.amount,
        );

        // Idempotency check
        const existing = await tx
          .select()
          .from(orderPayments)
          .where(
            and(
              eq(orderPayments.orderId, orderId),
              eq(orderPayments.idempotencyKey, idempotencyKey),
            ),
          )
          .limit(1)
          .for("update");

        if (existing[0]) {
          insertedPayments.push(existing[0]);
          continue;
        }

        // Resolve split_id for SPLIT_BILL
        let splitId: string | undefined;
        if (flow === "SPLIT_BILL") {
          const billId = line.clientBillId ?? targetBillId;
          if (billId) splitId = splitIdMap.get(billId) ?? line.orderBillSplitId;
        }

        const paymentData: InsertOrderPayment = {
          tenantId,
          outletId: outletId ?? null,
          orderId,
          paymentFlow: flow as any,
          paymentKind: resolveKind(i, line.amount) as any,
          amount: line.amount.toString(),
          receivedAmount: line.receivedAmount != null ? line.receivedAmount.toString() : undefined,
          changeAmount:
            line.method === "CASH" && line.receivedAmount != null
              ? Math.max(0, line.receivedAmount - line.amount).toString()
              : undefined,
          status: "succeeded" as any,
          paymentMethod: line.method as any,
          paymentDate: new Date(),
          referenceNote: line.referenceNote,
          splitId,
          sequence: i + 1,
          idempotencyKey,
        };

        const [created] = await tx.insert(orderPayments).values(paymentData).returning();
        insertedPayments.push(created);
      }

      // ── 7. Update order paid_amount and payment_status ─────────────────
      const newPaidAmount = roundCurrency(orderPaidBefore + lineTotal);
      const newRemaining = roundCurrency(orderTotal - newPaidAmount);
      const newPaymentStatus: "paid" | "partial" | "unpaid" =
        newRemaining <= 0.001 ? "paid" : newPaidAmount > 0 ? "partial" : "unpaid";

      const shouldConfirmOrder = source === "FRESH_CART";
      const fulfillmentMode = command.order?.fulfillment_mode ?? "standard";

      const statusUpdates: Record<string, any> = {
        paidAmount: newPaidAmount.toString(),
        paymentStatus: newPaymentStatus,
        updatedAt: new Date(),
      };
      if (shouldConfirmOrder || source === "FRESH_CART") {
        statusUpdates.status = "confirmed";
      }
      if (newPaymentStatus === "paid" && fulfillmentMode === "instant") {
        statusUpdates.status = "completed";
        statusUpdates.closedAt = new Date();
      }

      const [updatedOrder] = await tx
        .update(orders)
        .set(statusUpdates)
        .where(and(eq(orders.id, orderId), eq(orders.tenantId, tenantId)))
        .returning();

      // ── 8. Return split rows ──────────────────────────────────────────
      let splitRows: SubmitPOSPaymentResultSplit[] = [];
      if (flow === "SPLIT_BILL") {
        const dbSplits = await tx
          .select()
          .from(orderBillSplits)
          .where(eq(orderBillSplits.orderId, orderId));
        splitRows = dbSplits.map((s) => ({
          id: s.id,
          clientBillId: s.clientBillId ?? undefined,
          label: s.splitLabel ?? `Bill ${s.splitNo}`,
          splitNo: s.splitNo,
          amountDue: parseFloat(s.amountDue),
          amountPaid: parseFloat(s.amountPaid),
          status: s.status as "unpaid" | "partial" | "paid",
        }));
      }

      return {
        updatedOrder,
        insertedPayments,
        newPaidAmount,
        newRemaining,
        newPaymentStatus,
        splitRows,
        orderNumber,
      };
    });

    const status: "PAID" | "PARTIAL" =
      result.newPaymentStatus === "paid" ? "PAID" : "PARTIAL";
    const allSplitsPaid =
      result.splitRows.length === 0 ||
      result.splitRows.every((s) => s.status === "paid");
    const shouldClearCart = status === "PAID" && allSplitsPaid;

    return {
      orderId: result.updatedOrder.id,
      orderNumber: result.orderNumber || result.updatedOrder.orderNumber,
      paymentFlow: flow,
      paidAmount: result.newPaidAmount,
      remainingAmount: result.newRemaining,
      status,
      shouldClearCart,
      shouldPrintReceipt: shouldClearCart,
      order: result.updatedOrder,
      payments: result.insertedPayments,
      splits: result.splitRows.length > 0 ? result.splitRows : undefined,
      messageTitle: status === "PARTIAL" ? "Pembayaran sebagian tersimpan" : "Pembayaran berhasil",
      messageDescription:
        status === "PARTIAL"
          ? `Order #${result.orderNumber || result.updatedOrder.orderNumber} tersimpan. Sisa tagihan dapat dilunasi dari order aktif.`
          : `Order #${result.orderNumber || result.updatedOrder.orderNumber} dilunasi.`,
    };
  }
}
