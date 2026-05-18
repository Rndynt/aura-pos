/**
 * Orders Controller
 * Handles order management and payment endpoints
 */

import { Request, Response } from 'express';
import { z } from 'zod';
import { container } from '../../container';
import { asyncHandler, createError } from '../middleware/errorHandler';
import { and, eq } from 'drizzle-orm';
import { orderPayments, orders } from '@shared/schema';

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
    ...parsed.data,
  });

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
 * Record payment (supports partial payments)
 */
export const recordPayment = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = req.tenantId!;
  const { id } = req.params;

  if (!id) {
    throw createError('Order ID is required', 400, 'MISSING_PARAMETER');
  }

  // Validate request body
  const bodySchema = z.object({
    amount: z.number().positive(),
    payment_method: z.enum(['cash', 'card', 'ewallet', 'other']),
    transaction_ref: z.string().optional(),
    notes: z.string().optional(),
  });

  const parsed = bodySchema.safeParse(req.body);
  if (!parsed.success) {
    throw createError('Invalid request body: ' + parsed.error.message, 400, 'VALIDATION_ERROR');
  }

  // Execute use case
  const result = await container.recordPayment.execute({
    order_id: id,
    tenant_id: tenantId,
    ...parsed.data,
  });

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
 * Create kitchen ticket
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

  // Execute use case
  const result = await container.createKitchenTicket.execute({
    order_id: id,
    tenant_id: tenantId,
    priority: parsed.data.priority,
  });

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

  const orderStatusSchema = z.enum(['draft', 'confirmed', 'preparing', 'ready', 'completed', 'cancelled']);

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
  const [orders, total] = await Promise.all([
    container.orderRepository.findByTenant(tenantId, {
      ...filterOptions,
      limit: limit!,
      offset,
    }),
    container.orderRepository.countByTenant(tenantId, filterOptions),
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

  res.status(200).json({
    success: true,
    data: {
      order: result.order,
    },
  });
});

/**
 * PATCH /api/orders/:id/status
 * Update only the status of an order (e.g. for kitchen display: confirmed → preparing → ready → completed)
 */
export const updateOrderStatus = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = req.tenantId!;
  const { id } = req.params;

  if (!id) {
    throw createError('Order ID is required', 400, 'MISSING_PARAMETER');
  }

  const ALLOWED_STATUSES = ['confirmed', 'preparing', 'ready', 'completed', 'cancelled'] as const;

  const bodySchema = z.object({
    status: z.enum(ALLOWED_STATUSES),
  });

  const parsed = bodySchema.safeParse(req.body);
  if (!parsed.success) {
    throw createError('Invalid request body: ' + parsed.error.message, 400, 'VALIDATION_ERROR');
  }

  const { status } = parsed.data;

  const result = await container.transitionOrderStatus.execute({
    order_id: id,
    tenant_id: tenantId,
    status,
  });

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

  // Execute use case
  const result = await container.cancelOrder.execute({
    order_id: id,
    tenant_id: tenantId,
    cancellation_reason: parsed.data.cancellation_reason,
  });

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
 * Create order and record payment atomically (P3 - Transaction Safety)
 * Prevents orphaned orders if payment fails
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

  // Idempotency support: if key already used for this tenant, return prior result
  const idempotencyKey = parsed.data.idempotency_key?.trim();

  if (idempotencyKey) {
    const existing = await container.db
      .select({ orderId: orderPayments.orderId })
      .from(orderPayments)
      .innerJoin(orders, eq(orderPayments.orderId, orders.id))
      .where(
        and(
          eq(orders.tenantId, tenantId),
          eq(orderPayments.referenceNumber, idempotencyKey)
        )
      )
      .limit(1);

    if (existing[0]?.orderId) {
      const existingOrder = await container.orderRepository.findById(existing[0].orderId, tenantId);
      if (existingOrder) {
        return res.status(200).json({
          success: true,
          data: {
            order: existingOrder,
            pricing: null,
            payment: null,
            idempotent_replay: true,
          },
        });
      }
    }
  }

  // Execute create + pay flow with compensating rollback to avoid orphan orders
  let createdOrderId: string | null = null;

  try {
    const orderResult = await container.createOrder.execute({
      tenant_id: tenantId,
      items: parsed.data.items,
      order_type_id: parsed.data.order_type_id,
      customer_name: parsed.data.customer_name,
      table_number: parsed.data.table_number,
      tax_rate: parsed.data.tax_rate,
      service_charge_rate: parsed.data.service_charge_rate,
      idempotency_key: idempotencyKey,
    });

    createdOrderId = orderResult.order.id;

    const paymentResult = await container.recordPayment.execute({
      order_id: orderResult.order.id,
      tenant_id: tenantId,
      amount: parsed.data.amount,
      payment_method: parsed.data.payment_method,
      transaction_ref: parsed.data.transaction_ref ?? idempotencyKey,
      notes: parsed.data.payment_notes,
    });

    res.status(201).json({
      success: true,
      data: {
        order: paymentResult.order,
        pricing: orderResult.pricing,
        payment: paymentResult.payment,
      },
    });
  } catch (error) {
    if (createdOrderId) {
      try {
        await container.db
          .delete(orders)
          .where(and(eq(orders.id, createdOrderId), eq(orders.tenantId, tenantId)));
      } catch (cleanupError) {
        console.error('Create-and-pay rollback cleanup failed:', cleanupError);
      }
    }

    throw error;
  }
});
