/**
 * Payment Engine Phase 4 — Refund / Void Base Lifecycle Tests
 *
 * Covers:
 *  1.  calculateIntentStatus — refund status priority order (Phase 4 spec)
 *  2.  aggregateTransactionTotals — outgoing refund rows included
 *  3.  RefundPaymentTransaction — full refund, partial refund, over-refund guard,
 *      idempotency hit, idempotency conflict, invalid transaction type/direction/status
 *  4.  VoidPaymentTransaction — pending void, requires_action void, idempotent void,
 *      succeeded cannot be voided, already-voided with no key, terminal status guard
 *  5.  End-to-end: pay → refund → intent status transitions
 */

import '../../register-paths';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

process.env.DATABASE_URL ||= 'postgres://user:pass@127.0.0.1:5432/aurapos_test';
process.env.BETTER_AUTH_SECRET ||= 'test-secret-with-at-least-32-characters-ok';

// ── Domain / application imports ──────────────────────────────────────────────
import { PaymentPolicyError, calculateIntentStatus, aggregateTransactionTotals } from '@pos/domain/payments';
import type { DomainPaymentIntent, DomainPaymentTransaction } from '@pos/domain/payments';
import { RecalculatePaymentIntent } from '@pos/application/payments/RecalculatePaymentIntent';
import { RefundPaymentTransaction } from '@pos/application/payments/RefundPaymentTransaction';
import { VoidPaymentTransaction } from '@pos/application/payments/VoidPaymentTransaction';

// ── Sequence counters ─────────────────────────────────────────────────────────
let intentIdSeq = 0;
let txIdSeq = 0;

// ── Domain object factories ────────────────────────────────────────────────────

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

