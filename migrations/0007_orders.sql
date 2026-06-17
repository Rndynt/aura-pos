-- Orders, order items, item modifiers, and payments.
-- Dependencies: tenants, outlets, order_types, products.

CREATE TABLE "orders" (
  "id"                  uuid           PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id"           uuid           NOT NULL,
  "outlet_id"           uuid,
  "order_type_id"       uuid,
  "sales_channel"       varchar(50),
  "order_number"        text           NOT NULL,
  "order_date"          timestamp      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "status"              varchar(50)    NOT NULL DEFAULT 'draft',
  "subtotal"            numeric(10, 2) NOT NULL DEFAULT '0',
  "tax_amount"          numeric(10, 2) NOT NULL DEFAULT '0',
  "service_charge"      numeric(10, 2) NOT NULL DEFAULT '0',
  "discount_amount"     numeric(10, 2) NOT NULL DEFAULT '0',
  "total"               numeric(10, 2) NOT NULL DEFAULT '0',
  "paid_amount"         numeric(10, 2) NOT NULL DEFAULT '0',
  "payment_status"      varchar(50)    NOT NULL DEFAULT 'unpaid',
  "customer_name"       text,
  "table_number"        text,
  "notes"               text,
  "idempotency_key"     varchar(128),
  "closed_at"           timestamp,
  "cancellation_reason" text,
  "source_terminal_id"  varchar(128),
  "client_created_at"   timestamp,
  "local_order_id"      varchar(128),
  "created_at"          timestamp      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"          timestamp      NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "order_items" (
  "id"            uuid           PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "order_id"      uuid           NOT NULL,
  "product_id"    uuid           NOT NULL,
  "product_name"  text           NOT NULL,
  "variant_id"    uuid,
  "variant_name"  text,
  "quantity"      integer        NOT NULL DEFAULT 1,
  "unit_price"    numeric(10, 2) NOT NULL,
  "item_subtotal" numeric(10, 2) NOT NULL,
  "notes"         text,
  "status"        varchar(50)    NOT NULL DEFAULT 'pending',
  "created_at"    timestamp      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"    timestamp      NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "order_item_modifiers" (
  "id"                uuid           PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "order_item_id"     uuid           NOT NULL,
  "option_group_id"   uuid           NOT NULL,
  "option_group_name" text           NOT NULL,
  "option_id"         uuid           NOT NULL,
  "option_name"       text           NOT NULL,
  "price_delta"       numeric(10, 2) NOT NULL DEFAULT '0',
  "created_at"        timestamp      NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "order_payments" (
  "id"               uuid           PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "order_id"         uuid           NOT NULL,
  "payment_method"   varchar(50)    NOT NULL,
  "amount"           numeric(10, 2) NOT NULL,
  "payment_date"     timestamp      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "reference_number" text,
  "notes"            text,
  "idempotency_key"  varchar(128),
  "created_at"       timestamp      NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ── Foreign keys ──────────────────────────────────────────────────────────────
ALTER TABLE "orders"
  ADD CONSTRAINT "orders_tenant_id_tenants_id_fk"
  FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "orders"
  ADD CONSTRAINT "orders_outlet_id_outlets_id_fk"
  FOREIGN KEY ("outlet_id") REFERENCES "public"."outlets"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "orders"
  ADD CONSTRAINT "orders_order_type_id_order_types_id_fk"
  FOREIGN KEY ("order_type_id") REFERENCES "public"."order_types"("id") ON DELETE no action ON UPDATE no action;

ALTER TABLE "order_items"
  ADD CONSTRAINT "order_items_order_id_orders_id_fk"
  FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "order_items"
  ADD CONSTRAINT "order_items_product_id_products_id_fk"
  FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;

ALTER TABLE "order_item_modifiers"
  ADD CONSTRAINT "order_item_modifiers_order_item_id_order_items_id_fk"
  FOREIGN KEY ("order_item_id") REFERENCES "public"."order_items"("id") ON DELETE cascade ON UPDATE no action;

ALTER TABLE "order_payments"
  ADD CONSTRAINT "order_payments_order_id_orders_id_fk"
  FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;

-- ── Indexes ───────────────────────────────────────────────────────────────────
CREATE INDEX "orders_tenant_idx"
  ON "orders" ("tenant_id");
CREATE INDEX "orders_outlet_idx"
  ON "orders" ("outlet_id");
CREATE INDEX "orders_order_type_idx"
  ON "orders" ("order_type_id");
CREATE INDEX "orders_sales_channel_idx"
  ON "orders" ("sales_channel");
CREATE INDEX "orders_order_number_idx"
  ON "orders" ("order_number");
CREATE INDEX "orders_status_idx"
  ON "orders" ("status");
CREATE INDEX "orders_order_date_idx"
  ON "orders" ("order_date");
CREATE INDEX "orders_tenant_status_date_idx"
  ON "orders" ("tenant_id", "status", "order_date");
CREATE INDEX "orders_tenant_outlet_status_order_date_desc_idx"
  ON "orders" ("tenant_id", "outlet_id", "status", "order_date" DESC);
CREATE INDEX "orders_tenant_outlet_order_date_desc_idx"
  ON "orders" ("tenant_id", "outlet_id", "order_date" DESC);
CREATE INDEX "orders_tenant_payment_status_idx"
  ON "orders" ("tenant_id", "payment_status");
CREATE INDEX "orders_source_terminal_local_order_idx"
  ON "orders" ("source_terminal_id", "local_order_id")
  WHERE "source_terminal_id" IS NOT NULL;

CREATE UNIQUE INDEX "orders_tenant_order_number_unique"
  ON "orders" ("tenant_id", "order_number");
CREATE UNIQUE INDEX "orders_tenant_idempotency_unique"
  ON "orders" ("tenant_id", "idempotency_key")
  WHERE "idempotency_key" IS NOT NULL;

CREATE INDEX "order_items_order_idx"
  ON "order_items" ("order_id");
CREATE INDEX "order_items_product_idx"
  ON "order_items" ("product_id");

CREATE INDEX "order_item_modifiers_order_item_idx"
  ON "order_item_modifiers" ("order_item_id");

CREATE INDEX "order_payments_order_idx"
  ON "order_payments" ("order_id");
CREATE INDEX "order_payments_payment_date_idx"
  ON "order_payments" ("payment_date");
CREATE UNIQUE INDEX "order_payments_order_id_idempotency_unique"
  ON "order_payments" ("order_id", "idempotency_key")
  WHERE "idempotency_key" IS NOT NULL;
