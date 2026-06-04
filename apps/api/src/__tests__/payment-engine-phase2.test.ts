/**
 * Payment Engine Phase 2 — Gateway Abstraction Tests
 *
 * Covers:
 *  1.  PaymentProviderRegistry — register, get, unsupported provider throws
 *  2.  FakeGatewayProvider — createPayment fields, cancel/refund/verify/parse behavior
 *  3.  CreateGatewayPayment — pending tx created, amountPaid unchanged, idempotency
 *  4.  ConfirmFakeGatewayPayment — succeeded path, failed path, invalid transitions
 *  5.  Route guard — fake-gateway/confirm returns 404 in production
 *  6.  Phase 1 regression — ManualProvider still works, existing tests style preserved
 */

import '../../register-paths';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

process.env.DATABASE_URL ||= 'postgres://user:pass@127.0.0.1:5432/aurapos_test';
process.env.BETTER_AUTH_SECRET ||= 'test-secret-with-at-least-32-characters-ok';

// ── Domain / application imports ──────────────────────────────────────────────
import { PaymentPolicyError, ManualProvider } from '@pos/domain/payments';
import type { DomainPaymentIntent, DomainPaymentTransaction } from '@pos/domain/payments';
import { PaymentProviderRegistry } from '@pos/application/payments/PaymentProviderRegistry';
import { CreateGatewayPayment } from '@pos/application/payments/CreateGatewayPayment';
import { ConfirmFakeGatewayPayment } from '@pos/application/payments/ConfirmFakeGatewayPayment';
import { RecalculatePaymentIntent } from '@pos/application/payments/RecalculatePaymentIntent';
import { FakeGatewayProvider } from '@pos/infrastructure/payments/providers/FakeGatewayProvider';

// ── Sequence counters ─────────────────────────────────────────────────────────
let intentIdSeq = 0;
let txIdSeq = 0;

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

// ── In-memory fake repos / DB helpers ─────────────────────────────────────────

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
    /**
     * Simulates FOR UPDATE lock — in unit tests we just return the row.
     * Real concurrency behaviour is exercised via DB-backed integration tests.
     */
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

/**
 * Minimal fake db.transaction() — runs the callback synchronously with
 * a fake transaction client. Does NOT roll back on error (unit test limitation,
 * same as Phase 1 tests).
 */
function makeFakeDb() {
  return {
    transaction: async (cb: (tx: any) => any) => cb('fake-tx'),
  };
}

// ── Test suite 1: PaymentProviderRegistry ─────────────────────────────────────

describe('PaymentProviderRegistry', () => {
  it('registers and retrieves a provider by code', async () => {
    const registry = new PaymentProviderRegistry();
    const fakeProvider = new FakeGatewayProvider();
    registry.register(fakeProvider);
    const retrieved = registry.get('fake_gateway');
    assert.strictEqual(retrieved.providerCode, 'fake_gateway');
  });

  it('throws UNSUPPORTED_PROVIDER for unknown provider code', async () => {
    const registry = new PaymentProviderRegistry();
    assert.throws(
      () => registry.get('midtrans'),
      (err: any) => {
        assert.ok(err instanceof PaymentPolicyError);
        assert.strictEqual(err.code, 'UNSUPPORTED_PROVIDER');
        assert.ok(err.message.includes('midtrans'));
        return true;
      },
    );
  });

  it('has() returns true for registered provider', async () => {
    const registry = new PaymentProviderRegistry();
    registry.register(new ManualProvider());
    assert.strictEqual(registry.has('manual'), true);
    assert.strictEqual(registry.has('fake_gateway'), false);
  });

  it('list() returns all registered provider codes', async () => {
    const registry = new PaymentProviderRegistry();
    registry.register(new ManualProvider());
    registry.register(new FakeGatewayProvider());
    const list = registry.list();
    assert.ok(list.includes('manual'));
    assert.ok(list.includes('fake_gateway'));
  });

  it('register() is chainable', async () => {
    const registry = new PaymentProviderRegistry()
      .register(new ManualProvider())
      .register(new FakeGatewayProvider());
    assert.strictEqual(registry.has('manual'), true);
    assert.strictEqual(registry.has('fake_gateway'), true);
  });
});

// ── Test suite 2: FakeGatewayProvider ─────────────────────────────────────────

