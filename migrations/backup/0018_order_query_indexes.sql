-- Add composite indexes for tenant/outlet-scoped order queue, history, and report queries.
-- These are idempotent so databases that already received drift-cleaned indexes can re-run safely.
CREATE INDEX IF NOT EXISTS "orders_tenant_outlet_status_order_date_desc_idx"
  ON "orders" USING btree ("tenant_id", "outlet_id", "status", "order_date" DESC);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "orders_tenant_outlet_order_date_desc_idx"
  ON "orders" USING btree ("tenant_id", "outlet_id", "order_date" DESC);
--> statement-breakpoint
-- Confirm the existing order item lookup index expected by repository item hydration.
CREATE INDEX IF NOT EXISTS "order_items_order_idx"
  ON "order_items" USING btree ("order_id");
