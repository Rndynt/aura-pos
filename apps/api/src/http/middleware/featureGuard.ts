/**
 * Feature & Module Guard Middleware
 * Protects API routes by checking tenant's active features and module configs.
 * Call requireFeature / requireModule before the route handler.
 *
 * Results are cached in-memory for 5 minutes per tenant+key to avoid
 * hitting the DB on every protected request.  Call the exported
 * invalidate*Cache helpers when features/modules are toggled.
 */

import type { Request, Response, NextFunction } from 'express';
import { db } from '@pos/infrastructure/database';
import { tenantFeatures, tenantModuleConfigs } from '@shared/schema';
import { eq, and } from 'drizzle-orm';

// ── In-memory cache ──────────────────────────────────────────────────────────

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

const featureCache = new Map<string, CacheEntry<boolean>>();
const moduleCache = new Map<string, CacheEntry<boolean>>();

function cacheGet<T>(map: Map<string, CacheEntry<T>>, key: string): T | undefined {
  const entry = map.get(key);
  if (!entry) return undefined;
  if (Date.now() > entry.expiresAt) {
    map.delete(key);
    return undefined;
  }
  return entry.value;
}

function cacheSet<T>(map: Map<string, CacheEntry<T>>, key: string, value: T): void {
  map.set(key, { value, expiresAt: Date.now() + CACHE_TTL_MS });
}

// ── Cache invalidation ───────────────────────────────────────────────────────

/**
 * Invalidate cached feature state for a tenant.
 * Call when a feature is toggled on/off.
 * Pass featureCode to clear a single entry, or omit to clear all for the tenant.
 */
export function invalidateFeatureCache(tenantId: string, featureCode?: string): void {
  if (featureCode) {
    featureCache.delete(`${tenantId}:${featureCode}`);
  } else {
    const prefix = `${tenantId}:`;
    for (const key of Array.from(featureCache.keys())) {
      if (key.startsWith(prefix)) {
        featureCache.delete(key);
      }
    }
  }
}

/**
 * Invalidate cached module config for a tenant.
 * Call when a module is toggled on/off.
 * Pass moduleKey to clear a single entry, or omit to clear all for the tenant.
 */
export function invalidateModuleCache(tenantId: string, moduleKey?: string): void {
  if (moduleKey) {
    moduleCache.delete(`${tenantId}:${moduleKey}`);
  } else {
    const prefix = `${tenantId}:`;
    for (const key of Array.from(moduleCache.keys())) {
      if (key.startsWith(prefix)) {
        moduleCache.delete(key);
      }
    }
  }
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

    const cacheKey = `${tenantId}:${featureCode}`;

    // ── cache hit ────────────────────────────────────────────────────────
    const cached = cacheGet(featureCache, cacheKey);
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
      cacheSet(featureCache, cacheKey, isActive);

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

    const cacheKey = `${tenantId}:${moduleKey}`;

    // ── cache hit ────────────────────────────────────────────────────────
    const cached = cacheGet(moduleCache, cacheKey);
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
        cacheSet(moduleCache, cacheKey, false);
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

      cacheSet(moduleCache, cacheKey, isEnabled);

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
