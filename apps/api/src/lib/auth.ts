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

// Canonical base URL: prefer explicit env var, then Replit domain, then production domain
const BASE_URL = (
  process.env.BETTER_AUTH_URL?.trim() ||
  (REPLIT_DEV_DOMAIN ? `https://${REPLIT_DEV_DOMAIN}` : null) ||
  `https://${BASE_DOMAIN}`
);

// Build trusted origins — strings only (Better Auth does not support RegExp here)
const buildTrustedOrigins = (): string[] => {
  const origins: string[] = [
    `https://${BASE_DOMAIN}`,
    `http://${BASE_DOMAIN}`,
    'http://localhost:5000',
    'http://localhost:3000',
  ];

  // Replit runtime domains
  if (REPLIT_DEV_DOMAIN) {
    origins.push(`https://${REPLIT_DEV_DOMAIN}`);
  }
  if (process.env.REPLIT_DOMAINS) {
    process.env.REPLIT_DOMAINS.split(',').forEach((d) => {
      origins.push(`https://${d.trim()}`);
    });
  }

  if (process.env.BETTER_AUTH_URL) {
    origins.push(process.env.BETTER_AUTH_URL);
  }

  return origins;
};

// Cookie config: on Replit, don't set a custom domain so the browser accepts the cookie
const cookieAdvanced = IS_REPLIT
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
