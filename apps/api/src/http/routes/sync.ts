/**
 * Sync Routes — Sprint 4 + Sprint 5
 * Offline batch sync endpoints for terminals.
 */

import { Router, type RequestHandler } from 'express';
import * as SyncController from '../controllers/SyncController';
import { requireCashier, requireManager } from '../middleware/rbac';

export interface SyncRouterDependencies {
  syncOfflineOrders: RequestHandler;
  listSyncBatches: RequestHandler;
  listSyncConflicts: RequestHandler;
  resolveConflict: RequestHandler;
  listSyncEvents: RequestHandler;
}

export function createSyncRouter(deps: SyncRouterDependencies): Router {
  const router = Router();

  // POST /api/sync/offline-orders — batch sync offline orders from terminal
  router.post('/offline-orders', requireCashier, deps.syncOfflineOrders);

  // GET /api/sync/batches — list recent sync batches (admin/debug)
  router.get('/batches', requireManager, deps.listSyncBatches);

  // GET /api/sync/conflicts — list recent sync conflicts
  router.get('/conflicts', requireManager, deps.listSyncConflicts);

  // PATCH /api/sync/conflicts/:id/resolve — resolve or ignore a conflict (Sprint 5)
  router.patch('/conflicts/:id/resolve', requireManager, deps.resolveConflict);

  // GET /api/sync/events — per-item sync audit log
  router.get('/events', requireManager, deps.listSyncEvents);

  return router;
}

const defaultSyncRouter = createSyncRouter(SyncController);
export default defaultSyncRouter;
