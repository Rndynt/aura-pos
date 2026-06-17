/**
 * Inventory Routes
 *
 * FREE (basic stock):
 *   GET  /api/inventory/products               — list produk yang stock tracking aktif
 *   PUT  /api/inventory/products/:id/adjust    — simple +/- qty (update langsung)
 *
 * ADVANCED (requires inventory_advanced_stock entitlement):
 *   POST /api/inventory/movements              — catat pergerakan stok dengan tipe + catatan
 *   GET  /api/inventory/movements              — riwayat semua pergerakan (+ filter)
 *   GET  /api/inventory/movements/:productId   — riwayat per produk
 *   GET  /api/inventory/report                 — laporan agregat (top sold, breakdown tipe, nilai stok)
 */

import { Router } from 'express';
import { db } from '@pos/infrastructure/database';
import {
  products,
  inventoryMovements,
} from '@pos/infrastructure/db/schema';
import { eq, and, desc, asc, gte, lte, sql } from 'drizzle-orm';
import { asyncHandler, createError } from '../middleware/errorHandler';
import { z } from 'zod';
import { requireManager } from '../middleware/rbac';
import { toStockListResponse } from '../helpers/inventoryStockListing';
import { requireTenantEntitlement } from '../helpers/inventoryEntitlement';
import { DrizzleInventoryBalanceRepository, DrizzleInventoryProductStockReader, DrizzleOutletContextRepository, DrizzleInventoryMovementWriter } from '@pos/infrastructure/repositories/inventory';
import { DrizzleUnitOfWork } from '@pos/infrastructure/unit-of-work';
import { ensureProductBalanceForOutlet, ensureTrackedProductBalancesForOutlet } from '@pos/application/inventory';

const router = Router();

const balanceRepo = new DrizzleInventoryBalanceRepository();
const productReader = new DrizzleInventoryProductStockReader();
const outletContext = new DrizzleOutletContextRepository();
const movementWriter = new DrizzleInventoryMovementWriter();
const unitOfWork = new DrizzleUnitOfWork();
const balanceDeps = { balanceRepo, productReader, outletContext };

// ── helpers ───────────────────────────────────────────────────────────────────


/**
 * All recognised movement types.
 * OFFLINE_SALE is retained for legacy/manual rows; current offline sync uses SALE with terminal metadata.
 */
const MOVEMENT_TYPES = [
  'SALE',
  'OFFLINE_SALE',
  'ADJUSTMENT_IN',
  'ADJUSTMENT_OUT',
  'PURCHASE',
  'DAMAGE',
  'RETURN',
  'INITIAL',
  'OPNAME_ADJUSTMENT',
  'TRANSFER_OUT',
  'TRANSFER_IN',
] as const;

type MovementType = typeof MOVEMENT_TYPES[number];

/** Returns a Date representing `period` days ago from now. */
function periodStart(days: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - days);
  d.setHours(0, 0, 0, 0);
  return d;
}

// ── STOK DASAR (basic) ────────────────────────────────────────────────────────

/**
 * GET /api/inventory/products
 * List all products with stock_tracking_enabled = true.
 * Returns current stock qty, sku, low-stock flag (threshold < 10 default).
 * Requires: inventory_basic_stock entitlement
 */
router.get('/products', asyncHandler(async (req, res) => {
  const tenantId = req.tenantId!;
  await requireTenantEntitlement(db, tenantId, 'inventory_basic_stock');
  const LOW_STOCK_THRESHOLD = 10;

  const outletId = req.outletId;
  if (!outletId) throw createError('Outlet context diperlukan', 400);

  const balances = await ensureTrackedProductBalancesForOutlet(balanceDeps, { tenantId, outletId });

  const rows = await db
    .select({
      id: products.id,
      name: products.name,
      category: products.category,
      basePrice: products.basePrice,
      imageUrl: products.imageUrl,
      sku: products.sku,
      isActive: products.isActive,
      stockTrackingEnabled: products.stockTrackingEnabled,
    })
    .from(products)
    .where(
      and(
        eq(products.tenantId, tenantId),
        eq(products.stockTrackingEnabled, true),
      ),
    )
    .orderBy(asc(products.category), asc(products.name));

  const data = toStockListResponse(rows.map((row) => {
    const balance = balances.get(row.id);
    return {
      ...row,
      stockQty: balance?.quantity ?? 0,
      lowStockThreshold: balance?.lowStockThreshold ?? LOW_STOCK_THRESHOLD,
    };
  }), LOW_STOCK_THRESHOLD);

  res.json({ success: true, data });
}));

