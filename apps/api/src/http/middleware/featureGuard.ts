/**
 * Entitlement guard middleware.
 *
 * Legacy tenant feature/module tables were removed in Entitlement Phase 2. These
 * guards now translate any remaining legacy route guard keys to commercial
 * entitlement codes and evaluate access through the entitlement engine.
 */

import { Request, Response, NextFunction } from 'express';
import {
  ENTITLEMENT_CATALOG,
  hasEntitlement,
  type BusinessTypeCode,
  type EntitlementCode,
  type PlanCode,
  type TenantEntitlementGrant,
} from '@pos/application/entitlements';
import { and, eq, gt, isNull, or } from 'drizzle-orm';
import { tenantEntitlements, tenants } from '@pos/infrastructure/db/schema';
import { db } from '@pos/infrastructure/database';
import { getCacheJson, setCacheJson, deleteCacheKey, deleteCachePattern } from '../../services/distributedCache';
import {
  invalidateFeatureAccessCache,
  invalidateModuleAccessCache,
} from '../../services/cacheInvalidation';

const CACHE_TTL_SECONDS = 60;

const cacheKeys = {
  feature: (tenantId: string, featureCode: string) => `feature:${tenantId}:${featureCode}`,
  module: (tenantId: string, moduleKey: string) => `module:${tenantId}:${moduleKey}`,
};

const DEFAULT_PLAN: PlanCode = 'starter';
const DEFAULT_BUSINESS_TYPE: BusinessTypeCode = 'CAFE_RESTAURANT';

const LEGACY_FEATURE_TO_ENTITLEMENT: Record<string, EntitlementCode> = {
  partial_payment: 'payments_partial_payment',
  order_queue: 'orders_queue',
  kitchen_ticket: 'restaurant_kitchen_ops',
  kitchen_display: 'restaurant_kitchen_ops',
  kitchen_printer: 'restaurant_kitchen_ops',
  inventory_tracking: 'inventory_advanced_stock',
  inventory_reports: 'inventory_advanced_stock',
  analytics_dashboard: 'reports_advanced',
  label_printer: 'hardware_label_printer',
  barcode_scanner: 'hardware_barcode_scanner',
  accounting_sync: 'integrations_accounting',
  payment_gateway: 'integrations_payment_gateway',
  api_integration: 'integrations_api_access',
};

const LEGACY_MODULE_TO_ENTITLEMENT: Record<string, EntitlementCode> = {
  enableTableManagement: 'restaurant_table_service',
  enableKitchenTicket: 'restaurant_kitchen_ops',
  enableMultiLocation: 'multi_location',
};

function toPlanCode(planTier: string | null | undefined): PlanCode {
  if (planTier === 'starter' || planTier === 'growth' || planTier === 'pro') return planTier;
  if (planTier === 'free') return 'starter';
  return DEFAULT_PLAN;
}

function toBusinessTypeCode(businessType: string | null | undefined): BusinessTypeCode {
  if (businessType && businessType in ENTITLEMENT_CATALOG.businessTypes) {
    return businessType as BusinessTypeCode;
  }
  return DEFAULT_BUSINESS_TYPE;
}

function toEntitlementCode(code: string): EntitlementCode | null {
  if (code in ENTITLEMENT_CATALOG.entitlements) return code as EntitlementCode;
  return LEGACY_FEATURE_TO_ENTITLEMENT[code] ?? LEGACY_MODULE_TO_ENTITLEMENT[code] ?? null;
}

async function tenantHasEntitlement(tenantId: string, entitlementCode: EntitlementCode): Promise<boolean> {
  const [tenant] = await db
    .select({ planTier: tenants.planTier, businessType: tenants.businessType })
    .from(tenants)
    .where(eq(tenants.id, tenantId))
    .limit(1);

  if (!tenant) return false;

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

  return hasEntitlement({
    planCode: toPlanCode(tenant.planTier),
    businessType: toBusinessTypeCode(tenant.businessType),
    entitlementCode,
    grants: grants.map((grant): TenantEntitlementGrant => ({
      entitlementCode: grant.entitlementCode,
      status: grant.status as TenantEntitlementGrant['status'],
      expiresAt: grant.expiresAt,
      source: grant.source as TenantEntitlementGrant['source'],
    })),
  });
}

