-- Entitlement Phase 1 destructive cleanup.
-- This application is still in development, so old tenant feature/module data is
-- intentionally discarded instead of repaired or compatibility-mapped.

DROP INDEX IF EXISTS "tenant_features_tenant_feature_unique";
DROP INDEX IF EXISTS "tenant_features_feature_code_idx";
DROP INDEX IF EXISTS "tenant_features_tenant_idx";
DROP TABLE IF EXISTS "tenant_features" CASCADE;
DROP TABLE IF EXISTS "tenant_module_configs" CASCADE;

CREATE TABLE IF NOT EXISTS "tenant_entitlements" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE cascade,
  "entitlement_code" text NOT NULL,
  "source" varchar(50) NOT NULL,
  "status" varchar(50) NOT NULL DEFAULT 'active',
  "starts_at" timestamp NOT NULL DEFAULT now(),
  "expires_at" timestamp,
  "config" jsonb,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "tenant_entitlements_source_check" CHECK ("source" IN ('purchase', 'manual_grant', 'trial')),
  CONSTRAINT "tenant_entitlements_status_check" CHECK ("status" IN ('active', 'expired', 'cancelled'))
);

CREATE INDEX IF NOT EXISTS "tenant_entitlements_tenant_idx" ON "tenant_entitlements" ("tenant_id");
CREATE INDEX IF NOT EXISTS "tenant_entitlements_entitlement_code_idx" ON "tenant_entitlements" ("entitlement_code");
CREATE INDEX IF NOT EXISTS "tenant_entitlements_status_idx" ON "tenant_entitlements" ("status");
CREATE INDEX IF NOT EXISTS "tenant_entitlements_expires_at_idx" ON "tenant_entitlements" ("expires_at");
CREATE UNIQUE INDEX IF NOT EXISTS "tenant_entitlements_active_tenant_entitlement_unique"
  ON "tenant_entitlements" ("tenant_id", "entitlement_code")
  WHERE "status" = 'active';
