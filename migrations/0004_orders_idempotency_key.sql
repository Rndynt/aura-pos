ALTER TABLE "orders" ADD COLUMN "idempotency_key" varchar(128);
CREATE UNIQUE INDEX "orders_tenant_idempotency_unique" ON "orders" USING btree ("tenant_id", "idempotency_key") WHERE "idempotency_key" IS NOT NULL;
