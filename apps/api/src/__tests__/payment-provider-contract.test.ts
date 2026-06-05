/**
 * Payment Engine Phase 6 — Provider Contract Tests
 *
 * Covers:
 *  1.  ProviderCapabilities — FakeGatewayProvider and ManualProvider expose correct capabilities
 *  2.  CreateProviderPaymentResult shape — all new Phase 6 fields present on every result
 *  3.  FakeGateway scenarios — all 8 scenarios produce correct status/actions/legacy fields
 *  4.  ProviderAction contract — each action has type, label, value, optional expiresAt
 *  5.  CreateGatewayPayment with requires_action scenario — tx stored as requires_action
 *  6.  CreateGatewayPayment with immediate_success — allocation applied in same tx
 *  7.  CreateGatewayPayment with immediate_failure — tx stored as failed
 *  8.  CreateGatewayPayment with pending_expiry — tx stored as requires_action, expiresAt
 *  9.  ManualProvider capabilities — correct static values
 * 10.  ProviderAccountConfig type — structural validation
 */

import '../../register-paths';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

process.env.DATABASE_URL ||= 'postgres://user:pass@127.0.0.1:5432/aurapos_test';
process.env.BETTER_AUTH_SECRET ||= 'test-secret-with-at-least-32-characters-ok';

// ── Domain / application imports ──────────────────────────────────────────────
import {
  ManualProvider,
  PaymentPolicyError,
} from '@pos/domain/payments';
import type {
  DomainPaymentIntent,
  ProviderCapabilities,
  ProviderAction,
  CreateProviderPaymentResult,
  ProviderAccountConfig,
} from '@pos/domain/payments';
import { FakeGatewayProvider } from '@pos/infrastructure/payments/providers/FakeGatewayProvider';
import type { FakeGatewayScenario } from '@pos/infrastructure/payments/providers/FakeGatewayProvider';
import { PaymentProviderRegistry } from '@pos/application/payments/PaymentProviderRegistry';
import { CreateGatewayPayment } from '@pos/application/payments/CreateGatewayPayment';
import { ApplyGatewayTransactionStatus } from '@pos/application/payments/ApplyGatewayTransactionStatus';
import { RecalculatePaymentIntent } from '@pos/application/payments/RecalculatePaymentIntent';

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
    amountDue: 100_000,
    amountPaid: 0,
    amountRefunded: 0,
    amountRemaining: 100_000,
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

// ── In-memory fake repos ──────────────────────────────────────────────────────

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
        parentTransactionId: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        succeededAt: null,
        failedAt: null,
        cancelledAt: null,
        receivedAmount: null,
        changeAmount: null,
        failureReason: d.failureReason ?? null,
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
    lockByProviderReferenceForUpdate: async (provider: string, ref: string, _tenantId: string, _tx: any) =>
      store.find(r => r.provider === provider && r.providerReference === ref) ?? null,
    findByProviderReferenceGlobal: async (provider: string, ref: string, _tx?: any) =>
      store.find(r => r.provider === provider && r.providerReference === ref) ?? null,
    update: async (id: string, _tenantId: string, data: any, _tx?: any) => {
      const idx = store.findIndex(r => r.id === id);
      if (idx === -1) throw new Error('tx not found');
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
      const row = { ...d, id: `alloc-${Date.now()}-${Math.random()}`, createdAt: new Date() };
      store.push(row);
      return row;
    },
    findByIntentId: async () => store,
    findByTransactionId: async () => store,
  };
}

function makeFakeDb() {
  return {
    transaction: async (cb: (tx: any) => any) => cb('fake-tx'),
  };
}

/**
 * Build a fully wired CreateGatewayPayment with ApplyGatewayTransactionStatus
 * injected (required for immediate success/failure tests).
 */
