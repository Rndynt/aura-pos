import { Request, Response, NextFunction } from 'express';
import { db } from '@pos/infrastructure/database';
import { outlets, userOutletAssignments } from '@shared/schema';
import { eq, and } from 'drizzle-orm';

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
type OutletDb = typeof db;

type OutletMiddlewareDeps = {
  db?: OutletDb;
};

function isOutletRestrictedRole(role: string | null | undefined): boolean {
  return role !== 'owner' && role !== 'platform-admin';
}

async function assertUserCanAccessOutlet(
  req: Request,
  res: Response,
  database: OutletDb,
  outletId: string,
): Promise<boolean> {
  const user = req.authTenantUser;

  // Public/device/service-token requests either have their own auth mechanism or
  // are guarded at the route level. Only authenticated POS users are assignment
  // checked here.
  if (!user?.id || !isOutletRestrictedRole(user.role)) {
    return true;
  }

  const rows = await database
    .select({ id: userOutletAssignments.id })
    .from(userOutletAssignments)
    .where(and(
      eq(userOutletAssignments.userId, user.id),
      eq(userOutletAssignments.outletId, outletId),
      eq(userOutletAssignments.isActive, true),
    ))
    .limit(1);

  if (rows.length > 0) {
    return true;
  }

  res.status(403).json({
    error: 'Forbidden',
    message: 'Authenticated non-owner user is not assigned to the requested outlet',
    code: 'OUTLET_ACCESS_DENIED',
  });
  return false;
}

export function createOutletMiddleware(deps: OutletMiddlewareDeps = {}) {
  const database = deps.db ?? db;

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
          const rows = await database
            .select({ id: outlets.id })
            .from(outlets)
            .where(and(eq(outlets.tenantId, tenantId), eq(outlets.id, outletIdParam), eq(outlets.isActive, true)))
            .limit(1);

          if (rows.length) {
            setCachedOutlet(cacheKey, { id: rows[0].id, ts: Date.now() });
            resolvedOutletId = rows[0].id;
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
          const defaultRows = await database
            .select({ id: outlets.id })
            .from(outlets)
            .where(and(eq(outlets.tenantId, tenantId), eq(outlets.isDefault, true), eq(outlets.isActive, true)))
            .limit(1);

          if (defaultRows.length) {
            setCachedOutlet(defaultCacheKey, { id: defaultRows[0].id, ts: Date.now() });
            resolvedOutletId = defaultRows[0].id;
          }
        }
      }

      if (resolvedOutletId) {
        const allowed = await assertUserCanAccessOutlet(req, res, database, resolvedOutletId);
        if (!allowed) return;
        req.outletId = resolvedOutletId;
      }

      next();
    } catch (err) {
      console.error('Outlet middleware error:', err);
      next();
    }
  };
}

export const outletMiddleware = createOutletMiddleware();
