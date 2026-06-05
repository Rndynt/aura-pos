/**
 * devFakeGateway — POST /v1/dev/fake-gateway/transactions/:transactionId/confirm
 *
 * Phase 8D: dev/test-only route to manually confirm a FakeGateway transaction.
 *
 * ⚠ DISABLED IN PRODUCTION. This route does not exist in production builds.
 * Used to test the standalone service flow before real provider webhook wiring.
 */

import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import type { ServiceContainer } from '../container.ts';

export function createDevFakeGatewayRouter(container: ServiceContainer): Router {
  const router = Router();

  /**
   * POST /v1/dev/fake-gateway/transactions/:transactionId/confirm
   *
   * Body: { merchantId: string }
   */
  router.post(
    '/transactions/:transactionId/confirm',
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const transactionId = req.params['transactionId'];
        const { merchantId } = req.body as Record<string, unknown>;

        if (!transactionId) {
          res.status(400).json({ ok: false, error: 'VALIDATION_ERROR', message: 'transactionId is required' });
          return;
        }
        if (!merchantId || typeof merchantId !== 'string') {
          res.status(400).json({ ok: false, error: 'VALIDATION_ERROR', message: 'merchantId is required in request body' });
          return;
        }

        const result = await container.useCases.confirmFakeGatewayPayment.execute({
          merchantId,
          transactionId,
        });

        res.json({
          ok: true,
          alreadyConfirmed: result.alreadyConfirmed,
          data: {
            transaction: serializeTransaction(result.transaction),
            intent: serializeIntent(result.intent),
          },
        });
      } catch (err) {
        next(err);
      }
    },
  );

  return router;
}

function serializeTransaction(tx: {
  id: string;
  intentId: string;
  merchantId: string;
  provider: string;
  method: string;
  status: string;
  amount: number;
  currency: string;
  providerReference: string | null;
  providerPaymentUrl: string | null;
  providerQrString: string | null;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: tx.id,
    intentId: tx.intentId,
    merchantId: tx.merchantId,
    provider: tx.provider,
    method: tx.method,
    status: tx.status,
    amount: tx.amount,
    currency: tx.currency,
    providerReference: tx.providerReference,
    providerPaymentUrl: tx.providerPaymentUrl,
    providerQrString: tx.providerQrString,
    createdAt: tx.createdAt,
    updatedAt: tx.updatedAt,
  };
}

function serializeIntent(intent: {
  id: string;
  merchantId: string;
  status: string;
  amountDue: number;
  amountPaid: number;
  amountRefunded: number;
  amountRemaining: number;
  currency: string;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: intent.id,
    merchantId: intent.merchantId,
    status: intent.status,
    amountDue: intent.amountDue,
    amountPaid: intent.amountPaid,
    amountRefunded: intent.amountRefunded,
    amountRemaining: intent.amountRemaining,
    currency: intent.currency,
    createdAt: intent.createdAt,
    updatedAt: intent.updatedAt,
  };
}
