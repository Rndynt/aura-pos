/**
 * Orders Controller
 * Handles order management and payment endpoints
 */

import { Request, Response } from 'express';
import { z } from 'zod';
import { container } from '../../container';
import { asyncHandler, createError } from '../middleware/errorHandler';
import { emitOrderQueueChanged, subscribeOrderQueue } from '../services/orderQueueEvents';
import { getEffectiveEntitlementMap, loadTenantEntitlementContext } from '../../services/tenantEntitlements';
import { DEFAULT_SERVICE_CHARGE_RATE, DEFAULT_TAX_RATE } from '@pos/core/pricing';
import { withOrderLifecycleDtoFields } from '@pos/application/orders/mappers/orderLifecycleDtoMapper';
import { assertCanPerformOrderAction, resolveBusinessProfileFromBusinessType, type OrderActionPolicyError } from '@pos/application/business-flows';

type OrderActionPolicyBase = { businessProfile: ReturnType<typeof resolveBusinessProfileFromBusinessType> | 'core_standard'; entitlements: string[] };

let orderActionPolicyBaseOverride: ((tenantId: string, options?: { requireEntitlements?: boolean }) => Promise<OrderActionPolicyBase> | OrderActionPolicyBase) | null = null;

export function __setOrderActionPolicyBaseOverrideForTests(
  override: ((tenantId: string, options?: { requireEntitlements?: boolean }) => Promise<OrderActionPolicyBase> | OrderActionPolicyBase) | null,
): void {
  orderActionPolicyBaseOverride = override;
}

function resolveOrderActionPermissions(req: Request): string[] {
  const role = req.posRole ?? req.authTenantUser?.role;
  if (role === 'owner' || role === 'manager' || role === 'platform-admin') {
    return ['orders:cancel_active'];
  }
  return [];
}

async function getOrderActionPolicyBase(tenantId: string, options: { requireEntitlements?: boolean } = {}) {
  if (orderActionPolicyBaseOverride) {
    return orderActionPolicyBaseOverride(tenantId, options);
  }
  if (!options.requireEntitlements) {
    return { businessProfile: 'core_standard' as const, entitlements: [] };
  }
  const context = await loadTenantEntitlementContext(tenantId);
  const entitlementMap = await getEffectiveEntitlementMap(tenantId);
  const businessType = context?.businessType ?? null;
  return {
    businessProfile: resolveBusinessProfileFromBusinessType({ businessType, businessTypeCode: businessType }),
    entitlements: Object.entries(entitlementMap)
      .filter(([, enabled]) => enabled)
      .map(([code]) => code),
  };
}

function throwPolicyHttpError(error: OrderActionPolicyError): never {
  throw createError(error.message, error.statusCode ?? 409, error.code);
}

function getIdempotencyKey(req: Request, bodyValue?: string): string | undefined {
  const bodyKey = bodyValue?.trim();
  const headerKey = req.get('x-idempotency-key')?.trim();
  return bodyKey || headerKey || undefined;
}


async function assertOrderBelongsToOutlet(orderId: string, tenantId: string, outletId?: string | null): Promise<any> {
  const order = await container.orderRepository.findById(orderId, tenantId);
  if (!order) {
    throw createError('Order not found', 404, 'ORDER_NOT_FOUND');
  }
  if (outletId && order.outletId !== outletId) {
    throw createError('Order not found for this outlet', 404, 'ORDER_NOT_FOUND');
  }
  return order;
}

async function requirePaymentEntitlement(tenantId: string, entitlementCode: string): Promise<void> {
  if (orderActionPolicyBaseOverride) {
    const policyBase = await orderActionPolicyBaseOverride(tenantId, { requireEntitlements: true });
    if (policyBase.entitlements.includes(entitlementCode)) return;
  }
  const entitlements = await getEffectiveEntitlementMap(tenantId);
  if (entitlements[entitlementCode] === true) return;

  throw createError(
    `Fitur pembayaran ini memerlukan entitlement '${entitlementCode}'.`,
    403,
    'ENTITLEMENT_REQUIRED',
  );
}


