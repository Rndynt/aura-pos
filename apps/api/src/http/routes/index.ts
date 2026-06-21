import { Router, type RequestHandler } from 'express';
import { db } from '@pos/infrastructure/database';
import * as TenantsController from '../controllers/TenantsController';
import catalogRoutes from './catalog';
import ordersRoutes from './orders';
import tenantsRoutes from './tenants';
import { createTablesRouter } from './tables';
import registrationRoutes from './registration';
import syncRoutes from './sync';
import terminalsRoutes from './terminals';
import kdsRoutes from './kds';
import outletsRoutes from './outlets';
import inventoryRoutes from './inventory';
import inventoryAdvancedRoutes from './inventory-advanced';
import posRoutes from './pos';
import { outletMiddleware } from '../middleware/outlet';
import { apiLimiter, registerLimiter, kdsLimiter, orderLimiter } from '../middleware/rateLimiter';

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
router.use('/tenants', tenantsRoutes);
router.get('/me/entitlements', TenantsController.getMyEntitlements);
router.use('/tables', createTablesRouter(db));
router.use('/sync', syncRoutes);
router.use('/terminals', terminalsRoutes);
router.use('/kds', asExpress4Handler(kdsLimiter), kdsRoutes);
router.use('/outlets', outletsRoutes);
router.use('/inventory', inventoryRoutes);
router.use('/inventory', inventoryAdvancedRoutes);
router.use('/pos', posRoutes);

router.get('/health', (_req, res) => {
  res.json({ success: true, timestamp: new Date().toISOString() });
});

export default router;
