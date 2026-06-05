/**
 * env — Payment Orchestration Service configuration loader.
 *
 * Reads only from environment variables. No hard-coded defaults for secrets.
 * No AuraPoS tenant/session dependencies.
 *
 * Port resolution order:
 *   PAYMENT_ORCHESTRATION_SERVICE_PORT → PAYMENT_ENGINE_SERVICE_PORT (alias) → PORT → 5100 (default)
 *   (Intentionally avoids 5000 which is reserved for apps/api)
 *
 * Token resolution order (prefer new name, keep legacy alias for backwards compat):
 *   PAYMENT_ORCHESTRATION_SERVICE_TOKEN → PAYMENT_ENGINE_SERVICE_TOKEN (alias)
 *
 * DB URL resolution order:
 *   PAYMENT_ORCHESTRATION_DATABASE_URL → DATABASE_URL
 */

export interface PaymentOrchestrationServiceConfig {
  port: number;
  nodeEnv: string;
  serviceToken: string;
  dbUrl: string;
  version: string;
  phase: string;
}

export function loadEnv(): PaymentOrchestrationServiceConfig {
  const port = parseInt(
    process.env['PAYMENT_ORCHESTRATION_SERVICE_PORT'] ??
      process.env['PAYMENT_ENGINE_SERVICE_PORT'] ??
      process.env['PORT'] ??
      '5100',
    10,
  );
  const nodeEnv = process.env['NODE_ENV'] ?? 'development';
  const serviceToken =
    process.env['PAYMENT_ORCHESTRATION_SERVICE_TOKEN'] ??
    process.env['PAYMENT_ENGINE_SERVICE_TOKEN'] ??
    '';
  const dbUrl = (
    process.env['PAYMENT_ORCHESTRATION_DATABASE_URL'] ??
    process.env['DATABASE_URL'] ??
    ''
  ).trim();
  const version = '0.2.0';
  const phase = '8D';

  return { port, nodeEnv, serviceToken, dbUrl, version, phase };
}
