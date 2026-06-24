/**
 * TerminalsController — Sprint 4
 * Terminal registry CRUD — register, heartbeat, list, deactivate.
 */

import { Request, Response } from 'express';
import { z } from 'zod';
import { ManageTerminals, TerminalNotFoundError } from '@pos/application/terminals';
import { db } from '../../composition/modules/httpApplicationBoundaryModule';
import { DrizzleTerminalRepository } from '@pos/infrastructure/repositories/terminals/DrizzleTerminalRepository';
import { asyncHandler, createError } from '../middleware/errorHandler';

const manageTerminals = new ManageTerminals(new DrizzleTerminalRepository(db));

const mapTerminalError = (error: unknown): never => {
  if (error instanceof TerminalNotFoundError) {
    throw createError(error.message, 404, error.code);
  }
  if (error instanceof Error && (error.message.includes('required') || error.message.includes('Invalid'))) {
    throw createError(error.message, 400, 'VALIDATION_ERROR');
  }
  throw error;
};

/**
 * POST /api/terminals/register
 * Find-or-create a terminal for this tenant by terminal_code (upsert).
 * Called on app startup so the terminal is always registered before syncing.
 */
export const registerTerminal = asyncHandler(async (req: Request, res: Response) => {
  const bodySchema = z.object({
    terminal_code: z.string().min(1).max(128),
    name: z.string().max(255).optional().default('Cashier'),
    device_fingerprint: z.string().optional(),
  });

  const parsed = bodySchema.safeParse(req.body);
  if (!parsed.success) {
    throw createError('Invalid request body: ' + parsed.error.message, 400, 'VALIDATION_ERROR');
  }

  try {
    const terminal = await manageTerminals.register({
      tenantId: req.tenantId!,
      outletId: req.outletId ?? null,
      terminalCode: parsed.data.terminal_code,
      name: parsed.data.name,
      deviceFingerprint: parsed.data.device_fingerprint ?? null,
    });

    res.status(200).json({ success: true, data: { terminal } });
  } catch (error) {
    mapTerminalError(error);
  }
});

/**
 * PATCH /api/terminals/:id/heartbeat
 * Update last_seen_at for the terminal. Called periodically by the frontend.
 */
export const heartbeatTerminal = asyncHandler(async (req: Request, res: Response) => {
  try {
    const terminal = await manageTerminals.heartbeat({
      tenantId: req.tenantId!,
      outletId: req.outletId ?? null,
      id: req.params.id,
    });

    res.json({ success: true, data: { terminal } });
  } catch (error) {
    mapTerminalError(error);
  }
});

/**
 * GET /api/terminals
 * List all terminals for tenant.
 */
export const listTerminals = asyncHandler(async (req: Request, res: Response) => {
  try {
    const terminals = await manageTerminals.list({ tenantId: req.tenantId!, outletId: req.outletId ?? null });
    res.json({ success: true, data: { terminals } });
  } catch (error) {
    mapTerminalError(error);
  }
});

/**
 * PATCH /api/terminals/:id/deactivate
 * Soft-deactivate a terminal — it will be blocked from future syncs.
 */
export const deactivateTerminal = asyncHandler(async (req: Request, res: Response) => {
  try {
    const terminal = await manageTerminals.deactivate({
      tenantId: req.tenantId!,
      outletId: req.outletId ?? null,
      id: req.params.id,
    });

    res.json({ success: true, data: { terminal } });
  } catch (error) {
    mapTerminalError(error);
  }
});
