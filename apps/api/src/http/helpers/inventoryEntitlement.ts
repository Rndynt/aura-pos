import { and, eq, gt, isNull, or } from 'drizzle-orm';
import { requireEntitlement as requireCatalogEntitlement, type EntitlementCode, type PlanCode, type BusinessTypeCode, type TenantEntitlementGrant } from '@pos/application/entitlements';
import { tenantEntitlements, tenants } from '@pos/infrastructure/db/schema';
import { createError } from '../middleware/errorHandler';

type EntitlementDatabase = {
  select: (...args: any[]) => any;
};

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

async function loadTenantEntitlementContext(db: EntitlementDatabase, tenantId: string) {
  const [tenant] = await db
    .select({ planTier: tenants.planTier, businessType: tenants.businessType })
    .from(tenants)
    .where(eq(tenants.id, tenantId))
    .limit(1);

  const now = new Date();
  const grants = await db
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

  return {
    planCode: toPlanCode(tenant?.planTier),
    businessType: toBusinessTypeCode(tenant?.businessType),
    grants: grants.map((grant: any): TenantEntitlementGrant => ({
      entitlementCode: grant.entitlementCode,
      status: grant.status,
      expiresAt: grant.expiresAt,
      source: grant.source,
    })),
  };
}

export async function requireTenantEntitlement(
  db: EntitlementDatabase,
  tenantId: string,
  entitlementCode: EntitlementCode,
): Promise<void> {
  const context = await loadTenantEntitlementContext(db, tenantId);
  try {
    await requireCatalogEntitlement({ ...context, entitlementCode });
  } catch (error) {
    throw createError(
      `Fitur ini memerlukan entitlement '${entitlementCode}'. Aktifkan dari Marketplace atau upgrade paket.`,
      403,
      'MODULE_REQUIRED',
    );
  }
}
