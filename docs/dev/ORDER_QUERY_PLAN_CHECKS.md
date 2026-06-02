# Order Query Plan Checks

AuraPoS order reads are tenant-aware and, when outlet middleware resolves an outlet, outlet-scoped. The queue, history, and report/list endpoints all sort newest orders first, so the database needs indexes that match the common predicates and `ORDER BY order_date DESC` shape.

## Indexes added for order reads

Migration `migrations/0018_order_query_indexes.sql` adds these idempotent indexes:

- `orders_tenant_outlet_status_order_date_desc_idx` on `orders(tenant_id, outlet_id, status, order_date DESC)` for queue/history status-filtered reads.
- `orders_tenant_outlet_order_date_desc_idx` on `orders(tenant_id, outlet_id, order_date DESC)` for report/list date-range reads and order-by pagination.
- `order_items_order_idx` on `order_items(order_id)` is re-declared with `CREATE INDEX IF NOT EXISTS` as a drift-cleanup confirmation. It already exists in the base migration and schema, and this keeps migrated databases aligned before repository item hydration runs `WHERE order_id IN (...)`.

The Drizzle schema mirrors these indexes in `shared/schema.ts`.

## Repository query shape

`OrderRepository.buildFilterConditions` builds predicates in this prefix order:

1. `tenant_id`
2. `outlet_id`
3. `status`
4. `order_date` range
5. `payment_status`

PostgreSQL can reorder predicates internally, but keeping this order in code makes the queue/history/report query shape easy to compare with the composite indexes and the EXPLAIN checks.

## Running the query plan check

Use a PostgreSQL database with migrations applied:

```bash
DATABASE_URL=postgres://user:pass@host:5432/db pnpm --filter @pos/api check:order-query-plans
```

Optional row count override:

```bash
ORDER_QUERY_PLAN_ROWS=50000 DATABASE_URL=postgres://user:pass@host:5432/db pnpm --filter @pos/api check:order-query-plans
```

The script:

1. Confirms all three required indexes are present in the current schema.
2. Opens a transaction and inserts a temporary tenant, outlet, and realistic order volume.
3. Runs `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)` for:
   - queue/open orders (`/api/orders/open` shape),
   - order history rows and pagination count (`/api/orders/history` shape),
   - report/list order rows and pagination count (`/api/orders` report dashboard shape).
4. Fails if a checked query does not use one of the expected order indexes or if it uses a sequential scan on `orders`.
5. Rolls the seed transaction back after the checks.

Because the script uses real PostgreSQL planning and temporary seeded rows, run it after migration drift cleanup and after applying `0018_order_query_indexes.sql` in staging/production-like databases.
