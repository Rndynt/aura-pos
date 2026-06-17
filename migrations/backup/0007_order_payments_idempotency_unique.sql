CREATE UNIQUE INDEX "order_payments_order_id_idempotency_unique"
ON "order_payments" USING btree ("order_id", "idempotency_key")
WHERE "idempotency_key" IS NOT NULL;
