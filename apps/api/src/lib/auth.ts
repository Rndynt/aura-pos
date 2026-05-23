import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { admin, username } from 'better-auth/plugins';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as authSchema from './auth-schema';

// Dedicated DB instance for Better Auth — must include the auth schema
// so the Drizzle adapter can locate the user/session/account/verification models.
const DATABASE_URL = process.env.DATABASE_URL?.trim();
if (!DATABASE_URL) {
  throw new Error('[auth] DATABASE_URL is not set');
}
const authSql = postgres(DATABASE_URL);
export const authDb = drizzle(authSql, { schema: authSchema });

const BASE_DOMAIN = (process.env.BASE_DOMAIN || 'aurapos.my.id').trim();
const DEFAULT_BASE_URL = process.env.BETTER_AUTH_URL?.trim() || `https://${BASE_DOMAIN}`;
const TRUSTED_ORIGIN_REGEX = new RegExp(`^https?:\\/\\/[a-z0-9-]+\\.${BASE_DOMAIN.replace(/\./g, '\\.')}$`);

// Resolve the canonical base URL for better-auth.
// Use the public domain, not localhost, so cookies and callbacks work behind the proxy.
const resolveBaseURL = (): string => DEFAULT_BASE_URL;

// Build trusted origins — allow the root domain and any tenant subdomain.
const buildTrustedOrigins = (): Array<string | RegExp> => {
  const origins: Array<string | RegExp> = [];

  origins.push(`https://${BASE_DOMAIN}`);
  origins.push(`http://${BASE_DOMAIN}`);
  origins.push(TRUSTED_ORIGIN_REGEX);

  // Replit runtime domains (legacy dev support)
  if (process.env.REPLIT_DEV_DOMAIN) {
    origins.push(`https://${process.env.REPLIT_DEV_DOMAIN}`);
  }
  if (process.env.REPLIT_DOMAINS) {
    process.env.REPLIT_DOMAINS.split(',').forEach((d) => {
      origins.push(`https://${d.trim()}`);
    });
  }

  if (process.env.BETTER_AUTH_URL) {
    origins.push(process.env.BETTER_AUTH_URL);
  }

  origins.push('http://localhost:5000');

  return origins;
};

const BASE_URL = resolveBaseURL();

export const auth = betterAuth({
  database: drizzleAdapter(authDb, {
    provider: 'pg',
    schema: authSchema,
  }),
  emailAndPassword: {
    enabled: true,
  },
  plugins: [username(), admin()],
  basePath: '/api/auth',
  secret: process.env.BETTER_AUTH_SECRET,
  baseURL: BASE_URL,
  trustedOrigins: buildTrustedOrigins(),
  advanced: {
    cookiePrefix: 'aurapos',
    crossSubDomainCookies: {
      enabled: true,
      domain: `.${BASE_DOMAIN}`,
    },
    defaultCookieAttributes: {
      domain: `.${BASE_DOMAIN}`,
      sameSite: 'lax',
      secure: true,
      httpOnly: true,
      path: '/',
    },
  },
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
