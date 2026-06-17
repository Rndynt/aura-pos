-- Customer display (CFD) devices and offline sync engine tables.
-- Dependencies: tenants, outlets.

-- ── Terminal Registry ─────────────────────────────────────────────────────────
CREATE TABLE "terminals" (
  "id"                 uuid        PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id"          uuid        NOT NULL,
  "outlet_id"          uuid,
  "terminal_code"      varchar(128) NOT NULL,
  "name"               text        NOT NULL DEFAULT 'Cashier',
  "device_fingerprint" text,
  "is_active"          boolean     NOT NULL DEFAULT true,
  "last_seen_at"       timestamp,
  "created_at"         timestamp   NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"         timestamp   NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "terminals_tenant_id_tenants_id_fk"
    FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action,
  CONSTRAINT "terminals_outlet_id_outlets_id_fk"
    FOREIGN KEY ("outlet_id") REFERENCES "public"."outlets"("id") ON DELETE set null ON UPDATE no action
);



CREATE INDEX "terminals_tenant_idx"  ON "terminals" ("tenant_id");
CREATE INDEX "terminals_outlet_idx"  ON "terminals" ("outlet_id");
CREATE UNIQUE INDEX "terminals_tenant_code_unique" ON "terminals" ("tenant_id", "terminal_code");

-- ── Sync Batches (audit log per sync call) ────────────────────────────────────
CREATE TABLE "sync_batches" (
  "id"             uuid        PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id"      uuid        NOT NULL,
  "outlet_id"      uuid,
  "terminal_id"    varchar,
  "batch_size"     integer     NOT NULL DEFAULT 0,
  "synced_count"   integer     NOT NULL DEFAULT 0,
  "replayed_count" integer     NOT NULL DEFAULT 0,
  "failed_count"   integer     NOT NULL DEFAULT 0,
  "conflict_count" integer     NOT NULL DEFAULT 0,
  "app_version"    varchar(64),
  "created_at"     timestamp   NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "sync_batches_tenant_id_tenants_id_fk"
    FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action,
  CONSTRAINT "sync_batches_outlet_id_outlets_id_fk"
    FOREIGN KEY ("outlet_id") REFERENCES "public"."outlets"("id") ON DELETE set null ON UPDATE no action
);



CREATE INDEX "sync_batches_tenant_idx"   ON "sync_batches" ("tenant_id");
CREATE INDEX "sync_batches_outlet_idx"   ON "sync_batches" ("outlet_id");
CREATE INDEX "sync_batches_terminal_idx" ON "sync_batches" ("terminal_id");

-- ── Sync Events (per-item result within a batch) ──────────────────────────────
CREATE TABLE "sync_events" (
  "id"                  uuid        PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id"           uuid        NOT NULL,
  "outlet_id"           uuid,
  "terminal_id"         varchar,
  "batch_id"            uuid,
  "entity_type"         varchar(50) NOT NULL DEFAULT 'order',
  "local_entity_id"     varchar(128),
  "server_entity_id"    varchar,
  "local_order_number"  varchar(128),
  "server_order_number" text,
  "status"              varchar(50) NOT NULL,
  "error"               text,
  "created_at"          timestamp   NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "sync_events_tenant_id_tenants_id_fk"
    FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action,
  CONSTRAINT "sync_events_outlet_id_outlets_id_fk"
    FOREIGN KEY ("outlet_id") REFERENCES "public"."outlets"("id") ON DELETE set null ON UPDATE no action,
  CONSTRAINT "sync_events_batch_id_sync_batches_id_fk"
    FOREIGN KEY ("batch_id") REFERENCES "public"."sync_batches"("id") ON DELETE cascade ON UPDATE no action
);




CREATE INDEX "sync_events_tenant_idx"       ON "sync_events" ("tenant_id");
CREATE INDEX "sync_events_outlet_idx"       ON "sync_events" ("outlet_id");
CREATE INDEX "sync_events_batch_idx"        ON "sync_events" ("batch_id");
CREATE INDEX "sync_events_local_entity_idx" ON "sync_events" ("local_entity_id");

-- ── Server-Side Sync Conflicts ────────────────────────────────────────────────
CREATE TABLE "server_sync_conflicts" (
  "id"              uuid        PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id"       uuid        NOT NULL,
  "outlet_id"       uuid,
  "terminal_id"     varchar,
  "local_order_id"  varchar(128),
  "server_order_id" uuid,
  "conflict_type"   varchar(50) NOT NULL,
  "message"         text        NOT NULL,
  "conflict_data"   jsonb,
  "resolution"      varchar(30) NOT NULL DEFAULT 'pending',
  "resolved_at"     timestamp,
  "resolved_by"     varchar(255),
  "created_at"      timestamp   NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "server_sync_conflicts_tenant_id_tenants_id_fk"
    FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action,
  CONSTRAINT "server_sync_conflicts_outlet_id_outlets_id_fk"
    FOREIGN KEY ("outlet_id") REFERENCES "public"."outlets"("id") ON DELETE set null ON UPDATE no action
);



CREATE INDEX "server_sync_conflicts_tenant_idx"   ON "server_sync_conflicts" ("tenant_id");
CREATE INDEX "server_sync_conflicts_outlet_idx"   ON "server_sync_conflicts" ("outlet_id");
CREATE INDEX "server_sync_conflicts_terminal_idx" ON "server_sync_conflicts" ("terminal_id");

-- ── CFD Devices (managed outside Drizzle schema) ──────────────────────────────
-- api_key stores only a SHA-256 hex hash of the raw CFD token.
CREATE TABLE "cfd_devices" (
  "id"          uuid        PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id"   uuid        NOT NULL,
  "device_name" text,
  "api_key"     text,
  "status"      varchar(50) NOT NULL DEFAULT 'active',
  "created_at"  timestamptz NOT NULL DEFAULT now(),
  "activated_at" timestamptz,
  "last_seen_at" timestamptz,
  "revoked_at"  timestamptz,
  CONSTRAINT "cfd_devices_tenant_id_tenants_id_fk"
    FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action
);


CREATE INDEX "cfd_devices_tenant_status_idx"
  ON "cfd_devices" ("tenant_id", "status");
CREATE INDEX "cfd_devices_active_api_key_idx"
  ON "cfd_devices" ("api_key")
  WHERE "status" = 'active' AND "api_key" IS NOT NULL;
