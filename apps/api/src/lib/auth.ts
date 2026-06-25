import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { admin, username, anonymous } from 'better-auth/plugins';
import { drizzle } from 'drizzle-orm/postgres-js';
import * as authSchema from './auth-schema';
import { sql as sharedSql } from '@pos/infrastructure/database';

// Reuse the shared connection pool instead of creating a second one
export const authDb = drizzle(sharedSql, { schema: authSchema });

const BASE_DOMAIN = (process.env.BASE_DOMAIN || 'aurapos.my.id').trim();

// Detect if we're running on Replit
const REPLIT_DEV_DOMAIN = process.env.REPLIT_DEV_DOMAIN?.trim();
const IS_REPLIT = !!REPLIT_DEV_DOMAIN;

// Local-dev mode: HTTP-only LAN access
const IS_LOCAL_DEV =
  process.env.NODE_ENV !== 'production' &&
  (BASE_DOMAIN === 'localhost' || BASE_DOMAIN === '127.0.0.1');

// Canonical base URL
const BASE_URL = (
  process.env.BETTER_AUTH_URL?.trim() ||
  (REPLIT_DEV_DOMAIN ? `https://${REPLIT_DEV_DOMAIN}` : null) ||
  `https://${BASE_DOMAIN}`
);

/**
 * Build trusted origins for Better Auth.
 *
 * Better Auth v1.6.x requires a string[] — function form is not supported.
 * Tenant subdomains (*.BASE_DOMAIN) are handled via the subdomainOriginRewriter
 * Express middleware exported below, which rewrites subdomain Origin headers to
 * the root domain BEFORE Better Auth sees the /api/auth/* request.
 * Cookie domain is set explicitly to .BASE_DOMAIN so it works on all subdomains
 * regardless of the rewritten Origin.
 */
function buildTrustedOrigins(): string[] {
  const origins = new Set<string>([
    `https://${BASE_DOMAIN}`,
    `http://${BASE_DOMAIN}`,
    'http://localhost:5000',
    'http://localhost:3000',
    'http://localhost',
  ]);

  if (REPLIT_DEV_DOMAIN) {
    origins.add(`https://${REPLIT_DEV_DOMAIN}`);
  }
  if (process.env.REPLIT_DOMAINS) {
    process.env.REPLIT_DOMAINS.split(',').forEach((d) => {
      origins.add(`https://${d.trim()}`);
    });
  }
  if (process.env.BETTER_AUTH_URL) {
    origins.add(process.env.BETTER_AUTH_URL.trim());
  }

  const extraRaw =
    process.env.EXTRA_TRUSTED_ORIGINS ||
    process.env.CORS_ALLOWED_ORIGINS ||
    '';
  if (extraRaw) {
    extraRaw.split(',').forEach((o) => {
      const trimmed = o.trim();
      if (trimmed) origins.add(trimmed);
    });
  }

  return Array.from(origins);
}

/**
 * Express middleware to rewrite tenant subdomain Origins before Better Auth.
 *
 * Better Auth v1.6.x checks the Origin header against its trustedOrigins list.
 * Since we cannot enumerate all tenant slugs at startup, we intercept
 * /api/auth/* requests and rewrite a subdomain origin like:
 *   https://tokobudi.aurapos.my.id  →  https://aurapos.my.id
 *
 * The rewrite is origin-header only — it does NOT affect cookies, which are
 * set with domain=.BASE_DOMAIN explicitly and work on all subdomains.
 *
 * Mount this BEFORE the Better Auth handler:
 *   app.use('/api/auth', subdomainOriginRewriter);
 *   app.all('/api/auth/*', authHandler);
 */
export function subdomainOriginRewriter(
  req: import('express').Request,
  _res: import('express').Response,
  next: import('express').NextFunction,
): void {
  const origin = req.headers.origin;
  if (origin && origin !== `https://${BASE_DOMAIN}` && origin.endsWith(`.${BASE_DOMAIN}`)) {
    // Rewrite subdomain origin to root domain so Better Auth accepts it.
    // In dev, also accept http subdomains.
    req.headers.origin = process.env.NODE_ENV === 'production'
      ? `https://${BASE_DOMAIN}`
      : `http://${BASE_DOMAIN}`;
  }
  next();
}

// Cookie config: three modes
//   1. local dev (LAN, HTTP)   → no domain, secure=false
//   2. Replit                  → no domain, secure=true
//   3. production multi-tenant → cross-subdomain on BASE_DOMAIN, secure=true
const cookieAdvanced = IS_LOCAL_DEV
  ? {
      cookiePrefix: 'aurapos',
      defaultCookieAttributes: {
        sameSite: 'lax' as const,
        secure: false,
        httpOnly: true,
        path: '/',
      },
    }
  : IS_REPLIT
  ? {
      cookiePrefix: 'aurapos',
      defaultCookieAttributes: {
        sameSite: 'lax' as const,
        secure: true,
        httpOnly: true,
        path: '/',
      },
    }
  : {
      cookiePrefix: 'aurapos',
      crossSubDomainCookies: {
        enabled: true,
        domain: `.${BASE_DOMAIN}`,
      },
      defaultCookieAttributes: {
        domain: `.${BASE_DOMAIN}`,
        sameSite: 'lax' as const,
        secure: true,
        httpOnly: true,
        path: '/',
      },
    };

export const auth = betterAuth({
  database: drizzleAdapter(authDb, {
    provider: 'pg',
    schema: authSchema,
  }),
  emailAndPassword: {
    enabled: true,
  },
  plugins: [
    username(),
    admin(),
    anonymous({
      generateName: async () => `Display-${Math.floor(1000 + Math.random() * 9000)}`,
    }),
  ],
  basePath: '/api/auth',
  secret: process.env.BETTER_AUTH_SECRET,
  baseURL: BASE_URL,
  // string[] required — Better Auth v1.6.x does not support function form.
  // Tenant subdomains are handled by subdomainOriginRewriter middleware above.
  trustedOrigins: buildTrustedOrigins(),
  advanced: cookieAdvanced,
  user: {
    additionalFields: {
      tenantId: {
        type: 'string',
        required: false,
        fieldName: 'tenant_id',
      },
    },
  },
});
