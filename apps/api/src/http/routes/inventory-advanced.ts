/**
 * Advanced Inventory Routes — Opname, Transfer, Low Stock, Threshold
 *
 * Routes are deliberately thin: entitlement check + body parse + use-case call.
 * All business logic (status guards, variance math, atomic balance writes) lives
 * in the application use cases at packages/application/inventory/opname.ts and
 * packages/application/inventory/transfer.ts.
 *
 * ADVANCED (requires inventory_advanced_stock):
 *   GET  /api/inventory/low-stock                     — list produk stok rendah
 *   PUT  /api/inventory/products/:id/threshold        — set threshold per produk/outlet
 *   POST /api/inventory/opnames                       — buat opname baru
 *   GET  /api/inventory/opnames                       — list opnames
 *   GET  /api/inventory/opnames/:id                   — detail opname + items
 *   PUT  /api/inventory/opnames/:id/items/:productId  — update item hitungan
 *   POST /api/inventory/opnames/:id/submit            — submit opname
 *   POST /api/inventory/opnames/:id/approve           — approve opname (writes OPNAME_ADJUSTMENT)
 *   POST /api/inventory/opnames/:id/cancel            — cancel opname
 *
 * TRANSFER (requires inventory_advanced_stock + multi_location):
 *   POST /api/inventory/transfers                     — buat transfer baru
 *   GET  /api/inventory/transfers                     — list transfers
 *   GET  /api/inventory/transfers/:id                 — detail transfer + items
 *   POST /api/inventory/transfers/:id/submit          — submit (deducts source balance)
 *   POST /api/inventory/transfers/:id/receive         — receive (adds dest balance)
 *   POST /api/inventory/transfers/:id/cancel          — cancel
 */

import { Router } from 'express';
import { db, products, inventoryBalances } from '../../composition/modules/httpApplicationBoundaryModule';
import { eq, and } from 'drizzle-orm';
import { asyncHandler, createError } from '../middleware/errorHandler';
import { z } from 'zod';
import { requireManager } from '../middleware/rbac';
import { requireTenantEntitlement } from '../helpers/inventoryEntitlement';
import { getEffectiveEntitlementMap } from '../../services/tenantEntitlements';
import {
  DrizzleInventoryBalanceRepository,
  DrizzleStockOpnameRepository,
  DrizzleStockTransferRepository,
  DrizzleInventoryMovementWriter,
  DrizzleInventoryProductStockReader,
  DrizzleOutletContextRepository,
} from '@pos/infrastructure/repositories/inventory';
import { DrizzleUnitOfWork } from '@pos/infrastructure/unit-of-work';
import {
  createOpname,
  updateOpnameItem,
  submitOpname,
  approveOpname,
  cancelOpname,
  createTransfer,
  submitTransfer,
  receiveTransfer,
  cancelTransfer,
  ensureProductBalanceForOutlet,
  ensureTrackedProductBalancesForOutlet,
} from '@pos/application/inventory';

const router = Router();

const balanceRepo = new DrizzleInventoryBalanceRepository();
const opnameRepo = new DrizzleStockOpnameRepository();
const transferRepo = new DrizzleStockTransferRepository();
const movementWriter = new DrizzleInventoryMovementWriter();
const unitOfWork = new DrizzleUnitOfWork();
const productReader = new DrizzleInventoryProductStockReader();
const outletContext = new DrizzleOutletContextRepository();
const balanceDeps = { balanceRepo, productReader, outletContext };

const DEFAULT_THRESHOLD = 10;

// ── helpers ───────────────────────────────────────────────────────────────────

function generateNumber(prefix: string): string {
  const date = new Date();
  const dateStr = date.toISOString().slice(0, 10).replace(/-/g, '');
  const rand = Math.floor(1000 + Math.random() * 9000);
  return `${prefix}-${dateStr}-${rand}`;
}

async function requireMultiLocation(tenantId: string) {
  const map = await getEffectiveEntitlementMap(tenantId);
  if (!map.multi_location) {
    throw createError('Transfer stok membutuhkan modul Multi Lokasi', 403);
  }
}

// ── LOW STOCK ─────────────────────────────────────────────────────────────────

/**
 * GET /api/inventory/low-stock
 * List products at or below their effective low stock threshold.
 */