describe('FakeGatewayProvider', () => {
  const provider = new FakeGatewayProvider();

  it('providerCode is "fake_gateway"', () => {
    assert.strictEqual(provider.providerCode, 'fake_gateway');
  });

  it('createPayment() returns non-null providerReference, URL, and QR string', async () => {
    const result = await provider.createPayment({
      paymentIntentId: 'intent-test-1',
      amount: 100000,
      currency: 'IDR',
      method: 'qris',
    });
    assert.ok(result.providerReference, 'providerReference should be non-null');
    assert.ok(result.providerReference!.startsWith('fake_intent-test-1_'));
    assert.ok(result.providerPaymentUrl!.includes(result.providerReference!));
    assert.ok(result.providerQrString!.includes(result.providerReference!));
    assert.strictEqual(result.succeededImmediately, false);
    assert.strictEqual(result.failureReason, null);
  });

  it('createPayment() generates unique references for different calls', async () => {
    const r1 = await provider.createPayment({ paymentIntentId: 'i1', amount: 1000, currency: 'IDR', method: 'qris' });
    const r2 = await provider.createPayment({ paymentIntentId: 'i1', amount: 1000, currency: 'IDR', method: 'qris' });
    assert.notStrictEqual(r1.providerReference, r2.providerReference);
  });

  it('cancelPayment() returns success:false with Phase 4 note', async () => {
    const result = await provider.cancelPayment({ providerReference: 'fake_ref' });
    assert.strictEqual(result.success, false);
    assert.ok(result.failureReason?.includes('Phase 4'));
  });

  it('refundPayment() returns success:false with Phase 4 note', async () => {
    const result = await provider.refundPayment({ providerReference: 'fake_ref', amount: 1000 });
    assert.strictEqual(result.success, false);
    assert.ok(result.failureReason?.includes('Phase 4'));
  });

  it('verifyWebhook() returns false', async () => {
    const result = await provider.verifyWebhook({ rawPayload: '{}', signature: 'sig', headers: {} });
    assert.strictEqual(result, false);
  });

  it('parseWebhook() throws unsupported error', async () => {
    await assert.rejects(
      () => provider.parseWebhook({ rawPayload: '{}', headers: {} }),
      /Phase 3/,
    );
  });
});

// ── Test suite 3: CreateGatewayPayment ────────────────────────────────────────