/**
 * PUT /api/inventory/products/:id/adjust
 * Simple direct adjustment — updates inventory_balances for the active outlet only.
 * Requires: inventory_basic_stock entitlement. Also logs movement if Stok Lanjutan aktif.
 */
router.put('/products/:id/adjust', requireManager, asyncHandler(async (req, res) => {
  const tenantId = req.tenantId!;
  await requireTenantEntitlement(db, tenantId, 'inventory_basic_stock');
  const productId = req.params.id;

  const body = z.object({
    qty: z.number().int(),
    mode: z.enum(['set', 'delta']).default('set'),
    notes: z.string().optional(),
    actorId: z.string().optional(),
    referenceId: z.string().optional(),
  }).parse(req.body);

  const [product] = await db
    .select({ id: products.id, stockTrackingEnabled: products.stockTrackingEnabled })
    .from(products)
    .where(and(eq(products.id, productId), eq(products.tenantId, tenantId)))
    .limit(1);

  if (!product) throw createError('Produk tidak ditemukan', 404);
  if (!product.stockTrackingEnabled) throw createError('Produk ini tidak menggunakan tracking stok', 400);

  const outletId = req.outletId;
  if (!outletId) throw createError('Outlet context diperlukan', 400);

  const currentBalance = await ensureProductBalanceForOutlet(balanceDeps, { tenantId, outletId, productId });
  const before = currentBalance.quantity;
  const after = body.mode === 'delta' ? before + body.qty : body.qty;
  if (after < 0) throw createError('Stok tidak boleh negatif', 400);
  const delta = after - before;

  // Catat ke ledger jika modul advanced aktif
  let advanced = true;
  try {
    await requireTenantEntitlement(db, tenantId, 'inventory_advanced_stock');
  } catch {
    advanced = false;
  }

  await unitOfWork.transaction(async (ctx) => {
    await balanceRepo.setQuantity({ tenantId, outletId, productId, quantity: after }, ctx);
    if (advanced && delta !== 0) {
      const movementType: MovementType = delta >= 0 ? 'ADJUSTMENT_IN' : 'ADJUSTMENT_OUT';
      await movementWriter.record({
        tenantId,
        outletId,
        productId,
        movementType,
        quantityDelta: delta,
        quantityBefore: before,
        quantityAfter: after,
        notes: body.notes ?? 'Manual adjustment',
        referenceType: 'manual_adjustment',
        referenceId: body.referenceId ?? productId,
        metadata: { mode: body.mode, source: 'basic_adjust', actorId: body.actorId ?? null },
      }, ctx);
    }
  });

  res.json({ success: true, data: { productId, before, after, delta: after - before } });
}));


/**
 * POST /api/inventory/opening-stock
 * Set opening stock for one tracked product in the active outlet only.
 * Requires: inventory_basic_stock entitlement. Records INITIAL movement when
 * inventory_advanced_stock is effective for the tenant.
 */
router.post('/opening-stock', requireManager, asyncHandler(async (req, res) => {
  const tenantId = req.tenantId!;
  await requireTenantEntitlement(db, tenantId, 'inventory_basic_stock');

  const outletId = req.outletId;
  if (!outletId) throw createError('Outlet context diperlukan', 400);

  const body = z.object({
    productId: z.string().uuid(),
    quantity: z.number().int().min(0),
    notes: z.string().optional(),
    actorId: z.string().optional(),
  }).parse(req.body);

  const [product] = await db
    .select({ id: products.id, stockTrackingEnabled: products.stockTrackingEnabled })
    .from(products)
    .where(and(eq(products.id, body.productId), eq(products.tenantId, tenantId)))
    .limit(1);

  if (!product) throw createError('Produk tidak ditemukan', 404);
  if (!product.stockTrackingEnabled) throw createError('Produk ini tidak menggunakan tracking stok', 400);

  const currentBalance = await ensureProductBalanceForOutlet(balanceDeps, { tenantId, outletId, productId: body.productId });
  const before = currentBalance.quantity;
  const after = body.quantity;
  const delta = after - before;

  let advanced = true;
  try {
    await requireTenantEntitlement(db, tenantId, 'inventory_advanced_stock');
  } catch {
    advanced = false;
  }

  await unitOfWork.transaction(async (ctx) => {
    await balanceRepo.setQuantity({ tenantId, outletId, productId: body.productId, quantity: after }, ctx);
    if (advanced && delta !== 0) {
      await movementWriter.record({
        tenantId,
        outletId,
        productId: body.productId,
        movementType: 'INITIAL',
        quantityDelta: delta,
        quantityBefore: before,
        quantityAfter: after,
        notes: body.notes ?? 'Stok awal',
        referenceType: 'opening_stock',
        referenceId: body.productId,
        metadata: { source: 'opening_stock', actorId: body.actorId ?? null },
      }, ctx);
    }
  });

  res.status(201).json({ success: true, data: { productId: body.productId, outletId, before, after, delta } });
}));

