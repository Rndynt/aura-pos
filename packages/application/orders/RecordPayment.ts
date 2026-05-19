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
 *  - Caller can supply a unique `transaction_ref`; the controller layer handles
 *    replay detection before calling this use case.
 */

import type { Database } from '@pos/infrastructure/database';
import {
  orders,
  orderPayments,
  type InsertOrderPayment,
} from '../../../shared/schema';
import { eq, and, sql } from 'drizzle-orm';
import type { OrderPayment } from '@pos/domain/orders/types';

export interface RecordPaymentInput {
  order_id: string;
  tenant_id: string;
  amount: number;
  payment_method: 'cash' | 'card' | 'ewallet' | 'other';
  transaction_ref?: string;
  notes?: string;
}

export interface RecordPaymentOutput {
  payment: any;
  order: any;
  remainingAmount: number;
}

export class RecordPayment {
  constructor(private readonly db: Database) {}

  async execute(input: RecordPaymentInput): Promise<RecordPaymentOutput> {
    if (input.amount <= 0) {
      throw new Error('Payment amount must be greater than zero');
    }

    // --------------------------------------------------------------------------
    // Run everything inside a transaction with row lock on the order (P1.2)
    // --------------------------------------------------------------------------
    const result = await this.db.transaction(async (tx) => {
      // Lock the order row for this tenant to prevent concurrent payment race
      const lockedOrders = await tx.execute(sql`
        SELECT id, tenant_id, status, payment_status, total, paid_amount
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

      if (input.amount > remaining + 0.001) {
        throw new Error(
          `Payment amount (${input.amount}) exceeds remaining balance (${remaining.toFixed(2)})`
        );
      }

      // Insert payment record
      const paymentData: InsertOrderPayment = {
        orderId: input.order_id,
        amount: input.amount.toString(),
        paymentMethod: input.payment_method as any,
        paymentDate: new Date(),
        referenceNumber: input.transaction_ref,
        notes: input.notes,
      };

      const [createdPayment] = await tx.insert(orderPayments).values(paymentData).returning();

      // Compute new payment status
      const newPaidAmount = orderPaid + input.amount;
      const newRemaining = orderTotal - newPaidAmount;

      const newPaymentStatus: 'paid' | 'partial' | 'unpaid' =
        newRemaining <= 0.001 ? 'paid' : newPaidAmount > 0 ? 'partial' : 'unpaid';

      // Set closedAt and status = completed if fully paid
      const orderUpdates: Record<string, any> = {
        paid_amount: newPaidAmount.toString(),
        payment_status: newPaymentStatus,
        updated_at: new Date(),
      };
      if (newPaymentStatus === 'paid') {
        // Auto-close only if order is in a settled fulfillment state
        const currentStatus = orderRow.status as string;
        if (['ready', 'served', 'confirmed', 'preparing'].includes(currentStatus)) {
          orderUpdates.status = 'completed';
          orderUpdates.closed_at = new Date();
        }
      }

      // Use raw SQL update to match DB column names (snake_case)
      const updatedOrders = await tx.execute(sql`
        UPDATE orders
        SET
          paid_amount = ${orderUpdates.paid_amount},
          payment_status = ${orderUpdates.payment_status},
          updated_at = ${orderUpdates.updated_at},
          status = CASE WHEN ${orderUpdates.status ?? null} IS NOT NULL
                        THEN ${orderUpdates.status ?? orderRow.status}
                        ELSE status END,
          closed_at = CASE WHEN ${orderUpdates.closed_at ?? null} IS NOT NULL
                           THEN ${orderUpdates.closed_at ?? null}
                           ELSE closed_at END
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
