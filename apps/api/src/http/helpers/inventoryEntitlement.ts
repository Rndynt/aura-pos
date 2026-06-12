import { requireEntitlement as requireCatalogEntitlement, type EntitlementCode } from '@pos/application/entitlements';
import { loadTenantEntitlementContext } from '../../services/tenantEntitlements';
import { db } from '@pos/infrastructure/database';
import { createError } from '../middleware/errorHandler';

type EntitlementDatabase = { select: (...args: any[]) => any };

/**
 * Throws a 403 createError when the tenant lacks the given commercial
 * entitlement. Effective entitlements are derived from the SOT at runtime
 * (cumulative plan + business-type defaults + active grants).
 */
export async function requireTenantEntitlement(
  database: EntitlementDatabase,
  tenantId: string,
  entitlementCode: EntitlementCode,
): Promise<void> {
  const context = await loadTenantEntitlementContext(tenantId, database ?? db);
  if (!context) {
    throw createError(
      `Fitur ini memerlukan entitlement '${entitlementCode}'. Aktifkan dari Marketplace atau upgrade paket.`,
      403,
      'ENTITLEMENT_REQUIRED',
    );
  }
  try {
    await requireCatalogEntitlement({
      planCode: context.planCode,
      businessType: context.businessType,
      grants: context.grants,
      entitlementCode,
    });
  } catch {
    throw createError(
      `Fitur ini memerlukan entitlement '${entitlementCode}'. Aktifkan dari Marketplace atau upgrade paket.`,
      403,
      'ENTITLEMENT_REQUIRED',
    );
  }
}
