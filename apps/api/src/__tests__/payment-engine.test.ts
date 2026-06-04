/**
 * Payment Engine Phase 1 Tests
 *
 * Tests domain policy logic (pure unit tests) and use case orchestration
 * using in-memory fakes — no real DB required.
 */

import '../../register-paths';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

process.env.DATABASE_URL ||= 'postgres://user:pass@127.0.0.1:5432/aurapos_test';
process.env.BETTER_AUTH_SECRET ||= 'test-secret-with-at-least-32-characters-ok';

// ── Domain policy helpers under test ─────────────────────────────────────────
import {
  assertIntentAcceptsPayment,
  assertAmountValid,
  calculateCashChange,
  calculateIntentStatus,
  aggregateTransactionTotals,
  PaymentPolicyError,
} from '@pos/domain/payments';
import type { DomainPaymentIntent, DomainPaymentTransaction } from '@pos/domain/payments';

// ── Use cases under test ──────────────────────────────────────────────────────
import { CreatePaymentIntent } from '@pos/application/payments/CreatePaymentIntent';
import { GetPaymentIntent } from '@pos/application/payments/GetPaymentIntent';
import { ListPaymentTransactions } from '@pos/application/payments/ListPaymentTransactions';
import { RecalculatePaymentIntent } from '@pos/application/payments/RecalculatePaymentIntent';

// ── Fakes ─────────────────────────────────────────────────────────────────────

let intentIdSeq = 0;
let txIdSeq = 0;
let allocIdSeq = 0;

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

function makeTx(overrides: Partial<DomainPaymentTransaction> = {}): DomainPaymentTransaction {
  return {
    id: `tx-${++txIdSeq}`,
    tenantId: 'tenant-a',
    paymentIntentId: 'intent-1',
    direction: 'incoming',
    transactionType: 'payment',
    method: 'cash',
    provider: 'manual',
    status: 'succeeded',
    amount: 100000,
    receivedAmount: null,
    changeAmount: null,
    providerReference: null,
    providerPaymentUrl: null,
    providerQrString: null,
    failureReason: null,
    idempotencyKey: null,
    metadata: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    succeededAt: new Date(),
    failedAt: null,
    cancelledAt: null,
    ...overrides,
  };
}

// Minimal in-memory intent repo
function makeIntentRepo(initial: Record<string, any> = {}) {
  const store: Record<string, any> = { ...initial };

  return {
    async create(data: any) {
      const row = { id: `intent-${++intentIdSeq}`, ...data };
      // convert numeric strings for domain mapping
      store[row.id] = row;
      return row;
    },
    async findById(id: string, tenantId: string) {
      const row = store[id];
      if (!row || row.tenantId !== tenantId) return null;
      return row;
    },
    async findByIdempotencyKey(tenantId: string, key: string) {
      return Object.values(store).find((r: any) => r.tenantId === tenantId && r.idempotencyKey === key) ?? null;
    },
    async lockForUpdate(id: string, tenantId: string, _tx: any) {
      return this.findById(id, tenantId);
    },
    async update(id: string, tenantId: string, data: any) {
      if (!store[id] || store[id].tenantId !== tenantId) throw new Error('not found');
      store[id] = { ...store[id], ...data };
      return store[id];
    },
    store,
  };
}

// Minimal in-memory transaction repo
function makeTxRepo(initial: any[] = []) {
  const store: any[] = [...initial];

  return {
    async create(data: any) {
      const row = { id: `tx-${++txIdSeq}`, ...data };
      store.push(row);
      return row;
    },
    async findById(id: string, tenantId: string) {
      return store.find((r) => r.id === id && r.tenantId === tenantId) ?? null;
    },
    async findByIntentId(intentId: string, tenantId: string) {
      return store.filter((r) => r.paymentIntentId === intentId && r.tenantId === tenantId);
    },
    async findByIdempotencyKey(tenantId: string, key: string) {
      return store.find((r) => r.tenantId === tenantId && r.idempotencyKey === key) ?? null;
    },
    store,
  };
}

