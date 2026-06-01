import { Request, Response, NextFunction } from 'express';
import { db } from '@pos/infrastructure/database';
import { outlets } from '@shared/schema';
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
export async function outletMiddleware(
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

    if (outletIdParam) {
      const cacheKey = `${tenantId}:${outletIdParam}`;
      const cached = getCachedOutlet(cacheKey);
      if (cached) {
        req.outletId = cached.id;
        return next();
      }

      const rows = await db
        .select({ id: outlets.id })
        .from(outlets)
        .where(and(eq(outlets.tenantId, tenantId), eq(outlets.id, outletIdParam), eq(outlets.isActive, true)))
        .limit(1);

      if (rows.length) {
        setCachedOutlet(cacheKey, { id: rows[0].id, ts: Date.now() });
        req.outletId = rows[0].id;
        return next();
      }
    }

    // Default outlet — cache by tenantId
    const defaultCacheKey = `${tenantId}:default`;
    const cachedDefault = getCachedOutlet(defaultCacheKey);
    if (cachedDefault) {
      req.outletId = cachedDefault.id;
      return next();
    }

    const defaultRows = await db
      .select({ id: outlets.id })
      .from(outlets)
      .where(and(eq(outlets.tenantId, tenantId), eq(outlets.isDefault, true), eq(outlets.isActive, true)))
      .limit(1);

    if (defaultRows.length) {
      setCachedOutlet(defaultCacheKey, { id: defaultRows[0].id, ts: Date.now() });
      req.outletId = defaultRows[0].id;
    }

    next();
  } catch (err) {
    console.error('Outlet middleware error:', err);
    next();
  }
}
