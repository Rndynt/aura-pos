CREATE TABLE IF NOT EXISTS "tables" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" varchar NOT NULL,
  "table_number" varchar NOT NULL,
  "table_name" text,
  "floor" varchar,
  "capacity" integer,
  "status" varchar(20) DEFAULT 'available' NOT NULL,
  "current_order_id" varchar,
  "created_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL,
  "updated_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
ALTER TABLE "tables"
  ADD CONSTRAINT "tables_tenant_id_tenants_id_fk"
  FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id")
  ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tables_tenant_idx" ON "tables" USING btree ("tenant_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tables_status_idx" ON "tables" USING btree ("status");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "tables_unique_per_tenant" ON "tables" USING btree ("tenant_id", "table_number");
