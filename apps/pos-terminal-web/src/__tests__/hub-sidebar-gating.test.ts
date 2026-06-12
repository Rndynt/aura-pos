/**
 * Hub / Sidebar / bottom-nav / page-guard gating tests — entitlement edition.
 *
 * Mirrors the exact visibility logic now used by the React components, which is
 * driven solely by effective entitlement codes via `useTenant().can(code)`:
 *  - home.tsx           (hub management grid)
 *  - Sidebar.tsx        (desktop nav)
 *  - UnifiedBottomNav   (mobile nav)
 *  - App.tsx            (route guards)
 *  - stock.tsx          (inventory tab gating)
 *
 * Tests are pure: they take an effective entitlement map (what the backend
 * derives from the SOT: plan + business defaults + grants) and assert visibility.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { register } from 'tsconfig-paths';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir   = path.resolve(__dirname, '../../../../../');
register({
  baseUrl: rootDir,
  paths: {
    '@pos/core':            ['packages/core'],
    '@pos/core/*':          ['packages/core/*'],
    '@pos/domain':          ['packages/domain'],
    '@pos/domain/*':        ['packages/domain/*'],
    '@pos/application':     ['packages/application'],
    '@pos/application/*':   ['packages/application/*'],
    '@pos/infrastructure':  ['packages/infrastructure'],
    '@pos/infrastructure/*':['packages/infrastructure/*'],
  },
});

const { getEffectiveEntitlements } = await import('@pos/application/entitlements');

type EntMap = Record<string, boolean>;
const can = (map: EntMap, code: string) => map[code] === true;

async function effectiveMap(input: Parameters<typeof getEffectiveEntitlements>[0]): Promise<EntMap> {
  const set = await getEffectiveEntitlements(input);
  return Object.fromEntries([...set].map((c) => [c, true]));
}

/** Mirrors home.tsx hub tile visibility */
function hubVisibility(map: EntMap) {
  return {
    dashboard:     can(map, 'reports_advanced'),
    tables:        can(map, 'restaurant_table_service'),
    kitchen:       can(map, 'restaurant_kitchen_ops'),
    multiLocation: can(map, 'multi_location'),
  };
}

/** Mirrors Sidebar.tsx / UnifiedBottomNav.tsx item visibility */
function navVisibility(map: EntMap) {
  return {
    tables:  can(map, 'restaurant_table_service'),
    kitchen: can(map, 'restaurant_kitchen_ops'),
  };
}

/** Mirrors App.tsx route guards */
function routeGuards(map: EntMap) {
  return {
    kitchenRoute: can(map, 'restaurant_kitchen_ops'),
    tablesRoute:  can(map, 'restaurant_table_service'),
  };
}

/** Mirrors stock.tsx tab gating */
function stockGates(map: EntMap) {
  return {
    basic:    can(map, 'inventory_basic_stock'),
    advanced: can(map, 'inventory_advanced_stock'),
  };
}

describe('Starter plan (CAFE_RESTAURANT) — base only', () => {
  it('hides commercial tiles/nav, shows basic stock (business-type default)', async () => {
    const map = await effectiveMap({ planCode: 'starter', businessType: 'CAFE_RESTAURANT' });
    const hub = hubVisibility(map);
    assert.equal(hub.dashboard, false);
    assert.equal(hub.tables, false);
    assert.equal(hub.kitchen, false);
    assert.equal(hub.multiLocation, false);

    const nav = navVisibility(map);
    assert.equal(nav.tables, false);
    assert.equal(nav.kitchen, false);

    const stock = stockGates(map);
    assert.equal(stock.basic, true);
    assert.equal(stock.advanced, false);
  });
});

describe('Per-business-type starter initial state', () => {
  const types = ['CAFE_RESTAURANT', 'RETAIL_MINIMARKET', 'LAUNDRY', 'SERVICE_APPOINTMENT', 'DIGITAL_PPOB'] as const;
  for (const businessType of types) {
    it(`${businessType}: commercial nav hidden, basic stock on (default entitlement)`, async () => {
      const map = await effectiveMap({ planCode: 'starter', businessType });
      assert.equal(navVisibility(map).tables, false);
      assert.equal(navVisibility(map).kitchen, false);
      assert.equal(hubVisibility(map).multiLocation, false);
      assert.equal(stockGates(map).basic, true);
    });
  }
});

describe('Growth plan — kitchen ops + advanced reports unlocked', () => {
  it('shows kitchen + dashboard, hides tables (add-on) and multi-location', async () => {
    const map = await effectiveMap({ planCode: 'growth', businessType: 'CAFE_RESTAURANT' });
    const hub = hubVisibility(map);
    assert.equal(hub.kitchen, true);
    assert.equal(hub.dashboard, true);
    assert.equal(hub.tables, false);
    assert.equal(hub.multiLocation, false);

    const guards = routeGuards(map);
    assert.equal(guards.kitchenRoute, true);
    assert.equal(guards.tablesRoute, false);
  });

  it('an active restaurant_table_service grant reveals tables nav + route', async () => {
    const map = await effectiveMap({
      planCode: 'growth',
      businessType: 'CAFE_RESTAURANT',
      grants: [{ entitlementCode: 'restaurant_table_service', status: 'active' }],
    });
    assert.equal(navVisibility(map).tables, true);
    assert.equal(routeGuards(map).tablesRoute, true);
  });
});

describe('Pro plan — everything cumulative', () => {
  it('shows multi-location, advanced stock, and growth kitchen', async () => {
    const map = await effectiveMap({ planCode: 'pro', businessType: 'CAFE_RESTAURANT' });
    assert.equal(hubVisibility(map).multiLocation, true);
    assert.equal(stockGates(map).advanced, true);
    assert.equal(hubVisibility(map).kitchen, true);
  });
});

describe('Expired / cancelled grants do not reveal nav', () => {
  it('expired table-service grant keeps tables hidden', async () => {
    const map = await effectiveMap({
      planCode: 'growth',
      businessType: 'CAFE_RESTAURANT',
      grants: [{ entitlementCode: 'restaurant_table_service', status: 'active', expiresAt: '2000-01-01T00:00:00.000Z' }],
    });
    assert.equal(navVisibility(map).tables, false);
  });

  it('cancelled table-service grant keeps tables hidden', async () => {
    const map = await effectiveMap({
      planCode: 'growth',
      businessType: 'CAFE_RESTAURANT',
      grants: [{ entitlementCode: 'restaurant_table_service', status: 'cancelled' }],
    });
    assert.equal(navVisibility(map).tables, false);
  });
});
