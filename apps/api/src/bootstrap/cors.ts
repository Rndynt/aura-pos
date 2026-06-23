import type { RequestHandler } from 'express';
import type { ApiConfig } from './env';

const LAN_ORIGIN_RE = /^http:\/\/(?:\d{1,3}\.){3}\d{1,3}(?::\d+)?$/;
const LOCALHOST_ORIGINS = new Set([
  'http://localhost:5000',
  'http://localhost:5173',
  'http://localhost:3000',
]);

export function isOriginAllowed(origin: string, config: Pick<ApiConfig, 'baseDomain' | 'isProduction' | 'extraTrustedOrigins'>): boolean {
  if (!origin) return false;

  const baseDomain = config.baseDomain;
  const extraTrustedOrigins = config.extraTrustedOrigins ?? [];
  const isLocalDev = !config.isProduction && (baseDomain === 'localhost' || baseDomain === '127.0.0.1');

  return (
    origin.endsWith(`.${baseDomain}`) ||
    origin === `https://${baseDomain}` ||
    LOCALHOST_ORIGINS.has(origin) ||
    origin.endsWith('.replit.dev') ||
    origin.endsWith('.repl.co') ||
    extraTrustedOrigins.includes(origin) ||
    (isLocalDev && LAN_ORIGIN_RE.test(origin))
  );
}

export function createCorsMiddleware(config: Pick<ApiConfig, 'baseDomain' | 'isProduction' | 'extraTrustedOrigins'>): RequestHandler {
  return (req, res, next) => {
    const origin = req.headers.origin || '';

    if (isOriginAllowed(origin, config)) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Access-Control-Allow-Credentials', 'true');
      res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization,x-tenant-id,x-tenant-service-token,x-tenant-context-token,x-terminal-token,x-outlet-id,x-kds-key,x-cfd-key,x-idempotency-key');
    }

    if (req.method === 'OPTIONS') {
      res.sendStatus(204);
      return;
    }

    next();
  };
}
