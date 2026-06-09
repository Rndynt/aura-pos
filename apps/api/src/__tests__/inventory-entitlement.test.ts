import '../../register-paths';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync } from 'node:fs';

const {
  ENTITLEMENT_CATALOG,
  canPurchaseOffer,
  getBusinessTypeDefaultEntitlements,
  getEffectiveEntitlements,
  getPlanIncludedEntitlements,
  hasEntitlement,
} = await import('@pos/application/entitlements');

describe('entitlement catalog and engine', () => {
  it('catalog exposes the required single SOT sections', () => {
    assert.deepEqual(Object.keys(ENTITLEMENT_CATALOG), [
      'meta',
      'billingIntervals',
      'plans',
      'entitlements',
      'offers',
      'businessTypes',
    ]);
  });

  it('plans, offers, and business types reference valid entitlement keys', () => {
    const entitlementCodes = new Set(Object.keys(ENTITLEMENT_CATALOG.entitlements));

    for (const plan of Object.values(ENTITLEMENT_CATALOG.plans)) {
      for (const code of plan.included) assert.equal(entitlementCodes.has(code), true, `invalid plan entitlement ${code}`);
    }

    for (const offer of Object.values(ENTITLEMENT_CATALOG.offers)) {
      assert.equal(entitlementCodes.has(offer.entitlement), true, `invalid offer entitlement ${offer.entitlement}`);
    }

    for (const businessType of Object.values(ENTITLEMENT_CATALOG.businessTypes)) {
      for (const code of [...businessType.defaultEntitlements, ...businessType.recommendedEntitlements]) {
        assert.equal(entitlementCodes.has(code), true, `invalid business type entitlement ${code}`);
      }
    }
  });

  it('plan hierarchy is cumulative and pro receives starter plus growth plus pro', () => {
    const starter = getPlanIncludedEntitlements('starter');
    const growth = getPlanIncludedEntitlements('growth');
    const pro = getPlanIncludedEntitlements('pro');

    for (const code of starter) assert.equal(growth.includes(code), true, `growth missing starter entitlement ${code}`);
    for (const code of growth) assert.equal(pro.includes(code), true, `pro missing growth entitlement ${code}`);
    assert.equal(pro.includes('inventory_stock_transfer'), true);
  });

  it('included plan entitlement does not require tenant_entitlements DB row', async () => {
    assert.equal(
      await hasEntitlement({ planCode: 'starter', businessType: 'CAFE_RESTAURANT', entitlementCode: 'inventory_basic_stock', grants: [] }),
      true,
    );
  });

  it('purchased active grants access while expired and cancelled grants do not', async () => {
    assert.equal(
      await hasEntitlement({
        planCode: 'starter',
        entitlementCode: 'integrations_api_access',
        grants: [{ entitlementCode: 'integrations_api_access', status: 'active', expiresAt: new Date(Date.now() + 86_400_000) }],
      }),
      true,
    );

    assert.equal(
      await hasEntitlement({
        planCode: 'starter',
        entitlementCode: 'integrations_api_access',
        grants: [{ entitlementCode: 'integrations_api_access', status: 'active', expiresAt: new Date(Date.now() - 86_400_000) }],
      }),
      false,
    );

    assert.equal(
      await hasEntitlement({
        planCode: 'starter',
        entitlementCode: 'integrations_api_access',
        grants: [{ entitlementCode: 'integrations_api_access', status: 'cancelled' }],
      }),
      false,
    );
  });

  it('offer requiredPlan rules are enforced by plan sortOrder', () => {
    assert.equal(canPurchaseOffer({ offerCode: 'receipt_compact_monthly', planCode: 'starter' }), true);
    assert.equal(canPurchaseOffer({ offerCode: 'receipt_compact_monthly', planCode: 'growth' }), true);
    assert.equal(canPurchaseOffer({ offerCode: 'receipt_compact_monthly', planCode: 'pro' }), true);
    assert.equal(canPurchaseOffer({ offerCode: 'orders_queue_addon', planCode: 'starter' }), false);
    assert.equal(canPurchaseOffer({ offerCode: 'orders_queue_addon', planCode: 'growth' }), true);
    assert.equal(canPurchaseOffer({ offerCode: 'orders_queue_addon', planCode: 'pro' }), true);
  });

  it('business type defaults include Basic Stock from SOT', () => {
    for (const businessType of Object.keys(ENTITLEMENT_CATALOG.businessTypes) as Array<keyof typeof ENTITLEMENT_CATALOG.businessTypes>) {
      assert.equal(getBusinessTypeDefaultEntitlements(businessType).includes('inventory_basic_stock'), true);
    }
  });

  it('new tenant effective entitlements include Basic Stock through SOT', async () => {
    const effective = await getEffectiveEntitlements({ planCode: 'starter', businessType: 'RETAIL_MINIMARKET', grants: [] });
    assert.equal(effective.has('inventory_basic_stock'), true);
  });

  it('inventory routes use entitlement engine codes', () => {
    const routeSource = readFileSync(new URL('../http/routes/inventory.ts', import.meta.url), 'utf8');
    assert.match(routeSource, /requireTenantEntitlement\(db, tenantId, 'inventory_basic_stock'\)/);
    assert.match(routeSource, /requireTenantEntitlement\(db, tenantId, 'inventory_advanced_stock'\)/);
    assert.doesNotMatch(routeSource, /resolveBasicStockEntitlement/);
    assert.doesNotMatch(routeSource, /tenantModuleConfigs/);
  });
});
