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
  '23505', // duplicate key / already tracked
  '42704', // undefined object on already-removed schema items
]);

const DOMAIN_BASELINE_TABLES: Array<{ migration: string; tables: string[] }> = [
  { migration: '0009_kitchen_kds.sql', tables: ['kitchen_tickets', 'kds_devices'] },
  { migration: '0010_cfd_sync.sql', tables: ['terminals', 'sync_batches', 'sync_events', 'server_sync_conflicts', 'cfd_devices'] },
];

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

async function ensureMigrationTable(rawSql: any): Promise<void> {
  await rawSql`CREATE SCHEMA IF NOT EXISTS drizzle`.catch(() => undefined);
  await rawSql`
    CREATE TABLE IF NOT EXISTS drizzle.__drizzle_migrations (
      id        serial  PRIMARY KEY,
      hash      text    NOT NULL,
      created_at bigint
    )
  `.catch(() => undefined);
}

async function loadAppliedMigrationHashes(rawSql: any): Promise<Set<string>> {
  return rawSql<{ hash: string }[]>`
    SELECT hash FROM drizzle.__drizzle_migrations
  `.then((rows: { hash: string }[]) => new Set(rows.map((row) => row.hash))).catch(() => new Set<string>());
}

async function tableExists(rawSql: any, tableName: string): Promise<boolean> {
  const rows = await rawSql<{ exists: string | null }[]>`
    SELECT to_regclass(${`public.${tableName}`})::text AS "exists"
  `;
  return Boolean(rows[0]?.exists);
}

async function unmarkDriftedDomainBaselines(rawSql: any, applied: Set<string>, log: MigrationLogger): Promise<Set<string>> {
  const next = new Set(applied);

  for (const domain of DOMAIN_BASELINE_TABLES) {
    if (!next.has(domain.migration)) continue;

    const missing: string[] = [];
    for (const table of domain.tables) {
      if (!(await tableExists(rawSql, table))) missing.push(table);
    }

    if (missing.length === 0) continue;

    await rawSql`
      DELETE FROM drizzle.__drizzle_migrations
      WHERE hash = ${domain.migration}
    `;
    next.delete(domain.migration);
    log(
      `Detected baseline drift for ${domain.migration}; missing tables: ${missing.join(', ')}. `
      + 'Migration marker removed so the owning baseline file can run again.',
      'migrate',
    );
  }

  return next;
}

function splitSqlStatements(sql: string): string[] {
  const statements: string[] = [];
  let current = '';
  let quote: 'single' | 'double' | null = null;
  let dollarTag: string | null = null;
  let inLineComment = false;
  let i = 0;

  while (i < sql.length) {
    const char = sql[i];

    // Inside a -- line comment: copy until newline
    if (inLineComment) {
      current += char;
      if (char === '\n') inLineComment = false;
      i += 1;
      continue;
    }

    // Inside a dollar-quoted block: scan for the closing tag
    if (dollarTag !== null) {
      if (sql.startsWith(dollarTag, i)) {
        current += dollarTag;
        i += dollarTag.length;
        dollarTag = null;
      } else {
        current += char;
        i += 1;
      }
      continue;
    }

    // Inside a regular string quote: copy until closing quote
    if (quote !== null) {
      current += char;
      const prev = sql[i - 1];
      if (char === "'" && quote === 'single' && prev !== '\\') quote = null;
      else if (char === '"' && quote === 'double' && prev !== '\\') quote = null;
      i += 1;
      continue;
    }

    // Detect -- line comment
    if (char === '-' && sql[i + 1] === '-') {
      inLineComment = true;
      current += char;
      i += 1;
      continue;
    }

    // Detect dollar-quoting: $tag$ or $$ (PostgreSQL extension)
    if (char === '$') {
      const match = sql.slice(i).match(/^\$([A-Za-z_\d]*)\$/);
      if (match) {
        dollarTag = match[0];
        current += dollarTag;
        i += dollarTag.length;
        continue;
      }
    }

    // Detect opening string quote
    if (char === "'") { quote = 'single'; current += char; i += 1; continue; }
    if (char === '"') { quote = 'double'; current += char; i += 1; continue; }

    // Statement terminator (only outside any quoting context)
    if (char === ';') {
      const statement = current.trim();
      if (statement) statements.push(statement);
      current = '';
      i += 1;
      continue;
    }

    current += char;
    i += 1;
  }

  const tail = current.trim();
  if (tail) statements.push(tail);
  return statements;
}

async function executeMigrationSql(rawSql: any, sqlContent: string, file: string, log: MigrationLogger): Promise<void> {
  const statements = splitSqlStatements(sqlContent);

  for (const statement of statements) {
    try {
      await rawSql.unsafe(statement);
    } catch (error: unknown) {
      if (isAlreadyAppliedMigrationError(error)) {
        const message = error instanceof Error ? error.message : String(error);
        log(`  ~ Statement already applied in ${file}: ${message}`, 'migrate');
        continue;
      }
      throw error;
    }
  }
}

export async function runDbMigrations(log: MigrationLogger): Promise<MigrationRunSummary> {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  const migrationsFolder = path.resolve(__dirname, '../../../../migrations');

  const { sql: rawSql } = await import('@pos/infrastructure/database');
  log(`Running DB migrations from ${migrationsFolder} (background)...`);

  await ensureMigrationTable(rawSql);

  const files = fs.readdirSync(migrationsFolder)
    .filter((file) => file.endsWith('.sql'))
    .sort();

  let applied = await loadAppliedMigrationHashes(rawSql);
  applied = await unmarkDriftedDomainBaselines(rawSql, applied, log);

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
      await executeMigrationSql(rawSql, sqlContent, file, log);
      await rawSql`
        INSERT INTO drizzle.__drizzle_migrations (hash, created_at)
        VALUES (${hash}, ${Date.now()})
        ON CONFLICT DO NOTHING
      `;
      summary.applied += 1;
      log(`  ✓ Applied migration: ${file}`, 'migrate');
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);

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
export async function runMigrationCli() {
  const logger: MigrationLogger = (message, source = 'migrate') => {
    console.log(source ? `[${source}] ${message}` : message);
  };

  try {
    await runDbMigrations(logger);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : '';
const modulePath = fileURLToPath(import.meta.url);

if (invokedPath === modulePath) {
  await runMigrationCli();
}
