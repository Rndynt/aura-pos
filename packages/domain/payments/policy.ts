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
 */
export function calculateIntentStatus(
  amountDue: number,
  amountPaid: number,
  amountRefunded: number,
  amountRemaining: number
): PaymentIntentStatus {
  if (amountRemaining <= 0.001 && amountPaid >= amountDue - 0.001) {
    if (amountRefunded > 0 && amountRefunded >= amountPaid - 0.001) {
      return 'refunded';
    }
    if (amountRefunded > 0) {
      return 'partially_refunded';
    }
    return 'paid';
  }

  if (amountPaid > 0.001 && amountRemaining > 0.001) {
    return 'partially_paid';
  }

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