router.get('/low-stock', asyncHandler(async (req, res) => {
  const tenantId = req.tenantId!;
  await requireTenantEntitlement(db, tenantId, 'inventory_advanced_stock');

  const outletId = req.outletId;
  if (!outletId) throw createError('Outlet context diperlukan', 400);

  const allBalances = await ensureTrackedProductBalancesForOutlet(balanceDeps, { tenantId, outletId });
  const balances = [...allBalances.values()].filter((balance) => {
    const threshold = balance.lowStockThreshold ?? DEFAULT_THRESHOLD;
    return balance.quantity <= threshold;
  });
  const productIds = balances.map((b) => b.productId);

  if (productIds.length === 0) {
    return res.json({ success: true, data: { items: [], total: 0 } });
  }

  const productRows = await db
    .select({
      id: products.id,
      name: products.name,
      category: products.category,
      sku: products.sku,
      imageUrl: products.imageUrl,
    })
    .from(products)
    .where(and(eq(products.tenantId, tenantId)));

  const productMap = new Map(productRows.map((p) => [p.id, p]));

  const items = balances.map((b) => {
    const product = productMap.get(b.productId);
    const effectiveThreshold = b.lowStockThreshold ?? DEFAULT_THRESHOLD;
    return {
      productId: b.productId,
      productName: product?.name ?? '–',
      category: product?.category ?? '–',
      sku: product?.sku ?? null,
      imageUrl: product?.imageUrl ?? null,
      quantity: b.quantity,
      threshold: effectiveThreshold,
      isOutOfStock: b.quantity <= 0,
      isLowStock: b.quantity > 0 && b.quantity <= effectiveThreshold,
      outletId: b.outletId,
    };
  });

  return res.json({ success: true, data: { items, total: items.length } });
}));

/**
 * PUT /api/inventory/products/:id/threshold
 * Set low stock threshold per product/outlet.
 */
router.put('/products/:id/threshold', requireManager, asyncHandler(async (req, res) => {
  const tenantId = req.tenantId!;
  await requireTenantEntitlement(db, tenantId, 'inventory_advanced_stock');

  const productId = req.params.id;
  const outletId = req.outletId;
  if (!outletId) throw createError('Outlet context diperlukan', 400);

  const body = z.object({
    threshold: z.number().int().min(0).nullable(),
  }).parse(req.body);

  const [product] = await db
    .select({ id: products.id })
    .from(products)
    .where(and(eq(products.id, productId), eq(products.tenantId, tenantId)))
    .limit(1);

  if (!product) throw createError('Produk tidak ditemukan', 404);

  await ensureProductBalanceForOutlet(balanceDeps, { tenantId, outletId, productId });
  const balance = await balanceRepo.setThreshold(tenantId, outletId, productId, body.threshold);

  return res.json({
    success: true,
    data: {
      productId,
      outletId,
      threshold: balance?.lowStockThreshold ?? null,
    },
  });
}));

// ── OPNAME ────────────────────────────────────────────────────────────────────

/**
 * POST /api/inventory/opnames
 * Create a draft opname and auto-populate items with all tracked products.
 */
router.post('/opnames', requireManager, asyncHandler(async (req, res) => {
  const tenantId = req.tenantId!;
  await requireTenantEntitlement(db, tenantId, 'inventory_advanced_stock');

  const outletId = req.outletId;
  if (!outletId) throw createError('Outlet context diperlukan', 400);

  const body = z.object({
    notes: z.string().optional(),
    startedBy: z.string().optional(),
  }).parse(req.body);

  const opname = await createOpname(
    { opnameRepo },
    {
      tenantId,
      outletId,
      opnameNumber: generateNumber('OPN'),
      notes: body.notes ?? null,
      startedBy: body.startedBy ?? null,
    },
  );

  const trackedProducts = await db
    .select({ id: products.id })
    .from(products)
    .where(and(eq(products.tenantId, tenantId), eq(products.stockTrackingEnabled, true)));

  for (const p of trackedProducts) {
    const balance = await ensureProductBalanceForOutlet(balanceDeps, { tenantId, outletId, productId: p.id });
    const systemQty = balance.quantity;
    await opnameRepo.upsertItem({
      opnameId: opname.id,
      productId: p.id,
      systemQuantity: systemQty,
      countedQuantity: systemQty,
    });
  }

  const full = await opnameRepo.findById(opname.id, tenantId);
  return res.status(201).json({ success: true, data: full });
}));

/**
 * GET /api/inventory/opnames
 */
