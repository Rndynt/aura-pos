import '../../register-paths';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import http from 'node:http';
import express, { type Request, type Response } from 'express';

process.env.NODE_ENV = 'test';
process.env.DATABASE_URL ||= 'postgres://user:pass@127.0.0.1:5432/aurapos_test';
process.env.BETTER_AUTH_SECRET ||= 'test-secret-with-at-least-32-characters';

const { createKdsRouter } = await import('../http/routes/kds');

async function request(app: express.Express, path: string, body: unknown, method = 'PATCH') {
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const address = server.address();
  assert(address && typeof address === 'object');

  try {
    const response = await fetch(`http://127.0.0.1:${address.port}${path}`, {
      method,
      headers: { 'Content-Type': 'application/json', 'X-KDS-Key': 'valid-kds-key' },
      body: JSON.stringify(body),
    });
    const responseBody = await response.json().catch(() => null);
    return { status: response.status, body: responseBody };
  } finally {
    await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
  }
}

describe('KDS order status route', () => {

  async function buildApp() {
    let delegateCalled = false;
    const app = express();
    app.use(express.json());
    app.use('/api/kds', await createKdsRouter({
      authDependencies: {
        auth: { api: { getSession: async () => null } },
        authDb: { execute: async () => [] },
      } as any,
      ordersController: {
        listOrders: (_req: Request, res: Response) => res.status(200).json({ success: true }),
        updateOrderStatus: (req: Request, res: Response) => {
          delegateCalled = true;
          res.status(200).json({
            success: true,
            mode: req.query.mode,
            tenantId: req.tenantId,
          });
        },
      } as any,
      requireKdsKey: async () => ({
        deviceId: 'device-1',
        tenantId: 'tenant-1',
        deviceName: 'Kitchen KDS',
        outletId: null,
      }),
    }));

    return { app, wasDelegateCalled: () => delegateCalled };
  }

  for (const status of ['completed', 'cancelled']) {
    it(`rejects ${status} updates before delegating to OrdersController`, async () => {
      const { app, wasDelegateCalled } = await buildApp();
      const response = await request(app, '/api/kds/orders/order-1/status', { status });

      assert.equal(response.status, 400);
      assert.equal(response.body?.success, false);
      assert.equal(response.body?.code, 'VALIDATION_ERROR');
      assert.equal(wasDelegateCalled(), false);
    });
  }

  it('delegates allowed KDS statuses in kitchen mode', async () => {
    const { app, wasDelegateCalled } = await buildApp();
    const response = await request(app, '/api/kds/orders/order-1/status', { status: 'ready' });

    assert.equal(response.status, 200);
    assert.equal(response.body?.mode, 'kitchen');
    assert.equal(response.body?.tenantId, 'tenant-1');
    assert.equal(wasDelegateCalled(), true);
  });
});
