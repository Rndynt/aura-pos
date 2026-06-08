import type { TransactionContext } from '../../shared/ports/UnitOfWorkPort';
import type { InventoryPolicyResult } from '../inventoryPolicy';

export interface InventoryPolicyPort {
  resolveInventoryPolicy(tenantId: string, context?: TransactionContext): Promise<InventoryPolicyResult>;
}