async function attachLifecycleFields(orders: any[], tenantId: string): Promise<any[]> {
  if (orders.length === 0) return orders;
  const lockStates = await container.orderRepository.getEditLockStates?.(orders.map((order) => order.id), tenantId);
  return orders.map((order) => withOrderLifecycleDtoFields(order, lockStates?.[order.id]));
}

async function attachLifecycleField(order: any, tenantId: string): Promise<any> {
  const lockState = await container.orderRepository.getEditLockState?.(order.id, tenantId);
  return withOrderLifecycleDtoFields(order, lockState);
}

function estimateCreateAndPayTotal(input: {
  items: Array<{ base_price: number; quantity: number; variant_price_delta?: number; selected_options?: Array<{ price_delta: number }> }>;
  tax_rate?: number;
  service_charge_rate?: number;
}): number {
  const subtotal = input.items.reduce((total, item) => {
    const optionsDelta = item.selected_options?.reduce((sum, option) => sum + option.price_delta, 0) ?? 0;
    const unitPrice = item.base_price + (item.variant_price_delta ?? 0) + optionsDelta;
    return total + unitPrice * item.quantity;
  }, 0);
  return subtotal + subtotal * (input.tax_rate ?? DEFAULT_TAX_RATE) + subtotal * (input.service_charge_rate ?? DEFAULT_SERVICE_CHARGE_RATE);
}

/**
 * GET /api/orders/queue/stream
 * SSE stream for near real-time order queue updates per tenant.
 *
 * NOTE: This handler does NOT use asyncHandler because headers are flushed immediately.
 * Once flushHeaders() is called, Express's global error handler can no longer send an
 * HTTP 500 response — doing so causes "Cannot set headers after they are sent".
 * All errors are caught here and written as SSE error events instead.
 */
export const streamOrderQueue = (req: Request, res: Response) => {
  const tenantId = req.tenantId!;
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();

  let unsubscribe: (() => void) | undefined;
  const heartbeat = setInterval(() => {
    if (!res.writableEnded) {
      res.write(`event: ping\ndata: ${Date.now()}\n\n`);
    }
  }, 15000);

  const cleanup = () => {
    clearInterval(heartbeat);
    unsubscribe?.();
  };

  req.on('close', cleanup);

  try {
    unsubscribe = subscribeOrderQueue(tenantId, res);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // Write the error as an SSE event so the client can handle it gracefully,
    // then end the stream. Do NOT call res.status() — headers are already sent.
    if (!res.writableEnded) {
      res.write(`event: error\ndata: ${JSON.stringify({ message: msg })}\n\n`);
      res.end();
    }
    cleanup();
  }
};

/**
 * POST /api/orders
 * Create new order
 */
export const createOrder = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = req.tenantId!;

  // Validate request body
  const selectedOptionSchema = z.object({
    group_id: z.string(),
    group_name: z.string(),
    option_id: z.string(),
    option_name: z.string(),
    price_delta: z.number(),
  });

  const orderItemSchema = z.object({
    product_id: z.string(),
    product_name: z.string(),
    base_price: z.number(),
    quantity: z.number().int().positive(),
    variant_id: z.string().optional(),
    variant_name: z.string().optional(),
    variant_price_delta: z.number().optional(),
    selected_options: z.array(selectedOptionSchema).optional(),
    notes: z.string().optional(),
  });

  const bodySchema = z.object({
    items: z.array(orderItemSchema).min(1),
    order_type_id: z.string().optional(),
    customer_name: z.string().optional(),
    table_number: z.string().optional(),
    notes: z.string().optional(),
    tax_rate: z.number().optional(),
    service_charge_rate: z.number().optional(),
    idempotency_key: z.string().min(8).max(128).optional(),
  });

  const parsed = bodySchema.safeParse(req.body);
  if (!parsed.success) {
    throw createError('Invalid request body: ' + parsed.error.message, 400, 'VALIDATION_ERROR');
  }

  const idempotencyKey = getIdempotencyKey(req, parsed.data.idempotency_key);

  // Execute use case
  const result = await container.createOrder.execute({
    tenant_id: tenantId,
    outlet_id: req.outletId,
    ...parsed.data,
    idempotency_key: idempotencyKey,
  });

  emitOrderQueueChanged(tenantId, { source: 'create_order', orderId: result.order.id });

  res.status(result.idempotent_replay ? 200 : 201).json({
    success: true,
    data: {
      order: result.order,
      pricing: result.pricing,
    },
  });
});

