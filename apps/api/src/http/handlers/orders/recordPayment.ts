import { Request, Response } from 'express';
import { z } from 'zod';
import { container } from '../../../container';
import { asyncHandler, createError } from '../../middleware/errorHandler';
import { emitOrderQueueChanged } from '../../services/orderQueueEvents';
import { assertCanPerformOrderAction, assertOrderBelongsToOutlet, getOrderActionPolicyBase, paymentFlowSchema, paymentKindSchema, paymentMethodSchema, requirePaymentEntitlement, throwPolicyHttpError } from './common';

export const recordPayment = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = req.tenantId!; const { id } = req.params; if (!id) throw createError('Order ID is required', 400, 'MISSING_PARAMETER');
  const bodySchema = z.object({ amount: z.number().positive(), payment_method: paymentMethodSchema, transaction_ref: z.string().optional(), notes: z.string().optional(), idempotency_key: z.string().min(8).max(128).optional(), payment_flow: paymentFlowSchema.optional(), payment_kind: paymentKindSchema.optional(), received_amount: z.number().nonnegative().optional(), change_amount: z.number().nonnegative().optional(), split_id: z.string().uuid().optional(), sequence: z.number().int().positive().max(4).optional(), reference_note: z.string().optional(), metadata: z.record(z.unknown()).optional(), client_payment_session_id: z.string().min(8).max(128).optional() });
  const parsed = bodySchema.safeParse(req.body); if (!parsed.success) throw createError('Data pesanan tidak valid. Periksa input lalu coba lagi.', 400, 'VALIDATION_ERROR');
  const order = await assertOrderBelongsToOutlet(id, tenantId, req.outletId);
  const normalizedPaymentFlow = parsed.data.payment_flow ?? 'FULL';
  const paymentAction = normalizedPaymentFlow === 'DOWN_PAYMENT' ? 'PARTIAL_PAYMENT' : normalizedPaymentFlow === 'SPLIT_BILL' ? 'SPLIT_BILL' : 'PAY_ACTIVE_ORDER';
  const policyBase = await getOrderActionPolicyBase(tenantId, { requireEntitlements: paymentAction === 'PARTIAL_PAYMENT' || paymentAction === 'SPLIT_BILL' });
  try { assertCanPerformOrderAction({ ...policyBase, action: paymentAction, orderOperationalStatus: order.status, paymentStatus: order.paymentStatus ?? order.payment_status, fulfillmentStatus: order.status }); } catch (error) { if (error instanceof Error && error.name === 'OrderActionPolicyError') throwPolicyHttpError(error as any); throw error; }
  if (normalizedPaymentFlow === 'DOWN_PAYMENT') await requirePaymentEntitlement(tenantId, 'payments_partial_payment');
  if (normalizedPaymentFlow === 'MULTI_PAYMENT') await requirePaymentEntitlement(tenantId, 'payments_multi_payment');
  if (normalizedPaymentFlow === 'SPLIT_BILL') await requirePaymentEntitlement(tenantId, 'payments_split_bill');
  const result = await container.recordPayment.execute({ order_id: id, tenant_id: tenantId, amount: parsed.data.amount, payment_method: parsed.data.payment_method, payment_flow: normalizedPaymentFlow as any, payment_kind: parsed.data.payment_kind as any, received_amount: parsed.data.received_amount, change_amount: parsed.data.change_amount, split_id: parsed.data.split_id, sequence: parsed.data.sequence, reference_note: parsed.data.reference_note?.trim(), metadata: parsed.data.metadata, client_payment_session_id: parsed.data.client_payment_session_id, notes: parsed.data.notes, transaction_ref: parsed.data.transaction_ref?.trim(), idempotency_key: parsed.data.idempotency_key?.trim() });
  emitOrderQueueChanged(tenantId, { source: 'record_payment', orderId: result.order.id });
  res.status(result.idempotent_replay ? 200 : 201).json({ success: true, data: { payment: result.payment, order: result.order, remainingAmount: result.remainingAmount, idempotent_replay: result.idempotent_replay ?? false } });
});
