import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { ReprocessProviderEvents } from '../../../payment-orchestration-service/src/application/use-cases/ReprocessProviderEvents.ts';
import type { PaymentProviderEventDTO, PaymentProviderEventRepository } from '@northflow/payment-orchestration-core';

function event(overrides: Partial<PaymentProviderEventDTO> = {}): PaymentProviderEventDTO {
  return {
    id: 'pev_1', merchantId: null, provider: 'xendit_sandbox', providerEventId: 'evt_1', providerReference: 'inv_1',
    eventType: 'invoice.status', processingStatus: 'pending', processingAttempts: 0, lastError: null,
    rawHeaders: {}, rawBody: null, parsedPayload: null, receivedAt: new Date(), processedAt: null,
    createdAt: new Date(Date.now() - 10 * 60 * 1000), updatedAt: new Date(), ...overrides,
  };
}

describe('provider event reprocess foundation', () => {
  test('safely skips stored events without replayable parsed payload', async () => {
    const repo: PaymentProviderEventRepository = {
      reserveEvent: async () => event(),
      findByProviderEventId: async () => null,
      assignMerchant: async () => {},
      markProcessed: async () => {},
      markFailed: async () => {},
      findStalePending: async () => [event()],
    };
    const result = await new ReprocessProviderEvents(repo).execute({ olderThanMinutes: 5, limit: 10 });
    assert.equal(result.processed, 0);
    assert.equal(result.skipped, 1);
    assert.match(result.details[0].reason ?? '', /no parsed payload/);
  });
});
