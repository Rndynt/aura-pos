import { Router, type Request, type Response, type NextFunction } from 'express';
import * as PaymentEngineController from '../controllers/PaymentEngineController';

const router = Router();

/**
 * Reject any request that has no resolved tenant context.
 *
 * The tenant middleware (`tenantMiddleware`) runs before all /api routes and
 * sets `req.tenantId` from the request subdomain, session, or x-tenant-id
 * header. If none of those resolved, the request has no valid tenant scope
 * and every downstream payment operation would silently use a null tenant —
 * this guard prevents that by returning 401 early.
 */
function requireTenantContext(req: Request, res: Response, next: NextFunction): void {
  if (!req.tenantId) {
    res.status(401).json({
      success: false,
      error: 'Tenant context required. Provide a valid tenant via subdomain, session, or x-tenant-id header.',
      code: 'TENANT_CONTEXT_MISSING',
    });
    return;
  }
  next();
}

router.use(requireTenantContext);

// POST /api/payment-engine/intents — Create a new payment intent
router.post('/intents', PaymentEngineController.createIntent);

// GET /api/payment-engine/intents/:id — Get payment intent by id
router.get('/intents/:id', PaymentEngineController.getIntent);

// GET /api/payment-engine/intents/:id/transactions — List transactions for intent
router.get('/intents/:id/transactions', PaymentEngineController.listTransactions);

// POST /api/payment-engine/intents/:id/manual-payments — Record manual payment
router.post('/intents/:id/manual-payments', PaymentEngineController.recordManualPayment);

export default router;
