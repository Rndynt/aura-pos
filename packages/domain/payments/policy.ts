import { TERMINAL_INTENT_STATUSES, PAYMENT_METHOD, INCOMING_TRANSACTION_TYPES } from './status';
import type { DomainPaymentIntent, DomainPaymentTransaction } from './types';
import type { PaymentIntentStatus, PaymentMethod, TransactionType } from './status';

export class PaymentPolicyError extends Error {
  constructor(message: string, public readonly code: string) {
    super(message);
    this.name = 'PaymentPolicyError';
  }
}

/**
 * Validate that a payment intent can accept new payments.
 */
export function assertIntentAcceptsPayment(intent: DomainPaymentIntent): void {
  if (TERMINAL_INTENT_STATUSES.has(intent.status as any)) {
    throw new PaymentPolicyError(
      `Payment intent is in terminal state: ${intent.status}`,
      'INTENT_NOT_PAYABLE'
    );
  }
}

/**
 * Validate that the amount is acceptable given the intent's allow_partial setting.
 */
export function assertAmountValid(
  amount: number,
  amountRemaining: number,
  allowPartial: boolean
): void {
  if (amount <= 0) {
    throw new PaymentPolicyError('Payment amount must be greater than zero', 'INVALID_AMOUNT');
  }

  if (amount > amountRemaining + 0.001) {
    throw new PaymentPolicyError(
      `Payment amount (${amount}) exceeds remaining balance (${amountRemaining.toFixed(2)})`,
      'AMOUNT_EXCEEDS_REMAINING'
    );
  }

  if (!allowPartial && amount < amountRemaining - 0.001) {
    throw new PaymentPolicyError(
      `Partial payment not allowed. Must pay full remaining amount of ${amountRemaining.toFixed(2)}`,
      'PARTIAL_NOT_ALLOWED'
    );
  }
}

/**
 * Validate cash received amount and calculate change.
 * Returns changeAmount.
 */
export function calculateCashChange(
  method: PaymentMethod,
  amount: number,
  receivedAmount: number | undefined
): number {
  if (receivedAmount === undefined || receivedAmount === null) {
    return 0;
  }

  if (method !== PAYMENT_METHOD.CASH) {
    if (receivedAmount > amount + 0.001) {
      throw new PaymentPolicyError(
        'Non-cash payment received amount cannot exceed applied amount',
        'NON_CASH_OVERPAYMENT'
      );
    }
    return 0;
  }

  if (receivedAmount < amount - 0.001) {
    throw new PaymentPolicyError(
      `Cash received (${receivedAmount}) is less than payment amount (${amount})`,
      'INSUFFICIENT_CASH'
    );
  }

  return receivedAmount - amount;
}

/**
 * Calculate new intent status from aggregated transaction totals.
 *
 * Phase 4 status priority order:
 *  1. refunded         — amountPaid > 0 AND amountRefunded >= amountPaid
 *  2. partially_refunded — amountRefunded > 0 AND amountRefunded < amountPaid
 *  3. paid             — amountRefunded = 0 AND netPaid >= amountDue
 *  4. partially_paid   — netPaid > 0 AND netPaid < amountDue
 *  5. requires_payment — fallthrough
 *
 * Important: status `paid` is never returned after any refund has occurred.
 * amountRemaining is NOT set to 0 after a full refund (it becomes amountDue again).
 */
export function calculateIntentStatus(
  amountDue: number,
  amountPaid: number,
  amountRefunded: number,
  _amountRemaining: number
): PaymentIntentStatus {
  const EPS = 0.001;

  // 1. refunded: all paid amount has been refunded back
  if (amountPaid > EPS && amountRefunded >= amountPaid - EPS) {
    return 'refunded';
  }

  // 2. partially_refunded: some but not all paid amount was refunded
  if (amountRefunded > EPS && amountRefunded < amountPaid - EPS) {
    return 'partially_refunded';
  }

  // 3. paid: no refund, net paid covers the full amount due
  const netPaid = amountPaid - amountRefunded;
  if (amountRefunded < EPS && netPaid >= amountDue - EPS) {
    return 'paid';
  }

  // 4. partially_paid: some net payment received but not enough
  if (netPaid > EPS) {
    return 'partially_paid';
  }

  // 5. requires_payment: nothing collected yet
  return 'requires_payment';
}

/**
 * Aggregate transaction totals from a list of transactions.
 */
export function aggregateTransactionTotals(transactions: DomainPaymentTransaction[]): {
  amountPaid: number;
  amountRefunded: number;
} {
  let amountPaid = 0;
  let amountRefunded = 0;

  for (const tx of transactions) {
    if (tx.status !== 'succeeded') continue;

    if (tx.direction === 'incoming' && INCOMING_TRANSACTION_TYPES.has(tx.transactionType as TransactionType)) {
      amountPaid += tx.amount;
    } else if (tx.direction === 'outgoing' && tx.transactionType === 'refund') {
      amountRefunded += tx.amount;
    }
  }

  return { amountPaid, amountRefunded };
}
