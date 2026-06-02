import { randomUUID } from 'node:crypto';
import postgres from 'postgres';

const DATABASE_URL = process.env.DATABASE_URL?.trim();
const ORDER_QUERY_PLAN_ROWS = Number.parseInt(process.env.ORDER_QUERY_PLAN_ROWS ?? '20000', 10);

if (!DATABASE_URL) {
  console.error('[order-query-plans] DATABASE_URL is required.');
  process.exit(1);
}

if (!Number.isFinite(ORDER_QUERY_PLAN_ROWS) || ORDER_QUERY_PLAN_ROWS < 1000) {
  console.error('[order-query-plans] ORDER_QUERY_PLAN_ROWS must be at least 1000.');
  process.exit(1);
}

const REQUIRED_INDEXES = [
  'orders_tenant_outlet_status_order_date_desc_idx',
  'orders_tenant_outlet_order_date_desc_idx',
  'order_items_order_idx',
] as const;

const PLAN_CHECKS = [
  {
    name: 'queue endpoint (/api/orders/open)',
    sql: `
      SELECT *
      FROM orders
      WHERE tenant_id = $1
        AND outlet_id = $2
        AND status IN ('draft', 'confirmed', 'preparing', 'ready', 'served')
      ORDER BY order_date DESC
      LIMIT 50
    `,
    expectedIndexes: [
      'orders_tenant_outlet_status_order_date_desc_idx',
      'orders_tenant_outlet_order_date_desc_idx',
    ],
  },
  {
    name: 'history endpoint (/api/orders/history)',
    sql: `
      SELECT *
      FROM orders
      WHERE tenant_id = $1
        AND outlet_id = $2
        AND status IN ('completed', 'cancelled')
        AND order_date >= now() - interval '90 days'
        AND order_date <= now()
      ORDER BY order_date DESC
      LIMIT 20
    `,
    expectedIndexes: [
      'orders_tenant_outlet_status_order_date_desc_idx',
      'orders_tenant_outlet_order_date_desc_idx',
    ],
  },
  {
    name: 'history pagination count (/api/orders/history)',
    sql: `
      SELECT count(*)
      FROM orders
      WHERE tenant_id = $1
        AND outlet_id = $2
        AND status IN ('completed', 'cancelled')
        AND order_date >= now() - interval '90 days'
        AND order_date <= now()
    `,
    expectedIndexes: [
      'orders_tenant_outlet_status_order_date_desc_idx',
      'orders_tenant_outlet_order_date_desc_idx',
    ],
  },
  {
    name: 'report/list endpoint (/api/orders)',
    sql: `
      SELECT *
      FROM orders
      WHERE tenant_id = $1
        AND outlet_id = $2
        AND order_date >= now() - interval '30 days'
        AND order_date <= now()
      ORDER BY order_date DESC
      LIMIT 100
    `,
    expectedIndexes: ['orders_tenant_outlet_order_date_desc_idx'],
  },
  {
    name: 'report/list pagination count (/api/orders)',
    sql: `
      SELECT count(*)
      FROM orders
      WHERE tenant_id = $1
        AND outlet_id = $2
        AND order_date >= now() - interval '30 days'
        AND order_date <= now()
    `,
    expectedIndexes: ['orders_tenant_outlet_order_date_desc_idx'],
  },
] as const;

type ExplainNode = {
  'Node Type'?: string;
  'Index Name'?: string;
  Plans?: ExplainNode[];
};

type ExplainResult = [{ Plan: ExplainNode }];

function walkPlan(node: ExplainNode, visit: (node: ExplainNode) => void) {
  visit(node);
  for (const child of node.Plans ?? []) {
    walkPlan(child, visit);
  }
}

function summarizePlan(plan: ExplainNode) {
  const nodeTypes = new Set<string>();
  const indexNames = new Set<string>();

  walkPlan(plan, (node) => {
    if (node['Node Type']) {
      nodeTypes.add(node['Node Type']);
    }
    if (node['Index Name']) {
      indexNames.add(node['Index Name']);
    }
  });

  return {
    nodeTypes: [...nodeTypes].sort(),
    indexNames: [...indexNames].sort(),
  };
}

function hasSequentialOrderScan(plan: ExplainNode) {
  let found = false;
  walkPlan(plan, (node) => {
    if (node['Node Type'] === 'Seq Scan') {
      found = true;
    }
  });
  return found;
}

