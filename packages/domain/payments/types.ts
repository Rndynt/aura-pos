import type { PaymentIntentStatus, PaymentTransactionStatus, TransactionType, PaymentMethod, PaymentDirection } from './status';

export interface DomainPaymentIntent {
  id: string;
  tenantId: string;
  outletId: string | null;
  payableType: string;
  payableId: string;
  currency: string;
  amountDue: number;
  amountPaid: number;
  amountRefunded: number;
  amountRemaining: number;
  status: PaymentIntentStatus;
  allowPartial: boolean;
  expiresAt: Date | null;
  metadata: Record<string, unknown> | null;
  idempotencyKey: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface DomainPaymentTransaction {
  id: string;
  tenantId: string;
  paymentIntentId: string;
  direction: PaymentDirection;
  transactionType: TransactionType;
  method: PaymentMethod;
  provider: string;
  status: PaymentTransactionStatus;
  amount: number;
  receivedAmount: number | null;
  changeAmount: number | null;
  providerReference: string | null;
  providerPaymentUrl: string | null;
  providerQrString: string | null;
  failureReason: string | null;
  idempotencyKey: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: Date;
  updatedAt: Date;
  succeededAt: Date | null;
  failedAt: Date | null;
  cancelledAt: Date | null;
}

export interface DomainPaymentAllocation {
  id: string;
  tenantId: string;
  paymentIntentId: string;
  paymentTransactionId: string;
  targetType: string;
  targetId: string;
  amount: number;
  metadata: Record<string, unknown> | null;
  createdAt: Date;
}

export interface DomainPaymentProviderEvent {
  id: string;
  tenantId: string | null;
  provider: string;
  providerEventId: string;
  providerReference: string | null;
  eventType: string;
  rawPayload: Record<string, unknown>;
  signatureValid: boolean;
  processingStatus: string;
  processedAt: Date | null;
  errorMessage: string | null;
  createdAt: Date;
}

export interface CreatePaymentIntentInput {
  tenantId: string;
  outletId?: string | null;
  payableType: string;
  payableId: string;
  amountDue: number;
  currency?: string;
  allowPartial?: boolean;
  expiresAt?: Date | null;
  metadata?: Record<string, unknown>;
  idempotencyKey?: string;
}

export interface RecordManualPaymentInput {
  tenantId: string;
  paymentIntentId: string;
  amount: number;
  method: PaymentMethod;
  transactionType?: 'payment' | 'deposit' | 'settlement';
  receivedAmount?: number;
  providerReference?: string;
  metadata?: Record<string, unknown>;
  idempotencyKey?: string;
}
