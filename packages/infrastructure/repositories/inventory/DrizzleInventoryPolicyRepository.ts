import type { InventoryPolicyPort } from '@pos/application/inventory/ports';
import { resolveInventoryPolicy } from '@pos/application/inventory/inventoryPolicy';
import type { TransactionContext } from '@pos/application/shared/ports';
import { DrizzleUnitOfWork } from '../../unit-of-work';

export class DrizzleInventoryPolicyRepository implements InventoryPolicyPort {
  async resolveInventoryPolicy(tenantId: string, context?: TransactionContext) {
    return resolveInventoryPolicy(tenantId, DrizzleUnitOfWork.fromContext(context));
  }
}
