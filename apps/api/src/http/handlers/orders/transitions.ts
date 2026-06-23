import { Request, Response } from 'express';
import { z } from 'zod';
import { container } from '../../../container';
import { asyncHandler, createError } from '../../middleware/errorHandler';
import { emitOrderQueueChanged } from '../../services/orderQueueEvents';
import { getOrderActionPermissionContext } from '../../auth/orderActionPermissionContext';
import { assertCanPerformOrderAction, assertOrderBelongsToOutlet, getOrderActionPolicyBase, throwPolicyHttpError } from './common';

export const confirmOrder = asyncHandler(async (req: Request, res: Response) => { const tenantId = req.tenantId!; const { id } = req.params; if (!id) throw createError('Order ID is required',400,'MISSING_PARAMETER'); await assertOrderBelongsToOutlet(id, tenantId, req.outletId); const result = await container.confirmOrderWorkflow.execute({ tenantId, outletId: req.outletId ?? null, orderId: id }); emitOrderQueueChanged(tenantId,{source:'confirm_order', orderId: result.order.id}); res.status(200).json({success:true,data:{order:result.order}}); });
export const completeOrder = asyncHandler(async (req: Request, res: Response) => { const tenantId = req.tenantId!; const { id } = req.params; if (!id) throw createError('Order ID is required',400,'MISSING_PARAMETER'); await assertOrderBelongsToOutlet(id, tenantId, req.outletId); const result = await container.completeOrder.execute({ order_id:id, tenant_id:tenantId }); emitOrderQueueChanged(tenantId,{source:'complete_order', orderId: result.order.id}); res.status(200).json({success:true,data:{order:result.order}}); });

export const updateOrderStatus = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = req.tenantId!; const { id } = req.params; if (!id) throw createError('Order ID is required',400,'MISSING_PARAMETER');
  if (req.query.mode === 'kitchen') {
    const parsed = z.object({ status: z.enum(['confirmed','preparing','ready','served']) }).safeParse(req.body); if (!parsed.success) throw createError('Status dapur tidak valid.',400,'VALIDATION_ERROR');
    await assertOrderBelongsToOutlet(id, tenantId, req.outletId); const result = await container.transitionOrderFulfillmentStatus.execute({ order_id:id, tenant_id:tenantId, status: parsed.data.status }); emitOrderQueueChanged(tenantId,{source:'update_status_kitchen', orderId: result.order.id}); return res.status(200).json({success:true,data:{order:result.order}});
  }
  const parsed = z.object({ status: z.enum(['confirmed','preparing','ready','served','completed','cancelled']), override_payment_check: z.boolean().optional() }).safeParse(req.body); if (!parsed.success) throw createError('Data pesanan tidak valid. Periksa input lalu coba lagi.',400,'VALIDATION_ERROR');
  await assertOrderBelongsToOutlet(id, tenantId, req.outletId); const result = await container.transitionOrderStatus.execute({ order_id:id, tenant_id:tenantId, status: parsed.data.status, override_payment_check: parsed.data.override_payment_check }); emitOrderQueueChanged(tenantId,{source:'update_status_pos', orderId: result.order.id}); res.status(200).json({success:true,data:{order:result.order}});
});

export const cancelOrder = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = req.tenantId!; const { id } = req.params; if (!id) throw createError('Order ID is required',400,'MISSING_PARAMETER');
  const parsed = z.object({ cancellation_reason: z.string().optional() }).safeParse(req.body); if (!parsed.success) throw createError('Data pesanan tidak valid. Periksa input lalu coba lagi.',400,'VALIDATION_ERROR');
  const order = await assertOrderBelongsToOutlet(id, tenantId, req.outletId); if (order.status !== 'draft' && !parsed.data.cancellation_reason?.trim()) throw createError('Alasan pembatalan wajib diisi untuk membatalkan pesanan aktif.',400,'ORDER_CANCEL_REASON_REQUIRED');
  const policyBase = await getOrderActionPolicyBase(tenantId); try { assertCanPerformOrderAction({ ...policyBase, action: order.status === 'draft' ? 'CANCEL_DRAFT' : 'CANCEL_ACTIVE_ORDER', orderOperationalStatus: order.status, paymentStatus: order.paymentStatus ?? order.payment_status, fulfillmentStatus: order.status, actorPermissions: getOrderActionPermissionContext(req).effectivePermissions }); } catch(error) { if (error instanceof Error && error.name === 'OrderActionPolicyError') throwPolicyHttpError(error as any); throw error; }
  const result = await container.cancelOrderWorkflow.execute({ tenantId, outletId: req.outletId ?? null, orderId: id, cancellationReason: parsed.data.cancellation_reason ?? null }); emitOrderQueueChanged(tenantId,{source:'cancel_order', orderId:result.order.id}); res.status(200).json({success:true,data:{order:result.order}});
});
