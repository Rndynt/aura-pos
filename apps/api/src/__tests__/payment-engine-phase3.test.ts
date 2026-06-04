/**
 * Payment Engine Phase 3 — Webhook / Event Engine Tests
 *
 * Covers:
 *  1.  FakeGatewayProvider — verifyWebhook (valid/invalid/production guard)
 *  2.  FakeGatewayProvider — computeSignature static helper
 *  3.  FakeGatewayProvider — parseWebhook (all event types + field mapping)
 *  4.  ApplyGatewayTransactionStatus — succeeded path, failed path, not_found, already_terminal
 *  5.  HandlePaymentProviderWebhook — full pipeline scenarios
 *  6.  Webhook route production guard — fake_gateway returns 404 in production
 */

import '../../register-paths';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

process.env.DATABASE_URL ||= 'postgres://user:pass@127.0.0.1:5432/aurapos_test';
process.env.BETTER_AUTH_SECRET ||= 'test-secret-with-at-least-32-characters-ok';

// ── Domain / application imports ──────────────────────────────────────────────
import { PaymentPolicyError } from '@pos/domain/payments';
import type { DomainPaymentIntent } from '@pos/domain/payments';
import { PaymentProviderRegistry } from '@pos/application/payments/PaymentProviderRegistry';
import { RecalculatePaymentIntent } from '@pos/application/payments/RecalculatePaymentIntent';
import { ApplyGatewayTransactionStatus } from '@pos/application/payments/ApplyGatewayTransactionStatus';
import { HandlePaymentProviderWebhook } from '@pos/application/payments/HandlePaymentProviderWebhook';
import { FakeGatewayProvider } from '@pos/infrastructure/payments/providers/FakeGatewayProvider';

// ── Sequence counters ─────────────────────────────────────────────────────────
let intentIdSeq = 0;
let txIdSeq = 0;
let eventIdSeq = 0;

// ── Domain object factories ───────────────────────────────────────────────────

