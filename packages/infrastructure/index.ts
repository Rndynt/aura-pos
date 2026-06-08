/**
 * Infrastructure Layer - Main Export
 * Repository implementations and external adapters
 */

// Export database connection
export { db, type Database } from './database';

// Export all repositories
export * from './repositories';

// Unit of work adapter
export * from './unit-of-work';