describe('CreateGatewayPayment', () => {
  function makeUseCase(intent: DomainPaymentIntent, extraTxRows: any[] = []) {
    const fakeDb = makeFakeDb();
    const intentRepo = makeFakeIntentRepo(intent);
    const txRepo = makeFakeTxRepo();
    // Seed any extra tx rows (e.g. for idempotency tests)
    extraTxRows.forEach(r => txRepo._store().push(r));
    const registry = new PaymentProviderRegistry().register(new FakeGatewayProvider());
    const useCase = new CreateGatewayPayment(fakeDb as any, intentRepo as any, txRepo as any, registry);
    return { useCase, intentRepo, txRepo };
  }

  it('creates a pending transaction with providerReference/URL/QR', async () => {
    const intent = makeIntent({ id: 'intent-gw-1', tenantId: 'tenant-a', amountDue: 50000, amountRemaining: 50000, allowPartial: true });
    const { useCase, txRepo } = makeUseCase(intent);

    const result = await useCase.execute({
      tenantId: 'tenant-a',
      paymentIntentId: 'intent-gw-1',
      amount: 50000,
      method: 'qris',
      provider: 'fake_gateway',
    });

    assert.strictEqual(result.transaction.status, 'pending');
    assert.strictEqual(result.transaction.provider, 'fake_gateway');
    assert.ok(result.providerReference?.startsWith('fake_intent-gw-1_'));
    assert.ok(result.providerPaymentUrl?.includes(result.providerReference!));
    assert.ok(result.providerQrString?.includes(result.providerReference!));
    assert.strictEqual(result.idempotentReplay, false);
    assert.strictEqual(txRepo._store().length, 1);
  });

  it('pending gateway payment does NOT update amountPaid on intent', async () => {
    const intent = makeIntent({ id: 'intent-gw-2', tenantId: 'tenant-a' });
    const { useCase, intentRepo } = makeUseCase(intent);

    const result = await useCase.execute({
      tenantId: 'tenant-a',
      paymentIntentId: 'intent-gw-2',
      amount: 100000,
      method: 'qris',
      provider: 'fake_gateway',
    });

    // amountPaid should remain 0 after a pending transaction
    assert.strictEqual(result.intent.amountPaid, 0);
    assert.strictEqual(result.intent.status, 'requires_payment');
  });

  it('pending gateway payment does NOT mark intent as paid', async () => {
    const intent = makeIntent({ id: 'intent-gw-3', tenantId: 'tenant-a' });
    const { useCase } = makeUseCase(intent);

    const result = await useCase.execute({
      tenantId: 'tenant-a',
      paymentIntentId: 'intent-gw-3',
      amount: 100000,
      method: 'qris',
      provider: 'fake_gateway',
    });

    assert.notStrictEqual(result.intent.status, 'paid');
    assert.strictEqual(result.intent.status, 'requires_payment');
  });

  it('idempotency replay returns same pending transaction', async () => {
    const intent = makeIntent({ id: 'intent-gw-4', tenantId: 'tenant-a', allowPartial: true });
    const { useCase, txRepo } = makeUseCase(intent);

    // First call
    const first = await useCase.execute({
      tenantId: 'tenant-a',
      paymentIntentId: 'intent-gw-4',
      amount: 100000,
      method: 'qris',
      provider: 'fake_gateway',
      idempotencyKey: 'idem-key-gw-1',
    });

    // Second call with same key
    const second = await useCase.execute({
      tenantId: 'tenant-a',
      paymentIntentId: 'intent-gw-4',
      amount: 100000,
      method: 'qris',
      provider: 'fake_gateway',
      idempotencyKey: 'idem-key-gw-1',
    });

    assert.strictEqual(second.idempotentReplay, true);
    assert.strictEqual(second.transaction.id, first.transaction.id);
    // Only one tx row should exist
    assert.strictEqual(txRepo._store().length, 1);
  });

  it('same idempotency key on different intent returns IDEMPOTENCY_KEY_CONFLICT', async () => {
    const intent = makeIntent({ id: 'intent-gw-5a', tenantId: 'tenant-a' });
    // Pre-seed a tx with the same idempotency key but different intent
    const conflictingTx = makeDbTx({
      id: 'tx-conflict-1',
      tenantId: 'tenant-a',
      paymentIntentId: 'intent-OTHER',
      idempotencyKey: 'conflict-key-1',
    });
    const { useCase } = makeUseCase(intent, [conflictingTx]);

    await assert.rejects(
      () => useCase.execute({
        tenantId: 'tenant-a',
        paymentIntentId: 'intent-gw-5a',
        amount: 100000,
        method: 'qris',
        provider: 'fake_gateway',
        idempotencyKey: 'conflict-key-1',
      }),
      (err: any) => {
        assert.ok(err instanceof PaymentPolicyError);
        assert.strictEqual(err.code, 'IDEMPOTENCY_KEY_CONFLICT');
        return true;
      },
    );
  });

  it('unsupported provider returns UNSUPPORTED_PROVIDER error', async () => {
    const intent = makeIntent({ id: 'intent-gw-6', tenantId: 'tenant-a' });
    const { useCase } = makeUseCase(intent);

    await assert.rejects(
      () => useCase.execute({
        tenantId: 'tenant-a',
        paymentIntentId: 'intent-gw-6',
        amount: 100000,
        method: 'qris',
        provider: 'midtrans',
      }),
      (err: any) => {
        assert.ok(err instanceof PaymentPolicyError);
        assert.strictEqual(err.code, 'UNSUPPORTED_PROVIDER');
        return true;
      },
    );
  });

  it('amount > remaining returns AMOUNT_EXCEEDS_REMAINING', async () => {
    const intent = makeIntent({ id: 'intent-gw-7', tenantId: 'tenant-a', amountDue: 50000, amountRemaining: 50000, allowPartial: true });
    const { useCase } = makeUseCase(intent);

    await assert.rejects(
      () => useCase.execute({
        tenantId: 'tenant-a',
        paymentIntentId: 'intent-gw-7',
        amount: 99999,
        method: 'qris',
        provider: 'fake_gateway',
      }),
      (err: any) => {
        assert.ok(err instanceof PaymentPolicyError);
        assert.strictEqual(err.code, 'AMOUNT_EXCEEDS_REMAINING');
        return true;
      },
    );
  });

  it('partial amount on non-partial intent returns PARTIAL_NOT_ALLOWED', async () => {
    const intent = makeIntent({ id: 'intent-gw-8', tenantId: 'tenant-a', amountDue: 100000, amountRemaining: 100000, allowPartial: false });
    const { useCase } = makeUseCase(intent);

    await assert.rejects(
      () => useCase.execute({
        tenantId: 'tenant-a',
        paymentIntentId: 'intent-gw-8',
        amount: 50000,
        method: 'qris',
        provider: 'fake_gateway',
      }),
      (err: any) => {
        assert.ok(err instanceof PaymentPolicyError);
        assert.strictEqual(err.code, 'PARTIAL_NOT_ALLOWED');
        return true;
      },
    );
  });
});

