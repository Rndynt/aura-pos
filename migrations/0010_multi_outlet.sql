-- Sprint 6: Multi-Outlet Architecture
-- Every tenant gets 1 default outlet ("Cabang Utama") on registration.
-- Additional outlets require multi_outlet feature purchase (Rp 10.000/month each).
-- Applied: 2026-05-24

-- ── 1. Create outlets table ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS outlets (
  id            varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     varchar NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name          text NOT NULL DEFAULT 'Cabang Utama',
  slug          varchar(100) NOT NULL DEFAULT 'main',
  address       text,
  phone         varchar(50),
  is_default    boolean NOT NULL DEFAULT false,
  is_active     boolean NOT NULL DEFAULT true,
  created_at    timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS outlets_tenant_idx ON outlets (tenant_id);
CREATE UNIQUE INDEX IF NOT EXISTS outlets_tenant_slug_unique ON outlets (tenant_id, slug);

-- ── 2. Create user_outlet_assignments table ───────────────────────────────────
CREATE TABLE IF NOT EXISTS user_outlet_assignments (
  id         varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    varchar NOT NULL,
  outlet_id  varchar NOT NULL REFERENCES outlets(id) ON DELETE CASCADE,
  role       varchar(50) NOT NULL DEFAULT 'staff',
  is_active  boolean NOT NULL DEFAULT true,
  created_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS user_outlet_assignments_user_idx ON user_outlet_assignments (user_id);
CREATE INDEX IF NOT EXISTS user_outlet_assignments_outlet_idx ON user_outlet_assignments (outlet_id);
CREATE UNIQUE INDEX IF NOT EXISTS user_outlet_assignments_unique ON user_outlet_assignments (user_id, outlet_id);

-- ── 3. Create outlet_product_configs table ────────────────────────────────────
CREATE TABLE IF NOT EXISTS outlet_product_configs (
  id           varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  outlet_id    varchar NOT NULL REFERENCES outlets(id) ON DELETE CASCADE,
  product_id   varchar NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  is_available boolean NOT NULL DEFAULT true,
  created_at   timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at   timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS outlet_product_configs_outlet_idx ON outlet_product_configs (outlet_id);
CREATE INDEX IF NOT EXISTS outlet_product_configs_product_idx ON outlet_product_configs (product_id);
CREATE UNIQUE INDEX IF NOT EXISTS outlet_product_configs_unique ON outlet_product_configs (outlet_id, product_id);

-- ── 4. Seed 1 default outlet per existing tenant ──────────────────────────────
INSERT INTO outlets (id, tenant_id, name, slug, address, phone, is_default, is_active)
SELECT
  gen_random_uuid(),
  id,
  'Cabang Utama',
  'main',
  business_address,
  business_phone,
  true,
  true
FROM tenants
WHERE NOT EXISTS (
  SELECT 1 FROM outlets o WHERE o.tenant_id = tenants.id
);

-- ── 5. Add outlet_id to operational tables (all nullable for backward compat) ─

ALTER TABLE tables
  ADD COLUMN IF NOT EXISTS outlet_id varchar REFERENCES outlets(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS tables_outlet_idx ON tables (outlet_id);

-- Drop old unique constraint (was per tenant+tableNumber), replace with per outlet
DROP INDEX IF EXISTS tables_unique_per_tenant;
CREATE UNIQUE INDEX IF NOT EXISTS tables_unique_per_outlet
  ON tables (tenant_id, outlet_id, table_number)
  WHERE outlet_id IS NOT NULL;

ALTER TABLE tenant_order_types
  ADD COLUMN IF NOT EXISTS outlet_id varchar REFERENCES outlets(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS tenant_order_types_outlet_idx ON tenant_order_types (outlet_id);

-- Drop old unique (tenant+orderType), now allow per-outlet overrides
DROP INDEX IF EXISTS tenant_order_types_tenant_order_type_unique;

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS outlet_id varchar REFERENCES outlets(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS orders_outlet_idx ON orders (outlet_id);

ALTER TABLE kitchen_tickets
  ADD COLUMN IF NOT EXISTS outlet_id varchar REFERENCES outlets(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS kitchen_tickets_outlet_idx ON kitchen_tickets (outlet_id);

ALTER TABLE terminals
  ADD COLUMN IF NOT EXISTS outlet_id varchar REFERENCES outlets(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS terminals_outlet_idx ON terminals (outlet_id);

ALTER TABLE sync_batches
  ADD COLUMN IF NOT EXISTS outlet_id varchar REFERENCES outlets(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS sync_batches_outlet_idx ON sync_batches (outlet_id);

ALTER TABLE sync_events
  ADD COLUMN IF NOT EXISTS outlet_id varchar REFERENCES outlets(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS sync_events_outlet_idx ON sync_events (outlet_id);

ALTER TABLE server_sync_conflicts
  ADD COLUMN IF NOT EXISTS outlet_id varchar REFERENCES outlets(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS server_sync_conflicts_outlet_idx ON server_sync_conflicts (outlet_id);

ALTER TABLE inventory_movements
  ADD COLUMN IF NOT EXISTS outlet_id varchar REFERENCES outlets(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS inventory_movements_outlet_idx ON inventory_movements (outlet_id);

-- ── 6. Backfill outlet_id on all operational tables from default outlet ────────
-- Use subquery to find each tenant's default outlet

UPDATE tables t
SET outlet_id = (
  SELECT o.id FROM outlets o
  WHERE o.tenant_id = t.tenant_id AND o.is_default = true
  LIMIT 1
)
WHERE t.outlet_id IS NULL;

UPDATE tenant_order_types tot
SET outlet_id = NULL
WHERE tot.outlet_id IS NULL;
-- Note: NULL outlet_id in tenant_order_types means "applies to all outlets" — intentional

UPDATE orders ord
SET outlet_id = (
  SELECT o.id FROM outlets o
  WHERE o.tenant_id = ord.tenant_id AND o.is_default = true
  LIMIT 1
)
WHERE ord.outlet_id IS NULL;

UPDATE kitchen_tickets kt
SET outlet_id = (
  SELECT o.id FROM outlets o
  WHERE o.tenant_id = kt.tenant_id AND o.is_default = true
  LIMIT 1
)
WHERE kt.outlet_id IS NULL;

UPDATE terminals trm
SET outlet_id = (
  SELECT o.id FROM outlets o
  WHERE o.tenant_id = trm.tenant_id AND o.is_default = true
  LIMIT 1
)
WHERE trm.outlet_id IS NULL;

UPDATE inventory_movements im
SET outlet_id = (
  SELECT o.id FROM outlets o
  WHERE o.tenant_id = im.tenant_id AND o.is_default = true
  LIMIT 1
)
WHERE im.outlet_id IS NULL;

-- ── 7. Add kds_devices outlet_id (managed outside drizzle schema) ─────────────
ALTER TABLE kds_devices
  ADD COLUMN IF NOT EXISTS outlet_id varchar;
CREATE INDEX IF NOT EXISTS kds_devices_outlet_idx ON kds_devices (outlet_id);

UPDATE kds_devices kd
SET outlet_id = (
  SELECT o.id FROM outlets o
  WHERE o.tenant_id = kd.tenant_id AND o.is_default = true
  LIMIT 1
)
WHERE kd.outlet_id IS NULL;
