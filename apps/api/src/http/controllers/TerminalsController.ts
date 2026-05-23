/**
 * TerminalsController — Sprint 4
 * Terminal registry CRUD — register, heartbeat, list, deactivate.
 */

import { Request, Response } from 'express';
import { z } from 'zod';
import { container } from '../../container';
import { asyncHandler, createError } from '../middleware/errorHandler';
import { terminals } from '../../../../../shared/schema';
import { eq, and } from 'drizzle-orm';

/**
 * POST /api/terminals/register
 * Find-or-create a terminal for this tenant by terminal_code (upsert).
 * Called on app startup so the terminal is always registered before syncing.
 */
export const registerTerminal = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = req.tenantId!;

  const bodySchema = z.object({
    terminal_code: z.string().min(1).max(128),
    name: z.string().max(255).optional().default('Cashier'),
    device_fingerprint: z.string().optional(),
  });

  const parsed = bodySchema.safeParse(req.body);
  if (!parsed.success) {
    throw createError('Invalid request body: ' + parsed.error.message, 400, 'VALIDATION_ERROR');
  }

  const now = new Date();
  const [terminal] = await container.db
    .insert(terminals)
    .values({
      tenantId,
      terminalCode: parsed.data.terminal_code,
      name: parsed.data.name,
      deviceFingerprint: parsed.data.device_fingerprint,
      lastSeenAt: now,
    })
    .onConflictDoUpdate({
      target: [terminals.tenantId, terminals.terminalCode],
      set: {
        name: parsed.data.name,
        deviceFingerprint: parsed.data.device_fingerprint ?? undefined,
        lastSeenAt: now,
        updatedAt: now,
      },
    })
    .returning();

  if (!terminal) {
    throw createError('Failed to register terminal', 500, 'TERMINAL_REGISTER_ERROR');
  }

  res.status(200).json({ success: true, data: { terminal } });
});

/**
 * PATCH /api/terminals/:id/heartbeat
 * Update last_seen_at for the terminal. Called periodically by the frontend.
 */
export const heartbeatTerminal = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = req.tenantId!;
  const { id } = req.params;

  if (!id) throw createError('Terminal ID is required', 400, 'MISSING_PARAMETER');

  const now = new Date();
  const [terminal] = await container.db
    .update(terminals)
    .set({ lastSeenAt: now, updatedAt: now })
    .where(and(eq(terminals.id, id), eq(terminals.tenantId, tenantId), eq(terminals.isActive, true)))
    .returning({ id: terminals.id, terminalCode: terminals.terminalCode, name: terminals.name, lastSeenAt: terminals.lastSeenAt });

  if (!terminal) {
    throw createError('Terminal not found or inactive', 404, 'TERMINAL_NOT_FOUND');
  }

  res.json({ success: true, data: { terminal } });
});

/**
 * GET /api/terminals
 * List all terminals for tenant.
 */
export const listTerminals = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = req.tenantId!;

  const rows = await container.db
    .select()
    .from(terminals)
    .where(eq(terminals.tenantId, tenantId));

  res.json({ success: true, data: { terminals: rows } });
});

/**
 * PATCH /api/terminals/:id/deactivate
 * Soft-deactivate a terminal — it will be blocked from future syncs.
 */
export const deactivateTerminal = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = req.tenantId!;
  const { id } = req.params;

  if (!id) throw createError('Terminal ID is required', 400, 'MISSING_PARAMETER');

  const now = new Date();
  const [terminal] = await container.db
    .update(terminals)
    .set({ isActive: false, updatedAt: now })
    .where(and(eq(terminals.id, id), eq(terminals.tenantId, tenantId)))
    .returning({ id: terminals.id, terminalCode: terminals.terminalCode, name: terminals.name, isActive: terminals.isActive });

  if (!terminal) {
    throw createError('Terminal not found', 404, 'TERMINAL_NOT_FOUND');
  }

  res.json({ success: true, data: { terminal } });
});