// ── 1. Create intent initializes totals correctly ─────────────────────────────
describe('CreatePaymentIntent', () => {
  it('initializes totals correctly', async () => {
    const intentRepo = makeIntentRepo();
    const useCase = new CreatePaymentIntent(intentRepo as any);

    const { intent, idempotentReplay } = await useCase.execute({
      tenantId: 'tenant-a',
      payableType: 'order',
      payableId: 'order-1',
      amountDue: 150000,
      currency: 'IDR',
      allowPartial: false,
    });

    assert.equal(idempotentReplay, false);
    assert.equal(intent.amountDue, 150000);
    assert.equal(intent.amountPaid, 0);
    assert.equal(intent.amountRefunded, 0);
    assert.equal(intent.amountRemaining, 150000);
    assert.equal(intent.status, 'requires_payment');
    assert.equal(intent.currency, 'IDR');
    assert.equal(intent.allowPartial, false);
  });

  // ── 2. Idempotency replays existing intent ──────────────────────────────────
  it('idempotency replays existing intent without creating duplicate', async () => {
    const intentRepo = makeIntentRepo();
    const useCase = new CreatePaymentIntent(intentRepo as any);

    const first = await useCase.execute({
      tenantId: 'tenant-a',
      payableType: 'order',
      payableId: 'order-2',
      amountDue: 50000,
      idempotencyKey: 'idem-key-001',
    });

    const second = await useCase.execute({
      tenantId: 'tenant-a',
      payableType: 'order',
      payableId: 'order-2',
      amountDue: 50000,
      idempotencyKey: 'idem-key-001',
    });

    assert.equal(first.idempotentReplay, false);
    assert.equal(second.idempotentReplay, true);
    assert.equal(second.intent.id, first.intent.id);
    assert.equal(Object.keys(intentRepo.store).length, 1);
  });

  it('rejects amount_due of zero', async () => {
    const intentRepo = makeIntentRepo();
    const useCase = new CreatePaymentIntent(intentRepo as any);

    await assert.rejects(
      () => useCase.execute({ tenantId: 'tenant-a', payableType: 'order', payableId: 'x', amountDue: 0 }),
      /greater than zero/
    );
  });
});

// ── 3-8. Domain policy unit tests ────────────────────────────────────────────
describe('PaymentPolicy', () => {
  // ── 3. Full cash payment marks intent as paid ──────────────────────────────
  it('calculateIntentStatus: paid when remaining is zero', () => {
    const status = calculateIntentStatus(100000, 100000, 0, 0);
    assert.equal(status, 'paid');
  });

  // ── 4. Partial payment marks intent as partially_paid ─────────────────────
  it('calculateIntentStatus: partially_paid when amount_paid > 0 and remaining > 0', () => {
    const status = calculateIntentStatus(100000, 40000, 0, 60000);
    assert.equal(status, 'partially_paid');
  });

  // ── 5. Partial payment rejected when allowPartial is false ────────────────
  it('assertAmountValid: rejects partial payment when allowPartial is false', () => {
    assert.throws(
      () => assertAmountValid(30000, 100000, false),
      (err: any) => err instanceof PaymentPolicyError && err.code === 'PARTIAL_NOT_ALLOWED'
    );
  });

  // ── 6. Cash receivedAmount > amount calculates changeAmount ───────────────
  it('calculateCashChange: computes correct change for cash overpayment', () => {
    const change = calculateCashChange('cash', 50000, 100000);
    assert.equal(change, 50000);
  });

  // ── 7. Non-cash overpayment is rejected ───────────────────────────────────
  it('calculateCashChange: rejects non-cash receivedAmount > amount', () => {
    assert.throws(
      () => calculateCashChange('qris', 50000, 100000),
      (err: any) => err instanceof PaymentPolicyError && err.code === 'NON_CASH_OVERPAYMENT'
    );
    assert.throws(
      () => calculateCashChange('card', 50000, 100000),
      (err: any) => err instanceof PaymentPolicyError && err.code === 'NON_CASH_OVERPAYMENT'
    );
  });

  it('assertAmountValid: rejects amount exceeding remaining balance', () => {
    assert.throws(
      () => assertAmountValid(200000, 100000, true),
      (err: any) => err instanceof PaymentPolicyError && err.code === 'AMOUNT_EXCEEDS_REMAINING'
    );
  });

  it('assertIntentAcceptsPayment: rejects terminal statuses', () => {
    const terminalStatuses = ['paid', 'cancelled', 'expired', 'refunded', 'overpaid'];
    for (const status of terminalStatuses) {
      assert.throws(
        () => assertIntentAcceptsPayment(makeIntent({ status: status as any })),
        (err: any) => err instanceof PaymentPolicyError && err.code === 'INTENT_NOT_PAYABLE'
      );
    }
  });
});