/**
 * POST /api/orders/:id/payments
 * Record payment (supports partial payments).
 * P1.2: RecordPayment use case now wraps everything in a DB transaction with row lock.
 * Idempotency: if idempotency_key already exists for this order, replays prior result.
 */
export const recordPayment = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = req.tenantId!;
  const { id } = req.params;

  if (!id) {
    throw createError('Order ID is required', 400, 'MISSING_PARAMETER');
  }

  const bodySchema = z.object({
    amount: z.number().positive(),
    payment_method: z.enum(['cash', 'card', 'ewallet', 'other']),
    transaction_ref: z.string().optional(),
    notes: z.string().optional(),
    idempotency_key: z.string().min(8).max(128).optional(),
    payment_flow: z.enum(['full_payment', 'partial_payment_dp']).optional(),
  });

  const parsed = bodySchema.safeParse(req.body);
  if (!parsed.success) {
    throw createError('Invalid request body: ' + parsed.error.message, 400, 'VALIDATION_ERROR');
  }

  const idempotencyKey = parsed.data.idempotency_key?.trim();
  const transactionRef = parsed.data.transaction_ref?.trim();

  const order = await assertOrderBelongsToOutlet(id, tenantId, req.outletId);

  const paymentAction = parsed.data.payment_flow === 'partial_payment_dp' ? 'PARTIAL_PAYMENT' : 'PAY_ACTIVE_ORDER';
  const policyBase = await getOrderActionPolicyBase(tenantId, { requireEntitlements: paymentAction === 'PARTIAL_PAYMENT' });
  try {
    assertCanPerformOrderAction({
      ...policyBase,
      action: paymentAction,
      orderOperationalStatus: order.status,
      paymentStatus: order.paymentStatus ?? order.payment_status,
      fulfillmentStatus: order.status,
    });
  } catch (error) {
    if (error instanceof Error && error.name === 'OrderActionPolicyError') throwPolicyHttpError(error as OrderActionPolicyError);
    throw error;
  }

  if (parsed.data.payment_flow === 'partial_payment_dp') {
    await requirePaymentEntitlement(tenantId, 'payments_partial_payment');
  }

  // Execute use case (P1.2: transaction-safe with row lock inside use case)
  const result = await container.recordPayment.execute({
    order_id: id,
    tenant_id: tenantId,
    amount: parsed.data.amount,
    payment_method: parsed.data.payment_method,
    notes: parsed.data.notes,
    transaction_ref: transactionRef,
    idempotency_key: idempotencyKey,
  });

  emitOrderQueueChanged(tenantId, { source: 'record_payment', orderId: result.order.id });

  const status = result.idempotent_replay ? 200 : 201;
  res.status(status).json({
    success: true,
    data: {
      payment: result.payment,
      order: result.order,
      remainingAmount: result.remainingAmount,
      idempotent_replay: result.idempotent_replay ?? false,
    },
  });
});

/**
 * POST /api/orders/:id/kitchen-ticket
 * Create kitchen ticket.
 * Auto-confirms the order if it is still in `draft` status — a draft order
 * in the Kitchen Display System makes no semantic sense. Stock is deducted
 * on confirmation (same logic as the dedicated /confirm endpoint).
 */