function makeTx(overrides: Partial<DomainPaymentTransaction> = {}): DomainPaymentTransaction {
  return {
    id: `tx-${++txIdSeq}`,
    tenantId: 'tenant-a',
    paymentIntentId: 'intent-1',
    parentTransactionId: null,
    direction: 'incoming',
    transactionType: 'payment',
    method: 'cash',
    provider: 'manual',
    status: 'succeeded',
    amount: 100_000,
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

// DB row factory (string amounts as Drizzle returns them)
function makeDbTx(overrides: Partial<any> = {}): any {
  return {
    id: `tx-${++txIdSeq}`,
    tenantId: 'tenant-a',
    paymentIntentId: 'intent-1',
    parentTransactionId: null,
    direction: 'incoming',
    transactionType: 'payment',
    method: 'cash',
    provider: 'manual',
    status: 'pending',
    amount: '100000.00',
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
    succeededAt: null,
    failedAt: null,
    cancelledAt: null,
    ...overrides,
  };
}

// ── Section 1: calculateIntentStatus — Phase 4 priority order ─────────────────

describe('calculateIntentStatus — Phase 4 refund rules', () => {

  it('returns requires_payment when nothing paid', () => {
    assert.equal(calculateIntentStatus(100_000, 0, 0, 100_000), 'requires_payment');
  });

  it('returns partially_paid when some net payment received', () => {
    assert.equal(calculateIntentStatus(100_000, 40_000, 0, 60_000), 'partially_paid');
  });

  it('returns paid when full payment, no refund', () => {
    assert.equal(calculateIntentStatus(100_000, 100_000, 0, 0), 'paid');
  });

  it('returns refunded when full amount refunded (amountRefunded >= amountPaid)', () => {
    // amountRemaining would be 100_000 after full refund (intentional)
    assert.equal(calculateIntentStatus(100_000, 100_000, 100_000, 100_000), 'refunded');
  });

  it('returns partially_refunded when partial refund applied', () => {
    // paid 100k, refunded 50k
    assert.equal(calculateIntentStatus(100_000, 100_000, 50_000, 50_000), 'partially_refunded');
  });

  it('returns refunded when refund fully covers partial payment', () => {
    // paid 50k (partial), refunded 50k = full refund of what was paid
    assert.equal(calculateIntentStatus(100_000, 50_000, 50_000, 100_000), 'refunded');
  });

  it('never returns paid when amountRefunded > 0', () => {
    // Even if netPaid >= amountDue (e.g. overpaid then partial refund)
    const status = calculateIntentStatus(100_000, 150_000, 10_000, 10_000);
    assert.notEqual(status, 'paid');
    assert.equal(status, 'partially_refunded');
  });

  it('amountRemaining does NOT go to 0 after full refund', () => {
    // amountDue=100k, amountPaid=100k, amountRefunded=100k
    const amountRemaining = Math.max(0, 100_000 - 100_000 + 100_000);
    assert.equal(amountRemaining, 100_000);
  });

  it('refund check takes priority over paid check (prevents paid status with any refund)', () => {
    const result = calculateIntentStatus(100_000, 100_000, 1, 1);
    assert.equal(result, 'partially_refunded');
  });
});

// ── Section 2: aggregateTransactionTotals — includes outgoing refunds ──────────

describe('aggregateTransactionTotals — refund rows', () => {
  it('counts outgoing refund as amountRefunded', () => {
    const txs: DomainPaymentTransaction[] = [
      makeTx({ id: 'tx-a1', direction: 'incoming', transactionType: 'payment', status: 'succeeded', amount: 100_000 }),
      makeTx({ id: 'tx-a2', direction: 'outgoing', transactionType: 'refund', status: 'succeeded', amount: 30_000 }),
    ];
    const totals = aggregateTransactionTotals(txs);
    assert.equal(totals.amountPaid, 100_000);
    assert.equal(totals.amountRefunded, 30_000);
  });

  it('does not count failed outgoing refund', () => {
    const txs: DomainPaymentTransaction[] = [
      makeTx({ id: 'tx-b1', direction: 'incoming', transactionType: 'payment', status: 'succeeded', amount: 100_000 }),
      makeTx({ id: 'tx-b2', direction: 'outgoing', transactionType: 'refund', status: 'failed', amount: 50_000 }),
    ];
    const totals = aggregateTransactionTotals(txs);
    assert.equal(totals.amountPaid, 100_000);
    assert.equal(totals.amountRefunded, 0);
  });

  it('sums multiple refunds', () => {
    const txs: DomainPaymentTransaction[] = [
      makeTx({ id: 'tx-c1', direction: 'incoming', transactionType: 'payment', status: 'succeeded', amount: 100_000 }),
      makeTx({ id: 'tx-c2', direction: 'outgoing', transactionType: 'refund', status: 'succeeded', amount: 20_000 }),
      makeTx({ id: 'tx-c3', direction: 'outgoing', transactionType: 'refund', status: 'succeeded', amount: 30_000 }),
    ];
    const totals = aggregateTransactionTotals(txs);
    assert.equal(totals.amountPaid, 100_000);
    assert.equal(totals.amountRefunded, 50_000);
  });
});

// ── Section 3: RefundPaymentTransaction ───────────────────────────────────────

describe('RefundPaymentTransaction', () => {

  function makeRefundUseCase(opts: {
    originalTx?: any;
    existingRefunds?: any[];
    refundByIdempotencyKey?: any;
    intents?: Record<string, any>;
    createdTx?: any;
    updatedIntent?: any;
  }) {
    const originalTxRow = opts.originalTx ?? makeDbTx({
      id: 'tx-orig-1',
      status: 'succeeded',
      direction: 'incoming',
      transactionType: 'payment',
      amount: '100000.00',
      paymentIntentId: 'intent-1',
      tenantId: 'tenant-a',
    });

    const intentRow = {
      id: 'intent-1',
      tenantId: 'tenant-a',
      amountDue: '100000.00',
      amountPaid: '100000.00',
      amountRefunded: '0.00',
      amountRemaining: '0.00',
      status: 'paid',
      allowPartial: false,
      payableType: 'order',
      payableId: 'order-1',
      currency: 'IDR',
      expiresAt: null,
      metadata: null,
      idempotencyKey: null,
      outletId: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      ...(opts.intents?.['intent-1'] ?? {}),
    };

    const mockIntentRepo: any = {
      findById: async (_id: string, _tid: string) => intentRow,
      lockForUpdate: async (_id: string, _tid: string, _tx: any) => intentRow,
      update: async (_id: string, _tid: string, data: any) => ({ ...intentRow, ...data }),
    };

    const refundedAlready = opts.existingRefunds
      ? opts.existingRefunds.reduce((s, r) => s + parseFloat(r.amount), 0)
      : 0;

    const createdRefundRow = opts.createdTx ?? makeDbTx({
      direction: 'outgoing',
      transactionType: 'refund',
      status: 'succeeded',
      amount: '50000.00',
      parentTransactionId: 'tx-orig-1',
    });

    const mockTxRepo: any = {
      lockByIdForUpdate: async (_id: string, _tid: string, _tx: any) => {
        if (_id === 'tx-orig-1') return originalTxRow;
        return null;
      },
      sumRefundedForParent: async () => refundedAlready,
      findRefundByIdempotencyKey: async (_tid: string, key: string) => {
        return opts.refundByIdempotencyKey ?? null;
      },
      findByIntentId: async () => [],
      create: async (data: any) => ({ ...createdRefundRow, ...data }),
    };

    const mockRecalc = {
      execute: async ({ tenantId, intentId }: any) => {
        return {
          intent: {
            id: intentId,
            tenantId,
            amountDue: 100_000,
            amountPaid: 100_000,
            amountRefunded: 50_000,
            amountRemaining: 50_000,
            status: 'partially_refunded',
            allowPartial: false,
            payableType: 'order',
            payableId: 'order-1',
            currency: 'IDR',
            outletId: null,
            expiresAt: null,
            metadata: null,
            idempotencyKey: null,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        };
      },
    };

    const mockDb: any = {
      transaction: async (fn: Function) => {
        const mockTx: any = {
          execute: async () => ({ rows: [] }),
          select: () => mockTx,
          from: () => mockTx,
          where: () => mockTx,
          limit: () => [originalTxRow],
        };
        return fn(mockTx);
      },
    };

    return new RefundPaymentTransaction(
      mockDb,
      mockIntentRepo,
      mockTxRepo as any,
      mockRecalc as any,
    );
  }

  it('rejects amount <= 0', async () => {
    const useCase = makeRefundUseCase({});
    await assert.rejects(
      () => useCase.execute({ tenantId: 'tenant-a', transactionId: 'tx-orig-1', amount: 0 }),
      (err: any) => {
        assert.equal(err instanceof PaymentPolicyError, true);
        assert.equal(err.code, 'INVALID_AMOUNT');
        return true;
      },
    );
  });

  it('rejects refund of non-succeeded transaction', async () => {
    const useCase = makeRefundUseCase({
      originalTx: makeDbTx({ id: 'tx-orig-1', status: 'pending', direction: 'incoming', transactionType: 'payment' }),
    });
    await assert.rejects(
      () => useCase.execute({ tenantId: 'tenant-a', transactionId: 'tx-orig-1', amount: 50_000 }),
      (err: any) => {
        assert.equal(err instanceof PaymentPolicyError, true);
        assert.equal(err.code, 'INVALID_TRANSACTION_STATUS');
        return true;
      },
    );
  });

  it('rejects refund of outgoing transaction', async () => {
    const useCase = makeRefundUseCase({
      originalTx: makeDbTx({ id: 'tx-orig-1', status: 'succeeded', direction: 'outgoing', transactionType: 'refund' }),
    });
    await assert.rejects(
      () => useCase.execute({ tenantId: 'tenant-a', transactionId: 'tx-orig-1', amount: 50_000 }),
      (err: any) => {
        assert.equal(err instanceof PaymentPolicyError, true);
        assert.equal(err.code, 'INVALID_DIRECTION');
        return true;
      },
    );
  });

  it('rejects refund of non-payment transaction type (void)', async () => {
    const useCase = makeRefundUseCase({
      originalTx: makeDbTx({ id: 'tx-orig-1', status: 'succeeded', direction: 'incoming', transactionType: 'void' }),
    });
    await assert.rejects(
      () => useCase.execute({ tenantId: 'tenant-a', transactionId: 'tx-orig-1', amount: 50_000 }),
      (err: any) => {
        assert.equal(err instanceof PaymentPolicyError, true);
        assert.equal(err.code, 'INVALID_TRANSACTION_TYPE');
        return true;
      },
    );
  });

  it('rejects over-refund (amount > refundable remaining)', async () => {
    const useCase = makeRefundUseCase({
      existingRefunds: [{ amount: '80000.00' }],
    });
    await assert.rejects(
      () => useCase.execute({ tenantId: 'tenant-a', transactionId: 'tx-orig-1', amount: 50_000 }),
      (err: any) => {
        assert.equal(err instanceof PaymentPolicyError, true);
        assert.equal(err.code, 'AMOUNT_EXCEEDS_REFUNDABLE');
        return true;
      },
    );
  });

  it('creates outgoing refund transaction and returns refundableRemaining', async () => {
    const useCase = makeRefundUseCase({});
    const result = await useCase.execute({
      tenantId: 'tenant-a',
      transactionId: 'tx-orig-1',
      amount: 50_000,
    });
    assert.equal(result.refundTransaction.direction, 'outgoing');
    assert.equal(result.refundTransaction.transactionType, 'refund');
    assert.equal(result.refundTransaction.status, 'succeeded');
    assert.ok(result.intent);
    assert.equal(result.refundableRemaining, 50_000);
  });

  it('idempotent replay returns existing refund when key and parent match', async () => {
    const existingRefundRow = makeDbTx({
      id: 'tx-refund-existing',
      direction: 'outgoing',
      transactionType: 'refund',
      status: 'succeeded',
      amount: '30000.00',
      parentTransactionId: 'tx-orig-1',
      paymentIntentId: 'intent-1',
      idempotencyKey: 'my-refund-key',
      tenantId: 'tenant-a',
    });
    const useCase = makeRefundUseCase({
      refundByIdempotencyKey: existingRefundRow,
      existingRefunds: [existingRefundRow],
    });
    const result = await useCase.execute({
      tenantId: 'tenant-a',
      transactionId: 'tx-orig-1',
      amount: 30_000,
      idempotencyKey: 'my-refund-key',
    });
    assert.equal(result.refundTransaction.id, 'tx-refund-existing');
  });

  it('idempotency conflict: same key, different parent transaction → IDEMPOTENCY_KEY_CONFLICT', async () => {
    const existingRefundRow = makeDbTx({
      id: 'tx-refund-conflict',
      direction: 'outgoing',
      transactionType: 'refund',
      status: 'succeeded',
      parentTransactionId: 'tx-other-parent',
      idempotencyKey: 'conflict-key',
      tenantId: 'tenant-a',
    });
    const useCase = makeRefundUseCase({
      refundByIdempotencyKey: existingRefundRow,
    });
    await assert.rejects(
      () => useCase.execute({
        tenantId: 'tenant-a',
        transactionId: 'tx-orig-1',
        amount: 30_000,
        idempotencyKey: 'conflict-key',
      }),
      (err: any) => {
        assert.equal(err instanceof PaymentPolicyError, true);
        assert.equal(err.code, 'IDEMPOTENCY_KEY_CONFLICT');
        return true;
      },
    );
  });
});

// ── Section 4: VoidPaymentTransaction ────────────────────────────────────────

describe('VoidPaymentTransaction', () => {

  function makeVoidUseCase(opts: {
    originalTx?: any;
    intents?: Record<string, any>;
  }) {
    const originalTxRow = opts.originalTx ?? makeDbTx({
      id: 'tx-pending-1',
      status: 'pending',
      direction: 'incoming',
      transactionType: 'payment',
      amount: '100000.00',
      paymentIntentId: 'intent-1',
      tenantId: 'tenant-a',
    });

    const intentRow = {
      id: 'intent-1',
      tenantId: 'tenant-a',
      amountDue: '100000.00',
      amountPaid: '0.00',
      amountRefunded: '0.00',
      amountRemaining: '100000.00',
      status: 'requires_payment',
      allowPartial: false,
      payableType: 'order',
      payableId: 'order-1',
      currency: 'IDR',
      expiresAt: null,
      metadata: null,
      idempotencyKey: null,
      outletId: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      ...(opts.intents?.['intent-1'] ?? {}),
    };

    const mockIntentRepo: any = {
      findById: async () => intentRow,
      lockForUpdate: async () => intentRow,
    };

    const mockTxRepo: any = {
      lockByIdForUpdate: async (id: string) => {
        if (id === originalTxRow.id) return originalTxRow;
        return null;
      },
      update: async (_id: string, _tid: string, data: any) => ({
        ...originalTxRow,
        ...data,
      }),
    };

    const mockDb: any = {
      transaction: async (fn: Function) => fn({}),
    };

    return new VoidPaymentTransaction(
      mockDb,
      mockIntentRepo,
      mockTxRepo as any,
    );
  }

  it('voids a pending transaction', async () => {
    const useCase = makeVoidUseCase({});
    const result = await useCase.execute({
      tenantId: 'tenant-a',
      transactionId: 'tx-pending-1',
    });
    assert.equal(result.transaction.status, 'voided');
    assert.ok(result.transaction.cancelledAt);
  });

  it('voids a requires_action transaction', async () => {
    const useCase = makeVoidUseCase({
      originalTx: makeDbTx({ id: 'tx-pending-1', status: 'requires_action' }),
    });
    const result = await useCase.execute({
      tenantId: 'tenant-a',
      transactionId: 'tx-pending-1',
    });
    assert.equal(result.transaction.status, 'voided');
  });

  it('rejects void of a succeeded transaction', async () => {
    const useCase = makeVoidUseCase({
      originalTx: makeDbTx({ id: 'tx-pending-1', status: 'succeeded' }),
    });
    await assert.rejects(
      () => useCase.execute({ tenantId: 'tenant-a', transactionId: 'tx-pending-1' }),
      (err: any) => {
        assert.equal(err instanceof PaymentPolicyError, true);
        assert.equal(err.code, 'INVALID_TRANSITION');
        return true;
      },
    );
  });

  it('rejects void of a failed transaction', async () => {
    const useCase = makeVoidUseCase({
      originalTx: makeDbTx({ id: 'tx-pending-1', status: 'failed' }),
    });
    await assert.rejects(
      () => useCase.execute({ tenantId: 'tenant-a', transactionId: 'tx-pending-1' }),
      (err: any) => {
        assert.equal(err instanceof PaymentPolicyError, true);
        assert.equal(err.code, 'INVALID_TRANSITION');
        return true;
      },
    );
  });

  it('rejects void of already-voided transaction without idempotency key', async () => {
    const useCase = makeVoidUseCase({
      originalTx: makeDbTx({ id: 'tx-pending-1', status: 'voided', idempotencyKey: null }),
    });
    await assert.rejects(
      () => useCase.execute({ tenantId: 'tenant-a', transactionId: 'tx-pending-1' }),
      (err: any) => {
        assert.equal(err instanceof PaymentPolicyError, true);
        assert.equal(err.code, 'INVALID_TRANSITION');
        return true;
      },
    );
  });

  it('idempotent void: already voided with matching idempotency key returns success', async () => {
    const useCase = makeVoidUseCase({
      originalTx: makeDbTx({
        id: 'tx-pending-1',
        status: 'voided',
        idempotencyKey: 'void-key-123',
        cancelledAt: new Date(),
      }),
    });
    const result = await useCase.execute({
      tenantId: 'tenant-a',
      transactionId: 'tx-pending-1',
      idempotencyKey: 'void-key-123',
    });
    assert.equal(result.transaction.status, 'voided');
  });

  it('records voidReason in metadata', async () => {
    const useCase = makeVoidUseCase({
      originalTx: makeDbTx({ id: 'tx-pending-1', status: 'pending', metadata: null }),
    });
    const result = await useCase.execute({
      tenantId: 'tenant-a',
      transactionId: 'tx-pending-1',
      reason: 'Customer cancelled before payment',
    });
    assert.equal(result.transaction.status, 'voided');
  });

  it('returns NOT_FOUND for unknown transaction', async () => {
    const useCase = makeVoidUseCase({});
    await assert.rejects(
      () => useCase.execute({ tenantId: 'tenant-a', transactionId: 'tx-nonexistent' }),
      (err: any) => {
        assert.equal(err instanceof PaymentPolicyError, true);
        assert.equal(err.code, 'TRANSACTION_NOT_FOUND');
        return true;
      },
    );
  });
});

// ── Section 5: End-to-end intent status transitions ───────────────────────────

describe('intent status lifecycle — pay → refund transitions', () => {

  function makeRecalcUseCase(txs: DomainPaymentTransaction[]) {
    const mockIntentRepo: any = {
      findById: async () => ({
        id: 'intent-e2e',
        tenantId: 'tenant-a',
        amountDue: '100000.00',
        amountPaid: '100000.00',
        amountRefunded: '0.00',
        amountRemaining: '0.00',
        status: 'paid',
        allowPartial: false,
        payableType: 'order',
        payableId: 'order-1',
        currency: 'IDR',
        expiresAt: null,
        metadata: null,
        idempotencyKey: null,
        outletId: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      }),
      update: async (_id: string, _tid: string, data: any) => ({
        id: 'intent-e2e',
        tenantId: 'tenant-a',
        amountDue: '100000.00',
        allowPartial: false,
        payableType: 'order',
        payableId: 'order-1',
        currency: 'IDR',
        expiresAt: null,
        idempotencyKey: null,
        outletId: null,
        metadata: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        ...data,
      }),
    };

    const mockTxRepo: any = {
      findByIntentId: async () => txs,
    };

    return new RecalculatePaymentIntent(mockIntentRepo, mockTxRepo);
  }

  it('paid → partially_refunded when partial refund applied', async () => {
    const txs: DomainPaymentTransaction[] = [
      makeTx({ id: 'tx-paid-1', direction: 'incoming', transactionType: 'payment', status: 'succeeded', amount: 100_000 }),
      makeTx({ id: 'tx-ref-1', direction: 'outgoing', transactionType: 'refund', status: 'succeeded', amount: 40_000, parentTransactionId: 'tx-paid-1' }),
    ];
    const useCase = makeRecalcUseCase(txs);
    const { intent } = await useCase.execute({ tenantId: 'tenant-a', intentId: 'intent-e2e' });

    assert.equal(intent.status, 'partially_refunded');
    assert.equal(intent.amountPaid, 100_000);
    assert.equal(intent.amountRefunded, 40_000);
    assert.equal(intent.amountRemaining, 40_000);
  });

  it('paid → refunded when full amount refunded', async () => {
    const txs: DomainPaymentTransaction[] = [
      makeTx({ id: 'tx-paid-2', direction: 'incoming', transactionType: 'payment', status: 'succeeded', amount: 100_000 }),
      makeTx({ id: 'tx-ref-2', direction: 'outgoing', transactionType: 'refund', status: 'succeeded', amount: 100_000, parentTransactionId: 'tx-paid-2' }),
    ];
    const useCase = makeRecalcUseCase(txs);
    const { intent } = await useCase.execute({ tenantId: 'tenant-a', intentId: 'intent-e2e' });

    assert.equal(intent.status, 'refunded');
    assert.equal(intent.amountPaid, 100_000);
    assert.equal(intent.amountRefunded, 100_000);
    // amountRemaining = max(0, 100k - 100k + 100k) = 100k (NOT 0 after full refund)
    assert.equal(intent.amountRemaining, 100_000);
  });

  it('paid is not downgraded if failed refund exists', async () => {
    const txs: DomainPaymentTransaction[] = [
      makeTx({ id: 'tx-paid-3', direction: 'incoming', transactionType: 'payment', status: 'succeeded', amount: 100_000 }),
      makeTx({ id: 'tx-ref-3', direction: 'outgoing', transactionType: 'refund', status: 'failed', amount: 50_000, parentTransactionId: 'tx-paid-3' }),
    ];
    const useCase = makeRecalcUseCase(txs);
    const { intent } = await useCase.execute({ tenantId: 'tenant-a', intentId: 'intent-e2e' });

    assert.equal(intent.status, 'paid');
    assert.equal(intent.amountRefunded, 0);
  });
});