async function assertRequiredIndexes(sql: postgres.Sql) {
  const rows = await sql<{ indexname: string }[]>`
    SELECT indexname
    FROM pg_indexes
    WHERE schemaname = current_schema()
      AND tablename IN ('orders', 'order_items')
      AND indexname = ANY(${sql.array([...REQUIRED_INDEXES])})
  `;
  const found = new Set(rows.map((row) => row.indexname));
  const missing = REQUIRED_INDEXES.filter((indexName) => !found.has(indexName));

  if (missing.length > 0) {
    throw new Error(`Missing required indexes after migrations: ${missing.join(', ')}`);
  }
}

async function seedRealisticOrders(sql: postgres.TransactionSql, tenantId: string, outletId: string) {
  await sql`
    INSERT INTO business_types (code, name, description, is_active)
    VALUES ('CAFE_RESTAURANT', 'Café & Restaurant', 'Query plan check seed', true)
    ON CONFLICT (code) DO NOTHING
  `;

  await sql`
    INSERT INTO tenants (id, name, slug, business_type, is_active)
    VALUES (${tenantId}, 'Query Plan Tenant', ${`query-plan-${tenantId}`}, 'CAFE_RESTAURANT', true)
  `;

  await sql`
    INSERT INTO outlets (id, tenant_id, name, slug, is_default, is_active)
    VALUES (${outletId}, ${tenantId}, 'Query Plan Outlet', 'query-plan', true, true)
  `;

  await sql`
    INSERT INTO orders (
      tenant_id,
      outlet_id,
      order_number,
      order_date,
      status,
      subtotal,
      tax_amount,
      service_charge,
      discount_amount,
      total,
      paid_amount,
      payment_status
    )
    SELECT
      ${tenantId}::uuid,
      ${outletId}::uuid,
      'QP-' || series::text,
      now() - (series || ' minutes')::interval,
      (ARRAY['draft', 'confirmed', 'preparing', 'ready', 'served', 'completed', 'cancelled'])[1 + (series % 7)],
      '100.00',
      '10.00',
      '0.00',
      '0.00',
      '110.00',
      CASE WHEN series % 3 = 0 THEN '110.00' ELSE '0.00' END,
      CASE WHEN series % 3 = 0 THEN 'paid' ELSE 'unpaid' END
    FROM generate_series(1, ${ORDER_QUERY_PLAN_ROWS}) AS series
  `;

  await sql`ANALYZE orders`;
  await sql`ANALYZE order_items`;
}

async function explain(sql: postgres.TransactionSql, query: string, tenantId: string, outletId: string) {
  const rows = await sql.unsafe(
    `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ${query}`,
    [tenantId, outletId],
  ) as { 'QUERY PLAN': ExplainResult }[];
  return rows[0]['QUERY PLAN'][0].Plan;
}

async function main() {
  const sql = postgres(DATABASE_URL!, {
    max: 1,
    idle_timeout: 5,
    connect_timeout: 10,
    prepare: false,
  });

  const tenantId = randomUUID();
  const outletId = randomUUID();

  try {
    await assertRequiredIndexes(sql);

    await sql.begin(async (tx) => {
      await seedRealisticOrders(tx, tenantId, outletId);

      for (const check of PLAN_CHECKS) {
        const plan = await explain(tx, check.sql, tenantId, outletId);
        const summary = summarizePlan(plan);
        const usesExpectedIndex = check.expectedIndexes.some((indexName) =>
          summary.indexNames.includes(indexName),
        );

        if (!usesExpectedIndex) {
          throw new Error(
            `${check.name} did not use any expected index. Expected one of ${check.expectedIndexes.join(', ')}; got ${summary.indexNames.join(', ') || 'no indexes'}`,
          );
        }

        if (hasSequentialOrderScan(plan)) {
          throw new Error(`${check.name} used a sequential scan on orders.`);
        }

        console.log(`[order-query-plans] ${check.name}`);
        console.log(`  nodes: ${summary.nodeTypes.join(', ')}`);
        console.log(`  indexes: ${summary.indexNames.join(', ')}`);
      }

      throw new Error('__ROLLBACK_QUERY_PLAN_SEED__');
    });
  } catch (error) {
    if (error instanceof Error && error.message === '__ROLLBACK_QUERY_PLAN_SEED__') {
      console.log(`[order-query-plans] passed with ${ORDER_QUERY_PLAN_ROWS} temporary order rows (rolled back).`);
      return;
    }
    throw error;
  } finally {
    await sql.end({ timeout: 5 });
  }
}

await main();