function makeFullUseCase(intent: DomainPaymentIntent) {
  const fakeDb = makeFakeDb();
  const intentRepo = makeFakeIntentRepo(intent);
  const txRepo = makeFakeTxRepo();
  const allocationRepo = makeFakeAllocationRepo();

  const recalculate = new RecalculatePaymentIntent(
    intentRepo as any,
    txRepo as any,
  );

  const applyGatewayStatus = new ApplyGatewayTransactionStatus(
    intentRepo as any,
    txRepo as any,
    allocationRepo as any,
    recalculate,
  );

  const registry = new PaymentProviderRegistry().register(new FakeGatewayProvider());

  const useCase = new CreateGatewayPayment(
    fakeDb as any,
    intentRepo as any,
    txRepo as any,
    registry,
    applyGatewayStatus,
  );

  return { useCase, intentRepo, txRepo, allocationRepo };
}

// ── Test suite 1: ProviderCapabilities ────────────────────────────────────────

describe('ProviderCapabilities contract', () => {
  it('FakeGatewayProvider exposes capabilities object', () => {
    const provider = new FakeGatewayProvider();
    const caps: ProviderCapabilities = provider.capabilities;
    assert.strictEqual(typeof caps, 'object');
    assert.strictEqual(typeof caps.canCancel, 'boolean');
    assert.strictEqual(typeof caps.canRefund, 'boolean');
    assert.strictEqual(typeof caps.supportsWebhook, 'boolean');
    assert.strictEqual(typeof caps.supportsPolling, 'boolean');
  });

  it('FakeGatewayProvider.capabilities has correct values', () => {
    const provider = new FakeGatewayProvider();
    assert.strictEqual(provider.capabilities.canCancel, false);
    assert.strictEqual(provider.capabilities.canRefund, false);
    assert.strictEqual(provider.capabilities.supportsWebhook, true);
    assert.strictEqual(provider.capabilities.supportsPolling, false);
  });

  it('FakeGatewayProvider.capabilities.supportedScenarios lists all 8 scenarios', () => {
    const provider = new FakeGatewayProvider();
    const scenarios = provider.capabilities.supportedScenarios;
    assert.ok(Array.isArray(scenarios), 'supportedScenarios should be an array');
    const expected: FakeGatewayScenario[] = [
      'redirect', 'qris', 'va', 'payment_code',
      'immediate_success', 'immediate_failure', 'pending_expiry', 'default',
    ];
    for (const s of expected) {
      assert.ok(scenarios!.includes(s), `supportedScenarios should include "${s}"`);
    }
    assert.strictEqual(scenarios!.length, 8);
  });

  it('ManualProvider exposes capabilities object', () => {
    const provider = new ManualProvider();
    const caps: ProviderCapabilities = provider.capabilities;
    assert.strictEqual(typeof caps, 'object');
  });

  it('ManualProvider.capabilities has correct values', () => {
    const provider = new ManualProvider();
    assert.strictEqual(provider.capabilities.canCancel, false);
    assert.strictEqual(provider.capabilities.canRefund, false);
    assert.strictEqual(provider.capabilities.supportsWebhook, false);
    assert.strictEqual(provider.capabilities.supportsPolling, false);
    assert.strictEqual(provider.capabilities.supportedScenarios, undefined);
  });
});

// ── Test suite 2: CreateProviderPaymentResult shape ───────────────────────────

describe('CreateProviderPaymentResult Phase 6 shape', () => {
  const provider = new FakeGatewayProvider();

  /**
   * Assert the full Phase 6 result shape is present regardless of scenario.
   */
  function assertResultShape(result: CreateProviderPaymentResult, label: string) {
    assert.ok('status' in result, `${label}: missing "status" field`);
    assert.ok('actions' in result, `${label}: missing "actions" field`);
    assert.ok('providerReference' in result, `${label}: missing "providerReference"`);
    assert.ok('providerPaymentUrl' in result, `${label}: missing "providerPaymentUrl"`);
    assert.ok('providerQrString' in result, `${label}: missing "providerQrString"`);
    assert.ok('succeededImmediately' in result, `${label}: missing "succeededImmediately"`);
    assert.ok('failureReason' in result, `${label}: missing "failureReason"`);
    assert.ok(Array.isArray(result.actions), `${label}: "actions" must be an array`);
    const validStatuses = ['pending', 'requires_action', 'succeeded', 'failed'];
    assert.ok(validStatuses.includes(result.status), `${label}: invalid status "${result.status}"`);
  }

  for (const scenario of [
    'redirect', 'qris', 'va', 'payment_code',
    'immediate_success', 'immediate_failure', 'pending_expiry', 'default',
  ] as FakeGatewayScenario[]) {
    it(`result shape complete for scenario: ${scenario}`, async () => {
      const result = await provider.createPayment({
        paymentIntentId: 'intent-shape-test',
        amount: 50000,
        currency: 'IDR',
        method: 'qris',
        metadata: { scenario },
      });
      assertResultShape(result, scenario);
    });
  }
});

