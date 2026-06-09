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
 *  - Idempotency check happens inside the transaction to serialize concurrent retries.
 */

import type { Database } from '../../database';
import { DrizzleUnitOfWork } from '../../unit-of-work';
import {
  orders,
  orderItems,
  orderItemModifiers,
  orderPayments,
  products,
  type InsertOrder,
} from '@pos/infrastructure/db/schema';
import { eq, and, inArray } from 'drizzle-orm';
import { toInsertOrderItemDb, toInsertOrderItemModifierDb } from '@pos/application/orders/mappers';
import { DEFAULT_TAX_RATE, DEFAULT_SERVICE_CHARGE_RATE } from '@pos/core/pricing';
import { calculateSelectedOptionsDelta, flattenSelectedOptions } from '@pos/application/catalog';
import type { SelectedOption, SelectedOptionGroup } from '@pos/domain/orders/types';
import { DrizzleInventoryPolicyRepository, DrizzleInventorySyncErrorRepository, DrizzleStockMovementRepository } from '../inventory';
import { nextOrderNumberForTenant } from './orderNumberSequence';

// ---------------------------------------------------------------------------
// Input / Output types
// ---------------------------------------------------------------------------

import type { CreateAndPayOrderInput, CreateAndPayOrderItemInput, CreateAndPayOrderOutput } from '@pos/application/orders/CreateAndPayOrder';

interface LegacyCreateAndPayOrderItemInput {
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

// ---------------------------------------------------------------------------
// Use case
// ---------------------------------------------------------------------------

export class DrizzleCreateAndPayOrderRepository {
  private readonly inventoryPolicyRepository: DrizzleInventoryPolicyRepository;
  private readonly inventorySyncErrorRepository: DrizzleInventorySyncErrorRepository;
  private readonly stockMovementRepository: DrizzleStockMovementRepository;
  private readonly unitOfWork: DrizzleUnitOfWork;

  constructor(private readonly db: Database, unitOfWork?: DrizzleUnitOfWork) {
    this.inventoryPolicyRepository = new DrizzleInventoryPolicyRepository(db);
    this.inventorySyncErrorRepository = new DrizzleInventorySyncErrorRepository(db);
    this.stockMovementRepository = new DrizzleStockMovementRepository(db);
    this.unitOfWork = unitOfWork ?? new DrizzleUnitOfWork(db);
  }

  async createAndPay(input: CreateAndPayOrderInput): Promise<CreateAndPayOrderOutput> {
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
      inventory_terminal_id,
      fulfillment_mode = 'standard',
    } = input;

    if (!['standard', 'instant'].includes(fulfillment_mode)) {
      throw new Error(`Invalid fulfillment_mode '${fulfillment_mode}'. Expected 'standard' or 'instant'.`);
    }

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
    // Allocate tenant-local business-date order number from order_number_sequences.
    // Deferred to inside transaction so sequence allocation, order, payment,
    // and strict inventory writes commit or roll back together.
    // ------------------------------------------------------------------

    const inventoryPolicy = await this.inventoryPolicyRepository.resolveInventoryPolicy(tenant_id);

    // ------------------------------------------------------------------
    // TRUE ATOMIC TRANSACTION (P0.2)
    // ------------------------------------------------------------------
    const result = await this.unitOfWork.transaction(async (context) => {
      const tx = DrizzleUnitOfWork.fromContext(context)!;
      // 0. Idempotency check inside transaction (prevents race condition)
      if (idempotency_key) {
        const existing = await tx
          .select({ orderId: orderPayments.orderId })
          .from(orderPayments)
          .innerJoin(orders, eq(orderPayments.orderId, orders.id))
          .where(
            and(
              eq(orders.tenantId, tenant_id),
              eq(orderPayments.idempotencyKey, idempotency_key)
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

      // Allocate order number inside transaction to prevent concurrent duplicates
      const orderNumber = await nextOrderNumberForTenant(tx, tenant_id);

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
      const [newPayment] = await tx.insert(orderPayments).values({
        orderId: newOrder.id,
        amount: amount.toString(),
        paymentMethod: payment_method as any,
        paymentDate: new Date(),
        referenceNumber: transaction_ref,
        notes: payment_notes,
        idempotencyKey: idempotency_key,
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

      // Payment and fulfillment are separate lifecycle dimensions. Full payment
      // must not implicitly complete the operational order; paid orders remain
      // visible in queues as at least `confirmed` until kitchen/cashier fulfillment
      // completion. Only an explicit, validated instant-fulfillment request may
      // close a non-kitchen quick-sale order immediately.
      if (newPaymentStatus === 'paid' && fulfillment_mode === 'instant') {
        finalUpdates.status = 'completed';
        finalUpdates.closedAt = new Date();
      }

      const [updatedOrder] = await tx
        .update(orders)
        .set(finalUpdates)
        .where(and(eq(orders.id, newOrder.id), eq(orders.tenantId, tenant_id)))
        .returning();

      // 6. Strict inventory tenants must commit stock update + movement ledger
      // inside the same transaction as order creation and payment. Allow-negative
      // tenants perform the movement after the financial transaction; failures are
      // durable retry/audit records and do not orphan the order/payment.
      if (inventoryPolicy.policy === 'strict') {
        await this.stockMovementRepository.deductStockForItems(
          tenant_id,
          computedItems.map((item) => ({
            productId: item.product_id,
            quantity: item.quantity,
          })),
          {
            orderId: updatedOrder.id,
            orderNumber: updatedOrder.orderNumber,
            outletId: outlet_id ?? null,
            terminalId: inventory_terminal_id ?? null,
            paymentId: newPayment.id,
            referenceType: 'sale_payment',
            referenceId: transaction_ref ?? newPayment.id,
            metadata: {
              paymentMethod: payment_method,
              idempotencyKey: idempotency_key ?? null,
              transactionRef: transaction_ref ?? null,
            },
          },
          { transaction: context, allowNegativeStock: false },
        );
      }

      return { order: updatedOrder, payment: newPayment };
    });

    let inventorySyncError: any = null;

    if (inventoryPolicy.policy === 'allow_negative' && !result.idempotent_replay) {
      const movementItems = computedItems.map((item) => ({
        productId: item.product_id,
        quantity: item.quantity,
      }));
      const movementContext = {
        orderId: result.order.id,
        orderNumber: result.order.orderNumber,
        outletId: outlet_id ?? null,
        terminalId: inventory_terminal_id ?? null,
        paymentId: result.payment?.id ?? null,
        referenceType: 'sale_payment',
        referenceId: transaction_ref ?? result.payment?.id ?? result.order.id,
        metadata: {
          paymentMethod: payment_method,
          idempotencyKey: idempotency_key ?? null,
          transactionRef: transaction_ref ?? null,
        },
      };

      try {
        await this.stockMovementRepository.deductStockForItems(tenant_id, movementItems, movementContext, { allowNegativeStock: true });
      } catch (error) {
        inventorySyncError = await this.inventorySyncErrorRepository.recordInventorySyncError({
          tenantId: tenant_id,
          outletId: outlet_id ?? null,
          orderId: result.order.id,
          productId: movementItems.length === 1 ? movementItems[0]?.productId ?? null : null,
          operation: 'deduct_sale',
          payload: {
            operation: 'deduct_sale',
            items: movementItems,
            context: movementContext,
            policy: 'allow_negative',
          },
          error,
        });
      }
    }

    return {
      order: result.order,
      payment: result.payment,
      idempotent_replay: result.idempotent_replay,
      remainingAmount: Math.max(0, totalAmount - amount),
      inventory_sync_error: inventorySyncError,
    };
  }

}
