/**
 * Public Registration Routes
 * Tidak butuh auth / tenant context
 */

import { Router } from 'express';
import { db } from '@pos/infrastructure/database';
import { tenants } from '@shared/schema';
import { eq } from 'drizzle-orm';
import { auth } from '../../lib/auth';
import { sql } from 'drizzle-orm';
import { authDb } from '../../lib/auth';

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
    // 1. Buat tenant
    const [tenant] = await db.insert(tenants).values({
      id: crypto.randomUUID(),
      name: businessName,
      slug: normalSlug,
      businessName,
      businessType,
      planTier: 'free',
      subscriptionStatus: 'active',
      timezone,
      currency,
      locale,
      isActive: true,
    }).returning();

    // 2. Buat akun owner via Better Auth
    const signUpRes = await auth.api.signUpEmail({
      body: {
        name: ownerName,
        email: ownerEmail,
        username: ownerUsername,
        password: ownerPassword,
      },
    });

    if (!signUpRes?.user?.id) {
      // Rollback tenant jika sign-up gagal
      await db.delete(tenants).where(eq(tenants.id, tenant.id));
      return res.status(400).json({ error: 'Failed to create owner account', detail: signUpRes });
    }

    // 3. Link owner ke tenant
    await authDb.execute(
      sql`UPDATE "user" SET tenant_id = ${tenant.id}, role = 'owner' WHERE id = ${signUpRes.user.id}`
    );

    return res.status(201).json({
      success: true,
      tenant: {
        id: tenant.id,
        slug: tenant.slug,
        name: tenant.name,
        url: `https://${tenant.slug}.${BASE_DOMAIN}`,
      },
      message: `Tenant berhasil dibuat. Akses di: https://${tenant.slug}.${BASE_DOMAIN}`,
    });
  } catch (err: any) {
    console.error('[register]', err);
    // Handle duplicate email dari Better Auth
    if (err?.message?.includes('email') || err?.message?.includes('unique')) {
      return res.status(409).json({ error: 'Email sudah terdaftar' });
    }
    return res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
