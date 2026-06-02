import type { DbClient } from '@pos/infrastructure/database';
import { db } from '@pos/infrastructure/database';
import { tenantModuleConfigs } from '../../../shared/schema';
import { eq } from 'drizzle-orm';

export type InventoryStockPolicy = 'strict' | 'allow_negative';

export interface InventoryPolicyResult {
  policy: InventoryStockPolicy;
  enableInventory: boolean;
  enableInventoryAdvanced: boolean;
  source: 'tenant_module_config.config.inventory_policy' | 'tenant_module_config.config.inventoryPolicy' | 'module_default' | 'missing_config_default';
}

function normalizePolicy(value: unknown): InventoryStockPolicy | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toLowerCase().replace(/-/g, '_');
  if (normalized === 'strict' || normalized === 'strict_inventory') return 'strict';
  if (normalized === 'allow_negative' || normalized === 'allow_negative_inventory' || normalized === 'allow_negative_stock') {
    return 'allow_negative';
  }
  return null;
}

function getConfigValue(config: unknown, key: string): unknown {
  if (!config || typeof config !== 'object') return undefined;
  return (config as Record<string, unknown>)[key];
}

/**
 * Resolves the per-tenant inventory stock policy used by online order flows.
 *
 * Tenants can override the default with tenant_module_configs.config:
 *   { "inventory_policy": "strict" }
 *   { "inventory_policy": "allow_negative" }
 *
 * Defaults are module-aware: inventory-enabled tenants are strict by default;
 * tenants without the inventory module keep order flow permissive while any
 * tracked-product movement failures are recorded for retry/audit.
 */
export async function resolveInventoryPolicy(
  tenantId: string,
  client: DbClient = db,
): Promise<InventoryPolicyResult> {
  const rows = await client
    .select({
      enableInventory: tenantModuleConfigs.enableInventory,
      enableInventoryAdvanced: tenantModuleConfigs.enableInventoryAdvanced,
      config: tenantModuleConfigs.config,
    })
    .from(tenantModuleConfigs)
    .where(eq(tenantModuleConfigs.tenantId, tenantId))
    .limit(1);

  const row = rows[0];
  if (!row) {
    return {
      policy: 'strict',
      enableInventory: true,
      enableInventoryAdvanced: false,
      source: 'missing_config_default',
    };
  }

  const snakeCasePolicy = normalizePolicy(getConfigValue(row.config, 'inventory_policy'));
  if (snakeCasePolicy) {
    return {
      policy: snakeCasePolicy,
      enableInventory: row.enableInventory,
      enableInventoryAdvanced: row.enableInventoryAdvanced,
      source: 'tenant_module_config.config.inventory_policy',
    };
  }

  const camelCasePolicy = normalizePolicy(getConfigValue(row.config, 'inventoryPolicy'));
  if (camelCasePolicy) {
    return {
      policy: camelCasePolicy,
      enableInventory: row.enableInventory,
      enableInventoryAdvanced: row.enableInventoryAdvanced,
      source: 'tenant_module_config.config.inventoryPolicy',
    };
  }

  return {
    policy: row.enableInventory ? 'strict' : 'allow_negative',
    enableInventory: row.enableInventory,
    enableInventoryAdvanced: row.enableInventoryAdvanced,
    source: 'module_default',
  };
}
