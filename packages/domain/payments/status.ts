export const PAYMENT_INTENT_STATUS = {
  REQUIRES_PAYMENT: 'requires_payment',
  PARTIALLY_PAID: 'partially_paid',
  PAID: 'paid',
  OVERPAID: 'overpaid',
  CANCELLED: 'cancelled',
  EXPIRED: 'expired',
  REFUNDED: 'refunded',
  PARTIALLY_REFUNDED: 'partially_refunded',
} as const;

export type PaymentIntentStatus = typeof PAYMENT_INTENT_STATUS[keyof typeof PAYMENT_INTENT_STATUS];

export const TERMINAL_INTENT_STATUSES = new Set<PaymentIntentStatus>([
  PAYMENT_INTENT_STATUS.CANCELLED,
  PAYMENT_INTENT_STATUS.EXPIRED,
  PAYMENT_INTENT_STATUS.PAID,
  PAYMENT_INTENT_STATUS.REFUNDED,
  PAYMENT_INTENT_STATUS.OVERPAID,
]);

export const PAYMENT_TRANSACTION_STATUS = {
  PENDING: 'pending',
  REQUIRES_ACTION: 'requires_action',
  SUCCEEDED: 'succeeded',
  FAILED: 'failed',
  CANCELLED: 'cancelled',
  VOIDED: 'voided',
  REFUNDED: 'refunded',
} as const;

export type PaymentTransactionStatus = typeof PAYMENT_TRANSACTION_STATUS[keyof typeof PAYMENT_TRANSACTION_STATUS];

export const TRANSACTION_TYPE = {
  PAYMENT: 'payment',
  DEPOSIT: 'deposit',
  SETTLEMENT: 'settlement',
  REFUND: 'refund',
  VOID: 'void',
  ADJUSTMENT: 'adjustment',
} as const;

export type TransactionType = typeof TRANSACTION_TYPE[keyof typeof TRANSACTION_TYPE];

export const INCOMING_TRANSACTION_TYPES = new Set<TransactionType>([
  TRANSACTION_TYPE.PAYMENT,
  TRANSACTION_TYPE.DEPOSIT,
  TRANSACTION_TYPE.SETTLEMENT,
]);

export const PAYMENT_METHOD = {
  CASH: 'cash',
  CARD: 'card',
  QRIS: 'qris',
  EWALLET: 'ewallet',
  BANK_TRANSFER: 'bank_transfer',
  CUSTOMER_CREDIT: 'customer_credit',
  OTHER: 'other',
} as const;

export type PaymentMethod = typeof PAYMENT_METHOD[keyof typeof PAYMENT_METHOD];

export const PAYMENT_DIRECTION = {
  INCOMING: 'incoming',
  OUTGOING: 'outgoing',
} as const;

export type PaymentDirection = typeof PAYMENT_DIRECTION[keyof typeof PAYMENT_DIRECTION];

export const PROVIDER_EVENT_STATUS = {
  PENDING: 'pending',
  PROCESSED: 'processed',
  FAILED: 'failed',
  IGNORED: 'ignored',
} as const;

export type ProviderEventStatus = typeof PROVIDER_EVENT_STATUS[keyof typeof PROVIDER_EVENT_STATUS];
