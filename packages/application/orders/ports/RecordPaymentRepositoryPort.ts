import type { RecordPaymentInput, RecordPaymentOutput } from '../RecordPayment';

export interface RecordPaymentRepositoryPort {
  recordPayment(input: RecordPaymentInput): Promise<RecordPaymentOutput>;
}
