import { Router } from 'express';
import { db } from '@pos/infrastructure/database';
import { outlets, userOutletAssignments, tenantFeatures, insertOutletSchema, outletProductConfigs } from '@shared/schema';
import { eq, and, count, inArray } from 'drizzle-orm';
import { asyncHandler, createError } from '../middleware/errorHandler';
import { z } from 'zod';

const router = Router();

const MAX_FREE_OUTLETS = 1;

async function getPurchasedOutletSlots(tenantId: string): Promise<number> {
  const rows = await db
    .select()
    .from(tenantFeatures)
    .where(
      and(
        eq(tenantFeatures.tenantId, tenantId),
        eq(tenantFeatures.featureCode, 'multi_outlet'),
        eq(tenantFeatures.isActive, true),
      ),
    )
    .limit(1);

  if (!rows.length) return MAX_FREE_OUTLETS;
  const cfg = rows[0].config as { purchased_slots?: number } | null;
  return (cfg?.purchased_slots ?? MAX_FREE_OUTLETS);
}

// GET /api/outlets — list all outlets for tenant
router.get('/', asyncHandler(async (req, res) => {
  const tenantId = req.tenantId!;
  const rows = await db
    .select()
    .from(outlets)
    .where(and(eq(outlets.tenantId, tenantId), eq(outlets.isActive, true)))
    .orderBy(outlets.createdAt);
  res.json({ outlets: rows });
}));

// GET /api/outlets/current — return active outlet for this request
router.get('/current', asyncHandler(async (req, res) => {
  const outletId = req.outletId;
  if (!outletId) {
    throw createError('No active outlet', 404);
  }
  const rows = await db.select().from(outlets).where(eq(outlets.id, outletId)).limit(1);
  if (!rows.length) throw createError('Outlet not found', 404);
  res.json({ outlet: rows[0] });
}));

// POST /api/outlets — create new outlet (checks slot limit)
router.post('/', asyncHandler(async (req, res) => {
  const tenantId = req.tenantId!;

  const allowedSlots = await getPurchasedOutletSlots(tenantId);
  const [{ value: existingCount }] = await db
    .select({ value: count() })
    .from(outlets)
    .where(and(eq(outlets.tenantId, tenantId), eq(outlets.isActive, true)));

  if (Number(existingCount) >= allowedSlots) {
    throw createError(
      `Batas outlet tercapai (${allowedSlots} outlet). Beli slot tambahan untuk menambah cabang.`,
      402,
    );
  }

  const body = insertOutletSchema.omit({ tenantId: true }).parse(req.body);
  const [created] = await db
    .insert(outlets)
    .values({ ...body, tenantId, isDefault: false })
    .returning();

  res.status(201).json({ outlet: created });
}));

// PATCH /api/outlets/:id — update outlet name/address/etc
router.patch('/:id', asyncHandler(async (req, res) => {
  const tenantId = req.tenantId!;
  const { id } = req.params;

  const updateSchema = z.object({
    name: z.string().min(1).optional(),
    slug: z.string().min(1).optional(),
    address: z.string().optional(),
    phone: z.string().optional(),
    isActive: z.boolean().optional(),
  });
  const body = updateSchema.parse(req.body);

  const [updated] = await db
    .update(outlets)
    .set({ ...body, updatedAt: new Date() })
    .where(and(eq(outlets.id, id), eq(outlets.tenantId, tenantId)))
    .returning();

  if (!updated) throw createError('Outlet tidak ditemukan', 404);
  res.json({ outlet: updated });
}));

// DELETE /api/outlets/:id — soft delete (cannot delete default outlet)
router.delete('/:id', asyncHandler(async (req, res) => {
  const tenantId = req.tenantId!;
  const { id } = req.params;

  const rows = await db
    .select()
    .from(outlets)
    .where(and(eq(outlets.id, id), eq(outlets.tenantId, tenantId)))
    .limit(1);

  if (!rows.length) throw createError('Outlet tidak ditemukan', 404);
  if (rows[0].isDefault) throw createError('Outlet default tidak bisa dihapus', 400);

  await db
    .update(outlets)
    .set({ isActive: false, updatedAt: new Date() })
    .where(eq(outlets.id, id));

  res.json({ success: true });
}));

// GET /api/outlets/:id/staff — list staff assigned to outlet
router.get('/:id/staff', asyncHandler(async (req, res) => {
  const { id } = req.params;
  const rows = await db
    .select()
    .from(userOutletAssignments)
    .where(and(eq(userOutletAssignments.outletId, id), eq(userOutletAssignments.isActive, true)));
  res.json({ assignments: rows });
}));

// POST /api/outlets/:id/staff — assign user to outlet
router.post('/:id/staff', asyncHandler(async (req, res) => {
  const { id } = req.params;
  const body = z.object({
    userId: z.string(),
    role: z.enum(['owner', 'manager', 'cashier', 'staff']).default('staff'),
  }).parse(req.body);

  const [assignment] = await db
    .insert(userOutletAssignments)
    .values({ outletId: id, userId: body.userId, role: body.role })
    .onConflictDoUpdate({
      target: [userOutletAssignments.userId, userOutletAssignments.outletId],
      set: { role: body.role, isActive: true, updatedAt: new Date() },
    })
    .returning();

  res.status(201).json({ assignment });
}));

// DELETE /api/outlets/:id/staff/:userId — remove staff from outlet
router.delete('/:id/staff/:userId', asyncHandler(async (req, res) => {
  const { id, userId } = req.params;
  await db
    .update(userOutletAssignments)
    .set({ isActive: false, updatedAt: new Date() })
    .where(
      and(
        eq(userOutletAssignments.outletId, id),
        eq(userOutletAssignments.userId, userId),
      ),
    );
  res.json({ success: true });
}));

// GET /api/outlets/product-configs — get all outlet_product_configs for this tenant
router.get('/product-configs', asyncHandler(async (req, res) => {
  const tenantId = req.tenantId!;

  // Get all outlet IDs for this tenant
  const tenantOutlets = await db
    .select({ id: outlets.id })
    .from(outlets)
    .where(and(eq(outlets.tenantId, tenantId), eq(outlets.isActive, true)));

  if (!tenantOutlets.length) {
    return res.json({ configs: [] });
  }

  const outletIds = tenantOutlets.map((o) => o.id);

  const configs = await db
    .select()
    .from(outletProductConfigs)
    .where(inArray(outletProductConfigs.outletId, outletIds));

  res.json({ configs });
}));

// PUT /api/outlets/:outletId/product-configs/:productId — set product availability at outlet
router.put('/:outletId/product-configs/:productId', asyncHandler(async (req, res) => {
  const tenantId = req.tenantId!;
  const { outletId, productId } = req.params;

  const body = z.object({ isAvailable: z.boolean() }).parse(req.body);

  // Verify the outlet belongs to this tenant
  const outletRows = await db
    .select({ id: outlets.id })
    .from(outlets)
    .where(and(eq(outlets.id, outletId), eq(outlets.tenantId, tenantId), eq(outlets.isActive, true)))
    .limit(1);

  if (!outletRows.length) throw createError('Outlet tidak ditemukan', 404);

  const [config] = await db
    .insert(outletProductConfigs)
    .values({ outletId, productId, isAvailable: body.isAvailable })
    .onConflictDoUpdate({
      target: [outletProductConfigs.outletId, outletProductConfigs.productId],
      set: { isAvailable: body.isAvailable, updatedAt: new Date() },
    })
    .returning();

  res.json({ config });
}));

export default router;
