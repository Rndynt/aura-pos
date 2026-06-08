import type { TransactionContext } from '../../shared/ports/UnitOfWorkPort';

export interface OrderNumberSequencePort {
  nextOrderNumberForTenant(tenantId: string, context?: TransactionContext): Promise<string>;
}
