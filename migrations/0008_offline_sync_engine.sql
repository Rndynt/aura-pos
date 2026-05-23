-- Sprint 4: Offline Sync Engine
-- Adds terminal registry, sync audit tables, and offline metadata fields to orders

-- Add offline sync metadata fields to orders table (nullable, backwards-compatible)
ALTER TABLE orders ADD COLUMN IF NOT EXISTS source_terminal_id varchar(128);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS client_created_at timestamp;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS local_order_id varchar(128);

-- Index for looking up offline orders by terminal + local ID
CREATE INDEX IF NOT EXISTS orders_source_terminal_local_order_idx
  ON orders(source_terminal_id, local_order_id)
  WHERE source_terminal_id IS NOT NULL;

-- ── Terminal Registry ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS terminals (
  id              varchar         PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       varchar         NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  terminal_code   varchar(128)    NOT NULL,
  name            text            NOT NULL DEFAULT 'Cashier',
  device_fingerprint text,
  is_active       boolean         NOT NULL DEFAULT true,
  last_seen_at    timestamp,
  created_at      timestamp       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      timestamp       NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS terminals_tenant_code_unique
  ON terminals(tenant_id, terminal_code);
CREATE INDEX IF NOT EXISTS terminals_tenant_idx ON terminals(tenant_id);

-- ── Sync Batches (audit log per sync call) ────────────────────────────────────
CREATE TABLE IF NOT EXISTS sync_batches (
  id              varchar         PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       varchar         NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  terminal_id     varchar,
  batch_size      integer         NOT NULL DEFAULT 0,
  synced_count    integer         NOT NULL DEFAULT 0,
  replayed_count  integer         NOT NULL DEFAULT 0,
  failed_count    integer         NOT NULL DEFAULT 0,
  conflict_count  integer         NOT NULL DEFAULT 0,
  app_version     varchar(64),
  created_at      timestamp       NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS sync_batches_tenant_idx   ON sync_batches(tenant_id);
CREATE INDEX IF NOT EXISTS sync_batches_terminal_idx ON sync_batches(terminal_id);
CREATE INDEX IF NOT EXISTS sync_batches_created_idx  ON sync_batches(created_at);

-- ── Sync Events (per-item result within a batch) ──────────────────────────────
CREATE TABLE IF NOT EXISTS sync_events (
  id                  varchar         PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           varchar         NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  terminal_id         varchar,
  batch_id            varchar         REFERENCES sync_batches(id) ON DELETE CASCADE,
  entity_type         varchar(50)     NOT NULL DEFAULT 'order',
  local_entity_id     varchar(128),
  server_entity_id    varchar,
  local_order_number  varchar(128),
  server_order_number text,
  status              varchar(50)     NOT NULL,
  error               text,
  created_at          timestamp       NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS sync_events_tenant_idx       ON sync_events(tenant_id);
CREATE INDEX IF NOT EXISTS sync_events_batch_idx        ON sync_events(batch_id);
CREATE INDEX IF NOT EXISTS sync_events_local_entity_idx ON sync_events(local_entity_id);

-- ── Server-Side Sync Conflicts ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS server_sync_conflicts (
  id              varchar         PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       varchar         NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  terminal_id     varchar,
  local_order_id  varchar(128),
  conflict_type   varchar(50)     NOT NULL,
  message         text            NOT NULL,
  created_at      timestamp       NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS server_sync_conflicts_tenant_idx    ON server_sync_conflicts(tenant_id);
CREATE INDEX IF NOT EXISTS server_sync_conflicts_terminal_idx  ON server_sync_conflicts(terminal_id);
