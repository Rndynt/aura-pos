DROP INDEX IF EXISTS "tenant_order_types_unique";--> statement-breakpoint
ALTER TABLE "order_types" ALTER COLUMN "affects_service_charge" SET DEFAULT false;--> statement-breakpoint
CREATE UNIQUE INDEX "tenant_order_types_tenant_order_type_unique" ON "tenant_order_types" USING btree ("tenant_id","order_type_id");