export const createKitchenTicket = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = req.tenantId!;
  const { id } = req.params;

  if (!id) {
    throw createError('Order ID is required', 400, 'MISSING_PARAMETER');
  }

  // Validate request body (optional priority)
  const bodySchema = z.object({
    priority: z.enum(['normal', 'high', 'urgent']).optional(),
  });

  const parsed = bodySchema.safeParse(req.body);
  if (!parsed.success) {
    throw createError('Invalid request body: ' + parsed.error.message, 400, 'VALIDATION_ERROR');
  }

  await assertOrderBelongsToOutlet(id, tenantId, req.outletId);

  // Auto-confirm draft orders before creating a kitchen ticket.
  // Silently skip if the order is already confirmed / in a later state.
  try {
    await container.confirmOrderWorkflow.execute({
      tenantId,
      outletId: req.outletId ?? null,
      orderId: id,
    });
    emitOrderQueueChanged(tenantId, { source: 'confirm_order', orderId: id });
  } catch (error: any) {
    if (error?.code === 'INVENTORY_MOVEMENT_REQUIRED' || error?.code === 'INSUFFICIENT_STOCK') {
      throw error;
    }
    // Non-fatal — order may already be confirmed or in a later state; proceed to create ticket.
  }

  // Execute use case
  const result = await container.createKitchenTicket.execute({
    order_id: id,
    tenant_id: tenantId,
    priority: parsed.data.priority,
  });

  emitOrderQueueChanged(tenantId, { source: 'kitchen_ticket_created', orderId: id });

  res.status(201).json({
    success: true,
    data: {
      ticket: result.ticket,
    },
  });
});

/**
 * GET /api/orders
 * List orders for tenant with filters
 */
export const listOrders = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = req.tenantId!;

  const orderStatusSchema = z.enum(['draft', 'confirmed', 'preparing', 'ready', 'served', 'completed', 'cancelled']);

  // Validate query params
  const querySchema = z.object({
    status: z
      .preprocess((value) => {
        if (typeof value === 'string') {
          return value
            .split(',')
            .map((status) => status.trim())
            .filter(Boolean);
        }
        return value;
      }, z.array(orderStatusSchema).optional())
      .transform((value) => (value && value.length > 0 ? value : undefined)),
    payment_status: z.enum(['paid', 'partial', 'unpaid']).optional(),
    startDate: z.string().datetime().optional().transform(val => val ? new Date(val) : undefined),
    endDate: z.string().datetime().optional().transform(val => val ? new Date(val) : undefined),
    page: z.string().optional().transform(val => val ? parseInt(val, 10) : 1),
    limit: z.string().optional().transform(val => val ? parseInt(val, 10) : 100),
  });

  const parsed = querySchema.safeParse(req.query);
  if (!parsed.success) {
    throw createError('Invalid query parameters: ' + parsed.error.message, 400, 'VALIDATION_ERROR');
  }

  const { status, payment_status, startDate, endDate, page, limit } = parsed.data;

  // Calculate pagination
  const offset = (page! - 1) * limit!;

  const filterOptions = {
    status,
    paymentStatus: payment_status,
    dateFrom: startDate,
    dateTo: endDate,
  };

  // Query orders using repository
  const outletFilter = req.outletId ? { outletId: req.outletId } : {};
  const [orders, total] = await Promise.all([
    container.orderRepository.findByTenant(tenantId, {
      ...filterOptions,
      ...outletFilter,
      limit: limit!,
      offset,
    }),
    container.orderRepository.countByTenant(tenantId, { ...filterOptions, ...outletFilter }),
  ]);

  res.status(200).json({
    success: true,
    data: {
      orders: await attachLifecycleFields(orders, tenantId),
      pagination: {
        page: page!,
        limit: limit!,
        total,
      },
    },
  });
});

/**
 * GET /api/orders/:id
 * Get single order with all details
 */
export const getOrderById = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = req.tenantId!;
  const { id } = req.params;

  if (!id) {
    throw createError('Order ID is required', 400, 'MISSING_PARAMETER');
  }

  // Query order using repository
  const order = await container.orderRepository.findById(id, tenantId);

  if (!order) {
    throw createError('Order not found', 404, 'ORDER_NOT_FOUND');
  }

  res.status(200).json({
    success: true,
    data: await attachLifecycleField(order, tenantId),
  });
});

