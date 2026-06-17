-- Product catalog: categories, products, outlet configs, option groups, options.
-- Dependencies: tenants, outlets.

CREATE TABLE "product_categories" (
  "id"            uuid      PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id"     uuid      NOT NULL,
  "name"          text      NOT NULL,
  "description"   text,
  "is_active"     boolean   NOT NULL DEFAULT true,
  "display_order" integer   NOT NULL DEFAULT 0,
  "created_at"    timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"    timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "product_categories_tenant_id_tenants_id_fk"
    FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action
);

CREATE TABLE "products" (
  "id"                    uuid           PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id"             uuid           NOT NULL,
  "category_id"           uuid,
  "name"                  text           NOT NULL,
  "description"           text,
  "base_price"            numeric(10, 2) NOT NULL,
  "category"              text           NOT NULL,
  "image_url"             text,
  "metadata"              jsonb,
  "has_variants"          boolean        NOT NULL DEFAULT false,
  "stock_tracking_enabled" boolean       NOT NULL DEFAULT false,
  "stock_qty"             integer,
  "sku"                   text,
  "is_active"             boolean        NOT NULL DEFAULT true,
  "created_at"            timestamp      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"            timestamp      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "products_tenant_id_tenants_id_fk"
    FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action,
  CONSTRAINT "products_category_id_product_categories_id_fk"
    FOREIGN KEY ("category_id") REFERENCES "public"."product_categories"("id") ON DELETE set null ON UPDATE no action
);

-- Per-outlet product availability override (hybrid catalog).
CREATE TABLE "outlet_product_configs" (
  "id"           uuid      PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "outlet_id"    uuid      NOT NULL,
  "product_id"   uuid      NOT NULL,
  "is_available" boolean   NOT NULL DEFAULT true,
  "created_at"   timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"   timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "outlet_product_configs_outlet_id_outlets_id_fk"
    FOREIGN KEY ("outlet_id") REFERENCES "public"."outlets"("id") ON DELETE cascade ON UPDATE no action,
  CONSTRAINT "outlet_product_configs_product_id_products_id_fk"
    FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action
);

CREATE TABLE "product_option_groups" (
  "id"              uuid         PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id"       uuid         NOT NULL,
  "product_id"      uuid         NOT NULL,
  "name"            text         NOT NULL,
  "selection_type"  varchar(20)  NOT NULL,
  "min_selections"  integer      NOT NULL DEFAULT 0,
  "max_selections"  integer      NOT NULL DEFAULT 1,
  "is_required"     boolean      NOT NULL DEFAULT false,
  "display_order"   integer      NOT NULL DEFAULT 0,
  "created_at"      timestamp    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"      timestamp    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "product_option_groups_tenant_id_tenants_id_fk"
    FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action,
  CONSTRAINT "product_option_groups_product_id_products_id_fk"
    FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action
);

CREATE TABLE "product_options" (
  "id"              uuid           PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id"       uuid           NOT NULL,
  "option_group_id" uuid           NOT NULL,
  "name"            text           NOT NULL,
  "price_delta"     numeric(10, 2) NOT NULL DEFAULT '0',
  "inventory_sku"   text,
  "is_available"    boolean        NOT NULL DEFAULT true,
  "display_order"   integer        NOT NULL DEFAULT 0,
  "created_at"      timestamp      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"      timestamp      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "product_options_tenant_id_tenants_id_fk"
    FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action,
  CONSTRAINT "product_options_option_group_id_product_option_groups_id_fk"
    FOREIGN KEY ("option_group_id") REFERENCES "public"."product_option_groups"("id") ON DELETE cascade ON UPDATE no action
);






-- ── Indexes ───────────────────────────────────────────────────────────────────
CREATE INDEX "product_categories_tenant_idx"
  ON "product_categories" ("tenant_id");
CREATE UNIQUE INDEX "product_categories_tenant_name_unique"
  ON "product_categories" ("tenant_id", "name");

CREATE INDEX "products_tenant_idx"
  ON "products" ("tenant_id");
CREATE INDEX "products_category_idx"
  ON "products" ("category");

CREATE INDEX "outlet_product_configs_outlet_idx"
  ON "outlet_product_configs" ("outlet_id");
CREATE INDEX "outlet_product_configs_product_idx"
  ON "outlet_product_configs" ("product_id");
CREATE UNIQUE INDEX "outlet_product_configs_unique"
  ON "outlet_product_configs" ("outlet_id", "product_id");

CREATE INDEX "product_option_groups_tenant_idx"
  ON "product_option_groups" ("tenant_id");
CREATE INDEX "product_option_groups_product_idx"
  ON "product_option_groups" ("product_id");

CREATE INDEX "product_options_tenant_idx"
  ON "product_options" ("tenant_id");
CREATE INDEX "product_options_option_group_idx"
  ON "product_options" ("option_group_id");
