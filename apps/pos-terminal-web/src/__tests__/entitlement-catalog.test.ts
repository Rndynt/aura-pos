/**
 * Entitlement SOT integrity tests (frontend view).
 *
 * The frontend has NO independent plan/module/feature catalog. These tests
 * assert directly against the shared single source of truth:
 *   packages/application/entitlements/entitlementCatalog.ts
 * and the entitlement engine that derives effective entitlements.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { register } from 'tsconfig-paths';

// ─── Path setup (resolve @pos/* aliases) ─────────────────────────────────────
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

const {
  ENTITLEMENT_CATALOG,
  getPlanIncludedEntitlements,
  getEffectiveEntitlements,
  canPurchaseOffer,
} = await import('@pos/application/entitlements');

// Allowed Phase 1B commercial entitlement list (must stay exactly this set).
const COMMERCIAL_CODES = [
  'inventory_basic_stock',
  'inventory_advanced_stock',
  'payments_partial_payment',
  'payments_multi_payment',
  'payments_split_bill',
  'receipt_compact',
  'orders_queue',
  'restaurant_table_service',
  'restaurant_kitchen_ops',
  'reports_advanced',
  'reports_export',
  'multi_location',
  'hardware_label_printer',
  'hardware_barcode_scanner',
  'integrations_payment_gateway',
  'integrations_accounting',
  'integrations_webhook',
  'integrations_api_access',
];

const REMOVED_BASE_CODES = [
  'orders_open_order', 'orders_cancel', 'orders_void', 'orders_refund',
  'catalog_products', 'catalog_categories', 'catalog_variants', 'catalog_options',
  'catalog_sku', 'catalog_barcode', 'payments_cash', 'payments_manual_qris',
  'payments_manual_bank_transfer', 'receipt_standard', 'receipt_reprint',
  'inventory_stock_adjustment', 'inventory_stock_movement_history', 'inventory_stock_opname',
  'inventory_stock_transfer', 'inventory_low_stock_alert', 'inventory_reports',
  'hardware_receipt_printer', 'hardware_cash_drawer',
];

describe('Entitlement catalog is the only commercial SOT', () => {
  it('contains exactly the Phase 1B commercial entitlement list', () => {
    assert.deepEqual(
      Object.keys(ENTITLEMENT_CATALOG.entitlements).sort(),
      [...COMMERCIAL_CODES].sort(),
    );
  });

  it('does not contain any base operation codes', () => {
    for (const code of REMOVED_BASE_CODES) {
      assert.equal(code in ENTITLEMENT_CATALOG.entitlements, false, `base code '${code}' must not be a commercial entitlement`);
    }
  });

  it('plan codes are starter/growth/pro with strictly increasing sortOrder', () => {
    const plans = Object.entries(ENTITLEMENT_CATALOG.plans)
      .sort((a, b) => a[1].sortOrder - b[1].sortOrder)
      .map(([code]) => code);
    assert.deepEqual(plans, ['starter', 'growth', 'pro']);
  });
});

describe('Cumulative plan inclusion', () => {
  it('starter ⊆ growth ⊆ pro', () => {
    const starter = getPlanIncludedEntitlements('starter');
    const growth = getPlanIncludedEntitlements('growth');
    const pro = getPlanIncludedEntitlements('pro');
    for (const code of starter) assert.ok(growth.includes(code), `${code} must remain on growth`);
    for (const code of growth) assert.ok(pro.includes(code), `${code} must remain on pro`);
  });

  it('pro grants Starter + Growth + Pro entitlements', () => {
    const pro = getPlanIncludedEntitlements('pro');
    assert.ok(pro.includes('inventory_basic_stock'));   // starter
    assert.ok(pro.includes('restaurant_kitchen_ops'));  // growth
    assert.ok(pro.includes('multi_location'));          // pro
  });
});

describe('Effective entitlements + grants', () => {
  it('new starter RETAIL_MINIMARKET tenant gets inventory_basic_stock without a grant row', async () => {
    const eff = await getEffectiveEntitlements({ planCode: 'starter', businessType: 'RETAIL_MINIMARKET' });
    assert.equal(eff.has('inventory_basic_stock'), true);
  });

  it('expired grant does not grant access', async () => {
    const eff = await getEffectiveEntitlements({
      planCode: 'starter',
      grants: [{ entitlementCode: 'inventory_advanced_stock', status: 'active', expiresAt: '2000-01-01T00:00:00.000Z' }],
    });
    assert.equal(eff.has('inventory_advanced_stock'), false);
  });

  it('cancelled grant does not grant access', async () => {
    const eff = await getEffectiveEntitlements({
      planCode: 'starter',
      grants: [{ entitlementCode: 'inventory_advanced_stock', status: 'cancelled' }],
    });
    assert.equal(eff.has('inventory_advanced_stock'), false);
  });
});

describe('Offer purchase rules', () => {
  it('an add-on is locked when the plan is below requiredPlan', () => {
    assert.equal(canPurchaseOffer({ offerCode: 'integrations_webhook_monthly', planCode: 'starter' }), false);
  });

  it('an add-on is purchasable when plan meets requiredPlan and lacks the entitlement', () => {
    assert.equal(canPurchaseOffer({ offerCode: 'integrations_webhook_monthly', planCode: 'growth' }), true);
  });
});
