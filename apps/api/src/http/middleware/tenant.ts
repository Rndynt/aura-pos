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

export async function tenantMiddleware(
  req: Request, res: Response, next: NextFunction,
): Promise<void> {
  try {
    // req.hostname sudah handle x-forwarded-host jika trust proxy = true
    // Tapi kita juga cek manual sebagai fallback
    const hostname =
      (req.headers['x-forwarded-host'] as string)?.split(',')[0]?.trim() ||
      req.hostname ||
      (req.headers.host as string) || '';

    // ── 1. Subdomain: {slug}.aurapos.my.id ───────────────────────────────────
    const slug = extractSlugFromHost(hostname);
    if (slug) {
      const rows = await db.select().from(tenants).where(eq(tenants.slug, slug)).limit(1);
      if (!rows.length) { res.status(404).json({ error: 'Tenant not found', slug }); return; }
      if (!rows[0].isActive) { res.status(403).json({ error: 'Tenant inactive' }); return; }
      req.tenantId = rows[0].id;
      req.tenantSlug = slug;
      return next();
    }

    // ── 2. Header / query fallback (dev, API client) ─────────────────────────
    const tenantId =
      (req.headers['x-tenant-id'] as string) ||
      (req.query.tenant_id as string);

    if (!tenantId) {
      res.status(400).json({ error: 'Missing tenant', message: 'Use {slug}.aurapos.my.id or provide x-tenant-id header' });
      return;
    }

    const rows = await db.select().from(tenants)
      .where(or(eq(tenants.id, tenantId), eq(tenants.slug, tenantId))).limit(1);

    if (!rows.length) { res.status(404).json({ error: 'Tenant not found' }); return; }
    if (!rows[0].isActive) { res.status(403).json({ error: 'Tenant inactive' }); return; }

    req.tenantId = rows[0].id;
    req.tenantSlug = rows[0].slug;
    next();
  } catch (err) {
    console.error('Tenant middleware error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
}
