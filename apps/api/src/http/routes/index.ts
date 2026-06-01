import { Router } from 'express';
import { db } from '@pos/infrastructure/database';
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
import { outletMiddleware } from '../middleware/outlet';
import { apiLimiter, registerLimiter, kdsLimiter, orderLimiter } from '../middleware/rateLimiter';

const router = Router();

// ── Public (rate-limited) ──────────────────────────────────────────────────────
router.use('/register', registerLimiter, registrationRoutes);

// ── General API rate limit ─────────────────────────────────────────────────────
router.use(apiLimiter);

// ── Outlet middleware (runs after tenantMiddleware, resolves req.outletId) ────
router.use(outletMiddleware);

// ── Tenant-scoped ─────────────────────────────────────────────────────────────
router.use('/catalog', catalogRoutes);
router.use('/orders', orderLimiter, ordersRoutes);
router.use('/tenants', tenantsRoutes);
router.use('/tables', createTablesRouter(db));
router.use('/sync', syncRoutes);
router.use('/terminals', terminalsRoutes);
router.use('/kds', kdsLimiter, kdsRoutes);
router.use('/outlets', outletsRoutes);
router.use('/inventory', inventoryRoutes);

router.get('/health', (_req, res) => {
  res.json({ success: true, timestamp: new Date().toISOString() });
});

export default router;
