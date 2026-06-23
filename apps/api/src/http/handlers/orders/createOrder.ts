import { Request, Response } from 'express';
import { z } from 'zod';
import { container } from '../../../container';
import { asyncHandler, createError } from '../../middleware/errorHandler';
import { emitOrderQueueChanged } from '../../services/orderQueueEvents';
import { getIdempotencyKey, orderItemSchema, resolveOrderTypeForTenant } from './common';

export const createOrder = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = req.tenantId!;
  const bodySchema = z.object({
    items: z.array(orderItemSchema).min(1), order_type_id: z.string().optional(), customer_name: z.string().optional(),
    table_number: z.string().optional(), notes: z.string().optional(), tax_rate: z.number().optional(), service_charge_rate: z.number().optional(),
    idempotency_key: z.string().min(8).max(128).optional(),
  });
  const parsed = bodySchema.safeParse(req.body);
  if (!parsed.success) throw createError('Data pesanan tidak valid. Periksa input lalu coba lagi.', 400, 'VALIDATION_ERROR');
  const orderTypeId = await resolveOrderTypeForTenant(tenantId, parsed.data.order_type_id);
  const result = await container.createOrder.execute({ tenant_id: tenantId, outlet_id: req.outletId, ...parsed.data, order_type_id: orderTypeId ?? undefined, idempotency_key: getIdempotencyKey(req, parsed.data.idempotency_key) });
  emitOrderQueueChanged(tenantId, { source: 'create_order', orderId: result.order.id });
  res.status(result.idempotent_replay ? 200 : 201).json({ success: true, data: { order: result.order, pricing: result.pricing } });
});
