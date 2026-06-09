import '../../register-paths';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

const { toStockListResponse } = await import('../http/helpers/inventoryStockListing');

type Row = Parameters<typeof toStockListResponse>[0][number];

const row = (overrides: Partial<Row>): Row => ({
  id: 'product-1',
  name: 'Tracked Product',
  category: 'General',
  basePrice: '10000',
  imageUrl: null,
  sku: null,
  stockQty: null,
  isActive: true,
  stockTrackingEnabled: true,
  ...overrides,
});

describe('inventory stock listing response', () => {
  it('includes tracked products before the first sale or movement', () => {
    const data = toStockListResponse([row({ id: 'tracked-no-movement', stockQty: null })]);

    assert.equal(data.summary.total, 1);
    assert.equal(data.items[0].id, 'tracked-no-movement');
    assert.equal(data.items[0].stockQty, 0);
    assert.equal(data.items[0].isOutOfStock, true);
  });

  it('keeps tracked products with zero stock visible', () => {
    const data = toStockListResponse([row({ id: 'tracked-zero', stockQty: 0 })]);

    assert.equal(data.summary.total, 1);
    assert.equal(data.summary.outOfStock, 1);
    assert.equal(data.items[0].id, 'tracked-zero');
    assert.equal(data.items[0].stockQty, 0);
  });

  it('excludes non-tracked products from stock listing data', () => {
    const data = toStockListResponse([
      row({ id: 'tracked', stockQty: 4 }),
      row({ id: 'not-tracked', stockTrackingEnabled: false, stockQty: 99 }),
    ]);

    assert.deepEqual(data.items.map((item) => item.id), ['tracked']);
    assert.equal(data.summary.total, 1);
  });

  it('does not merge products across caller-provided tenant or outlet scopes', () => {
    const tenantOneScopedRows = [row({ id: 'tenant-one-product', stockQty: 3 })];
    const tenantTwoScopedRows = [row({ id: 'tenant-two-product', stockQty: 7 })];

    assert.deepEqual(
      toStockListResponse(tenantOneScopedRows).items.map((item) => item.id),
      ['tenant-one-product'],
    );
    assert.deepEqual(
      toStockListResponse(tenantTwoScopedRows).items.map((item) => item.id),
      ['tenant-two-product'],
    );
  });
});
