import type { ApiConfig } from './env';
import { log as defaultLog } from './logging';
import type { MigrationLogger } from '../migrations/migrationRunner';

export type BootMigrationPolicy = {
  shouldRun: boolean;
  reason: string;
};

export function evaluateBootMigrationPolicy(config: Pick<ApiConfig, 'isProduction' | 'autoMigrateOnBoot'>): BootMigrationPolicy {
  if (!config.autoMigrateOnBoot) {
    return {
      shouldRun: false,
      reason: 'API_AUTO_MIGRATE_ON_BOOT=false; skipping boot-time DB migrations.',
    };
  }

  return {
    shouldRun: true,
    reason: config.isProduction
      ? 'API_AUTO_MIGRATE_ON_BOOT enabled in production; all migrations are idempotent (IF NOT EXISTS).'
      : 'API_AUTO_MIGRATE_ON_BOOT enabled; boot-time DB migrations are enabled.',
  };
}

export type BootMigrationRunner = (log: MigrationLogger) => Promise<unknown>;

export type BootMigrationHandlerOptions = {
  log?: MigrationLogger;
  loadMigrationRunner?: () => Promise<{ runDbMigrations: BootMigrationRunner }>;
};

export async function handleBootMigrationPolicy(
  config: Pick<ApiConfig, 'isProduction' | 'autoMigrateOnBoot'>,
  options: BootMigrationHandlerOptions = {},
) {
  const policy = evaluateBootMigrationPolicy(config);

  if (!policy.shouldRun) return;

  const logger = options.log ?? defaultLog;
  logger(policy.reason, 'migrate');

  const { runDbMigrations } = options.loadMigrationRunner
    ? await options.loadMigrationRunner()
    : await import('../migrations/migrationRunner');

  await runDbMigrations(logger);
}
