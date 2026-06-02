-- Deduplicate tenant feature rows before enforcing one row per tenant/feature.
-- Keep the latest active row when duplicates exist; if a group has no active row,
-- keep the latest inactive row so historical inactive state is preserved.
DROP INDEX IF EXISTS "tenant_features_tenant_feature_unique";
--> statement-breakpoint
WITH ranked_tenant_features AS (
  SELECT
    "id",
    row_number() OVER (
      PARTITION BY "tenant_id", "feature_code"
      ORDER BY
        "is_active" DESC,
        "activated_at" DESC NULLS LAST,
        "updated_at" DESC NULLS LAST,
        "created_at" DESC NULLS LAST,
        "id" DESC
    ) AS row_rank
  FROM "tenant_features"
)
DELETE FROM "tenant_features" AS tf
USING ranked_tenant_features AS ranked
WHERE tf."id" = ranked."id"
  AND ranked.row_rank > 1;
--> statement-breakpoint
CREATE UNIQUE INDEX "tenant_features_tenant_feature_unique"
  ON "tenant_features" USING btree ("tenant_id", "feature_code");
