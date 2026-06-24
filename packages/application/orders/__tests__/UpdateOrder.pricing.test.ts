import assert from 'node:assert/strict';
import { UpdateOrder, type UpdateOrderPersistenceData, type UpdateOrderItemPersistenceData } from '../UpdateOrder';

const order = {
  id: 'order-1',
  status: 'draft',
  paymentStatus: 'unpaid',
};

async function executeUpdateOrder() {
  let capturedOrderUpdates: UpdateOrderPersistenceData | undefined;
  let capturedItems: UpdateOrderItemPersistenceData[] | undefined;

  const useCase = new UpdateOrder(
    {
      findById: async () => order as any,
      getEditLockState: async () => ({ hasKitchenTicket: false, hasFiredKitchenItems: false }),
      updateWithItems: async (_orderId, orderUpdates, newItems) => {
        capturedOrderUpdates = orderUpdates;
        capturedItems = newItems;
        return {
          ...order,
          items: newItems,
          subtotal: Number(orderUpdates.subtotal),
          tax_amount: Number(orderUpdates.taxAmount),
          service_charge_amount: Number(orderUpdates.serviceCharge),
          discount_amount: Number(orderUpdates.discountAmount),
          total_amount: Number(orderUpdates.total),
        } as any;
      },
    },
    { findById: async () => ({ id: 'tenant-1', is_active: true }) } as any,
  );

  const result = await useCase.execute({
    order_id: 'order-1',
    tenant_id: 'tenant-1',
    tax_rate: 0.1,
    service_charge_rate: 0.05,
    items: [
      {
        product_id: 'coffee-1',
        product_name: 'Latte',
        base_price: 20_000,
        variant_id: 'large',
        variant_name: 'Large',
        variant_price_delta: 5_000,
        quantity: 2,
        selected_options: [
          {
            group_id: 'milk',
            group_name: 'Milk',
            option_id: 'oat',
            option_name: 'Oat Milk',
            price_delta: 3_000,
          },
        ],
        selected_option_groups: [
          {
            group_id: 'toppings',
            group_name: 'Toppings',
            selected_options: [
              {
                group_id: 'toppings',
                group_name: 'Toppings',
                option_id: 'cream',
                option_name: 'Cream',
                price_delta: 2_000,
                child_groups: [
                  {
                    group_id: 'sprinkles',
                    group_name: 'Sprinkles',
                    selected_options: [
                      {
                        group_id: 'sprinkles',
                        group_name: 'Sprinkles',
                        option_id: 'choco',
                        option_name: 'Chocolate',
                        price_delta: 1_000,
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
  });

  return { result, capturedOrderUpdates, capturedItems };
}

const { result, capturedOrderUpdates, capturedItems } = await executeUpdateOrder();

assert.ok(capturedOrderUpdates);
assert.equal(capturedOrderUpdates.subtotal, '62000');
assert.equal(capturedOrderUpdates.taxAmount, '6200');
assert.equal(capturedOrderUpdates.serviceCharge, '3100');
assert.equal(capturedOrderUpdates.discountAmount, '0');
assert.equal(capturedOrderUpdates.total, '71300');

assert.ok(capturedItems);
assert.equal(capturedItems.length, 1);
assert.equal(capturedItems[0].item_subtotal, 62_000);
assert.deepEqual(
  capturedItems[0].selected_options?.map((option) => option.option_id),
  ['oat', 'cream', 'choco'],
);
assert.equal(capturedItems[0].selected_option_groups?.[0]?.group_id, 'toppings');

assert.equal(result.pricing.order_subtotal, 62_000);
assert.equal(result.pricing.tax_amount, 6_200);
assert.equal(result.pricing.service_charge_amount, 3_100);
assert.equal(result.pricing.total_discount, 0);
assert.equal(result.pricing.subtotal_after_discount, 62_000);
assert.equal(result.pricing.total_amount, 71_300);
