/**
 * Database Connection
 * Drizzle ORM setup with PostgreSQL
 */

import { drizzle } from 'drizzle-orm/postgres-js';
import type { PgTransaction } from 'drizzle-orm/pg-core';
import type { PostgresJsQueryResultHKT } from 'drizzle-orm/postgres-js';
import type { ExtractTablesWithRelations } from 'drizzle-orm';
import postgres from 'postgres';
import * as schema from '../../shared/schema';

// Get database URL from environment
const DATABASE_URL = process.env.DATABASE_URL?.trim();

if (!DATABASE_URL) {
  console.error('[database] DATABASE_URL environment variable is not set. Exiting.');
  process.exit(1);
}

// Create postgres client optimized for NeonDB (serverless PostgreSQL)
let sql: ReturnType<typeof postgres>;

try {
  sql = postgres(DATABASE_URL, {
    max: 5,                    // NeonDB serverless — keep pool small
    idle_timeout: 10,          // Close idle connections fast (save Neon compute)
    connect_timeout: 10,       // 10s connection timeout
    max_lifetime: 60 * 30,     // 30 min max lifetime (NeonDB suspends compute)
    prepare: false,            // REQUIRED: NeonDB PgBouncer does not support prepared statements
    transform: {
      undefined: null,         // undefined → NULL for NeonDB compatibility
    },
  });
} catch (error) {
  console.error(
    '[database] Failed to initialize database connection. Ensure DATABASE_URL is valid.',
    error,
  );
  process.exit(1);
}

// Initialize Drizzle with schema
export const db = (() => {
  try {
    return drizzle(sql, { schema });
  } catch (error) {
    console.error('[database] Failed to initialize Drizzle ORM instance.', error);
    process.exit(1);
  }
})();

export { sql };
export type Database = typeof db;

// Type that accepts both regular database and transaction
export type DbClient = 
  | Database 
  | PgTransaction<PostgresJsQueryResultHKT, typeof schema, ExtractTablesWithRelations<typeof schema>>;
