/**
 * Terminals Routes — Sprint 4
 * Terminal registry CRUD.
 */

import { Router } from 'express';
import * as TerminalsController from '../controllers/TerminalsController';

const router = Router();

// POST /api/terminals/register — find-or-create terminal (idempotent)
router.post('/register', TerminalsController.registerTerminal);

// GET /api/terminals — list all terminals for tenant
router.get('/', TerminalsController.listTerminals);

// PATCH /api/terminals/:id/heartbeat — update last_seen_at
router.patch('/:id/heartbeat', TerminalsController.heartbeatTerminal);

// PATCH /api/terminals/:id/deactivate — soft-deactivate terminal
router.patch('/:id/deactivate', TerminalsController.deactivateTerminal);

export default router;
