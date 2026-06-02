CREATE TABLE IF NOT EXISTS "inventory_sync_errors" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" varchar NOT NULL REFERENCES "tenants"("id") ON DELETE cascade,
  "outlet_id" uuid REFERENCES "outlets"("id") ON DELETE set null,
  "order_id" uuid REFERENCES "orders"("id") ON DELETE set null,
  "product_id" uuid REFERENCES "products"("id") ON DELETE set null,
  "operation" varchar(40) NOT NULL,
  "status" varchar(20) NOT NULL DEFAULT 'pending',
  "payload" jsonb NOT NULL,
  "last_error" text NOT NULL,
  "retry_count" integer NOT NULL DEFAULT 0,
  "next_retry_at" timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "resolved_at" timestamp,
  "created_at" timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "inventory_sync_errors_tenant_idx" ON "inventory_sync_errors" ("tenant_id");
CREATE INDEX IF NOT EXISTS "inventory_sync_errors_status_next_retry_idx" ON "inventory_sync_errors" ("status", "next_retry_at");
CREATE INDEX IF NOT EXISTS "inventory_sync_errors_order_idx" ON "inventory_sync_errors" ("order_id");
CREATE INDEX IF NOT EXISTS "inventory_sync_errors_product_idx" ON "inventory_sync_errors" ("product_id");
