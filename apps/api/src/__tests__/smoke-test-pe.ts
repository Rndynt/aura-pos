/**
 * Payment Engine — HTTP Smoke Test
 *
 * Runs end-to-end HTTP assertions against a LIVE server (default: localhost:5000).
 *
 * ── Authentication ────────────────────────────────────────────────────────────
 * This script uses the service-token bypass path (dev/non-production only).
 *
 * Requirements:
 *   1. The server must NOT be running in NODE_ENV=production.
 *   2. Set `PAYMENT_ENGINE_SERVICE_TOKEN` to a 32+ character string in your
 *      environment (e.g. in .env or exported in the shell):
 *
 *        export PAYMENT_ENGINE_SERVICE_TOKEN="my-dev-smoke-test-token-32chars-min"
 *
 *   3. The same token must be set on the server process.
 *
 * If the token is not set, all payment-engine requests will return 401
 * because `requirePaymentOperator` will fall back to requiring a Better Auth
 * session with cashier+ role.
 *
 * ── Run command ───────────────────────────────────────────────────────────────
 *   # Start server first (in another terminal):
 *   npm run dev
 *
 *   # Then run smoke test:
 *   PAYMENT_ENGINE_SERVICE_TOKEN="my-dev-smoke-test-token-32chars-min" \
 *     node_modules/.bin/tsx --tsconfig apps/api/tsconfig.node.json \
 *     apps/api/src/__tests__/smoke-test-pe.ts
 *
 * ── Production ────────────────────────────────────────────────────────────────
 * The service token bypass is HARD-DISABLED when NODE_ENV=production.
 * In production, use a real Better Auth session (login → obtain cookie/token →
 * include it in the Authorization / Cookie header).
 */

import '../../register-paths';
import assert from 'node:assert/strict';

const BASE = process.env.SMOKE_BASE_URL ?? 'http://localhost:5000';
const SERVICE_TOKEN = process.env.PAYMENT_ENGINE_SERVICE_TOKEN ?? '';

if (!SERVICE_TOKEN || SERVICE_TOKEN.length < 32) {
  console.error(
    '\n❌  PAYMENT_ENGINE_SERVICE_TOKEN is not set or is shorter than 32 characters.\n' +
    '    Export it before running:\n\n' +
    '      export PAYMENT_ENGINE_SERVICE_TOKEN="my-dev-smoke-test-token-32chars-min"\n\n' +
    '    The server must also have the same token configured.\n',
  );
  process.exit(1);
}

// ── DB setup: find or create a smoke-test tenant ──────────────────────────────

import { db } from '@pos/infrastructure/database';
import { tenants } from '@shared/schema';
import { eq } from 'drizzle-orm';

const existing = await db.select({ id: tenants.id }).from(tenants).where(eq(tenants.slug, 'smoke-test')).limit(1);
let tenantId: string;
if (existing.length > 0) {
  tenantId = existing[0].id;
  console.log(`Found existing smoke-test tenant: ${tenantId}`);
} else {
  const [t] = await db.insert(tenants).values({
    name: 'Smoke Test Tenant',
    slug: 'smoke-test',
    businessType: 'CAFE_RESTAURANT',
    planTier: 'free',
    subscriptionStatus: 'active',
    timezone: 'UTC',
    currency: 'IDR',
    locale: 'id-ID',
    isActive: true,
  }).returning({ id: tenants.id });
  tenantId = t.id;
  console.log(`Created smoke-test tenant: ${tenantId}`);
}

console.log(`\nRunning smoke tests with tenantId=${tenantId}`);
console.log(`Using service token: ${SERVICE_TOKEN.slice(0, 8)}...\n`);

// ── HTTP helper ───────────────────────────────────────────────────────────────

async function api(method: string, path: string, body?: object, overrideTenantId?: string) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'x-tenant-id': overrideTenantId ?? tenantId,
      'x-payment-engine-service-token': SERVICE_TOKEN,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json();
  return { status: res.status, body: json };
}

const IDEM_KEY = `smoke-idem-${Date.now()}`;

// ── Test 1: Create intent ─────────────────────────────────────────────────────
const t1 = await api('POST', '/api/payment-engine/intents', {
  payable_type: 'order',
  payable_id: 'smoke-order-001',
  amount_due: 75000,
  allow_partial: true,
  idempotency_key: IDEM_KEY,
});
console.log('POST /intents:', t1.status, JSON.stringify(t1.body).substring(0, 200));
assert.equal(t1.status, 201, `Expected 201, got ${t1.status}: ${JSON.stringify(t1.body)}`);
assert.equal(t1.body.success, true);
const intentId = t1.body.data.id;
console.log(`  → intent ID: ${intentId}`);

