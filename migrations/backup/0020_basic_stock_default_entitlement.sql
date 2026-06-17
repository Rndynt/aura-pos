-- Backfill Basic Stock (Stok Dasar) as the default free onboarding module.
-- Advanced Inventory remains separately gated by enable_inventory_advanced.
UPDATE tenant_module_configs tmc
SET
  enable_inventory = true,
  updated_at = CURRENT_TIMESTAMP
FROM tenants t
WHERE t.id = tmc.tenant_id
  AND t.is_active = true
  AND COALESCE(t.plan_tier, 'free') IN ('free', 'starter')
  AND tmc.enable_inventory IS DISTINCT FROM true;
