import type { Request, Response } from 'express';
import { z } from 'zod';
import { container } from '../../container';
import { PaymentPolicyError } from '@pos/domain/payments';

// ── Phase 2 schemas ────────────────────────────────────────────────────────────

const createGatewayPaymentSchema = z.object({
  amount: z.number().positive(),
  method: z.enum(['qris', 'ewallet', 'card', 'bank_transfer', 'other']),
  provider: z.string().min(1).max(50),
  metadata: z.record(z.unknown()).optional(),
  idempotency_key: z.string().max(128).optional(),
});

const confirmFakeGatewayPaymentSchema = z.object({
  provider_reference: z.string().min(1).max(255),
  status: z.enum(['succeeded', 'failed']),
  failure_reason: z.string().max(500).optional(),
  metadata: z.record(z.unknown()).optional(),
});

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
    } else if (err instanceof PaymentPolicyError && err.code === 'IDEMPOTENCY_KEY_CONFLICT') {
      sendError(res, err.message, 409);
    } else if (err instanceof PaymentPolicyError) {
      sendError(res, err.message, 422);
    } else {
      sendError(res, err.message ?? 'Internal server error', 500);
    }
  }
}

// ── Phase 3 handlers ───────────────────────────────────────────────────────────

/**
 * POST /api/payment-engine/webhooks/:provider
 *
 * Generic payment provider webhook endpoint.
 * Protected by HMAC signature verification — no session/auth middleware.
 *
 * Returns:
 *   200  — processed | idempotent_replay | ignored
 *   401  — invalid_signature
 *   404  — unknown_provider (or fake_gateway in production)
 *   400  — parse_error
 *   500  — unexpected server error
 */
export async function handleProviderWebhook(req: Request, res: Response): Promise<void> {
  const { provider } = req.params;

  // Reconstruct raw body string.
  // The express.json verify callback stores the raw buffer at req.rawBody.
  const rawBody =
    (req as any).rawBody instanceof Buffer
      ? ((req as any).rawBody as Buffer).toString('utf8')
      : JSON.stringify(req.body);

  try {
    const result = await container.handlePaymentProviderWebhook.execute({
      provider,
      headers: req.headers as Record<string, string>,
      rawBody,
      tenantId: req.tenantId ?? null,
    });

    switch (result.outcome) {
      case 'processed':
        sendSuccess(res, result);
        return;
      case 'idempotent_replay':
        sendSuccess(res, result);
        return;
      case 'ignored':
        sendSuccess(res, result);
        return;
      case 'invalid_signature':
        sendError(res, 'Invalid webhook signature', 401);
        return;
      case 'unknown_provider':
        sendError(res, `Unknown payment provider: ${provider}`, 404);
        return;
      case 'parse_error':
        sendError(res, result.error, 400);
        return;
      default:
        sendError(res, 'Internal server error', 500);
    }
  } catch (err: any) {
    if (err instanceof PaymentPolicyError) {
      sendError(res, err.message, 422);
    } else {
      sendError(res, err?.message ?? 'Internal server error', 500);
    }
  }
}

// ── Phase 4 handlers ───────────────────────────────────────────────────────────

const refundTransactionSchema = z.object({
  amount: z.number().positive(),
  reason: z.string().max(500).optional(),
  metadata: z.record(z.unknown()).optional(),
  idempotency_key: z.string().max(128).optional(),
});

const voidTransactionSchema = z.object({
  reason: z.string().max(500).optional(),
  metadata: z.record(z.unknown()).optional(),
  idempotency_key: z.string().max(128).optional(),
});

/**
 * POST /api/payment-engine/transactions/:id/refund
 *
 * Refund a succeeded incoming transaction (full or partial).
 * Creates an outgoing refund transaction and recalculates the payment intent.
 *
 * Returns:
 *   200 — refund succeeded (idempotent replay)
 *   201 — refund created
 *   400 — validation error
 *   404 — transaction not found
 *   409 — idempotency key conflict
 *   422 — invalid transition / amount exceeds refundable
 */
export async function refundTransaction(req: Request, res: Response): Promise<void> {
  const { id } = req.params;

  const parsed = refundTransactionSchema.safeParse(req.body);
  if (!parsed.success) {
    sendError(res, parsed.error.errors.map((e) => e.message).join(', '), 400);
    return;
  }

  const data = parsed.data;

  try {
    const result = await container.refundPaymentTransaction.execute({
      tenantId: req.tenantId!,
      transactionId: id,
      amount: data.amount,
      reason: data.reason,
      metadata: data.metadata,
      idempotencyKey: data.idempotency_key,
    });

    sendSuccess(res, result, 201);
  } catch (err: any) {
    if (err instanceof PaymentPolicyError && err.code === 'TRANSACTION_NOT_FOUND') {
      sendError(res, err.message, 404);
    } else if (err instanceof PaymentPolicyError && err.code === 'IDEMPOTENCY_KEY_CONFLICT') {
      sendError(res, err.message, 409);
    } else if (err instanceof PaymentPolicyError) {
      sendError(res, err.message, 422);
    } else if (err.message?.includes('not found')) {
      sendError(res, err.message, 404);
    } else {
      sendError(res, err.message ?? 'Internal server error', 500);
    }
  }
}

