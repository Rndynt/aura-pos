import assert from 'node:assert/strict';
import { UpdateOrder } from '../UpdateOrder';

const validInput = {
  order_id: 'order-1',
  tenant_id: 'tenant-1',
  items: [{ product_id: 'p1', product_name: 'Coffee', base_price: 10000, quantity: 1 }],
};

async function runCase(order: any, lockState = { hasKitchenTicket: false, hasFiredKitchenItems: false }) {
  let updated = false;
  const useCase = new UpdateOrder(
    {
      findById: async () => order,
      getEditLockState: async () => lockState,
      updateWithItems: async () => { updated = true; return order; },
    } as any,
    { findById: async () => ({ id: 'tenant-1', is_active: true }) } as any,
  );
  try {
    await useCase.execute(validInput);
    return { code: 'OK', updated };
  } catch (error) {
    return { code: (error as any).code, updated };
  }
}

assert.deepEqual(await runCase({ id: 'order-1', status: 'draft', paymentStatus: 'unpaid' }), { code: 'OK', updated: true });
assert.deepEqual(await runCase({ id: 'order-1', status: 'confirmed', paymentStatus: 'unpaid' }), { code: 'ORDER_NOT_EDITABLE', updated: false });
assert.deepEqual(await runCase({ id: 'order-1', status: 'draft', paymentStatus: 'unpaid' }, { hasKitchenTicket: true, hasFiredKitchenItems: false }), { code: 'KITCHEN_ORDER_LOCKED', updated: false });
assert.deepEqual(await runCase({ id: 'order-1', status: 'draft', paymentStatus: 'unpaid' }, { hasKitchenTicket: false, hasFiredKitchenItems: true }), { code: 'FIRED_ITEMS_LOCKED', updated: false });
assert.deepEqual(await runCase({ id: 'order-1', status: 'draft', paymentStatus: 'paid' }), { code: 'ORDER_NOT_EDITABLE', updated: false });
