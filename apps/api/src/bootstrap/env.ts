export type ApiTrustProxy = boolean | number;

export type ApiConfig = {
  port: number;
  databaseUrl: string;
  baseDomain: string;
  isProduction: boolean;
  corsAllowedOrigins: string[];
  /** @deprecated Use corsAllowedOrigins instead. Kept as a temporary typed compatibility alias. */
  extraTrustedOrigins: string[];
  autoMigrateOnBoot: boolean;
  trustProxy: ApiTrustProxy;
};

export function parseTrustProxy(value: string | undefined): ApiTrustProxy {
  const normalized = value?.trim().toLowerCase();

  if (!normalized || normalized === 'false') {
    return false;
  }

  if (normalized === 'true') {
    return true;
  }

  if (/^\d+$/.test(normalized)) {
    return Number.parseInt(normalized, 10);
  }

  throw new Error('TRUST_PROXY must be one of: false, true, or a non-negative integer hop count.');
}

export function parseTrustedOrigins(value = ''): string[] {
  return value
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
}

export function loadApiConfig(env: NodeJS.ProcessEnv = process.env): ApiConfig {
  const databaseUrl = env.DATABASE_URL?.trim();

  if (!databaseUrl) {
    throw new Error('DATABASE_URL environment variable is not set.');
  }

  const corsAllowedOrigins = parseTrustedOrigins(
    env.CORS_ALLOWED_ORIGINS || env.EXTRA_TRUSTED_ORIGINS || '',
  );
  const trustProxy = parseTrustProxy(env.TRUST_PROXY);

  return {
    port: Number.parseInt(env.PORT || '5000', 10),
    databaseUrl,
    baseDomain: env.BASE_DOMAIN || 'aurapos.my.id',
    isProduction: env.NODE_ENV === 'production',
    corsAllowedOrigins,
    extraTrustedOrigins: corsAllowedOrigins,
    autoMigrateOnBoot: env.API_AUTO_MIGRATE_ON_BOOT === 'true',
    trustProxy,
  };
}
