import type { ApiConfig } from './env';
import { log } from './logging';

export function runStartupChecks(config: ApiConfig) {
  if (!config.databaseUrl) {
    log('DATABASE_URL environment variable is not set. Exiting.', 'fatal');
    throw new Error('DATABASE_URL environment variable is not set.');
  }
}
