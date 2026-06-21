/**
 * POSPaymentController
 *
 * Handles POST /api/pos/payments/submit
 *
 * Responsibilities:
 * - Extract tenantId / outletId / user context
 * - Validate Zod DTO (canonical values only)
 * - Perform entitlement checks for DP / MULTI / SPLIT
 * - Call SubmitPOSPayment use case
 * - Map result to JSON
 * - Map known errors to user-safe HTTP responses
 *
 * Must NOT:
 * - Create orders manually
 * - Record payment rows manually
 * - Calculate split lifecycle itself
 * - Know businessProfile payment behavior
 * - Expose database error messages
 */

import { Request, Response } from 'express';
import { z } from 'zod';
import { container } from '../../container';
import { asyncHandler, createError } from '../middleware/errorHandler';
import { emitOrderQueueChanged } from '../services/orderQueueEvents';
import { getEffectiveEntitlementMap } from '../../services/tenantEntitlements';
import { POSPaymentValidationError } from '@pos/application/payments';

// ---------------------------------------------------------------------------
// Zod schemas — canonical values only
// ---------------------------------------------------------------------------

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
  selected_option_groups: z.array(z.unknown()).optional(),
  notes: z.string().optional(),
});

const paymentLineSchema = z.object({
  method: z.enum(['CASH', 'MANUAL_TRANSFER', 'MANUAL_QRIS']),
  amount: z.number().positive(),
  receivedAmount: z.number().nonnegative().optional(),
  referenceNote: z.string().optional(),
  clientBillId: z.string().optional(),
  orderBillSplitId: z.string().uuid().optional(),
});

const splitSchema = z.object({
  clientBillId: z.string(),
  label: z.string(),
  splitNo: z.number().int().positive(),
  amountDue: z.number().positive(),
  amountPaid: z.number().nonnegative().optional(),
  status: z.enum(['UNPAID', 'PARTIAL', 'PAID']).optional(),
});

const bodySchema = z.object({
  source: z.enum(['FRESH_CART', 'SAVED_ORDER', 'ACTIVE_ORDER']),
  clientPaymentSessionId: z.string().min(8).max(128),

  orderId: z.string().uuid().optional(),
  orderNumber: z.string().optional(),

  order: z.object({
    items: z.array(orderItemSchema).min(1),
    order_type_id: z.string().uuid().nullish(),
    customer_name: z.string().optional(),
    table_number: z.string().optional(),
    notes: z.string().optional(),
    tax_rate: z.number().nonnegative().optional(),
    service_charge_rate: z.number().nonnegative().optional(),
    fulfillment_mode: z.enum(['standard', 'instant']).optional(),
  }).optional(),

  payment: z.object({
    flow: z.enum(['FULL', 'DOWN_PAYMENT', 'MULTI_PAYMENT', 'SPLIT_BILL']),
    paymentKind: z.enum(['FULL_PAYMENT', 'DOWN_PAYMENT', 'REMAINING_PAYMENT', 'MULTI_PAYMENT_LINE', 'SPLIT_BILL_LINE']).optional(),
    targetBillId: z.string().optional(),
    lines: z.array(paymentLineSchema).min(1).max(4),
    splits: z.array(splitSchema).max(4).optional(),
  }),
});

// ---------------------------------------------------------------------------
// User-safe error mapping
// ---------------------------------------------------------------------------

