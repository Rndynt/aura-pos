import '../../register-paths';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import express from 'express';
import WebSocket from 'ws';
import type { Request } from 'express';

process.env.NODE_ENV = 'test';
process.env.DATABASE_URL ||= 'postgres://user:pass@127.0.0.1:5432/aurapos_test';
process.env.BETTER_AUTH_SECRET ||= 'test-secret-with-at-least-32-characters';

const { registerRoutes } = await import('../routes');
const { createAppContainer } = await import('../composition/createAppContainer');
const { loadApiConfig } = await import('../bootstrap/env');

type TestServer = {
  baseUrl: string;
  close: () => Promise<void>;
};

const tokenTenant = new Map([
  ['tenant-1-token', 'tenant-1'],
  ['tenant-2-token', 'tenant-2'],
]);

async function buildServer(): Promise<TestServer> {
  const app = express();
  app.use(express.json({
    verify: (req, _res, buf) => {
      (req as Request & { rawBody?: Buffer }).rawBody = buf;
    },
  }));

  const server = await registerRoutes(app, {
    container: createAppContainer(),
    config: loadApiConfig(),
    requireCfdToken: async (req) => {
      const header = req.headers['x-cfd-key'];
      const token = Array.isArray(header) ? header[0] : header;
      const tenantId = typeof token === 'string' ? tokenTenant.get(token) : null;
      return tenantId ? { deviceId: `${tenantId}-device`, tenantId, deviceName: 'CFD' } : null;
    },
    requireCfdWebSocketToken: async (_req, url) => {
      const token = url.searchParams.get('cfdKey') ?? url.searchParams.get('token');
      const tenantId = token ? tokenTenant.get(token) : null;
      return tenantId ? { deviceId: `${tenantId}-device`, tenantId, deviceName: 'CFD' } : null;
    },
  });

  await new Promise<void>((resolve) => server.listen(0, resolve));
  const address = server.address();
  assert(address && typeof address === 'object');

  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    close: () => new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve()))),
  };
}

function validCfdMessage() {
  return {
    type: 'ordering',
    tenantName: 'Tenant One',
    orderNumber: 'ORD-1',
    items: [{ id: 'item-1', name: 'Coffee', quantity: 1, unitPrice: 25_000, itemTotal: 25_000 }],
    subtotal: 25_000,
    tax: 0,
    serviceCharge: 0,
    total: 25_000,
  };
}

async function postCfdUpdate(baseUrl: string, tenantId: string, token: string, body: unknown) {
  const response = await fetch(`${baseUrl}/api/cfd/update`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-tenant-id': tenantId,
      'x-cfd-key': token,
    },
    body: JSON.stringify(body),
  });
  const responseBody = await response.json().catch(() => null);
  return { status: response.status, body: responseBody };
}

function waitForOpen(ws: WebSocket): Promise<void> {
  return new Promise((resolve, reject) => {
    ws.once('open', () => resolve());
    ws.once('error', reject);
  });
}

function waitForClose(ws: WebSocket): Promise<{ code: number; reason: string }> {
  return new Promise((resolve) => {
    ws.once('close', (code, reason) => resolve({ code, reason: reason.toString() }));
  });
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function waitForMessage(ws: WebSocket, timeoutMs = 500): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Timed out waiting for CFD message')), timeoutMs);
    ws.once('message', (data) => {
      clearTimeout(timeout);
      resolve(JSON.parse(data.toString()));
    });
  });
}

describe('CFD tenant token isolation', () => {
  it('rejects cross-tenant CFD update attempts before caching or broadcasting state', async () => {
    const server = await buildServer();
    const ws = new WebSocket(`${server.baseUrl.replace('http:', 'ws:')}/ws/cfd?tenantId=tenant-1&cfdKey=tenant-1-token`);

    try {
      await waitForOpen(ws);
      await wait(25);

      const response = await postCfdUpdate(server.baseUrl, 'tenant-2', 'tenant-1-token', validCfdMessage());
      assert.equal(response.status, 403);
      assert.equal(response.body?.success, false);

      await assert.rejects(waitForMessage(ws), /Timed out waiting for CFD message/);
    } finally {
      ws.terminate();
      await server.close();
    }
  });

  it('closes WebSocket subscriptions when the CFD token belongs to another tenant', async () => {
    const server = await buildServer();
    const ws = new WebSocket(`${server.baseUrl.replace('http:', 'ws:')}/ws/cfd?tenantId=tenant-1&cfdKey=tenant-2-token`);

    try {
      const close = await waitForClose(ws);
      assert.equal(close.code, 1008);
      assert.match(close.reason, /tenant mismatch/i);
    } finally {
      await server.close();
    }
  });

  it('broadcasts only to the tenant that owns the validated CFD token', async () => {
    const server = await buildServer();
    const tenantOneWs = new WebSocket(`${server.baseUrl.replace('http:', 'ws:')}/ws/cfd?tenantId=tenant-1&cfdKey=tenant-1-token`);
    const tenantTwoWs = new WebSocket(`${server.baseUrl.replace('http:', 'ws:')}/ws/cfd?tenantId=tenant-2&cfdKey=tenant-2-token`);

    try {
      await Promise.all([waitForOpen(tenantOneWs), waitForOpen(tenantTwoWs)]);
      await wait(25);

      const tenantOneMessage = waitForMessage(tenantOneWs);
      const tenantTwoMessage = waitForMessage(tenantTwoWs);
      const response = await postCfdUpdate(server.baseUrl, 'tenant-1', 'tenant-1-token', validCfdMessage());
      assert.equal(response.status, 200);
      assert.equal(response.body?.clientCount, 1);

      const message = await tenantOneMessage;
      assert.equal((message as { type?: string }).type, 'ordering');
      await assert.rejects(tenantTwoMessage, /Timed out waiting for CFD message/);
    } finally {
      tenantOneWs.terminate();
      tenantTwoWs.terminate();
      await server.close();
    }
  });

  it('rejects oversized or non-whitelisted CFD payloads', async () => {
    const server = await buildServer();

    try {
      const invalidSchema = await postCfdUpdate(server.baseUrl, 'tenant-1', 'tenant-1-token', {
        ...validCfdMessage(),
        unexpected: 'field',
      });
      assert.equal(invalidSchema.status, 400);

      const oversized = await postCfdUpdate(server.baseUrl, 'tenant-1', 'tenant-1-token', {
        type: 'idle',
        tenantName: 'x'.repeat(20_000),
      });
      assert.equal(oversized.status, 413);
    } finally {
      await server.close();
    }
  });
});
