/**
 * Payment Engine Phase 7A Hardening — Xendit Gateway Integration Tests
 *
 * These tests verify that CreateGatewayPayment can actually use the xendit_sandbox
 * provider through the full use-case path (not just isolated XenditProvider unit tests).
 *
 * All tests use mocked HTTP only — no real Xendit network calls.
 *
 * Test inventory:
 *  1.  xendit_sandbox creates requires_action transaction when registered + REQUIRES_ACTION response
 *  2.  Response includes providerReference from payment_request_id
 *  3.  Response includes providerActions mapped to WEB_URL / QR_STRING descriptors
 *  4.  providerPaymentUrl is derived from WEB_URL action
 *  5.  providerQrString is derived from QR_STRING action
 *  6.  fake_gateway path still passes (regression)
 *  7.  xendit_sandbox returns UNSUPPORTED_PROVIDER when not registered
 *  8.  manual provider is rejected by gateway payment flow
 *  9.  unknown provider is rejected safely
 * 10.  xendit_sandbox uses per-attempt reference_id (different idempotency keys → different refs)
 * 11.  xendit_sandbox idempotency replay returns existing transaction
 */

import '../../register-paths';
import assert from 'node:assert/strict';
import { describe, it, beforeEach } from 'node:test';

process.env['DATABASE_URL'] ||= 'postgres://user:pass@127.0.0.1:5432/aurapos_test';
process.env['BETTER_AUTH_SECRET'] ||= 'test-secret-with-at-least-32-characters-ok';

import { PaymentPolicyError } from '@pos/domain/payments';
import type { DomainPaymentIntent, DomainPaymentTransaction } from '@pos/domain/payments';
import { PaymentProviderRegistry } from '@pos/application/payments/PaymentProviderRegistry';
import { CreateGatewayPayment } from '@pos/application/payments/CreateGatewayPayment';
import { RecalculatePaymentIntent } from '@pos/application/payments/RecalculatePaymentIntent';
import { FakeGatewayProvider } from '@pos/infrastructure/payments/providers/FakeGatewayProvider';
import {
  XenditProvider,
  type XenditSandboxConfig,
  type FetchFn,
} from '@pos/infrastructure/payments/providers/XenditProvider';

// ── Sequence counters ──────────────────────────────────────────────────────────

let intentSeq = 0;
let txSeq = 0;
let allocSeq = 0;

// ── Domain fixtures ────────────────────────────────────────────────────────────

function makeIntent(overrides: Partial<DomainPaymentIntent> = {}): DomainPaymentIntent {
  return {
    id: `intent-${++intentSeq}`,
    tenantId: 'tenant-test',
    outletId: null,
    payableType: 'order',
    payableId: 'order-smoke-001',
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
    id: `tx-${++txSeq}`,
    tenantId: 'tenant-test',
    paymentIntentId: 'intent-1',
    direction: 'incoming',
    transactionType: 'payment',
    method: 'qris',
    provider: 'xendit_sandbox',
    status: 'requires_action',
    amount: '100000.00',
    receivedAmount: null,
    changeAmount: null,
    providerReference: 'pr_test_001',
    providerPaymentUrl: null,
    providerQrString: null,
    failureReason: null,
    idempotencyKey: null,
    metadata: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    succeededAt: null,
    ...overrides,
  };
}

// ── Xendit mock config ─────────────────────────────────────────────────────────

const TEST_XENDIT_CONFIG: XenditSandboxConfig = {
  secretKey: 'xnd_development_test_secret_key_integration_test',
  webhookToken: 'test-webhook-token-integration-abc123',
  apiBaseUrl: 'https://api.xendit.co',
  successReturnUrl: 'http://localhost:5000/payment/success',
  failureReturnUrl: 'http://localhost:5000/payment/failure',
};

// ── Mock fetch helpers ─────────────────────────────────────────────────────────

interface CapturedXenditRequest {
  url: string;
  body: Record<string, unknown>;
  headers: Record<string, string>;
}

function makeXenditFetch(
  status: number,
  responseBody: Record<string, unknown>,
): { fetch: FetchFn; captured: CapturedXenditRequest[] } {
  const captured: CapturedXenditRequest[] = [];
  const fetch: FetchFn = async (url, init) => {
    let body: Record<string, unknown> = {};
    if (init?.body) {
      try { body = JSON.parse(init.body); } catch { /* ignore */ }
    }
    captured.push({
      url,
      body,
      headers: init?.headers ?? {},
    });
    return { status, json: async () => responseBody };
  };
  return { fetch, captured };
}

