-- Prevent duplicate sale/return ledger rows for the same order product movement.
-- Existing duplicate rows are collapsed before the unique idempotency index is added.
WITH ranked_inventory_movements AS (
  SELECT
    "id",
    row_number() OVER (
      PARTITION BY "order_id", "product_id", "movement_type"
      ORDER BY "created_at" ASC, "id" ASC
    ) AS row_rank
  FROM "inventory_movements"
  WHERE "order_id" IS NOT NULL
)
DELETE FROM "inventory_movements" AS im
USING ranked_inventory_movements AS ranked
WHERE im."id" = ranked."id"
  AND ranked.row_rank > 1;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "inventory_movements_order_product_movement_unique"
  ON "inventory_movements" USING btree ("order_id", "product_id", "movement_type")
  WHERE "order_id" IS NOT NULL;
