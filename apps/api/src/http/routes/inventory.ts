/**
 * Inventory Routes
 *
 * FREE (basic stock):
 *   GET  /api/inventory/products          — list produk yang stock tracking aktif
 *   PUT  /api/inventory/products/:id/adjust — simple +/- qty (update langsung)
 *
 * PAID (advanced inventory — requires enable_inventory module):
 *   POST /api/inventory/movements          — catat pergerakan stok dengan tipe + catatan
 *   GET  /api/inventory/movements          — riwayat semua pergerakan
 *   GET  /api/inventory/movements/:productId — riwayat per produk
 */

import { Router } from 'express';
import { db } from '@pos/infrastructure/database';
import {
  products,
  tenantModuleConfigs,
  inventoryMovements,
} from '@shared/schema';
import { eq, and, desc, asc } from 'drizzle-orm';
import { asyncHandler, createError } from '../middleware/errorHandler';
import { z } from 'zod';

const router = Router();

// ── helpers ──────────────────────────────────────────────────────────────────

async function isBasicInventoryEnabled(tenantId: string): Promise<boolean> {
  const rows = await db
    .select({ enableInventory: tenantModuleConfigs.enableInventory })
    .from(tenantModuleConfigs)
    .where(eq(tenantModuleConfigs.tenantId, tenantId))
    .limit(1);
  return rows[0]?.enableInventory === true;
}

async function isAdvancedInventoryEnabled(tenantId: string): Promise<boolean> {
  const rows = await db
    .select({ enableInventoryAdvanced: tenantModuleConfigs.enableInventoryAdvanced })
    .from(tenantModuleConfigs)
    .where(eq(tenantModuleConfigs.tenantId, tenantId))
    .limit(1);
  return rows[0]?.enableInventoryAdvanced === true;
}

const MOVEMENT_TYPES = [
  'SALE',
  'ADJUSTMENT_IN',
  'ADJUSTMENT_OUT',
  'PURCHASE',
  'DAMAGE',
  'RETURN',
  'INITIAL',
] as const;

// ── STOK DASAR (basic) ────────────────────────────────────────────────────────

/**
 * GET /api/inventory/products
 * List all products with stock_tracking_enabled = true.
 * Returns current stock qty, sku, low-stock flag (threshold < 10 default).
 * Requires: enable_inventory (Stok Dasar)
 */
router.get('/products', asyncHandler(async (req, res) => {
  const tenantId = req.tenantId!;
  if (!(await isBasicInventoryEnabled(tenantId))) {
    throw createError('Fitur ini memerlukan modul Stok Dasar. Aktifkan dari Marketplace.', 403, 'MODULE_REQUIRED');
  }
  const LOW_STOCK_THRESHOLD = 10;

  const rows = await db
    .select({
      id: products.id,
      name: products.name,
      category: products.category,
      basePrice: products.basePrice,
      imageUrl: products.imageUrl,
      sku: products.sku,
      stockQty: products.stockQty,
      isActive: products.isActive,
    })
    .from(products)
    .where(
      and(
        eq(products.tenantId, tenantId),
        eq(products.stockTrackingEnabled, true),
      ),
    )
    .orderBy(asc(products.category), asc(products.name));

  const items = rows.map((p) => ({
    ...p,
    stockQty: p.stockQty ?? 0,
    isLowStock: (p.stockQty ?? 0) < LOW_STOCK_THRESHOLD,
    isOutOfStock: (p.stockQty ?? 0) <= 0,
    lowStockThreshold: LOW_STOCK_THRESHOLD,
  }));

  const summary = {
    total: items.length,
    lowStock: items.filter((i) => i.isLowStock && !i.isOutOfStock).length,
    outOfStock: items.filter((i) => i.isOutOfStock).length,
  };

  res.json({ success: true, data: { items, summary } });
}));

/**
 * PUT /api/inventory/products/:id/adjust
 * Simple direct adjustment — langsung update stock_qty.
 * Requires: enable_inventory (Stok Dasar). Also logs movement if Stok Lanjutan aktif.
 */
