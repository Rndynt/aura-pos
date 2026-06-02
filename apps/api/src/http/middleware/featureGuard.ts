/**
 * Feature & Module Guard Middleware
 * Protects API routes by checking tenant's active features and module configs.
 * Call requireFeature / requireModule before the route handler.
 *
 * Results are cached through the shared cache layer for 5 minutes per
 * tenant+key to avoid hitting the DB on every protected request. Call the
 * exported invalidate*Cache helpers when features/modules are toggled.
 */

import type { Request, Response, NextFunction } from 'express';
import { db } from '@pos/infrastructure/database';
import { tenantFeatures, tenantModuleConfigs } from '@shared/schema';
import { eq, and } from 'drizzle-orm';
import { cacheKeys, deleteCacheKey, deleteCachePattern, getCacheJson, setCacheJson } from '../../services/distributedCache';
import { invalidateFeatureAccessCache, invalidateModuleAccessCache } from '../../services/cacheInvalidation';

// ── Shared cache ─────────────────────────────────────────────────────────────

const CACHE_TTL_SECONDS = 5 * 60; // 5 minutes

// ── Cache invalidation ───────────────────────────────────────────────────────

/**
 * Invalidate cached feature state for a tenant.
 * Call when a feature is toggled on/off.
 * Pass featureCode to clear a single entry, or omit to clear all for the tenant.
 */
export function invalidateFeatureCache(tenantId: string, featureCode?: string): void {
  if (featureCode) {
    void deleteCacheKey(cacheKeys.feature(tenantId, featureCode));
  } else {
    void deleteCachePattern(cacheKeys.feature(tenantId, '*'));
  }
  void invalidateFeatureAccessCache(tenantId, featureCode);
}

/**
 * Invalidate cached module config for a tenant.
 * Call when a module is toggled on/off.
 * Pass moduleKey to clear a single entry, or omit to clear all for the tenant.
 */
export function invalidateModuleCache(tenantId: string, moduleKey?: string): void {
  if (moduleKey) {
    void deleteCacheKey(cacheKeys.module(tenantId, moduleKey));
  } else {
    void deleteCachePattern(cacheKeys.module(tenantId, '*'));
  }
  void invalidateModuleAccessCache(tenantId, moduleKey);
}

/**
 * Invalidate all guard caches for a tenant (features + modules).
 */
export function invalidateTenantCache(tenantId: string): void {
  invalidateFeatureCache(tenantId);
  invalidateModuleCache(tenantId);
}

// ── Middleware ────────────────────────────────────────────────────────────────

/**
 * Middleware: reject request with 403 if the tenant does not have the given feature active.
 * Usage: router.get('/variants', requireFeature('product_variants'), handler)
 */
export function requireFeature(featureCode: string) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const tenantId = req.tenantId;
    if (!tenantId) {
      res.status(403).json({ success: false, error: 'Tenant not identified', code: 'NO_TENANT' });
      return;
    }

    const cacheKey = cacheKeys.feature(tenantId, featureCode);

    // ── cache hit ────────────────────────────────────────────────────────
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
      });
      return;
    }

    // ── cache miss → DB query ────────────────────────────────────────────
    try {
      const rows = await db
        .select({ id: tenantFeatures.id })
        .from(tenantFeatures)
        .where(
          and(
            eq(tenantFeatures.tenantId, tenantId),
            eq(tenantFeatures.featureCode, featureCode),
            eq(tenantFeatures.isActive, true),
          ),
        )
        .limit(1);

      const isActive = rows.length > 0;
      await setCacheJson(cacheKey, isActive, CACHE_TTL_SECONDS);

      if (!isActive) {
        res.status(403).json({
          success: false,
          error: `Fitur '${featureCode}' tidak aktif untuk tenant ini.`,
          code: 'FEATURE_DISABLED',
          feature_code: featureCode,
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

/**
 * Middleware: reject request with 403 if the tenant does not have the given module enabled.
 * moduleKey should match the camelCase column name in tenant_module_configs
 * (e.g. 'enableKitchenTicket', 'enableTableManagement', 'enableInventory').
 */
export function requireModule(moduleKey: string) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const tenantId = req.tenantId;
    if (!tenantId) {
      res.status(403).json({ success: false, error: 'Tenant not identified', code: 'NO_TENANT' });
      return;
    }

    const cacheKey = cacheKeys.module(tenantId, moduleKey);

    // ── cache hit ────────────────────────────────────────────────────────
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
      });
      return;
    }

    // ── cache miss → DB query ────────────────────────────────────────────
    try {
      // Only select the specific module column instead of all columns (*)
      const table = tenantModuleConfigs as unknown as Record<string, unknown>;
      const col = table[moduleKey];

      if (!col) {
        // Unknown module key — treat as disabled
        await setCacheJson(cacheKey, false, CACHE_TTL_SECONDS);
        res.status(403).json({
          success: false,
          error: `Modul '${moduleKey}' tidak aktif untuk tenant ini.`,
          code: 'MODULE_DISABLED',
          module_key: moduleKey,
        });
        return;
      }

      const rows = await db
        .select({ [moduleKey]: col as any })
        .from(tenantModuleConfigs)
        .where(eq(tenantModuleConfigs.tenantId, tenantId))
        .limit(1);

      const row = rows[0] as Record<string, unknown> | undefined;
      const isEnabled = !!row?.[moduleKey];

      await setCacheJson(cacheKey, isEnabled, CACHE_TTL_SECONDS);

      if (!isEnabled) {
        res.status(403).json({
          success: false,
          error: `Modul '${moduleKey}' tidak aktif untuk tenant ini.`,
          code: 'MODULE_DISABLED',
          module_key: moduleKey,
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
