import { Request, Response, NextFunction } from 'express';
import { db } from '@pos/infrastructure/database';
import { tenants } from '@shared/schema';
import { eq, or } from 'drizzle-orm';

declare global {
  namespace Express {
    interface Request {
      tenantId?: string;
      tenantSlug?: string;
    }
  }
}

const BASE_DOMAIN = process.env.BASE_DOMAIN || 'aurapos.my.id';

const RESERVED_SLUGS = new Set([
  'www','api','app','admin','mail','ftp','ssh','dev','staging','test','demo',
  'cdn','media','assets','static','dashboard','manage','account','auth',
  'login','register','signup','help','support','status','blog','docs',
]);

function extractSlugFromHost(hostname: string): string | null {
  const host = (hostname || '').split(':')[0];
  if (!host.endsWith(`.${BASE_DOMAIN}`)) return null;
  const slug = host.slice(0, -(BASE_DOMAIN.length + 1));
  if (!slug || RESERVED_SLUGS.has(slug)) return null;
  return slug;
}

// ── In-memory tenant cache (TTL: 60s) ────────────────────────────────────────
// Reduces DB queries on every request. Entries are invalidated on tenant update.
interface TenantCacheEntry {
  id: string;
  slug: string;
  isActive: boolean;
  ts: number;
}

const tenantCache = new Map<string, TenantCacheEntry>();
const TENANT_CACHE_TTL = 60_000; // 60 seconds

function getCachedTenant(key: string): TenantCacheEntry | null {
  const entry = tenantCache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.ts > TENANT_CACHE_TTL) {
    tenantCache.delete(key);
    return null;
  }
  return entry;
}

function setCachedTenant(key: string, entry: TenantCacheEntry): void {
  // Cap cache size to prevent memory leaks
  if (tenantCache.size > 1000) {
    const oldest = tenantCache.keys().next().value;
    if (oldest) tenantCache.delete(oldest);
  }
  tenantCache.set(key, entry);
}

/** Call this after updating a tenant to invalidate cache */
export function invalidateTenantCache(slugOrId: string): void {
  tenantCache.delete(slugOrId);
}

export async function tenantMiddleware(
  req: Request, res: Response, next: NextFunction,
): Promise<void> {
  try {
    const hostname =
      (req.headers['x-forwarded-host'] as string)?.split(',')[0]?.trim() ||
      req.hostname ||
      (req.headers.host as string) || '';

    const slug = extractSlugFromHost(hostname);

    // ── 1. Subdomain: {slug}.aurapos.my.id ───────────────────────────────────
    if (slug) {
      const cached = getCachedTenant(slug);
      if (cached) {
        if (!cached.isActive) { res.status(403).json({ error: 'Tenant inactive' }); return; }
        req.tenantId = cached.id;
        req.tenantSlug = slug;
        return next();
      }

      const rows = await db.select({ id: tenants.id, slug: tenants.slug, isActive: tenants.isActive }).from(tenants).where(eq(tenants.slug, slug)).limit(1);
      if (!rows.length) { res.status(404).json({ error: 'Tenant not found', slug }); return; }
      if (!rows[0].isActive) { res.status(403).json({ error: 'Tenant inactive' }); return; }

      setCachedTenant(slug, { id: rows[0].id, slug: rows[0].slug, isActive: rows[0].isActive, ts: Date.now() });
      setCachedTenant(rows[0].id, { id: rows[0].id, slug: rows[0].slug, isActive: rows[0].isActive, ts: Date.now() });

      req.tenantId = rows[0].id;
      req.tenantSlug = slug;
      return next();
    }

    // ── 2. Header / query fallback (dev, API client) ─────────────────────────
    const allowTenantHeader = process.env.ALLOW_TENANT_HEADER !== 'false';

    const tenantId = allowTenantHeader
      ? (req.headers['x-tenant-id'] as string) || (req.query.tenant_id as string)
      : (req.query.tenant_id as string);

    if (!tenantId) {
      res.status(400).json({ error: 'Missing tenant', message: 'Use {slug}.aurapos.my.id or provide x-tenant-id header' });
      return;
    }

    const cached = getCachedTenant(tenantId);
    if (cached) {
      if (!cached.isActive) { res.status(403).json({ error: 'Tenant inactive' }); return; }
      req.tenantId = cached.id;
      req.tenantSlug = cached.slug;
      return next();
    }

    const rows = await db.select({ id: tenants.id, slug: tenants.slug, isActive: tenants.isActive }).from(tenants)
      .where(or(eq(tenants.id, tenantId), eq(tenants.slug, tenantId))).limit(1);

    if (!rows.length) { res.status(404).json({ error: 'Tenant not found' }); return; }
    if (!rows[0].isActive) { res.status(403).json({ error: 'Tenant inactive' }); return; }

    setCachedTenant(tenantId, { id: rows[0].id, slug: rows[0].slug, isActive: rows[0].isActive, ts: Date.now() });
    setCachedTenant(rows[0].id, { id: rows[0].id, slug: rows[0].slug, isActive: rows[0].isActive, ts: Date.now() });

    req.tenantId = rows[0].id;
    req.tenantSlug = rows[0].slug;
    next();
  } catch (err) {
    console.error('Tenant middleware error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
}
