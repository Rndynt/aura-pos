-- Global and tenant order type configuration, plus order number sequences.
-- Dependencies: tenants, outlets.

CREATE TABLE "order_types" (
  "id"                    uuid        PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "code"                  varchar(50) NOT NULL,
  "name"                  text        NOT NULL,
  "description"           text,
  "is_on_premise"         boolean     NOT NULL DEFAULT false,
  "need_table_number"     boolean     NOT NULL DEFAULT false,
  "need_address"          boolean     NOT NULL DEFAULT false,
  "allow_scheduled"       boolean     NOT NULL DEFAULT false,
  "is_digital_product"    boolean     NOT NULL DEFAULT false,
  "affects_service_charge" boolean    NOT NULL DEFAULT false,
  "is_active"             boolean     NOT NULL DEFAULT true,
  "created_at"            timestamp   NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"            timestamp   NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "order_types_code_unique" UNIQUE ("code")
);

-- outlet_id NULL means the config applies to all outlets of that tenant.
CREATE TABLE "tenant_order_types" (
  "id"            uuid      PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id"     uuid      NOT NULL,
  "outlet_id"     uuid,
  "order_type_id" uuid      NOT NULL,
  "is_enabled"    boolean   NOT NULL DEFAULT true,
  "config"        json,
  "created_at"    timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"    timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "tenant_order_types_tenant_id_tenants_id_fk"
    FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action,
  CONSTRAINT "tenant_order_types_outlet_id_outlets_id_fk"
    FOREIGN KEY ("outlet_id") REFERENCES "public"."outlets"("id") ON DELETE cascade ON UPDATE no action,
  CONSTRAINT "tenant_order_types_order_type_id_order_types_id_fk"
    FOREIGN KEY ("order_type_id") REFERENCES "public"."order_types"("id") ON DELETE cascade ON UPDATE no action
);

-- Composite PK (tenant_id, business_date) for atomic sequence increments.
CREATE TABLE "order_number_sequences" (
  "tenant_id"     uuid      NOT NULL,
  "business_date" date      NOT NULL,
  "last_seq"      integer   NOT NULL DEFAULT 0,
  "created_at"    timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"    timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "order_number_sequences_tenant_id_business_date_pk"
    PRIMARY KEY ("tenant_id", "business_date"),
  CONSTRAINT "order_number_sequences_tenant_id_tenants_id_fk"
    FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action
);

-- ── Indexes ───────────────────────────────────────────────────────────────────
CREATE INDEX "order_types_code_idx"
  ON "order_types" ("code");

CREATE INDEX "tenant_order_types_tenant_idx"
  ON "tenant_order_types" ("tenant_id");
CREATE INDEX "tenant_order_types_outlet_idx"
  ON "tenant_order_types" ("outlet_id");
CREATE INDEX "tenant_order_types_order_type_idx"
  ON "tenant_order_types" ("order_type_id");
-- No unique index: multi-outlet allows same tenant+order_type per distinct outlet.

CREATE INDEX "order_number_sequences_tenant_idx"
  ON "order_number_sequences" ("tenant_id");
