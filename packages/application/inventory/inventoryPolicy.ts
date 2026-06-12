import type { TransactionContext } from '../shared/ports/UnitOfWorkPort';
import type { InventoryPolicyPort } from './ports/InventoryPolicyPort';

export type InventoryStockPolicy = 'strict' | 'allow_negative';

export interface InventoryPolicyResult {
  policy: InventoryStockPolicy;
  basicStockEnabled: boolean;
  advancedStockEnabled: boolean;
  source:
    | 'module_default'
    | 'missing_config_default';
}

let defaultInventoryPolicyPort: InventoryPolicyPort | undefined;

export function configureInventoryPolicyPort(port: InventoryPolicyPort): void {
  defaultInventoryPolicyPort = port;
}

export function normalizeInventoryPolicy(value: unknown): InventoryStockPolicy | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toLowerCase().replace(/-/g, '_');
  if (normalized === 'strict' || normalized === 'strict_inventory') return 'strict';
  if (
    normalized === 'allow_negative' ||
    normalized === 'allow_negative_inventory' ||
    normalized === 'allow_negative_stock'
  ) {
    return 'allow_negative';
  }
  return null;
}

export function getInventoryConfigValue(config: unknown, key: string): unknown {
  if (!config || typeof config !== 'object') return undefined;
  return (config as Record<string, unknown>)[key];
}

/**
 * Resolves the per-tenant inventory stock policy used by online order flows.
 *
 * Persistence is supplied by an application port. The API composition root
 * configures the default implementation; use cases can pass an explicit port
 * context when they are already inside a unit of work.
 */
export async function resolveInventoryPolicy(
  tenantId: string,
  context?: TransactionContext,
): Promise<InventoryPolicyResult> {
  if (!defaultInventoryPolicyPort) {
    throw new Error('Inventory policy port has not been configured');
  }
  return defaultInventoryPolicyPort.resolveInventoryPolicy(tenantId, context);
}