router.put('/products/:id/adjust', asyncHandler(async (req, res) => {
  const tenantId = req.tenantId!;
  if (!(await isBasicInventoryEnabled(tenantId))) {
    throw createError('Fitur ini memerlukan modul Stok Dasar. Aktifkan dari Marketplace.', 403, 'MODULE_REQUIRED');
  }
  const productId = req.params.id;

  const body = z.object({
    qty: z.number().int(),
    mode: z.enum(['set', 'delta']).default('set'),
    notes: z.string().optional(),
  }).parse(req.body);

  const [product] = await db
    .select({ id: products.id, stockQty: products.stockQty, stockTrackingEnabled: products.stockTrackingEnabled })
    .from(products)
    .where(and(eq(products.id, productId), eq(products.tenantId, tenantId)))
    .limit(1);

  if (!product) throw createError('Produk tidak ditemukan', 404);
  if (!product.stockTrackingEnabled) throw createError('Produk ini tidak menggunakan tracking stok', 400);

  const before = product.stockQty ?? 0;
  const after = body.mode === 'delta' ? before + body.qty : body.qty;

  await db
    .update(products)
    .set({ stockQty: after, updatedAt: new Date() })
    .where(and(eq(products.id, productId), eq(products.tenantId, tenantId)));

  // Catat ke ledger jika modul advanced aktif
  const advanced = await isAdvancedInventoryEnabled(tenantId);
  if (advanced) {
    const delta = after - before;
    const movementType = delta >= 0 ? 'ADJUSTMENT_IN' : 'ADJUSTMENT_OUT';
    await db.insert(inventoryMovements).values({
      tenantId,
      productId,
      movementType,
      quantityDelta: delta,
      quantityBefore: before,
      quantityAfter: after,
      notes: body.notes ?? 'Manual adjustment',
    });
  }

  res.json({ success: true, data: { productId, before, after, delta: after - before } });
}));

// ── STOK LANJUTAN (advanced) ──────────────────────────────────────────────────

/**
 * POST /api/inventory/movements
 * Catat pergerakan stok dengan tipe dan catatan. PAID only.
 */
router.post('/movements', asyncHandler(async (req, res) => {
  const tenantId = req.tenantId!;

  if (!(await isAdvancedInventoryEnabled(tenantId))) {
    throw createError('Fitur ini memerlukan modul Advanced Inventory', 403, 'MODULE_REQUIRED');
  }

  const body = z.object({
    productId: z.string(),
    movementType: z.enum(MOVEMENT_TYPES),
    quantityDelta: z.number().int(),
    unitCost: z.string().optional(),
    notes: z.string().optional(),
  }).parse(req.body);

  const [product] = await db
    .select({ id: products.id, stockQty: products.stockQty })
    .from(products)
    .where(and(eq(products.id, body.productId), eq(products.tenantId, tenantId)))
    .limit(1);

  if (!product) throw createError('Produk tidak ditemukan', 404);

  const before = product.stockQty ?? 0;
  const after = before + body.quantityDelta;

  await db
    .update(products)
    .set({ stockQty: after, updatedAt: new Date() })
    .where(and(eq(products.id, body.productId), eq(products.tenantId, tenantId)));

  const [movement] = await db.insert(inventoryMovements).values({
    tenantId,
    productId: body.productId,
    movementType: body.movementType,
    quantityDelta: body.quantityDelta,
    quantityBefore: before,
    quantityAfter: after,
    unitCost: body.unitCost,
    notes: body.notes,
  }).returning();

  res.status(201).json({ success: true, data: { movement, before, after } });
}));

/**
 * GET /api/inventory/movements
 * Semua riwayat pergerakan stok tenant. PAID only.
 */
router.get('/movements', asyncHandler(async (req, res) => {
  const tenantId = req.tenantId!;

  if (!(await isAdvancedInventoryEnabled(tenantId))) {
    throw createError('Fitur ini memerlukan modul Advanced Inventory', 403, 'MODULE_REQUIRED');
  }

  const rows = await db
    .select({
      id: inventoryMovements.id,
      productId: inventoryMovements.productId,
      productName: products.name,
      productCategory: products.category,
      movementType: inventoryMovements.movementType,
      quantityDelta: inventoryMovements.quantityDelta,
      quantityBefore: inventoryMovements.quantityBefore,
      quantityAfter: inventoryMovements.quantityAfter,
      unitCost: inventoryMovements.unitCost,
      notes: inventoryMovements.notes,
      createdAt: inventoryMovements.createdAt,
    })
    .from(inventoryMovements)
    .innerJoin(products, eq(products.id, inventoryMovements.productId))
    .where(eq(inventoryMovements.tenantId, tenantId))
    .orderBy(desc(inventoryMovements.createdAt))
    .limit(200);

  res.json({ success: true, data: { movements: rows } });
}));

/**
 * GET /api/inventory/movements/:productId
 * Riwayat pergerakan stok per produk. PAID only.
 */
router.get('/movements/:productId', asyncHandler(async (req, res) => {
  const tenantId = req.tenantId!;
  const { productId } = req.params;

  if (!(await isAdvancedInventoryEnabled(tenantId))) {
    throw createError('Fitur ini memerlukan modul Advanced Inventory', 403, 'MODULE_REQUIRED');
  }

  const rows = await db
    .select()
    .from(inventoryMovements)
    .where(
      and(
        eq(inventoryMovements.tenantId, tenantId),
        eq(inventoryMovements.productId, productId),
      ),
    )
    .orderBy(desc(inventoryMovements.createdAt))
    .limit(100);

  res.json({ success: true, data: { movements: rows } });
}));

export default router;
