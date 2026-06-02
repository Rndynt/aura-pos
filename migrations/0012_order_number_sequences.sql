CREATE TABLE IF NOT EXISTS "order_number_sequences" (
  "tenant_id" varchar NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "business_date" date NOT NULL,
  "last_seq" integer NOT NULL DEFAULT 0,
  "created_at" timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "order_number_sequences_tenant_id_business_date_pk" PRIMARY KEY ("tenant_id", "business_date")
);

CREATE INDEX IF NOT EXISTS "order_number_sequences_tenant_idx"
  ON "order_number_sequences" ("tenant_id");
