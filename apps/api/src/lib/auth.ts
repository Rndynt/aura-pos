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

// Build trusted origins — always include Replit domains
const buildTrustedOrigins = (): string[] => {
  const origins: string[] = [];

  // Replit runtime domains (format: https://<id>.sisko.replit.dev)
  if (process.env.REPLIT_DEV_DOMAIN) {
    origins.push(`https://${process.env.REPLIT_DEV_DOMAIN}`);
  }
  if (process.env.REPLIT_DOMAINS) {
    process.env.REPLIT_DOMAINS.split(',').forEach((d) => {
      origins.push(`https://${d.trim()}`);
    });
  }

  // Custom base URL
  if (process.env.BETTER_AUTH_URL) {
    origins.push(process.env.BETTER_AUTH_URL);
  }

  // localhost for local dev
  origins.push('http://localhost:5000');

  return origins;
};

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
  baseURL: process.env.BETTER_AUTH_URL,
  trustedOrigins: buildTrustedOrigins(),
});
