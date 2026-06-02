/**
 * Public Registration Routes
 * Tidak butuh auth / tenant context
 */

import { Router } from 'express';
import { db } from '@pos/infrastructure/database';
import { tenants } from '@shared/schema';
import { eq } from 'drizzle-orm';
import { registerTenantOwner, RegistrationError } from '../../services/registrationService';
import type { BusinessType } from '@pos/core';

const router = Router();

const BASE_DOMAIN = process.env.BASE_DOMAIN || 'aurapos.my.id';

const RESERVED_SLUGS = new Set([
  'www','api','app','admin','mail','ftp','ssh','dev','staging','test','demo',
  'cdn','media','assets','static','dashboard','manage','account','auth',
  'login','register','signup','help','support','status','blog','docs',
]);

const SLUG_REGEX = /^[a-z0-9][a-z0-9-]{1,30}[a-z0-9]$/;

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

  const existing = await db.select().from(tenants).where(eq(tenants.slug, slug)).limit(1);
  if (existing.length) {
    return res.json({ available: false, reason: 'Slug sudah digunakan tenant lain.' });
  }

  return res.json({ available: true, url: `https://${slug}.${BASE_DOMAIN}` });
});

// ── POST /api/register ────────────────────────────────────────────────────────
// Daftarkan tenant baru + akun owner sekaligus
router.post('/', async (req, res) => {
  const {
    slug,
    businessName,
    businessType = 'CAFE_RESTAURANT',
    ownerName,
    ownerEmail,
    ownerPassword,
    ownerUsername,
    timezone = 'Asia/Jakarta',
    currency = 'IDR',
    locale = 'id-ID',
  } = req.body;

  // ── Validasi ──────────────────────────────────────────────────────────────
  const missing = ['slug','businessName','ownerName','ownerEmail','ownerPassword','ownerUsername']
    .filter(k => !req.body[k]);
  if (missing.length) {
    return res.status(400).json({ error: 'Missing fields', fields: missing });
  }

  const normalSlug = slug.toLowerCase();
  if (!SLUG_REGEX.test(normalSlug)) {
    return res.status(400).json({ error: 'Invalid slug format' });
  }
  if (RESERVED_SLUGS.has(normalSlug)) {
    return res.status(400).json({ error: 'Slug is reserved' });
  }

  const existing = await db.select().from(tenants).where(eq(tenants.slug, normalSlug)).limit(1);
  if (existing.length) {
    return res.status(409).json({ error: 'Slug already taken' });
  }

  try {
    const result = await registerTenantOwner({
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

    return res.status(201).json({
      success: true,
      tenant: result.tenant,
      defaultOutletId: result.defaultOutletId,
      message: `Tenant berhasil dibuat. Akses di: https://${result.tenant.slug}.${BASE_DOMAIN}`,
    });
  } catch (err: any) {
    console.error('[register]', err);
    if (err instanceof RegistrationError) {
      return res.status(err.status).json({ error: err.message, code: err.code });
    }
    return res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