/**
 * PATCH /api/orders/:id
 * Update an existing order (items, customer name, table, etc)
 */
export const updateOrder = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = req.tenantId!;
  const { id } = req.params;

  if (!id) {
    throw createError('Order ID is required', 400, 'MISSING_PARAMETER');
  }

  const selectedOptionSchema = z.object({
    group_id: z.string(),
    group_name: z.string(),
    option_id: z.string(),
    option_name: z.string(),
    price_delta: z.number(),
  });

  const orderItemSchema = z.object({
    product_id: z.string(),
    product_name: z.string(),
    base_price: z.number(),
    quantity: z.number().int().positive(),
    variant_id: z.string().optional(),
    variant_name: z.string().optional(),
    variant_price_delta: z.number().optional(),
    selected_options: z.array(selectedOptionSchema).optional(),
    notes: z.string().optional(),
  });

  const bodySchema = z.object({
    items: z.array(orderItemSchema).min(1),
    order_type_id: z.string().optional(),
    customer_name: z.string().optional(),
    table_number: z.string().optional(),
    notes: z.string().optional(),
    tax_rate: z.number().optional(),
    service_charge_rate: z.number().optional(),
  });

  const parsed = bodySchema.safeParse(req.body);
  if (!parsed.success) {
    throw createError('Invalid request body: ' + parsed.error.message, 400, 'VALIDATION_ERROR');
  }

  await assertOrderBelongsToOutlet(id, tenantId, req.outletId);

  // Execute use case - update existing order
  let result;
  try {
    result = await container.updateOrder.execute({
      order_id: id,
      tenant_id: tenantId,
      ...parsed.data,
    });
  } catch (error) {
    const code = error instanceof Error ? (error as any).code : undefined;
    if (code === 'ORDER_NOT_EDITABLE' || code === 'KITCHEN_ORDER_LOCKED' || code === 'FIRED_ITEMS_LOCKED' || code === 'ORDER_ACTION_NOT_ALLOWED') {
      throw createError(
        error instanceof Error ? error.message : 'Pesanan sudah aktif atau sudah dikirim ke dapur dan tidak bisa diedit dari keranjang.',
        409,
        code,
      );
    }
    throw error;
  }

  emitOrderQueueChanged(tenantId, { source: 'update_order', orderId: result.order.id });

  res.status(200).json({
    success: true,
    data: {
      order: result.order,
      pricing: result.pricing,
    },
  });
});

/**
 * POST /api/orders/:id/confirm
 * Confirm a draft order
 */
export const confirmOrder = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = req.tenantId!;
  const { id } = req.params;

  if (!id) {
    throw createError('Order ID is required', 400, 'MISSING_PARAMETER');
  }

  await assertOrderBelongsToOutlet(id, tenantId, req.outletId);

  // Execute use case and strict inventory movement inside one transaction when required.
  const result = await container.confirmOrderWorkflow.execute({
    tenantId,
    outletId: req.outletId ?? null,
    orderId: id,
  });

  emitOrderQueueChanged(tenantId, { source: 'confirm_order', orderId: result.order.id });

  res.status(200).json({
    success: true,
    data: {
      order: result.order,
    },
  });
});

/**
 * POST /api/orders/:id/complete
 * Complete an order
 */
export const completeOrder = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = req.tenantId!;
  const { id } = req.params;

  if (!id) {
    throw createError('Order ID is required', 400, 'MISSING_PARAMETER');
  }

  await assertOrderBelongsToOutlet(id, tenantId, req.outletId);

  // Execute use case
  const result = await container.completeOrder.execute({
    order_id: id,
    tenant_id: tenantId,
  });

  emitOrderQueueChanged(tenantId, { source: 'complete_order', orderId: result.order.id });

  res.status(200).json({
    success: true,
    data: {
      order: result.order,
    },
  });
});

