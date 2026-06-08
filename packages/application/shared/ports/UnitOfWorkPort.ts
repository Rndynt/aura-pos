/**
 * Application transaction boundary contracts.
 *
 * Ports deliberately avoid Drizzle or infrastructure types. Infrastructure
 * adapters may attach their native transaction object behind this opaque
 * context while use cases depend only on the application contract.
 */
export interface TransactionContext {
  readonly kind: 'transaction';
  readonly value: unknown;
}

export interface UnitOfWorkPort {
  /**
   * Run the supplied callback inside one atomic transaction boundary.
   */
  runInTransaction<T>(work: (context: TransactionContext) => Promise<T>): Promise<T>;
}
