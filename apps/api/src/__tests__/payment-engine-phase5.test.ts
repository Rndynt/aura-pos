/**
 * Payment Engine Phase 5 — Reconciliation & Stale Recovery Tests
 *
 * Covers:
 *  1.  ListStalePaymentTransactions — listing logic, ageMinutes computation
 *  2.  ExpireStalePaymentTransactions — internal-only safety guard, dry run,
 *      actual expiry, real-provider skip, status re-check under lock
 *  3.  ReconcilePaymentIntentTotals — no-mismatch pass, mismatch detection,
 *      dry run (no fix), actual fix, tenantId isolation, multi-intent bulk,
 *      empty intentIds early return
 *  4.  ReprocessStaleProviderEvents — dry run listing, invalid-sig skip,
 *      unsupported-provider skip, already-terminal ignored gracefully,
 *      successful reprocess, per-event error isolation
 */

import '../../register-paths';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

process.env.DATABASE_URL ||= 'postgres://user:pass@127.0.0.1:5432/aurapos_test';
process.env.BETTER_AUTH_SECRET ||= 'test-secret-with-at-least-32-characters-ok';

// ── Domain / application imports ──────────────────────────────────────────────
import {
  aggregateTransactionTotals,
  calculateIntentStatus,
  PaymentPolicyError,
} from '@pos/domain/payments';
import type { DomainPaymentIntent, DomainPaymentTransaction } from '@pos/domain/payments';
import { ListStalePaymentTransactions } from '@pos/application/payments/ListStalePaymentTransactions';
import { ExpireStalePaymentTransactions } from '@pos/application/payments/ExpireStalePaymentTransactions';
import { ReconcilePaymentIntentTotals } from '@pos/application/payments/ReconcilePaymentIntentTotals';
import { ReprocessStaleProviderEvents } from '@pos/application/payments/ReprocessStaleProviderEvents';
import { PaymentProviderRegistry } from '@pos/application/payments/PaymentProviderRegistry';
import { FakeGatewayProvider } from '@pos/infrastructure/payments/providers/FakeGatewayProvider';

// ── Sequence counters ─────────────────────────────────────────────────────────
let intentIdSeq = 0;
let txIdSeq = 0;
let eventIdSeq = 0;

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