// ── 8. Duplicate manual payment idempotency ───────────────────────────────────
describe('aggregateTransactionTotals', () => {
  it('only counts succeeded incoming transactions', () => {
    const txs: DomainPaymentTransaction[] = [
      makeTx({ status: 'succeeded', direction: 'incoming', transactionType: 'payment', amount: 60000 }),
      makeTx({ status: 'failed', direction: 'incoming', transactionType: 'payment', amount: 40000 }),
      makeTx({ status: 'succeeded', direction: 'outgoing', transactionType: 'refund', amount: 10000 }),
    ];
    const { amountPaid, amountRefunded } = aggregateTransactionTotals(txs);
    assert.equal(amountPaid, 60000);
    assert.equal(amountRefunded, 10000);
  });

  it('ignores voided/cancelled transactions', () => {
    const txs: DomainPaymentTransaction[] = [
      makeTx({ status: 'voided', direction: 'incoming', transactionType: 'payment', amount: 100000 }),
    ];
    const { amountPaid } = aggregateTransactionTotals(txs);
    assert.equal(amountPaid, 0);
  });
});

// ── 9. ListPaymentTransactions is tenant-scoped ───────────────────────────────
describe('ListPaymentTransactions', () => {
  it('only returns transactions for the correct tenant', async () => {
    const intentA = { id: 'intent-100', tenantId: 'tenant-a', amountDue: '100000', amountPaid: '0', amountRefunded: '0', amountRemaining: '100000', status: 'requires_payment', allowPartial: false, currency: 'IDR', payableType: 'order', payableId: 'o1', outletId: null, expiresAt: null, metadata: null, idempotencyKey: null, createdAt: new Date(), updatedAt: new Date() };
    const intentRepo = makeIntentRepo({ 'intent-100': intentA });

    const txStore: any[] = [
      { id: 'tx-100', tenantId: 'tenant-a', paymentIntentId: 'intent-100', direction: 'incoming', transactionType: 'payment', method: 'cash', provider: 'manual', status: 'succeeded', amount: '100000', receivedAmount: null, changeAmount: null, providerReference: null, providerPaymentUrl: null, providerQrString: null, failureReason: null, idempotencyKey: null, metadata: null, createdAt: new Date(), updatedAt: new Date(), succeededAt: new Date(), failedAt: null, cancelledAt: null },
      { id: 'tx-101', tenantId: 'tenant-b', paymentIntentId: 'intent-100', direction: 'incoming', transactionType: 'payment', method: 'cash', provider: 'manual', status: 'succeeded', amount: '50000', receivedAmount: null, changeAmount: null, providerReference: null, providerPaymentUrl: null, providerQrString: null, failureReason: null, idempotencyKey: null, metadata: null, createdAt: new Date(), updatedAt: new Date(), succeededAt: new Date(), failedAt: null, cancelledAt: null },
    ];
    const txRepo = makeTxRepo(txStore);

    const useCase = new ListPaymentTransactions(intentRepo as any, txRepo as any);
    const { transactions } = await useCase.execute({ tenantId: 'tenant-a', intentId: 'intent-100' });

    assert.equal(transactions.length, 1);
    assert.equal(transactions[0].tenantId, 'tenant-a');
  });
});

