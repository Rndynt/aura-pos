import '../../register-paths';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import http from 'node:http';
import express from 'express';
import { createCorsMiddleware, isOriginAllowed } from '../bootstrap/cors';
import { loadApiConfig, parseTrustedOrigins, parseTrustProxy } from '../bootstrap/env';
import { evaluateBootMigrationPolicy } from '../bootstrap/migrations';
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
      CORS_ALLOWED_ORIGINS: 'https://admin.example.com, https://pos.example.com',
      EXTRA_TRUSTED_ORIGINS: 'https://legacy.example.com',
    });

    assert.equal(config.port, 5050);
    assert.equal(config.isProduction, true);
    assert.deepEqual(config.corsAllowedOrigins, ['https://admin.example.com', 'https://pos.example.com']);
    assert.deepEqual(config.extraTrustedOrigins, ['https://admin.example.com', 'https://pos.example.com']);
    assert.equal(config.autoMigrateOnBoot, false);
    assert.equal(config.trustProxy, false);
  });

  it('parses TRUST_PROXY as false, true, or hop count', () => {
    assert.equal(parseTrustProxy(undefined), false);
    assert.equal(parseTrustProxy(''), false);
    assert.equal(parseTrustProxy(' false '), false);
    assert.equal(parseTrustProxy('true'), true);
    assert.equal(parseTrustProxy('1'), 1);
    assert.equal(parseTrustProxy('2'), 2);

    assert.throws(() => parseTrustProxy('yes'), /TRUST_PROXY must be one of/);
    assert.throws(() => parseTrustProxy('-1'), /TRUST_PROXY must be one of/);
  });

  it('loads TRUST_PROXY from env and keeps production unset default safe', () => {
    const withTrue = loadApiConfig({
      DATABASE_URL: 'postgres://user:pass@127.0.0.1:5432/db',
      TRUST_PROXY: 'true',
    });
    const withHop = loadApiConfig({
      DATABASE_URL: 'postgres://user:pass@127.0.0.1:5432/db',
      NODE_ENV: 'production',
      TRUST_PROXY: '1',
    });
    const productionUnset = loadApiConfig({
      DATABASE_URL: 'postgres://user:pass@127.0.0.1:5432/db',
      NODE_ENV: 'production',
    });

    assert.equal(withTrue.trustProxy, true);
    assert.equal(withHop.trustProxy, 1);
    assert.equal(productionUnset.trustProxy, false);
  });

  it('falls back to deprecated EXTRA_TRUSTED_ORIGINS when CORS_ALLOWED_ORIGINS is unset', () => {
    const config = loadApiConfig({
      DATABASE_URL: 'postgres://user:pass@127.0.0.1:5432/db',
      EXTRA_TRUSTED_ORIGINS: 'https://legacy.example.com',
    });

    assert.deepEqual(config.corsAllowedOrigins, ['https://legacy.example.com']);
    assert.deepEqual(config.extraTrustedOrigins, ['https://legacy.example.com']);
  });

  it('keeps boot-time migrations disabled by default in production', () => {
    const config = loadApiConfig({
      DATABASE_URL: 'postgres://user:pass@127.0.0.1:5432/db',
      NODE_ENV: 'production',
    });

    const policy = evaluateBootMigrationPolicy(config);

    assert.equal(config.autoMigrateOnBoot, false);
    assert.equal(policy.shouldRun, false);
    assert.match(policy.reason, /skipping boot-time DB migrations/);
  });

  it('rejects API_AUTO_MIGRATE_ON_BOOT in production', () => {
    const config = loadApiConfig({
      DATABASE_URL: 'postgres://user:pass@127.0.0.1:5432/db',
      NODE_ENV: 'production',
      API_AUTO_MIGRATE_ON_BOOT: 'true',
    });

    assert.equal(config.autoMigrateOnBoot, true);
    assert.throws(
      () => evaluateBootMigrationPolicy(config),
      /API_AUTO_MIGRATE_ON_BOOT=true is not allowed when NODE_ENV=production/,
    );
  });

  it('allows API_AUTO_MIGRATE_ON_BOOT only for non-production development opt-in', () => {
    const config = loadApiConfig({
      DATABASE_URL: 'postgres://user:pass@127.0.0.1:5432/db',
      NODE_ENV: 'development',
      API_AUTO_MIGRATE_ON_BOOT: 'true',
    });

    const policy = evaluateBootMigrationPolicy(config);

    assert.equal(config.autoMigrateOnBoot, true);
    assert.equal(policy.shouldRun, true);
  });

  it('allows production base-domain and env allowlist origins but rejects LAN origins', async () => {
    const config = {
      baseDomain: 'aurapos.my.id',
      isProduction: true,
      corsAllowedOrigins: ['https://ops.example.com'],
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
      corsAllowedOrigins: [],
    }), true);

    assert.equal(isOriginAllowed('http://192.168.1.20:5173', {
      baseDomain: 'localhost',
      isProduction: true,
      corsAllowedOrigins: [],
    }), false);
  });

  it('rejects empty and unknown origins', () => {
    const config = {
      baseDomain: 'aurapos.my.id',
      isProduction: true,
      corsAllowedOrigins: ['https://pos.example.com'],
    };

    assert.equal(isOriginAllowed('', config), false);
    assert.equal(isOriginAllowed('https://unknown.example.com', config), false);
  });

  it('does not allow localhost or Replit helper origins in production unless explicitly allowlisted', () => {
    const config = {
      baseDomain: 'aurapos.my.id',
      isProduction: true,
      corsAllowedOrigins: ['https://pos.example.com'],
    };

    assert.equal(isOriginAllowed('http://localhost:5173', config), false);
    assert.equal(isOriginAllowed('https://workspace.replit.dev', config), false);
    assert.equal(isOriginAllowed('https://pos.example.com', config), true);
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
