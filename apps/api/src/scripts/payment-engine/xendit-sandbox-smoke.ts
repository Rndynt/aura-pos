/**
 * xendit-sandbox-smoke.ts — Manual smoke script for Xendit sandbox integration.
 *
 * ⚠️  SANDBOX ONLY — Phase 7A.  No real money movement.
 * ⚠️  This script calls the REAL Xendit sandbox API.
 *     It must NOT run in CI or in environments without explicit opt-in.
 *
 * Prerequisites:
 *   XENDIT_SANDBOX_SMOKE_TEST=true
 *   XENDIT_SANDBOX_ENABLED=true
 *   XENDIT_SECRET_KEY_SANDBOX=xnd_development_...
 *   XENDIT_WEBHOOK_TOKEN_SANDBOX=...
 *   PAYMENT_ENGINE_SERVICE_TOKEN=<at-least-32-char-token>
 *   API_BASE_URL=http://localhost:5000  (AuraPoS API must be running)
 *
 * Usage:
 *   XENDIT_SANDBOX_SMOKE_TEST=true \
 *   XENDIT_SANDBOX_ENABLED=true \
 *   XENDIT_SECRET_KEY_SANDBOX=xnd_development_... \
 *   XENDIT_WEBHOOK_TOKEN_SANDBOX=... \
 *   PAYMENT_ENGINE_SERVICE_TOKEN=... \
 *   npx tsx --tsconfig apps/api/tsconfig.node.json \
 *     apps/api/src/scripts/payment-engine/xendit-sandbox-smoke.ts
 *
 * Auth notes:
 *   - Normal payment-engine routes require x-payment-engine-service-token.
 *   - Webhook route uses x-callback-token — NOT the service token.
 */

const SMOKE_ENABLED = process.env['XENDIT_SANDBOX_SMOKE_TEST'] === 'true';
const SANDBOX_ENABLED = process.env['XENDIT_SANDBOX_ENABLED'] === 'true';
const SECRET_KEY = process.env['XENDIT_SECRET_KEY_SANDBOX'] ?? '';
const SERVICE_TOKEN = process.env['PAYMENT_ENGINE_SERVICE_TOKEN'] ?? '';
const NODE_ENV = process.env['NODE_ENV'] ?? 'development';
const API_BASE = process.env['API_BASE_URL'] ?? 'http://localhost:5000';

// ── Safety guards ──────────────────────────────────────────────────────────────

if (NODE_ENV === 'production') {
  console.error('[xendit-sandbox-smoke] REFUSED: NODE_ENV=production. This script is sandbox-only.');
  process.exit(1);
}

if (!SMOKE_ENABLED) {
  console.log('[xendit-sandbox-smoke] Skipped: XENDIT_SANDBOX_SMOKE_TEST is not set to "true".');
  console.log('  Set XENDIT_SANDBOX_SMOKE_TEST=true to run this smoke test.');
  process.exit(0);
}

if (!SANDBOX_ENABLED) {
  console.error('[xendit-sandbox-smoke] FAILED: XENDIT_SANDBOX_ENABLED must be "true".');
  process.exit(1);
}

if (!SECRET_KEY) {
  console.error('[xendit-sandbox-smoke] FAILED: XENDIT_SECRET_KEY_SANDBOX is not set.');
  process.exit(1);
}

if (SERVICE_TOKEN.length < 32) {
  console.error(
    '[xendit-sandbox-smoke] FAILED: PAYMENT_ENGINE_SERVICE_TOKEN must be at least 32 characters. ' +
      'This token authenticates calls to the payment-engine service routes.',
  );
  process.exit(1);
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const TENANT_ID = 'demo-tenant';
/** Headers for normal payment-engine routes (require service token + tenant-id). */
const HEADERS = {
  'Content-Type': 'application/json',
  'x-tenant-id': TENANT_ID,
  'x-payment-engine-service-token': SERVICE_TOKEN,
};

/**
 * POST to a payment-engine route with service token auth.
 * Unwraps the { success, data } envelope returned by sendSuccess().
 */
async function apiPost(path: string, body: unknown): Promise<{ status: number; data: unknown }> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: HEADERS,
    body: JSON.stringify(body),
  });
  const envelope = await res.json() as Record<string, unknown>;
  const data = ('data' in envelope) ? envelope['data'] : envelope;
  return { status: res.status, data };
}

/**
 * GET a payment-engine route with service token auth.
 * Unwraps the { success, data } envelope returned by sendSuccess().
 */
