import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { admin, username, anonymous } from 'better-auth/plugins';
import { drizzle } from 'drizzle-orm/postgres-js';
import * as authSchema from './auth-schema';
import { db as sharedDb, sql as sharedSql } from '@pos/infrastructure/database';

// Reuse the shared connection pool instead of creating a second one
export const authDb = drizzle(sharedSql, { schema: authSchema });

const BASE_DOMAIN = (process.env.BASE_DOMAIN || 'aurapos.my.id').trim();

// Detect if we're running on Replit
const REPLIT_DEV_DOMAIN = process.env.REPLIT_DEV_DOMAIN?.trim();
const IS_REPLIT = !!REPLIT_DEV_DOMAIN;

// Local-dev mode: HTTP-only LAN access. When BASE_DOMAIN=localhost (the
// Termux/dev setup) the cookie cannot pin a `.localhost` domain or require
// `secure` — those reject the IPv4 host the cashier types on another phone.
const IS_LOCAL_DEV =
  process.env.NODE_ENV !== 'production' &&
  (BASE_DOMAIN === 'localhost' || BASE_DOMAIN === '127.0.0.1');

// Canonical base URL: prefer explicit env var, then Replit domain, then production domain
const BASE_URL = (
  process.env.BETTER_AUTH_URL?.trim() ||
  (REPLIT_DEV_DOMAIN ? `https://${REPLIT_DEV_DOMAIN}` : null) ||
  `https://${BASE_DOMAIN}`
);

/**
 * Build trusted origins for Better Auth.
 *
 * Better Auth does not support wildcard strings like "*.aurapos.my.id".
 * It does accept a function `(origin: string) => boolean` which we use
 * so every tenant subdomain (e.g. tokobudi.aurapos.my.id) is trusted
 * without enumerating all slugs upfront.
 *
 * This is the fix for the production multi-tenant subdomain login failure.
 */
const buildTrustedOrigins = (): ((origin: string) => boolean) => {
  // Statically-known safe origins
  const staticOrigins = new Set<string>([
    `https://${BASE_DOMAIN}`,
    `http://${BASE_DOMAIN}`,
    'http://localhost:5000',
    'http://localhost:3000',
  ]);

  // Replit runtime domains
  if (REPLIT_DEV_DOMAIN) {
    staticOrigins.add(`https://${REPLIT_DEV_DOMAIN}`);
  }
  if (process.env.REPLIT_DOMAINS) {
    process.env.REPLIT_DOMAINS.split(',').forEach((d) => {
      staticOrigins.add(`https://${d.trim()}`);
    });
  }

  if (process.env.BETTER_AUTH_URL) {
    staticOrigins.add(process.env.BETTER_AUTH_URL.trim());
  }

  // Additional LAN / staging / extra origins. Support both env var names.
  const extraRaw =
    process.env.EXTRA_TRUSTED_ORIGINS ||
    process.env.CORS_ALLOWED_ORIGINS ||
    '';
  if (extraRaw) {
    extraRaw.split(',').forEach((o) => {
      const trimmed = o.trim();
      if (trimmed) staticOrigins.add(trimmed);
    });
  }

  // In production, accept HTTPS tenant subdomains only.
  // In development, also accept HTTP LAN IPs and Replit dev URLs.
  const isProduction = process.env.NODE_ENV === 'production';

  return (origin: string): boolean => {
    if (!origin) return false;
    if (staticOrigins.has(origin)) return true;

    // All tenant subdomains: https://<slug>.aurapos.my.id
    const httpsSubdomain = `https://${BASE_DOMAIN}`;
    if (origin !== httpsSubdomain && origin.endsWith(`.${BASE_DOMAIN}`)) {
      if (isProduction) return origin.startsWith('https://');
      return true; // dev: allow http subdomains too
    }

    if (!isProduction) {
      // Replit preview URLs
      if (origin.endsWith('.replit.dev') || origin.endsWith('.repl.co')) return true;
      // LAN IPs: http://192.168.x.y:PORT
      if (/^http:\/\/(?:\d{1,3}\.){3}\d{1,3}(?::\d+)?$/.test(origin)) return true;
    }

    return false;
  };
};

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
