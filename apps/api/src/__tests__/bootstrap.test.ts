import '../../register-paths';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import http from 'node:http';
import express from 'express';
import { createCorsMiddleware, isOriginAllowed } from '../bootstrap/cors';
import { loadApiConfig, parseTrustedOrigins } from '../bootstrap/env';
import { registerAuthRoutes } from '../bootstrap/auth';

process.env.DATABASE_URL ||= 'postgres://user:pass@127.0.0.1:5432/aurapos_test';
process.env.BETTER_AUTH_SECRET ||= 'test-secret-with-at-least-32-characters';

async function request(app: express.Express, path: string, init: RequestInit = {}) {
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const address = server.address();
  assert(address && typeof address === 'object');

  try {
    const response = await fetch(`http://127.0.0.1:${address.port}${path}`, init);
    const body = await response.json().catch(() => null);
    return { response, body };
  } finally {
    await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
  }
}

describe('API bootstrap CORS parsing', () => {
  it('parses comma-separated trusted origins from env', () => {
    assert.deepEqual(parseTrustedOrigins(' https://admin.example.com,https://pos.example.com ,, '), [
      'https://admin.example.com',
      'https://pos.example.com',
    ]);

    const config = loadApiConfig({
      DATABASE_URL: 'postgres://user:pass@127.0.0.1:5432/db',
      PORT: '5050',
      NODE_ENV: 'production',
      BASE_DOMAIN: 'example.com',
      EXTRA_TRUSTED_ORIGINS: 'https://admin.example.com, https://pos.example.com',
    });

    assert.equal(config.port, 5050);
    assert.equal(config.isProduction, true);
    assert.deepEqual(config.extraTrustedOrigins, ['https://admin.example.com', 'https://pos.example.com']);
  });

  it('allows production base-domain and env allowlist origins but rejects LAN origins', async () => {
    const config = {
      baseDomain: 'aurapos.my.id',
      isProduction: true,
      extraTrustedOrigins: ['https://ops.example.com'],
    };

    assert.equal(isOriginAllowed('https://aurapos.my.id', config), true);
    assert.equal(isOriginAllowed('https://tenant.aurapos.my.id', config), true);
    assert.equal(isOriginAllowed('https://ops.example.com', config), true);
    assert.equal(isOriginAllowed('http://192.168.1.20:5173', config), false);

    const app = express();
    app.use(createCorsMiddleware(config));
    app.get('/ping', (_req, res) => res.json({ ok: true }));

    const allowed = await request(app, '/ping', { headers: { Origin: 'https://ops.example.com' } });
    assert.equal(allowed.response.headers.get('access-control-allow-origin'), 'https://ops.example.com');

    const denied = await request(app, '/ping', { headers: { Origin: 'http://192.168.1.20:5173' } });
    assert.equal(denied.response.headers.get('access-control-allow-origin'), null);
  });

  it('allows LAN origins only for local non-production API hosts', () => {
    assert.equal(isOriginAllowed('http://192.168.1.20:5173', {
      baseDomain: 'localhost',
      isProduction: false,
      extraTrustedOrigins: [],
    }), true);

    assert.equal(isOriginAllowed('http://192.168.1.20:5173', {
      baseDomain: 'localhost',
      isProduction: true,
      extraTrustedOrigins: [],
    }), false);
  });
});

describe('API bootstrap auth route compatibility', () => {
  it('serves /api/auth/me before the Better Auth wildcard handler', async () => {
    const app = express();
    let wildcardHit = false;

    registerAuthRoutes(app, {
      authApi: {
        getSession: async () => ({ user: { id: 'user-1', name: 'Owner', email: 'owner@example.com' } }),
      },
      database: {
        execute: async () => [{ tenant_id: 'tenant-1', username: 'owner', role: 'owner' }],
      },
      authHandler: (_req, res) => {
        wildcardHit = true;
        res.status(418).json({ wildcard: true });
      },
    });

    const { response, body } = await request(app, '/api/auth/me');

    assert.equal(response.status, 200);
    assert.equal(wildcardHit, false);
    assert.equal(body?.success, true);
    assert.equal(body?.data?.tenantId, 'tenant-1');
    assert.equal(body?.data?.username, 'owner');
  });

  it('keeps /api/auth/* compatibility through the Better Auth wildcard handler', async () => {
    const app = express();

    registerAuthRoutes(app, {
      authApi: { getSession: async () => null },
      database: { execute: async () => [] },
      authHandler: (req, res) => res.status(202).json({ path: req.path }),
    });

    const { response, body } = await request(app, '/api/auth/sign-in/email');

    assert.equal(response.status, 202);
    assert.equal(body?.path, '/api/auth/sign-in/email');
  });
});
