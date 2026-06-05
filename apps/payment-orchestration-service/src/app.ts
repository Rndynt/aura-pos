/**
 * app — Express application factory for payment-orchestration-service.
 *
 * Returns a configured Express app instance.
 * Does NOT call app.listen() — that is the responsibility of src/index.ts.
 *
 * Design principles:
 * - No AuraPoS session/tenant middleware
 * - No POS order domain deps
 * - No static file serving
 * - JSON API only
 */

import express from 'express';
import { createHealthRouter } from './routes/health.ts';
import { createIntentsRouter } from './routes/intents.ts';
import { createMerchantsRouter } from './routes/merchants.ts';
import { createProviderAccountsRouter } from './routes/providerAccounts.ts';
import { createDevFakeGatewayRouter } from './routes/devFakeGateway.ts';
import { createWebhooksRouter } from './routes/webhooks.ts';
import { createAuthMiddleware } from './middleware/auth.ts';
import { errorHandler } from './middleware/errors.ts';
import type { ServiceContainer } from './container.ts';

export function createApp(container: ServiceContainer): express.Application {
  const app = express();

  app.use(express.json());

  // ── Unprotected: health + version ─────────────────────────────────────────
  app.use(createHealthRouter(container.config));

  // ── Service-token auth for all /v1/... routes ─────────────────────────────
  const auth = createAuthMiddleware(container.config.serviceToken, container.config.nodeEnv);
  app.use('/v1', auth);

  // ── API v1 — Merchants ────────────────────────────────────────────────────
  app.use('/v1/merchants', createMerchantsRouter(container));

  // ── API v1 — Provider Accounts (nested under merchants) ───────────────────
  app.use(
    '/v1/merchants/:merchantId/provider-accounts',
    createProviderAccountsRouter(container),
  );

  // ── API v1 — Payment Intents ──────────────────────────────────────────────
  app.use('/v1/payment-intents', createIntentsRouter(container));

  // ── API v1 — Webhooks (placeholder — Phase 8E) ────────────────────────────
  app.use('/v1/webhooks', createWebhooksRouter());

  // ── Dev/test only: FakeGateway confirm ───────────────────────────────────
  if (container.config.nodeEnv !== 'production') {
    app.use('/v1/dev/fake-gateway', createDevFakeGatewayRouter(container));
  }

  // ── Global error handler ──────────────────────────────────────────────────
  app.use(errorHandler);

  // ── 404 catch-all ────────────────────────────────────────────────────────
  app.use((_req, res) => {
    res.status(404).json({
      ok: false,
      error: 'NOT_FOUND',
      message: 'Route not found. Check the payment-orchestration-service API documentation.',
    });
  });

  return app;
}
