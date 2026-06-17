-- Inventory ledger and sync error/retry queue.
-- Dependencies: tenants, outlets, products, orders.

CREATE TABLE "inventory_movements" (
  "id"             uuid           PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id"      uuid           NOT NULL,
  "outlet_id"      uuid,
  "product_id"     uuid           NOT NULL,
  "order_id"       uuid,
  "payment_id"     uuid,
  "reference_type" varchar(50),
  "reference_id"   text,
  "metadata"       jsonb,
  "terminal_id"    varchar(255),
  "movement_type"  varchar(30)    NOT NULL,
  "quantity_delta" integer        NOT NULL,
  "quantity_before" integer,
  "quantity_after"  integer,
  "unit_cost"      numeric(10, 2),
  "notes"          text,
  "actor_id"       varchar(255),
  "created_at"     timestamp      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "inventory_movements_tenant_id_tenants_id_fk"
    FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action,
  CONSTRAINT "inventory_movements_outlet_id_outlets_id_fk"
    FOREIGN KEY ("outlet_id") REFERENCES "public"."outlets"("id") ON DELETE set null ON UPDATE no action,
  CONSTRAINT "inventory_movements_product_id_products_id_fk"
    FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action,
  CONSTRAINT "inventory_movements_order_id_orders_id_fk"
    FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE set null ON UPDATE no action
);

CREATE TABLE "inventory_sync_errors" (
  "id"            uuid        PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id"     uuid        NOT NULL,
  "outlet_id"     uuid,
  "order_id"      uuid,
  "product_id"    uuid,
  "operation"     varchar(40) NOT NULL,
  "status"        varchar(20) NOT NULL DEFAULT 'pending',
  "payload"       jsonb       NOT NULL,
  "last_error"    text        NOT NULL,
  "retry_count"   integer     NOT NULL DEFAULT 0,
  "next_retry_at" timestamp   NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "resolved_at"   timestamp,
  "created_at"    timestamp   NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"    timestamp   NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "inventory_sync_errors_tenant_id_tenants_id_fk"
    FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action,
  CONSTRAINT "inventory_sync_errors_outlet_id_outlets_id_fk"
    FOREIGN KEY ("outlet_id") REFERENCES "public"."outlets"("id") ON DELETE set null ON UPDATE no action,
  CONSTRAINT "inventory_sync_errors_order_id_orders_id_fk"
    FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE set null ON UPDATE no action,
  CONSTRAINT "inventory_sync_errors_product_id_products_id_fk"
    FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE set null ON UPDATE no action
);





-- ── Indexes ───────────────────────────────────────────────────────────────────
CREATE INDEX "inventory_movements_tenant_idx"
  ON "inventory_movements" ("tenant_id");
CREATE INDEX "inventory_movements_outlet_idx"
  ON "inventory_movements" ("outlet_id");
CREATE INDEX "inventory_movements_product_idx"
  ON "inventory_movements" ("product_id");
CREATE INDEX "inventory_movements_order_idx"
  ON "inventory_movements" ("order_id");
CREATE INDEX "inventory_movements_payment_idx"
  ON "inventory_movements" ("payment_id");
CREATE INDEX "inventory_movements_reference_idx"
  ON "inventory_movements" ("reference_type", "reference_id");
-- Idempotency: one sale/return ledger row per (order, product, movement_type).
CREATE UNIQUE INDEX "inventory_movements_order_product_movement_unique"
  ON "inventory_movements" ("order_id", "product_id", "movement_type")
  WHERE "order_id" IS NOT NULL;

CREATE INDEX "inventory_sync_errors_tenant_idx"
  ON "inventory_sync_errors" ("tenant_id");
CREATE INDEX "inventory_sync_errors_status_next_retry_idx"
  ON "inventory_sync_errors" ("status", "next_retry_at");
CREATE INDEX "inventory_sync_errors_order_idx"
  ON "inventory_sync_errors" ("order_id");
CREATE INDEX "inventory_sync_errors_product_idx"
  ON "inventory_sync_errors" ("product_id");
