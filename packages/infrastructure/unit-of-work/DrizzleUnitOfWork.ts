import { db, type DbClient } from '../database';
import type { TransactionContext, UnitOfWorkPort } from '@pos/application/shared/ports';

interface LegacyWrappedTransactionContext {
  readonly kind: 'transaction';
  readonly value: unknown;
}

function isLegacyWrappedContext(context: TransactionContext): context is LegacyWrappedTransactionContext {
  return (
    typeof context === 'object' &&
    context !== null &&
    (context as { kind?: unknown }).kind === 'transaction' &&
    'value' in context
  );
}

export class DrizzleUnitOfWork implements UnitOfWorkPort {
  constructor(private readonly database = db) {}

  async transaction<T>(work: (context: TransactionContext) => Promise<T>): Promise<T> {
    return this.database.transaction(async (transaction) => work(DrizzleUnitOfWork.toContext(transaction)));
  }

  async runInTransaction<T>(work: (context: TransactionContext) => Promise<T>): Promise<T> {
    return this.transaction(work);
  }

  static toContext(client: DbClient): TransactionContext {
    return client;
  }

  static fromContext(context?: TransactionContext): DbClient | undefined {
    if (!context) return undefined;
    if (isLegacyWrappedContext(context)) return context.value as DbClient;
    return context as DbClient;
  }
}
