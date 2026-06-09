-- Add audit traceability for inventory movements without changing stock math.
ALTER TABLE "inventory_movements"
  ADD COLUMN IF NOT EXISTS "payment_id" uuid,
  ADD COLUMN IF NOT EXISTS "reference_type" varchar(50),
  ADD COLUMN IF NOT EXISTS "reference_id" text,
  ADD COLUMN IF NOT EXISTS "metadata" jsonb;
--> statement-breakpoint
UPDATE "inventory_movements"
SET
  "reference_type" = CASE
    WHEN UPPER("movement_type") IN ('SALE', 'OFFLINE_SALE') THEN 'sale'
    WHEN UPPER("movement_type") = 'RETURN' THEN 'return'
    WHEN UPPER("movement_type") LIKE 'ADJUSTMENT%' THEN 'manual_adjustment'
    ELSE LOWER("movement_type")
  END,
  "reference_id" = COALESCE("order_id"::text, "product_id"::text)
WHERE "reference_type" IS NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "inventory_movements_payment_idx"
  ON "inventory_movements" USING btree ("payment_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "inventory_movements_reference_idx"
  ON "inventory_movements" USING btree ("reference_type", "reference_id");
