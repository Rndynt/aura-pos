import type { ApiConfig } from './env';
import { log } from './logging';

export type BootMigrationPolicy = {
  shouldRun: boolean;
  reason: string;
};

export function evaluateBootMigrationPolicy(config: Pick<ApiConfig, 'isProduction' | 'autoMigrateOnBoot'>): BootMigrationPolicy {
  if (!config.autoMigrateOnBoot) {
    return {
      shouldRun: false,
      reason: 'API_AUTO_MIGRATE_ON_BOOT is not enabled; skipping boot-time DB migrations.',
    };
  }

  if (config.isProduction) {
    throw new Error('API_AUTO_MIGRATE_ON_BOOT=true is not allowed when NODE_ENV=production. Run `pnpm db:migrate` explicitly before starting the API.');
  }

  return {
    shouldRun: true,
    reason: 'API_AUTO_MIGRATE_ON_BOOT=true in non-production; boot-time DB migrations are enabled.',
  };
}

export function handleBootMigrationPolicy(config: Pick<ApiConfig, 'isProduction' | 'autoMigrateOnBoot'>) {
  const policy = evaluateBootMigrationPolicy(config);
  log(policy.reason, 'migrate');

  if (!policy.shouldRun) return;

  void import('../migrations/migrationRunner')
    .then(({ runDbMigrations }) => runDbMigrations(log))
    .catch((error) => {
      process.exitCode = 1;
      log(error instanceof Error ? error.message : String(error), 'migrate');
    });
}
