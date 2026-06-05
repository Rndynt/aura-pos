/**
 * Payment Engine Phase 6 — Provider Contract Tests (Hardening edition)
 *
 * Covers:
 *  1.  ProviderCapabilities — FakeGatewayProvider and ManualProvider expose correct capabilities
 *  2.  Phase 6 Hardening capabilities expansion — supportsRedirect, supportsQr, supportsVa,
 *      supportsPaymentCode, supportsPartialRefund, supportsMultiplePartialRefund,
 *      canReturnImmediateSuccess, canReturnImmediateFailure
 *  3.  CreateProviderPaymentResult shape — all Phase 6 fields present on every result
 *  4.  FakeGateway scenarios — all 8 scenarios produce correct status/actions/legacy fields
 *  5.  ProviderAction descriptor — every action has machine-readable `descriptor` field
 *  6.  ProviderAction type — canonical `redirect_customer` used (not deprecated `redirect`)
 *  7.  CreateGatewayPayment: requires_action / failed / pending_expiry / default paths
 *  8.  CreateGatewayPayment immediate_success — direct settlement (NO ApplyGatewayTransactionStatus)
 *      - tx created as succeeded directly (no two-step pending→succeeded)
 *      - exactly one allocation created
 *      - intent recalculated to paid
 *      - idempotentReplay false
 *  9.  CreateGatewayPayment immediate_failure — failed tx, no allocation
 * 10.  CreateGatewayPayment: missing immediate-success deps → IMMEDIATE_SUCCESS_NOT_CONFIGURED
 * 11.  ProviderAccountConfig — has credentialsRef, no raw credentials field
 * 12.  FakeGateway cancel/refund messages — no stale Phase 4 language
 * 13.  Phase 2 regression — default scenario still works without descriptor/actions
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
  ProviderActionDescriptor,
  CreateProviderPaymentResult,
  ProviderAccountConfig,
} from '@pos/domain/payments';
import { FakeGatewayProvider } from '@pos/infrastructure/payments/providers/FakeGatewayProvider';
import type { FakeGatewayScenario } from '@pos/infrastructure/payments/providers/FakeGatewayProvider';
import { PaymentProviderRegistry } from '@pos/application/payments/PaymentProviderRegistry';
import { CreateGatewayPayment } from '@pos/application/payments/CreateGatewayPayment';
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
        // Only set timestamp fields if not already provided (immediate_success passes succeededAt)
        succeededAt: d.succeededAt ?? null,
        failedAt: d.failedAt ?? null,
        cancelledAt: d.cancelledAt ?? null,
        receivedAmount: d.receivedAmount ?? null,
        changeAmount: d.changeAmount ?? null,
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
 * Build a fully wired CreateGatewayPayment with:
 * - allocationRepo (5th arg) — required for immediate success settlement
 * - recalculate (6th arg)    — required for immediate success settlement
 *
 * Phase 6 Hardening: ApplyGatewayTransactionStatus is NOT injected.
 * Direct settlement avoids the intent→tx→intent reversed lock ordering.
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

  const registry = new PaymentProviderRegistry().register(new FakeGatewayProvider());

  const useCase = new CreateGatewayPayment(
    fakeDb as any,
    intentRepo as any,
    txRepo as any,
    registry,
    allocationRepo as any,
    recalculate,
  );

  return { useCase, intentRepo, txRepo, allocationRepo, recalculate };
}

// ── Test suite 1: ProviderCapabilities (original + expanded) ─────────────────

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

  it('FakeGatewayProvider.capabilities has correct original values', () => {
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

// ── Test suite 2: Phase 6 Hardening — Expanded capabilities matrix ────────────

describe('Phase 6 Hardening — expanded ProviderCapabilities matrix', () => {
  const fake = new FakeGatewayProvider();
  const manual = new ManualProvider();

  // ── FakeGateway gateway action capabilities ────────────────────────────────
  it('FakeGateway: supportsRedirect is true', () => {
    assert.strictEqual(fake.capabilities.supportsRedirect, true);
  });
  it('FakeGateway: supportsQr is true', () => {
    assert.strictEqual(fake.capabilities.supportsQr, true);
  });
  it('FakeGateway: supportsVa is true', () => {
    assert.strictEqual(fake.capabilities.supportsVa, true);
  });
  it('FakeGateway: supportsPaymentCode is true', () => {
    assert.strictEqual(fake.capabilities.supportsPaymentCode, true);
  });
  it('FakeGateway: canReturnImmediateSuccess is true', () => {
    assert.strictEqual(fake.capabilities.canReturnImmediateSuccess, true);
  });
  it('FakeGateway: canReturnImmediateFailure is true', () => {
    assert.strictEqual(fake.capabilities.canReturnImmediateFailure, true);
  });
  it('FakeGateway: supportsPartialRefund is false', () => {
    assert.strictEqual(fake.capabilities.supportsPartialRefund, false);
  });
  it('FakeGateway: supportsMultiplePartialRefund is false', () => {
    assert.strictEqual(fake.capabilities.supportsMultiplePartialRefund, false);
  });

  // ── ManualProvider gateway action capabilities ─────────────────────────────
  it('ManualProvider: supportsRedirect is false', () => {
    assert.strictEqual(manual.capabilities.supportsRedirect, false);
  });
  it('ManualProvider: supportsQr is false', () => {
    assert.strictEqual(manual.capabilities.supportsQr, false);
  });
  it('ManualProvider: supportsVa is false', () => {
    assert.strictEqual(manual.capabilities.supportsVa, false);
  });
  it('ManualProvider: supportsPaymentCode is false', () => {
    assert.strictEqual(manual.capabilities.supportsPaymentCode, false);
  });
  it('ManualProvider: canReturnImmediateSuccess is true (manual settles synchronously)', () => {
    assert.strictEqual(manual.capabilities.canReturnImmediateSuccess, true);
  });
  it('ManualProvider: canReturnImmediateFailure is false', () => {
    assert.strictEqual(manual.capabilities.canReturnImmediateFailure, false);
  });
  it('ManualProvider: supportsPartialRefund is false', () => {
    assert.strictEqual(manual.capabilities.supportsPartialRefund, false);
  });
  it('ManualProvider: supportsMultiplePartialRefund is false', () => {
    assert.strictEqual(manual.capabilities.supportsMultiplePartialRefund, false);
  });
  it('ManualProvider: supportsWebhook is false', () => {
    assert.strictEqual(manual.capabilities.supportsWebhook, false);
  });
});

// ── Test suite 3: CreateProviderPaymentResult shape ───────────────────────────

describe('CreateProviderPaymentResult Phase 6 shape', () => {
  const provider = new FakeGatewayProvider();

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

// ── Test suite 4: ProviderAction descriptor — machine-readable value tags ─────

describe('Phase 6 Hardening — ProviderAction descriptor field', () => {
  const provider = new FakeGatewayProvider();

  it('redirect action has descriptor WEB_URL', async () => {
    const r = await provider.createPayment({
      paymentIntentId: 'desc-redirect',
      amount: 50000,
      currency: 'IDR',
      method: 'qris',
      metadata: { scenario: 'redirect' },
    });
    assert.strictEqual(r.actions.length, 1);
    const action = r.actions[0] as ProviderAction;
    const desc: ProviderActionDescriptor = action.descriptor;
    assert.strictEqual(desc, 'WEB_URL');
  });

  it('qris action has descriptor QR_STRING', async () => {
    const r = await provider.createPayment({
      paymentIntentId: 'desc-qris',
      amount: 50000,
      currency: 'IDR',
      method: 'qris',
      metadata: { scenario: 'qris' },
    });
    assert.strictEqual(r.actions.length, 1);
    const desc: ProviderActionDescriptor = r.actions[0].descriptor;
    assert.strictEqual(desc, 'QR_STRING');
  });

  it('va action has descriptor VA_NUMBER', async () => {
    const r = await provider.createPayment({
      paymentIntentId: 'desc-va',
      amount: 50000,
      currency: 'IDR',
      method: 'bank_transfer',
      metadata: { scenario: 'va' },
    });
    assert.strictEqual(r.actions.length, 1);
    const desc: ProviderActionDescriptor = r.actions[0].descriptor;
    assert.strictEqual(desc, 'VA_NUMBER');
  });

  it('payment_code action has descriptor PAYMENT_CODE', async () => {
    const r = await provider.createPayment({
      paymentIntentId: 'desc-payment-code',
      amount: 50000,
      currency: 'IDR',
      method: 'other',
      metadata: { scenario: 'payment_code' },
    });
    assert.strictEqual(r.actions.length, 1);
    const desc: ProviderActionDescriptor = r.actions[0].descriptor;
    assert.strictEqual(desc, 'PAYMENT_CODE');
  });

  it('immediate_success has no action (actions array empty)', async () => {
    const r = await provider.createPayment({
      paymentIntentId: 'desc-imm-success',
      amount: 50000,
      currency: 'IDR',
      method: 'qris',
      metadata: { scenario: 'immediate_success' },
    });
    assert.strictEqual(r.actions.length, 0);
  });

  it('immediate_failure has no action (actions array empty)', async () => {
    const r = await provider.createPayment({
      paymentIntentId: 'desc-imm-fail',
      amount: 50000,
      currency: 'IDR',
      method: 'qris',
      metadata: { scenario: 'immediate_failure' },
    });
    assert.strictEqual(r.actions.length, 0);
  });

  it('pending_expiry action has descriptor WEB_URL', async () => {
    const r = await provider.createPayment({
      paymentIntentId: 'desc-pending-expiry',
      amount: 50000,
      currency: 'IDR',
      method: 'qris',
      metadata: { scenario: 'pending_expiry' },
    });
    assert.strictEqual(r.actions.length, 1);
    const desc: ProviderActionDescriptor = r.actions[0].descriptor;
    assert.strictEqual(desc, 'WEB_URL');
  });

  it('all actions that have actions include label, value, and descriptor fields', async () => {
    const scenarios: FakeGatewayScenario[] = ['redirect', 'qris', 'va', 'payment_code', 'pending_expiry'];
    for (const scenario of scenarios) {
      const r = await provider.createPayment({
        paymentIntentId: `desc-all-${scenario}`,
        amount: 50000,
        currency: 'IDR',
        method: 'qris',
        metadata: { scenario },
      });
      for (const action of r.actions) {
        assert.ok(typeof action.label === 'string' && action.label.length > 0,
          `${scenario}: action.label must be a non-empty string`);
        assert.ok(typeof action.descriptor === 'string' && action.descriptor.length > 0,
          `${scenario}: action.descriptor must be a non-empty string`);
        assert.ok(
          ['WEB_URL', 'QR_STRING', 'VA_NUMBER', 'PAYMENT_CODE', 'NONE'].includes(action.descriptor),
          `${scenario}: action.descriptor "${action.descriptor}" is not a valid ProviderActionDescriptor`,
        );
      }
    }
  });
});

// ── Test suite 5: ProviderAction canonical type — redirect_customer ────────────

describe('Phase 6 Hardening — canonical action types', () => {
  const provider = new FakeGatewayProvider();

  it('redirect action uses canonical type redirect_customer (not deprecated redirect)', async () => {
    const r = await provider.createPayment({
      paymentIntentId: 'type-redirect',
      amount: 50000,
      currency: 'IDR',
      method: 'qris',
      metadata: { scenario: 'redirect' },
    });
    assert.strictEqual(r.actions[0].type, 'redirect_customer');
  });

  it('pending_expiry action uses canonical type redirect_customer', async () => {
    const r = await provider.createPayment({
      paymentIntentId: 'type-expiry',
      amount: 50000,
      currency: 'IDR',
      method: 'qris',
      metadata: { scenario: 'pending_expiry' },
    });
    assert.strictEqual(r.actions[0].type, 'redirect_customer');
  });

  it('qris action type is present_qr', async () => {
    const r = await provider.createPayment({
      paymentIntentId: 'type-qris',
      amount: 50000,
      currency: 'IDR',
      method: 'qris',
      metadata: { scenario: 'qris' },
    });
    assert.strictEqual(r.actions[0].type, 'present_qr');
  });

  it('va action type is display_code', async () => {
    const r = await provider.createPayment({
      paymentIntentId: 'type-va',
      amount: 50000,
      currency: 'IDR',
      method: 'bank_transfer',
      metadata: { scenario: 'va' },
    });
    assert.strictEqual(r.actions[0].type, 'display_code');
  });

  it('payment_code action type is display_code', async () => {
    const r = await provider.createPayment({
      paymentIntentId: 'type-pc',
      amount: 50000,
      currency: 'IDR',
      method: 'other',
      metadata: { scenario: 'payment_code' },
    });
    assert.strictEqual(r.actions[0].type, 'display_code');
  });
});

// ── Test suite 6: FakeGateway scenario behaviors (full) ───────────────────────

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

  it('redirect: has exactly one action of type redirect_customer', async () => {
    const r = await provider.createPayment(input('redirect'));
    assert.strictEqual(r.actions.length, 1);
    assert.strictEqual(r.actions[0].type, 'redirect_customer');
  });

  it('redirect: action has non-empty label and value (URL)', async () => {
    const r = await provider.createPayment(input('redirect'));
    const action = r.actions[0] as ProviderAction;
    assert.ok(action.label.length > 0);
    assert.ok((action.value ?? '').startsWith('https://'));
  });

  it('redirect: action descriptor is WEB_URL', async () => {
    const r = await provider.createPayment(input('redirect'));
    assert.strictEqual(r.actions[0].descriptor, 'WEB_URL');
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
    assert.ok((r.actions[0].value ?? '').startsWith('FAKE_QR:'));
  });

  it('qris: action descriptor is QR_STRING', async () => {
    const r = await provider.createPayment(input('qris'));
    assert.strictEqual(r.actions[0].descriptor, 'QR_STRING');
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
    const vaNumber = r.actions[0].value ?? '';
    assert.ok(/^\d+$/.test(vaNumber), `VA number "${vaNumber}" should be numeric`);
  });

  it('va: action descriptor is VA_NUMBER', async () => {
    const r = await provider.createPayment(input('va'));
    assert.strictEqual(r.actions[0].descriptor, 'VA_NUMBER');
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
    assert.ok((r.actions[0].value ?? '').startsWith('FAKE'));
  });

  it('payment_code: action descriptor is PAYMENT_CODE', async () => {
    const r = await provider.createPayment(input('payment_code'));
    assert.strictEqual(r.actions[0].descriptor, 'PAYMENT_CODE');
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

  it('immediate_success: providerReference is non-null (needed for lookup)', async () => {
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

  it('pending_expiry: has one redirect_customer action with expiresAt set', async () => {
    const r = await provider.createPayment(input('pending_expiry'));
    assert.strictEqual(r.actions.length, 1);
    assert.strictEqual(r.actions[0].type, 'redirect_customer');
    assert.ok(r.actions[0].expiresAt instanceof Date, 'action.expiresAt should be a Date');
  });

  it('pending_expiry: result expiresAt is approximately 15 minutes from now', async () => {
    const before = Date.now();
    const r = await provider.createPayment(input('pending_expiry'));
    const after = Date.now();
    const expiresAt = r.expiresAt instanceof Date ? r.expiresAt.getTime() : 0;
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

// ── Test suite 7: CreateGatewayPayment — Phase 6 scenario paths ───────────────

describe('CreateGatewayPayment — Phase 6 scenario paths', () => {

  it('requires_action scenario: transaction stored with status requires_action', async () => {
    const intent = makeIntent({ id: 'intent-p6-ra-1', tenantId: 'tenant-a' });
    const { useCase, txRepo } = makeFullUseCase(intent);

    await useCase.execute({
      tenantId: 'tenant-a',
      paymentIntentId: 'intent-p6-ra-1',
      amount: 100_000,
      method: 'qris',
      provider: 'fake_gateway',
      metadata: { scenario: 'redirect' },
    });

    const stored = txRepo._store();
    assert.strictEqual(stored.length, 1);
    assert.strictEqual(stored[0].status, 'requires_action');
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
    assert.ok(result.providerActions.length > 0, 'redirect scenario should have actions');
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
      metadata: { scenario: 'redirect' },
    });

    assert.strictEqual(result.immediateSuccess, false);
  });

  it('requires_action scenario: intent amountPaid remains 0 (no allocation)', async () => {
    const intent = makeIntent({ id: 'intent-p6-ra-4', tenantId: 'tenant-a' });
    const { useCase, allocationRepo } = makeFullUseCase(intent);

    await useCase.execute({
      tenantId: 'tenant-a',
      paymentIntentId: 'intent-p6-ra-4',
      amount: 100_000,
      method: 'qris',
      provider: 'fake_gateway',
      metadata: { scenario: 'redirect' },
    });

    assert.strictEqual(allocationRepo._store().length, 0, 'no allocation for requires_action');
  });

  // ── immediate_success direct settlement (Task 1 — lock-order fix) ─────────

  it('immediate_success: transaction created directly as succeeded (no two-step)', async () => {
    const intent = makeIntent({ id: 'intent-p6-is-1', tenantId: 'tenant-a' });
    const { useCase, txRepo } = makeFullUseCase(intent);

    await useCase.execute({
      tenantId: 'tenant-a',
      paymentIntentId: 'intent-p6-is-1',
      amount: 100_000,
      method: 'qris',
      provider: 'fake_gateway',
      metadata: { scenario: 'immediate_success' },
    });

    const stored = txRepo._store();
    assert.strictEqual(stored.length, 1, 'exactly one tx created');
    // Tx must be created as succeeded directly — NOT pending then updated
    assert.strictEqual(stored[0].status, 'succeeded');
  });

  it('immediate_success: succeededAt is populated on the created tx', async () => {
    const intent = makeIntent({ id: 'intent-p6-is-at', tenantId: 'tenant-a' });
    const { useCase, txRepo } = makeFullUseCase(intent);

    await useCase.execute({
      tenantId: 'tenant-a',
      paymentIntentId: 'intent-p6-is-at',
      amount: 100_000,
      method: 'qris',
      provider: 'fake_gateway',
      metadata: { scenario: 'immediate_success' },
    });

    const stored = txRepo._store();
    assert.ok(stored[0].succeededAt instanceof Date, 'succeededAt must be a Date on the created row');
  });

  it('immediate_success: allocation is created', async () => {
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

    assert.strictEqual(allocationRepo._store().length, 1, 'exactly one allocation created');
  });

  it('immediate_success: intent status becomes paid', async () => {
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

    assert.strictEqual(result.intent.status, 'paid', 'intent must become paid after immediate success');
  });

  it('immediate_success: idempotentReplay is false', async () => {
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

  it('immediate_success: immediateSuccess flag is true on output', async () => {
    const intent = makeIntent({ id: 'intent-p6-is-5', tenantId: 'tenant-a' });
    const { useCase } = makeFullUseCase(intent);

    const result = await useCase.execute({
      tenantId: 'tenant-a',
      paymentIntentId: 'intent-p6-is-5',
      amount: 100_000,
      method: 'qris',
      provider: 'fake_gateway',
      metadata: { scenario: 'immediate_success' },
    });

    assert.strictEqual(result.immediateSuccess, true);
  });

  it('immediate_success: exactly one tx row in store (no extra pending row)', async () => {
    const intent = makeIntent({ id: 'intent-p6-is-6', tenantId: 'tenant-a' });
    const { useCase, txRepo } = makeFullUseCase(intent);

    await useCase.execute({
      tenantId: 'tenant-a',
      paymentIntentId: 'intent-p6-is-6',
      amount: 100_000,
      method: 'qris',
      provider: 'fake_gateway',
      metadata: { scenario: 'immediate_success' },
    });

    // Must be 1 tx, not 2 (old code created pending then updated to succeeded)
    assert.strictEqual(txRepo._store().length, 1);
  });

  // ── immediate_failure ─────────────────────────────────────────────────────

  it('immediate_failure scenario: transaction stored as failed', async () => {
    const intent = makeIntent({ id: 'intent-p6-if-1', tenantId: 'tenant-a' });
    const { useCase, txRepo } = makeFullUseCase(intent);

    await useCase.execute({
      tenantId: 'tenant-a',
      paymentIntentId: 'intent-p6-if-1',
      amount: 100_000,
      method: 'qris',
      provider: 'fake_gateway',
      metadata: { scenario: 'immediate_failure' },
    });

    const stored = txRepo._store();
    assert.strictEqual(stored.length, 1);
    assert.strictEqual(stored[0].status, 'failed');
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

    assert.strictEqual(allocationRepo._store().length, 0);
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

    const stored = txRepo._store();
    assert.ok(
      typeof stored[0].failureReason === 'string' && stored[0].failureReason.length > 0,
      'failureReason must be a non-empty string for immediate_failure',
    );
  });

  // ── pending_expiry ────────────────────────────────────────────────────────

  it('pending_expiry scenario: transaction stored as requires_action', async () => {
    const intent = makeIntent({ id: 'intent-p6-pe-1', tenantId: 'tenant-a' });
    const { useCase, txRepo } = makeFullUseCase(intent);

    await useCase.execute({
      tenantId: 'tenant-a',
      paymentIntentId: 'intent-p6-pe-1',
      amount: 100_000,
      method: 'qris',
      provider: 'fake_gateway',
      metadata: { scenario: 'pending_expiry' },
    });

    const stored = txRepo._store();
    assert.strictEqual(stored[0].status, 'requires_action');
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

    const actionsWithExpiry = result.providerActions.filter(a => a.expiresAt instanceof Date);
    assert.ok(actionsWithExpiry.length > 0, 'pending_expiry should have at least one action with expiresAt');
  });

  // ── default (backward compat) ─────────────────────────────────────────────

  it('default scenario (no metadata): transaction stored as pending (backward compat)', async () => {
    const intent = makeIntent({ id: 'intent-p6-def-1', tenantId: 'tenant-a' });
    const { useCase, txRepo } = makeFullUseCase(intent);

    await useCase.execute({
      tenantId: 'tenant-a',
      paymentIntentId: 'intent-p6-def-1',
      amount: 100_000,
      method: 'qris',
      provider: 'fake_gateway',
      // no metadata / no scenario
    });

    const stored = txRepo._store();
    assert.strictEqual(stored[0].status, 'pending');
  });

  // ── missing deps guard ────────────────────────────────────────────────────

  it('immediate_success without allocationRepo/recalculate throws IMMEDIATE_SUCCESS_NOT_CONFIGURED', async () => {
    const intent = makeIntent({ id: 'intent-p6-nd-1', tenantId: 'tenant-a' });

    // Construct use case with only 4 args (no allocationRepo or recalculate)
    const fakeDb = makeFakeDb();
    const intentRepo = makeFakeIntentRepo(intent);
    const txRepo = makeFakeTxRepo();
    const registry = new PaymentProviderRegistry().register(new FakeGatewayProvider());

    const useCase = new CreateGatewayPayment(
      fakeDb as any,
      intentRepo as any,
      txRepo as any,
      registry,
      // 5th arg (allocationRepo) omitted
      // 6th arg (recalculate) omitted
    );

    await assert.rejects(
      () => useCase.execute({
        tenantId: 'tenant-a',
        paymentIntentId: 'intent-p6-nd-1',
        amount: 100_000,
        method: 'qris',
        provider: 'fake_gateway',
        metadata: { scenario: 'immediate_success' },
      }),
      (err: any) => {
        assert.ok(err instanceof PaymentPolicyError, 'should throw PaymentPolicyError');
        assert.strictEqual(err.code, 'IMMEDIATE_SUCCESS_NOT_CONFIGURED');
        return true;
      },
    );
  });
});

// ── Test suite 8: ProviderAccountConfig — credentialsRef, no raw credentials ──

describe('ProviderAccountConfig type', () => {

  it('accepts a fully-typed config object with credentialsRef', () => {
    const config: ProviderAccountConfig = {
      provider: 'fake_gateway',
      tenantId: 'tenant-demo',
      merchantId: 'merchant-001',
      environment: 'sandbox',
      credentialsRef: 'FAKE_GATEWAY_TENANT_DEMO_CREDENTIALS',
      publicConfig: { clientKey: 'pk_test_abc123' },
      capabilitiesOverride: { supportsPartialRefund: false },
      metadata: { timeoutMs: 10000 },
    };
    assert.strictEqual(config.provider, 'fake_gateway');
    assert.strictEqual(config.environment, 'sandbox');
    assert.strictEqual(config.credentialsRef, 'FAKE_GATEWAY_TENANT_DEMO_CREDENTIALS');
    assert.ok(!('credentials' in config), 'ProviderAccountConfig must NOT have a raw credentials field');
  });

  it('optional fields can be omitted — only provider and environment are required', () => {
    const config: ProviderAccountConfig = {
      provider: 'manual',
      environment: 'test',
    };
    assert.strictEqual(config.tenantId, undefined);
    assert.strictEqual(config.merchantId, undefined);
    assert.strictEqual(config.credentialsRef, undefined);
    assert.strictEqual(config.publicConfig, undefined);
    assert.strictEqual(config.capabilitiesOverride, undefined);
    assert.strictEqual(config.metadata, undefined);
  });

  it('environment field accepts sandbox, production, and test values', () => {
    const environments: ProviderAccountConfig['environment'][] = ['sandbox', 'production', 'test'];
    for (const environment of environments) {
      const config: ProviderAccountConfig = { provider: 'fake_gateway', environment };
      assert.strictEqual(config.environment, environment);
    }
  });
});

// ── Test suite 9: FakeGateway cancel/refund messages — no stale Phase 4 text ──

describe('Phase 6 Hardening — FakeGateway cancel/refund message cleanup', () => {
  const provider = new FakeGatewayProvider();

  it('cancelPayment returns success:false (not supported at provider level)', async () => {
    const result = await provider.cancelPayment({ providerReference: 'fake_ref_cancel' });
    assert.strictEqual(result.success, false);
    assert.ok(typeof result.failureReason === 'string' && result.failureReason.length > 0);
  });

  it('cancelPayment failureReason mentions VoidPaymentTransaction (Phase 4)', async () => {
    const result = await provider.cancelPayment({ providerReference: 'fake_ref_cancel' });
    assert.ok(
      result.failureReason!.includes('VoidPaymentTransaction'),
      'cancel message should reference VoidPaymentTransaction use case',
    );
  });

  it('cancelPayment failureReason does NOT say "planned for Phase 4" or "Implement in Phase 4"', async () => {
    const result = await provider.cancelPayment({ providerReference: 'fake_ref_cancel' });
    assert.ok(
      !result.failureReason!.includes('planned for Phase 4'),
      'stale "planned for Phase 4" text should be removed',
    );
    assert.ok(
      !result.failureReason!.includes('Implement in Phase 4'),
      'stale "Implement in Phase 4" text should be removed',
    );
  });

  it('cancelPayment message mentions future gateway adapter phase', async () => {
    const result = await provider.cancelPayment({ providerReference: 'fake_ref_cancel' });
    assert.ok(
      result.failureReason!.toLowerCase().includes('future') ||
      result.failureReason!.toLowerCase().includes('adapter'),
      'cancel message should mention a future provider adapter phase',
    );
  });

  it('refundPayment returns success:false (not supported at provider level)', async () => {
    const result = await provider.refundPayment({ providerReference: 'fake_ref_refund', amount: 5000 });
    assert.strictEqual(result.success, false);
    assert.ok(typeof result.failureReason === 'string' && result.failureReason.length > 0);
  });

  it('refundPayment failureReason mentions RefundPaymentTransaction (Phase 4)', async () => {
    const result = await provider.refundPayment({ providerReference: 'fake_ref_refund', amount: 5000 });
    assert.ok(
      result.failureReason!.includes('RefundPaymentTransaction'),
      'refund message should reference RefundPaymentTransaction use case',
    );
  });

  it('refundPayment failureReason does NOT say "planned for Phase 4" or "Implement in Phase 4"', async () => {
    const result = await provider.refundPayment({ providerReference: 'fake_ref_refund', amount: 5000 });
    assert.ok(
      !result.failureReason!.includes('planned for Phase 4'),
      'stale "planned for Phase 4" text should be removed',
    );
    assert.ok(
      !result.failureReason!.includes('Implement in Phase 4'),
      'stale "Implement in Phase 4" text should be removed',
    );
  });
});

// ── Test suite 10: Phase 2 regression ────────────────────────────────────────

describe('Phase 2 regression — default scenario still works', () => {

  it('FakeGatewayProvider default createPayment returns non-null providerReference, URL, QR', async () => {
    const provider = new FakeGatewayProvider();
    const result = await provider.createPayment({
      paymentIntentId: 'intent-reg-p2',
      amount: 50000,
      currency: 'IDR',
      method: 'qris',
    });
    assert.ok(result.providerReference !== null, 'providerReference must be non-null');
    assert.ok(result.providerPaymentUrl !== null, 'providerPaymentUrl must be non-null');
    assert.ok(result.providerQrString !== null, 'providerQrString must be non-null');
  });

  it('ManualProvider createPayment has status succeeded (Phase 6 field)', async () => {
    const provider = new ManualProvider();
    const result = await provider.createPayment({
      paymentIntentId: 'intent-reg-manual',
      amount: 50000,
      currency: 'IDR',
      method: 'qris',
    });
    assert.strictEqual(result.status, 'succeeded');
  });
});
