/**
 * RecordPayment Use Case (P1.2 hardening)
 *
 * Records a payment for an existing order.
 * Supports partial payments.
 *
 * Transaction safety and order row locking are owned by the injected
 * application port implementation so this use case does not depend on Drizzle
 * or infrastructure/database details.
 */

import type { RecordPaymentRepositoryPort } from './ports';

export interface RecordPaymentInput {
  order_id: string;
  tenant_id: string;
  amount: number;
  payment_method: 'cash' | 'card' | 'ewallet' | 'other';
  transaction_ref?: string;
  notes?: string;
  idempotency_key?: string;
}

export interface RecordPaymentOutput {
  payment: any;
  order: any;
  remainingAmount: number;
  idempotent_replay?: boolean;
}

export class RecordPayment {
  constructor(private readonly paymentRepository: RecordPaymentRepositoryPort) {}

  async execute(input: RecordPaymentInput): Promise<RecordPaymentOutput> {
    if (input.amount <= 0) {
      throw new Error('Payment amount must be greater than zero');
    }

    return this.paymentRepository.recordPayment(input);
  }
}