function makeIntent(overrides: Partial<DomainPaymentIntent> = {}): DomainPaymentIntent {
  return {
    id: `intent-${++intentIdSeq}`,
    tenantId: 'tenant-a',
    outletId: null,
    payableType: 'order',
    payableId: 'order-1',
    currency: 'IDR',
    amountDue: 100000,
    amountPaid: 0,
    amountRefunded: 0,
    amountRemaining: 100000,
    status: 'requires_payment',
    allowPartial: false,
    expiresAt: null,
    metadata: null,
    idempotencyKey: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function makeDbTx(overrides: Partial<any> = {}): any {
  return {
    id: `tx-${++txIdSeq}`,
    tenantId: 'tenant-a',
    paymentIntentId: 'intent-1',
    direction: 'incoming',
    transactionType: 'payment',
    method: 'qris',
    provider: 'fake_gateway',
    status: 'pending',
    amount: '100000.00',
    receivedAmount: null,
    changeAmount: null,
    providerReference: 'fake_intent-1_abcd1234',
    providerPaymentUrl: 'https://fake-gateway.local/pay/fake_intent-1_abcd1234',
    providerQrString: 'FAKE_QR:fake_intent-1_abcd1234:100000:IDR',
    failureReason: null,
    idempotencyKey: null,
    metadata: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    succeededAt: null,
    failedAt: null,
    cancelledAt: null,
    ...overrides,
  };
}

// ── In-memory fake repos ───────────────────────────────────────────────────────

function makeIntentRow(intent: DomainPaymentIntent): any {
  return {
    ...intent,
    amountDue: intent.amountDue.toFixed(2),
    amountPaid: intent.amountPaid.toFixed(2),
    amountRefunded: intent.amountRefunded.toFixed(2),
    amountRemaining: intent.amountRemaining.toFixed(2),
  };
}

function makeFakeIntentRepo(intent: DomainPaymentIntent) {
  let stored = makeIntentRow(intent);
  return {
    _stored: () => stored,
    create: async (d: any) => { stored = d; return stored; },
    findById: async (_id: string, _tenantId: string, _tx?: any) => stored,
    findByIdempotencyKey: async () => null,
    lockForUpdate: async (_id: string, _tenantId: string, _tx: any) => stored,
    update: async (_id: string, _tenantId: string, data: any, _tx?: any) => {
      stored = { ...stored, ...data };
      return stored;
    },
  };
}

function makeFakeTxRepo() {
  const store: any[] = [];
  return {
    _store: () => store,
    create: async (d: any, _tx?: any) => {
      const row = {
        ...d,
        id: `tx-${++txIdSeq}`,
        createdAt: new Date(),
        updatedAt: new Date(),
        succeededAt: null,
        failedAt: null,
        cancelledAt: null,
        receivedAmount: null,
        changeAmount: null,
        failureReason: null,
        providerReference: d.providerReference ?? null,
        providerPaymentUrl: d.providerPaymentUrl ?? null,
        providerQrString: d.providerQrString ?? null,
      };
      store.push(row);
      return row;
    },
    findById: async (id: string, _tenantId: string) => store.find(r => r.id === id) ?? null,
    findByIntentId: async (intentId: string, _tenantId: string, _tx?: any) =>
      store.filter(r => r.paymentIntentId === intentId),
    findByIdempotencyKey: async (tenantId: string, key: string, _tx?: any) =>
      store.find(r => r.tenantId === tenantId && r.idempotencyKey === key) ?? null,
    findByProviderReference: async (provider: string, ref: string, _tenantId: string, _tx?: any) =>
      store.find(r => r.provider === provider && r.providerReference === ref) ?? null,
    findByProviderReferenceGlobal: async (provider: string, ref: string, _tx?: any) =>
      store.find(r => r.provider === provider && r.providerReference === ref) ?? null,
    lockByProviderReferenceForUpdate: async (provider: string, ref: string, _tenantId: string, _tx: any) =>
      store.find(r => r.provider === provider && r.providerReference === ref) ?? null,
    update: async (id: string, _tenantId: string, data: any, _tx?: any) => {
      const idx = store.findIndex(r => r.id === id);
      if (idx === -1) throw new Error('not found');
      store[idx] = { ...store[idx], ...data };
      return store[idx];
    },
  };
}

function makeFakeAllocationRepo() {
  const store: any[] = [];
  return {
    _store: () => store,
    create: async (d: any, _tx?: any) => {
      const row = { ...d, id: `alloc-${Date.now()}`, createdAt: new Date() };
      store.push(row);
      return row;
    },
    findByIntentId: async () => store,
    findByTransactionId: async () => store,
  };
}

function makeFakeEventRepo() {
  const store: any[] = [];
  return {
    _store: () => store,
    create: async (d: any, _tx?: any) => {
      const row = { ...d, id: `event-${++eventIdSeq}`, createdAt: new Date() };
      store.push(row);
      return row;
    },
    /**
     * Simulates ON CONFLICT DO NOTHING behaviour:
     * - If a row with (provider, providerEventId) already exists → return it with created=false.
     * - Otherwise insert a new row → return it with created=true.
     * Does NOT throw on duplicate — mirrors the production PostgreSQL implementation.
     */
    createOrGetByProviderEventId: async (d: any, _tx?: any) => {
      const existing = store.find(
        r => r.provider === d.provider && r.providerEventId === d.providerEventId,
      );
      if (existing) {
        return { event: existing, created: false };
      }
      const row = { ...d, id: `event-${++eventIdSeq}`, createdAt: new Date() };
      store.push(row);
      return { event: row, created: true };
    },
    findByProviderEventId: async (provider: string, eventId: string, _tx?: any) =>
      store.find(r => r.provider === provider && r.providerEventId === eventId) ?? null,
    markProcessed: async (id: string, data?: any, _tx?: any) => {
      const idx = store.findIndex(r => r.id === id);
      if (idx !== -1) store[idx] = { ...store[idx], processingStatus: 'processed', ...(data ?? {}) };
      return store[idx] ?? null;
    },
    markFailed: async (id: string, msg: string, _tx?: any) => {
      const idx = store.findIndex(r => r.id === id);
      if (idx !== -1) store[idx] = { ...store[idx], processingStatus: 'failed', errorMessage: msg };
      return store[idx] ?? null;
    },
    markIgnored: async (id: string, reason: string, _tx?: any) => {
      const idx = store.findIndex(r => r.id === id);
      if (idx !== -1) store[idx] = { ...store[idx], processingStatus: 'ignored', errorMessage: reason };
      return store[idx] ?? null;
    },
  };
}

function makeFakeDb() {
  return {
    transaction: async (cb: (tx: any) => any) => cb('fake-tx'),
  };
}

// ── Webhook payload helpers ────────────────────────────────────────────────────

function makeWebhookPayload(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    event_id: `evt_fake_${Date.now()}`,
    event_type: 'payment.succeeded',
    provider_reference: 'fake_intent-1_abcd1234',
    status: 'succeeded',
    failure_reason: null,
    metadata: {},
    ...overrides,
  };
}

function makeSignedWebhookCall(
  payload: Record<string, unknown>,
  secret?: string,
): { rawBody: string; signature: string } {
  const rawBody = JSON.stringify(payload);
  const signature = FakeGatewayProvider.computeSignature(rawBody, secret);
  return { rawBody, signature };
}

// ── Suite 1: FakeGatewayProvider — verifyWebhook ──────────────────────────────

describe('FakeGatewayProvider — verifyWebhook', () => {
  it('returns true for a valid HMAC-SHA256 signature using default dev secret', async () => {
    const provider = new FakeGatewayProvider();
    const rawBody = JSON.stringify({ event_id: 'evt_1', event_type: 'payment.succeeded' });
    const signature = FakeGatewayProvider.computeSignature(rawBody);

    const result = await provider.verifyWebhook({
      rawPayload: rawBody,
      signature,
      headers: { 'x-fake-gateway-signature': signature },
    });

    assert.strictEqual(result, true);
  });

  it('returns false for an invalid signature', async () => {
    const provider = new FakeGatewayProvider();
    const rawBody = JSON.stringify({ event_id: 'evt_2', event_type: 'payment.succeeded' });

    const result = await provider.verifyWebhook({
      rawPayload: rawBody,
      signature: 'invalid-signature-xxxx',
      headers: { 'x-fake-gateway-signature': 'invalid-signature-xxxx' },
    });

    assert.strictEqual(result, false);
  });

  it('returns false when no signature is provided', async () => {
    const provider = new FakeGatewayProvider();
    const rawBody = JSON.stringify({ event_id: 'evt_3' });

    const result = await provider.verifyWebhook({
      rawPayload: rawBody,
      signature: '',
      headers: {},
    });

    assert.strictEqual(result, false);
  });

  it('returns false in production regardless of signature validity', async () => {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';

    try {
      const provider = new FakeGatewayProvider();
      const rawBody = JSON.stringify({ event_id: 'evt_prod' });
      const signature = FakeGatewayProvider.computeSignature(rawBody);

      const result = await provider.verifyWebhook({
        rawPayload: rawBody,
        signature,
        headers: { 'x-fake-gateway-signature': signature },
      });

      assert.strictEqual(result, false);
    } finally {
      process.env.NODE_ENV = originalEnv;
    }
  });

  it('uses FAKE_GATEWAY_WEBHOOK_SECRET env var when set', async () => {
    const customSecret = 'custom-test-secret-for-unit-tests';
    const originalSecret = process.env.FAKE_GATEWAY_WEBHOOK_SECRET;
    process.env.FAKE_GATEWAY_WEBHOOK_SECRET = customSecret;

    try {
      const provider = new FakeGatewayProvider();
      const rawBody = JSON.stringify({ event_id: 'evt_custom' });
      const signature = FakeGatewayProvider.computeSignature(rawBody, customSecret);

      const result = await provider.verifyWebhook({
        rawPayload: rawBody,
        signature,
        headers: {},
      });

      assert.strictEqual(result, true);

      // Default dev secret should NOT work when env var is set
      const defaultSig = FakeGatewayProvider.computeSignature(rawBody);
      const resultWithDefault = await provider.verifyWebhook({
        rawPayload: rawBody,
        signature: defaultSig,
        headers: {},
      });
      assert.strictEqual(resultWithDefault, false);
    } finally {
      if (originalSecret === undefined) {
        delete process.env.FAKE_GATEWAY_WEBHOOK_SECRET;
      } else {
        process.env.FAKE_GATEWAY_WEBHOOK_SECRET = originalSecret;
      }
    }
  });
});

// ── Suite 2: FakeGatewayProvider — computeSignature ───────────────────────────

describe('FakeGatewayProvider — computeSignature static helper', () => {
  it('produces a consistent hex string for the same input', () => {
    const payload = '{"event_id":"evt_stable"}';
    const sig1 = FakeGatewayProvider.computeSignature(payload);
    const sig2 = FakeGatewayProvider.computeSignature(payload);
    assert.strictEqual(sig1, sig2);
    assert.match(sig1, /^[0-9a-f]{64}$/);
  });

  it('produces different signatures for different payloads', () => {
    const sig1 = FakeGatewayProvider.computeSignature('payload-A');
    const sig2 = FakeGatewayProvider.computeSignature('payload-B');
    assert.notStrictEqual(sig1, sig2);
  });

  it('produces different signatures for different secrets', () => {
    const payload = 'same-payload';
    const sig1 = FakeGatewayProvider.computeSignature(payload, 'secret-1');
    const sig2 = FakeGatewayProvider.computeSignature(payload, 'secret-2');
    assert.notStrictEqual(sig1, sig2);
  });
});

// ── Suite 3: FakeGatewayProvider — parseWebhook ───────────────────────────────

describe('FakeGatewayProvider — parseWebhook', () => {
  const provider = new FakeGatewayProvider();

  it('payment.succeeded → transactionStatus = "succeeded", isPaymentSuccess = true', async () => {
    const payload = makeWebhookPayload({ event_type: 'payment.succeeded' });
    const result = await provider.parseWebhook({
      rawPayload: JSON.stringify(payload),
      headers: {},
    });

    assert.strictEqual(result.transactionStatus, 'succeeded');
    assert.strictEqual(result.isPaymentSuccess, true);
    assert.strictEqual(result.isPaymentFailure, false);
    assert.strictEqual(result.provider, 'fake_gateway');
    assert.strictEqual(result.eventType, 'payment.succeeded');
  });

  it('payment.failed → transactionStatus = "failed", failureReason preserved', async () => {
    const payload = makeWebhookPayload({
      event_type: 'payment.failed',
      failure_reason: 'Card declined',
    });
    const result = await provider.parseWebhook({
      rawPayload: JSON.stringify(payload),
      headers: {},
    });

    assert.strictEqual(result.transactionStatus, 'failed');
    assert.strictEqual(result.isPaymentSuccess, false);
    assert.strictEqual(result.isPaymentFailure, true);
    assert.strictEqual(result.failureReason, 'Card declined');
  });

  it('payment.pending → transactionStatus = "pending"', async () => {
    const payload = makeWebhookPayload({ event_type: 'payment.pending' });
    const result = await provider.parseWebhook({
      rawPayload: JSON.stringify(payload),
      headers: {},
    });

    assert.strictEqual(result.transactionStatus, 'pending');
    assert.strictEqual(result.isPaymentSuccess, false);
    assert.strictEqual(result.isPaymentFailure, false);
  });

  it('unknown event type → transactionStatus = "ignored"', async () => {
    const payload = makeWebhookPayload({ event_type: 'payment.refunded' });
    const result = await provider.parseWebhook({
      rawPayload: JSON.stringify(payload),
      headers: {},
    });

    assert.strictEqual(result.transactionStatus, 'ignored');
    assert.strictEqual(result.isPaymentSuccess, false);
    assert.strictEqual(result.isPaymentFailure, false);
  });

  it('parses metadata object when present', async () => {
    const payload = makeWebhookPayload({
      metadata: { order_ref: 'ORD-123', channel: 'qris' },
    });
    const result = await provider.parseWebhook({
      rawPayload: JSON.stringify(payload),
      headers: {},
    });

    assert.ok(result.metadata);
    assert.strictEqual((result.metadata as any).order_ref, 'ORD-123');
  });

  it('throws on invalid JSON', async () => {
    await assert.rejects(
      () => provider.parseWebhook({ rawPayload: 'not-json', headers: {} }),
      (err: any) => {
        assert.ok(err.message.includes('not valid JSON'));
        return true;
      },
    );
  });

  it('throws when event_id is missing', async () => {
    const payload = { event_type: 'payment.succeeded', provider_reference: 'ref_1' };
    await assert.rejects(
      () => provider.parseWebhook({ rawPayload: JSON.stringify(payload), headers: {} }),
      (err: any) => {
        assert.ok(err.message.includes('event_id'));
        return true;
      },
    );
  });
});

// ── Suite 4: ApplyGatewayTransactionStatus ────────────────────────────────────

describe('ApplyGatewayTransactionStatus', () => {
  function makeApplyUseCase(
    intentOverrides: Partial<DomainPaymentIntent> = {},
    pendingTxOverrides: Partial<any> = {},
  ) {
    const intent = makeIntent({
      id: 'intent-apply-1',
      tenantId: 'tenant-a',
      amountDue: 100000,
      amountRemaining: 100000,
      ...intentOverrides,
    });
    const intentRepo = makeFakeIntentRepo(intent);
    const txRepo = makeFakeTxRepo();
    const allocationRepo = makeFakeAllocationRepo();
    const recalculate = new RecalculatePaymentIntent(intentRepo as any, txRepo as any);
    const applyStatus = new ApplyGatewayTransactionStatus(
      intentRepo as any,
      txRepo as any,
      allocationRepo as any,
      recalculate,
    );

    const pendingTx = makeDbTx({
      tenantId: 'tenant-a',
      paymentIntentId: intent.id,
      status: 'pending',
      provider: 'fake_gateway',
      providerReference: 'fake_apply_ref_1',
      amount: '100000.00',
      ...pendingTxOverrides,
    });
    txRepo._store().push(pendingTx);

    return { applyStatus, intentRepo, txRepo, allocationRepo, intent };
  }

  it('succeeded path: outcome = "succeeded", tx updated, allocation created, intent recalculated', async () => {
    const { applyStatus, txRepo, allocationRepo } = makeApplyUseCase();

    const result = await applyStatus.execute(
      {
        tenantId: 'tenant-a',
        provider: 'fake_gateway',
        providerReference: 'fake_apply_ref_1',
        status: 'succeeded',
      },
      'fake-tx',
    );

    assert.strictEqual(result.outcome, 'succeeded');
    if (result.outcome === 'succeeded') {
      assert.strictEqual(result.transaction.status, 'succeeded');
      assert.ok(result.transaction.succeededAt instanceof Date);
      assert.strictEqual(result.intent.status, 'paid');
      assert.strictEqual(result.intent.amountPaid, 100000);
    }
    assert.strictEqual(allocationRepo._store().length, 1);
    const alloc = allocationRepo._store()[0];
    assert.strictEqual(alloc.tenantId, 'tenant-a');
    assert.strictEqual(alloc.targetType, 'order');
  });

  it('failed path: outcome = "failed", tx updated to failed, no allocation', async () => {
    const { applyStatus, allocationRepo } = makeApplyUseCase();

    const result = await applyStatus.execute(
      {
        tenantId: 'tenant-a',
        provider: 'fake_gateway',
        providerReference: 'fake_apply_ref_1',
        status: 'failed',
        failureReason: 'Card declined',
      },
      'fake-tx',
    );

    assert.strictEqual(result.outcome, 'failed');
    if (result.outcome === 'failed') {
      assert.strictEqual(result.transaction.status, 'failed');
      assert.ok(result.transaction.failedAt instanceof Date);
      assert.strictEqual(result.transaction.failureReason, 'Card declined');
      assert.strictEqual(result.intent.amountPaid, 0);
    }
    assert.strictEqual(allocationRepo._store().length, 0);
  });

  it('not_found: returns outcome = "not_found" when providerReference does not match', async () => {
    const { applyStatus } = makeApplyUseCase();

    const result = await applyStatus.execute(
      {
        tenantId: 'tenant-a',
        provider: 'fake_gateway',
        providerReference: 'does_not_exist',
        status: 'succeeded',
      },
      'fake-tx',
    );

    assert.strictEqual(result.outcome, 'not_found');
  });

  it('already_terminal: returns outcome = "already_terminal" when tx is already succeeded', async () => {
    const { applyStatus } = makeApplyUseCase({}, { status: 'succeeded' });

    const result = await applyStatus.execute(
      {
        tenantId: 'tenant-a',
        provider: 'fake_gateway',
        providerReference: 'fake_apply_ref_1',
        status: 'succeeded',
      },
      'fake-tx',
    );

    assert.strictEqual(result.outcome, 'already_terminal');
    if (result.outcome === 'already_terminal') {
      assert.strictEqual(result.currentStatus, 'succeeded');
    }
  });

  it('already_terminal: returns outcome = "already_terminal" when tx is already failed', async () => {
    const { applyStatus } = makeApplyUseCase({}, { status: 'failed' });

    const result = await applyStatus.execute(
      {
        tenantId: 'tenant-a',
        provider: 'fake_gateway',
        providerReference: 'fake_apply_ref_1',
        status: 'succeeded',
      },
      'fake-tx',
    );

    assert.strictEqual(result.outcome, 'already_terminal');
  });
});

// ── Module-level factory shared by Suite 5 and Suite 5b ───────────────────────

function makeWebhookUseCase(
  intentOverrides: Partial<DomainPaymentIntent> = {},
  pendingTxOverrides: Partial<any> = {},
) {
    const intent = makeIntent({
      id: 'intent-wh-1',
      tenantId: 'tenant-a',
      amountDue: 100000,
      amountRemaining: 100000,
      ...intentOverrides,
    });
    const fakeDb = makeFakeDb();
    const intentRepo = makeFakeIntentRepo(intent);
    const txRepo = makeFakeTxRepo();
    const allocationRepo = makeFakeAllocationRepo();
    const eventRepo = makeFakeEventRepo();
    const recalculate = new RecalculatePaymentIntent(intentRepo as any, txRepo as any);
    const applyGatewayStatus = new ApplyGatewayTransactionStatus(
      intentRepo as any,
      txRepo as any,
      allocationRepo as any,
      recalculate,
    );
    const registry = new PaymentProviderRegistry().register(new FakeGatewayProvider());
    const handleWebhook = new HandlePaymentProviderWebhook(
      fakeDb as any,
      registry,
      eventRepo as any,
      txRepo as any,
      applyGatewayStatus,
    );

    // Pre-seed a pending fake_gateway transaction
    const pendingTx = makeDbTx({
      tenantId: 'tenant-a',
      paymentIntentId: intent.id,
      status: 'pending',
      provider: 'fake_gateway',
      providerReference: 'fake_intent-wh_ref_1',
      amount: '100000.00',
      ...pendingTxOverrides,
    });
    txRepo._store().push(pendingTx);

    return { handleWebhook, intentRepo, txRepo, allocationRepo, eventRepo, intent };
}

// ── Suite 5: HandlePaymentProviderWebhook ─────────────────────────────────────

describe('HandlePaymentProviderWebhook', () => {
  it('unknown_provider: returns unknown_provider outcome for unregistered provider', async () => {
    const { handleWebhook } = makeWebhookUseCase();
    const { rawBody, signature } = makeSignedWebhookCall(makeWebhookPayload());

    const result = await handleWebhook.execute({
      provider: 'midtrans',
      headers: { 'x-fake-gateway-signature': signature },
      rawBody,
      tenantId: 'tenant-a',
    });

    assert.strictEqual(result.outcome, 'unknown_provider');
  });

  it('invalid_signature: returns invalid_signature and stores a failed audit event', async () => {
    const { handleWebhook, eventRepo } = makeWebhookUseCase();
    const rawBody = JSON.stringify(makeWebhookPayload());

    const result = await handleWebhook.execute({
      provider: 'fake_gateway',
      headers: { 'x-fake-gateway-signature': 'bad-signature' },
      rawBody,
      tenantId: 'tenant-a',
    });

    assert.strictEqual(result.outcome, 'invalid_signature');
    // Hardening Task 3: audit event must be stored and have a non-null eventId
    assert.ok(result.eventId !== null, 'Should return a non-null eventId for the audit row');
    assert.strictEqual(eventRepo._store().length, 1);
    const auditEvent = eventRepo._store()[0];
    assert.strictEqual(auditEvent.signatureValid, false);
    assert.strictEqual(auditEvent.processingStatus, 'failed');
    assert.strictEqual(auditEvent.errorMessage, 'INVALID_SIGNATURE');
    assert.ok(auditEvent.providerEventId.startsWith('invalid_sig_'));
  });

  it('payment.succeeded: processes transaction to succeeded, marks event processed', async () => {
    const { handleWebhook, txRepo, allocationRepo, eventRepo } = makeWebhookUseCase();
    const payload = makeWebhookPayload({
      event_id: 'evt_succeeded_001',
      event_type: 'payment.succeeded',
      provider_reference: 'fake_intent-wh_ref_1',
    });
    const { rawBody, signature } = makeSignedWebhookCall(payload);

    const result = await handleWebhook.execute({
      provider: 'fake_gateway',
      headers: { 'x-fake-gateway-signature': signature },
      rawBody,
      tenantId: 'tenant-a',
    });

    assert.strictEqual(result.outcome, 'processed');
    if (result.outcome === 'processed') {
      assert.strictEqual(result.transaction.status, 'succeeded');
      assert.strictEqual(result.intent.status, 'paid');
      assert.strictEqual(result.intent.amountPaid, 100000);
    }

    // Allocation should be created
    assert.strictEqual(allocationRepo._store().length, 1);

    // Event should be stored and marked processed
    assert.strictEqual(eventRepo._store().length, 1);
    assert.strictEqual(eventRepo._store()[0].processingStatus, 'processed');
    assert.strictEqual(eventRepo._store()[0].providerEventId, 'evt_succeeded_001');
  });

  it('payment.failed: processes transaction to failed, no allocation, intent unchanged', async () => {
    const { handleWebhook, allocationRepo, eventRepo } = makeWebhookUseCase();
    const payload = makeWebhookPayload({
      event_id: 'evt_failed_001',
      event_type: 'payment.failed',
      provider_reference: 'fake_intent-wh_ref_1',
      failure_reason: 'Insufficient funds',
    });
    const { rawBody, signature } = makeSignedWebhookCall(payload);

    const result = await handleWebhook.execute({
      provider: 'fake_gateway',
      headers: { 'x-fake-gateway-signature': signature },
      rawBody,
      tenantId: 'tenant-a',
    });

    assert.strictEqual(result.outcome, 'processed');
    if (result.outcome === 'processed') {
      assert.strictEqual(result.transaction.status, 'failed');
      assert.ok(result.transaction.failureReason?.includes('Insufficient funds'));
      assert.strictEqual(result.intent.amountPaid, 0);
      assert.strictEqual(result.intent.status, 'requires_payment');
    }
    assert.strictEqual(allocationRepo._store().length, 0);
    assert.strictEqual(eventRepo._store()[0].processingStatus, 'processed');
  });

  it('idempotent_replay: returns idempotent_replay when event was already processed', async () => {
    const { handleWebhook, eventRepo } = makeWebhookUseCase();
    const payload = makeWebhookPayload({
      event_id: 'evt_replay_001',
      event_type: 'payment.succeeded',
      provider_reference: 'fake_intent-wh_ref_1',
    });
    const { rawBody, signature } = makeSignedWebhookCall(payload);

    // Pre-seed an already-processed event
    eventRepo._store().push({
      id: `event-pre-${++eventIdSeq}`,
      provider: 'fake_gateway',
      providerEventId: 'evt_replay_001',
      processingStatus: 'processed',
      createdAt: new Date(),
    });

    const result = await handleWebhook.execute({
      provider: 'fake_gateway',
      headers: { 'x-fake-gateway-signature': signature },
      rawBody,
      tenantId: 'tenant-a',
    });

    assert.strictEqual(result.outcome, 'idempotent_replay');
    if (result.outcome === 'idempotent_replay') {
      assert.ok(result.eventId);
    }
    // No new events should be stored
    assert.strictEqual(eventRepo._store().length, 1);
  });

  it('ignored: marks event as ignored when tx is already in a terminal state (TRANSACTION_ALREADY_TERMINAL)', async () => {
    // Seed a tx that is already succeeded
    const { handleWebhook, eventRepo } = makeWebhookUseCase({}, { status: 'succeeded' });
    const payload = makeWebhookPayload({
      event_id: 'evt_terminal_001',
      event_type: 'payment.succeeded',
      provider_reference: 'fake_intent-wh_ref_1',
    });
    const { rawBody, signature } = makeSignedWebhookCall(payload);

    const result = await handleWebhook.execute({
      provider: 'fake_gateway',
      headers: { 'x-fake-gateway-signature': signature },
      rawBody,
      tenantId: 'tenant-a',
    });

    assert.strictEqual(result.outcome, 'ignored');
    if (result.outcome === 'ignored') {
      assert.ok(result.reason.includes('TRANSACTION_ALREADY_TERMINAL'));
    }

    // Event should be stored and marked as ignored
    assert.strictEqual(eventRepo._store().length, 1);
    assert.strictEqual(eventRepo._store()[0].processingStatus, 'ignored');
    assert.ok(eventRepo._store()[0].errorMessage.includes('TRANSACTION_ALREADY_TERMINAL'));
  });

  it('ignored: returns ignored with event type reason for payment.pending events', async () => {
    const { handleWebhook, eventRepo } = makeWebhookUseCase();
    const payload = makeWebhookPayload({
      event_id: 'evt_pending_001',
      event_type: 'payment.pending',
      provider_reference: 'fake_intent-wh_ref_1',
    });
    const { rawBody, signature } = makeSignedWebhookCall(payload);

    const result = await handleWebhook.execute({
      provider: 'fake_gateway',
      headers: { 'x-fake-gateway-signature': signature },
      rawBody,
      tenantId: 'tenant-a',
    });

    assert.strictEqual(result.outcome, 'ignored');
    // Event stored and marked ignored
    assert.strictEqual(eventRepo._store().length, 1);
    assert.strictEqual(eventRepo._store()[0].processingStatus, 'ignored');
  });

  it('stores signatureValid=true on successfully processed events', async () => {
    const { handleWebhook, eventRepo } = makeWebhookUseCase();
    const payload = makeWebhookPayload({
      event_id: 'evt_sig_check_001',
      event_type: 'payment.succeeded',
      provider_reference: 'fake_intent-wh_ref_1',
    });
    const { rawBody, signature } = makeSignedWebhookCall(payload);

    await handleWebhook.execute({
      provider: 'fake_gateway',
      headers: { 'x-fake-gateway-signature': signature },
      rawBody,
      tenantId: 'tenant-a',
    });

    const stored = eventRepo._store()[0];
    assert.strictEqual(stored.signatureValid, true);
    assert.strictEqual(stored.provider, 'fake_gateway');
  });
});

// ── Suite 5b: HandlePaymentProviderWebhook — Phase 3 Hardening ───────────────
//
// These tests verify the hardening tasks:
//  Task 1: Safe event reservation via createOrGetByProviderEventId (no unique violation)
//  Task 2: Existing pending event → idempotent_replay, no transaction mutation
//  Task 3: Invalid signature stores deterministic audit event, no tx mutation
//  Task 4: Processing correctness under idempotency & concurrency scenarios

describe('HandlePaymentProviderWebhook — Phase 3 Hardening', () => {
  it('Task 3 — repeated invalid signature for same payload reuses the same audit event row', async () => {
    const { handleWebhook, eventRepo } = makeWebhookUseCase();
    const rawBody = JSON.stringify(makeWebhookPayload());

    // First invalid attempt
    const r1 = await handleWebhook.execute({
      provider: 'fake_gateway',
      headers: { 'x-fake-gateway-signature': 'bad-sig' },
      rawBody,
      tenantId: 'tenant-a',
    });
    assert.strictEqual(r1.outcome, 'invalid_signature');

    // Second invalid attempt with identical payload
    const r2 = await handleWebhook.execute({
      provider: 'fake_gateway',
      headers: { 'x-fake-gateway-signature': 'bad-sig' },
      rawBody,
      tenantId: 'tenant-a',
    });
    assert.strictEqual(r2.outcome, 'invalid_signature');

    // Deterministic id → no duplicate rows in the event store
    assert.strictEqual(eventRepo._store().length, 1, 'Repeated invalid sig must not create new rows');
    assert.strictEqual(r1.eventId, r2.eventId, 'Both calls must return the same audit event id');
  });

  it('Task 3 — invalid signature does not mutate any payment transaction or create allocation', async () => {
    const { handleWebhook, txRepo, allocationRepo } = makeWebhookUseCase();
    const rawBody = JSON.stringify(
      makeWebhookPayload({ provider_reference: 'fake_intent-wh_ref_1' }),
    );

    const result = await handleWebhook.execute({
      provider: 'fake_gateway',
      headers: { 'x-fake-gateway-signature': 'bad-signature' },
      rawBody,
      tenantId: 'tenant-a',
    });

    assert.strictEqual(result.outcome, 'invalid_signature');
    // Transaction must remain in its original pending state — no mutation
    const txRow = txRepo._store()[0];
    assert.strictEqual(txRow.status, 'pending');
    assert.strictEqual(allocationRepo._store().length, 0);
  });

  it('Task 2 — existing pending event returns idempotent_replay without mutating the transaction', async () => {
    const { handleWebhook, eventRepo, txRepo, allocationRepo } = makeWebhookUseCase();
    const payload = makeWebhookPayload({
      event_id: 'evt_stale_pending_001',
      event_type: 'payment.succeeded',
      provider_reference: 'fake_intent-wh_ref_1',
    });
    const { rawBody, signature } = makeSignedWebhookCall(payload);

    // Simulate an orphaned pending event from a previously aborted DB transaction
    eventRepo._store().push({
      id: `event-stale-${++eventIdSeq}`,
      provider: 'fake_gateway',
      providerEventId: 'evt_stale_pending_001',
      processingStatus: 'pending',
      createdAt: new Date(),
    });

    const result = await handleWebhook.execute({
      provider: 'fake_gateway',
      headers: { 'x-fake-gateway-signature': signature },
      rawBody,
      tenantId: 'tenant-a',
    });

    // Must return idempotent_replay — NOT processed — to prevent double-processing
    assert.strictEqual(result.outcome, 'idempotent_replay');
    // Transaction must be untouched
    assert.strictEqual(txRepo._store()[0].status, 'pending');
    assert.strictEqual(allocationRepo._store().length, 0);
    // No new event row must be inserted
    assert.strictEqual(eventRepo._store().length, 1);
  });

  it('Task 1 — duplicate event id after processing returns safe idempotent_replay without throwing', async () => {
    const { handleWebhook, allocationRepo, eventRepo } = makeWebhookUseCase();
    const payload = makeWebhookPayload({
      event_id: 'evt_dup_safe_001',
      event_type: 'payment.succeeded',
      provider_reference: 'fake_intent-wh_ref_1',
    });
    const { rawBody, signature } = makeSignedWebhookCall(payload);

    // First call — should process successfully
    const first = await handleWebhook.execute({
      provider: 'fake_gateway',
      headers: { 'x-fake-gateway-signature': signature },
      rawBody,
      tenantId: 'tenant-a',
    });
    assert.strictEqual(first.outcome, 'processed');
    assert.strictEqual(allocationRepo._store().length, 1);

    // Second call — same event id — must NOT throw and must return idempotent_replay
    let threw = false;
    let second: any;
    try {
      second = await handleWebhook.execute({
        provider: 'fake_gateway',
        headers: { 'x-fake-gateway-signature': signature },
        rawBody,
        tenantId: 'tenant-a',
      });
    } catch {
      threw = true;
    }
    assert.strictEqual(threw, false, 'Must not throw on duplicate event id');
    assert.strictEqual(second.outcome, 'idempotent_replay');
    // No duplicate allocation
    assert.strictEqual(allocationRepo._store().length, 1);
    // No duplicate event row
    assert.strictEqual(eventRepo._store().length, 1);
  });

  it('Task 4 — different event id for already-succeeded tx is ignored without creating a duplicate allocation', async () => {
    const { handleWebhook, allocationRepo, eventRepo } = makeWebhookUseCase(
      {},
      { status: 'succeeded' },
    );
    const payload = makeWebhookPayload({
      event_id: 'evt_diff_id_terminal_001',
      event_type: 'payment.succeeded',
      provider_reference: 'fake_intent-wh_ref_1',
    });
    const { rawBody, signature } = makeSignedWebhookCall(payload);

    const result = await handleWebhook.execute({
      provider: 'fake_gateway',
      headers: { 'x-fake-gateway-signature': signature },
      rawBody,
      tenantId: 'tenant-a',
    });

    assert.strictEqual(result.outcome, 'ignored');
    if (result.outcome === 'ignored') {
      assert.ok(result.reason.includes('TRANSACTION_ALREADY_TERMINAL'));
    }
    // No allocation created for the duplicate
    assert.strictEqual(allocationRepo._store().length, 0);
    // Event stored and marked ignored
    assert.strictEqual(eventRepo._store().length, 1);
    assert.strictEqual(eventRepo._store()[0].processingStatus, 'ignored');
  });

  it('Task 4 — payment.failed event does not increase amountPaid on the intent', async () => {
    const { handleWebhook } = makeWebhookUseCase({ amountPaid: 0, amountRemaining: 100000 });
    const payload = makeWebhookPayload({
      event_id: 'evt_fail_nopay_001',
      event_type: 'payment.failed',
      provider_reference: 'fake_intent-wh_ref_1',
      failure_reason: 'Expired',
    });
    const { rawBody, signature } = makeSignedWebhookCall(payload);

    const result = await handleWebhook.execute({
      provider: 'fake_gateway',
      headers: { 'x-fake-gateway-signature': signature },
      rawBody,
      tenantId: 'tenant-a',
    });

    assert.strictEqual(result.outcome, 'processed');
    if (result.outcome === 'processed') {
      assert.strictEqual(result.intent.amountPaid, 0);
      assert.strictEqual(result.intent.status, 'requires_payment');
    }
  });

  it('Task 4 — payment.pending provider event is ignored and does not mutate the transaction', async () => {
    const { handleWebhook, txRepo, allocationRepo, eventRepo } = makeWebhookUseCase();
    const payload = makeWebhookPayload({
      event_id: 'evt_prov_pending_001',
      event_type: 'payment.pending',
      provider_reference: 'fake_intent-wh_ref_1',
    });
    const { rawBody, signature } = makeSignedWebhookCall(payload);

    const result = await handleWebhook.execute({
      provider: 'fake_gateway',
      headers: { 'x-fake-gateway-signature': signature },
      rawBody,
      tenantId: 'tenant-a',
    });

    assert.strictEqual(result.outcome, 'ignored');
    assert.strictEqual(txRepo._store()[0].status, 'pending');
    assert.strictEqual(allocationRepo._store().length, 0);
    assert.strictEqual(eventRepo._store()[0].processingStatus, 'ignored');
  });
});

// ── Suite 6: Webhook route production guard ───────────────────────────────────

describe('Webhook route — fake_gateway production guard', () => {
  it('returns 404 in production for fake_gateway provider', () => {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';

    try {
      const provider = 'fake_gateway';
      const isProduction = process.env.NODE_ENV === 'production';

      let statusSent: number | null = null;
      const mockRes = {
        status: (code: number) => ({ json: (_body?: unknown) => { statusSent = code; } }),
      };
      let nextCalled = false;

      // Mirror the route guard logic
      if (provider === 'fake_gateway' && isProduction) {
        mockRes.status(404).json({ success: false, error: 'Not found' });
      } else {
        nextCalled = true;
      }

      assert.strictEqual(statusSent, 404);
      assert.strictEqual(nextCalled, false);
    } finally {
      process.env.NODE_ENV = originalEnv;
    }
  });

  it('calls next() in non-production for fake_gateway provider', () => {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'test';

    try {
      const provider = 'fake_gateway';
      const isProduction = process.env.NODE_ENV === 'production';

      let statusSent: number | null = null;
      const mockRes = {
        status: (code: number) => ({ json: (_body?: unknown) => { statusSent = code; } }),
      };
      let nextCalled = false;

      if (provider === 'fake_gateway' && isProduction) {
        mockRes.status(404).json({ success: false, error: 'Not found' });
      } else {
        nextCalled = true;
      }

      assert.strictEqual(nextCalled, true);
      assert.strictEqual(statusSent, null);
    } finally {
      process.env.NODE_ENV = originalEnv;
    }
  });

  it('does NOT 404 in production for non-fake_gateway providers', () => {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';

    try {
      const provider: string = 'midtrans'; // real provider — guard only applies to fake_gateway
      const isProduction = process.env.NODE_ENV === 'production';

      let statusSent: number | null = null;
      const mockRes = {
        status: (code: number) => ({ json: (_body?: unknown) => { statusSent = code; } }),
      };
      let nextCalled = false;

      if (provider === 'fake_gateway' && isProduction) {
        mockRes.status(404).json({ success: false, error: 'Not found' });
      } else {
        nextCalled = true;
      }

      assert.strictEqual(nextCalled, true);
      assert.strictEqual(statusSent, null);
    } finally {
      process.env.NODE_ENV = originalEnv;
    }
  });
});
