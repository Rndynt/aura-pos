import { Request, Response } from 'express';
import { z } from 'zod';
import { container } from '../../../container';
import { asyncHandler, createError } from '../../middleware/errorHandler';
import { emitOrderQueueChanged } from '../../services/orderQueueEvents';
import { calculateCreateAndPayTotal, resolveCreateAndPayPaymentFlow } from '@pos/application/orders/paymentOrchestration';
import { getIdempotencyKey, orderItemSchema, paymentFlowSchema, paymentKindSchema, paymentMethodSchema, requirePaymentEntitlement, resolveOrderTypeForTenant } from './common';

export const createAndPay = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = req.tenantId!;
  const bodySchema = z.object({ items: z.array(orderItemSchema).min(1), order_type_id: z.string().optional(), customer_name: z.string().optional(), table_number: z.string().optional(), tax_rate: z.number().optional(), service_charge_rate: z.number().optional(), amount: z.number().positive(), payment_method: paymentMethodSchema, transaction_ref: z.string().optional(), payment_notes: z.string().optional(), idempotency_key: z.string().min(8).max(128).optional(), fulfillment_mode: z.enum(['standard','instant']).optional(), payment_flow: paymentFlowSchema.optional(), payment_kind: paymentKindSchema.optional(), received_amount: z.number().nonnegative().optional(), change_amount: z.number().nonnegative().optional(), reference_note: z.string().optional(), metadata: z.record(z.unknown()).optional(), client_payment_session_id: z.string().min(8).max(128).optional() });
  const parsed = bodySchema.safeParse(req.body); if (!parsed.success) throw createError('Data pesanan tidak valid. Periksa input lalu coba lagi.', 400, 'VALIDATION_ERROR');
  const orderTypeId = await resolveOrderTypeForTenant(tenantId, parsed.data.order_type_id);
  const estimatedTotal = await calculateCreateAndPayTotal(parsed.data);
  const { paymentFlow, isPartialPayment } = resolveCreateAndPayPaymentFlow({ requestedFlow: parsed.data.payment_flow, amount: parsed.data.amount, estimatedTotal });
  if (paymentFlow === 'MULTI_PAYMENT' || paymentFlow === 'SPLIT_BILL') throw createError('Multi payment dan split bill harus dicatat melalui order aktif.', 400, 'UNSUPPORTED_CREATE_AND_PAY_FLOW');
  if (isPartialPayment) await requirePaymentEntitlement(tenantId, 'payments_partial_payment');
  let result;
  try { result = await container.createAndPayOrder.execute({ tenant_id: tenantId, outlet_id: req.outletId ?? null, items: parsed.data.items, order_type_id: orderTypeId ?? undefined, customer_name: parsed.data.customer_name, table_number: parsed.data.table_number, tax_rate: parsed.data.tax_rate, service_charge_rate: parsed.data.service_charge_rate, amount: parsed.data.amount, payment_method: parsed.data.payment_method, payment_flow: paymentFlow as any, payment_kind: parsed.data.payment_kind as any, received_amount: parsed.data.received_amount, change_amount: parsed.data.change_amount, reference_note: parsed.data.reference_note?.trim(), metadata: parsed.data.metadata, client_payment_session_id: parsed.data.client_payment_session_id, transaction_ref: parsed.data.transaction_ref, payment_notes: parsed.data.payment_notes, idempotency_key: getIdempotencyKey(req, parsed.data.idempotency_key), fulfillment_mode: parsed.data.fulfillment_mode }); }
  catch (err: any) { if (err?.code === 'INSUFFICIENT_STOCK' && err?.productId) { const item = parsed.data.items.find((it) => it.product_id === err.productId); const productName = item?.product_name ?? err.productId; const available = Number(err.availableQuantity ?? 0); const requested = Number(err.requestedQuantity ?? 0); throw createError(available <= 0 ? `Stok ${productName} di outlet ini habis.` : `Stok ${productName} di outlet ini tidak cukup. Tersedia: ${available}, diminta: ${requested}.`, 409, 'INSUFFICIENT_STOCK'); } throw err; }
  emitOrderQueueChanged(tenantId, { source: 'create_and_pay', orderId: result.order.id });
  res.status(result.idempotent_replay ? 200 : 201).json({ success: true, data: { order: result.order, payment: result.payment, remainingAmount: result.remainingAmount, idempotent_replay: result.idempotent_replay ?? false, inventory_sync_error: result.inventory_sync_error ?? null } });
});
