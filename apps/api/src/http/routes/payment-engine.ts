import { Router, type Request, type Response, type NextFunction } from 'express';
import * as PaymentEngineController from '../controllers/PaymentEngineController';
import { requireCashier } from '../middleware/rbac';

const router = Router();

/**
 * Reject any request that has no resolved tenant context.
 *
 * The tenant middleware runs before all /api routes and sets `req.tenantId`
 * from the request subdomain, session, or x-tenant-id header. If none of
 * those resolved, the request has no valid tenant scope and every downstream
 * payment operation would silently use a null tenant — this guard prevents
 * that by returning 401 early.
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

/**
 * requirePaymentOperator — payment-engine authorization seam.
 *
 * Two-tier access model:
 *
 * ── Tier 1 (dev / CI): service token bypass ──────────────────────────────────
 * When ALL of the following are true, the request is admitted without a session:
 *   1. `NODE_ENV !== 'production'`  (hard-disabled in production; no override)
 *   2. `PAYMENT_ENGINE_SERVICE_TOKEN` env var is set and has ≥ 32 characters
 *   3. The `x-payment-engine-service-token` request header matches exactly
 *
 * This allows smoke tests, integration scripts, and CI pipelines to call the
 * payment-engine API without spinning up a full Better Auth login flow.
 *
 * ── Tier 2 (all environments): session-based cashier guard ───────────────────
 * If the service token check does not pass (wrong token, missing env var, or
 * running in production), the request MUST have an authenticated Better Auth
 * session with at minimum the "cashier" POS role. Missing or insufficient
 * sessions are rejected with 401 / 403.
 *
 * ── Production safety guarantee ──────────────────────────────────────────────
 * `NODE_ENV === 'production'` hard-disables the service token path.
 * Even if `PAYMENT_ENGINE_SERVICE_TOKEN` is present in production env vars,
 * it is ignored. The only way to call payment-engine routes in production is
 * via a valid authenticated session with cashier+ role.
 */
function requirePaymentOperator(req: Request, res: Response, next: NextFunction): void {
  const isProduction = process.env.NODE_ENV === 'production';
  const configuredToken = process.env.PAYMENT_ENGINE_SERVICE_TOKEN ?? '';

  // Service token path: non-production only, token must be ≥ 32 chars.
  if (!isProduction && configuredToken.length >= 32) {
    const raw = req.headers['x-payment-engine-service-token'];
    const providedToken = Array.isArray(raw) ? raw[0] : (raw ?? '');

    if (providedToken === configuredToken) {
      // Valid service token — admit as authenticated payment operator.
      return next();
    }

    // Token was provided but wrong → reject immediately rather than
    // silently falling through to the session check, so callers get a
    // clear "auth failed" signal instead of a confusing session error.
    if (providedToken.length > 0) {
      res.status(401).json({
        success: false,
        error: 'Invalid payment engine service token.',
        code: 'INVALID_SERVICE_TOKEN',
      });
      return;
    }
  }

  // Fallback: session-based cashier check (applies in production always).
  void requireCashier(req, res, next);
}

// ── Phase 3: Webhook routes ────────────────────────────────────────────────────
//
// IMPORTANT: Registered BEFORE requireTenantContext and requirePaymentOperator.
//
// Webhook callbacks from payment providers:
//   1. Do NOT carry a session or service token.
//   2. Are authenticated exclusively by HMAC signature verification
//      (performed inside HandlePaymentProviderWebhook.execute).
//   3. May not have a known tenantId upfront — the tenantId is resolved from
//      the payment transaction row identified by providerReference.
//
// fake_gateway webhook is always disabled in production (same guard as confirm).

/**
 * POST /api/payment-engine/webhooks/:provider
 *
 * Generic provider webhook endpoint (Phase 3).
 * Security: HMAC-SHA256 signature only — no session, no service token.
 *
 * For fake_gateway:
 *   - Returns 404 in production (same guard as /fake-gateway/confirm).
 *   - In non-production: validates signature via FakeGatewayProvider.verifyWebhook().
 */
router.post(
  '/webhooks/:provider',
  (req: Request, res: Response, next: NextFunction) => {
    // Fake gateway webhook must never be active in production.
    if (req.params.provider === 'fake_gateway' && process.env.NODE_ENV === 'production') {
      res.status(404).json({ success: false, error: 'Not found' });
      return;
    }
    next();
  },
  PaymentEngineController.handleProviderWebhook,
);

// ── Apply tenant context requirement for all routes below ─────────────────────
router.use(requireTenantContext);

// ── Phase 2: fake-gateway/confirm — REGISTERED BEFORE requirePaymentOperator ──
//
// IMPORTANT: This route is intentionally registered before the global
// `router.use(requirePaymentOperator)` call below. Express processes middleware
// and route handlers in registration order. Because this route sends a response
// before the global requirePaymentOperator runs (when in production), the 404
// guard fires *before* any authentication check for production requests.
//
// Behaviour by environment:
//   production:     → 404 immediately, no auth check, handler never reached.
//   non-production: → production guard calls next(), inline requirePaymentOperator
//                     runs (service token or session check), then handler.
//
// All other payment-engine routes are protected by the global
// `router.use(requirePaymentOperator)` below.

/**
 * POST /api/payment-engine/fake-gateway/confirm
 *
 * Dev/test-only controlled gateway confirmation.
 * Simulates a gateway callback (succeeded | failed) for fake_gateway transactions.
 *
 * Security guarantee:
 * - In production: returns 404 before ANY auth check (production guard runs first).
 * - In non-production: requires payment operator authorization (same as other routes).
 * - NOT a real webhook handler — do not call from untrusted sources.
 */
router.post(
  '/fake-gateway/confirm',
  (req: Request, res: Response, next: NextFunction) => {
    // Production guard — must run before requirePaymentOperator.
    if (process.env.NODE_ENV === 'production') {
      res.status(404).json({
        success: false,
        error: 'Not found',
      });
      return;
    }
    next();
  },
  // Auth guard — only reached in non-production environments.
  requirePaymentOperator,
  PaymentEngineController.confirmFakeGatewayPayment,
);

// ── Global auth guard for all remaining routes ─────────────────────────────────
router.use(requirePaymentOperator);

// POST /api/payment-engine/intents — Create a new payment intent
router.post('/intents', PaymentEngineController.createIntent);

// GET /api/payment-engine/intents/:id — Get payment intent by id
router.get('/intents/:id', PaymentEngineController.getIntent);

// GET /api/payment-engine/intents/:id/transactions — List transactions for intent
router.get('/intents/:id/transactions', PaymentEngineController.listTransactions);

// POST /api/payment-engine/intents/:id/manual-payments — Record manual payment
router.post('/intents/:id/manual-payments', PaymentEngineController.recordManualPayment);

// POST /api/payment-engine/intents/:id/gateway-payments
// Create a pending gateway payment transaction. Phase 2: only fake_gateway allowed.
router.post('/intents/:id/gateway-payments', PaymentEngineController.createGatewayPayment);

// ── Phase 4: Refund / Void endpoints ───────────────────────────────────────────

// POST /api/payment-engine/transactions/:id/refund
// Refund a succeeded incoming transaction (full or partial).
router.post('/transactions/:id/refund', PaymentEngineController.refundTransaction);

// POST /api/payment-engine/transactions/:id/void
// Void a pending or requires_action transaction.
router.post('/transactions/:id/void', PaymentEngineController.voidTransaction);

export default router;