export function invalidateFeatureCache(tenantId: string, featureCode?: string): void {
  if (featureCode) {
    void deleteCacheKey(cacheKeys.feature(tenantId, featureCode));
  } else {
    void deleteCachePattern(cacheKeys.feature(tenantId, '*'));
  }
  void invalidateFeatureAccessCache(tenantId, featureCode);
}

export function invalidateModuleCache(tenantId: string, moduleKey?: string): void {
  if (moduleKey) {
    void deleteCacheKey(cacheKeys.module(tenantId, moduleKey));
  } else {
    void deleteCachePattern(cacheKeys.module(tenantId, '*'));
  }
  void invalidateModuleAccessCache(tenantId, moduleKey);
}

export function invalidateTenantCache(tenantId: string): void {
  invalidateFeatureCache(tenantId);
  invalidateModuleCache(tenantId);
}

export function requireFeature(featureCode: string) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const tenantId = req.tenantId;
    if (!tenantId) {
      res.status(403).json({ success: false, error: 'Tenant not identified', code: 'NO_TENANT' });
      return;
    }

    const entitlementCode = toEntitlementCode(featureCode);
    if (!entitlementCode) {
      res.status(403).json({
        success: false,
        error: `Fitur '${featureCode}' tidak aktif untuk tenant ini.`,
        code: 'FEATURE_DISABLED',
        feature_code: featureCode,
      });
      return;
    }

    const cacheKey = cacheKeys.feature(tenantId, featureCode);
    const cached = await getCacheJson<boolean>(cacheKey);
    if (cached === true) {
      next();
      return;
    }
    if (cached === false) {
      res.status(403).json({
        success: false,
        error: `Fitur '${featureCode}' tidak aktif untuk tenant ini.`,
        code: 'FEATURE_DISABLED',
        feature_code: featureCode,
        entitlement_code: entitlementCode,
      });
      return;
    }

    try {
      const isActive = await tenantHasEntitlement(tenantId, entitlementCode);
      await setCacheJson(cacheKey, isActive, CACHE_TTL_SECONDS);
      if (!isActive) {
        res.status(403).json({
          success: false,
          error: `Fitur '${featureCode}' tidak aktif untuk tenant ini.`,
          code: 'FEATURE_DISABLED',
          feature_code: featureCode,
          entitlement_code: entitlementCode,
        });
        return;
      }
      next();
    } catch (err) {
      console.error('[featureGuard] requireFeature error:', err);
      next(err);
    }
  };
}

export function requireModule(moduleKey: string) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const tenantId = req.tenantId;
    if (!tenantId) {
      res.status(403).json({ success: false, error: 'Tenant not identified', code: 'NO_TENANT' });
      return;
    }

    const entitlementCode = toEntitlementCode(moduleKey);
    if (!entitlementCode) {
      res.status(403).json({
        success: false,
        error: `Modul '${moduleKey}' tidak aktif untuk tenant ini.`,
        code: 'MODULE_DISABLED',
        module_key: moduleKey,
      });
      return;
    }

    const cacheKey = cacheKeys.module(tenantId, moduleKey);
    const cached = await getCacheJson<boolean>(cacheKey);
    if (cached === true) {
      next();
      return;
    }
    if (cached === false) {
      res.status(403).json({
        success: false,
        error: `Modul '${moduleKey}' tidak aktif untuk tenant ini.`,
        code: 'MODULE_DISABLED',
        module_key: moduleKey,
        entitlement_code: entitlementCode,
      });
      return;
    }

    try {
      const isEnabled = await tenantHasEntitlement(tenantId, entitlementCode);
      await setCacheJson(cacheKey, isEnabled, CACHE_TTL_SECONDS);
      if (!isEnabled) {
        res.status(403).json({
          success: false,
          error: `Modul '${moduleKey}' tidak aktif untuk tenant ini.`,
          code: 'MODULE_DISABLED',
          module_key: moduleKey,
          entitlement_code: entitlementCode,
        });
        return;
      }
      next();
    } catch (err) {
      console.error('[featureGuard] requireModule error:', err);
      next(err);
    }
  };
}