async function apiGet(path: string): Promise<{ status: number; data: unknown }> {
  const res = await fetch(`${API_BASE}${path}`, { headers: HEADERS });
  const envelope = await res.json() as Record<string, unknown>;
  const data = ('data' in envelope) ? envelope['data'] : envelope;
  return { status: res.status, data };
}

function step(label: string): void {
  console.log(`\n── ${label} ${'─'.repeat(Math.max(0, 50 - label.length))}`);
}

function check(label: string, condition: boolean): void {
  if (condition) {
    console.log(`  ✅ ${label}`);
  } else {
    console.error(`  ❌ FAIL: ${label}`);
    process.exit(1);
  }
}

// ── Smoke flow ────────────────────────────────────────────────────────────────

console.log('[xendit-sandbox-smoke] Starting Xendit sandbox smoke test...');
console.log(`  API_BASE: ${API_BASE}`);
console.log(`  TENANT:   ${TENANT_ID}`);
console.log(`  NODE_ENV: ${NODE_ENV}`);

(async () => {
  // Step 1 — Create a payment intent
  step('Step 1: Create payment intent');
  const intentRes = await apiPost('/api/payment-engine/intents', {
    payable_type: 'order',
    payable_id: `smoke-order-${Date.now()}`,
    amount_due: 10000,
    currency: 'IDR',
    allow_partial: false,
    metadata: { source: 'xendit-sandbox-smoke' },
  });
  console.log(`  HTTP ${intentRes.status}`);
  check('201 Created', intentRes.status === 201);

  const intent = intentRes.data as Record<string, unknown>;
  const intentId = intent['id'] as string;
  console.log(`  Intent ID: ${intentId}`);
  check('has id', typeof intentId === 'string' && intentId.length > 0);

  // Step 2 — Create Xendit sandbox gateway payment (QRIS)
  step('Step 2: Create Xendit sandbox payment (QRIS)');
  const payRes = await apiPost(
    `/api/payment-engine/intents/${intentId}/gateway-payments`,
    {
      provider: 'xendit_sandbox',
      method: 'qris',
      amount: 10000,
      metadata: { xendit_channel_code: 'QRIS' },
    },
  );
  console.log(`  HTTP ${payRes.status}`);

  const payData = payRes.data as Record<string, unknown>;
  // The response wraps the transaction under a 'transaction' key.
  const txData = (payData['transaction'] ?? payData) as Record<string, unknown>;
  console.log(`  Transaction status: ${txData['status'] ?? payData['status'] ?? '(none)'}`);
  console.log(`  Provider reference: ${payData['providerReference']}`);

  if (payRes.status === 422) {
    console.warn('  ⚠️  422 from API — xendit_sandbox provider may not be registered.');
    console.warn('     Check that XENDIT_SANDBOX_ENABLED=true and the API was restarted.');
    process.exit(1);
  }

  check('2xx response', payRes.status >= 200 && payRes.status < 300);
  check('has providerReference', typeof payData['providerReference'] === 'string');

  const providerRef = payData['providerReference'] as string;
  console.log(`  Xendit payment_request_id: ${providerRef}`);

  // Step 3 — Check intent status
  step('Step 3: Check intent status');
  const statusRes = await apiGet(`/api/payment-engine/intents/${intentId}/status`);
  console.log(`  HTTP ${statusRes.status}`);
  check('200 OK', statusRes.status === 200);

  const statusData = statusRes.data as Record<string, unknown>;
  console.log(`  isTerminal:     ${statusData['isTerminal']}`);
  console.log(`  requiresAction: ${statusData['requiresAction']}`);
  console.log(`  canRetryPayment:${statusData['canRetryPayment']}`);
  check('isTerminal=false (pending/requires_action)', statusData['isTerminal'] === false);

  // Step 4 — Check refundability
  step('Step 4: Check refundability');
  const refundRes = await apiGet(`/api/payment-engine/intents/${intentId}/refundability`);
  console.log(`  HTTP ${refundRes.status}`);
  check('200 OK', refundRes.status === 200);

  console.log('\n[xendit-sandbox-smoke] ✅ All steps passed!');
  console.log('\nNext steps (manual):');
  console.log(`  - Configure Xendit webhook URL: POST ${API_BASE}/api/payment-engine/webhooks/xendit_sandbox`);
  console.log('  - Simulate payment completion in Xendit sandbox dashboard');
  console.log(`  - Poll intent status: GET ${API_BASE}/api/payment-engine/intents/${intentId}/status`);
})().catch((err: unknown) => {
  console.error('[xendit-sandbox-smoke] Unhandled error:', err);
  process.exit(1);
});