// ── Xendit response fixtures ───────────────────────────────────────────────────

const XENDIT_REQUIRES_ACTION_REDIRECT = {
  payment_request_id: 'pr_test_redirect_integration_001',
  reference_id: 'aurapos-intent-1-key-abc',
  status: 'REQUIRES_ACTION',
  actions: [
    {
      type: 'REDIRECT_CUSTOMER',
      descriptor: 'WEB_URL',
      url: 'https://checkout.xendit.co/pay/pr_test_redirect_integration_001',
    },
  ],
};

const XENDIT_REQUIRES_ACTION_QR = {
  payment_request_id: 'pr_test_qris_integration_001',
  reference_id: 'aurapos-intent-2-key-def',
  status: 'REQUIRES_ACTION',
  actions: [
    {
      type: 'PRESENT_TO_CUSTOMER',
      descriptor: 'QR_STRING',
      value: '00020101021226550010A000000015010118330012345678901234567890123456789012AB0303UMI51440014ID.CO.QRIS.WWW0215ID20201234567890303UMI5204581153033605802ID5910MerchantXX6006KOTA016304ABCD',
    },
  ],
};

// ── Mock repository builders ───────────────────────────────────────────────────

function makeIntentRepo(intent: DomainPaymentIntent): any {
  const intentRow = {
    ...intent,
    amountDue: intent.amountDue.toFixed(2),
    amountPaid: intent.amountPaid.toFixed(2),
    amountRefunded: intent.amountRefunded.toFixed(2),
    amountRemaining: intent.amountRemaining.toFixed(2),
  };
  return {
    lockForUpdate: async (_id: string, _tenantId: string, _tx: any) => intentRow,
    findById: async (_id: string, _tenantId: string, _tx?: any) => intentRow,
    updateStatus: async (_id: string, _tenantId: string, _data: any, _tx?: any) => intentRow,
    update: async (_id: string, _tenantId: string, _data: any, _tx?: any) => intentRow,
  };
}

function makeTxRepo(existingTx?: any): any {
  const store: any[] = existingTx ? [existingTx] : [];
  return {
    create: async (data: any, _tx?: any) => {
      const row = { ...makeDbTx(), ...data, id: `tx-${++txSeq}` };
      store.push(row);
      return row;
    },
    findByIdempotencyKey: async (_tenantId: string, key: string, _tx?: any) =>
      store.find((t) => t.idempotencyKey === key) ?? null,
    findByProviderReferenceGlobal: async (_provider: string, _ref: string) => null,
  };
}

function makeAllocationRepo(): any {
  const store: any[] = [];
  return {
    create: async (data: any, _tx?: any) => {
      const row = { id: `alloc-${++allocSeq}`, ...data };
      store.push(row);
      return row;
    },
  };
}

function makeRecalculate(intent: DomainPaymentIntent): any {
  return {
    execute: async (_input: any) => ({ intent }),
  };
}

