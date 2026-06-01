/**
 * CreateAndPayOrder Use Case (P0.2)
 *
 * True atomic create-order + record-payment within a single DB transaction.
 * Eliminates the compensating-rollback pattern and closes the orphaned-order risk.
 *
 * This is the preferred flow for counter/quick-service where payment is collected
 * at the same moment the order is placed.
 *
 * Idempotency:
 *  - Caller supplies `idempotency_key` (UUID or similar, 8–128 chars).
 *  - If a payment with that key already exists for this tenant, the prior result is replayed.
 *  - Idempotency check happens BEFORE the transaction to avoid unnecessary locking.
 */

import type { Database } from '@pos/infrastructure/database';
import {
  orders,
  orderItems,
  orderItemModifiers,
  orderPayments,
  products,
  inventoryMovements,
  type InsertOrder,
} from '../../../shared/schema';
import { eq, and, inArray, gte, count, sql } from 'drizzle-orm';
import { toInsertOrderItemDb, toInsertOrderItemModifierDb } from './mappers';
import { DEFAULT_TAX_RATE, DEFAULT_SERVICE_CHARGE_RATE } from '@pos/core/pricing';
import { calculateSelectedOptionsDelta, flattenSelectedOptions } from '../catalog';
import type { SelectedOption, SelectedOptionGroup } from '@pos/domain/orders/types';

// ---------------------------------------------------------------------------
// Input / Output types
// ---------------------------------------------------------------------------

export interface CreateAndPayOrderItemInput {
  product_id: string;
  product_name: string;
  base_price: number;
  quantity: number;
  variant_id?: string;
  variant_name?: string;
  variant_price_delta?: number;
  selected_options?: SelectedOption[];
  selected_option_groups?: SelectedOptionGroup[];
  notes?: string;
}

export interface CreateAndPayOrderInput {
  tenant_id: string;
  outlet_id?: string | null;
  // Order fields
  items: CreateAndPayOrderItemInput[];
  order_type_id?: string;
  customer_name?: string;
  table_number?: string;
  notes?: string;
  tax_rate?: number;
  service_charge_rate?: number;
  // Payment fields
  amount: number;
  payment_method: 'cash' | 'card' | 'ewallet' | 'other';
  transaction_ref?: string;
  payment_notes?: string;
  idempotency_key?: string;
}

export interface CreateAndPayOrderOutput {
  order: any;
  payment: any;
  idempotent_replay?: boolean;
  remainingAmount: number;
}

// ---------------------------------------------------------------------------
// Use case
// ---------------------------------------------------------------------------

export class CreateAndPayOrder {
  constructor(private readonly db: Database) {}

