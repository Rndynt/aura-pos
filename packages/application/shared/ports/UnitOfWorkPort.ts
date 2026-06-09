/**
 * Application transaction boundary contracts.
 *
 * The transaction context is intentionally opaque. Application use cases may
 * pass it between ports, but only infrastructure adapters are allowed to know
 * what concrete database transaction object it contains.
 */
export type TransactionContext = unknown;

export interface UnitOfWorkPort {
  /**
   * Run the supplied callback inside one atomic transaction boundary.
   */
  transaction<T>(work: (context: TransactionContext) => Promise<T>): Promise<T>;

  /**
   * @deprecated Use transaction(). Kept as a compatibility alias for older
   * application use cases while the repository is migrated incrementally.
   */
  runInTransaction?<T>(work: (context: TransactionContext) => Promise<T>): Promise<T>;
}