// ── STOK LANJUTAN (advanced) ──────────────────────────────────────────────────

/**
 * POST /api/inventory/movements
 * Catat pergerakan stok dengan tipe dan catatan. Advanced only.
 */
router.post('/movements', requireManager, asyncHandler(async (req, res) => {
  const tenantId = req.tenantId!;

  await requireTenantEntitlement(db, tenantId, 'inventory_advanced_stock');

  const body = z.object({
    productId: z.string(),
    movementType: z.enum(MOVEMENT_TYPES),
    quantityDelta: z.number().int(),
    unitCost: z.string().optional(),
    notes: z.string().optional(),
    actorId: z.string().optional(),
    referenceId: z.string().optional(),
  }).parse(req.body);

  const [product] = await db
    .select({ id: products.id })
    .from(products)
    .where(and(eq(products.id, body.productId), eq(products.tenantId, tenantId)))
    .limit(1);

  if (!product) throw createError('Produk tidak ditemukan', 404);

  const outletId = req.outletId;
  if (!outletId) throw createError('Outlet context diperlukan', 400);

  const currentBalance = await ensureProductBalanceForOutlet(balanceDeps, { tenantId, outletId, productId: body.productId });
  const before = currentBalance.quantity;
  const after = before + body.quantityDelta;
  if (after < 0) throw createError('Stok tidak boleh negatif', 400);

  let movement: unknown;
  await unitOfWork.transaction(async (ctx) => {
    const updatedBalance = await balanceRepo.applyDelta({
      tenantId,
      outletId,
      productId: body.productId,
      quantityDelta: body.quantityDelta,
    }, ctx);
    movement = await movementWriter.record({
      tenantId,
      outletId,
      productId: body.productId,
      movementType: body.movementType,
      quantityDelta: body.quantityDelta,
      quantityBefore: before,
      quantityAfter: updatedBalance.quantity,
      notes: body.notes,
      referenceType: body.movementType.startsWith('ADJUSTMENT') ? 'manual_adjustment' : 'manual_movement',
      referenceId: body.referenceId ?? body.productId,
      metadata: { source: 'advanced_movement', actorId: body.actorId ?? null, unitCost: body.unitCost ?? null },
    }, ctx);
  });

  res.status(201).json({ success: true, data: { movement, before, after } });
}));

/**
 * GET /api/inventory/movements
 * Semua riwayat pergerakan stok tenant. Advanced only.
 *
 * Query params:
 *   type      — filter by movement type (e.g. SALE, OFFLINE_SALE, ADJUSTMENT_IN, …)
 *   productId — filter by specific product
 *   dateFrom  — ISO date string (inclusive)
 *   dateTo    — ISO date string (inclusive, end of day)
 *   limit     — default 50, max 200
 *   offset    — default 0
 */
