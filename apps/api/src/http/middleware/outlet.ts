import { logger } from '../../bootstrap/logging';
import { Request, Response, NextFunction } from 'express';
import { AssertOutletAccess, ResolveOutletContext } from '@pos/application/tenant-context';
import type { TenantContextRepositoryPort } from '@pos/application/tenant-context';
import { DrizzleTenantContextRepository } from '@pos/infrastructure/repositories/tenant-context';

declare global {
  namespace Express {
    interface Request {
      outletId?: string;
    }
  }
}

// ── In-memory outlet cache (TTL: 60s) ───────────────────────────────────────
interface OutletCacheEntry {
  id: string;
  ts: number;
}

const outletCache = new Map<string, OutletCacheEntry>();
const OUTLET_CACHE_TTL = 60_000;

function getCachedOutlet(key: string): OutletCacheEntry | null {
  const entry = outletCache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.ts > OUTLET_CACHE_TTL) {
    outletCache.delete(key);
    return null;
  }
  return entry;
}

function setCachedOutlet(key: string, entry: OutletCacheEntry): void {
  if (outletCache.size > 2000) {
    const oldest = outletCache.keys().next().value;
    if (oldest) outletCache.delete(oldest);
  }
  outletCache.set(key, entry);
}

export function invalidateOutletCache(key: string): void {
  outletCache.delete(key);
}

/**
 * Resolves the active outlet for the current request.
 * Priority: x-outlet-id header → ?outlet_id query param → tenant's default outlet
 * Uses in-memory cache (60s TTL) to avoid DB query on every request.
 */
type OutletMiddlewareDeps = {
  repository?: TenantContextRepositoryPort;
};

export function createOutletMiddleware(deps: OutletMiddlewareDeps = {}) {
  const repository = deps.repository ?? new DrizzleTenantContextRepository();
  const resolveOutlet = new ResolveOutletContext(repository);
  const assertOutletAccess = new AssertOutletAccess(repository);

  return async function outletMiddleware(
    req: Request, res: Response, next: NextFunction,
  ): Promise<void> {
    try {
      const tenantId = req.tenantId;
      if (!tenantId) {
        return next();
      }

      const outletIdParam =
        (req.headers['x-outlet-id'] as string) ||
        (req.query.outlet_id as string);

      let resolvedOutletId: string | null = null;

      if (outletIdParam) {
        const cacheKey = `${tenantId}:${outletIdParam}`;
        const cached = getCachedOutlet(cacheKey);
        if (cached) {
          resolvedOutletId = cached.id;
        } else {
          const outlet = await resolveOutlet.execute({ tenantId, outletId: outletIdParam });

          if (outlet) {
            setCachedOutlet(cacheKey, { id: outlet.id, ts: Date.now() });
            resolvedOutletId = outlet.id;
          }
        }
      }

      if (!resolvedOutletId) {
        // Default outlet — cache by tenantId
        const defaultCacheKey = `${tenantId}:default`;
        const cachedDefault = getCachedOutlet(defaultCacheKey);
        if (cachedDefault) {
          resolvedOutletId = cachedDefault.id;
        } else {
          const defaultOutlet = await resolveOutlet.execute({ tenantId });

          if (defaultOutlet) {
            setCachedOutlet(defaultCacheKey, { id: defaultOutlet.id, ts: Date.now() });
            resolvedOutletId = defaultOutlet.id;
          }
        }
      }

      if (resolvedOutletId) {
        const allowed = await assertOutletAccess.execute({ userId: req.authTenantUser?.id, role: req.authTenantUser?.role, outletId: resolvedOutletId });
        if (!allowed) {
          res.status(403).json({
            error: 'Forbidden',
            message: 'Authenticated non-owner user is not assigned to the requested outlet',
            code: 'OUTLET_ACCESS_DENIED',
          });
          return;
        }
        req.outletId = resolvedOutletId;
      }

      next();
    } catch (err) {
      logger.error('Outlet middleware error:', err);
      next();
    }
  };
}

export const outletMiddleware = createOutletMiddleware();
