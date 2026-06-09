import { eq, sql } from 'drizzle-orm';
import type { DbClient } from '@pos/infrastructure/database';
import { tenantModuleConfigs, tenants } from '@pos/infrastructure/db/schema';

export type InventoryEntitlementConfig = {
  enableInventory?: boolean | null;
  enableInventoryAdvanced?: boolean | null;
};

export type BasicStockTenantPolicyContext = {
  isActive?: boolean | null;
  planTier?: string | null;
};

export type BasicStockEntitlementRepairAction = 'insert_missing_config' | 'repair_stale_disabled' | null;

export type BasicStockEntitlementResolution = {
  enabled: boolean;
  planTier: string | null;
  tenantActive: boolean;
  hasModuleConfig: boolean;
  repaired: boolean;
  repairAction: BasicStockEntitlementRepairAction;
};

/**
 * Basic Stock is a free/onboarding default for active tenants on these plan-tier
 * values. The extra aliases are intentionally centralised here because legacy
 * deployments have used starter/basic naming while the current domain type uses
 * `free` for onboarding.
 */
export const BASIC_STOCK_DEFAULT_PLAN_TIERS = ['free', 'starter', 'basic', 'basic_starter'] as const;

const basicStockRepairLogKeys = new Set<string>();

export function normalizePlanTier(planTier: string | null | undefined): string {
  return (planTier ?? 'free').trim().toLowerCase();
}

export function isBasicStockDefaultPlanTier(planTier: string | null | undefined): boolean {
  return BASIC_STOCK_DEFAULT_PLAN_TIERS.includes(
    normalizePlanTier(planTier) as (typeof BASIC_STOCK_DEFAULT_PLAN_TIERS)[number],
  );
}

/** Basic Stock (Stok Dasar) is the free/onboarding inventory entitlement. */
export function hasBasicStockEntitlement(config: InventoryEntitlementConfig | undefined): boolean {
  return config?.enableInventory === true;
}

/** Advanced inventory remains separately gated and must not be implied by Basic Stock. */
export function hasAdvancedInventoryEntitlement(config: InventoryEntitlementConfig | undefined): boolean {
  return config?.enableInventoryAdvanced === true;
}

export function getBasicStockEntitlementRepairAction(input: {
  tenant: BasicStockTenantPolicyContext | undefined;
  config: InventoryEntitlementConfig | undefined;
  hasModuleConfig: boolean;
}): BasicStockEntitlementRepairAction {
  if (input.config?.enableInventory === true) {
    return null;
  }

  if (input.tenant?.isActive !== true || !isBasicStockDefaultPlanTier(input.tenant.planTier)) {
    return null;
  }

  return input.hasModuleConfig ? 'repair_stale_disabled' : 'insert_missing_config';
}

function warnBasicStockRepairOnce(tenantId: string, action: Exclude<BasicStockEntitlementRepairAction, null>): void {
  const key = `${tenantId}:${action}`;
  if (basicStockRepairLogKeys.has(key)) {
    return;
  }

  basicStockRepairLogKeys.add(key);
  console.warn('[inventory-entitlement] repaired Basic Stock tenant_module_configs entitlement', {
    tenantId,
    action,
  });
}

async function repairBasicStockEntitlement(
  dbClient: DbClient,
  tenantId: string,
  action: Exclude<BasicStockEntitlementRepairAction, null>,
): Promise<void> {
  await dbClient
    .insert(tenantModuleConfigs)
    .values({
      tenantId,
      enableTableManagement: false,
      enableKitchenTicket: false,
      enableLoyalty: false,
      enableDelivery: false,
      enableInventory: true,
      enableInventoryAdvanced: false,
      enableAppointments: false,
      enableMultiLocation: false,
      config: null,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: tenantModuleConfigs.tenantId,
      set: {
        enableInventory: true,
        // Preserve any explicit Advanced Inventory entitlement on stale rows.
        enableInventoryAdvanced: sql`${tenantModuleConfigs.enableInventoryAdvanced}`,
        updatedAt: new Date(),
      },
    });

  warnBasicStockRepairOnce(tenantId, action);
}

/**
 * Resolve Basic Stock using backend policy as source of truth.
 *
 * Existing `enable_inventory=true` is always honored for the tenant row. Active
 * onboarding/default-plan tenants with missing or stale module config rows are
 * repaired idempotently so production requests do not stay blocked by old data.
 */
export async function resolveBasicStockEntitlement(
  dbClient: DbClient,
  tenantId: string,
): Promise<BasicStockEntitlementResolution> {
  const [row] = await dbClient
    .select({
      tenantId: tenants.id,
      tenantActive: tenants.isActive,
      planTier: tenants.planTier,
      configTenantId: tenantModuleConfigs.tenantId,
      enableInventory: tenantModuleConfigs.enableInventory,
      enableInventoryAdvanced: tenantModuleConfigs.enableInventoryAdvanced,
    })
    .from(tenants)
    .leftJoin(tenantModuleConfigs, eq(tenantModuleConfigs.tenantId, tenants.id))
    .where(eq(tenants.id, tenantId))
    .limit(1);

  if (!row) {
    return {
      enabled: false,
      planTier: null,
      tenantActive: false,
      hasModuleConfig: false,
      repaired: false,
      repairAction: null,
    };
  }

  const hasModuleConfig = row.configTenantId != null;
  const config = {
    enableInventory: row.enableInventory,
    enableInventoryAdvanced: row.enableInventoryAdvanced,
  };
  const tenant = {
    isActive: row.tenantActive,
    planTier: row.planTier,
  };
  const repairAction = getBasicStockEntitlementRepairAction({ tenant, config, hasModuleConfig });

  if (repairAction) {
    await repairBasicStockEntitlement(dbClient, tenantId, repairAction);
  }

  return {
    enabled: hasBasicStockEntitlement(config) || repairAction !== null,
    planTier: row.planTier,
    tenantActive: row.tenantActive === true,
    hasModuleConfig,
    repaired: repairAction !== null,
    repairAction,
  };
}