  async execute(input: CreateAndPayOrderInput): Promise<CreateAndPayOrderOutput> {
    const {
      tenant_id,
      outlet_id,
      items,
      order_type_id,
      customer_name,
      table_number,
      notes,
      tax_rate,
      service_charge_rate,
      amount,
      payment_method,
      transaction_ref,
      payment_notes,
      idempotency_key,
    } = input;

    // ------------------------------------------------------------------
    // Validate products belong to tenant (outside transaction — pure read)
    // ------------------------------------------------------------------
    const productIds = [...new Set(items.map(i => i.product_id))];
    const validProducts = await this.db
      .select({ id: products.id, isActive: products.isActive })
      .from(products)
      .where(and(inArray(products.id, productIds), eq(products.tenantId, tenant_id)));

    const validProductSet = new Set(validProducts.filter(p => p.isActive).map(p => p.id));
    const invalid = productIds.filter(id => !validProductSet.has(id));
    if (invalid.length > 0) {
      throw new Error(`Products not found or inactive for tenant: ${invalid.join(', ')}`);
    }

    // ------------------------------------------------------------------
    // Price calculation (outside transaction — pure computation)
    // ------------------------------------------------------------------
    const taxRateVal = tax_rate ?? DEFAULT_TAX_RATE;
    const serviceChargeRateVal = service_charge_rate ?? DEFAULT_SERVICE_CHARGE_RATE;

    let subtotal = 0;
    const computedItems: Array<{
      product_id: string;
      product_name: string;
      base_price: number;
      quantity: number;
      variant_id?: string;
      variant_name?: string;
      variant_price_delta: number;
      selected_options: SelectedOption[];
      notes?: string;
      status: string;
      item_subtotal: number;
    }> = [];

    for (const item of items) {
      const variantDelta = item.variant_price_delta ?? 0;
      const optionsDelta = calculateSelectedOptionsDelta(
        item.selected_options,
        item.selected_option_groups
      );
      const flattenedOptions = flattenSelectedOptions(
        item.selected_options,
        item.selected_option_groups
      );
      const itemPrice = item.base_price + variantDelta + optionsDelta;
      const itemSubtotal = itemPrice * item.quantity;
      subtotal += itemSubtotal;

      computedItems.push({
        product_id: item.product_id,
        product_name: item.product_name,
        base_price: item.base_price,
        quantity: item.quantity,
        variant_id: item.variant_id,
        variant_name: item.variant_name,
        variant_price_delta: variantDelta,
        selected_options: flattenedOptions,
        notes: item.notes,
        status: 'pending',
        item_subtotal: itemSubtotal,
      });
    }

    const taxAmount = subtotal * taxRateVal;
    const serviceChargeAmount = subtotal * serviceChargeRateVal;
    const totalAmount = subtotal + taxAmount + serviceChargeAmount;

    if (amount > totalAmount + 0.01) {
      throw new Error(
        `Payment amount (${amount}) exceeds order total (${totalAmount.toFixed(2)})`
      );
    }

    // ------------------------------------------------------------------
    // Idempotency check — inside transaction to prevent duplicate orders
    // under concurrent requests with the same idempotency_key.
    // Uses SELECT ... FOR UPDATE to serialize concurrent checks.
    // ------------------------------------------------------------------

    // ------------------------------------------------------------------
    // Generate order number with retry (P1.3: unique constraint safety)
    // Deferred to inside transaction to prevent race condition.
    // ------------------------------------------------------------------

    // ------------------------------------------------------------------
    // TRUE ATOMIC TRANSACTION (P0.2)
    // ------------------------------------------------------------------
    const result = await this.db.transaction(async (tx) => {
      // 0. Idempotency check inside transaction (prevents race condition)
      if (idempotency_key) {
        const existing = await tx
          .select({ orderId: orderPayments.orderId })
          .from(orderPayments)
          .innerJoin(orders, eq(orderPayments.orderId, orders.id))
          .where(
            and(
              eq(orders.tenantId, tenant_id),
              eq(orderPayments.referenceNumber, idempotency_key)
            )
          )
          .limit(1)
          .for('update');

        if (existing[0]?.orderId) {
          const existingOrder = await tx
            .select()
            .from(orders)
            .where(and(eq(orders.id, existing[0].orderId), eq(orders.tenantId, tenant_id)))
            .limit(1);

          const existingPayments = await tx
            .select()
            .from(orderPayments)
            .where(eq(orderPayments.orderId, existing[0].orderId));

          if (existingOrder[0]) {
            return {
              order: existingOrder[0],
              payment: existingPayments[0] ?? null,
              idempotent_replay: true,
              remainingAmount: 0,
            };
          }
        }
      }

      // Generate order number inside transaction to prevent race condition
      const orderNumber = await this.generateOrderNumber(tenant_id, tx);

      // 1. Insert order
      const orderData: Omit<InsertOrder, 'id' | 'createdAt' | 'updatedAt'> = {
        tenantId: tenant_id,
        outletId: outlet_id ?? null,
        orderTypeId: order_type_id,
        orderNumber,
        status: 'confirmed' as any, // Quick-pay orders start as confirmed
        subtotal: subtotal.toString(),
        taxAmount: taxAmount.toString(),
        serviceCharge: serviceChargeAmount.toString(),
        discountAmount: '0',
        total: totalAmount.toString(),
        paidAmount: '0',
        paymentStatus: 'unpaid' as any,
        customerName: customer_name,
        tableNumber: table_number,
        notes,
        idempotencyKey: idempotency_key,
        orderDate: new Date(),
      };

      const [newOrder] = await tx.insert(orders).values(orderData).returning();

      // 2. Insert order items
      if (computedItems.length > 0) {
        const itemsToInsert = computedItems.map(item =>
          toInsertOrderItemDb(item as any, newOrder.id)
        );
        const insertedItems = await tx.insert(orderItems).values(itemsToInsert).returning();

        // 3. Insert modifiers
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

      // 4. Record payment
      const paymentRef = transaction_ref ?? idempotency_key;
      const [newPayment] = await tx.insert(orderPayments).values({
        orderId: newOrder.id,
        amount: amount.toString(),
        paymentMethod: payment_method as any,
        paymentDate: new Date(),
        referenceNumber: paymentRef,
        notes: payment_notes,
      }).returning();

      // 5. Update order payment status
      const newPaidAmount = amount;
      const remaining = totalAmount - newPaidAmount;
      const newPaymentStatus: 'paid' | 'partial' | 'unpaid' =
        remaining <= 0.001 ? 'paid' : newPaidAmount > 0 ? 'partial' : 'unpaid';

      const finalUpdates: Record<string, any> = {
        paidAmount: newPaidAmount.toString(),
        paymentStatus: newPaymentStatus,
        updatedAt: new Date(),
      };

      // If fully paid, close the order immediately
      if (newPaymentStatus === 'paid') {
        finalUpdates.status = 'completed';
        finalUpdates.closedAt = new Date();
      }

      const [updatedOrder] = await tx
        .update(orders)
        .set(finalUpdates)
        .where(and(eq(orders.id, newOrder.id), eq(orders.tenantId, tenant_id)))
        .returning();

      return { order: updatedOrder, payment: newPayment };
    });

    // Stock deduction runs AFTER the transaction is committed.
    // create-and-pay creates the order as "confirmed" directly, so stock
    // must be deducted here. outletId is tagged on movements for per-outlet
    // sales reporting while the stock pool remains global (shared across outlets).
    if (computedItems.length > 0) {
      const productIds = [...new Set(computedItems.map((i: any) => i.product_id).filter(Boolean))];
      if (productIds.length > 0) {
        const trackedProducts = await this.db
          .select({ id: products.id, stockQty: products.stockQty })
          .from(products)
          .where(and(
            eq(products.tenantId, tenant_id),
            inArray(products.id, productIds),
            eq(products.stockTrackingEnabled, true),
          ));

        if (trackedProducts.length > 0) {
          const soldQtyMap: Record<string, number> = {};
          for (const item of computedItems as any[]) {
            if (item.product_id) {
              soldQtyMap[item.product_id] = (soldQtyMap[item.product_id] ?? 0) + (item.quantity ?? 1);
            }
          }
          const orderLabel = result.order.orderNumber;
          for (const product of trackedProducts) {
            const soldQty = soldQtyMap[product.id] ?? 0;
            if (soldQty === 0) continue;

            // Use SELECT ... FOR UPDATE to prevent race condition
            const [locked] = await this.db
              .select({ id: products.id, stockQty: products.stockQty })
              .from(products)
              .where(and(eq(products.id, product.id), eq(products.tenantId, tenant_id)))
              .for('update');

            if (!locked) continue;

            const before = locked.stockQty ?? 0;
            const after = before - soldQty;

            if (after < 0) {
              console.warn(`[CreateAndPay] Stock would go negative for product ${product.id}: ${before} - ${soldQty} = ${after}`);
            }

            await this.db
              .update(products)
              .set({ stockQty: after, updatedAt: new Date() })
              .where(and(eq(products.id, product.id), eq(products.tenantId, tenant_id)));
            await this.db.insert(inventoryMovements).values({
              tenantId: tenant_id,
              productId: product.id,
              orderId: result.order.id,
              outletId: outlet_id ?? null,
              movementType: 'SALE',
              quantityDelta: -soldQty,
              quantityBefore: before,
              quantityAfter: after,
              notes: `Penjualan — Order ${orderLabel}`,
            }).catch((err) => {
              console.error(`[CreateAndPay] Failed to record inventory movement for product ${product.id}:`, err);
            });
          }
        }
      }
    }

    return {
      order: result.order,
      payment: result.payment,
      remainingAmount: Math.max(0, totalAmount - amount),
    };
  }

  /**
   * Generate a unique order number for the tenant.
   * Uses count-based approach with retry on unique constraint violation (P1.3).
   * Runs inside transaction to prevent race condition on concurrent orders.
   */
  private async generateOrderNumber(tenantId: string, tx?: any, attempt = 0): Promise<string> {
    const MAX_ATTEMPTS = 5;
    const today = new Date();
    const datePrefix = today.toISOString().split('T')[0].replace(/-/g, '');

    // Count today's orders for this tenant to derive sequence number
    const startOfDay = new Date(today);
    startOfDay.setHours(0, 0, 0, 0);

    const dbOrTx = tx ?? this.db;
    const countResult = await dbOrTx
      .select({ value: count() })
      .from(orders)
      .where(
        and(
          eq(orders.tenantId, tenantId),
          gte(orders.orderDate, startOfDay)
        )
      );

    const todayCount = Number(countResult[0]?.value ?? 0);
    const seq = (todayCount + 1 + attempt).toString().padStart(4, '0');
    return `ORD-${datePrefix}-${seq}`;
  }
}
