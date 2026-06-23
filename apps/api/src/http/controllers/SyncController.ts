/**
 * SyncController — thin HTTP adapter for offline sync use cases.
 */

import { Request, Response } from 'express';
import { z } from 'zod';
import { container } from '../../container';
import { asyncHandler, createError } from '../middleware/errorHandler';
import { emitOrderQueueChanged } from '../services/orderQueueEvents';
import type { SyncActorContext } from '@pos/application/sync/ports/SyncRepositoryPort';

const selectedOptionSchema = z.object({
  group_id: z.string(),
  group_name: z.string(),
  option_id: z.string(),
  option_name: z.string(),
  price_delta: z.number(),
});

const orderItemSchema = z.object({
  product_id: z.string(),
  product_name: z.string(),
  base_price: z.number(),
  quantity: z.number().int().positive(),
  variant_id: z.string().optional(),
  variant_name: z.string().optional(),
  variant_price_delta: z.number().optional(),
  selected_options: z.array(selectedOptionSchema).optional(),
  notes: z.string().optional(),
});

const offlineOrderSchema = z.object({
  local_order_id: z.string().min(1),
  local_order_number: z.string().min(1),
  idempotency_key: z.string().min(8).max(128),
  items: z.array(orderItemSchema).min(1),
  order_type_id: z.string().optional(),
  customer_name: z.string().optional(),
  table_number: z.string().optional(),
  notes: z.string().optional(),
  tax_rate: z.number().min(0).max(1).optional(),
  service_charge_rate: z.number().min(0).max(1).optional(),
  amount: z.number().positive(),
  payment_method: z.enum(['CASH', 'MANUAL_TRANSFER', 'MANUAL_QRIS']),
  transaction_ref: z.string().optional(),
  payment_notes: z.string().optional(),
  client_created_at: z.string().optional(),
  source_terminal_id: z.string().optional(),
});

const batchBodySchema = z.object({
  terminal_id: z.string().min(1),
  app_version: z.string().optional(),
  terminal_token_id: z.string().min(1).optional(),
  orders: z.array(offlineOrderSchema).min(1).max(50),
});

const resolveConflictBodySchema = z.object({
  resolution: z.enum(['resolved', 'ignored', 'pending']),
  resolved_by: z.string().min(1).max(255).optional(),
});

function parseLimit(value: unknown, fallback: number, max: number): number {
  const parsed = Number.parseInt(String(value ?? fallback), 10);
  if (Number.isNaN(parsed) || parsed < 1) return fallback;
  return Math.min(parsed, max);
}

function resolveSyncActor(req: Request, terminalTokenId?: string): SyncActorContext {
  if (req.userId) {
    return { kind: 'cashier_session', cashier_user_id: req.userId };
  }

  if (terminalTokenId) {
    return { kind: 'terminal_token', terminal_token_id: terminalTokenId };
  }

  throw createError('Cashier session or terminal token is required for sync', 401, 'SYNC_AUTH_REQUIRED');
}

/**
 * POST /api/sync/offline-orders
 * Accept a batch of up to 50 offline orders from a terminal.
 */
export const syncOfflineOrders = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = req.tenantId!;

  const parsed = batchBodySchema.safeParse(req.body);
  if (!parsed.success) {
    throw createError('Invalid request body: ' + parsed.error.message, 400, 'VALIDATION_ERROR');
  }

  const result = await container.syncOfflineBatch.execute({
    tenant_id: tenantId,
    terminal_id: parsed.data.terminal_id,
    outlet_id: req.outletId ?? null,
    app_version: parsed.data.app_version,
    actor: resolveSyncActor(req, parsed.data.terminal_token_id),
    orders: parsed.data.orders as any,
  });

  if (result.synced > 0 || result.replayed > 0) {
    emitOrderQueueChanged(tenantId, { source: 'offline_sync', synced: result.synced, replayed: result.replayed });
  }

  res.status(200).json({ success: true, data: result });
});

/** GET /api/sync/batches */
export const listSyncBatches = asyncHandler(async (req: Request, res: Response) => {
  const rows = await container.pullTenantChanges.listBatches({
    tenant_id: req.tenantId!,
    outlet_id: req.outletId ?? null,
    limit: parseLimit(req.query.limit, 20, 100),
  });

  res.json({ success: true, data: { batches: rows } });
});

/** GET /api/sync/conflicts */
export const listSyncConflicts = asyncHandler(async (req: Request, res: Response) => {
  const rows = await container.pullTenantChanges.listConflicts({
    tenant_id: req.tenantId!,
    outlet_id: req.outletId ?? null,
    limit: parseLimit(req.query.limit, 20, 100),
  });

  res.json({ success: true, data: { conflicts: rows } });
});

/** GET /api/sync/events */
export const listSyncEvents = asyncHandler(async (req: Request, res: Response) => {
  const rows = await container.pullTenantChanges.listEvents({
    tenant_id: req.tenantId!,
    outlet_id: req.outletId ?? null,
    limit: parseLimit(req.query.limit, 50, 200),
  });

  res.json({ success: true, data: { events: rows } });
});

/** PATCH /api/sync/conflicts/:id/resolve */
export const resolveConflict = asyncHandler(async (req: Request, res: Response) => {
  const parsed = resolveConflictBodySchema.safeParse(req.body);
  if (!parsed.success) {
    throw createError('Invalid request body: ' + parsed.error.message, 400, 'VALIDATION_ERROR');
  }

  try {
    const result = await container.pullTenantChanges.resolveConflict({
      tenant_id: req.tenantId!,
      outlet_id: req.outletId ?? null,
      conflict_id: req.params.id,
      resolution: parsed.data.resolution,
      resolved_by: parsed.data.resolved_by ?? null,
    });

    res.json({ success: true, data: result });
  } catch (err) {
    if (err instanceof Error && err.message === 'SYNC_CONFLICT_NOT_FOUND') {
      throw createError('Conflict not found', 404, 'NOT_FOUND');
    }
    throw err;
  }
});