/**
 * PATCH /api/orders/:id/status
 * Update only the status of an order.
 *
 * Modes (P0.3):
 *  - Default (POS/cashier): full transition map via TransitionOrderStatus.
 *    Can set any status including 'completed' (financial close, requires payment paid).
 *  - Kitchen mode (?mode=kitchen): restricted to fulfillment path via
 *    TransitionOrderFulfillmentStatus. Cannot set 'completed'.
 *
 * 'served' is now a valid status (dine-in pay-later: food delivered, bill open).
 */
export const updateOrderStatus = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = req.tenantId!;
  const { id } = req.params;

  if (!id) {
    throw createError('Order ID is required', 400, 'MISSING_PARAMETER');
  }

  const isKitchenMode = req.query.mode === 'kitchen';

  // Kitchen mode: restricted to fulfillment statuses only
  if (isKitchenMode) {
    const KITCHEN_STATUSES = ['confirmed', 'preparing', 'ready', 'served'] as const;
    const bodySchema = z.object({
      status: z.enum(KITCHEN_STATUSES),
    });

    const parsed = bodySchema.safeParse(req.body);
    if (!parsed.success) {
      throw createError(
        'Invalid request body: ' + parsed.error.message + '. Kitchen mode allows: ' + KITCHEN_STATUSES.join(', '),
        400,
        'VALIDATION_ERROR'
      );
    }

    await assertOrderBelongsToOutlet(id, tenantId, req.outletId);

    const result = await container.transitionOrderFulfillmentStatus.execute({
      order_id: id,
      tenant_id: tenantId,
      status: parsed.data.status,
    });

    emitOrderQueueChanged(tenantId, { source: 'update_status_kitchen', orderId: result.order.id });

    return res.status(200).json({
      success: true,
      data: {
        order: result.order,
      },
    });
  }

  // POS/cashier mode: full transition map
  const ALLOWED_STATUSES = ['confirmed', 'preparing', 'ready', 'served', 'completed', 'cancelled'] as const;

  const bodySchema = z.object({
    status: z.enum(ALLOWED_STATUSES),
    override_payment_check: z.boolean().optional(),
  });

  const parsed = bodySchema.safeParse(req.body);
  if (!parsed.success) {
    throw createError('Invalid request body: ' + parsed.error.message, 400, 'VALIDATION_ERROR');
  }

  await assertOrderBelongsToOutlet(id, tenantId, req.outletId);

  const result = await container.transitionOrderStatus.execute({
    order_id: id,
    tenant_id: tenantId,
    status: parsed.data.status,
    override_payment_check: parsed.data.override_payment_check,
  });

  emitOrderQueueChanged(tenantId, { source: 'update_status_pos', orderId: result.order.id });

  res.status(200).json({
    success: true,
    data: {
      order: result.order,
    },
  });
});

/**
 * POST /api/orders/:id/cancel
 * Cancel an order
 */
export const cancelOrder = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = req.tenantId!;
  const { id } = req.params;

  if (!id) {
    throw createError('Order ID is required', 400, 'MISSING_PARAMETER');
  }

  // Validate request body (optional cancellation reason)
  const bodySchema = z.object({
    cancellation_reason: z.string().optional(),
  });

  const parsed = bodySchema.safeParse(req.body);
  if (!parsed.success) {
    throw createError('Invalid request body: ' + parsed.error.message, 400, 'VALIDATION_ERROR');
  }

  const order = await assertOrderBelongsToOutlet(id, tenantId, req.outletId);
  if (order.status !== 'draft' && !parsed.data.cancellation_reason?.trim()) {
    throw createError('Alasan pembatalan wajib diisi untuk membatalkan pesanan aktif.', 400, 'ORDER_CANCEL_REASON_REQUIRED');
  }

  const policyBase = await getOrderActionPolicyBase(tenantId);
  try {
    assertCanPerformOrderAction({
      ...policyBase,
      action: order.status === 'draft' ? 'CANCEL_DRAFT' : 'CANCEL_ACTIVE_ORDER',
      orderOperationalStatus: order.status,
      paymentStatus: order.paymentStatus ?? order.payment_status,
      fulfillmentStatus: order.status,
      actorPermissions: resolveOrderActionPermissions(req),
    });
  } catch (error) {
    if (error instanceof Error && error.name === 'OrderActionPolicyError') throwPolicyHttpError(error as OrderActionPolicyError);
    throw error;
  }

  // Execute cancellation and strict stock reversal inside one transaction when required.
  const result = await container.cancelOrderWorkflow.execute({
    tenantId,
    outletId: req.outletId ?? null,
    orderId: id,
    cancellationReason: parsed.data.cancellation_reason ?? null,
  });

  emitOrderQueueChanged(tenantId, { source: 'cancel_order', orderId: result.order.id });

  res.status(200).json({
    success: true,
    data: {
      order: result.order,
    },
  });
});

