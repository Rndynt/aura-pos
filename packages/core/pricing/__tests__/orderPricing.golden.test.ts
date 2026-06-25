import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DEFAULT_SERVICE_CHARGE_RATE, DEFAULT_TAX_RATE, calculateOrderPricing } from '../../pricing';

const taxRate = DEFAULT_TAX_RATE;
const serviceChargeRate = DEFAULT_SERVICE_CHARGE_RATE;

test('retail golden case: subtotal, tax, service charge, total', () => {
  const pricing = calculateOrderPricing({
    items: [
      { base_price: 10_000, quantity: 2 },
      { base_price: 5_000, quantity: 1 },
    ],
    tax_rate: taxRate,
    service_charge_rate: 0,
  });

  assert.equal(pricing.order_subtotal, 25_000);
  assert.equal(pricing.tax_amount, 2_500);
  assert.equal(pricing.service_charge_amount, 0);
  assert.equal(pricing.total_amount, 27_500);
});

test('restaurant golden case: applies tax and service charge after order discount', () => {
  const pricing = calculateOrderPricing({
    items: [{ base_price: 100_000, quantity: 1 }],
    discounts: [{ type: 'percent', value: 10 }],
    tax_rate: taxRate,
    service_charge_rate: serviceChargeRate,
  });

  assert.equal(pricing.order_subtotal, 100_000);
  assert.equal(pricing.order_discount_amount, 10_000);
  assert.equal(pricing.subtotal_after_discount, 90_000);
  assert.equal(pricing.tax_amount, 9_000);
  assert.equal(pricing.service_charge_amount, 4_500);
  assert.equal(pricing.total_amount, 103_500);
});

test('modifiers and nested options golden case', () => {
  const pricing = calculateOrderPricing({
    items: [{
      base_price: 20_000,
      variant_price_delta: 2_000,
      quantity: 2,
      selected_options: [{
        group_id: 'milk',
        group_name: 'Milk',
        option_id: 'oat',
        option_name: 'Oat Milk',
        price_delta: 3_000,
        child_groups: [{
          group_id: 'sweetness',
          group_name: 'Sweetness',
          selected_options: [{ group_id: 'sweetness', group_name: 'Sweetness', option_id: 'honey', option_name: 'Honey', price_delta: 1_000 }],
        }],
      }],
      selected_option_groups: [{
        group_id: 'topping',
        group_name: 'Topping',
        selected_options: [{ group_id: 'topping', group_name: 'Topping', option_id: 'boba', option_name: 'Boba', price_delta: 4_000 }],
      }],
    }],
    tax_rate: 0,
    service_charge_rate: 0,
  });

  assert.equal(pricing.items[0].options_delta, 8_000);
  assert.equal(pricing.items[0].item_price, 30_000);
  assert.equal(pricing.order_subtotal, 60_000);
  assert.equal(pricing.total_amount, 60_000);
});

test('item discount and nominal order discount golden case', () => {
  const pricing = calculateOrderPricing({
    items: [
      { base_price: 50_000, quantity: 2, discounts: [{ type: 'percent', value: 20 }] },
      { base_price: 10_000, quantity: 1, discounts: [{ type: 'nominal', value: 2_000 }] },
    ],
    discounts: [{ type: 'nominal', value: 5_000 }],
    tax_rate: 0,
    service_charge_rate: 0,
  });

  assert.equal(pricing.order_subtotal, 110_000);
  assert.equal(pricing.items_discount_total, 22_000);
  assert.equal(pricing.order_discount_amount, 5_000);
  assert.equal(pricing.total_discount, 27_000);
  assert.equal(pricing.subtotal_after_discount, 83_000);
  assert.equal(pricing.total_amount, 83_000);
});

test('partial payment golden case uses the same total for remaining amount', () => {
  const pricing = calculateOrderPricing({
    items: [{ base_price: 80_000, quantity: 1 }],
    tax_rate: taxRate,
    service_charge_rate: serviceChargeRate,
  });
  const paidAmount = 50_000;

  assert.equal(pricing.total_amount, 92_000);
  assert.equal(pricing.total_amount - paidAmount, 42_000);
});

test('create-and-pay golden case matches backend estimate inputs', () => {
  const pricing = calculateOrderPricing({
    items: [{ base_price: 35_000, variant_price_delta: 5_000, quantity: 3 }],
    tax_rate: 0.11,
    service_charge_rate: 0.05,
  });

  assert.equal(pricing.order_subtotal, 120_000);
  assert.equal(pricing.tax_amount, 13_200);
  assert.equal(pricing.service_charge_amount, 6_000);
  assert.equal(pricing.total_amount, 139_200);
});

test('P9.12 split/cart pricing keeps unit deltas separate from line totals', () => {
  const qtyOne = calculateOrderPricing({
    items: [{ base_price: 15_000, variant_price_delta: 5_000, quantity: 1 }],
    tax_rate: 0,
    service_charge_rate: 0,
  });
  const qtyTwo = calculateOrderPricing({
    items: [{ base_price: 15_000, variant_price_delta: 5_000, quantity: 2 }],
    tax_rate: 0,
    service_charge_rate: 0,
  });
  const unitTwentyEightQtyTwo = calculateOrderPricing({
    items: [{ base_price: 28_000, quantity: 2 }],
    tax_rate: 0,
    service_charge_rate: 0,
  });

  assert.equal(qtyOne.items[0].item_price, 20_000);
  assert.equal(qtyOne.items[0].item_total, 20_000);
  assert.equal(qtyTwo.items[0].item_price, 20_000);
  assert.equal(qtyTwo.items[0].item_total, 40_000);
  assert.notEqual(qtyTwo.items[0].item_total, 80_000);
  assert.equal(unitTwentyEightQtyTwo.items[0].item_total, 56_000);
});
