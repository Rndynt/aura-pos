import { db, type DbClient } from '../database';
import type { TransactionContext, UnitOfWorkPort } from '@pos/application/shared/ports';

export class DrizzleUnitOfWork implements UnitOfWorkPort {
  constructor(private readonly database = db) {}

  async runInTransaction<T>(work: (context: TransactionContext) => Promise<T>): Promise<T> {
    return this.database.transaction(async (transaction) => work(DrizzleUnitOfWork.toContext(transaction)));
  }

  static toContext(client: DbClient): TransactionContext {
    return { kind: 'transaction', value: client };
  }

  static fromContext(context?: TransactionContext): DbClient | undefined {
    return context?.value as DbClient | undefined;
  }
}
