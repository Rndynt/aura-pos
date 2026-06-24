/**
 * Public Registration Routes
 * Tidak butuh auth / tenant context
 */

import { Router } from 'express';
import type { Request, Response } from 'express';
import { db, tenants } from '../../composition/modules/httpApplicationBoundaryModule';
import { eq } from 'drizzle-orm';
import {
  registerTenantOwner,
  RegistrationError,
  generateSlugFromBusinessName,
} from '../../services/registrationService';
import type { BusinessType } from '@pos/core';

const BASE_DOMAIN = process.env.BASE_DOMAIN || 'aurapos.my.id';

const RESERVED_SLUGS = new Set([
  'www','api','app','admin','mail','ftp','ssh','dev','staging','test','demo',
  'cdn','media','assets','static','dashboard','manage','account','auth',
  'login','register','signup','help','support','status','blog','docs',
]);

const SLUG_REGEX = /^[a-z0-9][a-z0-9-]{1,30}[a-z0-9]$/;

type RegistrationRouteDeps = {
  baseDomain?: string;
  checkSlugExists?: (slug: string) => Promise<boolean>;
  registerTenantOwner?: typeof registerTenantOwner;
};

function getRequestBody(req: Request) {
  const body = req.body ?? {};
  return {
    slug: body.slug,
    businessName: body.businessName ?? body.business_name ?? body.name,
    businessType: body.businessType ?? body.business_type ?? 'CAFE_RESTAURANT',
    ownerName: body.ownerName ?? body.owner_name,
    ownerEmail: body.ownerEmail ?? body.owner_email,
    ownerPassword: body.ownerPassword ?? body.owner_password,
    ownerUsername: body.ownerUsername ?? body.owner_username,
    timezone: body.timezone ?? 'Asia/Jakarta',
    currency: body.currency ?? 'IDR',
    locale: body.locale ?? 'id-ID',
  };
}

function sendRegistrationResult(res: Response, result: Awaited<ReturnType<typeof registerTenantOwner>>, baseDomain: string) {
  return res.status(201).json({
    success: true,
    tenant: result.tenant,
    defaultOutletId: result.defaultOutletId,
    featureCodes: result.featureCodes,
    orderTypeCodes: result.orderTypeCodes,
    catalogSeed: result.catalogSeed,
    message: `Tenant berhasil dibuat. Akses di: https://${result.tenant.slug}.${baseDomain}`,
  });
}

/**
 * Resolve a unique slug, adding a numeric suffix if the base slug is taken.
 * Falls back to a timestamp fragment after 99 attempts.
 */
async function resolveUniqueSlug(
  base: string,
  checkExists: (slug: string) => Promise<boolean>,
): Promise<string> {
  if (!RESERVED_SLUGS.has(base) && !(await checkExists(base))) return base;
  for (let i = 2; i <= 99; i++) {
    const candidate = `${base.slice(0, 26)}-${i}`;
    if (!RESERVED_SLUGS.has(candidate) && !(await checkExists(candidate))) return candidate;
  }
  return `${base.slice(0, 22)}-${Date.now().toString(36)}`;
}

export function createRegistrationRouter(deps: RegistrationRouteDeps = {}) {
  const router = Router();
  const baseDomain = deps.baseDomain ?? BASE_DOMAIN;
  const checkSlugExists = deps.checkSlugExists ?? (async (slug: string) => {
    const existing = await db.select().from(tenants).where(eq(tenants.slug, slug)).limit(1);
    return existing.length > 0;
  });
  const register = deps.registerTenantOwner ?? registerTenantOwner;

  // ── GET /api/register/check-slug/:slug ────────────────────────────────────────
  // Cek ketersediaan slug secara real-time (dipanggil dari form registrasi)
  router.get('/check-slug/:slug', async (req, res) => {
    const slug = req.params.slug.toLowerCase();

    if (!SLUG_REGEX.test(slug)) {
      return res.json({ available: false, reason: 'Format tidak valid. Gunakan huruf kecil, angka, dan tanda hubung.' });
    }
    if (RESERVED_SLUGS.has(slug)) {
      return res.json({ available: false, reason: 'Slug ini tidak tersedia.' });
    }

    if (await checkSlugExists(slug)) {
      return res.json({ available: false, reason: 'Slug sudah digunakan tenant lain.' });
    }

    return res.json({ available: true, url: `https://${slug}.${baseDomain}` });
  });

  // ── POST /api/register ────────────────────────────────────────────────────────
  // Daftarkan tenant baru + akun owner sekaligus. This is the canonical production
  // onboarding endpoint; /api/tenants/register is deprecated.
  //
  // `slug` is optional — if omitted it is auto-generated from `businessName`.
  router.post('/', async (req, res) => {
    const {
      slug: rawSlug,
      businessName,
      businessType,
      ownerName,
      ownerEmail,
      ownerPassword,
      ownerUsername,
      timezone,
      currency,
      locale,
    } = getRequestBody(req);

    // ── Validasi field wajib (slug sudah tidak wajib) ─────────────────────────
    const requiredFields = { businessName, ownerName, ownerEmail, ownerPassword, ownerUsername };
    const missing = Object.entries(requiredFields)
      .filter(([, value]) => !value)
      .map(([key]) => key);
    if (missing.length) {
      return res.status(400).json({ error: 'Missing fields', fields: missing });
    }

    // ── Resolve slug ─────────────────────────────────────────────────────────
    let normalSlug: string;

    if (rawSlug) {
      // Slug diberikan oleh user — validasi format + reserved + uniqueness
      normalSlug = String(rawSlug).toLowerCase();
      if (!SLUG_REGEX.test(normalSlug)) {
        return res.status(400).json({ error: 'Invalid slug format' });
      }
      if (RESERVED_SLUGS.has(normalSlug)) {
        return res.status(400).json({ error: 'Slug is reserved' });
      }
      if (await checkSlugExists(normalSlug)) {
        return res.status(409).json({ error: 'Slug already taken' });
      }
    } else {
      // Slug tidak diberikan — auto-generate dari businessName, pastikan unik
      const baseSlug = generateSlugFromBusinessName(businessName);
      normalSlug = await resolveUniqueSlug(baseSlug, checkSlugExists);
    }

    try {
      const result = await register({
        slug: normalSlug,
        businessName,
        businessType: businessType as BusinessType,
        ownerName,
        ownerEmail,
        ownerPassword,
        ownerUsername,
        timezone,
        currency,
        locale,
      });

      return sendRegistrationResult(res, result, baseDomain);
    } catch (err: any) {
      console.error('[register]', err);
      if (err instanceof RegistrationError) {
        return res.status(err.status).json({ error: err.message, code: err.code });
      }
      return res.status(500).json({ error: 'Internal server error' });
    }
  });

  return router;
}

export default createRegistrationRouter();