// ── Test 2: Idempotency replay ────────────────────────────────────────────────
const t2 = await api('POST', '/api/payment-engine/intents', {
  payable_type: 'order',
  payable_id: 'smoke-order-001',
  amount_due: 75000,
  idempotency_key: IDEM_KEY,
});
console.log('POST /intents (idempotent):', t2.status);
assert.equal(t2.status, 200, `Expected 200, got ${t2.status}`);
assert.equal(t2.body.data.id, intentId);

// ── Test 3: GET intent ────────────────────────────────────────────────────────
const t3 = await api('GET', `/api/payment-engine/intents/${intentId}`);
console.log('GET /intents/:id:', t3.status, t3.body.data?.status);
assert.equal(t3.status, 200);
assert.equal(t3.body.data.status, 'requires_payment');
assert.equal(t3.body.data.amountDue, 75000);

// ── Test 4: Partial payment ───────────────────────────────────────────────────
const t4 = await api('POST', `/api/payment-engine/intents/${intentId}/manual-payments`, {
  amount: 30000,
  method: 'cash',
  received_amount: 30000,
  notes: 'Smoke test partial',
});
console.log('POST /manual-payments (partial):', t4.status, JSON.stringify(t4.body).substring(0, 200));
assert.equal(t4.status, 200);
assert.equal(t4.body.data.intent.status, 'partially_paid');
assert.equal(t4.body.data.intent.amountPaid, 30000);

// ── Test 5: List transactions ─────────────────────────────────────────────────
const t5 = await api('GET', `/api/payment-engine/intents/${intentId}/transactions`);
console.log('GET /transactions:', t5.status, `count=${t5.body.data?.transactions?.length}`);
assert.equal(t5.status, 200);
assert.equal(t5.body.data.transactions.length, 1);

// ── Test 6: Complete payment ──────────────────────────────────────────────────
const t6 = await api('POST', `/api/payment-engine/intents/${intentId}/manual-payments`, {
  amount: 45000,
  method: 'qris',
  received_amount: 45000,
});
console.log('POST /manual-payments (complete):', t6.status, `status=${t6.body.data?.intent?.status}`);
assert.equal(t6.status, 200);
assert.equal(t6.body.data.intent.status, 'paid');

// ── Test 7: Reject payment on paid intent ─────────────────────────────────────
const t7 = await api('POST', `/api/payment-engine/intents/${intentId}/manual-payments`, {
  amount: 1000,
  method: 'cash',
  received_amount: 1000,
});
console.log('POST /manual-payments (on paid intent):', t7.status);
assert.equal(t7.status, 422);

// ── Test 8: Tenant isolation ──────────────────────────────────────────────────
const t8 = await api('GET', `/api/payment-engine/intents/${intentId}`, undefined, 'non-existent-tenant-xyz');
console.log('GET /intents (wrong tenant):', t8.status);
assert.ok([400, 404].includes(t8.status), `Expected 400 or 404, got ${t8.status}`);

// ── Test 9: Wrong service token returns 401 ───────────────────────────────────
const t9 = await fetch(`${BASE}/api/payment-engine/intents`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'x-tenant-id': tenantId,
    'x-payment-engine-service-token': 'wrong-token',
  },
  body: JSON.stringify({ payable_type: 'order', payable_id: 'test', amount_due: 100 }),
});
const t9body = await t9.json();
console.log('POST /intents (wrong token):', t9.status, t9body.code);
assert.equal(t9.status, 401, `Wrong token must be rejected with 401, got ${t9.status}`);
assert.equal(t9body.code, 'INVALID_SERVICE_TOKEN');

// ── Test 10: No token, no session → 401 ──────────────────────────────────────
const t10 = await fetch(`${BASE}/api/payment-engine/intents`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'x-tenant-id': tenantId,
  },
  body: JSON.stringify({ payable_type: 'order', payable_id: 'test', amount_due: 100 }),
});
const t10body = await t10.json();
console.log('POST /intents (no auth):', t10.status);
assert.equal(t10.status, 401, `No auth must be rejected with 401, got ${t10.status}`);

console.log('\n✅ All smoke tests passed!\n');
process.exit(0);