router.get('/opnames', asyncHandler(async (req, res) => {
  const tenantId = req.tenantId!;
  await requireTenantEntitlement(db, tenantId, 'inventory_advanced_stock');

  const outletId = req.outletId;
  if (!outletId) throw createError('Outlet context diperlukan', 400);

  const query = z.object({
    status: z.enum(['draft', 'submitted', 'approved', 'cancelled']).optional(),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    offset: z.coerce.number().int().min(0).default(0),
  }).parse(req.query);

  const opnames = await opnameRepo.list(tenantId, outletId, {
    status: query.status as any,
    limit: query.limit,
    offset: query.offset,
  });

  return res.json({ success: true, data: { opnames } });
}));

/**
 * GET /api/inventory/opnames/:id
 */
router.get('/opnames/:id', asyncHandler(async (req, res) => {
  const tenantId = req.tenantId!;
  await requireTenantEntitlement(db, tenantId, 'inventory_advanced_stock');

  const opname = await opnameRepo.findById(req.params.id, tenantId);
  if (!opname) throw createError('Opname tidak ditemukan', 404);

  return res.json({ success: true, data: opname });
}));

/**
 * PUT /api/inventory/opnames/:id/items/:productId
 */
router.put('/opnames/:id/items/:productId', requireManager, asyncHandler(async (req, res) => {
  const tenantId = req.tenantId!;
  await requireTenantEntitlement(db, tenantId, 'inventory_advanced_stock');

  const body = z.object({
    countedQuantity: z.number().int().min(0),
    notes: z.string().optional(),
  }).parse(req.body);

  const item = await updateOpnameItem(
    { opnameRepo },
    {
      opnameId: req.params.id,
      tenantId,
      productId: req.params.productId,
      countedQuantity: body.countedQuantity,
      notes: body.notes ?? null,
    },
  );

  return res.json({ success: true, data: item });
}));

/**
 * POST /api/inventory/opnames/:id/submit
 */
router.post('/opnames/:id/submit', requireManager, asyncHandler(async (req, res) => {
  const tenantId = req.tenantId!;
  await requireTenantEntitlement(db, tenantId, 'inventory_advanced_stock');

  const body = z.object({ submittedBy: z.string().optional() }).parse(req.body);

  const result = await submitOpname(
    { opnameRepo },
    { opnameId: req.params.id, tenantId, submittedBy: body.submittedBy },
  );

  return res.json({ success: true, data: result });
}));

/**
 * POST /api/inventory/opnames/:id/approve
 * Atomically writes OPNAME_ADJUSTMENT movements and updates inventory_balances.
 */
router.post('/opnames/:id/approve', requireManager, asyncHandler(async (req, res) => {
  const tenantId = req.tenantId!;
  await requireTenantEntitlement(db, tenantId, 'inventory_advanced_stock');

  const body = z.object({ approvedBy: z.string().optional() }).parse(req.body);

  const result = await approveOpname(
    { opnameRepo, balanceRepo, movementWriter, unitOfWork },
    { opnameId: req.params.id, tenantId, approvedBy: body.approvedBy },
  );

  return res.json({ success: true, data: result });
}));

/**
 * POST /api/inventory/opnames/:id/cancel
 */
router.post('/opnames/:id/cancel', requireManager, asyncHandler(async (req, res) => {
  const tenantId = req.tenantId!;
  await requireTenantEntitlement(db, tenantId, 'inventory_advanced_stock');

  const result = await cancelOpname(
    { opnameRepo },
    { opnameId: req.params.id, tenantId },
  );

  return res.json({ success: true, data: result });
}));

// ── TRANSFER ──────────────────────────────────────────────────────────────────

/**
 * POST /api/inventory/transfers
 */
router.post('/transfers', requireManager, asyncHandler(async (req, res) => {
  const tenantId = req.tenantId!;
  await requireTenantEntitlement(db, tenantId, 'inventory_advanced_stock');
  await requireMultiLocation(tenantId);

  const body = z.object({
    fromOutletId: z.string().uuid(),
    toOutletId: z.string().uuid(),
    notes: z.string().optional(),
    createdBy: z.string().optional(),
    items: z.array(z.object({
      productId: z.string().uuid(),
      quantity: z.number().int().min(1),
      notes: z.string().optional(),
    })).min(1),
  }).parse(req.body);

  const transfer = await createTransfer(
    { transferRepo },
    {
      tenantId,
      transferNumber: generateNumber('TRF'),
      fromOutletId: body.fromOutletId,
      toOutletId: body.toOutletId,
      notes: body.notes ?? null,
      createdBy: body.createdBy ?? null,
      items: body.items,
    },
  );

  return res.status(201).json({ success: true, data: transfer });
}));

