import { runDbMigrations } from '../migrations/migrationRunner';
import { log } from './logging';

export async function runMigrationAsync() {
  try {
    await runDbMigrations(log);
  } catch (error) {
    process.exitCode = 1;
    log(error instanceof Error ? error.message : String(error), 'migrate');
  }
}