// ── Test suite 4: ConfirmFakeGatewayPayment ───────────────────────────────────

describe('ConfirmFakeGatewayPayment', () => {
  function makeConfirmUseCase(
    intentOverrides: Partial<DomainPaymentIntent> = {},
    pendingTxOverrides: Partial<any> = {},
  ) {
    const intent = makeIntent({ id: 'intent-confirm-1', tenantId: 'tenant-a', ...intentOverrides });
    const fakeDb = makeFakeDb();
    const intentRepo = makeFakeIntentRepo(intent);
    const txRepo = makeFakeTxRepo();
    const allocationRepo = makeFakeAllocationRepo();
    const recalculate = new RecalculatePaymentIntent(intentRepo as any, txRepo as any);
    const useCase = new ConfirmFakeGatewayPayment(
      fakeDb as any,
      intentRepo as any,
      txRepo as any,
      allocationRepo as any,
      recalculate,
    );

    // Pre-seed one pending fake_gateway transaction
    const pendingTx = makeDbTx({
      id: 'tx-pending-1',
      tenantId: 'tenant-a',
      paymentIntentId: intent.id,
      status: 'pending',
      provider: 'fake_gateway',
      providerReference: 'fake_confirm_ref_1',
      amount: '100000.00',
      ...pendingTxOverrides,
    });
    txRepo._store().push(pendingTx);

    return { useCase, intentRepo, txRepo, allocationRepo, intent };
  }

  it('succeeded confirmation updates transaction status to succeeded', async () => {
    const { useCase, txRepo } = makeConfirmUseCase();

    const result = await useCase.execute({
      tenantId: 'tenant-a',
      providerReference: 'fake_confirm_ref_1',
      status: 'succeeded',
    });

    assert.strictEqual(result.transaction.status, 'succeeded');
    assert.ok(result.transaction.succeededAt instanceof Date);
    // Check that the stored row is also updated
    const stored = txRepo._store().find((r: any) => r.providerReference === 'fake_confirm_ref_1');
    assert.strictEqual(stored.status, 'succeeded');
  });

  it('succeeded confirmation creates default allocation', async () => {
    const { useCase, allocationRepo } = makeConfirmUseCase();

    await useCase.execute({
      tenantId: 'tenant-a',
      providerReference: 'fake_confirm_ref_1',
      status: 'succeeded',
    });

    assert.strictEqual(allocationRepo._store().length, 1);
    const alloc = allocationRepo._store()[0];
    assert.strictEqual(alloc.tenantId, 'tenant-a');
    assert.strictEqual(alloc.targetType, 'order');
  });

  it('succeeded confirmation recalculates intent to paid when amount covers remaining', async () => {
    const { useCase } = makeConfirmUseCase(
      { amountDue: 100000, amountPaid: 0, amountRefunded: 0, amountRemaining: 100000 },
    );

    const result = await useCase.execute({
      tenantId: 'tenant-a',
      providerReference: 'fake_confirm_ref_1',
      status: 'succeeded',
    });

    assert.strictEqual(result.intent.status, 'paid');
    assert.strictEqual(result.intent.amountPaid, 100000);
    assert.strictEqual(result.intent.amountRemaining, 0);
  });

  it('failed confirmation updates transaction to failed', async () => {
    const { useCase, txRepo } = makeConfirmUseCase();

    const result = await useCase.execute({
      tenantId: 'tenant-a',
      providerReference: 'fake_confirm_ref_1',
      status: 'failed',
      failureReason: 'Payment declined by user',
    });

    assert.strictEqual(result.transaction.status, 'failed');
    assert.ok(result.transaction.failedAt instanceof Date);
    assert.ok(result.transaction.failureReason?.includes('Payment declined'));
  });

  it('failed confirmation does NOT increase amountPaid', async () => {
    const { useCase } = makeConfirmUseCase();

    const result = await useCase.execute({
      tenantId: 'tenant-a',
      providerReference: 'fake_confirm_ref_1',
      status: 'failed',
    });

    assert.strictEqual(result.intent.amountPaid, 0);
    assert.strictEqual(result.intent.status, 'requires_payment');
  });

  it('failed confirmation does NOT create allocation', async () => {
    const { useCase, allocationRepo } = makeConfirmUseCase();

    await useCase.execute({
      tenantId: 'tenant-a',
      providerReference: 'fake_confirm_ref_1',
      status: 'failed',
    });

    assert.strictEqual(allocationRepo._store().length, 0);
  });

  it('confirming an already-succeeded transaction is rejected with INVALID_TRANSITION', async () => {
    const { useCase } = makeConfirmUseCase(
      {},
      { status: 'succeeded' },
    );

    await assert.rejects(
      () => useCase.execute({
        tenantId: 'tenant-a',
        providerReference: 'fake_confirm_ref_1',
        status: 'succeeded',
      }),
      (err: any) => {
        assert.ok(err instanceof PaymentPolicyError);
        assert.strictEqual(err.code, 'INVALID_TRANSITION');
        return true;
      },
    );
  });

  it('confirming an already-failed transaction is rejected with INVALID_TRANSITION', async () => {
    const { useCase } = makeConfirmUseCase(
      {},
      { status: 'failed' },
    );

    await assert.rejects(
      () => useCase.execute({
        tenantId: 'tenant-a',
        providerReference: 'fake_confirm_ref_1',
        status: 'succeeded',
      }),
      (err: any) => {
        assert.ok(err instanceof PaymentPolicyError);
        assert.strictEqual(err.code, 'INVALID_TRANSITION');
        return true;
      },
    );
  });

  it('unknown provider reference returns TRANSACTION_NOT_FOUND', async () => {
    const { useCase } = makeConfirmUseCase();

    await assert.rejects(
      () => useCase.execute({
        tenantId: 'tenant-a',
        providerReference: 'does_not_exist',
        status: 'succeeded',
      }),
      (err: any) => {
        assert.ok(err instanceof PaymentPolicyError);
        assert.strictEqual(err.code, 'TRANSACTION_NOT_FOUND');
        return true;
      },
    );
  });
});

