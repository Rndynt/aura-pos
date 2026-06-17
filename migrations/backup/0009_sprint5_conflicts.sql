-- Sprint 5: Conflict data enrichment + Inventory Ledger
-- Applied: 2026-05-24

-- Enrich server_sync_conflicts with resolution tracking + per-conflict data
ALTER TABLE server_sync_conflicts ADD COLUMN IF NOT EXISTS server_order_id varchar;
ALTER TABLE server_sync_conflicts ADD COLUMN IF NOT EXISTS conflict_data jsonb;
ALTER TABLE server_sync_conflicts ADD COLUMN IF NOT EXISTS resolution varchar(30) NOT NULL DEFAULT 'pending';
ALTER TABLE server_sync_conflicts ADD COLUMN IF NOT EXISTS resolved_at timestamp;
ALTER TABLE server_sync_conflicts ADD COLUMN IF NOT EXISTS resolved_by varchar(255);

-- Inventory Movements Ledger
CREATE TABLE IF NOT EXISTS inventory_movements (
  id                varchar        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         varchar        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  product_id        varchar        NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  order_id          varchar        REFERENCES orders(id) ON DELETE SET NULL,
  terminal_id       varchar(255),
  movement_type     varchar(30)    NOT NULL,
  quantity_delta    integer        NOT NULL,
  quantity_before   integer,
  quantity_after    integer,
  unit_cost         decimal(10,2),
  notes             text,
  actor_id          varchar(255),
  created_at        timestamp      NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS inventory_movements_tenant_idx  ON inventory_movements(tenant_id);
CREATE INDEX IF NOT EXISTS inventory_movements_product_idx ON inventory_movements(product_id);
CREATE INDEX IF NOT EXISTS inventory_movements_order_idx   ON inventory_movements(order_id);