/**
 * GET /api/orders/open
 * List open orders (draft, confirmed, preparing, ready)
 */
export const listOpenOrders = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = req.tenantId!;

  // Validate query params with proper number parsing
  const querySchema = z.object({
    limit: z.string().optional().transform((val) => {
      if (!val) return 50;
      const parsed = parseInt(val, 10);
      if (isNaN(parsed) || parsed <= 0) {
        throw new Error('limit must be a positive number');
      }
      return parsed;
    }),
    offset: z.string().optional().transform((val) => {
      if (!val) return 0;
      const parsed = parseInt(val, 10);
      if (isNaN(parsed) || parsed < 0) {
        throw new Error('offset must be a non-negative number');
      }
      return parsed;
    }),
  });

  const parsed = querySchema.safeParse(req.query);
  if (!parsed.success) {
    throw createError('Invalid query parameters: ' + parsed.error.message, 400, 'VALIDATION_ERROR');
  }

  // Execute use case
  const result = await container.listOpenOrders.execute({
    tenant_id: tenantId,
    outlet_id: req.outletId,
    limit: parsed.data.limit,
    offset: parsed.data.offset,
  });

  res.status(200).json({
    success: true,
    data: {
      orders: (await attachLifecycleFields(result.orders, tenantId)).filter((order) => order.lifecycleKind === 'server_draft' || order.lifecycleKind === 'active_order' || order.lifecycleKind === 'active_kitchen_order'),
    },
  });
});

/**
 * GET /api/orders/history
 * List order history (completed, cancelled) with pagination
 */
export const listOrderHistory = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = req.tenantId!;

  // Validate query params with proper number parsing
  const querySchema = z.object({
    limit: z.string().optional().transform((val) => {
      if (!val) return 20;
      const parsed = parseInt(val, 10);
      if (isNaN(parsed) || parsed <= 0) {
        throw new Error('limit must be a positive number');
      }
      return parsed;
    }),
    offset: z.string().optional().transform((val) => {
      if (!val) return 0;
      const parsed = parseInt(val, 10);
      if (isNaN(parsed) || parsed < 0) {
        throw new Error('offset must be a non-negative number');
      }
      return parsed;
    }),
    from_date: z.string().datetime().optional().transform(val => val ? new Date(val) : undefined),
    to_date: z.string().datetime().optional().transform(val => val ? new Date(val) : undefined),
  });

  const parsed = querySchema.safeParse(req.query);
  if (!parsed.success) {
    throw createError('Invalid query parameters: ' + parsed.error.message, 400, 'VALIDATION_ERROR');
  }

  // Execute use case
  const result = await container.listOrderHistory.execute({
    tenant_id: tenantId,
    limit: parsed.data.limit,
    offset: parsed.data.offset,
    from_date: parsed.data.from_date,
    to_date: parsed.data.to_date,
    outlet_id: req.outletId,
  });

  res.status(200).json({
    success: true,
    data: {
      orders: await attachLifecycleFields(result.orders, tenantId),
      pagination: result.pagination,
    },
  });
});

/**
 * POST /api/orders/create-and-pay
 * Create order and record payment atomically (P0.2 – True DB Transaction)
 * Uses CreateAndPayOrder use case which wraps everything in a single transaction.
 * Eliminates compensating-rollback pattern; no orphaned orders possible.
 */