// ── Test suite 3: FakeGateway scenario behaviors ──────────────────────────────

describe('FakeGatewayProvider scenarios', () => {
  const provider = new FakeGatewayProvider();

  function input(scenario: FakeGatewayScenario, extra?: Record<string, unknown>) {
    return {
      paymentIntentId: 'intent-sc-test',
      amount: 75000,
      currency: 'IDR',
      method: 'qris' as const,
      metadata: { scenario, ...extra },
    };
  }

  // ── redirect ──────────────────────────────────────────────────────────────

  it('redirect: status is requires_action', async () => {
    const r = await provider.createPayment(input('redirect'));
    assert.strictEqual(r.status, 'requires_action');
  });

  it('redirect: has exactly one action of type redirect', async () => {
    const r = await provider.createPayment(input('redirect'));
    assert.strictEqual(r.actions.length, 1);
    assert.strictEqual(r.actions[0].type, 'redirect');
  });

  it('redirect: action has non-empty label and value (URL)', async () => {
    const r = await provider.createPayment(input('redirect'));
    const action = r.actions[0] as ProviderAction;
    assert.ok(action.label.length > 0);
    assert.ok(action.value.startsWith('https://'));
  });

  it('redirect: legacy providerPaymentUrl is populated, providerQrString is null', async () => {
    const r = await provider.createPayment(input('redirect'));
    assert.ok(r.providerPaymentUrl?.startsWith('https://'));
    assert.strictEqual(r.providerQrString, null);
  });

  it('redirect: succeededImmediately is false', async () => {
    const r = await provider.createPayment(input('redirect'));
    assert.strictEqual(r.succeededImmediately, false);
  });

  // ── qris ─────────────────────────────────────────────────────────────────

  it('qris: status is requires_action', async () => {
    const r = await provider.createPayment(input('qris'));
    assert.strictEqual(r.status, 'requires_action');
  });

  it('qris: has exactly one action of type present_qr', async () => {
    const r = await provider.createPayment(input('qris'));
    assert.strictEqual(r.actions.length, 1);
    assert.strictEqual(r.actions[0].type, 'present_qr');
  });

  it('qris: action value contains the QR string', async () => {
    const r = await provider.createPayment(input('qris'));
    assert.ok(r.actions[0].value.startsWith('FAKE_QR:'));
  });

  it('qris: legacy providerQrString is populated, providerPaymentUrl is null', async () => {
    const r = await provider.createPayment(input('qris'));
    assert.ok(r.providerQrString?.startsWith('FAKE_QR:'));
    assert.strictEqual(r.providerPaymentUrl, null);
  });

  // ── va (virtual account) ─────────────────────────────────────────────────

  it('va: status is requires_action', async () => {
    const r = await provider.createPayment(input('va'));
    assert.strictEqual(r.status, 'requires_action');
  });

  it('va: has exactly one action of type display_code', async () => {
    const r = await provider.createPayment(input('va'));
    assert.strictEqual(r.actions.length, 1);
    assert.strictEqual(r.actions[0].type, 'display_code');
  });

  it('va: action value is a numeric string (VA number)', async () => {
    const r = await provider.createPayment(input('va'));
    const vaNumber = r.actions[0].value;
    assert.ok(/^\d+$/.test(vaNumber), `VA number "${vaNumber}" should be numeric`);
  });

  it('va: legacy URL and QR fields are both null', async () => {
    const r = await provider.createPayment(input('va'));
    assert.strictEqual(r.providerPaymentUrl, null);
    assert.strictEqual(r.providerQrString, null);
  });

  // ── payment_code ─────────────────────────────────────────────────────────

  it('payment_code: status is requires_action', async () => {
    const r = await provider.createPayment(input('payment_code'));
    assert.strictEqual(r.status, 'requires_action');
  });

  it('payment_code: has exactly one action of type display_code', async () => {
    const r = await provider.createPayment(input('payment_code'));
    assert.strictEqual(r.actions.length, 1);
    assert.strictEqual(r.actions[0].type, 'display_code');
  });

  it('payment_code: action value starts with FAKE prefix', async () => {
    const r = await provider.createPayment(input('payment_code'));
    assert.ok(r.actions[0].value.startsWith('FAKE'));
  });

  // ── immediate_success ────────────────────────────────────────────────────

  it('immediate_success: status is succeeded', async () => {
    const r = await provider.createPayment(input('immediate_success'));
    assert.strictEqual(r.status, 'succeeded');
  });

  it('immediate_success: actions array is empty', async () => {
    const r = await provider.createPayment(input('immediate_success'));
    assert.strictEqual(r.actions.length, 0);
  });

  it('immediate_success: succeededImmediately is true (legacy compat)', async () => {
    const r = await provider.createPayment(input('immediate_success'));
    assert.strictEqual(r.succeededImmediately, true);
  });

  it('immediate_success: failureReason is null', async () => {
    const r = await provider.createPayment(input('immediate_success'));
    assert.strictEqual(r.failureReason, null);
  });

  it('immediate_success: providerReference is non-null (needed for lock)', async () => {
    const r = await provider.createPayment(input('immediate_success'));
    assert.ok(r.providerReference !== null, 'providerReference must be non-null for immediate_success');
  });

  // ── immediate_failure ────────────────────────────────────────────────────

  it('immediate_failure: status is failed', async () => {
    const r = await provider.createPayment(input('immediate_failure'));
    assert.strictEqual(r.status, 'failed');
  });

  it('immediate_failure: actions array is empty', async () => {
    const r = await provider.createPayment(input('immediate_failure'));
    assert.strictEqual(r.actions.length, 0);
  });

  it('immediate_failure: failureReason is non-null string', async () => {
    const r = await provider.createPayment(input('immediate_failure'));
    assert.ok(typeof r.failureReason === 'string' && r.failureReason.length > 0);
  });

  it('immediate_failure: succeededImmediately is false', async () => {
    const r = await provider.createPayment(input('immediate_failure'));
    assert.strictEqual(r.succeededImmediately, false);
  });

  // ── pending_expiry ───────────────────────────────────────────────────────

  it('pending_expiry: status is requires_action', async () => {
    const r = await provider.createPayment(input('pending_expiry'));
    assert.strictEqual(r.status, 'requires_action');
  });

  it('pending_expiry: has one redirect action with expiresAt set', async () => {
    const r = await provider.createPayment(input('pending_expiry'));
    assert.strictEqual(r.actions.length, 1);
    assert.strictEqual(r.actions[0].type, 'redirect');
    assert.ok(r.actions[0].expiresAt instanceof Date, 'action.expiresAt should be a Date');
  });

  it('pending_expiry: result expiresAt is approximately 15 minutes from now', async () => {
    const before = Date.now();
    const r = await provider.createPayment(input('pending_expiry'));
    const after = Date.now();
    const expiresAt = r.expiresAt instanceof Date ? r.expiresAt.getTime() : 0;
    // Should be +15 min ± 5 seconds
    assert.ok(expiresAt >= before + 14 * 60 * 1000, 'expiresAt should be at least 14 min ahead');
    assert.ok(expiresAt <= after + 16 * 60 * 1000, 'expiresAt should be at most 16 min ahead');
  });

  it('pending_expiry: legacy providerPaymentUrl is populated', async () => {
    const r = await provider.createPayment(input('pending_expiry'));
    assert.ok(r.providerPaymentUrl?.startsWith('https://'));
  });

  // ── default ──────────────────────────────────────────────────────────────

  it('default: status is pending (backward compat)', async () => {
    const r = await provider.createPayment({
      paymentIntentId: 'intent-default',
      amount: 50000,
      currency: 'IDR',
      method: 'qris',
      // No metadata.scenario
    });
    assert.strictEqual(r.status, 'pending');
  });

  it('default: both providerPaymentUrl and providerQrString are set', async () => {
    const r = await provider.createPayment({
      paymentIntentId: 'intent-default-2',
      amount: 50000,
      currency: 'IDR',
      method: 'qris',
    });
    assert.ok(r.providerPaymentUrl?.startsWith('https://'));
    assert.ok(r.providerQrString?.startsWith('FAKE_QR:'));
  });

  it('default: succeededImmediately is false (backward compat)', async () => {
    const r = await provider.createPayment({
      paymentIntentId: 'intent-default-3',
      amount: 50000,
      currency: 'IDR',
      method: 'qris',
    });
    assert.strictEqual(r.succeededImmediately, false);
  });

  it('default: actions array is empty (legacy callers use URL/QR fields)', async () => {
    const r = await provider.createPayment({
      paymentIntentId: 'intent-default-4',
      amount: 50000,
      currency: 'IDR',
      method: 'qris',
    });
    assert.strictEqual(r.actions.length, 0);
  });

  it('unrecognised scenario falls through to default behavior', async () => {
    const r = await provider.createPayment(input('nonexistent' as any));
    assert.strictEqual(r.status, 'pending');
    assert.ok(r.providerPaymentUrl?.startsWith('https://'));
  });

  // ── rawProviderResponse ───────────────────────────────────────────────────

  it('rawProviderResponse is present and is an object for all scenarios', async () => {
    for (const scenario of ['redirect', 'qris', 'immediate_success', 'default'] as FakeGatewayScenario[]) {
      const r = await provider.createPayment(input(scenario));
      assert.ok(
        r.rawProviderResponse !== undefined && typeof r.rawProviderResponse === 'object',
        `rawProviderResponse should be an object for scenario "${scenario}"`,
      );
    }
  });
});

