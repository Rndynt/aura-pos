import '../../register-paths';
import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';
import http from 'node:http';
import express, { type NextFunction, type Request, type Response } from 'express';

process.env.DATABASE_URL ||= 'postgres://user:pass@127.0.0.1:5432/aurapos_test';
process.env.BETTER_AUTH_SECRET ||= 'test-secret-with-at-least-32-characters';

const { container } = await import('../container');
const { createAndPay, recordPayment, __setOrderActionPolicyBaseOverrideForTests } = await import('../http/controllers/OrdersController');

type TestAppOptions = { tenantId: string; outletId?: string };

async function request(app: express.Express, path: string, body: Record<string, unknown>) {
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const address = server.address();
  assert(address && typeof address === 'object');
  try {
    const response = await fetch(`http://127.0.0.1:${address.port}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-idempotency-key': 'regression-idempotency-key' },
      body: JSON.stringify(body),
    });
    return { status: response.status, body: await response.json().catch(() => null) };
  } finally {
    await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
  }
}

function buildApp(options: TestAppOptions) {
  const app = express();
  app.use(express.json());
  app.use('/api', (req: Request, _res: Response, next: NextFunction) => {
    req.tenantId = options.tenantId;
    req.outletId = options.outletId;
    next();
  });
  app.post('/api/orders/create-and-pay', createAndPay);
  app.post('/api/orders/:id/payments', recordPayment);
  app.use((error: any, _req: Request, res: Response, _next: NextFunction) => {
    res.status(error?.statusCode ?? 500).json({ code: error?.code ?? 'ERROR', message: error?.message });
  });
  return app;
}

after(async () => {
  __setOrderActionPolicyBaseOverrideForTests(null);
  const { sql: postgresSql } = await import('@pos/infrastructure/database');
  await postgresSql.end({ timeout: 1 });
});

describe('orders handlers tenant and lifecycle regressions', () => {
  it('denies cross-tenant payment attempts before invoking payment persistence', async () => {
    let paymentExecuted = false;
    (container as any).orderRepository = {
      findById: async (_orderId: string, tenantId: string) => tenantId === 'tenant-owner'
        ? { id: 'order-1', tenant_id: 'tenant-owner', status: 'confirmed', payment_status: 'unpaid', outletId: 'outlet-1' }
        : null,
    };
    (container as any).recordPayment = { execute: async () => { paymentExecuted = true; return {}; } };

    const result = await request(buildApp({ tenantId: 'tenant-attacker' }), '/api/orders/order-1/payments', {
      amount: 100,
      payment_method: 'CASH',
    });

    assert.equal(result.status, 404);
    assert.equal(result.body?.code, 'ORDER_NOT_FOUND');
    assert.equal(paymentExecuted, false);
  });

  it('keeps create-and-pay lifecycle partial when shared pricing totals exceed payment amount', async () => {
    let receivedInput: any;
    (container as any).posPaymentOrderTypeRepository = { validateOrderTypeForTenant: async () => ({ valid: true, orderTypeId: null }) };
    (container as any).createAndPayOrder = {
      execute: async (input: any) => {
        receivedInput = input;
        return { order: { id: 'order-2' }, payment: { id: 'payment-1' }, remainingAmount: 12 };
      },
    };
    __setOrderActionPolicyBaseOverrideForTests(() => ({ businessProfile: 'core_standard', entitlements: ['payments_partial_payment'] }));

    const result = await request(buildApp({ tenantId: 'tenant-1', outletId: 'outlet-1' }), '/api/orders/create-and-pay', {
      items: [{ product_id: 'product-1', product_name: 'Coffee', base_price: 100, quantity: 1, selected_options: [{ group_id: 'g1', group_name: 'Milk', option_id: 'o1', option_name: 'Oat', price_delta: 20 }] }],
      amount: 110,
      payment_method: 'CASH',
    });

    assert.equal(result.status, 201);
    assert.equal(receivedInput.payment_flow, 'DOWN_PAYMENT');
    assert.equal(receivedInput.outlet_id, 'outlet-1');
    assert.equal(receivedInput.idempotency_key, 'regression-idempotency-key');
  });
});
