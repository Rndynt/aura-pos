import { Router, type RequestHandler } from 'express';
import type { ApiConfig } from '../../bootstrap/env';
import type { AppContainer } from '../../composition/createAppContainer';
import * as TenantsController from '../controllers/TenantsController';
import * as SyncController from '../controllers/SyncController';
import { createTerminalsController } from '../controllers/TerminalsController';
import catalogRoutes from './catalog';
import ordersRoutes from './orders';
import { createTenantsRouter, getTenantBySlug } from './tenants';
import { createTablesRouter } from './tables';
import registrationRoutes from './registration';
import { createSyncRouter } from './sync';
import { createTerminalsRouter } from './terminals';
import { createKdsRouter } from './kds';
import { createOutletsRouter } from './outlets';
import { createInventoryRouter } from './inventory';
import inventoryAdvancedRoutes from './inventory-advanced';
import posRoutes from './pos';
import { outletMiddleware } from '../middleware/outlet';
import { apiLimiter, registerLimiter, kdsLimiter, orderLimiter } from '../middleware/rateLimiter';

export interface ApiRouterDependencies {
  container: AppContainer;
  config: ApiConfig;
}

export async function createApiRouter({ container: {
  listTables,
  updateTableStatus,
  tableCommands,
  seatingOrderQueries,
  manageTerminals,
}, config: _config }: ApiRouterDependencies): Promise<Router> {
const router = Router();

// express-rate-limit v8 publishes Express 5-flavoured handler types while this
// API app is pinned to Express 4. Cast once at the route boundary so workspace
// type-checking remains stable without changing runtime behavior.
const asExpress4Handler = (handler: unknown): RequestHandler => handler as RequestHandler;

// ── Public (rate-limited) ──────────────────────────────────────────────────────
router.use('/register', asExpress4Handler(registerLimiter), registrationRoutes);

// ── General API rate limit ─────────────────────────────────────────────────────
router.use(asExpress4Handler(apiLimiter));

// ── Outlet middleware (runs after tenantMiddleware, resolves req.outletId) ────
router.use(outletMiddleware);

// ── Tenant-scoped ─────────────────────────────────────────────────────────────
router.use('/catalog', catalogRoutes);
router.use('/orders', asExpress4Handler(orderLimiter), ordersRoutes);
router.use('/tenants', createTenantsRouter({
  getTenantBySlug,
  registerTenant: TenantsController.registerTenant,
  getTenantProfile: TenantsController.getTenantProfile,
  getTenantEntitlements: TenantsController.getTenantEntitlements,
}));
router.get('/me/entitlements', TenantsController.getMyEntitlements);
router.use('/tables', createTablesRouter({
  listTables,
  updateTableStatus,
  tableCommands,
  seatingOrderQueries,
}));
router.use('/sync', createSyncRouter(SyncController));
router.use('/terminals', createTerminalsRouter(createTerminalsController({ manageTerminals })));
router.use('/kds', asExpress4Handler(kdsLimiter), await createKdsRouter());
router.use('/outlets', createOutletsRouter());
router.use('/inventory', createInventoryRouter());
router.use('/inventory', inventoryAdvancedRoutes);
router.use('/pos', posRoutes);

router.get('/health', (_req, res) => {
  res.json({ success: true, timestamp: new Date().toISOString() });
});

return router;
}
