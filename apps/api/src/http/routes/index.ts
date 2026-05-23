import { Router } from 'express';
import { db } from '@pos/infrastructure/database';
import catalogRoutes from './catalog';
import ordersRoutes from './orders';
import tenantsRoutes from './tenants';
import { createTablesRouter } from './tables';
import registrationRoutes from './registration';
import syncRoutes from './sync';
import terminalsRoutes from './terminals';

const router = Router();

// ── Public ────────────────────────────────────────────────────────────────────
router.use('/register', registrationRoutes);

// ── Tenant-scoped ─────────────────────────────────────────────────────────────
router.use('/catalog', catalogRoutes);
router.use('/orders', ordersRoutes);
router.use('/tenants', tenantsRoutes);
router.use('/tables', createTablesRouter(db));
router.use('/sync', syncRoutes);
router.use('/terminals', terminalsRoutes);

router.get('/health', (_req, res) => {
  res.json({ success: true, timestamp: new Date().toISOString() });
});

export default router;
