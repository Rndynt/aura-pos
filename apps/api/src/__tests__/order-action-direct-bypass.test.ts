import '../../register-paths';
import assert from 'node:assert/strict';
import { after, afterEach, describe, it } from 'node:test';
import http from 'node:http';
import express, { type NextFunction, type Request, type Response } from 'express';

process.env.DATABASE_URL ||= 'postgres://user:pass@127.0.0.1:5432/aurapos_test';
process.env.BETTER_AUTH_SECRET ||= 'test-secret-with-at-least-32-characters';

type OrderRow = {
  id: string;
  tenant_id: string;
  outletId?: string | null;
  status: string;
  paymentStatus?: string;
  payment_status?: string;
};

const updateBody = {
  items: [{ product_id: 'prod-1', product_name: 'Coffee', base_price: 10, quantity: 1 }],
};

async function request(app: express.Express, method: string, path: string, body: Record<string, unknown>) {
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const address = server.address();
  assert(address && typeof address === 'object');

  try {
    const response = await fetch(`http://127.0.0.1:${address.port}${path}`, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const responseBody = await response.json().catch(() => null);
    return { status: response.status, body: responseBody };
  } finally {
    await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
  }
}

function buildApp(controller: (req: Request, res: Response, next: NextFunction) => void, method: 'patch' | 'post', path: string, role?: string) {
  const app = express();
  app.use(express.json());
  app.use('/api', (req: Request, _res: Response, next: NextFunction) => {
    req.tenantId = 'tenant-1';
    if (role) req.posRole = role as any;
    next();
  });
  app[method](path, controller);
  app.use((error: any, _req: Request, res: Response, _next: NextFunction) => {
    res.status(error?.statusCode ?? 500).json({ code: error?.code ?? 'ERROR', message: error?.message });
  });
  return app;
}

describe('order action API/controller direct-bypass guards', async () => {
  const { container } = await import('../container');
  const controllers = await import('../http/controllers/OrdersController');

  afterEach(() => {
    controllers.__setOrderActionPolicyBaseOverrideForTests(null);
  });

  after(async () => {
    const { sql: postgresSql } = await import('@pos/infrastructure/database');
    await postgresSql.end({ timeout: 1 });
  });

  function setOrder(order: OrderRow) {
    (container as any).orderRepository = {
      findById: async (orderId: string, tenantId: string) =>
        order.id === orderId && order.tenant_id === tenantId ? order : null,
    };
  }

  it('rejects PATCH/update against an active confirmed order with ORDER_NOT_EDITABLE', async () => {
    setOrder({ id: 'order-1', tenant_id: 'tenant-1', status: 'confirmed', payment_status: 'unpaid' });
    (container as any).updateOrder = { execute: async () => { throw Object.assign(new Error('not editable'), { code: 'ORDER_NOT_EDITABLE' }); } };
    const app = buildApp(controllers.updateOrder, 'patch', '/api/orders/:id');

    const response = await request(app, 'PATCH', '/api/orders/order-1', updateBody);

    assert.equal(response.status, 409);
    assert.equal(response.body?.code, 'ORDER_NOT_EDITABLE');
  });

  it('rejects PATCH/update against a kitchen-locked order with KITCHEN_ORDER_LOCKED', async () => {
    setOrder({ id: 'order-1', tenant_id: 'tenant-1', status: 'draft', payment_status: 'unpaid' });
    (container as any).updateOrder = { execute: async () => { throw Object.assign(new Error('kitchen locked'), { code: 'KITCHEN_ORDER_LOCKED' }); } };
    const app = buildApp(controllers.updateOrder, 'patch', '/api/orders/:id');

    const response = await request(app, 'PATCH', '/api/orders/order-1', updateBody);

    assert.equal(response.status, 409);
    assert.equal(response.body?.code, 'KITCHEN_ORDER_LOCKED');
  });

  it('rejects PATCH/update against fired kitchen items with FIRED_ITEMS_LOCKED', async () => {
    setOrder({ id: 'order-1', tenant_id: 'tenant-1', status: 'draft', payment_status: 'unpaid' });
    (container as any).updateOrder = { execute: async () => { throw Object.assign(new Error('fired locked'), { code: 'FIRED_ITEMS_LOCKED' }); } };
    const app = buildApp(controllers.updateOrder, 'patch', '/api/orders/:id');

    const response = await request(app, 'PATCH', '/api/orders/order-1', updateBody);

    assert.equal(response.status, 409);
    assert.equal(response.body?.code, 'FIRED_ITEMS_LOCKED');
  });

  it('allows PATCH/update for an editable draft order', async () => {
    setOrder({ id: 'order-1', tenant_id: 'tenant-1', status: 'draft', payment_status: 'unpaid' });
    (container as any).updateOrder = { execute: async () => ({ order: { id: 'order-1', status: 'draft' }, pricing: { total: 10 } }) };
    const app = buildApp(controllers.updateOrder, 'patch', '/api/orders/:id');

    const response = await request(app, 'PATCH', '/api/orders/order-1', updateBody);

    assert.equal(response.status, 200);
    assert.equal(response.body?.success, true);
  });

  it('allows full cash payment on a payable order without orders_queue entitlement', async () => {
    setOrder({ id: 'order-1', tenant_id: 'tenant-1', status: 'served', payment_status: 'unpaid' });
    (container as any).recordPayment = { execute: async () => ({ payment: { id: 'pay-1' }, order: { id: 'order-1' }, remainingAmount: 0 }) };
    const app = buildApp(controllers.recordPayment, 'post', '/api/orders/:id/payments');

    const response = await request(app, 'POST', '/api/orders/order-1/payments', { amount: 10, payment_method: 'cash', payment_flow: 'full_payment' });

    assert.equal(response.status, 201);
    assert.equal(response.body?.success, true);
  });

  it('rejects partial payment without payments_partial_payment entitlement', async () => {
    setOrder({ id: 'order-1', tenant_id: 'tenant-1', status: 'served', payment_status: 'unpaid' });
    controllers.__setOrderActionPolicyBaseOverrideForTests(() => ({ businessProfile: 'food_beverage', entitlements: [] }));
    const app = buildApp(controllers.recordPayment, 'post', '/api/orders/:id/payments');

    const response = await request(app, 'POST', '/api/orders/order-1/payments', { amount: 5, payment_method: 'cash', payment_flow: 'partial_payment_dp' });

    assert.equal(response.status, 403);
    assert.equal(response.body?.code, 'PARTIAL_PAYMENT_ENTITLEMENT_REQUIRED');
  });

  it('allows partial payment with payments_partial_payment entitlement', async () => {
    setOrder({ id: 'order-1', tenant_id: 'tenant-1', status: 'served', payment_status: 'unpaid' });
    controllers.__setOrderActionPolicyBaseOverrideForTests(() => ({ businessProfile: 'food_beverage', entitlements: ['payments_partial_payment'] }));
    (container as any).recordPayment = { execute: async () => ({ payment: { id: 'pay-1' }, order: { id: 'order-1' }, remainingAmount: 5 }) };
    const app = buildApp(controllers.recordPayment, 'post', '/api/orders/:id/payments');

    const response = await request(app, 'POST', '/api/orders/order-1/payments', { amount: 5, payment_method: 'cash', payment_flow: 'partial_payment_dp' });

    assert.equal(response.status, 201);
    assert.equal(response.body?.success, true);
  });

  it('rejects payment on cancelled order with PAYMENT_NOT_ALLOWED', async () => {
    setOrder({ id: 'order-1', tenant_id: 'tenant-1', status: 'cancelled', payment_status: 'unpaid' });
    const app = buildApp(controllers.recordPayment, 'post', '/api/orders/:id/payments');

    const response = await request(app, 'POST', '/api/orders/order-1/payments', { amount: 10, payment_method: 'cash' });

    assert.equal(response.status, 409);
    assert.equal(response.body?.code, 'PAYMENT_NOT_ALLOWED');
  });

  it('allows cancel draft order without active cancellation permission', async () => {
    setOrder({ id: 'order-1', tenant_id: 'tenant-1', status: 'draft', payment_status: 'unpaid' });
    (container as any).cancelOrderWorkflow = { execute: async () => ({ order: { id: 'order-1', status: 'cancelled' } }) };
    const app = buildApp(controllers.cancelOrder, 'post', '/api/orders/:id/cancel', 'cashier');

    const response = await request(app, 'POST', '/api/orders/order-1/cancel', {});

    assert.equal(response.status, 200);
    assert.equal(response.body?.success, true);
  });

  it('rejects active order cancel without a reason', async () => {
    setOrder({ id: 'order-1', tenant_id: 'tenant-1', status: 'confirmed', payment_status: 'unpaid' });
    const app = buildApp(controllers.cancelOrder, 'post', '/api/orders/:id/cancel', 'manager');

    const response = await request(app, 'POST', '/api/orders/order-1/cancel', {});

    assert.equal(response.status, 400);
    assert.equal(response.body?.code, 'ORDER_CANCEL_REASON_REQUIRED');
  });

  it('rejects active order cancel with reason when caller lacks mapped permission', async () => {
    setOrder({ id: 'order-1', tenant_id: 'tenant-1', status: 'confirmed', payment_status: 'unpaid' });
    const app = buildApp(controllers.cancelOrder, 'post', '/api/orders/:id/cancel', 'cashier');

    const response = await request(app, 'POST', '/api/orders/order-1/cancel', { cancellation_reason: 'Customer requested cancel' });

    assert.equal(response.status, 409);
    assert.equal(response.body?.code, 'ORDER_ACTION_NOT_ALLOWED');
  });

  it('allows active order cancel with reason when role maps to orders:cancel_active', async () => {
    setOrder({ id: 'order-1', tenant_id: 'tenant-1', status: 'confirmed', payment_status: 'unpaid' });
    controllers.__setOrderActionPolicyBaseOverrideForTests(() => ({ businessProfile: 'food_beverage', entitlements: [] }));
    (container as any).cancelOrderWorkflow = { execute: async () => ({ order: { id: 'order-1', status: 'cancelled' } }) };
    const app = buildApp(controllers.cancelOrder, 'post', '/api/orders/:id/cancel', 'manager');

    const response = await request(app, 'POST', '/api/orders/order-1/cancel', { cancellation_reason: 'Customer requested cancel' });

    assert.equal(response.status, 200);
    assert.equal(response.body?.success, true);
  });
});
