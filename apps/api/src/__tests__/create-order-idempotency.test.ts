import '../../register-paths';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

process.env.NODE_ENV = 'test';
process.env.DATABASE_URL ||= 'postgres://user:pass@127.0.0.1:5432/aurapos_test';
process.env.BETTER_AUTH_SECRET ||= 'test-secret-with-at-least-32-characters';

const { CreateOrder } = await import('@pos/application/orders/CreateOrder');

type StoredOrder = {
  id: string;
  tenantId: string;
  orderTypeId?: string | null;
  orderNumber: string;
  status: string;
  subtotal: string;
  taxAmount: string;
  serviceCharge: string;
  discountAmount: string;
  total: string;
  paidAmount: string;
  paymentStatus: string;
  customerName?: string | null;
  tableNumber?: string | null;
  notes?: string | null;
  idempotencyKey?: string | null;
  createdAt: Date;
  updatedAt: Date;
  items?: any[];
};

class FakeOrderRepository {
  readonly orders: StoredOrder[] = [];
  createCount = 0;
  private sequence = 0;

  async findByIdempotencyKey(tenantId: string, idempotencyKey: string): Promise<StoredOrder | null> {
    return this.orders.find(
      (order) => order.tenantId === tenantId && order.idempotencyKey === idempotencyKey,
    ) ?? null;
  }

  async generateOrderNumber() {
    this.sequence += 1;
    return `ORD-TEST-${String(this.sequence).padStart(4, '0')}`;
  }

  async create(order: any, orderItems: any[], tenantId: string): Promise<StoredOrder> {
    this.createCount += 1;
    const row: StoredOrder = {
      id: `order-${this.createCount}`,
      ...order,
      tenantId,
      createdAt: new Date('2026-06-02T00:00:00.000Z'),
      updatedAt: new Date('2026-06-02T00:00:00.000Z'),
      items: orderItems.map((item, index) => ({
        id: `item-${this.createCount}-${index + 1}`,
        productId: item.product_id,
        productName: item.product_name,
        unitPrice: String(item.base_price),
        quantity: item.quantity,
        itemSubtotal: String(item.item_subtotal),
        status: item.status,
      })),
    };
    this.orders.push(row);
    return row;
  }
}

class FakeTenantRepository {
  async findById(tenantId: string) {
    return { id: tenantId, is_active: true };
  }
}

class FakeProductAvailabilityService {
  calls = 0;

  async execute() {
    this.calls += 1;
    return { isAvailable: true };
  }
}

function createInput(tenantId: string, idempotencyKey: string) {
  return {
    tenant_id: tenantId,
    items: [
      {
        product_id: 'product-1',
        product_name: 'Retry-safe product',
        base_price: 10,
        quantity: 2,
      },
    ],
    tax_rate: 0,
    service_charge_rate: 0,
    idempotency_key: idempotencyKey,
  };
}

describe('CreateOrder idempotency retry', () => {
  it('replays the existing tenant order before insert when the same key is retried', async () => {
    const orderRepository = new FakeOrderRepository();
    const availability = new FakeProductAvailabilityService();
    const useCase = new CreateOrder(
      orderRepository as any,
      new FakeTenantRepository() as any,
      availability as any,
    );

    const first = await useCase.execute(createInput('tenant-1', 'retry-key-create-order'));
    const retry = await useCase.execute(createInput('tenant-1', 'retry-key-create-order'));

    assert.equal(first.order.id, retry.order.id);
    assert.equal(retry.idempotent_replay, true);
    assert.equal(orderRepository.createCount, 1);
    assert.equal(orderRepository.orders.length, 1);
    assert.equal(availability.calls, 1, 'replay should short-circuit before product availability checks');
  });

  it('scopes replay lookup by tenant so the same key can be used by different tenants', async () => {
    const orderRepository = new FakeOrderRepository();
    const availability = new FakeProductAvailabilityService();
    const useCase = new CreateOrder(
      orderRepository as any,
      new FakeTenantRepository() as any,
      availability as any,
    );

    const tenantOne = await useCase.execute(createInput('tenant-1', 'same-key-different-tenant'));
    const tenantTwo = await useCase.execute(createInput('tenant-2', 'same-key-different-tenant'));

    assert.notEqual(tenantOne.order.id, tenantTwo.order.id);
    assert.equal(orderRepository.createCount, 2);
    assert.equal(orderRepository.orders.length, 2);
  });
});
