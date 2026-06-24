/**
 * Tenants Routes
 * Tenant feature management endpoints
 */

import { Router, type RequestHandler } from 'express';
import * as TenantsController from '../controllers/TenantsController';
import { db, tenants } from '../../composition/modules/httpApplicationBoundaryModule';
import { eq } from 'drizzle-orm';

export interface TenantsRouterDependencies {
  getTenantBySlug: RequestHandler;
  registerTenant: RequestHandler;
  getTenantProfile: RequestHandler;
  getTenantEntitlements: RequestHandler;
}

export function createTenantsRouter(deps: TenantsRouterDependencies): Router {
  const router = Router();

  // GET /api/tenants/by-slug/:slug — PUBLIC, no tenant middleware
  // Frontend pakai ini untuk resolve tenantId dari subdomain
  router.get('/by-slug/:slug', deps.getTenantBySlug);

  // POST /api/tenants/register - Deprecated; use POST /api/register
  router.post('/register', deps.registerTenant);

  // GET /api/tenants/profile - Tenant profile + effective entitlements + catalog
  router.get('/profile', deps.getTenantProfile);

  // GET /api/tenants/entitlements - Effective entitlement map only
  router.get('/entitlements', deps.getTenantEntitlements);

  return router;
}

export const getTenantBySlug: RequestHandler = async (req, res) => {
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
};

const defaultTenantsRouter = createTenantsRouter({
  getTenantBySlug,
  registerTenant: TenantsController.registerTenant,
  getTenantProfile: TenantsController.getTenantProfile,
  getTenantEntitlements: TenantsController.getTenantEntitlements,
});
export default defaultTenantsRouter;
