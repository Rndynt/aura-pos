/**
 * Tenants Routes
 * Tenant feature management endpoints
 */

import { Router, type RequestHandler } from 'express';
import * as TenantsController from '../controllers/TenantsController';
import { container } from '../../container';

export interface TenantsRouterDependencies {
  getTenantBySlug: RequestHandler;
  registerTenant: RequestHandler;
  getTenantProfile: RequestHandler;
  getTenantEntitlements: RequestHandler;
  updateTenantProfile: RequestHandler;
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

  // PATCH /api/tenants/profile - Update tenant profile fields
  router.patch('/profile', deps.updateTenantProfile);

  // GET /api/tenants/entitlements - Effective entitlement map only
  router.get('/entitlements', deps.getTenantEntitlements);

  return router;
}

export const getTenantBySlug: RequestHandler = async (req, res) => {
  try {
    const tenant = await container.httpRouteQueries.getTenantBySlug(req.params.slug);

    if (!tenant) return res.status(404).json({ error: 'Tenant not found' });
    return res.json({ success: true, data: tenant });
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
  updateTenantProfile: TenantsController.updateTenantProfile,
});
export default defaultTenantsRouter;
