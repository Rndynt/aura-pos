/**
 * DrizzleSubmitPOSPaymentRepository
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
  orderBillSplitItems,
  type InsertOrder,
  type InsertOrderPayment,
  type InsertOrderItemModifier,
  type OrderBillSplit,
  type OrderPayment,
} from "@pos/infrastructure/db/schema";
import { eq, and, sql, inArray } from "drizzle-orm";
import { toInsertOrderItemDb, toInsertOrderItemModifierDb } from "@pos/application/orders/mappers";
import { DEFAULT_TAX_RATE, DEFAULT_SERVICE_CHARGE_RATE, calculateOrderPricing } from "@pos/core/pricing";
import { flattenSelectedOptions } from "@pos/application/catalog";
import { nextOrderNumberForTenant } from "../orders/orderNumberSequence";
import { firstRawRow, mapRawLockedOrderRow, toDbOrderPaymentStatus, toDbOrderStatus, toDbPaymentFlow, toDbPaymentKind, toDbPaymentMethod, toDbPaymentStatus, toOrderItemModifiers, toPaymentOrderItem } from "../orders/paymentPersistenceMappers";
import type { SubmitPOSPaymentRepositoryPort } from "@pos/application/payments";
import type { SubmitPOSPaymentCommand, SubmitPOSPaymentCommandItem } from "@pos/application/payments";
import type { SubmitPOSPaymentResult, SubmitPOSPaymentResultSplit } from "@pos/application/payments";
import type { SelectedOptionGroup } from "@pos/domain/orders/types";

type TxClient = NonNullable<ReturnType<typeof DrizzleUnitOfWork.fromContext>>;
const EPSILON = 0.001;
type CommandSplit = NonNullable<SubmitPOSPaymentCommand["payment"]["splits"]>[number];

type SelectedSplitState = {
  clientBillId: string;
  splitNo: number;
  splitDbId?: string;
  amountDue: number;
  amountPaid: number;
  remaining: number;
};

function roundCurrency(n: number): number {
  return Math.round(n * 100) / 100;
}

export function validateSelectedSplitPaymentInvariant(
  selectedSplit: SelectedSplitState,
  newLineTotal: number,
): void {
  if (newLineTotal <= EPSILON) return;

  if (selectedSplit.amountDue <= EPSILON) {
    throw new Error("Bill yang dipilih tidak valid atau sudah lunas.");
  }

  if (selectedSplit.remaining <= EPSILON) {
    throw new Error("Bill yang dipilih sudah lunas.");
  }

  if (Math.abs(newLineTotal - selectedSplit.remaining) > EPSILON) {
    throw new Error("Jumlah pembayaran harus sama dengan sisa bill yang dipilih.");
  }
}

function findRequestSplit(
  splits: SubmitPOSPaymentCommand["payment"]["splits"],
  selectedBillId: string | undefined,
): CommandSplit | undefined {
  if (!selectedBillId || !splits) return undefined;
  return splits.find((split) => split.clientBillId === selectedBillId);
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

async function resolveSelectedSplitState({
  tx,
  orderId,
  targetBillId,
  lineBillId,
  lineSplitDbId,
  splits,
}: {
  tx: TxClient;
  orderId: string;
  targetBillId?: string;
  lineBillId?: string;
  lineSplitDbId?: string;
  splits: SubmitPOSPaymentCommand["payment"]["splits"];
}): Promise<{ selectedSplit: SelectedSplitState; existingSplits: OrderBillSplit[] }> {
  // Determine which bill is being paid (prefer targetBillId from frontend)
  const selectedBillId = targetBillId ?? lineBillId ?? lineSplitDbId;
  if (!selectedBillId) {
    throw new Error("Bill yang dipilih tidak valid atau sudah lunas.");
  }

  // Lock existing splits for this order to prevent concurrent payments
  const existingSplits = await tx
    .select()
    .from(orderBillSplits)
    .where(eq(orderBillSplits.orderId, orderId))
    .for("update");

  // Try to find the target bill in the DB (for resuming a partially-paid split)
  const dbSplit = existingSplits.find(
    (split) =>
      split.clientBillId === selectedBillId ||
      (lineSplitDbId != null && split.id === lineSplitDbId),
  );

  // Try to find the target bill in the request payload (for first-time split)
  const requestSplit = findRequestSplit(splits, selectedBillId) ??
    findRequestSplit(splits, targetBillId) ??
    findRequestSplit(splits, lineBillId);

  // Must have at least one source of truth
  if (!dbSplit && !requestSplit) {
    throw new Error("Bill yang dipilih tidak valid atau sudah lunas.");
  }

  // DB takes priority for amounts (source of truth after first payment)
  const amountDue = roundCurrency(parseFloat(dbSplit?.amountDue ?? String(requestSplit?.amountDue ?? 0)));
  const amountPaid = roundCurrency(parseFloat(dbSplit?.amountPaid ?? String(requestSplit?.amountPaid ?? 0)));
  const clientBillId = dbSplit?.clientBillId ?? requestSplit?.clientBillId ?? selectedBillId;
  const splitNo = dbSplit?.splitNo ?? requestSplit?.splitNo ?? 1;

  return {
    existingSplits,
    selectedSplit: {
      clientBillId,
      splitNo,
      splitDbId: dbSplit?.id,
      amountDue,
      amountPaid,
      remaining: roundCurrency(amountDue - amountPaid),
    },
  };
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
    selected_options: SubmitPOSPaymentCommandItem["selected_options"];
    notes?: string;
    item_subtotal: number;
    client_item_id?: string;
    status: "pending";
  }>;
} {
  const pricing = calculateOrderPricing({
    items: items.map((item) => ({
      base_price: item.base_price,
      quantity: item.quantity,
      variant_price_delta: item.variant_price_delta,
      selected_options: (item.selected_options ?? []).map((o) => ({
        group_id: o.group_id,
        group_name: o.group_name,
        option_id: o.option_id,
        option_name: o.option_name,
        price_delta: o.price_delta,
      })),
      selected_option_groups: item.selected_option_groups as SelectedOptionGroup[] | undefined,
    })),
    tax_rate: taxRate,
    service_charge_rate: serviceChargeRate,
  });
  const computedItems = items.map((item, index) => {
    const rawOptions = (item.selected_options ?? []).map((o) => ({
      group_id: o.group_id,
      group_name: o.group_name,
      option_id: o.option_id,
      option_name: o.option_name,
      price_delta: o.price_delta,
    }));
    const optionGroups = item.selected_option_groups as SelectedOptionGroup[] | undefined;
    const flatOptions = flattenSelectedOptions(rawOptions, optionGroups);
    return {
      product_id: item.product_id,
      product_name: item.product_name,
      base_price: item.base_price,
      quantity: item.quantity,
      variant_id: item.variant_id,
      variant_name: item.variant_name,
      variant_price_delta: item.variant_price_delta ?? 0,
      selected_options: flatOptions,
      notes: item.notes,
      item_subtotal: pricing.items[index].item_subtotal,
      client_item_id: item.client_item_id,
      status: "pending" as const,
    };
  });
  const subtotal = pricing.order_subtotal;
  const taxAmount = pricing.tax_amount;
  const serviceChargeAmount = pricing.service_charge_amount;
  const totalAmount = pricing.total_amount;
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
      const orderItemIdByClientId = new Map<string, string>();

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
            status: toDbOrderStatus("confirmed"),
            subtotal: subtotal.toString(),
            taxAmount: taxAmount.toString(),
            serviceCharge: serviceChargeAmount.toString(),
            discountAmount: "0",
            total: totalAmount.toString(),
            paidAmount: "0",
            paymentStatus: toDbOrderPaymentStatus("unpaid"),
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
            const itemsToInsert = computedItems.map((item) => toInsertOrderItemDb(toPaymentOrderItem(item), newOrder.id));
            const insertedItems = await tx.insert(orderItems).values(itemsToInsert).returning();
            computedItems.forEach((item, index) => { if (item.client_item_id) orderItemIdByClientId.set(item.client_item_id, insertedItems[index].id); });
            const modifiersToInsert: InsertOrderItemModifier[] = computedItems.flatMap((item, index) =>
              toOrderItemModifiers(item.selected_options ?? [], insertedItems[index].id, toInsertOrderItemModifierDb)
            );
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
        const lockedOrderRow = firstRawRow(lockedOrder);
        const row = lockedOrderRow ? mapRawLockedOrderRow(lockedOrderRow) : undefined;
        if (!row) throw new Error("Order tidak ditemukan atau akses ditolak.");
        if (row.status === "cancelled") throw new Error("Tidak dapat mencatat pembayaran untuk order yang dibatalkan.");
        orderId = row.id;
        orderNumber = row.orderNumber ?? "";
        orderTotal = parseFloat(row.total ?? "0");
        orderPaidBefore = parseFloat(row.paidAmount ?? "0");
      }

      const remaining = roundCurrency(orderTotal - orderPaidBefore);

      // ── 2. Build deterministic idempotency keys and detect replays ─────
      const lineStates = lines.map((line, index) => ({
        line,
        index,
        idempotencyKey: buildDeterministicIdempotencyKey(
          clientPaymentSessionId,
          flow,
          targetBillId,
          index,
          line.method,
          line.amount,
        ),
        existingPayment: undefined as OrderPayment | undefined,
      }));

      if (lineStates.length > 0) {
        const existingPayments = await tx
          .select()
          .from(orderPayments)
          .where(
            and(
              eq(orderPayments.orderId, orderId),
              inArray(orderPayments.idempotencyKey, lineStates.map((state) => state.idempotencyKey)),
            ),
          )
          .for("update");
        const existingByKey = new Map(existingPayments.map((payment) => [payment.idempotencyKey, payment]));
        for (const state of lineStates) {
          state.existingPayment = existingByKey.get(state.idempotencyKey);
        }
      }

      const lineTotal = roundCurrency(lines.reduce((s, l) => s + l.amount, 0));
      const newLineTotal = roundCurrency(
        lineStates
          .filter((state) => !state.existingPayment)
          .reduce((sum, state) => sum + state.line.amount, 0),
      );

      if (remaining <= 0.001 && newLineTotal > 0.001) {
        throw new Error("Order sudah lunas. Pembayaran baru tidak dapat dicatat.");
      }

      // ── 3. Validate new payment amounts against current remaining ──────

      if (flow === "FULL" || flow === "DOWN_PAYMENT") {
        if (newLineTotal > remaining + 0.001) {
          throw new Error("Jumlah pembayaran melebihi sisa tagihan.");
        }
      }

      if (flow === "MULTI_PAYMENT" && newLineTotal > 0.001) {
        if (Math.abs(newLineTotal - remaining) > 0.001) {
          throw new Error("Total multi payment harus sama dengan sisa tagihan.");
        }
      }

      // ── 4. Persist bill splits for SPLIT_BILL ─────────────────────────
      const splitIdMap = new Map<string, string>(); // clientBillId → db split id
      let existingSplitRows: OrderBillSplit[] = [];
      let selectedSplitState: SelectedSplitState | undefined;

      if (flow === "SPLIT_BILL") {
        const selectedLine = lineStates.find((state) => !state.existingPayment)?.line ?? lines[0];
        const resolved = await resolveSelectedSplitState({
          tx,
          orderId,
          targetBillId,
          lineBillId: selectedLine?.clientBillId,
          lineSplitDbId: selectedLine?.orderBillSplitId,
          splits,
        });
        existingSplitRows = resolved.existingSplits;
        selectedSplitState = resolved.selectedSplit;
        validateSelectedSplitPaymentInvariant(selectedSplitState, newLineTotal);

        for (const existing of existingSplitRows) {
          splitIdMap.set(existing.id, existing.id);
          if (existing.clientBillId) {
            splitIdMap.set(existing.clientBillId, existing.id);
          }
        }
      }

      if (flow === "SPLIT_BILL" && splits.length > 0) {
        for (const split of splits) {
          const existing = existingSplitRows.find(
            (row) => row.splitNo === split.splitNo || row.clientBillId === split.clientBillId,
          );

          if (existing) {
            splitIdMap.set(split.clientBillId, existing.id);
            // Update amountPaid and status if this is the selected bill
            if (selectedSplitState?.splitNo === existing.splitNo && newLineTotal > EPSILON) {
              const newPaid = roundCurrency(parseFloat(existing.amountPaid ?? "0") + newLineTotal);
              const due = parseFloat(existing.amountDue);
              const splitStatus =
                newPaid >= due - EPSILON ? "paid" : newPaid > 0 ? "partial" : "unpaid";
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
            const isTargetBill = selectedSplitState?.clientBillId === split.clientBillId;
            const paidNow = isTargetBill ? newLineTotal : 0;
            const due = split.amountDue;
            const splitStatus =
              paidNow >= due - EPSILON ? "paid" : paidNow > 0 ? "partial" : "unpaid";

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

      // ── 4b. Persist split-bill item assignments ───────────────────────
      if (flow === "SPLIT_BILL" && newLineTotal > EPSILON && selectedSplitState) {
        const selectedRequestSplit = splits.find((split) => split.clientBillId === selectedSplitState!.clientBillId || split.splitNo === selectedSplitState!.splitNo);
        const selectedItems = selectedRequestSplit?.items ?? [];
        if (selectedItems.length === 0) {
          throw new Error("Item bill belum dipilih. Pilih item yang ingin dibayar.");
        }

        const resolvedItems = selectedItems.map((item) => ({
          ...item,
          orderItemId: item.orderItemId ?? (item.clientItemId ? orderItemIdByClientId.get(item.clientItemId) : undefined),
        }));
        if (resolvedItems.some((item) => !item.orderItemId)) {
          throw new Error("Item bill belum dipilih. Pilih item yang ingin dibayar.");
        }

        const selectedItemIds = resolvedItems.map((item) => item.orderItemId!) as string[];
        const ownedItems = await tx
          .select({ id: orderItems.id, quantity: orderItems.quantity })
          .from(orderItems)
          .where(and(eq(orderItems.orderId, orderId), inArray(orderItems.id, selectedItemIds)))
          .for("update");
        if (ownedItems.length !== selectedItemIds.length) {
          throw new Error("Item bill belum dipilih. Pilih item yang ingin dibayar.");
        }
        const orderQtyByItemId = new Map(ownedItems.map((item) => [item.id, Number(item.quantity || 0)]));

        const selectedQtyByItemId = new Map<string, number>();
        for (const item of resolvedItems) {
          selectedQtyByItemId.set(item.orderItemId!, roundCurrency((selectedQtyByItemId.get(item.orderItemId!) ?? 0) + Number(item.quantity || 0)));
        }

        const selectedItemAmount = roundCurrency(resolvedItems.reduce((sum, item) => sum + Number(item.amount || 0), 0));
        if (Math.abs(selectedItemAmount - selectedSplitState.remaining) > EPSILON) {
          throw new Error("Jumlah bill tidak sesuai dengan item yang dipilih.");
        }

        const paidSplitRows = await tx
          .select({ orderItemId: orderBillSplitItems.orderItemId, quantity: orderBillSplitItems.quantity })
          .from(orderBillSplitItems)
          .innerJoin(orderBillSplits, eq(orderBillSplitItems.orderBillSplitId, orderBillSplits.id))
          .where(and(
            eq(orderBillSplitItems.orderId, orderId),
            inArray(orderBillSplitItems.orderItemId, selectedItemIds),
            eq(orderBillSplits.status, "paid"),
          ))
          .for("update");
        const paidQtyByItemId = new Map<string, number>();
        for (const item of paidSplitRows) {
          paidQtyByItemId.set(item.orderItemId, roundCurrency((paidQtyByItemId.get(item.orderItemId) ?? 0) + Number(item.quantity || 0)));
        }
        for (const [itemId, selectedQty] of selectedQtyByItemId.entries()) {
          const maxQty = orderQtyByItemId.get(itemId) ?? 0;
          const paidQty = paidQtyByItemId.get(itemId) ?? 0;
          if (selectedQty <= 0 || paidQty + selectedQty > maxQty + EPSILON) {
            throw new Error("Item sudah pernah dibayar di bill lain. Muat ulang pesanan.");
          }
        }

        const selectedSplitDbId = splitIdMap.get(selectedSplitState.clientBillId) ?? selectedSplitState.splitDbId;
        if (!selectedSplitDbId) throw new Error("Bill yang dipilih tidak valid atau sudah lunas.");

        await tx.insert(orderBillSplitItems).values(resolvedItems.map((item) => ({
          orderId,
          orderBillSplitId: selectedSplitDbId,
          orderItemId: item.orderItemId!,
          clientBillId: selectedSplitState!.clientBillId,
          quantity: String(item.quantity || 1),
          amount: String(roundCurrency(Number(item.amount || 0))),
        }))).onConflictDoUpdate({
          target: [orderBillSplitItems.orderId, orderBillSplitItems.orderItemId, orderBillSplitItems.clientBillId],
          set: {
            quantity: sql`excluded.quantity`,
            amount: sql`excluded.amount`,
            updatedAt: new Date(),
          },
        });
      }

      // ── 5. Check existing payment rows for DP/MULTI limits ────────────
      if (flow === "DOWN_PAYMENT" && newLineTotal > 0.001) {
        const dpRows = await tx
          .select({ id: orderPayments.id })
          .from(orderPayments)
          .where(and(eq(orderPayments.orderId, orderId), eq(orderPayments.status, "succeeded"), eq(orderPayments.paymentFlow, toDbPaymentFlow("DOWN_PAYMENT"))))
          .for("update");
        if (dpRows.length >= 2) {
          throw new Error("DP payment sudah mencapai batas maksimum 2 baris.");
        }
      }

      if (flow === "MULTI_PAYMENT" && newLineTotal > 0.001) {
        const multiRows = await tx
          .select({ id: orderPayments.id })
          .from(orderPayments)
          .where(and(eq(orderPayments.orderId, orderId), eq(orderPayments.status, "succeeded"), eq(orderPayments.paymentFlow, toDbPaymentFlow("MULTI_PAYMENT"))))
          .for("update");
        if (multiRows.length >= 2) {
          throw new Error("Multi payment sudah mencapai batas maksimum 2 baris.");
        }
      }

      // ── 6. Determine payment kind ──────────────────────────────────────
      function resolveKind(lineAmount: number): string {
        if (command.payment.paymentKind) return command.payment.paymentKind;
        if (flow === "DOWN_PAYMENT") {
          return lineAmount >= remaining - 0.001 ? "REMAINING_PAYMENT" : "DOWN_PAYMENT";
        }
        if (flow === "MULTI_PAYMENT") return "MULTI_PAYMENT_LINE";
        if (flow === "SPLIT_BILL") return "SPLIT_BILL_LINE";
        return "FULL_PAYMENT";
      }

      // ── 7. Insert only new payment rows ───────────────────────────────
      const insertedPayments: OrderPayment[] = [];

      for (const state of lineStates) {
        const line = state.line;
        if (state.existingPayment) {
          insertedPayments.push(state.existingPayment);
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
          paymentFlow: toDbPaymentFlow(flow),
          paymentKind: toDbPaymentKind(resolveKind(line.amount)),
          amount: line.amount.toString(),
          receivedAmount: line.receivedAmount != null ? line.receivedAmount.toString() : undefined,
          changeAmount:
            line.method === "CASH" && line.receivedAmount != null
              ? Math.max(0, line.receivedAmount - line.amount).toString()
              : undefined,
          status: toDbPaymentStatus("succeeded"),
          paymentMethod: toDbPaymentMethod(line.method),
          paymentDate: new Date(),
          referenceNote: line.referenceNote,
          splitId,
          sequence: state.index + 1,
          idempotencyKey: state.idempotencyKey,
        };

        const [created] = await tx.insert(orderPayments).values(paymentData).returning();
        insertedPayments.push(created);
      }

      // ── 8. Update order paid_amount and payment_status by new rows only ─
      const newPaidAmount = roundCurrency(orderPaidBefore + newLineTotal);
      const newRemaining = roundCurrency(orderTotal - newPaidAmount);
      const newPaymentStatus: "paid" | "partial" | "unpaid" =
        newRemaining <= 0.001 ? "paid" : newPaidAmount > 0 ? "partial" : "unpaid";

      const shouldConfirmOrder = source === "FRESH_CART";
      const fulfillmentMode = command.order?.fulfillment_mode ?? "standard";

      const statusUpdates: Partial<typeof orders.$inferInsert> = {
        paidAmount: newPaidAmount.toString(),
        paymentStatus: toDbOrderPaymentStatus(newPaymentStatus),
        updatedAt: new Date(),
      };
      if (shouldConfirmOrder) {
        statusUpdates.status = toDbOrderStatus("confirmed");
      }
      if (newPaymentStatus === "paid" && fulfillmentMode === "instant") {
        statusUpdates.status = toDbOrderStatus("completed");
        statusUpdates.closedAt = new Date();
      }

      const [updatedOrder] = newLineTotal > 0.001
        ? await tx
            .update(orders)
            .set(statusUpdates)
            .where(and(eq(orders.id, orderId), eq(orders.tenantId, tenantId)))
            .returning()
        : await tx
            .select()
            .from(orders)
            .where(and(eq(orders.id, orderId), eq(orders.tenantId, tenantId)))
            .limit(1);

      // ── 9. Return split rows ──────────────────────────────────────────
      let splitRows: SubmitPOSPaymentResultSplit[] = [];
      if (flow === "SPLIT_BILL") {
        const dbSplits = await tx
          .select()
          .from(orderBillSplits)
          .where(eq(orderBillSplits.orderId, orderId));
        const dbSplitItems = await tx
          .select()
          .from(orderBillSplitItems)
          .where(eq(orderBillSplitItems.orderId, orderId));
        const itemsBySplit = new Map<string, typeof dbSplitItems>();
        for (const item of dbSplitItems) {
          const current = itemsBySplit.get(item.orderBillSplitId) ?? [];
          current.push(item);
          itemsBySplit.set(item.orderBillSplitId, current);
        }
        splitRows = dbSplits.map((s) => ({
          id: s.id,
          clientBillId: s.clientBillId ?? undefined,
          label: s.splitLabel ?? `Bill ${s.splitNo}`,
          splitNo: s.splitNo,
          amountDue: parseFloat(s.amountDue),
          amountPaid: parseFloat(s.amountPaid),
          status: toDbOrderPaymentStatus(s.status),
          items: (itemsBySplit.get(s.id) ?? []).map((item) => ({
            orderItemId: item.orderItemId,
            quantity: parseFloat(item.quantity),
            amount: parseFloat(item.amount),
          })),
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
