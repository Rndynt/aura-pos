-- Restaurant table / seating management.
-- Dependencies: tenants, outlets.
-- current_order_id is a soft reference to orders — no FK to avoid circular dependency.

CREATE TABLE "tables" (
  "id"               uuid        PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id"        uuid        NOT NULL,
  "outlet_id"        uuid,
  "table_number"     varchar     NOT NULL,
  "table_name"       text,
  "floor"            varchar,
  "capacity"         integer,
  "status"           varchar(20) NOT NULL DEFAULT 'available',
  "current_order_id" uuid,
  "created_at"       timestamp   NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"       timestamp   NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "tables_tenant_id_tenants_id_fk"
    FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action,
  CONSTRAINT "tables_outlet_id_outlets_id_fk"
    FOREIGN KEY ("outlet_id") REFERENCES "public"."outlets"("id") ON DELETE cascade ON UPDATE no action
);

-- ── Indexes ───────────────────────────────────────────────────────────────────
CREATE INDEX "tables_tenant_idx"
  ON "tables" ("tenant_id");
CREATE INDEX "tables_outlet_idx"
  ON "tables" ("outlet_id");
CREATE INDEX "tables_status_idx"
  ON "tables" ("status");
-- Partial unique: table number unique per outlet (NULL outlet_id rows are excluded).
CREATE UNIQUE INDEX "tables_unique_per_outlet"
  ON "tables" ("tenant_id", "outlet_id", "table_number")
  WHERE "outlet_id" IS NOT NULL;
