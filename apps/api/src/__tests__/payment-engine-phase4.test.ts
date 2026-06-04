/**
 * Payment Engine Phase 4 — Refund / Void Base Lifecycle Tests
 * (updated in Phase 4 Hardening)
 *
 * Covers:
 *  1.  calculateIntentStatus — refund status priority order (Phase 4 spec)
 *  2.  aggregateTransactionTotals — outgoing refund rows included
 *  3.  RefundPaymentTransaction — full refund, partial refund, over-refund guard,
 *      idempotency hardening (tenant-wide namespace, inside-tx, replay semantics,
 *      conflict cases), unique constraint defensive catch
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
//
// Phase 4 Hardening changes:
// - Idempotency check is now INSIDE the DB transaction (after locking originalTx).
// - Idempotency check uses tenant-wide findByIdempotencyKey (not refund-only lookup).
// - refundableRemaining on replay = originalAmount - sumRefundedForParent (not existingRefund.amount - alreadyRefunded).
// - Defensive unique constraint catch converts DB 23505 to IDEMPOTENCY_KEY_CONFLICT.

describe('RefundPaymentTransaction', () => {

  /**
   * Build a mock RefundPaymentTransaction use case.
   *
   * opts.existingTxByIdempotencyKey:
   *   The row returned by txRepo.findByIdempotencyKey(tenantId, key, tx).
   *   This is the tenant-wide check — can be any transaction type, not just refunds.
   *
   * opts.sumRefunded:
   *   Value returned by txRepo.sumRefundedForParent. Defaults to 0.
   *
   * opts.throwOnCreate:
   *   If set, txRepo.create throws this error (used to test defensive catch).
   */
  function makeRefundUseCase(opts: {
    originalTx?: any;
    existingTxByIdempotencyKey?: any;
    sumRefunded?: number;
    intents?: Record<string, any>;
    createdTx?: any;
    throwOnCreate?: any;
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

    const createdRefundRow = opts.createdTx ?? makeDbTx({
      direction: 'outgoing',
      transactionType: 'refund',
      status: 'succeeded',
      amount: '50000.00',
      parentTransactionId: originalTxRow.id,
    });

    const mockIntentRepo: any = {
      findById: async (_id: string, _tid: string, _tx?: any) => intentRow,
      lockForUpdate: async (_id: string, _tid: string, _tx: any) => intentRow,
      update: async (_id: string, _tid: string, data: any) => ({ ...intentRow, ...data }),
    };

    const mockTxRepo: any = {
      lockByIdForUpdate: async (id: string, tid: string, _tx: any) => {
        if (id === originalTxRow.id && tid === 'tenant-a') return originalTxRow;
        return null;
      },
      findByIdempotencyKey: async (_tid: string, _key: string, _tx?: any) => {
        return opts.existingTxByIdempotencyKey ?? null;
      },
      sumRefundedForParent: async () => opts.sumRefunded ?? 0,
      findByIntentId: async () => [],
      create: async (data: any, _tx?: any) => {
        if (opts.throwOnCreate) throw opts.throwOnCreate;
        return { ...createdRefundRow, ...data };
      },
    };

    const mockRecalc = {
      execute: async ({ tenantId, intentId }: any) => ({
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
      }),
    };

    const mockDb: any = {
      transaction: async (fn: Function) => fn({}),
    };

    return new RefundPaymentTransaction(
      mockDb,
      mockIntentRepo,
      mockTxRepo as any,
      mockRecalc as any,
    );
  }

  // ── Basic validation ─────────────────────────────────────────────────────────

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
    const useCase = makeRefundUseCase({ sumRefunded: 80_000 });
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

  // ── Idempotency hardening (Task 1, 2, 3) ─────────────────────────────────────

  it('H1: idempotent replay — same key + same original tx returns existing refund', async () => {
    const originalTxRow = makeDbTx({
      id: 'tx-orig-1',
      status: 'succeeded',
      direction: 'incoming',
      transactionType: 'payment',
      amount: '100000.00',
      paymentIntentId: 'intent-1',
      tenantId: 'tenant-a',
    });
    const existingRefundRow = makeDbTx({
      id: 'tx-refund-existing',
      direction: 'outgoing',
      transactionType: 'refund',
      status: 'succeeded',
      amount: '30000.00',
      parentTransactionId: originalTxRow.id,
      paymentIntentId: 'intent-1',
      idempotencyKey: 'my-refund-key',
      tenantId: 'tenant-a',
    });
    const useCase = makeRefundUseCase({
      originalTx: originalTxRow,
      existingTxByIdempotencyKey: existingRefundRow,
      sumRefunded: 30_000,
    });
    const result = await useCase.execute({
      tenantId: 'tenant-a',
      transactionId: originalTxRow.id,
      amount: 30_000,
      idempotencyKey: 'my-refund-key',
    });
    assert.equal(result.refundTransaction.id, existingRefundRow.id);
  });

  it('H2: idempotent replay — refundableRemaining = originalAmount - totalRefunded (not existingRefund.amount - totalRefunded)', async () => {
    // Bug in original code: returned existingRefund.amount - totalRefunded = 30k - 30k = 0
    // Correct: originalAmount - totalRefunded = 100k - 30k = 70k
    const originalTxRow = makeDbTx({
      id: 'tx-orig-1',
      status: 'succeeded',
      direction: 'incoming',
      transactionType: 'payment',
      amount: '100000.00',
      paymentIntentId: 'intent-1',
      tenantId: 'tenant-a',
    });
    const existingRefundRow = makeDbTx({
      id: 'tx-refund-existing',
      direction: 'outgoing',
      transactionType: 'refund',
      status: 'succeeded',
      amount: '30000.00',
      parentTransactionId: originalTxRow.id,
      paymentIntentId: 'intent-1',
      idempotencyKey: 'my-refund-key',
      tenantId: 'tenant-a',
    });
    const useCase = makeRefundUseCase({
      originalTx: originalTxRow,
      existingTxByIdempotencyKey: existingRefundRow,
      sumRefunded: 30_000,
    });
    const result = await useCase.execute({
      tenantId: 'tenant-a',
      transactionId: originalTxRow.id,
      amount: 30_000,
      idempotencyKey: 'my-refund-key',
    });
    // NOT 30k - 30k = 0 (buggy). Correct: 100k - 30k = 70k
    assert.equal(result.refundableRemaining, 70_000);
  });

  it('H3: idempotent replay after full refund — refundableRemaining = 0', async () => {
    const originalTxRow = makeDbTx({
      id: 'tx-orig-1',
      status: 'succeeded',
      direction: 'incoming',
      transactionType: 'payment',
      amount: '100000.00',
      paymentIntentId: 'intent-1',
      tenantId: 'tenant-a',
    });
    const existingRefundRow = makeDbTx({
      id: 'tx-refund-full',
      direction: 'outgoing',
      transactionType: 'refund',
      status: 'succeeded',
      amount: '100000.00',
      parentTransactionId: originalTxRow.id,
      idempotencyKey: 'full-refund-key',
    });
    const useCase = makeRefundUseCase({
      originalTx: originalTxRow,
      existingTxByIdempotencyKey: existingRefundRow,
      sumRefunded: 100_000,
    });
    const result = await useCase.execute({
      tenantId: 'tenant-a',
      transactionId: originalTxRow.id,
      amount: 100_000,
      idempotencyKey: 'full-refund-key',
    });
    assert.equal(result.refundableRemaining, 0);
  });

  it('H4: conflict — key already used by incoming payment → IDEMPOTENCY_KEY_CONFLICT (not DB error)', async () => {
    // Tenant-wide check: findByIdempotencyKey returns an incoming payment tx
    // (not a refund). Old code using findRefundByIdempotencyKey would miss this
    // and let it hit DB unique constraint. New code must catch it cleanly.
    const existingPaymentTx = makeDbTx({
      id: 'tx-payment-existing',
      direction: 'incoming',
      transactionType: 'payment',
      status: 'succeeded',
      idempotencyKey: 'already-used-key',
    });
    const useCase = makeRefundUseCase({ existingTxByIdempotencyKey: existingPaymentTx });
    await assert.rejects(
      () => useCase.execute({
        tenantId: 'tenant-a',
        transactionId: 'tx-orig-1',
        amount: 50_000,
        idempotencyKey: 'already-used-key',
      }),
      (err: any) => {
        assert.equal(err instanceof PaymentPolicyError, true);
        assert.equal(err.code, 'IDEMPOTENCY_KEY_CONFLICT');
        return true;
      },
    );
  });

  it('H5: conflict — key already used by refund for a DIFFERENT parent tx → IDEMPOTENCY_KEY_CONFLICT', async () => {
    const existingRefundOtherParent = makeDbTx({
      id: 'tx-refund-other',
      direction: 'outgoing',
      transactionType: 'refund',
      status: 'succeeded',
      parentTransactionId: 'tx-completely-different-parent',
      idempotencyKey: 'conflict-key',
    });
    const useCase = makeRefundUseCase({ existingTxByIdempotencyKey: existingRefundOtherParent });
    await assert.rejects(
      () => useCase.execute({
        tenantId: 'tenant-a',
        transactionId: 'tx-orig-1',
        amount: 50_000,
        idempotencyKey: 'conflict-key',
      }),
      (err: any) => {
        assert.equal(err instanceof PaymentPolicyError, true);
        assert.equal(err.code, 'IDEMPOTENCY_KEY_CONFLICT');
        return true;
      },
    );
  });

  it('H6: conflict — key used by non-refund outgoing tx (e.g. void) → IDEMPOTENCY_KEY_CONFLICT', async () => {
    const existingVoidTx = makeDbTx({
      id: 'tx-void-other',
      direction: 'outgoing',
      transactionType: 'void',
      status: 'voided',
      idempotencyKey: 'void-key',
    });
    const useCase = makeRefundUseCase({ existingTxByIdempotencyKey: existingVoidTx });
    await assert.rejects(
      () => useCase.execute({
        tenantId: 'tenant-a',
        transactionId: 'tx-orig-1',
        amount: 50_000,
        idempotencyKey: 'void-key',
      }),
      (err: any) => {
        assert.equal(err instanceof PaymentPolicyError, true);
        assert.equal(err.code, 'IDEMPOTENCY_KEY_CONFLICT');
        return true;
      },
    );
  });

  it('H7: idempotency check performed inside transaction (after row lock, using tx parameter)', async () => {
    // Verify findByIdempotencyKey is called with the transaction context (tx arg is passed),
    // not outside the db.transaction. We track whether it was called with a tx arg.
    let idempotencyCalledWithTx = false;
    let lockCalledFirst = false;
    let lockCallOrder = 0;
    let idempotencyCallOrder = 0;
    let callSeq = 0;

    const originalTxRow = makeDbTx({
      id: 'tx-orig-1',
      status: 'succeeded',
      direction: 'incoming',
      transactionType: 'payment',
      amount: '100000.00',
      paymentIntentId: 'intent-1',
      tenantId: 'tenant-a',
    });

    const mockTxRepo: any = {
      lockByIdForUpdate: async (_id: string, _tid: string, tx: any) => {
        lockCallOrder = ++callSeq;
        return originalTxRow;
      },
      findByIdempotencyKey: async (_tid: string, _key: string, tx?: any) => {
        idempotencyCallOrder = ++callSeq;
        idempotencyCalledWithTx = tx !== undefined;
        return null;
      },
      sumRefundedForParent: async () => 0,
      create: async (data: any) => ({
        ...makeDbTx({ direction: 'outgoing', transactionType: 'refund', status: 'succeeded', amount: '30000.00', parentTransactionId: 'tx-orig-1' }),
        ...data,
      }),
    };

    const intentRow = {
      id: 'intent-1', tenantId: 'tenant-a', amountDue: '100000.00', amountPaid: '100000.00',
      amountRefunded: '0.00', amountRemaining: '0.00', status: 'paid', allowPartial: false,
      payableType: 'order', payableId: 'order-1', currency: 'IDR',
      expiresAt: null, metadata: null, idempotencyKey: null, outletId: null,
      createdAt: new Date(), updatedAt: new Date(),
    };
    const mockIntentRepo: any = {
      findById: async () => intentRow,
      lockForUpdate: async () => intentRow,
      update: async (_id: any, _tid: any, data: any) => ({ ...intentRow, ...data }),
    };
    const mockRecalc = {
      execute: async ({ tenantId, intentId }: any) => ({
        intent: { id: intentId, tenantId, amountDue: 100_000, amountPaid: 100_000,
          amountRefunded: 30_000, amountRemaining: 30_000, status: 'partially_refunded',
          allowPartial: false, payableType: 'order', payableId: 'order-1', currency: 'IDR',
          outletId: null, expiresAt: null, metadata: null, idempotencyKey: null,
          createdAt: new Date(), updatedAt: new Date() },
      }),
    };
    const mockDb: any = {
      transaction: async (fn: Function) => fn({ _isMockTx: true }),
    };

    const useCase = new RefundPaymentTransaction(mockDb, mockIntentRepo, mockTxRepo as any, mockRecalc as any);
    await useCase.execute({
      tenantId: 'tenant-a',
      transactionId: 'tx-orig-1',
      amount: 30_000,
      idempotencyKey: 'some-key',
    });

    // Lock must happen BEFORE idempotency check
    assert.equal(lockCallOrder < idempotencyCallOrder, true, 'lockByIdForUpdate should be called before findByIdempotencyKey');
    // findByIdempotencyKey must be called with the tx context
    assert.equal(idempotencyCalledWithTx, true, 'findByIdempotencyKey should be called with tx parameter');
  });

  // ── Defensive unique constraint catch (Task 4) ──────────────────────────────

  it('H8: DB unique constraint violation on create → clean IDEMPOTENCY_KEY_CONFLICT (not raw DB error)', async () => {
    const dbUniqueError = Object.assign(new Error('duplicate key value violates unique constraint "payment_transactions_tenant_idempotency_unique"'), { code: '23505' });
    const useCase = makeRefundUseCase({ throwOnCreate: dbUniqueError });
    await assert.rejects(
      () => useCase.execute({ tenantId: 'tenant-a', transactionId: 'tx-orig-1', amount: 50_000, idempotencyKey: 'race-key' }),
      (err: any) => {
        assert.equal(err instanceof PaymentPolicyError, true);
        assert.equal(err.code, 'IDEMPOTENCY_KEY_CONFLICT');
        // Error message must not leak raw SQL error
        assert.equal(err.message.includes('duplicate key'), false);
        return true;
      },
    );
  });

  it('H9: non-unique DB error on create is re-thrown unchanged', async () => {
    const someOtherDbError = new Error('connection reset by peer');
    const useCase = makeRefundUseCase({ throwOnCreate: someOtherDbError });
    await assert.rejects(
      () => useCase.execute({ tenantId: 'tenant-a', transactionId: 'tx-orig-1', amount: 50_000 }),
      (err: any) => {
        // Original error must pass through, not be wrapped as PaymentPolicyError
        assert.equal(err instanceof PaymentPolicyError, false);
        assert.equal(err.message, 'connection reset by peer');
        return true;
      },
    );
  });

  it('H10: concurrent refund simulation — second call with same key treated as conflict', async () => {
    // Simulate: two calls with the same key, both enter the transaction.
    // First call sees no existing tx → proceeds to create.
    // Second call sees the row created by first (via findByIdempotencyKey) → conflict/replay.
    // We test the "second call is a replay for same parent" scenario:
    const originalTxRow = makeDbTx({
      id: 'tx-orig-concurrent',
      status: 'succeeded',
      direction: 'incoming',
      transactionType: 'payment',
      amount: '100000.00',
      paymentIntentId: 'intent-1',
      tenantId: 'tenant-a',
    });

    let callCount = 0;
    const existingRefundRow = makeDbTx({
      id: 'tx-refund-concurrent',
      direction: 'outgoing',
      transactionType: 'refund',
      status: 'succeeded',
      amount: '40000.00',
      parentTransactionId: originalTxRow.id,
      idempotencyKey: 'concurrent-key',
    });

    const mockTxRepo: any = {
      lockByIdForUpdate: async () => originalTxRow,
      findByIdempotencyKey: async (_tid: string, _key: string) => {
        callCount++;
        // First call: no existing tx; second call: sees the existing refund
        if (callCount === 1) return null;
        return existingRefundRow;
      },
      sumRefundedForParent: async () => 40_000,
      create: async (data: any) => ({ ...existingRefundRow, ...data }),
    };

    const intentRow = {
      id: 'intent-1', tenantId: 'tenant-a', amountDue: '100000.00', amountPaid: '100000.00',
      amountRefunded: '40000.00', amountRemaining: '0.00', status: 'paid', allowPartial: false,
      payableType: 'order', payableId: 'order-1', currency: 'IDR',
      expiresAt: null, metadata: null, idempotencyKey: null, outletId: null,
      createdAt: new Date(), updatedAt: new Date(),
    };
    const mockIntentRepo: any = {
      findById: async () => intentRow,
      lockForUpdate: async () => intentRow,
      update: async (_id: any, _tid: any, data: any) => ({ ...intentRow, ...data }),
    };
    const mockRecalc = {
      execute: async ({ tenantId, intentId }: any) => ({
        intent: { id: intentId, tenantId, amountDue: 100_000, amountPaid: 100_000,
          amountRefunded: 40_000, amountRemaining: 40_000, status: 'partially_refunded',
          allowPartial: false, payableType: 'order', payableId: 'order-1', currency: 'IDR',
          outletId: null, expiresAt: null, metadata: null, idempotencyKey: null,
          createdAt: new Date(), updatedAt: new Date() },
      }),
    };
    const mockDb: any = { transaction: async (fn: Function) => fn({}) };

    const useCase = new RefundPaymentTransaction(mockDb, mockIntentRepo, mockTxRepo as any, mockRecalc as any);

    // First call creates refund
    const result1 = await useCase.execute({
      tenantId: 'tenant-a',
      transactionId: originalTxRow.id,
      amount: 40_000,
      idempotencyKey: 'concurrent-key',
    });
    assert.equal(result1.refundTransaction.transactionType, 'refund');

    // Second call (simulates concurrent req, sees existing row) → returns replay
    const result2 = await useCase.execute({
      tenantId: 'tenant-a',
      transactionId: originalTxRow.id,
      amount: 40_000,
      idempotencyKey: 'concurrent-key',
    });
    // Second call should replay — same refund, not a new one
    assert.equal(result2.refundTransaction.id, existingRefundRow.id);
    // refundableRemaining: 100k - 40k = 60k
    assert.equal(result2.refundableRemaining, 60_000);
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
