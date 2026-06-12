import type { InventoryPolicyPort } from '@pos/application/inventory/ports';
import type { InventoryPolicyResult } from '@pos/application/inventory/inventoryPolicy';
import type { TransactionContext } from '@pos/application/shared/ports';
import {
  hasEntitlement,
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
  if (planTier === 'starter' || planTier === 'growth' || planTier === 'pro') return planTier;
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

export class DrizzleInventoryPolicyRepository implements InventoryPolicyPort {
  constructor(private readonly database = db) {}

  async resolveInventoryPolicy(
    tenantId: string,
    context?: TransactionContext,
  ): Promise<InventoryPolicyResult> {
    const client: DbClient = DrizzleUnitOfWork.fromContext(context) ?? this.database;
    const [tenant] = await client
      .select({ planTier: tenants.planTier, businessType: tenants.businessType })
      .from(tenants)
      .where(eq(tenants.id, tenantId))
      .limit(1);

    if (!tenant) {
      return {
        policy: 'strict',
        basicStockEnabled: true,
        advancedStockEnabled: false,
        source: 'missing_config_default',
      };
    }

    const now = new Date();
    const grants = await client
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

    const entitlementContext = {
      planCode: toPlanCode(tenant.planTier),
      businessType: toBusinessTypeCode(tenant.businessType),
      grants: grants.map((grant): TenantEntitlementGrant => ({
        entitlementCode: grant.entitlementCode,
        status: grant.status as TenantEntitlementGrant['status'],
        expiresAt: grant.expiresAt,
        source: grant.source as TenantEntitlementGrant['source'],
      })),
    };

    const basicStockEnabled = await hasEntitlement({
      ...entitlementContext,
      entitlementCode: 'inventory_basic_stock',
    });
    const advancedStockEnabled = await hasEntitlement({
      ...entitlementContext,
      entitlementCode: 'inventory_advanced_stock',
    });

    return {
      policy: basicStockEnabled ? 'strict' : 'allow_negative',
      basicStockEnabled,
      advancedStockEnabled,
      source: 'module_default',
    };
  }
}
