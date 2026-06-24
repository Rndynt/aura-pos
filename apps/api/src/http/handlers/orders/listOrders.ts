import { Request, Response } from 'express';
import { z } from 'zod';
import { container } from '../../../container';
import { asyncHandler, createError } from '../../middleware/errorHandler';
import { attachLifecycleField, attachLifecycleFields } from './common';

export const listOrders = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = req.tenantId!;
  const querySchema = z.object({
    status: z.preprocess((v) => typeof v === 'string' ? v.split(',').map(s=>s.trim()).filter(Boolean) : v, z.array(z.enum(['draft','confirmed','preparing','ready','served','completed','cancelled'])).optional()).transform(v => v && v.length > 0 ? v : undefined),
    payment_status: z.enum(['paid','partial','unpaid']).optional(), startDate: z.string().datetime().optional().transform(v => v ? new Date(v) : undefined), endDate: z.string().datetime().optional().transform(v => v ? new Date(v) : undefined), page: z.string().optional().transform(v => v ? parseInt(v,10) : 1), limit: z.string().optional().transform(v => v ? parseInt(v,10) : 100),
  });
  const parsed = querySchema.safeParse(req.query); if (!parsed.success) throw createError('Parameter pencarian pesanan tidak valid.', 400, 'VALIDATION_ERROR');
  const { status, payment_status, startDate, endDate, page, limit } = parsed.data; const offset = (page! - 1) * limit!;
  const filterOptions = { status, paymentStatus: payment_status, dateFrom: startDate, dateTo: endDate };
  const outletFilter = req.outletId ? { outletId: req.outletId } : {};
  const [orders,total] = await Promise.all([container.orderQueries.findByTenant(tenantId, { ...filterOptions, ...outletFilter, limit: limit!, offset }), container.orderQueries.countByTenant(tenantId, { ...filterOptions, ...outletFilter })]);
  res.status(200).json({ success: true, data: { orders: await attachLifecycleFields(orders, tenantId), pagination: { page: page!, limit: limit!, total } } });
});

export const getOrderById = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = req.tenantId!; const { id } = req.params; if (!id) throw createError('Order ID is required', 400, 'MISSING_PARAMETER');
  const order = await container.orderQueries.findById(id, tenantId); if (!order) throw createError('Order not found', 404, 'ORDER_NOT_FOUND');
  if (req.outletId && order.outletId !== req.outletId) throw createError('Order not found for this outlet', 404, 'ORDER_NOT_FOUND');
  res.status(200).json({ success: true, data: await attachLifecycleField(order, tenantId) });
});
