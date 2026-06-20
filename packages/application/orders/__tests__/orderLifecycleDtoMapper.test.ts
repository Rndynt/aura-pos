import assert from 'node:assert/strict';
import { getOrderLifecycleDtoFields } from '../mappers/orderLifecycleDtoMapper';

assert.deepEqual(getOrderLifecycleDtoFields({ status: 'draft', paymentStatus: 'unpaid' }).lifecycleKind, 'server_draft');
assert.equal(getOrderLifecycleDtoFields({ status: 'draft', paymentStatus: 'unpaid' }).isEditableDraft, true);

const active = getOrderLifecycleDtoFields({ status: 'confirmed', paymentStatus: 'unpaid' });
assert.equal(active.lifecycleKind, 'active_order');
assert.equal(active.isEditableDraft, false);
assert.equal(active.isActiveOrder, true);

const kitchen = getOrderLifecycleDtoFields({ status: 'preparing', paymentStatus: 'unpaid' }, { hasKitchenTicket: true });
assert.equal(kitchen.lifecycleKind, 'active_kitchen_order');
assert.equal(kitchen.isKitchenLocked, true);
assert.equal(kitchen.isEditableDraft, false);

const paid = getOrderLifecycleDtoFields({ status: 'confirmed', paymentStatus: 'paid' });
assert.equal(paid.lifecycleKind, 'paid_completed');
assert.equal(paid.isActiveOrder, false);

const localFallback = getOrderLifecycleDtoFields({ status: 'draft' });
assert.equal(localFallback.isEditableDraft, true);
