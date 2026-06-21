/**
 * SyncController — Sprint 4 + Sprint 5
 * Handles batch offline order sync from terminals.
 * Sprint 5: adds conflict resolution endpoint.
 */

import { Request, Response } from 'express';
import { z } from 'zod';
import { container } from '../../container';
import { asyncHandler, createError } from '../middleware/errorHandler';
import { emitOrderQueueChanged } from '../services/orderQueueEvents';
import { syncBatches, syncEvents, serverSyncConflicts } from '@pos/infrastructure/db/schema';
import { eq, desc, and } from 'drizzle-orm';

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
  orders: z.array(offlineOrderSchema).min(1).max(50),
});

function scopedConditions<T extends { tenantId: any; outletId?: any }>(table: T, tenantId: string, outletId?: string) {
  const conditions = [eq(table.tenantId, tenantId)];
  if (outletId && table.outletId) {
    conditions.push(eq(table.outletId, outletId));
  }
  return conditions;
}

/**
 * POST /api/sync/offline-orders
 * Accept a batch of up to 50 offline orders from a terminal.
 * Each order is processed independently; 1 conflict/failure does not abort the batch.
 */
export const syncOfflineOrders = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = req.tenantId!;

  const parsed = batchBodySchema.safeParse(req.body);
  if (!parsed.success) {
    throw createError(
      'Invalid request body: ' + parsed.error.message,
      400,
      'VALIDATION_ERROR'
    );
  }

  const result = await container.syncOfflineOrder.execute({
    tenant_id: tenantId,
    terminal_id: parsed.data.terminal_id,
    outlet_id: req.outletId ?? null,
    app_version: parsed.data.app_version,
    orders: parsed.data.orders as any,
  });

  // Notify SSE subscribers so queue refreshes on connected devices
  if (result.synced > 0 || result.replayed > 0) {
    emitOrderQueueChanged(tenantId, {
      source: 'offline_sync',
      synced: result.synced,
      replayed: result.replayed,
    });
  }

  res.status(200).json({ success: true, data: result });
});

/**
 * GET /api/sync/batches
 * List recent sync batches for a tenant (admin/debug use).
 */
export const listSyncBatches = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = req.tenantId!;
  const limitRaw = Math.min(parseInt(String(req.query.limit ?? '20'), 10), 100);

  const rows = await container.db
    .select()
    .from(syncBatches)
    .where(and(...scopedConditions(syncBatches, tenantId, req.outletId)))
    .orderBy(desc(syncBatches.createdAt))
    .limit(limitRaw);

  res.json({ success: true, data: { batches: rows } });
});

/**
 * GET /api/sync/conflicts
 * List recent sync conflicts for a tenant.
 */
export const listSyncConflicts = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = req.tenantId!;
  const limitRaw = Math.min(parseInt(String(req.query.limit ?? '20'), 10), 100);

  const rows = await container.db
    .select()
    .from(serverSyncConflicts)
    .where(and(...scopedConditions(serverSyncConflicts, tenantId, req.outletId)))
    .orderBy(desc(serverSyncConflicts.createdAt))
    .limit(limitRaw);

  res.json({ success: true, data: { conflicts: rows } });
});

/**
 * GET /api/sync/events
 * List recent sync events for a tenant (per-item audit log).
 */
export const listSyncEvents = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = req.tenantId!;
  const limitRaw = Math.min(parseInt(String(req.query.limit ?? '50'), 10), 200);

  const rows = await container.db
    .select()
    .from(syncEvents)
    .where(and(...scopedConditions(syncEvents, tenantId, req.outletId)))
    .orderBy(desc(syncEvents.createdAt))
    .limit(limitRaw);

  res.json({ success: true, data: { events: rows } });
});

const resolveConflictBodySchema = z.object({
  resolution: z.enum(['resolved', 'ignored', 'pending']),
  resolved_by: z.string().min(1).max(255).optional(),
});

/**
 * PATCH /api/sync/conflicts/:id/resolve
 * Mark a sync conflict as resolved or ignored (Sprint 5).
 */
export const resolveConflict = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = req.tenantId!;
  const conflictId = req.params.id;

  const parsed = resolveConflictBodySchema.safeParse(req.body);
  if (!parsed.success) {
    throw createError('Invalid request body: ' + parsed.error.message, 400, 'VALIDATION_ERROR');
  }

  const existing = await container.db
    .select({ id: serverSyncConflicts.id })
    .from(serverSyncConflicts)
    .where(and(eq(serverSyncConflicts.id, conflictId), ...scopedConditions(serverSyncConflicts, tenantId, req.outletId)))
    .limit(1);

  if (!existing.length) {
    throw createError('Conflict not found', 404, 'NOT_FOUND');
  }

  const [updated] = await container.db
    .update(serverSyncConflicts)
    .set({
      resolution: parsed.data.resolution,
      resolvedAt: parsed.data.resolution !== 'pending' ? new Date() : null,
      resolvedBy: parsed.data.resolved_by ?? null,
    })
    .where(and(eq(serverSyncConflicts.id, conflictId), ...scopedConditions(serverSyncConflicts, tenantId, req.outletId)))
    .returning();

  res.json({ success: true, data: { conflict: updated } });
});
