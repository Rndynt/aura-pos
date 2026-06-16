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

const REMOVED_NON_COMMERCIAL_CODES = [
  'orders_open_order',
  'orders_cancel',
  'orders_void',
  'orders_refund',
  'catalog_products',
  'catalog_categories',
  'catalog_variants',
  'catalog_options',
  'catalog_sku',
  'catalog_barcode',
  'payments_cash',
  'payments_manual_qris',
  'payments_manual_bank_transfer',
  'receipt_standard',
  'receipt_reprint',
  'inventory_stock_adjustment',
  'inventory_stock_movement_history',
  'inventory_stock_opname',
  'inventory_stock_transfer',
  'inventory_low_stock_alert',
  'inventory_reports',
  'hardware_receipt_printer',
  'hardware_cash_drawer',
  'restaurant_table_management',
  'restaurant_floor_layout',
  'restaurant_kitchen_ticket',
  'restaurant_kds',
  'restaurant_kitchen_printer',
  'reports_sales_basic',
  'reports_inventory',
  'reports_cashier',
  'multi_location_outlets',
  'multi_location_stock',
  'multi_location_reports',
] as const;

const PHASE_1B_COMMERCIAL_CODES = [
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
] as const;

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

  it('catalog contains only Phase 1B commercial entitlement codes', () => {
    assert.deepEqual(Object.keys(ENTITLEMENT_CATALOG.entitlements).sort(), [...PHASE_1B_COMMERCIAL_CODES].sort());
  });

  it('payment entitlement wording separates DP, multi payment, and split bill', () => {
    const partial = ENTITLEMENT_CATALOG.entitlements.payments_partial_payment;
    const partialText = `${partial.label} ${partial.description} ${partial.longDesc}`.toLowerCase();
    assert.doesNotMatch(partialText, /split/);
    assert.doesNotMatch(partialText, /multi/);

    assert.equal(ENTITLEMENT_CATALOG.entitlements.payments_multi_payment.label, 'Multi Payment');
    assert.equal(ENTITLEMENT_CATALOG.entitlements.payments_split_bill.label, 'Split Bill');
  });

  it('catalog does not contain base order, catalog, payment, receipt, or split inventory sub-capability codes', () => {
    const entitlementCodes = new Set(Object.keys(ENTITLEMENT_CATALOG.entitlements));

    for (const code of REMOVED_NON_COMMERCIAL_CODES) {
      assert.equal(entitlementCodes.has(code), false, `non-commercial entitlement should be removed: ${code}`);
    }
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
    assert.equal(pro.includes('inventory_advanced_stock'), true);
    assert.equal(pro.includes('inventory_basic_stock'), true);
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

  it('legacy split payment grants resolve to canonical split bill entitlement', async () => {
    const effective = await getEffectiveEntitlements({
      planCode: 'starter',
      grants: [{ entitlementCode: 'payments_split_payment', status: 'active' }],
    });

    assert.equal(effective.has('payments_split_bill'), true);
    assert.equal(
      await hasEntitlement({ planCode: 'starter', entitlementCode: 'payments_split_payment', grants: [{ entitlementCode: 'payments_split_payment', status: 'active' }] }),
      true,
    );
  });

  it('offer requiredPlan rules are enforced for active catalog offers', () => {
    assert.equal(canPurchaseOffer({ offerCode: 'receipt_compact_monthly', planCode: 'starter' }), true);
    assert.equal(canPurchaseOffer({ offerCode: 'integrations_webhook_monthly', planCode: 'starter' }), false);
    assert.equal(canPurchaseOffer({ offerCode: 'integrations_webhook_monthly', planCode: 'growth' }), true);
  });

  it('business type defaults include only Basic Stock from SOT by default', () => {
    for (const businessType of Object.keys(ENTITLEMENT_CATALOG.businessTypes) as Array<keyof typeof ENTITLEMENT_CATALOG.businessTypes>) {
      assert.deepEqual(getBusinessTypeDefaultEntitlements(businessType), ['inventory_basic_stock']);
    }
  });

  it('new tenant effective entitlements include Basic Stock through SOT', async () => {
    const effective = await getEffectiveEntitlements({ planCode: 'starter', businessType: 'RETAIL_MINIMARKET', grants: [] });
    assert.equal(effective.has('inventory_basic_stock'), true);
  });

  it('base order lifecycle and catalog routes are not blocked by commercial entitlements', () => {
    const orderRouteSource = readFileSync(new URL('../http/routes/orders.ts', import.meta.url), 'utf8');
    const catalogRouteSource = readFileSync(new URL('../http/routes/catalog.ts', import.meta.url), 'utf8');

    assert.doesNotMatch(orderRouteSource, /requireTenantEntitlement/);
    assert.doesNotMatch(orderRouteSource, /orders_open_order|orders_cancel|orders_void|orders_refund/);
    assert.doesNotMatch(catalogRouteSource, /requireTenantEntitlement/);
    assert.doesNotMatch(catalogRouteSource, /catalog_products|catalog_categories|catalog_sku|catalog_barcode/);
  });

  it('inventory routes use coarse-grained entitlement engine codes', () => {
    const routeSource = readFileSync(new URL('../http/routes/inventory.ts', import.meta.url), 'utf8');
    assert.match(routeSource, /requireTenantEntitlement\(db, tenantId, 'inventory_basic_stock'\)/);
    assert.match(routeSource, /requireTenantEntitlement\(db, tenantId, 'inventory_advanced_stock'\)/);
    assert.doesNotMatch(routeSource, /resolveBasicStockEntitlement/);
    assert.doesNotMatch(routeSource, /tenantModuleConfigs/);
    for (const removedInventoryCode of [
      'inventory_stock_adjustment',
      'inventory_stock_movement_history',
      'inventory_stock_opname',
      'inventory_stock_transfer',
      'inventory_low_stock_alert',
      'inventory_reports',
    ]) {
      assert.doesNotMatch(routeSource, new RegExp(removedInventoryCode));
    }
  });
});
