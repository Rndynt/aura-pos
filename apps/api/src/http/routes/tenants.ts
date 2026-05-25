/**
 * Tenants Routes
 * Tenant feature management endpoints
 */

import { Router } from 'express';
import * as TenantsController from '../controllers/TenantsController';
import { db } from '@pos/infrastructure/database';
import { tenants } from '@shared/schema';
import { eq } from 'drizzle-orm';

const router = Router();

// GET /api/tenants/by-slug/:slug — PUBLIC, no tenant middleware
// Frontend pakai ini untuk resolve tenantId dari subdomain
router.get('/by-slug/:slug', async (req, res) => {
  try {
    const rows = await db.select({
      id: tenants.id, name: tenants.name, slug: tenants.slug,
      businessName: tenants.businessName, businessType: tenants.businessType,
      currency: tenants.currency, timezone: tenants.timezone, locale: tenants.locale,
    }).from(tenants).where(eq(tenants.slug, req.params.slug)).limit(1);

    if (!rows.length) return res.status(404).json({ error: 'Tenant not found' });
    return res.json({ success: true, data: rows[0] });
  } catch (err) {
    console.error('[by-slug]', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/tenants/register - Create new tenant with business type
router.post('/register', TenantsController.registerTenant);

// GET /api/tenants/profile - Get tenant profile with modules
router.get('/profile', TenantsController.getTenantProfile);

// GET /api/tenants/features - Get active features
router.get('/features', TenantsController.getActiveFeatures);

// PATCH /api/tenants/modules - Update module config flags
router.patch('/modules', TenantsController.updateModuleConfig);

// PATCH /api/tenants/plan - Switch subscription plan tier + sync plan_default features
router.patch('/plan', TenantsController.updatePlanTier);

// POST /api/tenants/features/toggle - Toggle a single feature on/off
router.post('/features/toggle', TenantsController.toggleFeature);

// POST /api/tenants/features/check - Check feature access
router.post('/features/check', TenantsController.checkFeatureAccess);

export default router;
