/**
 * Routes Index
 * Aggregates all API routes
 */

import { Router } from 'express';
import { db } from '@pos/infrastructure/database';
import catalogRoutes from './catalog';
import ordersRoutes from './orders';
import tenantsRoutes from './tenants';
import { createTablesRouter } from './tables';
import { auth } from '../../lib/auth';
import { fromNodeHeaders } from 'better-auth/node';

const router = Router();

// Mount domain routes
router.use('/catalog', catalogRoutes);
router.use('/orders', ordersRoutes);
router.use('/tenants', tenantsRoutes);
router.use('/tables', createTablesRouter(db));

// Auth: get current session + tenantId (tidak butuh x-tenant-id)
router.get('/auth/me', async (req, res) => {
  try {
    const session = await auth.api.getSession({
      headers: fromNodeHeaders(req.headers),
    });
    if (!session?.user) {
      return res.status(401).json({ success: false, error: 'Unauthenticated' });
    }
    const user = session.user as typeof session.user & { tenantId?: string };
    return res.status(200).json({
      success: true,
      data: {
        id: user.id,
        name: user.name,
        email: user.email,
        username: (user as any).username,
        tenantId: (user as any).tenantId ?? null,
        role: (user as any).role ?? null,
      },
    });
  } catch (err) {
    console.error('[auth/me]', err);
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// Health check endpoint
router.get('/health', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'API is healthy',
    timestamp: new Date().toISOString(),
  });
});

export default router;
