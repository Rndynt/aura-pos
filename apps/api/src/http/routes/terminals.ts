/**
 * Terminals Routes — Sprint 4
 * Terminal registry CRUD.
 */

import { Router, type RequestHandler } from 'express';
import * as TerminalsController from '../controllers/TerminalsController';
import { requireCashier, requireManager } from '../middleware/rbac';

export interface TerminalsRouterDependencies {
  registerTerminal: RequestHandler;
  listTerminals: RequestHandler;
  heartbeatTerminal: RequestHandler;
  deactivateTerminal: RequestHandler;
}

export function createTerminalsRouter(deps: TerminalsRouterDependencies): Router {
  const router = Router();

  // POST /api/terminals/register — find-or-create terminal (idempotent)
  router.post('/register', requireCashier, deps.registerTerminal);

  // GET /api/terminals — list all terminals for tenant
  router.get('/', deps.listTerminals);

  // PATCH /api/terminals/:id/heartbeat — update last_seen_at
  router.patch('/:id/heartbeat', requireCashier, deps.heartbeatTerminal);

  // PATCH /api/terminals/:id/deactivate — soft-deactivate terminal
  router.patch('/:id/deactivate', requireManager, deps.deactivateTerminal);

  return router;
}

const defaultTerminalsRouter = createTerminalsRouter(TerminalsController);
export default defaultTerminalsRouter;
