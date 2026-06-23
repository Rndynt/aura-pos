export type ApiConfig = {
  port: number;
  databaseUrl: string;
  baseDomain: string;
  isProduction: boolean;
  extraTrustedOrigins: string[];
  autoMigrateOnBoot: boolean;
};

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

  return {
    port: Number.parseInt(env.PORT || '5000', 10),
    databaseUrl,
    baseDomain: env.BASE_DOMAIN || 'aurapos.my.id',
    isProduction: env.NODE_ENV === 'production',
    extraTrustedOrigins: parseTrustedOrigins(env.EXTRA_TRUSTED_ORIGINS || ''),
    autoMigrateOnBoot: env.API_AUTO_MIGRATE_ON_BOOT === 'true',
  };
}
