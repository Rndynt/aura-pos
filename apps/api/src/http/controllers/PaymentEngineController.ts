import type { Request, Response } from 'express';
import { z } from 'zod';
import { container } from '../../container';
import { PaymentPolicyError } from '@pos/domain/payments';

const createIntentSchema = z.object({
  payable_type: z.string().min(1).max(64),
  payable_id: z.string().min(1).max(128),
  amount_due: z.number().positive(),
  currency: z.string().length(3).optional().default('IDR'),
  allow_partial: z.boolean().optional().default(false),
  expires_at: z.string().datetime().optional().nullable(),
  metadata: z.record(z.unknown()).optional(),
  idempotency_key: z.string().max(128).optional(),
});

const recordManualPaymentSchema = z.object({
  amount: z.number().positive(),
  method: z.enum(['cash', 'card', 'qris', 'ewallet', 'bank_transfer', 'customer_credit', 'other']),
  transaction_type: z.enum(['payment', 'deposit', 'settlement']).optional().default('payment'),
  received_amount: z.number().positive().optional(),
  provider_reference: z.string().max(255).optional(),
  metadata: z.record(z.unknown()).optional(),
  idempotency_key: z.string().max(128).optional(),
});

function sendSuccess(res: Response, data: unknown, status = 200) {
  return res.status(status).json({ success: true, data });
}

function sendError(res: Response, message: string, status: number) {
  return res.status(status).json({ success: false, error: message });
}

export async function createIntent(req: Request, res: Response): Promise<void> {
  const parsed = createIntentSchema.safeParse(req.body);
  if (!parsed.success) {
    sendError(res, parsed.error.errors.map((e) => e.message).join(', '), 400);
    return;
  }

  const data = parsed.data;

  try {
    const { intent, idempotentReplay } = await container.createPaymentIntent.execute({
      tenantId: req.tenantId!,
      outletId: req.outletId ?? null,
      payableType: data.payable_type,
      payableId: data.payable_id,
      amountDue: data.amount_due,
      currency: data.currency,
      allowPartial: data.allow_partial,
      expiresAt: data.expires_at ? new Date(data.expires_at) : null,
      metadata: data.metadata,
      idempotencyKey: data.idempotency_key,
    });

    sendSuccess(res, { ...intent, idempotent_replay: idempotentReplay }, idempotentReplay ? 200 : 201);
  } catch (err: any) {
    if (err instanceof PaymentPolicyError) {
      sendError(res, err.message, 422);
    } else {
      sendError(res, err.message ?? 'Failed to create payment intent', 422);
    }
  }
}

export async function getIntent(req: Request, res: Response): Promise<void> {
  const { id } = req.params;

  try {
    const { intent } = await container.getPaymentIntent.execute({
      tenantId: req.tenantId!,
      intentId: id,
    });
    sendSuccess(res, intent);
  } catch (err: any) {
    if (err.message?.includes('not found')) {
      sendError(res, 'Payment intent not found', 404);
    } else {
      sendError(res, err.message ?? 'Internal server error', 500);
    }
  }
}

export async function listTransactions(req: Request, res: Response): Promise<void> {
  const { id } = req.params;

  try {
    const { transactions } = await container.listPaymentTransactions.execute({
      tenantId: req.tenantId!,
      intentId: id,
    });
    sendSuccess(res, { transactions });
  } catch (err: any) {
    if (err.message?.includes('not found')) {
      sendError(res, 'Payment intent not found', 404);
    } else {
      sendError(res, err.message ?? 'Internal server error', 500);
    }
  }
}

export async function recordManualPayment(req: Request, res: Response): Promise<void> {
  const { id } = req.params;

  const parsed = recordManualPaymentSchema.safeParse(req.body);
  if (!parsed.success) {
    sendError(res, parsed.error.errors.map((e) => e.message).join(', '), 400);
    return;
  }

  const data = parsed.data;

  try {
    const result = await container.recordManualPayment.execute({
      tenantId: req.tenantId!,
      paymentIntentId: id,
      amount: data.amount,
      method: data.method,
      transactionType: data.transaction_type,
      receivedAmount: data.received_amount,
      providerReference: data.provider_reference,
      metadata: data.metadata,
      idempotencyKey: data.idempotency_key,
    });

    sendSuccess(res, result);
  } catch (err: any) {
    if (err.message?.includes('not found')) {
      sendError(res, 'Payment intent not found', 404);
    } else if (err instanceof PaymentPolicyError) {
      sendError(res, err.message, 422);
    } else {
      sendError(res, err.message ?? 'Internal server error', 500);
    }
  }
}