export const createAndPay = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = req.tenantId!;

  // Validate request body
  const selectedOptionSchema = z.object({
    group_id: z.string(),
    group_name: z.string(),
    option_id: z.string(),
    option_name: z.string(),
    price_delta: z.number(),
  });

  const orderItemSchema = z.object({
    product_id: z.string(),
    product_name: z.string(),
    base_price: z.number(),
    quantity: z.number().int().positive(),
    variant_id: z.string().optional(),
    variant_name: z.string().optional(),
    variant_price_delta: z.number().optional(),
    selected_options: z.array(selectedOptionSchema).optional(),
    notes: z.string().optional(),
  });

  const bodySchema = z.object({
    // Order creation fields
    items: z.array(orderItemSchema).min(1),
    order_type_id: z.string().optional(),
    customer_name: z.string().optional(),
    table_number: z.string().optional(),
    tax_rate: z.number().optional(),
    service_charge_rate: z.number().optional(),
    // Payment fields
    amount: z.number().positive(),
    payment_method: z.enum(['cash', 'card', 'ewallet', 'other']),
    transaction_ref: z.string().optional(),
    payment_notes: z.string().optional(),
    idempotency_key: z.string().min(8).max(128).optional(),
    fulfillment_mode: z.enum(['standard', 'instant']).optional(),
    payment_flow: z.enum(['full_payment', 'partial_payment_dp']).optional(),
  });

  const parsed = bodySchema.safeParse(req.body);
  if (!parsed.success) {
    throw createError('Invalid request body: ' + parsed.error.message, 400, 'VALIDATION_ERROR');
  }

  const idempotencyKey = getIdempotencyKey(req, parsed.data.idempotency_key);
  const estimatedTotal = estimateCreateAndPayTotal(parsed.data);
  const isDpPayment = parsed.data.payment_flow === 'partial_payment_dp' || parsed.data.amount < estimatedTotal - 0.01;
  if (isDpPayment) {
    await requirePaymentEntitlement(tenantId, 'payments_partial_payment');
  }

  // Execute via dedicated use case (single DB transaction – P0.2).
  // P5: re-wrap InsufficientStockError into a user-friendly Indonesian message
  // carrying the offending product name so the POS toast surfaces a clear
  // business error instead of a technical exception.
  let result;
  try {
    result = await container.createAndPayOrder.execute({
      tenant_id: tenantId,
      outlet_id: req.outletId ?? null,
      items: parsed.data.items,
      order_type_id: parsed.data.order_type_id,
      customer_name: parsed.data.customer_name,
      table_number: parsed.data.table_number,
      tax_rate: parsed.data.tax_rate,
      service_charge_rate: parsed.data.service_charge_rate,
      amount: parsed.data.amount,
      payment_method: parsed.data.payment_method,
      transaction_ref: parsed.data.transaction_ref,
      payment_notes: parsed.data.payment_notes,
      idempotency_key: idempotencyKey,
      fulfillment_mode: parsed.data.fulfillment_mode,
    });
  } catch (err: any) {
    if (err?.code === 'INSUFFICIENT_STOCK' && err?.productId) {
      const offendingItem = parsed.data.items.find((it) => it.product_id === err.productId);
      const productName = offendingItem?.product_name ?? err.productId;
      const available = Number(err.availableQuantity ?? 0);
      const requested = Number(err.requestedQuantity ?? 0);
      const message = available <= 0
        ? `Stok ${productName} di outlet ini habis.`
        : `Stok ${productName} di outlet ini tidak cukup. Tersedia: ${available}, diminta: ${requested}.`;
      throw createError(message, 409, 'INSUFFICIENT_STOCK');
    }
    throw err;
  }

  emitOrderQueueChanged(tenantId, { source: 'create_and_pay', orderId: result.order.id });

  const status = result.idempotent_replay ? 200 : 201;
  res.status(status).json({
    success: true,
    data: {
      order: result.order,
      payment: result.payment,
      remainingAmount: result.remainingAmount,
      idempotent_replay: result.idempotent_replay ?? false,
      inventory_sync_error: result.inventory_sync_error ?? null,
    },
  });
});