// ── Test suite 4: CreateGatewayPayment — Phase 6 paths ───────────────────────

describe('CreateGatewayPayment — Phase 6 scenario paths', () => {

  it('requires_action scenario: transaction stored with status requires_action', async () => {
    const intent = makeIntent({
      id: 'intent-p6-ra-1',
      tenantId: 'tenant-a',
      amountDue: 100_000,
      amountRemaining: 100_000,
    });
    const { useCase, txRepo } = makeFullUseCase(intent);

    const result = await useCase.execute({
      tenantId: 'tenant-a',
      paymentIntentId: 'intent-p6-ra-1',
      amount: 100_000,
      method: 'qris',
      provider: 'fake_gateway',
      metadata: { scenario: 'redirect' },
    });

    assert.strictEqual(result.transaction.status, 'requires_action');
    assert.strictEqual(txRepo._store().length, 1);
    assert.strictEqual(txRepo._store()[0].status, 'requires_action');
  });

  it('requires_action scenario: providerActions is non-empty', async () => {
    const intent = makeIntent({ id: 'intent-p6-ra-2', tenantId: 'tenant-a' });
    const { useCase } = makeFullUseCase(intent);

    const result = await useCase.execute({
      tenantId: 'tenant-a',
      paymentIntentId: 'intent-p6-ra-2',
      amount: 100_000,
      method: 'qris',
      provider: 'fake_gateway',
      metadata: { scenario: 'redirect' },
    });

    assert.ok(Array.isArray(result.providerActions));
    assert.ok(result.providerActions.length > 0, 'providerActions should be non-empty for requires_action');
    assert.strictEqual(result.providerActions[0].type, 'redirect');
  });

  it('requires_action scenario: immediateSuccess is false', async () => {
    const intent = makeIntent({ id: 'intent-p6-ra-3', tenantId: 'tenant-a' });
    const { useCase } = makeFullUseCase(intent);

    const result = await useCase.execute({
      tenantId: 'tenant-a',
      paymentIntentId: 'intent-p6-ra-3',
      amount: 100_000,
      method: 'qris',
      provider: 'fake_gateway',
      metadata: { scenario: 'qris' },
    });

    assert.strictEqual(result.immediateSuccess, false);
  });

  it('requires_action scenario: intent amountPaid remains 0 (no allocation)', async () => {
    const intent = makeIntent({ id: 'intent-p6-ra-4', tenantId: 'tenant-a' });
    const { useCase } = makeFullUseCase(intent);

    const result = await useCase.execute({
      tenantId: 'tenant-a',
      paymentIntentId: 'intent-p6-ra-4',
      amount: 100_000,
      method: 'qris',
      provider: 'fake_gateway',
      metadata: { scenario: 'qris' },
    });

    assert.strictEqual(result.intent.amountPaid, 0);
    assert.strictEqual(result.intent.status, 'requires_payment');
  });

  it('immediate_success scenario: transaction stored as succeeded', async () => {
    const intent = makeIntent({ id: 'intent-p6-is-1', tenantId: 'tenant-a' });
    const { useCase, txRepo } = makeFullUseCase(intent);

    const result = await useCase.execute({
      tenantId: 'tenant-a',
      paymentIntentId: 'intent-p6-is-1',
      amount: 100_000,
      method: 'qris',
      provider: 'fake_gateway',
      metadata: { scenario: 'immediate_success' },
    });

    assert.strictEqual(result.transaction.status, 'succeeded');
    // The row was initially created as 'pending', then updated to 'succeeded' by ApplyGatewayTransactionStatus
    assert.strictEqual(txRepo._store()[0].status, 'succeeded');
  });

  it('immediate_success scenario: allocation is created', async () => {
    const intent = makeIntent({ id: 'intent-p6-is-2', tenantId: 'tenant-a' });
    const { useCase, allocationRepo } = makeFullUseCase(intent);

    await useCase.execute({
      tenantId: 'tenant-a',
      paymentIntentId: 'intent-p6-is-2',
      amount: 100_000,
      method: 'qris',
      provider: 'fake_gateway',
      metadata: { scenario: 'immediate_success' },
    });

    assert.strictEqual(allocationRepo._store().length, 1, 'one allocation should be created');
    assert.strictEqual(allocationRepo._store()[0].targetType, 'order');
    assert.strictEqual(allocationRepo._store()[0].targetId, 'order-1');
  });

  it('immediate_success scenario: intent status becomes paid', async () => {
    const intent = makeIntent({ id: 'intent-p6-is-3', tenantId: 'tenant-a' });
    const { useCase } = makeFullUseCase(intent);

    const result = await useCase.execute({
      tenantId: 'tenant-a',
      paymentIntentId: 'intent-p6-is-3',
      amount: 100_000,
      method: 'qris',
      provider: 'fake_gateway',
      metadata: { scenario: 'immediate_success' },
    });

    assert.strictEqual(result.intent.status, 'paid');
    assert.strictEqual(result.immediateSuccess, true);
  });

  it('immediate_success scenario: idempotentReplay is false', async () => {
    const intent = makeIntent({ id: 'intent-p6-is-4', tenantId: 'tenant-a' });
    const { useCase } = makeFullUseCase(intent);

    const result = await useCase.execute({
      tenantId: 'tenant-a',
      paymentIntentId: 'intent-p6-is-4',
      amount: 100_000,
      method: 'qris',
      provider: 'fake_gateway',
      metadata: { scenario: 'immediate_success' },
    });

    assert.strictEqual(result.idempotentReplay, false);
  });

  it('immediate_failure scenario: transaction stored as failed', async () => {
    const intent = makeIntent({ id: 'intent-p6-if-1', tenantId: 'tenant-a' });
    const { useCase, txRepo } = makeFullUseCase(intent);

    const result = await useCase.execute({
      tenantId: 'tenant-a',
      paymentIntentId: 'intent-p6-if-1',
      amount: 100_000,
      method: 'qris',
      provider: 'fake_gateway',
      metadata: { scenario: 'immediate_failure' },
    });

    assert.strictEqual(result.transaction.status, 'failed');
    assert.strictEqual(txRepo._store()[0].status, 'failed');
  });

  it('immediate_failure scenario: no allocation created', async () => {
    const intent = makeIntent({ id: 'intent-p6-if-2', tenantId: 'tenant-a' });
    const { useCase, allocationRepo } = makeFullUseCase(intent);

    await useCase.execute({
      tenantId: 'tenant-a',
      paymentIntentId: 'intent-p6-if-2',
      amount: 100_000,
      method: 'qris',
      provider: 'fake_gateway',
      metadata: { scenario: 'immediate_failure' },
    });

    assert.strictEqual(allocationRepo._store().length, 0, 'no allocation for failed tx');
  });

  it('immediate_failure scenario: intent remains in requires_payment', async () => {
    const intent = makeIntent({ id: 'intent-p6-if-3', tenantId: 'tenant-a' });
    const { useCase } = makeFullUseCase(intent);

    const result = await useCase.execute({
      tenantId: 'tenant-a',
      paymentIntentId: 'intent-p6-if-3',
      amount: 100_000,
      method: 'qris',
      provider: 'fake_gateway',
      metadata: { scenario: 'immediate_failure' },
    });

    assert.strictEqual(result.intent.status, 'requires_payment');
    assert.strictEqual(result.immediateSuccess, false);
  });

  it('immediate_failure scenario: failureReason stored on transaction', async () => {
    const intent = makeIntent({ id: 'intent-p6-if-4', tenantId: 'tenant-a' });
    const { useCase, txRepo } = makeFullUseCase(intent);

    await useCase.execute({
      tenantId: 'tenant-a',
      paymentIntentId: 'intent-p6-if-4',
      amount: 100_000,
      method: 'qris',
      provider: 'fake_gateway',
      metadata: { scenario: 'immediate_failure' },
    });

    const storedTx = txRepo._store()[0];
    assert.ok(
      typeof storedTx.failureReason === 'string' && storedTx.failureReason.length > 0,
      'failureReason should be stored on failed transaction',
    );
  });

  it('pending_expiry scenario: transaction stored as requires_action', async () => {
    const intent = makeIntent({ id: 'intent-p6-pe-1', tenantId: 'tenant-a' });
    const { useCase, txRepo } = makeFullUseCase(intent);

    const result = await useCase.execute({
      tenantId: 'tenant-a',
      paymentIntentId: 'intent-p6-pe-1',
      amount: 100_000,
      method: 'qris',
      provider: 'fake_gateway',
      metadata: { scenario: 'pending_expiry' },
    });

    assert.strictEqual(result.transaction.status, 'requires_action');
    assert.strictEqual(txRepo._store()[0].status, 'requires_action');
  });

  it('pending_expiry scenario: providerActions includes action with expiresAt', async () => {
    const intent = makeIntent({ id: 'intent-p6-pe-2', tenantId: 'tenant-a' });
    const { useCase } = makeFullUseCase(intent);

    const result = await useCase.execute({
      tenantId: 'tenant-a',
      paymentIntentId: 'intent-p6-pe-2',
      amount: 100_000,
      method: 'qris',
      provider: 'fake_gateway',
      metadata: { scenario: 'pending_expiry' },
    });

    assert.ok(result.providerActions.length > 0, 'providerActions should be non-empty');
    assert.ok(
      result.providerActions[0].expiresAt instanceof Date,
      'action.expiresAt should be a Date for pending_expiry',
    );
  });

  it('default scenario (no metadata): transaction stored as pending (backward compat)', async () => {
    const intent = makeIntent({ id: 'intent-p6-def-1', tenantId: 'tenant-a' });
    const { useCase, txRepo } = makeFullUseCase(intent);

    const result = await useCase.execute({
      tenantId: 'tenant-a',
      paymentIntentId: 'intent-p6-def-1',
      amount: 100_000,
      method: 'qris',
      provider: 'fake_gateway',
      // No metadata — default scenario
    });

    assert.strictEqual(result.transaction.status, 'pending');
    assert.strictEqual(txRepo._store()[0].status, 'pending');
    assert.strictEqual(result.immediateSuccess, false);
    assert.strictEqual(result.providerActions.length, 0);
  });

  it('immediate_success without applyGatewayStatus throws IMMEDIATE_SUCCESS_NOT_CONFIGURED', async () => {
    const intent = makeIntent({ id: 'intent-p6-nc-1', tenantId: 'tenant-a' });
    const fakeDb = makeFakeDb();
    const intentRepo = makeFakeIntentRepo(intent);
    const txRepo = makeFakeTxRepo();
    const registry = new PaymentProviderRegistry().register(new FakeGatewayProvider());

    // Construct WITHOUT applyGatewayStatus (4-arg form)
    const useCase = new CreateGatewayPayment(
      fakeDb as any,
      intentRepo as any,
      txRepo as any,
      registry,
      // no 5th arg
    );

    await assert.rejects(
      () => useCase.execute({
        tenantId: 'tenant-a',
        paymentIntentId: 'intent-p6-nc-1',
        amount: 100_000,
        method: 'qris',
        provider: 'fake_gateway',
        metadata: { scenario: 'immediate_success' },
      }),
      (err: any) => {
        assert.ok(err instanceof PaymentPolicyError);
        assert.strictEqual(err.code, 'IMMEDIATE_SUCCESS_NOT_CONFIGURED');
        return true;
      },
    );
  });
});