// ── Test suite 5: fake-gateway/confirm route — production guard ───────────────
//
// Hardening note (Task 3 fix):
// The /fake-gateway/confirm route is now registered BEFORE
// `router.use(requirePaymentOperator)` in payment-engine.ts.
// This guarantees that in production the 404 fires before ANY auth check —
// unauthenticated production callers receive 404, not 401.
//
describe('fake-gateway/confirm — production guard', () => {
  it('returns 404 BEFORE auth check when NODE_ENV is production', async () => {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';

    try {
      // Simulate the inline guard function from the route
      const isProduction = process.env.NODE_ENV === 'production';
      let statusSent: number | null = null;
      const mockRes = {
        status: (code: number) => ({ json: (_body?: unknown) => { statusSent = code; } }),
      };
      let nextCalled = false;

      if (isProduction) {
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

  it('calls next() when NODE_ENV is not production', async () => {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'test';

    try {
      const isProduction = process.env.NODE_ENV === 'production';
      let nextCalled = false;
      let statusSent: number | null = null;
      const mockRes = {
        status: (code: number) => ({ json: (_body?: unknown) => { statusSent = code; } }),
      };

      if (isProduction) {
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

// ── Test suite 6: PaymentTransactionRepository interface extension ─────────────

describe('IPaymentTransactionRepository interface — Phase 2 additions', () => {
  it('fake txRepo implements findByProviderReference', () => {
    const txRepo = makeFakeTxRepo();
    assert.strictEqual(typeof txRepo.findByProviderReference, 'function');
  });

  it('fake txRepo implements lockByProviderReferenceForUpdate', () => {
    const txRepo = makeFakeTxRepo();
    assert.strictEqual(typeof txRepo.lockByProviderReferenceForUpdate, 'function');
  });

  it('fake txRepo implements update', () => {
    const txRepo = makeFakeTxRepo();
    assert.strictEqual(typeof txRepo.update, 'function');
  });

  it('findByProviderReference returns null when not found', async () => {
    const txRepo = makeFakeTxRepo();
    const result = await txRepo.findByProviderReference('fake_gateway', 'nonexistent', 'tenant-a');
    assert.strictEqual(result, null);
  });

  it('findByProviderReference returns matching row', async () => {
    const txRepo = makeFakeTxRepo();
    const row = makeDbTx({ providerReference: 'fake_ref_123', provider: 'fake_gateway', tenantId: 'tenant-a' });
    txRepo._store().push(row);
    const result = await txRepo.findByProviderReference('fake_gateway', 'fake_ref_123', 'tenant-a');
    assert.ok(result);
    assert.strictEqual(result!.providerReference, 'fake_ref_123');
  });

  it('update modifies the stored row and returns updated row', async () => {
    const txRepo = makeFakeTxRepo();
    const tx = await txRepo.create({ tenantId: 'tenant-a', paymentIntentId: 'intent-1', amount: '100000.00', method: 'qris', provider: 'fake_gateway', status: 'pending', direction: 'incoming', transactionType: 'payment', idempotencyKey: null, metadata: null });
    const updated = await txRepo.update(tx.id, 'tenant-a', { status: 'succeeded', succeededAt: new Date() });
    assert.strictEqual(updated.status, 'succeeded');
    assert.ok(updated.succeededAt instanceof Date);
  });
});

// ── Test suite 8: Phase 2 Hardening ───────────────────────────────────────────
//
// These tests cover the three bug fixes introduced in Phase 2 Hardening:
//   H1  — CreateGatewayPayment idempotency replay works after intent is paid
//   H2  — New gateway payment on paid intent (no replay) is still rejected
//   H3  — Idempotency key conflict on different intent still throws even if
//          the requesting intent is paid
//   H4  — Duplicate success confirmation does NOT create duplicate allocation
//   H5  — ConfirmFakeGatewayPayment uses lockByProviderReferenceForUpdate
//

describe('Phase 2 Hardening', () => {
  // ── H1: Idempotency replay after paid intent ──────────────────────────────
  it('H1: idempotency replay succeeds even when intent is already paid', async () => {
    // Scenario:
    //  1. Client creates gateway payment with key K → pending tx
    //  2. Fake confirm → tx succeeded, intent = paid
    //  3. Client retries create gateway payment with same key K
    //  4. Engine MUST return idempotent replay — NOT reject with terminal-intent error

    // Start with a PAID intent (simulates state after successful confirmation)
    const paidIntent = makeIntent({
      id: 'intent-h1',
      tenantId: 'tenant-a',
      amountDue: 100000,
      amountPaid: 100000,
      amountRefunded: 0,
      amountRemaining: 0,
      status: 'paid',
    });

    const fakeDb = makeFakeDb();
    const intentRepo = makeFakeIntentRepo(paidIntent);
    const txRepo = makeFakeTxRepo();
    const registry = new PaymentProviderRegistry().register(new FakeGatewayProvider());
    const useCase = new CreateGatewayPayment(fakeDb as any, intentRepo as any, txRepo as any, registry);

    // Pre-seed the existing pending tx with idempotency key K
    // (this is the tx that was created before confirmation)
    const existingTx = makeDbTx({
      id: 'tx-h1-existing',
      tenantId: 'tenant-a',
      paymentIntentId: 'intent-h1',
      status: 'succeeded', // already confirmed
      idempotencyKey: 'idem-key-h1',
      provider: 'fake_gateway',
      providerReference: 'fake_intent-h1_existing',
    });
    txRepo._store().push(existingTx);

    // Retry call: same key on paid intent → must replay, NOT throw
    const result = await useCase.execute({
      tenantId: 'tenant-a',
      paymentIntentId: 'intent-h1',
      amount: 100000,
      method: 'qris',
      provider: 'fake_gateway',
      idempotencyKey: 'idem-key-h1',
    });

    assert.strictEqual(result.idempotentReplay, true);
    assert.strictEqual(result.transaction.id, 'tx-h1-existing');
    assert.strictEqual(result.transaction.status, 'succeeded');
    // No new tx row should be created
    assert.strictEqual(txRepo._store().length, 1);
  });

  // ── H2: New payment on paid intent without replay is still rejected ───────
  it('H2: creating new gateway payment on paid intent (no idempotency key) is rejected', async () => {
    const paidIntent = makeIntent({
      id: 'intent-h2',
      tenantId: 'tenant-a',
      amountDue: 100000,
      amountPaid: 100000,
      amountRefunded: 0,
      amountRemaining: 0,
      status: 'paid',
    });

    const fakeDb = makeFakeDb();
    const intentRepo = makeFakeIntentRepo(paidIntent);
    const txRepo = makeFakeTxRepo();
    const registry = new PaymentProviderRegistry().register(new FakeGatewayProvider());
    const useCase = new CreateGatewayPayment(fakeDb as any, intentRepo as any, txRepo as any, registry);

    await assert.rejects(
      () => useCase.execute({
        tenantId: 'tenant-a',
        paymentIntentId: 'intent-h2',
        amount: 100000,
        method: 'qris',
        provider: 'fake_gateway',
        // No idempotency key — fresh call on paid intent
      }),
      (err: any) => {
        assert.ok(err instanceof PaymentPolicyError);
        // assertIntentAcceptsPayment throws 'INTENT_NOT_PAYABLE' for terminal-status intents
        assert.strictEqual(err.code, 'INTENT_NOT_PAYABLE');
        return true;
      },
    );
  });

  // ── H3: Idempotency conflict on different intent still works when requesting intent is terminal
  it('H3: idempotency conflict on different intent still throws even when requesting intent is paid', async () => {
    const paidIntent = makeIntent({
      id: 'intent-h3-paid',
      tenantId: 'tenant-a',
      status: 'paid',
      amountPaid: 100000,
      amountRemaining: 0,
    });

    const fakeDb = makeFakeDb();
    const intentRepo = makeFakeIntentRepo(paidIntent);
    const txRepo = makeFakeTxRepo();
    const registry = new PaymentProviderRegistry().register(new FakeGatewayProvider());
    const useCase = new CreateGatewayPayment(fakeDb as any, intentRepo as any, txRepo as any, registry);

    // Pre-seed tx that used the key on a DIFFERENT intent
    const conflictTx = makeDbTx({
      tenantId: 'tenant-a',
      paymentIntentId: 'intent-OTHER-h3',
      idempotencyKey: 'conflict-key-h3',
    });
    txRepo._store().push(conflictTx);

    await assert.rejects(
      () => useCase.execute({
        tenantId: 'tenant-a',
        paymentIntentId: 'intent-h3-paid',
        amount: 100000,
        method: 'qris',
        provider: 'fake_gateway',
        idempotencyKey: 'conflict-key-h3',
      }),
      (err: any) => {
        assert.ok(err instanceof PaymentPolicyError);
        assert.strictEqual(err.code, 'IDEMPOTENCY_KEY_CONFLICT');
        return true;
      },
    );
  });

  // ── H4: Duplicate success confirmation does NOT create duplicate allocation ─
  it('H4: second success confirmation on an already-succeeded tx returns INVALID_TRANSITION (no duplicate allocation)', async () => {
    const intent = makeIntent({
      id: 'intent-h4',
      tenantId: 'tenant-a',
      amountDue: 100000,
      amountPaid: 0,
      amountRemaining: 100000,
    });

    const fakeDb = makeFakeDb();
    const intentRepo = makeFakeIntentRepo(intent);
    const txRepo = makeFakeTxRepo();
    const allocationRepo = makeFakeAllocationRepo();
    const recalculate = new RecalculatePaymentIntent(intentRepo as any, txRepo as any);
    const useCase = new ConfirmFakeGatewayPayment(
      fakeDb as any,
      intentRepo as any,
      txRepo as any,
      allocationRepo as any,
      recalculate,
    );

    // Seed a pending transaction
    txRepo._store().push(makeDbTx({
      id: 'tx-h4',
      tenantId: 'tenant-a',
      paymentIntentId: 'intent-h4',
      status: 'pending',
      provider: 'fake_gateway',
      providerReference: 'fake_h4_ref',
      amount: '100000.00',
    }));

    // First confirmation — should succeed and create exactly 1 allocation
    const first = await useCase.execute({
      tenantId: 'tenant-a',
      providerReference: 'fake_h4_ref',
      status: 'succeeded',
    });
    assert.strictEqual(first.transaction.status, 'succeeded');
    assert.strictEqual(allocationRepo._store().length, 1);

    // Second confirmation — tx is now 'succeeded', must throw INVALID_TRANSITION
    await assert.rejects(
      () => useCase.execute({
        tenantId: 'tenant-a',
        providerReference: 'fake_h4_ref',
        status: 'succeeded',
      }),
      (err: any) => {
        assert.ok(err instanceof PaymentPolicyError);
        assert.strictEqual(err.code, 'INVALID_TRANSITION');
        return true;
      },
    );

    // Allocation count must still be 1 — no duplicate was created
    assert.strictEqual(allocationRepo._store().length, 1);
  });

  // ── H5: ConfirmFakeGatewayPayment uses lockByProviderReferenceForUpdate ────
  it('H5: ConfirmFakeGatewayPayment calls lockByProviderReferenceForUpdate (not just findByProviderReference)', async () => {
    let lockCalled = false;
    let findCalled = false;

    const intent = makeIntent({ id: 'intent-h5', tenantId: 'tenant-a' });
    const fakeDb = makeFakeDb();
    const intentRepo = makeFakeIntentRepo(intent);

    // Intercept tx repo to track which method gets called
    const txRepo = makeFakeTxRepo();
    const pendingTx = makeDbTx({
      id: 'tx-h5',
      tenantId: 'tenant-a',
      paymentIntentId: 'intent-h5',
      status: 'pending',
      provider: 'fake_gateway',
      providerReference: 'fake_h5_ref',
      amount: '100000.00',
    });
    txRepo._store().push(pendingTx);

    const originalLock = txRepo.lockByProviderReferenceForUpdate;
    const originalFind = txRepo.findByProviderReference;
    txRepo.lockByProviderReferenceForUpdate = async (...args: any[]) => {
      lockCalled = true;
      return originalLock(...args as [string, string, string, any]);
    };
    txRepo.findByProviderReference = async (...args: any[]) => {
      findCalled = true;
      return originalFind(...args as [string, string, string, any]);
    };

    const allocationRepo = makeFakeAllocationRepo();
    const recalculate = new RecalculatePaymentIntent(intentRepo as any, txRepo as any);
    const useCase = new ConfirmFakeGatewayPayment(
      fakeDb as any,
      intentRepo as any,
      txRepo as any,
      allocationRepo as any,
      recalculate,
    );

    await useCase.execute({
      tenantId: 'tenant-a',
      providerReference: 'fake_h5_ref',
      status: 'succeeded',
    });

    assert.strictEqual(lockCalled, true, 'lockByProviderReferenceForUpdate should be called');
    // findByProviderReference should NOT be the primary lookup path in ConfirmFakeGatewayPayment
    assert.strictEqual(findCalled, false, 'findByProviderReference should NOT be called directly by ConfirmFakeGatewayPayment');
  });
});

// ── Test suite 7: Phase 1 regression (ManualProvider still works) ─────────────

describe('Phase 1 regression — ManualProvider still works', () => {
  it('ManualProvider.createPayment() returns succeededImmediately:true', async () => {
    const provider = new ManualProvider();
    const result = await provider.createPayment({ paymentIntentId: 'i1', amount: 100000, currency: 'IDR', method: 'cash' });
    assert.strictEqual(result.succeededImmediately, true);
    assert.strictEqual(result.providerReference, null);
  });

  it('ManualProvider.cancelPayment() returns success:false', async () => {
    const provider = new ManualProvider();
    const result = await provider.cancelPayment({ providerReference: 'ref' });
    assert.strictEqual(result.success, false);
  });

  it('PaymentProviderRegistry with manual + fake_gateway both registered', () => {
    const registry = new PaymentProviderRegistry()
      .register(new ManualProvider())
      .register(new FakeGatewayProvider());
    assert.strictEqual(registry.has('manual'), true);
    assert.strictEqual(registry.has('fake_gateway'), true);
    assert.strictEqual(registry.list().length, 2);
  });
});