function makeDbIntent(overrides: Partial<any> = {}): any {
  return {
    id: `intent-${++intentIdSeq}`,
    tenantId: 'tenant-a',
    outletId: null,
    payableType: 'order',
    payableId: 'order-1',
    currency: 'IDR',
    amountDue: '100000.00',
    amountPaid: '0.00',
    amountRefunded: '0.00',
    amountRemaining: '100000.00',
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

function makeDbEvent(overrides: Partial<any> = {}): any {
  return {
    id: `event-${++eventIdSeq}`,
    tenantId: 'tenant-a',
    provider: 'fake_gateway',
    providerEventId: `evt-${eventIdSeq}`,
    providerReference: `ref-${eventIdSeq}`,
    eventType: 'payment.succeeded',
    rawPayload: {
      event: 'payment.succeeded',
      reference: `ref-${eventIdSeq}`,
      amount: 100000,
    },
    signatureValid: true,
    processingStatus: 'pending',
    errorMessage: null,
    processedAt: null,
    createdAt: new Date(Date.now() - 20 * 60 * 1000), // 20 minutes ago
    updatedAt: new Date(),
    ...overrides,
  };
}

// ── Helper: build a fake DB with transaction support ─────────────────────────

function makeDb(txCallback?: (cb: (dbTx: any) => Promise<any>) => Promise<any>): any {
  // Default dbTx includes a no-op execute() so real SQL helpers don't throw if
  // accidentally invoked on the mock (e.g. lockByIdForUpdate via a non-fake repo).
  const defaultDbTx = { execute: async () => ({}) };
  return {
    transaction: txCallback ?? (async (cb: (dbTx: any) => Promise<any>) => cb(defaultDbTx)),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Section 1: ListStalePaymentTransactions
// ─────────────────────────────────────────────────────────────────────────────

describe('ListStalePaymentTransactions', () => {
  it('returns empty list when no stale transactions', async () => {
    const fakeTxRepo = {
      listStalePendingTransactions: async () => [],
    };

    const uc = new ListStalePaymentTransactions(fakeTxRepo as any);
    const result = await uc.execute({ cutoffMinutes: 30 });

    assert.equal(result.total, 0);
    assert.deepEqual(result.transactions, []);
    assert.equal(result.cutoffMinutes, 30);
  });

  it('maps DB rows to StaleTransactionRow with correct ageMinutes', async () => {
    const ageMs = 45 * 60 * 1000; // 45 minutes
    const staleRow = makeDbTx({
      id: 'tx-stale-1',
      paymentIntentId: 'intent-stale-1',
      provider: 'fake_gateway',
      providerReference: 'ref-abc',
      method: 'qris',
      status: 'pending',
      amount: '75000.00',
      createdAt: new Date(Date.now() - ageMs),
    });

    const fakeTxRepo = {
      listStalePendingTransactions: async () => [staleRow],
    };

    const uc = new ListStalePaymentTransactions(fakeTxRepo as any);
    const result = await uc.execute({ cutoffMinutes: 30 });

    assert.equal(result.total, 1);
    const row = result.transactions[0];
    assert.equal(row.transactionId, 'tx-stale-1');
    assert.equal(row.intentId, 'intent-stale-1');
    assert.equal(row.provider, 'fake_gateway');
    assert.equal(row.providerReference, 'ref-abc');
    assert.equal(row.amount, 75_000);
    assert.ok(row.ageMinutes >= 44, `expected ageMinutes >= 44, got ${row.ageMinutes}`);
  });

  it('passes cutoffMinutes, tenantId, provider, and limit to repo', async () => {
    let capturedArgs: any = {};
    const fakeTxRepo = {
      listStalePendingTransactions: async (cutoffDate: Date, opts: any) => {
        capturedArgs = { cutoffDate, ...opts };
        return [];
      },
    };

    const uc = new ListStalePaymentTransactions(fakeTxRepo as any);
    await uc.execute({
      cutoffMinutes: 60,
      tenantId: 'tenant-b',
      provider: 'fake_gateway',
      limit: 25,
    });

    assert.equal(capturedArgs.tenantId, 'tenant-b');
    assert.equal(capturedArgs.provider, 'fake_gateway');
    assert.equal(capturedArgs.limit, 25);
    // cutoffDate should be approximately 60 minutes in the past
    const expectedCutoff = Date.now() - 60 * 60 * 1000;
    assert.ok(
      Math.abs(capturedArgs.cutoffDate.getTime() - expectedCutoff) < 5000,
      'cutoffDate should be ~60min ago',
    );
  });

  it('parses string amounts from DB rows', async () => {
    const row = makeDbTx({ amount: '999999.99', status: 'requires_action' });
    const fakeTxRepo = { listStalePendingTransactions: async () => [row] };
    const uc = new ListStalePaymentTransactions(fakeTxRepo as any);
    const result = await uc.execute({ cutoffMinutes: 5 });
    assert.ok(Math.abs(result.transactions[0].amount - 999_999.99) < 0.01);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Section 2: ExpireStalePaymentTransactions
// ─────────────────────────────────────────────────────────────────────────────

describe('ExpireStalePaymentTransactions', () => {
  it('dry run returns found rows without voiding', async () => {
    const row = makeDbTx({ provider: 'fake_gateway', status: 'pending' });
    let updateCalled = false;

    const fakeTxRepo = {
      listStalePendingTransactions: async () => [row],
      lockByIdForUpdate: async () => row,
      update: async () => { updateCalled = true; return row; },
    };

    const uc = new ExpireStalePaymentTransactions(makeDb() as any, fakeTxRepo as any);
    const result = await uc.execute({ cutoffMinutes: 15, dryRun: true });

    assert.equal(result.dryRun, true);
    assert.equal(result.totalFound, 1);
    assert.equal(result.voided, 0);
    assert.equal(result.skipped, 0);
    assert.equal(result.transactions.length, 1);
    assert.equal(result.transactions[0].voided, false);
    assert.equal(updateCalled, false);
  });

  it('skips real gateway providers (non-internal)', async () => {
    const row = makeDbTx({ provider: 'midtrans', status: 'pending' });
    let updateCalled = false;

    const fakeTxRepo = {
      listStalePendingTransactions: async () => [row],
      lockByIdForUpdate: async () => row,
      update: async () => { updateCalled = true; return row; },
    };

    const uc = new ExpireStalePaymentTransactions(makeDb() as any, fakeTxRepo as any);
    const result = await uc.execute({ cutoffMinutes: 15, dryRun: false });

    assert.equal(result.voided, 0);
    assert.equal(result.skipped, 1);
    assert.ok(result.transactions[0].skippedReason?.includes('midtrans'));
    assert.equal(updateCalled, false);
  });

  it('voids internal provider stale transactions (fake_gateway)', async () => {
    const row = makeDbTx({ provider: 'fake_gateway', status: 'pending' });
    let updatedWith: any = null;

    const fakeTxRepo = {
      listStalePendingTransactions: async () => [row],
      lockByIdForUpdate: async () => row,
      update: async (_id: string, _tid: string, data: any) => {
        updatedWith = data;
        return { ...row, ...data };
      },
    };

    const db = makeDb(async (cb) => cb({ transaction: 'fake' }));
    const uc = new ExpireStalePaymentTransactions(db as any, fakeTxRepo as any);
    const result = await uc.execute({ cutoffMinutes: 15, dryRun: false });

    assert.equal(result.voided, 1);
    assert.equal(result.skipped, 0);
    assert.equal(result.transactions[0].voided, true);
    assert.equal(updatedWith?.status, 'voided');
    assert.ok(updatedWith?.cancelledAt instanceof Date);
  });

  it('skips row when lock shows it is already settled', async () => {
    const row = makeDbTx({ provider: 'manual', status: 'pending' });
    const settledRow = { ...row, status: 'succeeded' };
    let updateCalled = false;

    const fakeTxRepo = {
      listStalePendingTransactions: async () => [row],
      lockByIdForUpdate: async () => settledRow,
      update: async () => { updateCalled = true; return row; },
    };

    const db = makeDb(async (cb) => cb({}));
    const uc = new ExpireStalePaymentTransactions(db as any, fakeTxRepo as any);
    const result = await uc.execute({ cutoffMinutes: 5, dryRun: false });

    assert.equal(result.voided, 0);
    assert.equal(result.skipped, 0); // skipped inside transaction — not counted as failure
    assert.equal(updateCalled, false);
  });

  it('handles cash and manual as internal providers', async () => {
    const cashRow = makeDbTx({ provider: 'cash', status: 'pending' });
    const manualRow = makeDbTx({ provider: 'manual', status: 'requires_action' });

    const fakeTxRepo = {
      listStalePendingTransactions: async () => [cashRow, manualRow],
      lockByIdForUpdate: async (id: string) =>
        id === cashRow.id ? cashRow : manualRow,
      update: async () => cashRow,
    };

    const db = makeDb(async (cb) => cb({}));
    const uc = new ExpireStalePaymentTransactions(db as any, fakeTxRepo as any);
    const result = await uc.execute({ cutoffMinutes: 15, dryRun: false });

    assert.equal(result.voided, 2);
    assert.equal(result.skipped, 0);
  });

  it('isolates per-row errors — rest of batch continues', async () => {
    const goodRow = makeDbTx({ provider: 'fake_gateway', status: 'pending' });
    const badRow = makeDbTx({ provider: 'fake_gateway', status: 'pending' });

    let updateCount = 0;
    const fakeTxRepo = {
      listStalePendingTransactions: async () => [goodRow, badRow],
      lockByIdForUpdate: async (id: string) => {
        if (id === badRow.id) throw new Error('DB lock timeout');
        return goodRow;
      },
      update: async () => { updateCount++; return goodRow; },
    };

    const db = makeDb(async (cb: any) => {
      try {
        return await cb({});
      } catch (e) {
        throw e;
      }
    });
    const uc = new ExpireStalePaymentTransactions(db as any, fakeTxRepo as any);
    const result = await uc.execute({ cutoffMinutes: 10, dryRun: false });

    // goodRow voided, badRow skipped with error
    assert.equal(result.voided, 1);
    assert.equal(result.skipped, 1);
    const failedEntry = result.transactions.find((t) => t.transactionId === badRow.id);
    assert.ok(failedEntry?.skippedReason?.includes('DB lock timeout'));
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Section 3: ReconcilePaymentIntentTotals
// ─────────────────────────────────────────────────────────────────────────────

describe('ReconcilePaymentIntentTotals', () => {
  it('returns zero mismatches when all intents are correct', async () => {
    const intent = makeDbIntent({ amountPaid: '100000.00', amountRemaining: '0.00', status: 'paid' });
    const tx = makeDbTx({ paymentIntentId: intent.id, status: 'succeeded', amount: '100000.00' });

    const fakeIntentRepo = {
      listByTenant: async () => [intent],
      listByIds: async () => [intent],
      lockForUpdate: async () => intent,
      update: async () => intent,
    };
    const fakeTxRepo = {
      findAllByIntentIds: async () => [tx],
    };

    const uc = new ReconcilePaymentIntentTotals(makeDb() as any, fakeIntentRepo as any, fakeTxRepo as any);
    const result = await uc.execute({ tenantId: 'tenant-a', dryRun: true });

    assert.equal(result.totalChecked, 1);
    assert.equal(result.totalMismatches, 0);
    assert.equal(result.mismatches.length, 0);
  });

  it('detects mismatch when stored amountPaid differs from computed', async () => {
    // Intent says 50k paid but transaction shows 100k succeeded
    const intent = makeDbIntent({
      amountPaid: '50000.00',
      amountRemaining: '50000.00',
      status: 'partially_paid',
    });
    const tx = makeDbTx({
      paymentIntentId: intent.id,
      status: 'succeeded',
      amount: '100000.00',
      direction: 'incoming',
    });

    const fakeIntentRepo = {
      listByTenant: async () => [intent],
      lockForUpdate: async () => intent,
      update: async () => intent,
    };
    const fakeTxRepo = {
      findAllByIntentIds: async () => [tx],
    };

    const uc = new ReconcilePaymentIntentTotals(makeDb() as any, fakeIntentRepo as any, fakeTxRepo as any);
    const result = await uc.execute({ tenantId: 'tenant-a', dryRun: true });

    assert.equal(result.totalMismatches, 1);
    const m = result.mismatches[0];
    assert.equal(m.stored.amountPaid, 50_000);
    assert.equal(m.expected.amountPaid, 100_000);
    assert.equal(m.expected.status, 'paid');
    assert.equal(m.fixed, false); // dry run
  });

  it('dry run does not call intentRepo.update', async () => {
    const intent = makeDbIntent({ amountPaid: '0.00', status: 'requires_payment' });
    const tx = makeDbTx({
      paymentIntentId: intent.id,
      status: 'succeeded',
      amount: '100000.00',
    });

    let updateCalled = false;
    const fakeIntentRepo = {
      listByTenant: async () => [intent],
      lockForUpdate: async () => intent,
      update: async () => { updateCalled = true; return intent; },
    };
    const fakeTxRepo = { findAllByIntentIds: async () => [tx] };

    const uc = new ReconcilePaymentIntentTotals(makeDb() as any, fakeIntentRepo as any, fakeTxRepo as any);
    await uc.execute({ tenantId: 'tenant-a', dryRun: true });

    assert.equal(updateCalled, false);
  });

  it('actual run fixes mismatches', async () => {
    const intent = makeDbIntent({ amountPaid: '0.00', status: 'requires_payment' });
    const tx = makeDbTx({
      paymentIntentId: intent.id,
      status: 'succeeded',
      amount: '100000.00',
      direction: 'incoming',
    });

    let updatedWith: any = null;
    const fakeIntentRepo = {
      listByTenant: async () => [intent],
      lockForUpdate: async () => intent,
      update: async (_id: string, _tid: string, data: any) => {
        updatedWith = data;
        return { ...intent, ...data };
      },
    };
    const fakeTxRepo = { findAllByIntentIds: async () => [tx] };

    const db = makeDb(async (cb: any) => cb({}));
    const uc = new ReconcilePaymentIntentTotals(db as any, fakeIntentRepo as any, fakeTxRepo as any);
    const result = await uc.execute({ tenantId: 'tenant-a', dryRun: false });

    assert.equal(result.totalFixed, 1);
    assert.equal(result.mismatches[0].fixed, true);
    assert.ok(updatedWith);
    assert.equal(updatedWith.status, 'paid');
  });

  it('uses listByIds when intentIds provided', async () => {
    const intent = makeDbIntent({ amountPaid: '100000.00', amountRemaining: '0.00', status: 'paid' });
    const tx = makeDbTx({ paymentIntentId: intent.id, status: 'succeeded', amount: '100000.00' });

    let listByIdsCalled = false;
    const fakeIntentRepo = {
      listByTenant: async () => { throw new Error('should not be called'); },
      listByIds: async () => { listByIdsCalled = true; return [intent]; },
      lockForUpdate: async () => intent,
      update: async () => intent,
    };
    const fakeTxRepo = { findAllByIntentIds: async () => [tx] };

    const uc = new ReconcilePaymentIntentTotals(makeDb() as any, fakeIntentRepo as any, fakeTxRepo as any);
    await uc.execute({ tenantId: 'tenant-a', intentIds: [intent.id], dryRun: true });
    assert.ok(listByIdsCalled);
  });

  it('returns empty result for tenant with no intents', async () => {
    const fakeIntentRepo = {
      listByTenant: async () => [],
    };
    const fakeTxRepo = { findAllByIntentIds: async () => [] };

    const uc = new ReconcilePaymentIntentTotals(makeDb() as any, fakeIntentRepo as any, fakeTxRepo as any);
    const result = await uc.execute({ tenantId: 'tenant-empty', dryRun: true });

    assert.equal(result.totalChecked, 0);
    assert.equal(result.totalMismatches, 0);
  });

  it('handles multiple intents in one pass (bulk TX fetch)', async () => {
    const i1 = makeDbIntent({ amountPaid: '100000.00', amountRemaining: '0.00', status: 'paid' });
    const i2 = makeDbIntent({ amountPaid: '0.00', amountRemaining: '100000.00', status: 'requires_payment' });

    const tx1 = makeDbTx({ paymentIntentId: i1.id, status: 'succeeded', amount: '100000.00' });
    // i2 has no transactions — stored state is correct (requires_payment with 0 paid)

    let findAllByIntentIdsCalled = false;
    const fakeIntentRepo = {
      listByTenant: async () => [i1, i2],
      lockForUpdate: async () => i1,
      update: async () => i1,
    };
    const fakeTxRepo = {
      findAllByIntentIds: async (_ids: string[]) => {
        findAllByIntentIdsCalled = true;
        return [tx1];
      },
    };

    const uc = new ReconcilePaymentIntentTotals(makeDb() as any, fakeIntentRepo as any, fakeTxRepo as any);
    const result = await uc.execute({ tenantId: 'tenant-a', dryRun: true });

    assert.ok(findAllByIntentIdsCalled, 'findAllByIntentIds should be called once for the batch');
    assert.equal(result.totalChecked, 2);
    assert.equal(result.totalMismatches, 0); // both are correctly stored
  });

  it('records fixError when update throws inside transaction', async () => {
    const intent = makeDbIntent({ amountPaid: '0.00', status: 'requires_payment' });
    const tx = makeDbTx({ paymentIntentId: intent.id, status: 'succeeded', amount: '100000.00' });

    const fakeIntentRepo = {
      listByTenant: async () => [intent],
      lockForUpdate: async () => intent,
      update: async () => { throw new Error('constraint violation'); },
    };
    const fakeTxRepo = { findAllByIntentIds: async () => [tx] };

    const db = makeDb(async (cb: any) => {
      try { return await cb({}); } catch (e) { throw e; }
    });

    const uc = new ReconcilePaymentIntentTotals(db as any, fakeIntentRepo as any, fakeTxRepo as any);
    const result = await uc.execute({ tenantId: 'tenant-a', dryRun: false });

    assert.equal(result.totalMismatches, 1);
    assert.equal(result.mismatches[0].fixed, false);
    assert.ok(result.mismatches[0].fixError?.includes('constraint violation'));
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Section 4: ReprocessStaleProviderEvents
// ─────────────────────────────────────────────────────────────────────────────

describe('ReprocessStaleProviderEvents', () => {
  function makeRegistry(): PaymentProviderRegistry {
    const fakeGateway = new FakeGatewayProvider();
    return new PaymentProviderRegistry().register(fakeGateway);
  }

  function makeApplyGatewayStatus(outcome: string = 'succeeded', extraFields?: Record<string, any>) {
    return {
      execute: async (_input: any, _dbTx?: any) => ({
        outcome,
        intent: {} as any,
        transaction: {} as any,
        currentStatus: outcome === 'already_terminal' ? 'succeeded' : undefined,
        ...extraFields,
      }),
    };
  }

  it('dry run lists stale events without any mutations', async () => {
    const event = makeDbEvent({ signatureValid: true });

    let markProcessedCalled = false;
    let markFailedCalled = false;
    let markIgnoredCalled = false;

    const fakeEventRepo = {
      listStalePendingEvents: async () => [event],
      markProcessed: async () => { markProcessedCalled = true; },
      markFailed: async () => { markFailedCalled = true; },
      markIgnored: async () => { markIgnoredCalled = true; },
    };
    const fakeTxRepo = { findByProviderReferenceGlobal: async () => null };

    const uc = new ReprocessStaleProviderEvents(
      makeDb() as any,
      fakeEventRepo as any,
      fakeTxRepo as any,
      makeRegistry(),
      makeApplyGatewayStatus() as any,
    );
    const result = await uc.execute({ cutoffMinutes: 15, dryRun: true });

    assert.equal(result.dryRun, true);
    assert.equal(result.totalFound, 1);
    assert.equal(result.events.length, 1);
    // No outcomes set in dry run (no mutations)
    assert.equal(result.events[0].outcome, undefined);
    assert.equal(markProcessedCalled, false);
    assert.equal(markFailedCalled, false);
    assert.equal(markIgnoredCalled, false);
  });

  it('skips events with signatureValid=false', async () => {
    const event = makeDbEvent({ signatureValid: false });

    let markProcessedCalled = false;
    const fakeEventRepo = {
      listStalePendingEvents: async () => [event],
      lockByIdForUpdate: async () => event,
      markProcessed: async () => { markProcessedCalled = true; },
      markFailed: async () => {},
      markIgnored: async () => {},
    };
    const fakeTxRepo = { findByProviderReferenceGlobal: async () => null };

    const uc = new ReprocessStaleProviderEvents(
      makeDb() as any,
      fakeEventRepo as any,
      fakeTxRepo as any,
      makeRegistry(),
      makeApplyGatewayStatus() as any,
    );
    const result = await uc.execute({ cutoffMinutes: 15, dryRun: false });

    assert.equal(result.skipped, 1);
    assert.equal(result.events[0].outcome, 'skipped_invalid_sig');
    assert.equal(markProcessedCalled, false);
  });

  it('reports unsupported_provider and skips without abort', async () => {
    const event = makeDbEvent({ provider: 'nonexistent_provider', signatureValid: true });

    const fakeEventRepo = {
      listStalePendingEvents: async () => [event],
      lockByIdForUpdate: async () => event,
      markProcessed: async () => {},
      markFailed: async () => {},
      markIgnored: async () => {},
    };
    const fakeTxRepo = { findByProviderReferenceGlobal: async () => null };

    const uc = new ReprocessStaleProviderEvents(
      makeDb() as any,
      fakeEventRepo as any,
      fakeTxRepo as any,
      makeRegistry(), // does not have 'nonexistent_provider'
      makeApplyGatewayStatus() as any,
    );
    const result = await uc.execute({ cutoffMinutes: 15, dryRun: false });

    assert.equal(result.skipped, 1);
    assert.equal(result.events[0].outcome, 'unsupported_provider');
  });

  it('marks event as ignored_terminal when transaction already terminal', async () => {
    const event = makeDbEvent({ signatureValid: true, tenantId: 'tenant-a' });
    // Build a valid fake_gateway rawPayload the FakeGatewayProvider can parse.
    // FakeGatewayProvider.parseWebhook requires: event_id, event_type, provider_reference
    const ref = `ref-terminal-${Date.now()}`;
    event.rawPayload = {
      event_id: `evt-terminal-${Date.now()}`,
      event_type: 'payment.succeeded',
      provider_reference: ref,
      amount: 100000,
      metadata: {},
    };
    event.providerReference = ref;

    let markIgnoredCalled = false;
    const fakeEventRepo = {
      listStalePendingEvents: async () => [event],
      lockByIdForUpdate: async () => event,
      markProcessed: async () => {},
      markFailed: async () => {},
      markIgnored: async () => { markIgnoredCalled = true; },
    };
    const fakeTxRepo = { findByProviderReferenceGlobal: async () => null };

    const db = makeDb(async (cb: any) => cb({}));
    const applyStatus = makeApplyGatewayStatus('already_terminal', { currentStatus: 'succeeded' });

    const uc = new ReprocessStaleProviderEvents(
      db as any,
      fakeEventRepo as any,
      fakeTxRepo as any,
      makeRegistry(),
      applyStatus as any,
    );
    const result = await uc.execute({ cutoffMinutes: 15, dryRun: false });

    assert.equal(result.ignored, 1);
    assert.equal(result.events[0].outcome, 'ignored_terminal');
    assert.ok(markIgnoredCalled);
  });

  it('successfully reprocesses a valid stale event', async () => {
    const ref = `ref-ok-${Date.now()}`;
    const event = makeDbEvent({
      signatureValid: true,
      tenantId: 'tenant-a',
      rawPayload: {
        event_id: `evt-ok-${Date.now()}`,
        event_type: 'payment.succeeded',
        provider_reference: ref,
        amount: 100000,
        metadata: {},
      },
      providerReference: ref,
    });

    let markProcessedCalled = false;
    const fakeEventRepo = {
      listStalePendingEvents: async () => [event],
      lockByIdForUpdate: async () => event,
      markProcessed: async () => { markProcessedCalled = true; },
      markFailed: async () => {},
      markIgnored: async () => {},
    };
    const fakeTxRepo = { findByProviderReferenceGlobal: async () => null };

    const db = makeDb(async (cb: any) => cb({}));
    const applyStatus = makeApplyGatewayStatus('succeeded');

    const uc = new ReprocessStaleProviderEvents(
      db as any,
      fakeEventRepo as any,
      fakeTxRepo as any,
      makeRegistry(),
      applyStatus as any,
    );
    const result = await uc.execute({ cutoffMinutes: 15, dryRun: false });

    assert.equal(result.reprocessed, 1);
    assert.equal(result.events[0].outcome, 'reprocessed');
    assert.ok(markProcessedCalled);
  });

  it('isolates per-event errors — other events continue', async () => {
    const ref1 = `ref-ok-${Date.now()}-1`;
    const ref2 = `ref-bad-${Date.now()}-2`;

    const goodEvent = makeDbEvent({
      signatureValid: true,
      tenantId: 'tenant-a',
      rawPayload: { event_id: `evt-ok-${Date.now()}`, event_type: 'payment.succeeded', provider_reference: ref1, metadata: {} },
      providerReference: ref1,
    });
    const badEvent = makeDbEvent({
      signatureValid: true,
      tenantId: 'tenant-a',
      rawPayload: { event_id: `evt-bad-${Date.now()}`, event_type: 'payment.succeeded', provider_reference: ref2, metadata: {} },
      providerReference: ref2,
    });

    let processCount = 0;
    const fakeEventRepo = {
      listStalePendingEvents: async () => [goodEvent, badEvent],
      lockByIdForUpdate: async (id: string) => (id === goodEvent.id ? goodEvent : badEvent),
      markProcessed: async (id: string) => {
        if (id === badEvent.id) throw new Error('DB error during mark');
        processCount++;
      },
      markFailed: async () => {},
      markIgnored: async () => {},
    };
    const fakeTxRepo = { findByProviderReferenceGlobal: async () => null };

    const db = makeDb(async (cb: any) => {
      const r = await cb({});
      return r;
    });
    // Second call to applyStatus throws to simulate DB error path
    let callCount = 0;
    const applyStatus = {
      execute: async () => {
        callCount++;
        if (callCount === 2) throw new Error('unexpected DB error');
        return { outcome: 'succeeded', intent: {}, transaction: {} };
      },
    };

    const uc = new ReprocessStaleProviderEvents(
      db as any,
      fakeEventRepo as any,
      fakeTxRepo as any,
      makeRegistry(),
      applyStatus as any,
    );
    const result = await uc.execute({ cutoffMinutes: 15, dryRun: false });

    assert.equal(result.reprocessed, 1);
    assert.equal(result.failed, 1);
    const failedEntry = result.events.find((e) => e.eventId === badEvent.id);
    assert.ok(failedEntry?.error?.includes('unexpected DB error'));
  });

  it('resolves tenantId from global TX lookup when event has no tenantId', async () => {
    const ref = `ref-notenant-${Date.now()}`;
    const event = makeDbEvent({
      signatureValid: true,
      tenantId: null, // no tenant on the event
      rawPayload: { event_id: `evt-notenant-${Date.now()}`, event_type: 'payment.succeeded', provider_reference: ref, metadata: {} },
      providerReference: ref,
    });

    let resolvedTenant: string | null = null;
    const fakeEventRepo = {
      listStalePendingEvents: async () => [event],
      lockByIdForUpdate: async () => event,
      markProcessed: async () => {},
      markFailed: async () => {},
      markIgnored: async () => {},
    };
    const fakeTxRepo = {
      findByProviderReferenceGlobal: async () => ({ tenantId: 'resolved-tenant' }),
    };

    const applyStatus = {
      execute: async (input: any) => {
        resolvedTenant = input.tenantId;
        return { outcome: 'succeeded', intent: {}, transaction: {} };
      },
    };

    const db = makeDb(async (cb: any) => cb({}));
    const uc = new ReprocessStaleProviderEvents(
      db as any,
      fakeEventRepo as any,
      fakeTxRepo as any,
      makeRegistry(),
      applyStatus as any,
    );
    const result = await uc.execute({ cutoffMinutes: 15, dryRun: false });

    assert.equal(result.reprocessed, 1);
    assert.equal(resolvedTenant, 'resolved-tenant');
  });

  it('marks failed when tenantId cannot be resolved', async () => {
    const ref = `ref-noresolution-${Date.now()}`;
    const event = makeDbEvent({
      signatureValid: true,
      tenantId: null,
      rawPayload: { event_id: `evt-nores-${Date.now()}`, event_type: 'payment.succeeded', provider_reference: ref, metadata: {} },
      providerReference: ref,
    });

    let markFailedCalled = false;
    const fakeEventRepo = {
      listStalePendingEvents: async () => [event],
      lockByIdForUpdate: async () => event,
      markProcessed: async () => {},
      markFailed: async () => { markFailedCalled = true; },
      markIgnored: async () => {},
    };
    const fakeTxRepo = {
      findByProviderReferenceGlobal: async () => null, // cannot resolve
    };

    const uc = new ReprocessStaleProviderEvents(
      makeDb() as any,
      fakeEventRepo as any,
      fakeTxRepo as any,
      makeRegistry(),
      makeApplyGatewayStatus() as any,
    );
    const result = await uc.execute({ cutoffMinutes: 15, dryRun: false });

    assert.equal(result.failed, 1);
    assert.equal(result.events[0].outcome, 'failed');
    assert.ok(markFailedCalled);
  });

  // ── Phase 5 Hardening: Task 1 — tenant-scoped listing ──────────────────────

  it('passes tenantId filter to listStalePendingEvents', async () => {
    let capturedOptions: any = {};
    const fakeEventRepo = {
      listStalePendingEvents: async (_cutoff: Date, opts: any) => {
        capturedOptions = opts;
        return [];
      },
      lockByIdForUpdate: async () => null,
      markProcessed: async () => {},
      markFailed: async () => {},
      markIgnored: async () => {},
    };
    const fakeTxRepo = { findByProviderReferenceGlobal: async () => null };

    const uc = new ReprocessStaleProviderEvents(
      makeDb() as any,
      fakeEventRepo as any,
      fakeTxRepo as any,
      makeRegistry(),
      makeApplyGatewayStatus() as any,
    );
    await uc.execute({ cutoffMinutes: 15, tenantId: 'tenant-x', dryRun: false });

    assert.equal(capturedOptions.tenantId, 'tenant-x', 'tenantId must be forwarded to repo');
  });

  it('dry-run passes tenantId filter and makes no mutations', async () => {
    const event = makeDbEvent({ tenantId: 'tenant-a' });
    let capturedTenantId: string | undefined;
    const fakeEventRepo = {
      listStalePendingEvents: async (_cutoff: Date, opts: any) => {
        capturedTenantId = opts?.tenantId;
        return [event];
      },
      markProcessed: async () => {},
      markFailed: async () => {},
      markIgnored: async () => {},
    };
    const fakeTxRepo = { findByProviderReferenceGlobal: async () => null };

    const uc = new ReprocessStaleProviderEvents(
      makeDb() as any,
      fakeEventRepo as any,
      fakeTxRepo as any,
      makeRegistry(),
      makeApplyGatewayStatus() as any,
    );
    const result = await uc.execute({ cutoffMinutes: 15, tenantId: 'tenant-a', dryRun: true });

    assert.equal(capturedTenantId, 'tenant-a');
    assert.equal(result.totalFound, 1);
    assert.equal(result.events[0].outcome, undefined, 'dry-run sets no outcome');
  });

  // ── Phase 5 Hardening: Task 2 — event row locking ──────────────────────────

  it('silently skips event already claimed (lockByIdForUpdate returns non-pending)', async () => {
    const event = makeDbEvent({ signatureValid: true, tenantId: 'tenant-a' });
    // Simulate another concurrent job having claimed and processed this event.
    const alreadyClaimed = { ...event, processingStatus: 'processed' };

    let markProcessedCalled = false;
    const fakeEventRepo = {
      listStalePendingEvents: async () => [event],
      lockByIdForUpdate: async () => alreadyClaimed,
      markProcessed: async () => { markProcessedCalled = true; },
      markFailed: async () => {},
      markIgnored: async () => {},
    };
    const fakeTxRepo = { findByProviderReferenceGlobal: async () => null };

    const db = makeDb(async (cb: any) => cb({}));
    const uc = new ReprocessStaleProviderEvents(
      db as any,
      fakeEventRepo as any,
      fakeTxRepo as any,
      makeRegistry(),
      makeApplyGatewayStatus() as any,
    );
    const result = await uc.execute({ cutoffMinutes: 15, dryRun: false });

    assert.equal(result.reprocessed, 0);
    assert.equal(result.skipped, 0);
    assert.equal(result.failed, 0);
    assert.equal(result.events.length, 0, 'already-claimed events are silently skipped');
    assert.equal(markProcessedCalled, false);
  });

  it('dry-run does not call lockByIdForUpdate', async () => {
    const event = makeDbEvent({ signatureValid: true });

    let lockCalled = false;
    const fakeEventRepo = {
      listStalePendingEvents: async () => [event],
      lockByIdForUpdate: async () => { lockCalled = true; return event; },
      markProcessed: async () => {},
      markFailed: async () => {},
      markIgnored: async () => {},
    };
    const fakeTxRepo = { findByProviderReferenceGlobal: async () => null };

    const uc = new ReprocessStaleProviderEvents(
      makeDb() as any,
      fakeEventRepo as any,
      fakeTxRepo as any,
      makeRegistry(),
      makeApplyGatewayStatus() as any,
    );
    await uc.execute({ cutoffMinutes: 15, dryRun: true });

    assert.equal(lockCalled, false, 'dry-run must never lock rows');
  });

  // ── Phase 5 Hardening: Task 3 — invalid-signature finalization ─────────────

  it('marks invalid-signature event as ignored (not left pending) in actual run', async () => {
    const event = makeDbEvent({ signatureValid: false, tenantId: 'tenant-a' });

    let markIgnoredCalledWith: string | null = null;
    let markProcessedCalled = false;
    const fakeEventRepo = {
      listStalePendingEvents: async () => [event],
      lockByIdForUpdate: async () => event,
      markProcessed: async () => { markProcessedCalled = true; },
      markFailed: async () => {},
      markIgnored: async (_id: string, reason: string) => { markIgnoredCalledWith = reason; },
    };
    const fakeTxRepo = { findByProviderReferenceGlobal: async () => null };

    const db = makeDb(async (cb: any) => cb({}));
    const uc = new ReprocessStaleProviderEvents(
      db as any,
      fakeEventRepo as any,
      fakeTxRepo as any,
      makeRegistry(),
      makeApplyGatewayStatus() as any,
    );
    const result = await uc.execute({ cutoffMinutes: 15, dryRun: false });

    assert.equal(result.skipped, 1);
    assert.equal(result.events[0].outcome, 'skipped_invalid_sig');
    assert.ok(
      String(markIgnoredCalledWith).includes('REPROCESS_INVALID_SIGNATURE'),
      `markIgnored must be called with REPROCESS_INVALID_SIGNATURE, got: ${markIgnoredCalledWith}`,
    );
    assert.equal(markProcessedCalled, false, 'invalid-sig must never mutate money');
  });

  it('dry-run does not call markIgnored for invalid-signature event', async () => {
    const event = makeDbEvent({ signatureValid: false, tenantId: 'tenant-a' });

    let markIgnoredCalled = false;
    const fakeEventRepo = {
      listStalePendingEvents: async () => [event],
      markProcessed: async () => {},
      markFailed: async () => {},
      markIgnored: async () => { markIgnoredCalled = true; },
    };
    const fakeTxRepo = { findByProviderReferenceGlobal: async () => null };

    const uc = new ReprocessStaleProviderEvents(
      makeDb() as any,
      fakeEventRepo as any,
      fakeTxRepo as any,
      makeRegistry(),
      makeApplyGatewayStatus() as any,
    );
    await uc.execute({ cutoffMinutes: 15, dryRun: true });

    assert.equal(markIgnoredCalled, false, 'dry-run must not call markIgnored');
  });

  // ── Phase 5 Hardening: Task 4 — unsupported-provider finalization ──────────

  it('marks unsupported-provider event as failed (not left pending) in actual run', async () => {
    const event = makeDbEvent({
      provider: 'nonexistent_provider',
      signatureValid: true,
      tenantId: 'tenant-a',
    });

    let markFailedCalledWith: string | null = null;
    const fakeEventRepo = {
      listStalePendingEvents: async () => [event],
      lockByIdForUpdate: async () => event,
      markProcessed: async () => {},
      markFailed: async (_id: string, reason: string) => { markFailedCalledWith = reason; },
      markIgnored: async () => {},
    };
    const fakeTxRepo = { findByProviderReferenceGlobal: async () => null };

    const db = makeDb(async (cb: any) => cb({}));
    const uc = new ReprocessStaleProviderEvents(
      db as any,
      fakeEventRepo as any,
      fakeTxRepo as any,
      makeRegistry(), // does not include 'nonexistent_provider'
      makeApplyGatewayStatus() as any,
    );
    const result = await uc.execute({ cutoffMinutes: 15, dryRun: false });

    assert.equal(result.skipped, 1);
    assert.equal(result.events[0].outcome, 'unsupported_provider');
    assert.ok(
      String(markFailedCalledWith).includes('UNSUPPORTED_PROVIDER'),
      `markFailed must be called with UNSUPPORTED_PROVIDER, got: ${markFailedCalledWith}`,
    );
  });

  it('batch continues after unsupported-provider event', async () => {
    const badProviderEvent = makeDbEvent({
      provider: 'nonexistent_provider',
      signatureValid: true,
      tenantId: 'tenant-a',
    });
    const ref = `ref-good-${Date.now()}`;
    const goodEvent = makeDbEvent({
      signatureValid: true,
      tenantId: 'tenant-a',
      rawPayload: { event_id: `evt-good-${Date.now()}`, event_type: 'payment.succeeded', provider_reference: ref, metadata: {} },
      providerReference: ref,
    });

    let markProcessedCalled = false;
    const fakeEventRepo = {
      listStalePendingEvents: async () => [badProviderEvent, goodEvent],
      lockByIdForUpdate: async (id: string) =>
        id === badProviderEvent.id ? badProviderEvent : goodEvent,
      markProcessed: async () => { markProcessedCalled = true; },
      markFailed: async () => {},
      markIgnored: async () => {},
    };
    const fakeTxRepo = { findByProviderReferenceGlobal: async () => null };

    const db = makeDb(async (cb: any) => cb({}));
    const applyStatus = makeApplyGatewayStatus('succeeded');
    const uc = new ReprocessStaleProviderEvents(
      db as any,
      fakeEventRepo as any,
      fakeTxRepo as any,
      makeRegistry(),
      applyStatus as any,
    );
    const result = await uc.execute({ cutoffMinutes: 15, dryRun: false });

    assert.equal(result.skipped, 1);
    assert.equal(result.reprocessed, 1);
    assert.ok(markProcessedCalled, 'good event must be reprocessed after unsupported-provider event');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Section 5: Repository method contract validation (via mock verification)
// ─────────────────────────────────────────────────────────────────────────────

describe('Repository method contracts', () => {
  it('listStalePendingTransactions passes correct cutoff and options', async () => {
    let captured: any = {};
    const fakeTxRepo = {
      listStalePendingTransactions: async (cutoffDate: Date, opts: any) => {
        captured = { cutoffDate, opts };
        return [];
      },
    };

    const uc = new ListStalePaymentTransactions(fakeTxRepo as any);
    await uc.execute({ cutoffMinutes: 45, tenantId: 'T1', provider: 'fake_gateway', limit: 10 });

    const expectedCutoff = Date.now() - 45 * 60 * 1000;
    assert.ok(Math.abs(captured.cutoffDate.getTime() - expectedCutoff) < 5000);
    assert.equal(captured.opts.tenantId, 'T1');
    assert.equal(captured.opts.provider, 'fake_gateway');
    assert.equal(captured.opts.limit, 10);
  });

  it('findAllByIntentIds is called once for a batch of intents', async () => {
    const i1 = makeDbIntent({ amountPaid: '0.00', status: 'requires_payment' });
    const i2 = makeDbIntent({ amountPaid: '0.00', status: 'requires_payment' });

    let callCount = 0;
    let capturedIds: string[] = [];
    const fakeIntentRepo = {
      listByTenant: async () => [i1, i2],
      lockForUpdate: async () => i1,
      update: async () => i1,
    };
    const fakeTxRepo = {
      findAllByIntentIds: async (ids: string[]) => {
        callCount++;
        capturedIds = ids;
        return [];
      },
    };

    const uc = new ReconcilePaymentIntentTotals(makeDb() as any, fakeIntentRepo as any, fakeTxRepo as any);
    await uc.execute({ tenantId: 'tenant-a', dryRun: true });

    assert.equal(callCount, 1, 'findAllByIntentIds must be called only once (no N+1)');
    assert.ok(capturedIds.includes(i1.id));
    assert.ok(capturedIds.includes(i2.id));
  });
});
