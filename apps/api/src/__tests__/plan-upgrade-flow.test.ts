/**
 * Plan upgrade / downgrade flow tests — entitlement SOT edition.
 *
 * Covers, using the entitlement engine only (no legacy feature/module tables
 * and no legacy plan-feature map):
 *  - Cumulative plan inclusion: starter ⊆ growth ⊆ pro
 *  - Upgrading unlocks higher-tier entitlements
 *  - Downgrading removes higher-tier entitlements (no DB row persists them)
 *  - Active grants add entitlements on top of the plan
 *  - Expired / cancelled grants do not grant access
 */

import '../../register-paths';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

const {
  getPlanIncludedEntitlements,
  getEffectiveEntitlements,
  hasEntitlement,
} = await import('@pos/application/entitlements');

// ─── Cumulative plan inclusion ────────────────────────────────────────────────

describe('Plan inclusion is cumulative (starter ⊆ growth ⊆ pro)', () => {
  const starter = getPlanIncludedEntitlements('starter');
  const growth = getPlanIncludedEntitlements('growth');
  const pro = getPlanIncludedEntitlements('pro');

  it('growth includes every starter entitlement', () => {
    for (const code of starter) assert.equal(growth.includes(code), true, `${code} must remain on growth`);
  });

  it('pro includes every growth entitlement', () => {
    for (const code of growth) assert.equal(pro.includes(code), true, `${code} must remain on pro`);
  });

  it('starter includes inventory_basic_stock', () => {
    assert.equal(starter.includes('inventory_basic_stock'), true);
  });

  it('pro includes multi_location, growth and starter do not', () => {
    assert.equal(pro.includes('multi_location'), true);
    assert.equal(growth.includes('multi_location'), false);
    assert.equal(starter.includes('multi_location'), false);
  });
});

// ─── Plan tier ceiling — effective entitlements ──────────────────────────────

describe('Plan tier ceiling via effective entitlements', () => {
  it('starter has no growth/pro entitlements (kitchen ops, advanced reports, multi location)', async () => {
    const eff = await getEffectiveEntitlements({ planCode: 'starter' });
    assert.equal(eff.has('restaurant_kitchen_ops'), false);
    assert.equal(eff.has('reports_advanced'), false);
    assert.equal(eff.has('multi_location'), false);
    assert.equal(eff.has('inventory_basic_stock'), true);
  });

  it('growth unlocks kitchen ops, orders queue and advanced reports, but not multi_location', async () => {
    const eff = await getEffectiveEntitlements({ planCode: 'growth' });
    assert.equal(eff.has('restaurant_kitchen_ops'), true);
    assert.equal(eff.has('orders_queue'), true);
    assert.equal(eff.has('reports_advanced'), true);
    assert.equal(eff.has('multi_location'), false);
  });

  it('pro unlocks multi_location and advanced inventory', async () => {
    const eff = await getEffectiveEntitlements({ planCode: 'pro' });
    assert.equal(eff.has('multi_location'), true);
    assert.equal(eff.has('inventory_advanced_stock'), true);
  });

  it('downgrade growth → starter removes growth-only entitlements (no DB row persists them)', async () => {
    assert.equal(await hasEntitlement({ planCode: 'growth', entitlementCode: 'restaurant_kitchen_ops' }), true);
    assert.equal(await hasEntitlement({ planCode: 'starter', entitlementCode: 'restaurant_kitchen_ops' }), false);
  });
});

// ─── Grants ───────────────────────────────────────────────────────────────────

describe('Entitlement grants on top of plan', () => {
  it('active grant adds an entitlement not included by the plan', async () => {
    const eff = await getEffectiveEntitlements({
      planCode: 'starter',
      grants: [{ entitlementCode: 'restaurant_table_service', status: 'active' }],
    });
    assert.equal(eff.has('restaurant_table_service'), true);
  });

  it('expired grant does not grant access', async () => {
    const eff = await getEffectiveEntitlements({
      planCode: 'starter',
      grants: [{ entitlementCode: 'restaurant_table_service', status: 'active', expiresAt: '2000-01-01T00:00:00.000Z' }],
    });
    assert.equal(eff.has('restaurant_table_service'), false);
  });

  it('cancelled grant does not grant access', async () => {
    const eff = await getEffectiveEntitlements({
      planCode: 'starter',
      grants: [{ entitlementCode: 'restaurant_table_service', status: 'cancelled' }],
    });
    assert.equal(eff.has('restaurant_table_service'), false);
  });
});