function makeFakeDb(): any {
  return {
    transaction: async (fn: (tx: any) => Promise<unknown>) => {
      const fakeTx = {
        execute: async (_sql: any) => [],
        select: () => ({ from: () => ({ where: () => ({ limit: async () => [] }) }) }),
        insert: (_table: any) => ({
          values: (_data: any) => ({
            returning: async () => [],
            onConflictDoNothing: () => ({ returning: async () => [] }),
          }),
        }),
        update: (_table: any) => ({
          set: (_data: any) => ({ where: (_cond: any) => ({ returning: async () => [] }) }),
        }),
      };
      return fn(fakeTx);
    },
  };
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('CreateGatewayPayment — Xendit sandbox integration', () => {
  it('Test 1: xendit_sandbox creates requires_action tx when registered + REQUIRES_ACTION response', async () => {
    const intent = makeIntent();
    const { fetch: mockFetch } = makeXenditFetch(200, XENDIT_REQUIRES_ACTION_REDIRECT);
    const xendit = new XenditProvider(TEST_XENDIT_CONFIG, mockFetch);

    const registry = new PaymentProviderRegistry()
      .register(new FakeGatewayProvider())
      .register(xendit);

    const useCase = new CreateGatewayPayment(
      makeFakeDb(),
      makeIntentRepo(intent),
      makeTxRepo(),
      registry,
      makeAllocationRepo(),
      makeRecalculate(intent),
    );

    const result = await useCase.execute({
      tenantId: 'tenant-test',
      paymentIntentId: intent.id,
      amount: 100000,
      method: 'qris',
      provider: 'xendit_sandbox',
      idempotencyKey: 'key-integration-001',
    });

    assert.equal(result.transaction.status, 'requires_action');
    assert.equal(result.idempotentReplay, false);
    assert.equal(result.immediateSuccess, false);
  });

  it('Test 2: response includes providerReference from payment_request_id', async () => {
    const intent = makeIntent();
    const { fetch: mockFetch } = makeXenditFetch(200, XENDIT_REQUIRES_ACTION_REDIRECT);
    const xendit = new XenditProvider(TEST_XENDIT_CONFIG, mockFetch);

    const registry = new PaymentProviderRegistry()
      .register(new FakeGatewayProvider())
      .register(xendit);

    const useCase = new CreateGatewayPayment(
      makeFakeDb(),
      makeIntentRepo(intent),
      makeTxRepo(),
      registry,
      makeAllocationRepo(),
      makeRecalculate(intent),
    );

    const result = await useCase.execute({
      tenantId: 'tenant-test',
      paymentIntentId: intent.id,
      amount: 100000,
      method: 'qris',
      provider: 'xendit_sandbox',
    });

    assert.equal(result.providerReference, 'pr_test_redirect_integration_001');
    assert.ok(result.providerReference !== null);
  });

  it('Test 3: response includes providerActions with WEB_URL descriptor', async () => {
    const intent = makeIntent();
    const { fetch: mockFetch } = makeXenditFetch(200, XENDIT_REQUIRES_ACTION_REDIRECT);
    const xendit = new XenditProvider(TEST_XENDIT_CONFIG, mockFetch);

    const registry = new PaymentProviderRegistry()
      .register(new FakeGatewayProvider())
      .register(xendit);

    const useCase = new CreateGatewayPayment(
      makeFakeDb(),
      makeIntentRepo(intent),
      makeTxRepo(),
      registry,
      makeAllocationRepo(),
      makeRecalculate(intent),
    );

    const result = await useCase.execute({
      tenantId: 'tenant-test',
      paymentIntentId: intent.id,
      amount: 100000,
      method: 'qris',
      provider: 'xendit_sandbox',
    });

    assert.ok(result.providerActions.length > 0, 'providerActions must be non-empty');
    const webUrlAction = result.providerActions.find((a) => a.descriptor === 'WEB_URL');
    assert.ok(webUrlAction !== undefined, 'must have a WEB_URL action');
    assert.equal(webUrlAction!.type, 'redirect_customer');
  });

  it('Test 4: providerPaymentUrl derived from WEB_URL action', async () => {
    const intent = makeIntent();
    const { fetch: mockFetch } = makeXenditFetch(200, XENDIT_REQUIRES_ACTION_REDIRECT);
    const xendit = new XenditProvider(TEST_XENDIT_CONFIG, mockFetch);

    const registry = new PaymentProviderRegistry()
      .register(new FakeGatewayProvider())
      .register(xendit);

    const useCase = new CreateGatewayPayment(
      makeFakeDb(),
      makeIntentRepo(intent),
      makeTxRepo(),
      registry,
      makeAllocationRepo(),
      makeRecalculate(intent),
    );

    const result = await useCase.execute({
      tenantId: 'tenant-test',
      paymentIntentId: intent.id,
      amount: 100000,
      method: 'qris',
      provider: 'xendit_sandbox',
    });

    assert.equal(
      result.providerPaymentUrl,
      'https://checkout.xendit.co/pay/pr_test_redirect_integration_001',
    );
  });

  it('Test 5: providerQrString derived from QR_STRING action', async () => {
    const intent = makeIntent();
    const { fetch: mockFetch } = makeXenditFetch(200, XENDIT_REQUIRES_ACTION_QR);
    const xendit = new XenditProvider(TEST_XENDIT_CONFIG, mockFetch);

    const registry = new PaymentProviderRegistry()
      .register(new FakeGatewayProvider())
      .register(xendit);

    const useCase = new CreateGatewayPayment(
      makeFakeDb(),
      makeIntentRepo(intent),
      makeTxRepo(),
      registry,
      makeAllocationRepo(),
      makeRecalculate(intent),
    );

    const result = await useCase.execute({
      tenantId: 'tenant-test',
      paymentIntentId: intent.id,
      amount: 100000,
      method: 'qris',
      provider: 'xendit_sandbox',
    });

    assert.ok(
      result.providerQrString !== null && result.providerQrString.length > 0,
      'providerQrString must be present',
    );
    const qrAction = result.providerActions.find((a) => a.descriptor === 'QR_STRING');
    assert.ok(qrAction !== undefined, 'must have a QR_STRING action');
    assert.equal(qrAction!.type, 'present_qr');
  });

  it('Test 6: fake_gateway path still passes (regression)', async () => {
    const intent = makeIntent();

    const registry = new PaymentProviderRegistry().register(new FakeGatewayProvider());

    const useCase = new CreateGatewayPayment(
      makeFakeDb(),
      makeIntentRepo(intent),
      makeTxRepo(),
      registry,
      makeAllocationRepo(),
      makeRecalculate(intent),
    );

    const result = await useCase.execute({
      tenantId: 'tenant-test',
      paymentIntentId: intent.id,
      amount: 100000,
      method: 'qris',
      provider: 'fake_gateway',
    });

    assert.equal(result.transaction.provider, 'fake_gateway');
    assert.equal(result.transaction.status, 'pending');
    assert.ok(result.providerReference !== null);
  });

  it('Test 7: xendit_sandbox returns UNSUPPORTED_PROVIDER when not registered', async () => {
    const intent = makeIntent();

    // Registry only has fake_gateway — xendit_sandbox NOT registered
    const registry = new PaymentProviderRegistry().register(new FakeGatewayProvider());

    const useCase = new CreateGatewayPayment(
      makeFakeDb(),
      makeIntentRepo(intent),
      makeTxRepo(),
      registry,
      makeAllocationRepo(),
      makeRecalculate(intent),
    );

    await assert.rejects(
      () =>
        useCase.execute({
          tenantId: 'tenant-test',
          paymentIntentId: intent.id,
          amount: 100000,
          method: 'qris',
          provider: 'xendit_sandbox',
        }),
      (err: unknown) => {
        assert.ok(err instanceof PaymentPolicyError);
        assert.equal(err.code, 'UNSUPPORTED_PROVIDER');
        assert.ok(err.message.includes('xendit_sandbox'));
        assert.ok(err.message.includes('not registered'));
        return true;
      },
    );
  });

  it('Test 8: manual provider is rejected by gateway payment flow', async () => {
    const intent = makeIntent();

    const registry = new PaymentProviderRegistry().register(new FakeGatewayProvider());

    const useCase = new CreateGatewayPayment(
      makeFakeDb(),
      makeIntentRepo(intent),
      makeTxRepo(),
      registry,
    );

    await assert.rejects(
      () =>
        useCase.execute({
          tenantId: 'tenant-test',
          paymentIntentId: intent.id,
          amount: 100000,
          method: 'qris',
          provider: 'manual',
        }),
      (err: unknown) => {
        assert.ok(err instanceof PaymentPolicyError);
        assert.equal(err.code, 'UNSUPPORTED_PROVIDER');
        assert.ok(err.message.includes('manual'));
        return true;
      },
    );
  });

  it('Test 9: unknown provider is rejected safely', async () => {
    const intent = makeIntent();

    const registry = new PaymentProviderRegistry().register(new FakeGatewayProvider());

    const useCase = new CreateGatewayPayment(
      makeFakeDb(),
      makeIntentRepo(intent),
      makeTxRepo(),
      registry,
    );

    await assert.rejects(
      () =>
        useCase.execute({
          tenantId: 'tenant-test',
          paymentIntentId: intent.id,
          amount: 100000,
          method: 'qris',
          provider: 'stripe_live',
        }),
      (err: unknown) => {
        assert.ok(err instanceof PaymentPolicyError);
        assert.equal(err.code, 'UNSUPPORTED_PROVIDER');
        return true;
      },
    );
  });

  it('Test 10: two xendit attempts for same intent use different reference_id when idempotency keys differ', async () => {
    const intent = makeIntent();
    const capturedBodies: Record<string, unknown>[] = [];

    const capturingFetch: FetchFn = async (url, init) => {
      if (init?.body) {
        try { capturedBodies.push(JSON.parse(init.body)); } catch { /* ignore */ }
      }
      return {
        status: 200,
        json: async () => ({
          payment_request_id: `pr_attempt_${capturedBodies.length}`,
          status: 'REQUIRES_ACTION',
          actions: [],
        }),
      };
    };

    const xendit = new XenditProvider(TEST_XENDIT_CONFIG, capturingFetch);
    const registry = new PaymentProviderRegistry().register(xendit);

    // First attempt (key-attempt-A)
    const useCase = new CreateGatewayPayment(
      makeFakeDb(),
      makeIntentRepo(intent),
      makeTxRepo(),
      registry,
      makeAllocationRepo(),
      makeRecalculate(intent),
    );

    await useCase.execute({
      tenantId: 'tenant-test',
      paymentIntentId: intent.id,
      amount: 100000,
      method: 'qris',
      provider: 'xendit_sandbox',
      idempotencyKey: 'key-attempt-A',
    });

    // Second attempt with different key — re-initialize intentRepo to allow through
    const useCase2 = new CreateGatewayPayment(
      makeFakeDb(),
      makeIntentRepo(intent),
      makeTxRepo(), // fresh store, no existing idempotency key
      registry,
      makeAllocationRepo(),
      makeRecalculate(intent),
    );

    await useCase2.execute({
      tenantId: 'tenant-test',
      paymentIntentId: intent.id,
      amount: 100000,
      method: 'qris',
      provider: 'xendit_sandbox',
      idempotencyKey: 'key-attempt-B',
    });

    assert.equal(capturedBodies.length, 2, 'should have made two Xendit API calls');

    const ref1 = capturedBodies[0]?.['reference_id'] as string;
    const ref2 = capturedBodies[1]?.['reference_id'] as string;

    assert.ok(typeof ref1 === 'string' && ref1.length > 0, 'first reference_id must be a string');
    assert.ok(typeof ref2 === 'string' && ref2.length > 0, 'second reference_id must be a string');
    assert.notEqual(ref1, ref2, 'two attempts with different idempotency keys must use different reference_id');

    // Both should contain the intent id
    assert.ok(ref1.includes(intent.id), 'reference_id should contain intent id');
    assert.ok(ref2.includes(intent.id), 'reference_id should contain intent id');
  });

  it('Test 11: idempotency replay returns existing transaction without new Xendit call', async () => {
    const intent = makeIntent();
    let xenditCallCount = 0;

    const countingFetch: FetchFn = async (_url, _init) => {
      xenditCallCount++;
      return {
        status: 200,
        json: async () => ({
          payment_request_id: 'pr_idempotency_test',
          status: 'REQUIRES_ACTION',
          actions: [],
        }),
      };
    };

    const xendit = new XenditProvider(TEST_XENDIT_CONFIG, countingFetch);
    const registry = new PaymentProviderRegistry().register(xendit);

    // Pre-existing transaction with the same idempotency key
    const existingTx = makeDbTx({
      idempotencyKey: 'key-replay-001',
      paymentIntentId: intent.id,
      provider: 'xendit_sandbox',
      providerReference: 'pr_existing_ref',
    });

    const useCase = new CreateGatewayPayment(
      makeFakeDb(),
      makeIntentRepo(intent),
      makeTxRepo(existingTx),
      registry,
      makeAllocationRepo(),
      makeRecalculate(intent),
    );

    const result = await useCase.execute({
      tenantId: 'tenant-test',
      paymentIntentId: intent.id,
      amount: 100000,
      method: 'qris',
      provider: 'xendit_sandbox',
      idempotencyKey: 'key-replay-001',
    });

    assert.equal(result.idempotentReplay, true, 'must be idempotent replay');
    assert.equal(xenditCallCount, 0, 'must not call Xendit API on idempotency replay');
    assert.equal(result.providerReference, 'pr_existing_ref');
  });
});
