import { Request, Response } from 'express';
import { z } from 'zod';
import { container } from '../../../container';
import { asyncHandler, createError } from '../../middleware/errorHandler';
import { emitOrderQueueChanged } from '../../services/orderQueueEvents';
import { assertOrderBelongsToOutlet, orderItemSchema, resolveOrderTypeForTenant } from './common';

export const updateOrder = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = req.tenantId!; const { id } = req.params;
  if (!id) throw createError('Order ID is required', 400, 'MISSING_PARAMETER');
  const bodySchema = z.object({ items: z.array(orderItemSchema).min(1), order_type_id: z.string().optional(), customer_name: z.string().optional(), table_number: z.string().optional(), notes: z.string().optional(), tax_rate: z.number().optional(), service_charge_rate: z.number().optional() });
  const parsed = bodySchema.safeParse(req.body);
  if (!parsed.success) throw createError('Data pesanan tidak valid. Periksa input lalu coba lagi.', 400, 'VALIDATION_ERROR');
  await assertOrderBelongsToOutlet(id, tenantId, req.outletId);
  const orderTypeId = parsed.data.order_type_id !== undefined ? await resolveOrderTypeForTenant(tenantId, parsed.data.order_type_id) : undefined;
  let result;
  try { result = await container.updateOrder.execute({ order_id: id, tenant_id: tenantId, ...parsed.data, order_type_id: orderTypeId ?? undefined }); }
  catch (error) { const code = error instanceof Error ? (error as any).code : undefined; if (code === 'ORDER_NOT_EDITABLE' || code === 'KITCHEN_ORDER_LOCKED' || code === 'FIRED_ITEMS_LOCKED' || code === 'ORDER_ACTION_NOT_ALLOWED') throw createError(error instanceof Error ? error.message : 'Pesanan sudah aktif atau sudah dikirim ke dapur dan tidak bisa diedit dari keranjang.', 409, code); throw error; }
  emitOrderQueueChanged(tenantId, { source: 'update_order', orderId: result.order.id });
  res.status(200).json({ success: true, data: { order: result.order, pricing: result.pricing } });
});