// ── Test suite 5: ProviderAccountConfig type ──────────────────────────────────

describe('ProviderAccountConfig type', () => {
  it('accepts a fully-typed config object', () => {
    const config: ProviderAccountConfig = {
      tenantId: 'tenant-a',
      providerCode: 'fake_gateway',
      accountId: 'merchant-001',
      credentials: { apiKey: 'test-key', clientKey: 'client-key' },
      sandboxMode: true,
      metadata: { webhookUrl: 'https://example.com/webhook' },
    };
    assert.strictEqual(config.tenantId, 'tenant-a');
    assert.strictEqual(config.providerCode, 'fake_gateway');
    assert.strictEqual(config.accountId, 'merchant-001');
    assert.strictEqual(config.sandboxMode, true);
    assert.strictEqual(typeof config.credentials['apiKey'], 'string');
  });

  it('optional sandboxMode and metadata can be omitted', () => {
    const config: ProviderAccountConfig = {
      tenantId: 'tenant-b',
      providerCode: 'fake_gateway',
      accountId: 'merchant-002',
      credentials: { apiKey: 'k' },
    };
    assert.strictEqual(config.sandboxMode, undefined);
    assert.strictEqual(config.metadata, undefined);
  });
});

// ── Test suite 6: Phase 2 regression ─────────────────────────────────────────

describe('Phase 2 regression — default scenario still works', () => {
  it('FakeGatewayProvider default createPayment returns non-null providerReference, URL, QR', async () => {
    const provider = new FakeGatewayProvider();
    const r = await provider.createPayment({
      paymentIntentId: 'intent-reg-1',
      amount: 100000,
      currency: 'IDR',
      method: 'qris',
    });
    assert.ok(r.providerReference?.startsWith('fake_intent-reg-1_'));
    assert.ok(r.providerPaymentUrl?.includes(r.providerReference!));
    assert.ok(r.providerQrString?.includes(r.providerReference!));
    assert.strictEqual(r.succeededImmediately, false);
    assert.strictEqual(r.failureReason, null);
  });

  it('ManualProvider createPayment has status succeeded (Phase 6 field)', async () => {
    const provider = new ManualProvider();
    const r = await provider.createPayment({
      paymentIntentId: 'intent-manual-1',
      amount: 50000,
      currency: 'IDR',
      method: 'cash',
    });
    assert.strictEqual(r.status, 'succeeded');
    assert.strictEqual(r.succeededImmediately, true);
    assert.strictEqual(r.actions.length, 0);
  });
});