export function mapToUserSafeError(error: unknown): { message: string; code: string; status: number } {
  if (error instanceof POSPaymentValidationError) {
    return { message: error.message, code: error.code, status: 400 };
  }
  const msg = error instanceof Error ? error.message : String(error ?? '');

  if (/order tidak ditemukan/i.test(msg)) return { message: msg, code: 'ORDER_NOT_FOUND', status: 404 };
  if (/order_type|tipe pesanan/i.test(msg)) return { message: 'Tipe pesanan tidak valid atau belum aktif untuk tenant ini. Muat ulang POS lalu coba lagi.', code: 'INVALID_ORDER_TYPE', status: 400 };
  if (/jumlah pembayaran harus sama dengan sisa bill/i.test(msg)) return { message: 'Jumlah pembayaran harus sama dengan sisa bill yang dipilih.', code: 'SPLIT_BILL_AMOUNT_MISMATCH', status: 400 };
  if (/^bill yang dipilih sudah lunas\.?$/i.test(msg.trim())) return { message: 'Bill yang dipilih sudah lunas.', code: 'SPLIT_BILL_ALREADY_PAID', status: 409 };
  if (/melebihi sisa/i.test(msg)) return { message: 'Jumlah pembayaran melebihi sisa tagihan.', code: 'PAYMENT_AMOUNT_EXCEEDS_REMAINING', status: 400 };
  if (/split|bill yang dipilih/i.test(msg)) return { message: 'Bill yang dipilih tidak valid atau sudah lunas.', code: 'INVALID_SPLIT_BILL', status: 400 };
  if (/metode pembayaran/i.test(msg)) return { message: 'Metode pembayaran tidak valid.', code: 'PAYMENT_METHOD_INVALID', status: 400 };
  if (/tipe pembayaran/i.test(msg)) return { message: 'Tipe pembayaran tidak valid.', code: 'PAYMENT_FLOW_INVALID', status: 400 };
  if (/cancelled|dibatalkan/i.test(msg)) return { message: 'Tidak dapat mencatat pembayaran untuk order yang dibatalkan.', code: 'ORDER_CANCELLED', status: 409 };
  if (/violates foreign key|fk_/i.test(msg)) return { message: 'Data tidak valid. Muat ulang POS lalu coba lagi.', code: 'CONSTRAINT_VIOLATION', status: 400 };

  return { message: 'Pembayaran gagal dicatat. Silakan coba lagi.', code: 'PAYMENT_ERROR', status: 500 };
}

// ---------------------------------------------------------------------------
// Controller
// ---------------------------------------------------------------------------

export const submitPOSPayment = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = req.tenantId!;

  const parsed = bodySchema.safeParse(req.body);
  if (!parsed.success) {
    const firstError = parsed.error.errors[0];
    const fieldPath = firstError?.path?.join('.') ?? '';
    if (firstError?.code === 'invalid_enum_value') {
      const isPaymentMethodPath = fieldPath.includes('method');
      throw createError(
        isPaymentMethodPath ? 'Metode pembayaran tidak valid.' : 'Tipe pembayaran tidak valid.',
        400,
        isPaymentMethodPath ? 'PAYMENT_METHOD_INVALID' : 'PAYMENT_FLOW_INVALID',
      );
    }
    throw createError('Data pembayaran tidak valid. Periksa input lalu coba lagi.', 400, 'VALIDATION_ERROR');
  }

  const data = parsed.data;
  const flow = data.payment.flow;

  // ── Entitlement checks at boundary ────────────────────────────────────────
  if (flow === 'DOWN_PAYMENT' || flow === 'MULTI_PAYMENT' || flow === 'SPLIT_BILL') {
    const entitlementCode =
      flow === 'DOWN_PAYMENT' ? 'payments_partial_payment'
      : flow === 'MULTI_PAYMENT' ? 'payments_multi_payment'
      : 'payments_split_bill';

    const entitlements = await getEffectiveEntitlementMap(tenantId);
    if (!entitlements[entitlementCode]) {
      throw createError(
        `Fitur pembayaran ini memerlukan entitlement '${entitlementCode}'.`,
        403,
        'ENTITLEMENT_REQUIRED',
      );
    }
  }

  // ── Call use case ──────────────────────────────────────────────────────────
  let result;
  try {
    result = await container.submitPOSPayment.execute({
      tenantId,
      outletId: req.outletId ?? null,
      source: data.source,
      clientPaymentSessionId: data.clientPaymentSessionId,
      orderId: data.orderId,
      orderNumber: data.orderNumber,
      order: data.order as any,
      payment: data.payment as any,
    });
  } catch (error: unknown) {
    const mapped = mapToUserSafeError(error);
    throw createError(mapped.message, mapped.status, mapped.code);
  }

  if (result.orderId) {
    emitOrderQueueChanged(tenantId, { source: 'submit_pos_payment', orderId: result.orderId });
  }

  const httpStatus = result.status === 'PAID' ? 200 : 202;
  res.status(httpStatus).json({
    success: true,
    data: result,
  });
});
