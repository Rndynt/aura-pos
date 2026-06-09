import '../../register-paths';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { describe, it } from 'node:test';

const {
  BASIC_STOCK_DEFAULT_PLAN_TIERS,
  getBasicStockEntitlementRepairAction,
  hasAdvancedInventoryEntitlement,
  hasBasicStockEntitlement,
  isBasicStockDefaultPlanTier,
} = await import('../http/helpers/inventoryEntitlement');

const migrationSql = fs.readFileSync(new URL('../../../../migrations/0021_repair_basic_stock_runtime_entitlement.sql', import.meta.url), 'utf8');

describe('inventory entitlement helpers', () => {
  it('allows Basic Starter inventory products when Stok Dasar is active', () => {
    assert.equal(hasBasicStockEntitlement({ enableInventory: true, enableInventoryAdvanced: false }), true);
  });

  it('keeps /api/inventory/products gated for tenants without Stok Dasar and without default-plan policy', () => {
    assert.equal(hasBasicStockEntitlement({ enableInventory: false, enableInventoryAdvanced: false }), false);
    assert.equal(
      getBasicStockEntitlementRepairAction({
        tenant: { isActive: true, planTier: 'enterprise' },
        config: { enableInventory: false, enableInventoryAdvanced: false },
        hasModuleConfig: true,
      }),
      null,
    );
  });

  it('does not treat Basic Stock as Advanced Inventory', () => {
    assert.equal(hasAdvancedInventoryEntitlement({ enableInventory: true, enableInventoryAdvanced: false }), false);
  });

  it('centralizes default Basic Stock plan aliases for onboarding/basic/starter tenants', () => {
    assert.deepEqual([...BASIC_STOCK_DEFAULT_PLAN_TIERS], ['free', 'starter', 'basic', 'basic_starter']);
    assert.equal(isBasicStockDefaultPlanTier('free'), true);
    assert.equal(isBasicStockDefaultPlanTier('starter'), true);
    assert.equal(isBasicStockDefaultPlanTier('basic'), true);
    assert.equal(isBasicStockDefaultPlanTier('basic_starter'), true);
    assert.equal(isBasicStockDefaultPlanTier('growth'), false);
  });

  it('repairs a missing tenant_module_configs row for active default-plan tenants', () => {
    assert.equal(
      getBasicStockEntitlementRepairAction({
        tenant: { isActive: true, planTier: 'starter' },
        config: undefined,
        hasModuleConfig: false,
      }),
      'insert_missing_config',
    );
  });

  it('repairs stale enable_inventory=false for active default-plan tenants', () => {
    assert.equal(
      getBasicStockEntitlementRepairAction({
        tenant: { isActive: true, planTier: 'basic' },
        config: { enableInventory: false, enableInventoryAdvanced: false },
        hasModuleConfig: true,
      }),
      'repair_stale_disabled',
    );
  });

  it('does not repair inactive tenants or non-default paid plan tenants', () => {
    assert.equal(
      getBasicStockEntitlementRepairAction({
        tenant: { isActive: false, planTier: 'starter' },
        config: undefined,
        hasModuleConfig: false,
      }),
      null,
    );
    assert.equal(
      getBasicStockEntitlementRepairAction({
        tenant: { isActive: true, planTier: 'growth' },
        config: { enableInventory: false, enableInventoryAdvanced: false },
        hasModuleConfig: true,
      }),
      null,
    );
  });
});

describe('0021 Basic Stock entitlement repair migration', () => {
  it('inserts missing tenant_module_configs rows for active default-plan tenants', () => {
    assert.match(migrationSql, /INSERT INTO tenant_module_configs/s);
    assert.match(migrationSql, /FROM tenants t/s);
    assert.match(migrationSql, /t\.is_active = true/s);
    assert.match(migrationSql, /LOWER\(COALESCE\(t\.plan_tier, 'free'\)\) IN \('free', 'starter', 'basic', 'basic_starter'\)/s);
    assert.match(migrationSql, /ON CONFLICT \(tenant_id\) DO UPDATE/s);
  });

  it('updates stale Basic Stock without enabling Advanced Inventory', () => {
    assert.match(migrationSql, /enable_inventory = true/s);
    assert.match(migrationSql, /enable_inventory_advanced = tenant_module_configs\.enable_inventory_advanced/s);
    assert.doesNotMatch(migrationSql, /enable_inventory_advanced\s*=\s*true/i);
  });
});
