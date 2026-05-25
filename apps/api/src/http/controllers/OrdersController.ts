/**
 * Orders Controller
 * Handles order management and payment endpoints
 */

import { Request, Response } from 'express';
import { z } from 'zod';
import { container } from '../../container';
import { asyncHandler, createError } from '../middleware/errorHandler';
import { emitOrderQueueChanged, subscribeOrderQueue } from '../services/orderQueueEvents';
import { deductStockForItems, reverseStockForItems, STOCK_DEDUCTED_STATES } from '../helpers/stockDeduction';

/**
 * GET /api/orders/queue/stream
 * SSE stream for near real-time order queue updates per tenant.
 */
export const streamOrderQueue = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = req.tenantId!;
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();

  const unsubscribe = subscribeOrderQueue(tenantId, res);
  const heartbeat = setInterval(() => {
    res.write(`event: ping\ndata: ${Date.now()}\n\n`);
  }, 15000);

  req.on('close', () => {
    clearInterval(heartbeat);
    unsubscribe();
  });
});

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
  });

  const parsed = bodySchema.safeParse(req.body);
  if (!parsed.success) {
    throw createError('Invalid request body: ' + parsed.error.message, 400, 'VALIDATION_ERROR');
  }

  // Execute use case
  const result = await container.createOrder.execute({
    tenant_id: tenantId,
    outlet_id: req.outletId,
    ...parsed.data,
  });

  emitOrderQueueChanged(tenantId, { source: 'create_order', orderId: result.order.id });

  res.status(201).json({
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
 * Idempotency: if transaction_ref already exists for this order+tenant, replays prior result.
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
  });

  const parsed = bodySchema.safeParse(req.body);
  if (!parsed.success) {
    throw createError('Invalid request body: ' + parsed.error.message, 400, 'VALIDATION_ERROR');
  }

  const idempotencyKey = parsed.data.idempotency_key?.trim();
  const transactionRef = parsed.data.transaction_ref ?? idempotencyKey;

  // Execute use case (P1.2: transaction-safe with row lock inside use case)
  const result = await container.recordPayment.execute({
    order_id: id,
    tenant_id: tenantId,
    amount: parsed.data.amount,
    payment_method: parsed.data.payment_method,
    notes: parsed.data.notes,
    transaction_ref: transactionRef,
  });

  emitOrderQueueChanged(tenantId, { source: 'record_payment', orderId: result.order.id });

  res.status(201).json({
    success: true,
    data: {
      payment: result.payment,
      order: result.order,
      remainingAmount: result.remainingAmount,
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

  // Auto-confirm draft orders before creating a kitchen ticket.
  // Silently skip if the order is already confirmed / in a later state.
  try {
    const confirmResult = await container.confirmOrder.execute({ order_id: id, tenant_id: tenantId });
    if (confirmResult.order.items?.length) {
      await deductStockForItems(
        tenantId,
        confirmResult.order.items.map((item: any) => ({
          productId: item.productId ?? item.product_id,
          quantity: item.quantity ?? 1,
        })),
        {
          orderId: id,
          orderNumber: confirmResult.order.order_number,
          outletId: req.outletId ?? null,
        },
      ).catch(() => {});
    }
    emitOrderQueueChanged(tenantId, { source: 'confirm_order', orderId: id });
  } catch {
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
    limit: z.string().optional().transform(val => val ? parseInt(val, 10) : 20),
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
      orders,
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
    data: order,
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

  // Execute use case - update existing order
  const result = await container.updateOrder.execute({
    order_id: id,
    tenant_id: tenantId,
    ...parsed.data,
  });

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

  // Execute use case
  const result = await container.confirmOrder.execute({
    order_id: id,
    tenant_id: tenantId,
  });

  // Deduct stock for tracked products — stock decreases on CONFIRMATION, not on payment
  if (result.order.items?.length) {
    await deductStockForItems(
      tenantId,
      result.order.items.map((item: any) => ({
        productId: item.productId ?? item.product_id,
        quantity: item.quantity ?? 1,
      })),
      {
        orderId: result.order.id,
        orderNumber: result.order.order_number,
        outletId: req.outletId ?? null,
      },
    ).catch(() => {}); // Non-fatal — stock deduction must not block order flow
  }

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

  // Fetch order BEFORE cancellation to know its current status and items
  const orderBeforeCancel = await container.orderRepository.findById(id, tenantId);

  // Execute use case
  const result = await container.cancelOrder.execute({
    order_id: id,
    tenant_id: tenantId,
    cancellation_reason: parsed.data.cancellation_reason,
  });

  // Reverse stock if order was in a state where stock had already been deducted
  if (
    orderBeforeCancel &&
    STOCK_DEDUCTED_STATES.has(orderBeforeCancel.status) &&
    orderBeforeCancel.items?.length
  ) {
    await reverseStockForItems(
      tenantId,
      orderBeforeCancel.items.map((item: any) => ({
        productId: item.productId ?? item.product_id,
        quantity: item.quantity ?? 1,
      })),
      {
        orderId: id,
        orderNumber: orderBeforeCancel.order_number,
        outletId: req.outletId ?? null,
      },
    ).catch(() => {}); // Non-fatal — stock reversal must not block cancel flow
  }

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
      orders: result.orders,
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
  });

  res.status(200).json({
    success: true,
    data: {
      orders: result.orders,
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
  });

  const parsed = bodySchema.safeParse(req.body);
  if (!parsed.success) {
    throw createError('Invalid request body: ' + parsed.error.message, 400, 'VALIDATION_ERROR');
  }

  // Execute via dedicated use case (single DB transaction – P0.2)
  const result = await container.createAndPayOrder.execute({
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
    idempotency_key: parsed.data.idempotency_key,
  });

  emitOrderQueueChanged(tenantId, { source: 'create_and_pay', orderId: result.order.id });

  const status = result.idempotent_replay ? 200 : 201;
  res.status(status).json({
    success: true,
    data: {
      order: result.order,
      payment: result.payment,
      remainingAmount: result.remainingAmount,
      idempotent_replay: result.idempotent_replay ?? false,
    },
  });
});