// ── 10. Tenant A cannot access Tenant B intent ────────────────────────────────
describe('GetPaymentIntent', () => {
  it('tenant isolation: tenant A cannot read tenant B intent', async () => {
    const intentB = { id: 'intent-200', tenantId: 'tenant-b', amountDue: '200000', amountPaid: '0', amountRefunded: '0', amountRemaining: '200000', status: 'requires_payment', allowPartial: false, currency: 'IDR', payableType: 'order', payableId: 'o2', outletId: null, expiresAt: null, metadata: null, idempotencyKey: null, createdAt: new Date(), updatedAt: new Date() };
    const intentRepo = makeIntentRepo({ 'intent-200': intentB });
    const useCase = new GetPaymentIntent(intentRepo as any);

    await assert.rejects(
      () => useCase.execute({ tenantId: 'tenant-a', intentId: 'intent-200' }),
      /not found/
    );
  });
});

// ── RecalculatePaymentIntent ──────────────────────────────────────────────────
describe('RecalculatePaymentIntent', () => {
  it('marks intent as paid when all transactions sum up to amount_due', async () => {
    const intentRow = { id: 'intent-300', tenantId: 'tenant-a', amountDue: '80000', amountPaid: '0', amountRefunded: '0', amountRemaining: '80000', status: 'requires_payment', allowPartial: false, currency: 'IDR', payableType: 'order', payableId: 'o3', outletId: null, expiresAt: null, metadata: null, idempotencyKey: null, createdAt: new Date(), updatedAt: new Date() };
    const intentRepo = makeIntentRepo({ 'intent-300': intentRow });
    const txRows = [
      { id: 'tx-300', tenantId: 'tenant-a', paymentIntentId: 'intent-300', direction: 'incoming', transactionType: 'payment', method: 'cash', provider: 'manual', status: 'succeeded', amount: '80000', receivedAmount: null, changeAmount: null, providerReference: null, providerPaymentUrl: null, providerQrString: null, failureReason: null, idempotencyKey: null, metadata: null, createdAt: new Date(), updatedAt: new Date(), succeededAt: new Date(), failedAt: null, cancelledAt: null },
    ];
    const txRepo = makeTxRepo(txRows);

    const useCase = new RecalculatePaymentIntent(intentRepo as any, txRepo as any);
    const { intent } = await useCase.execute({ tenantId: 'tenant-a', intentId: 'intent-300' });

    assert.equal(intent.status, 'paid');
    assert.equal(intent.amountPaid, 80000);
    assert.equal(intent.amountRemaining, 0);
  });

  it('marks intent as partially_paid when partial payment made', async () => {
    const intentRow = { id: 'intent-301', tenantId: 'tenant-a', amountDue: '100000', amountPaid: '0', amountRefunded: '0', amountRemaining: '100000', status: 'requires_payment', allowPartial: true, currency: 'IDR', payableType: 'order', payableId: 'o4', outletId: null, expiresAt: null, metadata: null, idempotencyKey: null, createdAt: new Date(), updatedAt: new Date() };
    const intentRepo = makeIntentRepo({ 'intent-301': intentRow });
    const txRows = [
      { id: 'tx-301', tenantId: 'tenant-a', paymentIntentId: 'intent-301', direction: 'incoming', transactionType: 'payment', method: 'cash', provider: 'manual', status: 'succeeded', amount: '40000', receivedAmount: null, changeAmount: null, providerReference: null, providerPaymentUrl: null, providerQrString: null, failureReason: null, idempotencyKey: null, metadata: null, createdAt: new Date(), updatedAt: new Date(), succeededAt: new Date(), failedAt: null, cancelledAt: null },
    ];
    const txRepo = makeTxRepo(txRows);

    const useCase = new RecalculatePaymentIntent(intentRepo as any, txRepo as any);
    const { intent } = await useCase.execute({ tenantId: 'tenant-a', intentId: 'intent-301' });

    assert.equal(intent.status, 'partially_paid');
    assert.equal(intent.amountPaid, 40000);
    assert.equal(intent.amountRemaining, 60000);
  });
});
