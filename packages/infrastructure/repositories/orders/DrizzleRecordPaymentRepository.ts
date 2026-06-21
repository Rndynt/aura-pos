/**
 * RecordPayment Use Case (P1.2 hardening)
 *
 * Records a payment for an existing order.
 * Supports partial payments.
 *
 * Transaction safety (P1.2):
 *  - All reads and writes run inside a single DB transaction.
 *  - The order row is locked (SELECT … FOR UPDATE) before computing remaining balance,
 *    preventing concurrent payment race conditions.
 *
 * Idempotency:
 *  - Caller can supply `idempotency_key`; this use case replays the existing
 *    payment for the same order inside the transaction before inserting.
 *  - `transaction_ref` remains a separate business reference.
 */

import type { Database } from '../../database';
import { DrizzleUnitOfWork } from '../../unit-of-work';
import {
  orderPayments,
  type InsertOrderPayment,
} from '@pos/infrastructure/db/schema';
import { eq, and, sql } from 'drizzle-orm';

import type { RecordPaymentInput, RecordPaymentOutput } from '@pos/application/orders/RecordPayment';

export class DrizzleRecordPaymentRepository {
  private readonly unitOfWork: DrizzleUnitOfWork;

  constructor(private readonly db: Database, unitOfWork?: DrizzleUnitOfWork) {
    this.unitOfWork = unitOfWork ?? new DrizzleUnitOfWork(db);
  }

  async recordPayment(input: RecordPaymentInput): Promise<RecordPaymentOutput> {
    if (input.amount <= 0) {
      throw new Error('Payment amount must be greater than zero');
    }

    // --------------------------------------------------------------------------
    // Run everything inside a transaction with row lock on the order (P1.2)
    // --------------------------------------------------------------------------
    const result = await this.unitOfWork.transaction(async (context) => {
      const tx = DrizzleUnitOfWork.fromContext(context)!;
      // Lock the order row for this tenant to prevent concurrent payment race
      const lockedOrders = await tx.execute(sql`
        SELECT id, tenant_id, outlet_id, status, payment_status, total, paid_amount
        FROM orders
        WHERE id = ${input.order_id}
          AND tenant_id = ${input.tenant_id}
        FOR UPDATE
      `);

      const orderRow = (lockedOrders as any).rows?.[0] ?? (lockedOrders as any)[0];

      if (!orderRow) {
        throw new Error('Order not found or access denied');
      }

      if (orderRow.status === 'cancelled') {
        throw new Error('Cannot record payment for cancelled order');
      }

      const orderTotal = parseFloat(orderRow.total ?? '0');
      const orderPaid = parseFloat(orderRow.paid_amount ?? '0');
      const remaining = orderTotal - orderPaid;

      if (input.idempotency_key) {
        const existingPayments = await tx
          .select()
          .from(orderPayments)
          .where(
            and(
              eq(orderPayments.orderId, input.order_id),
              eq(orderPayments.idempotencyKey, input.idempotency_key)
            )
          )
          .limit(1)
          .for('update');

        if (existingPayments[0]) {
          return {
            payment: existingPayments[0],
            order: orderRow,
            remainingAmount: Math.max(0, remaining),
            idempotent_replay: true,
          };
        }
      }

      if (input.amount > remaining + 0.001) {
        throw new Error(
          `Payment amount (${input.amount}) exceeds remaining balance (${remaining.toFixed(2)})`
        );
      }

      const existingSucceededPayments = await tx
        .select()
        .from(orderPayments)
        .where(and(eq(orderPayments.orderId, input.order_id), eq(orderPayments.status, 'succeeded')))
        .for('update');

      const flow = input.payment_flow ?? 'FULL';
      const kind = input.payment_kind ?? (flow === 'DOWN_PAYMENT' ? (existingSucceededPayments.length > 0 ? 'REMAINING_PAYMENT' : 'DOWN_PAYMENT') : flow === 'MULTI_PAYMENT' ? 'MULTI_PAYMENT_LINE' : flow === 'SPLIT_BILL' ? 'SPLIT_BILL_LINE' : 'FULL_PAYMENT');

      if (flow === 'DOWN_PAYMENT') {
        const dpRows = existingSucceededPayments.filter((payment: any) => payment.paymentFlow === 'DOWN_PAYMENT');
        if (dpRows.length >= 2) {
          throw new Error('P9 DP flow allows a maximum of two succeeded payment rows');
        }
        if (kind === 'DOWN_PAYMENT' && input.amount >= remaining - 0.001) {
          throw new Error('Down payment amount must be less than remaining balance');
        }
      }

      if (flow === 'MULTI_PAYMENT') {
        const multiRows = existingSucceededPayments.filter((payment: any) => payment.paymentFlow === 'MULTI_PAYMENT');
        if (multiRows.length >= 2) {
          throw new Error('P9 multi payment allows a maximum of two payment rows');
        }
      }

      // Insert payment record
      const paymentData: InsertOrderPayment = {
        tenantId: input.tenant_id,
        outletId: orderRow.outlet_id ?? null,
        orderId: input.order_id,
        paymentFlow: flow as any,
        paymentKind: kind as any,
        amount: input.amount.toString(),
        receivedAmount: input.received_amount != null ? input.received_amount.toString() : undefined,
        changeAmount: input.change_amount != null ? input.change_amount.toString() : undefined,
        status: 'succeeded' as any,
        splitId: input.split_id,
        sequence: input.sequence ?? existingSucceededPayments.length + 1,
        paymentMethod: input.payment_method as any,
        paymentDate: new Date(),
        referenceNumber: input.transaction_ref,
        referenceNote: input.reference_note,
        notes: input.notes,
        metadata: input.metadata as any,
        idempotencyKey: input.idempotency_key,
      };

      const [createdPayment] = await tx.insert(orderPayments).values(paymentData).returning();

      // Compute new payment status
      const newPaidAmount = orderPaid + input.amount;
      const newRemaining = orderTotal - newPaidAmount;

      const newPaymentStatus: 'paid' | 'partial' | 'unpaid' =
        newRemaining <= 0.001 ? 'paid' : newPaidAmount > 0 ? 'partial' : 'unpaid';

      // Keep fulfillment/order lifecycle explicit: payment success must not
      // automatically close order. This allows paid and unpaid orders to stay
      // visible in operational queues until cashier/kitchen completes flow.
      // Use raw SQL update to match DB column names (snake_case).
      // Use NOW() for updated_at to avoid Date-object serialization issues
      // with the postgres driver in raw sql template contexts.
      //
      // Business rule: a draft order is not financially active.
      // When the first payment is recorded against a draft, promote it to
      // 'confirmed' so it is no longer treated as an editable draft.
      // payment_status is a separate dimension and stays as-is.
      const shouldConfirmOrder = orderRow.status === 'draft' && newPaidAmount > 0;

      const updatedOrders = await tx.execute(sql`
        UPDATE orders
        SET
          paid_amount    = ${newPaidAmount.toString()},
          payment_status = ${newPaymentStatus},
          status         = CASE WHEN ${shouldConfirmOrder} THEN 'confirmed' ELSE status END,
          updated_at     = NOW()
        WHERE id = ${input.order_id}
          AND tenant_id = ${input.tenant_id}
        RETURNING *
      `);

      const updatedOrder = (updatedOrders as any).rows?.[0] ?? (updatedOrders as any)[0];

      return {
        payment: createdPayment,
        order: updatedOrder,
        remainingAmount: Math.max(0, newRemaining),
      };
    });

    return result;
  }
}
