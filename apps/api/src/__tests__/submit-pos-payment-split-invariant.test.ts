import '../../register-paths';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

const { validateSelectedSplitPaymentInvariant } = await import(
  '@pos/infrastructure/repositories/payments/DrizzleSubmitPOSPaymentRepository'
);
const { mapToUserSafeError } = await import('../http/controllers/POSPaymentController');

const billA = {
  clientBillId: 'bill-a',
  splitNo: 1,
  splitDbId: 'split-db-a',
  amountDue: 15000,
  amountPaid: 0,
  remaining: 15000,
};

describe('SubmitPOSPayment split bill selected-bill invariant', () => {
  it('accepts a selected bill payment when newLineTotal equals remaining', () => {
    assert.doesNotThrow(() => validateSelectedSplitPaymentInvariant(billA, 15000));
  });

  it('rejects selected bill overpay before mutation', () => {
    assert.throws(
      () => validateSelectedSplitPaymentInvariant(billA, 20000),
      /Jumlah pembayaran harus sama dengan sisa bill yang dipilih\./,
    );
  });

  it('rejects selected bill underpay before mutation', () => {
    assert.throws(
      () => validateSelectedSplitPaymentInvariant(billA, 10000),
      /Jumlah pembayaran harus sama dengan sisa bill yang dipilih\./,
    );
  });

  it('rejects a new different-idempotency request for an already-paid selected bill', () => {
    assert.throws(
      () => validateSelectedSplitPaymentInvariant({ ...billA, amountPaid: 15000, remaining: 0 }, 15000),
      /Bill yang dipilih sudah lunas\./,
    );
  });

  it('allows idempotent replay after the selected bill is paid so totals are not double-counted', () => {
    assert.doesNotThrow(() =>
      validateSelectedSplitPaymentInvariant({ ...billA, amountPaid: 15000, remaining: 0 }, 0),
    );
  });

  it('maps split mismatch to a cashier-readable API error', () => {
    assert.deepEqual(
      mapToUserSafeError(new Error('Jumlah pembayaran harus sama dengan sisa bill yang dipilih.')),
      {
        message: 'Jumlah pembayaran harus sama dengan sisa bill yang dipilih.',
        code: 'SPLIT_BILL_AMOUNT_MISMATCH',
        status: 400,
      },
    );
  });

  it('maps already-paid selected bill to a cashier-readable API error', () => {
    assert.deepEqual(mapToUserSafeError(new Error('Bill yang dipilih sudah lunas.')), {
      message: 'Bill yang dipilih sudah lunas.',
      code: 'SPLIT_BILL_ALREADY_PAID',
      status: 409,
    });
  });

  it('maps missing selected bill identity to a cashier-readable API error', () => {
    assert.deepEqual(mapToUserSafeError(new Error('Bill yang dipilih tidak valid atau sudah lunas.')), {
      message: 'Bill yang dipilih tidak valid atau sudah lunas.',
      code: 'INVALID_SPLIT_BILL',
      status: 400,
    });
  });
});
