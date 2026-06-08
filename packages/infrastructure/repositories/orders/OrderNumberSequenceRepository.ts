import { nextOrderNumberForTenant } from './orderNumberSequence';
import type { OrderNumberSequencePort } from '@pos/application/orders/ports';
import type { TransactionContext } from '@pos/application/shared/ports';
import { db } from '../../database';
import { DrizzleUnitOfWork } from '../../unit-of-work';

export class DrizzleOrderNumberSequenceRepository implements OrderNumberSequencePort {
  async nextOrderNumberForTenant(tenantId: string, context?: TransactionContext): Promise<string> {
    return nextOrderNumberForTenant(DrizzleUnitOfWork.fromContext(context) ?? db, tenantId);
  }
}
