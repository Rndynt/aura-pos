-- Repair Basic Stock (Stok Dasar) runtime entitlement for active onboarding/default-plan tenants.
--
-- 0020 only updated existing tenant_module_configs rows for free/starter tenants.
-- This migration also inserts missing rows and covers legacy/default plan aliases
-- used by starter/basic onboarding flows. Advanced Inventory remains separately
-- gated and is never enabled by this repair.
INSERT INTO tenant_module_configs (
  tenant_id,
  enable_table_management,
  enable_kitchen_ticket,
  enable_loyalty,
  enable_delivery,
  enable_inventory,
  enable_inventory_advanced,
  enable_appointments,
  enable_multi_location,
  config,
  created_at,
  updated_at
)
SELECT
  t.id,
  false,
  false,
  false,
  false,
  true,
  false,
  false,
  false,
  NULL,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM tenants t
WHERE t.is_active = true
  AND LOWER(COALESCE(t.plan_tier, 'free')) IN ('free', 'starter', 'basic', 'basic_starter')
ON CONFLICT (tenant_id) DO UPDATE
SET
  enable_inventory = true,
  enable_inventory_advanced = tenant_module_configs.enable_inventory_advanced,
  updated_at = CURRENT_TIMESTAMP
WHERE tenant_module_configs.enable_inventory IS DISTINCT FROM true;