/**
 * GET /api/inventory/transfers
 */
router.get('/transfers', asyncHandler(async (req, res) => {
  const tenantId = req.tenantId!;
  await requireTenantEntitlement(db, tenantId, 'inventory_advanced_stock');
  await requireMultiLocation(tenantId);

  const query = z.object({
    scope: z.enum(['all', 'source', 'destination', 'involved']).default('involved'),
    status: z.enum(['draft', 'submitted', 'received', 'cancelled']).optional(),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    offset: z.coerce.number().int().min(0).default(0),
  }).parse(req.query);

  const transfers = await transferRepo.list(tenantId, {
    outletId: req.outletId ?? undefined,
    scope: query.scope,
    status: query.status as any,
    limit: query.limit,
    offset: query.offset,
  });

  return res.json({ success: true, data: { transfers } });
}));

/**
 * GET /api/inventory/transfers/:id
 */
router.get('/transfers/:id', asyncHandler(async (req, res) => {
  const tenantId = req.tenantId!;
  await requireTenantEntitlement(db, tenantId, 'inventory_advanced_stock');
  await requireMultiLocation(tenantId);

  const transfer = await transferRepo.findById(req.params.id, tenantId);
  if (!transfer) throw createError('Transfer tidak ditemukan', 404);

  return res.json({ success: true, data: transfer });
}));

/**
 * POST /api/inventory/transfers/:id/submit
 * Atomically deducts source outlet balance and writes TRANSFER_OUT movements.
 */
router.post('/transfers/:id/submit', requireManager, asyncHandler(async (req, res) => {
  const tenantId = req.tenantId!;
  await requireTenantEntitlement(db, tenantId, 'inventory_advanced_stock');
  await requireMultiLocation(tenantId);

  const body = z.object({ submittedBy: z.string().optional() }).parse(req.body);

  const result = await submitTransfer(
    {
      transferRepo,
      balanceRepo,
      movementWriter,
      unitOfWork,
      ensureBalanceForOutlet: (input, ctx) => ensureProductBalanceForOutlet(balanceDeps, input, ctx),
    },
    { transferId: req.params.id, tenantId, submittedBy: body.submittedBy },
  );

  return res.json({ success: true, data: result });
}));

/**
 * POST /api/inventory/transfers/:id/receive
 * Atomically adds destination outlet balance and writes TRANSFER_IN movements.
 */
router.post('/transfers/:id/receive', requireManager, asyncHandler(async (req, res) => {
  const tenantId = req.tenantId!;
  await requireTenantEntitlement(db, tenantId, 'inventory_advanced_stock');
  await requireMultiLocation(tenantId);

  const body = z.object({ receivedBy: z.string().optional() }).parse(req.body);

  const result = await receiveTransfer(
    {
      transferRepo,
      balanceRepo,
      movementWriter,
      unitOfWork,
      ensureBalanceForOutlet: (input, ctx) => ensureProductBalanceForOutlet(balanceDeps, input, ctx),
    },
    { transferId: req.params.id, tenantId, receivedBy: body.receivedBy },
  );

  return res.json({ success: true, data: result });
}));

/**
 * POST /api/inventory/transfers/:id/cancel
 * If submitted: reverses TRANSFER_OUT with ADJUSTMENT_IN before cancelling.
 */
router.post('/transfers/:id/cancel', requireManager, asyncHandler(async (req, res) => {
  const tenantId = req.tenantId!;
  await requireTenantEntitlement(db, tenantId, 'inventory_advanced_stock');
  await requireMultiLocation(tenantId);

  const body = z.object({ cancelledBy: z.string().optional() }).parse(req.body);

  const result = await cancelTransfer(
    {
      transferRepo,
      balanceRepo,
      movementWriter,
      unitOfWork,
      ensureBalanceForOutlet: (input, ctx) => ensureProductBalanceForOutlet(balanceDeps, input, ctx),
    },
    { transferId: req.params.id, tenantId, cancelledBy: body.cancelledBy },
  );

  return res.json({ success: true, data: result });
}));

export default router;
