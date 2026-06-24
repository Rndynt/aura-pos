import '../../register-paths';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import http from 'node:http';
import express, { type RequestHandler } from 'express';

process.env.NODE_ENV = 'test';
process.env.DATABASE_URL ||= 'postgres://user:pass@127.0.0.1:5432/aurapos_test';
process.env.BETTER_AUTH_SECRET ||= 'test-secret-with-at-least-32-characters';

const { createTerminalsRouter } = await import('../http/routes/terminals');

async function request(app: express.Express, path: string, init: RequestInit = {}) {
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const address = server.address();
  assert(address && typeof address === 'object');

  try {
    const response = await fetch(`http://127.0.0.1:${address.port}${path}`, init);
    const body = await response.json().catch(() => null);
    return { status: response.status, body };
  } finally {
    await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
  }
}

describe('createTerminalsRouter', () => {
  it('uses injected terminal route handlers without constructing database-backed controllers', async () => {
    const calls: string[] = [];
    const handler = (name: string): RequestHandler => (_req, res) => {
      calls.push(name);
      res.json({ success: true, handler: name });
    };

    const app = express();
    app.use(express.json());
    app.use((_req, _res, next) => {
      _req.tenantId = 'tenant-1';
      _req.posRole = 'manager';
      next();
    });
    app.use('/api/terminals', createTerminalsRouter({
      registerTerminal: handler('registerTerminal'),
      listTerminals: handler('listTerminals'),
      heartbeatTerminal: handler('heartbeatTerminal'),
      deactivateTerminal: handler('deactivateTerminal'),
    }));

    const response = await request(app, '/api/terminals');

    assert.equal(response.status, 200);
    assert.equal(response.body?.handler, 'listTerminals');
    assert.deepEqual(calls, ['listTerminals']);
  });
});
