import type { InventoryPolicyPort } from '@pos/application/inventory/ports';
import {
  getInventoryConfigValue,
  normalizeInventoryPolicy,
  type InventoryPolicyResult,
} from '@pos/application/inventory/inventoryPolicy';
import type { TransactionContext } from '@pos/application/shared/ports';
import {
  getEffectiveEntitlements,
  type BusinessTypeCode,
  type PlanCode,
  type TenantEntitlementGrant,
} from '@pos/application/entitlements';
import { and, eq, gt, isNull, or } from 'drizzle-orm';
import { tenantEntitlements, tenants } from '@pos/infrastructure/db/schema';
import { db, type DbClient } from '../../database';
import { DrizzleUnitOfWork } from '../../unit-of-work';

const DEFAULT_PLAN: PlanCode = 'starter';
const DEFAULT_BUSINESS_TYPE: BusinessTypeCode = 'CAFE_RESTAURANT';

function toPlanCode(planTier: string | null | undefined): PlanCode {
  if (planTier === 'growth' || planTier === 'pro' || planTier === 'starter') return planTier;
  if (planTier === 'free') return 'starter';
  return DEFAULT_PLAN;
}

function toBusinessTypeCode(businessType: string | null | undefined): BusinessTypeCode {
  if (
    businessType === 'CAFE_RESTAURANT' ||
    businessType === 'RETAIL_MINIMARKET' ||
    businessType === 'LAUNDRY' ||
    businessType === 'SERVICE_APPOINTMENT' ||
    businessType === 'DIGITAL_PPOB'
  ) {
    return businessType;
  }
  return DEFAULT_BUSINESS_TYPE;
}

/**
 * Resolves the per-tenant inventory stock policy used by online order flows.
 *
 * Stock module availability is derived from the entitlement SOT:
 *   - inventory_basic_stock    → inventoryBasicStock
 *   - inventory_advanced_stock → inventoryAdvancedStock
 * The strict/allow_negative policy is read from tenant.settings.inventory_policy
 * (or camelCase inventoryPolicy), falling back to a module default.
 */
export class DrizzleInventoryPolicyRepository implements InventoryPolicyPort {
  constructor(private readonly database = db) {}

  async resolveInventoryPolicy(
    tenantId: string,
    context?: TransactionContext,
  ): Promise<InventoryPolicyResult> {
    const client: DbClient = DrizzleUnitOfWork.fromContext(context) ?? this.database;

    const [tenant] = await client
      .select({
        planTier: tenants.planTier,
        businessType: tenants.businessType,
        settings: tenants.settings,
      })
      .from(tenants)
      .where(eq(tenants.id, tenantId))
      .limit(1);

    if (!tenant) {
      return {
        policy: 'strict',
        inventoryBasicStock: true,
        inventoryAdvancedStock: false,
        source: 'missing_config_default',
      };
    }

    const now = new Date();
    const grantRows = await client
      .select({
        entitlementCode: tenantEntitlements.entitlementCode,
        status: tenantEntitlements.status,
        expiresAt: tenantEntitlements.expiresAt,
        source: tenantEntitlements.source,
      })
      .from(tenantEntitlements)
      .where(
        and(
          eq(tenantEntitlements.tenantId, tenantId),
          eq(tenantEntitlements.status, 'active'),
          or(isNull(tenantEntitlements.expiresAt), gt(tenantEntitlements.expiresAt, now)),
        ),
      );

    const grants = grantRows.map((grant: any): TenantEntitlementGrant => ({
      entitlementCode: grant.entitlementCode,
      status: grant.status,
      expiresAt: grant.expiresAt,
      source: grant.source,
    }));

    const effective = await getEffectiveEntitlements({
      planCode: toPlanCode(tenant.planTier),
      businessType: toBusinessTypeCode(tenant.businessType),
      grants,
    });

    const inventoryBasicStock = effective.has('inventory_basic_stock');
    const inventoryAdvancedStock = effective.has('inventory_advanced_stock');

    const settings = tenant.settings as Record<string, unknown> | null;
    const snakeCasePolicy = normalizeInventoryPolicy(getInventoryConfigValue(settings, 'inventory_policy'));
    if (snakeCasePolicy) {
      return {
        policy: snakeCasePolicy,
        inventoryBasicStock,
        inventoryAdvancedStock,
        source: 'tenant_settings.inventory_policy',
      };
    }

    const camelCasePolicy = normalizeInventoryPolicy(getInventoryConfigValue(settings, 'inventoryPolicy'));
    if (camelCasePolicy) {
      return {
        policy: camelCasePolicy,
        inventoryBasicStock,
        inventoryAdvancedStock,
        source: 'tenant_settings.inventoryPolicy',
      };
    }

    return {
      policy: inventoryBasicStock ? 'strict' : 'allow_negative',
      inventoryBasicStock,
      inventoryAdvancedStock,
      source: 'module_default',
    };
  }
}
