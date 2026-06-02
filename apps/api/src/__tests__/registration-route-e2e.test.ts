import '../../register-paths';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import http from 'node:http';
import express from 'express';

process.env.DATABASE_URL ||= 'postgres://user:pass@127.0.0.1:5432/aurapos_test';
process.env.BETTER_AUTH_SECRET ||= 'test-secret-with-at-least-32-characters';

const { createRegistrationRouter } = await import('../http/routes/registration');

async function request(app: express.Express, path: string, body?: unknown) {
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const address = server.address();
  assert(address && typeof address === 'object');

  try {
    const response = await fetch(`http://127.0.0.1:${address.port}${path}`, {
      method: body === undefined ? 'GET' : 'POST',
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const json = await response.json().catch(() => null);
    return { status: response.status, body: json, headers: response.headers };
  } finally {
    await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
  }
}

describe('POST /api/register E2E', () => {
  it('uses the canonical route to create owner-backed tenant onboarding data', async () => {
    const calls: any[] = [];
    const app = express();
    app.use(express.json());
    app.use('/api/register', createRegistrationRouter({
      baseDomain: 'aurapos.test',
      checkSlugExists: async (slug: string) => slug === 'taken-slug',
      registerTenantOwner: async (input: any) => {
        calls.push(input);
        return {
          tenant: {
            id: 'tenant-1',
            slug: input.slug,
            name: input.businessName,
            url: `https://${input.slug}.aurapos.test`,
          },
          ownerUserId: 'owner-1',
          defaultOutletId: 'outlet-1',
          featureCodes: ['receipt_printer', 'sales_reports'],
          orderTypeCodes: ['DINE_IN', 'TAKE_AWAY'],
          catalogSeed: { categories: 2, products: 6 },
        };
      },
    }));

    const response = await request(app, '/api/register', {
      slug: 'Kopi-Maju',
      businessName: 'Kopi Maju',
      businessType: 'CAFE_RESTAURANT',
      ownerName: 'Owner Kopi',
      ownerEmail: 'owner@kopimaju.test',
      ownerUsername: 'kopi_owner',
      ownerPassword: 'Secret123!',
    });

    assert.equal(response.status, 201);
    assert.equal(response.body.success, true);
    assert.equal(response.body.tenant.slug, 'kopi-maju');
    assert.equal(response.body.defaultOutletId, 'outlet-1');
    assert.deepEqual(response.body.featureCodes, ['receipt_printer', 'sales_reports']);
    assert.deepEqual(response.body.orderTypeCodes, ['DINE_IN', 'TAKE_AWAY']);
    assert.deepEqual(response.body.catalogSeed, { categories: 2, products: 6 });
    assert.equal(calls.length, 1);
    assert.equal(calls[0].slug, 'kopi-maju');
    assert.equal(calls[0].ownerEmail, 'owner@kopimaju.test');
  });

  it('keeps slug reservation and duplicate checks before onboarding writes', async () => {
    let registerCalled = false;
    const app = express();
    app.use(express.json());
    app.use('/api/register', createRegistrationRouter({
      checkSlugExists: async () => true,
      registerTenantOwner: async () => {
        registerCalled = true;
        throw new Error('should not be called');
      },
    }));

    const response = await request(app, '/api/register', {
      slug: 'taken-slug',
      businessName: 'Taken',
      ownerName: 'Owner',
      ownerEmail: 'owner@taken.test',
      ownerUsername: 'taken_owner',
      ownerPassword: 'Secret123!',
    });

    assert.equal(response.status, 409);
    assert.equal(registerCalled, false);
  });
});
