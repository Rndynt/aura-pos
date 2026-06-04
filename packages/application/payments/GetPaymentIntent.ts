import type { IPaymentIntentRepository } from '@pos/infrastructure/repositories/payments';
import type { DomainPaymentIntent } from '@pos/domain/payments';
import { intentRowToDomain } from './CreatePaymentIntent';

export interface GetPaymentIntentInput {
  tenantId: string;
  intentId: string;
}

export interface GetPaymentIntentOutput {
  intent: DomainPaymentIntent;
}

export class GetPaymentIntent {
  constructor(private readonly intentRepo: IPaymentIntentRepository) {}

  async execute(input: GetPaymentIntentInput): Promise<GetPaymentIntentOutput> {
    const intent = await this.intentRepo.findById(input.intentId, input.tenantId);

    if (!intent) {
      throw new Error('Payment intent not found or access denied');
    }

    return { intent: intentRowToDomain(intent) };
  }
}