router.get('/movements', asyncHandler(async (req, res) => {
  const tenantId = req.tenantId!;

  await requireTenantEntitlement(db, tenantId, 'inventory_advanced_stock');

  const query = z.object({
    type: z.string().optional(),
    productId: z.string().uuid().optional(),
    dateFrom: z.string().optional(),
    dateTo: z.string().optional(),
    limit: z.coerce.number().int().min(1).max(200).default(50),
    offset: z.coerce.number().int().min(0).default(0),
  }).parse(req.query);

  const conditions = [eq(inventoryMovements.tenantId, tenantId)];
  if (req.outletId) {
    conditions.push(eq(inventoryMovements.outletId, req.outletId));
  }

  if (query.type && MOVEMENT_TYPES.includes(query.type as MovementType)) {
    conditions.push(eq(inventoryMovements.movementType, query.type));
  }

  if (query.productId) {
    conditions.push(eq(inventoryMovements.productId, query.productId));
  }

  if (query.dateFrom) {
    const from = new Date(query.dateFrom);
    if (!isNaN(from.getTime())) {
      conditions.push(gte(inventoryMovements.createdAt, from));
    }
  }

  if (query.dateTo) {
    const to = new Date(query.dateTo);
    if (!isNaN(to.getTime())) {
      to.setHours(23, 59, 59, 999);
      conditions.push(lte(inventoryMovements.createdAt, to));
    }
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
      actorId: inventoryMovements.actorId,
      orderId: inventoryMovements.orderId,
      paymentId: inventoryMovements.paymentId,
      referenceType: inventoryMovements.referenceType,
      referenceId: inventoryMovements.referenceId,
      metadata: inventoryMovements.metadata,
      createdAt: inventoryMovements.createdAt,
    })
    .from(inventoryMovements)
    .innerJoin(products, eq(products.id, inventoryMovements.productId))
    .where(and(...conditions))
    .orderBy(desc(inventoryMovements.createdAt))
    .limit(query.limit)
    .offset(query.offset);

  res.json({ success: true, data: { movements: rows, limit: query.limit, offset: query.offset } });
}));

/**
 * GET /api/inventory/movements/:productId
 * Riwayat pergerakan stok per produk. Advanced only.
 */
router.get('/movements/:productId', asyncHandler(async (req, res) => {
  const tenantId = req.tenantId!;
  const { productId } = req.params;

  await requireTenantEntitlement(db, tenantId, 'inventory_advanced_stock');

  const rows = await db
    .select()
    .from(inventoryMovements)
    .where(
      and(
        eq(inventoryMovements.tenantId, tenantId),
        eq(inventoryMovements.productId, productId),
        ...(req.outletId ? [eq(inventoryMovements.outletId, req.outletId)] : []),
      ),
    )
    .orderBy(desc(inventoryMovements.createdAt))
    .limit(100);

  res.json({ success: true, data: { movements: rows } });
}));

/**
 * GET /api/inventory/report
 * Laporan agregat inventaris. Advanced only.
 *
 * Query params:
 *   period  — 7 | 30 | 90 (days, default 30)
 *   dateFrom / dateTo — custom range (overrides period)
 */
