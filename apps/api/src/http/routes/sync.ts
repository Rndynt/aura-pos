/**
 * Sync Routes — Sprint 4
 * Offline batch sync endpoints for terminals.
 */

import { Router } from 'express';
import * as SyncController from '../controllers/SyncController';

const router = Router();

// POST /api/sync/offline-orders — batch sync offline orders from terminal
router.post('/offline-orders', SyncController.syncOfflineOrders);

// GET /api/sync/batches — list recent sync batches (admin/debug)
router.get('/batches', SyncController.listSyncBatches);

// GET /api/sync/conflicts — list recent sync conflicts (admin/debug)
router.get('/conflicts', SyncController.listSyncConflicts);

// GET /api/sync/events — per-item sync audit log
router.get('/events', SyncController.listSyncEvents);

export default router;
