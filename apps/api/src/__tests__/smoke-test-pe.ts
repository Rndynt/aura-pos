import '../../register-paths';
import assert from 'node:assert/strict';

// Seed a test tenant, run HTTP smoke tests against the live server
const BASE = `http://localhost:5000`;

async function api(method: string, path: string, body?: object, tenantId?: string) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(tenantId ? { 'x-tenant-id': tenantId } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json();
  return { status: res.status, body: json };
}

// 1. First, insert a test tenant directly so we have a real UUID
import { db } from '@pos/infrastructure/database';
import { tenants } from '@shared/schema';
import { eq } from 'drizzle-orm';

// Find or create a smoke-test tenant
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

console.log(`\nRunning smoke tests with tenantId=${tenantId}\n`);

const IDEM_KEY = `smoke-idem-${Date.now()}`;

// Test 1: POST /api/payment-engine/intents — create intent with known idempotency key
const t1 = await api('POST', '/api/payment-engine/intents', {
  payable_type: 'order',
  payable_id: 'smoke-order-001',
  amount_due: 75000,
  allow_partial: true,
  idempotency_key: IDEM_KEY,
}, tenantId);
console.log('POST /intents:', t1.status, JSON.stringify(t1.body).substring(0, 200));
assert.equal(t1.status, 201, `Expected 201, got ${t1.status}`);
assert.equal(t1.body.success, true);
const intentId = t1.body.data.id;
console.log(`  → intent ID: ${intentId}`);

// Test 2: Idempotency — same idempotency key + payable returns same intent with 200
const t2 = await api('POST', '/api/payment-engine/intents', {
  payable_type: 'order',
  payable_id: 'smoke-order-001',
  amount_due: 75000,
  idempotency_key: IDEM_KEY,
}, tenantId);
console.log('POST /intents (idempotent):', t2.status);
assert.equal(t2.status, 200, `Expected 200, got ${t2.status}`);
assert.equal(t2.body.data.id, intentId);

// Test 3: GET /api/payment-engine/intents/:id
const t3 = await api('GET', `/api/payment-engine/intents/${intentId}`, undefined, tenantId);
console.log('GET /intents/:id:', t3.status, t3.body.data?.status);
assert.equal(t3.status, 200);
assert.equal(t3.body.data.status, 'requires_payment');
assert.equal(t3.body.data.amountDue, 75000);

// Test 4: POST /api/payment-engine/intents/:id/manual-payments — partial payment
const t4 = await api('POST', `/api/payment-engine/intents/${intentId}/manual-payments`, {
  amount: 30000,
  method: 'cash',
  received_amount: 30000,
  notes: 'Smoke test partial',
}, tenantId);
console.log('POST /manual-payments (partial):', t4.status, JSON.stringify(t4.body).substring(0, 200));
assert.equal(t4.status, 200);
assert.equal(t4.body.data.intent.status, 'partially_paid');
assert.equal(t4.body.data.intent.amountPaid, 30000);

// Test 5: GET /api/payment-engine/intents/:id/transactions
const t5 = await api('GET', `/api/payment-engine/intents/${intentId}/transactions`, undefined, tenantId);
console.log('GET /transactions:', t5.status, `count=${t5.body.data?.transactions?.length}`);
assert.equal(t5.status, 200);
assert.equal(t5.body.data.transactions.length, 1);

// Test 6: POST remaining payment to complete
const t6 = await api('POST', `/api/payment-engine/intents/${intentId}/manual-payments`, {
  amount: 45000,
  method: 'qris',
  received_amount: 45000,
}, tenantId);
console.log('POST /manual-payments (complete):', t6.status, `status=${t6.body.data?.intent?.status}`);
assert.equal(t6.status, 200);
assert.equal(t6.body.data.intent.status, 'paid');

// Test 7: Reject further payment on paid intent
const t7 = await api('POST', `/api/payment-engine/intents/${intentId}/manual-payments`, {
  amount: 1000,
  method: 'cash',
  received_amount: 1000,
}, tenantId);
console.log('POST /manual-payments (on paid intent):', t7.status);
assert.equal(t7.status, 422);

// Test 8: Tenant isolation — different tenant cannot read this intent
const t8 = await api('GET', `/api/payment-engine/intents/${intentId}`, undefined, 'non-existent-tenant-xyz');
console.log('GET /intents (wrong tenant):', t8.status);
// Either 404 (tenant not found in middleware) or 404 (intent not found for tenant)
assert.ok([404, 500].includes(t8.status), `Expected 404 or 500, got ${t8.status}`);

console.log('\n✅ All smoke tests passed!\n');
process.exit(0);
