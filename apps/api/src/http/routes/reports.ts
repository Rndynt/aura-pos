/**
 * Reports Routes
 * Aggregated analytics endpoints — replaces client-side N-order fetches.
 * All queries use server-side GROUP BY to minimize data transfer.
 */

import { Router } from 'express';
import { z } from 'zod';
import { and, eq, gte, lt, ne, sql } from 'drizzle-orm';
import { asyncHandler } from '../middleware/errorHandler';
import { requireEntitlement } from '../middleware/entitlementGuard';
import { db } from '@pos/infrastructure/database';
import { orders, orderPayments } from '@pos/infrastructure/db/schema/orders.schema';
import { products } from '@pos/infrastructure/db/schema/catalog.schema';
import { inventoryBalances } from '@pos/infrastructure/db/schema/inventory.schema';

const router = Router();

function getTimezoneOffsetHours(tz: string): number {
  try {
    const now = new Date();
    const utcStr = now.toLocaleString('en-US', { timeZone: 'UTC' });
    const localStr = now.toLocaleString('en-US', { timeZone: tz });
    return (new Date(localStr).getTime() - new Date(utcStr).getTime()) / (60 * 60 * 1000);
  } catch {
    return 7; // WIB default
  }
}

function parsePeriod(period: string, tz: string): { start: Date; end: Date } {
  const now = new Date();
  const offsetMs = getTimezoneOffsetHours(tz) * 60 * 60 * 1000;

  // Current local day boundaries expressed in UTC
  const localNow = new Date(now.getTime() + offsetMs);
  const localYear = localNow.getUTCFullYear();
  const localMonth = localNow.getUTCMonth();
  const localDay = localNow.getUTCDate();

  const toUtc = (y: number, m: number, d: number) => new Date(Date.UTC(y, m, d) - offsetMs);

  if (period === 'today') {
    return { start: toUtc(localYear, localMonth, localDay), end: toUtc(localYear, localMonth, localDay + 1) };
  }
  if (period === 'yesterday') {
    return { start: toUtc(localYear, localMonth, localDay - 1), end: toUtc(localYear, localMonth, localDay) };
  }
  if (period === 'week') {
    return { start: toUtc(localYear, localMonth, localDay - 6), end: toUtc(localYear, localMonth, localDay + 1) };
  }
  // month
  return { start: toUtc(localYear, localMonth, 1), end: toUtc(localYear, localMonth + 1, 1) };
}

const querySchema = z.object({
  period: z.enum(['today', 'yesterday', 'week', 'month']).default('today'),
  tz: z.string().default('Asia/Jakarta'),
  outletId: z.string().uuid().optional(),
});

/**
 * GET /api/reports/summary
 * Returns aggregated revenue, transaction count, avg bill, chart data, and
 * payment breakdown for the requested period.
 *
 * Required entitlement: reports_advanced
 */
router.get('/summary', requireEntitlement('reports_advanced'), asyncHandler(async (req, res) => {
  const tenantId = req.tenantId!;

  const parsed = querySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ success: false, error: 'Invalid query', details: parsed.error.flatten().fieldErrors });
    return;
  }

  const { period, tz, outletId } = parsed.data;
  const { start, end } = parsePeriod(period, tz);

  const base = [
    eq(orders.tenantId, tenantId),
    gte(orders.orderDate, start),
    lt(orders.orderDate, end),
    ne(orders.status, 'cancelled'),
  ];
  if (outletId) base.push(eq(orders.outletId, outletId));

  // ── Overall totals ────────────────────────────────────────────────────────
  const [totals] = await db
    .select({
      revenue: sql<string>`COALESCE(SUM(${orders.total}), 0)`,
      transactions: sql<string>`COUNT(*)`,
    })
    .from(orders)
    .where(and(...base));

  const revenue = parseFloat(totals?.revenue ?? '0');
  const transactions = parseInt(totals?.transactions ?? '0', 10);

  // ── Chart: hourly for today/yesterday, daily for week/month ──────────────
  const isHourly = period === 'today' || period === 'yesterday';
  const truncSql = isHourly
    ? sql`DATE_TRUNC('hour', ${orders.orderDate} AT TIME ZONE ${tz})`
    : sql`DATE_TRUNC('day',  ${orders.orderDate} AT TIME ZONE ${tz})`;

  const chartRows = await db
    .select({
      bucket: truncSql.as<string>('bucket'),
      value: sql<string>`COALESCE(SUM(${orders.total}), 0)`,
      transactions: sql<string>`COUNT(*)`,
    })
    .from(orders)
    .where(and(...base))
    .groupBy(truncSql)
    .orderBy(truncSql);

  const chartData = chartRows.map((r) => ({
    bucket: r.bucket,
    value: parseFloat(r.value),
    transactions: parseInt(r.transactions, 10),
  }));

  // ── Payment method breakdown ──────────────────────────────────────────────
  const paymentRows = await db
    .select({
      method: orderPayments.paymentMethod,
      total: sql<string>`COALESCE(SUM(${orderPayments.amount}), 0)`,
      count: sql<string>`COUNT(*)`,
    })
    .from(orderPayments)
    .innerJoin(orders, eq(orders.id, orderPayments.orderId))
    .where(and(
      eq(orders.tenantId, tenantId),
      gte(orders.orderDate, start),
      lt(orders.orderDate, end),
      ne(orders.status, 'cancelled'),
      ...(outletId ? [eq(orders.outletId, outletId)] : []),
    ))
    .groupBy(orderPayments.paymentMethod);

  const paymentBreakdown = Object.fromEntries(
    paymentRows.map((r) => [
      r.method,
      { total: parseFloat(r.total), count: parseInt(r.count, 10) },
    ])
  );

  // ── Low-stock (quantity > 0 AND quantity < threshold or < 10) ────────────
  const lowStockRows = await db
    .select({
      productId: inventoryBalances.productId,
      name: products.name,
      quantity: inventoryBalances.quantity,
      threshold: inventoryBalances.lowStockThreshold,
    })
    .from(inventoryBalances)
    .innerJoin(products, eq(products.id, inventoryBalances.productId))
    .where(and(
      eq(inventoryBalances.tenantId, tenantId),
      sql`${inventoryBalances.quantity} > 0`,
      sql`${inventoryBalances.quantity} < COALESCE(${inventoryBalances.lowStockThreshold}, 10)`,
      ...(outletId ? [eq(inventoryBalances.outletId, outletId)] : []),
    ))
    .orderBy(inventoryBalances.quantity)
    .limit(10);

  res.json({
    success: true,
    data: {
      period,
      range: { start: start.toISOString(), end: end.toISOString() },
      revenue,
      transactions,
      avgBill: transactions > 0 ? revenue / transactions : 0,
      chartData,
      paymentBreakdown,
      lowStock: lowStockRows,
    },
  });
}));

export default router;