router.get('/report', asyncHandler(async (req, res) => {
  const tenantId = req.tenantId!;

  await requireTenantEntitlement(db, tenantId, 'inventory_advanced_stock');

  const query = z.object({
    period: z.coerce.number().int().min(1).max(365).default(30),
    dateFrom: z.string().optional(),
    dateTo: z.string().optional(),
  }).parse(req.query);

  let from: Date;
  let to: Date = new Date();

  if (query.dateFrom) {
    const parsed = new Date(query.dateFrom);
    from = isNaN(parsed.getTime()) ? periodStart(query.period) : parsed;
  } else {
    from = periodStart(query.period);
  }

  if (query.dateTo) {
    const parsed = new Date(query.dateTo);
    if (!isNaN(parsed.getTime())) {
      parsed.setHours(23, 59, 59, 999);
      to = parsed;
    }
  }

  // postgres-js sql template tag does not serialize Date objects automatically —
  // pass ISO strings so the driver receives plain strings.
  const fromIso = from.toISOString();
  const toIso = to.toISOString();
  const outletId = req.outletId ?? null;

  // 1. Top 10 produk terlaku (SALE/OFFLINE_SALE dalam periode)
  const topSoldResult = await db.execute(sql`
    SELECT
      im.product_id   AS "productId",
      p.name          AS "productName",
      p.category      AS "category",
      SUM(ABS(im.quantity_delta))::int AS "totalSold"
    FROM inventory_movements im
    JOIN products p ON p.id = im.product_id
    WHERE im.tenant_id = ${tenantId}
      AND UPPER(im.movement_type) IN ('SALE', 'OFFLINE_SALE')
      AND (${outletId}::uuid IS NULL OR im.outlet_id = ${outletId}::uuid)
      AND im.created_at >= ${fromIso}::timestamptz
      AND im.created_at <= ${toIso}::timestamptz
    GROUP BY im.product_id, p.name, p.category
    ORDER BY "totalSold" DESC
    LIMIT 10
  `);

  // 2. Breakdown pergerakan per tipe dalam periode
  const breakdownResult = await db.execute(sql`
    SELECT
      movement_type AS "movementType",
      COUNT(*)::int AS "count",
      COALESCE(SUM(CASE WHEN quantity_delta > 0 THEN quantity_delta ELSE 0 END), 0)::int AS "totalIn",
      COALESCE(SUM(CASE WHEN quantity_delta < 0 THEN ABS(quantity_delta) ELSE 0 END), 0)::int AS "totalOut"
    FROM inventory_movements
    WHERE tenant_id = ${tenantId}
      AND (${outletId}::uuid IS NULL OR outlet_id = ${outletId}::uuid)
      AND created_at >= ${fromIso}::timestamptz
      AND created_at <= ${toIso}::timestamptz
    GROUP BY movement_type
    ORDER BY "count" DESC
  `);

  // 3. Nilai stok saat ini (produk aktif + tracking aktif) from active outlet balances
  if (outletId) {
    await ensureTrackedProductBalancesForOutlet(balanceDeps, { tenantId, outletId });
  }

  const stockValueResult = await db.execute(sql`
    SELECT
      COALESCE(SUM(GREATEST(ib.quantity, 0) * p.base_price::numeric), 0)::numeric AS "totalValue",
      COUNT(p.id)::int AS "totalTracked",
      COALESCE(SUM(GREATEST(ib.quantity, 0)), 0)::int AS "totalUnits"
    FROM products p
    LEFT JOIN inventory_balances ib
      ON ib.tenant_id = p.tenant_id
      AND ib.product_id = p.id
      AND (${outletId}::uuid IS NOT NULL AND ib.outlet_id = ${outletId}::uuid)
    WHERE p.tenant_id = ${tenantId}
      AND p.stock_tracking_enabled = true
      AND p.is_active = true
  `);

  // 4. Total terjual (unit + transaksi) dalam periode
  const salesSummaryResult = await db.execute(sql`
    SELECT
      COUNT(DISTINCT order_id)::int AS "totalOrders",
      COALESCE(SUM(ABS(quantity_delta)), 0)::int AS "totalUnitsSold"
    FROM inventory_movements
    WHERE tenant_id = ${tenantId}
      AND UPPER(movement_type) IN ('SALE', 'OFFLINE_SALE')
      AND (${outletId}::uuid IS NULL OR outlet_id = ${outletId}::uuid)
      AND created_at >= ${fromIso}::timestamptz
      AND created_at <= ${toIso}::timestamptz
  `);

  // postgres-js RowList is array-like but may not serialize cleanly —
  // map to plain objects to guarantee JSON-safe output.
  const toPlainRows = (result: unknown): Record<string, unknown>[] => {
    const arr = Array.isArray(result) ? result : ((result as any)?.rows ?? []);
    return arr.map((r: unknown) => ({ ...(r as object) }));
  };

  const topSoldPlain = toPlainRows(topSoldResult);
  const breakdownPlain = toPlainRows(breakdownResult);
  const stockValueRows = toPlainRows(stockValueResult);
  const salesRows = toPlainRows(salesSummaryResult);

  const stockValueRow = stockValueRows[0] ?? {};
  const salesRow = salesRows[0] ?? {};

  console.log('[InventoryReport] topSold:', topSoldPlain.length, 'breakdown:', breakdownPlain.length,
    'stockValue:', stockValueRow, 'sales:', salesRow);

  res.json({
    success: true,
    data: {
      period: { from: from.toISOString(), to: to.toISOString(), days: query.period },
      outletId,
      topSold: topSoldPlain.map((r) => ({
        productId: String(r.productId ?? ''),
        productName: String(r.productName ?? ''),
        category: String(r.category ?? ''),
        totalSold: Number(r.totalSold ?? 0),
      })),
      movementBreakdown: breakdownPlain.map((r) => ({
        movementType: String(r.movementType ?? ''),
        count: Number(r.count ?? 0),
        totalIn: Number(r.totalIn ?? 0),
        totalOut: Number(r.totalOut ?? 0),
      })),
      stockValue: {
        totalValue: Number(stockValueRow.totalValue ?? 0),
        totalTracked: Number(stockValueRow.totalTracked ?? 0),
        totalUnits: Number(stockValueRow.totalUnits ?? 0),
      },
      salesSummary: {
        totalOrders: Number(salesRow.totalOrders ?? 0),
        totalUnitsSold: Number(salesRow.totalUnitsSold ?? 0),
      },
    },
  });
}));

export default router;
