import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

export type MigrationLogger = (message: string, source?: string) => void;

export type MigrationRunSummary = {
  applied: number;
  skipped: number;
  errors: number;
  failedMigration?: string;
  failedMessage?: string;
};

const ALREADY_APPLIED_CODES = new Set([
  '42P07', // relation already exists
  '42710', // duplicate object
  '42701', // duplicate column
  '23505', // unique violation on DDL/tracking insert
  '42704', // undefined object on already-removed schema items
  '42830', // invalid FK caused by schema drift superseded by later migration
]);

export function isAlreadyAppliedMigrationError(error: unknown): boolean {
  const err = error as { code?: unknown; message?: unknown } | null;
  const code = typeof err?.code === 'string' ? err.code : '';
  const message = String(err?.message ?? error ?? '').toLowerCase();

  return (
    ALREADY_APPLIED_CODES.has(code)
    || message.includes('already exists')
    || message.includes('duplicate')
    || message.includes('cannot be implemented')
  );
}

export function createMigrationFailure(summary: MigrationRunSummary): Error {
  const failed = summary.failedMigration ? `; first failed migration: ${summary.failedMigration}` : '';
  const detail = summary.failedMessage ? ` (${summary.failedMessage})` : '';
  return new Error(
    `DB migrations failed — applied: ${summary.applied}, skipped: ${summary.skipped}, errors: ${summary.errors}${failed}${detail}`,
  );
}

/**
 * Run DB migrations one file at a time while preserving dependency safety.
 *
 * The runner is intentionally fail-fast for non-idempotency errors: if a migration
 * fails for a real data/schema reason, later migrations are not applied because
 * they may depend on the failed migration's state.
 */
export async function runDbMigrations(log: MigrationLogger): Promise<MigrationRunSummary> {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  const migrationsFolder = path.resolve(__dirname, '../../../../migrations');

  const { sql: rawSql } = await import('@pos/infrastructure/database');
  log(`Running DB migrations from ${migrationsFolder} (background)...`);

  await rawSql`CREATE SCHEMA IF NOT EXISTS drizzle`.catch(() => undefined);
  await rawSql`
    CREATE TABLE IF NOT EXISTS drizzle.__drizzle_migrations (
      id        serial  PRIMARY KEY,
      hash      text    NOT NULL,
      created_at bigint
    )
  `.catch(() => undefined);

  const applied = await rawSql<{ hash: string }[]>`
    SELECT hash FROM drizzle.__drizzle_migrations
  `.then((rows) => new Set(rows.map((row) => row.hash))).catch(() => new Set<string>());

  const files = fs.readdirSync(migrationsFolder)
    .filter((file) => file.endsWith('.sql'))
    .sort();

  const summary: MigrationRunSummary = { applied: 0, skipped: 0, errors: 0 };

  for (const file of files) {
    const filePath = `${migrationsFolder}/${file}`;
    const sqlContent = fs.readFileSync(filePath, 'utf8');
    const hash = file;

    if (applied.has(hash)) {
      summary.skipped += 1;
      continue;
    }

    try {
      await rawSql.unsafe(sqlContent);
      await rawSql`
        INSERT INTO drizzle.__drizzle_migrations (hash, created_at)
        VALUES (${hash}, ${Date.now()})
        ON CONFLICT DO NOTHING
      `;
      summary.applied += 1;
      log(`  ✓ Applied migration: ${file}`, 'migrate');
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);

      if (isAlreadyAppliedMigrationError(error)) {
        await rawSql`
          INSERT INTO drizzle.__drizzle_migrations (hash, created_at)
          VALUES (${hash}, ${Date.now()})
          ON CONFLICT DO NOTHING
        `.catch(() => undefined);
        summary.applied += 1;
        log(`  ~ Skipped (already applied): ${file} — ${message}`, 'migrate');
        continue;
      }

      summary.errors += 1;
      summary.failedMigration = file;
      summary.failedMessage = message;
      log(`  ✗ Migration error (${file}): ${message}`, 'migrate');
      log('  ✗ Stopping migration runner; later migrations were not applied after the failure.', 'migrate');
      break;
    }
  }

  const level = summary.errors > 0 ? 'failed' : 'done';
  log(
    `DB migrations ${level} — applied: ${summary.applied}, skipped: ${summary.skipped}, errors: ${summary.errors}`,
    'migrate',
  );

  if (summary.errors > 0) {
    throw createMigrationFailure(summary);
  }

  return summary;
}