/**
 * POST /api/payment-engine/transactions/:id/void
 *
 * Void a pending or requires_action transaction.
 * Marks the transaction as voided. Does not affect amountPaid.
 *
 * Returns:
 *   200 — voided
 *   400 — validation error
 *   404 — transaction not found
 *   422 — invalid transition (e.g. already succeeded, already voided)
 */
export async function voidTransaction(req: Request, res: Response): Promise<void> {
  const { id } = req.params;

  const parsed = voidTransactionSchema.safeParse(req.body);
  if (!parsed.success) {
    sendError(res, parsed.error.errors.map((e) => e.message).join(', '), 400);
    return;
  }

  const data = parsed.data;

  try {
    const result = await container.voidPaymentTransaction.execute({
      tenantId: req.tenantId!,
      transactionId: id,
      reason: data.reason,
      metadata: data.metadata,
      idempotencyKey: data.idempotency_key,
    });

    sendSuccess(res, result);
  } catch (err: any) {
    if (err instanceof PaymentPolicyError && err.code === 'TRANSACTION_NOT_FOUND') {
      sendError(res, err.message, 404);
    } else if (err instanceof PaymentPolicyError && err.code === 'INVALID_TRANSITION') {
      sendError(res, err.message, 422);
    } else if (err instanceof PaymentPolicyError) {
      sendError(res, err.message, 422);
    } else if (err.message?.includes('not found')) {
      sendError(res, err.message, 404);
    } else {
      sendError(res, err.message ?? 'Internal server error', 500);
    }
  }
}

// ── Phase 2 handlers ───────────────────────────────────────────────────────────

/**
 * POST /api/payment-engine/intents/:id/gateway-payments
 *
 * Create a pending gateway payment transaction for the given intent.
 * Phase 2 only supports provider = "fake_gateway".
 */
export async function createGatewayPayment(req: Request, res: Response): Promise<void> {
  const { id } = req.params;

  const parsed = createGatewayPaymentSchema.safeParse(req.body);
  if (!parsed.success) {
    sendError(res, parsed.error.errors.map((e) => e.message).join(', '), 400);
    return;
  }

  const data = parsed.data;

  try {
    const result = await container.createGatewayPayment.execute({
      tenantId: req.tenantId!,
      paymentIntentId: id,
      amount: data.amount,
      method: data.method,
      provider: data.provider,
      metadata: data.metadata,
      idempotencyKey: data.idempotency_key,
    });

    sendSuccess(res, result);
  } catch (err: any) {
    if (err.message?.includes('not found')) {
      sendError(res, 'Payment intent not found', 404);
    } else if (err instanceof PaymentPolicyError && err.code === 'IDEMPOTENCY_KEY_CONFLICT') {
      sendError(res, err.message, 409);
    } else if (err instanceof PaymentPolicyError && err.code === 'UNSUPPORTED_PROVIDER') {
      sendError(res, err.message, 422);
    } else if (err instanceof PaymentPolicyError) {
      sendError(res, err.message, 422);
    } else {
      sendError(res, err.message ?? 'Internal server error', 500);
    }
  }
}

/**
 * POST /api/payment-engine/fake-gateway/confirm
 *
 * Dev/test-only endpoint to simulate a gateway callback (succeeded or failed).
 * MUST be disabled / guarded in production — see route definition.
 *
 * Returns 404 for unknown provider reference, 422 for invalid transition.
 */
export async function confirmFakeGatewayPayment(req: Request, res: Response): Promise<void> {
  const parsed = confirmFakeGatewayPaymentSchema.safeParse(req.body);
  if (!parsed.success) {
    sendError(res, parsed.error.errors.map((e) => e.message).join(', '), 400);
    return;
  }

  const data = parsed.data;

  try {
    const result = await container.confirmFakeGatewayPayment.execute({
      tenantId: req.tenantId!,
      providerReference: data.provider_reference,
      status: data.status,
      failureReason: data.failure_reason,
      metadata: data.metadata,
    });

    sendSuccess(res, result);
  } catch (err: any) {
    if (err instanceof PaymentPolicyError && err.code === 'TRANSACTION_NOT_FOUND') {
      sendError(res, err.message, 404);
    } else if (err instanceof PaymentPolicyError && err.code === 'INVALID_TRANSITION') {
      sendError(res, err.message, 422);
    } else if (err instanceof PaymentPolicyError) {
      sendError(res, err.message, 422);
    } else if (err.message?.includes('not found')) {
      sendError(res, err.message, 404);
    } else {
      sendError(res, err.message ?? 'Internal server error', 500);
    }
  }
}
