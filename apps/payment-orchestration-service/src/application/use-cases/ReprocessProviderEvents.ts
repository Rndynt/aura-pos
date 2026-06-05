/**
 * ReprocessProviderEvents — safe provider-event retry/reprocess foundation.
 *
 * This phase intentionally avoids reconstructing provider signature raw bodies from
 * stored rows. Events that are already processed are not double-applied, and events
 * without a safely replayable parsed payload are skipped with a clear reason.
 */

import type { PaymentProviderEventRepository } from '@northflow/payment-orchestration-core';

export interface ReprocessProviderEventsInput {
  olderThanMinutes?: number;
  limit?: number;
}

export interface ReprocessProviderEventsResult {
  processed: number;
  skipped: number;
  failed: number;
  details: Array<{
    eventId: string;
    status: 'processed' | 'skipped' | 'failed';
    reason?: string;
  }>;
}

export class ReprocessProviderEvents {
  constructor(private readonly providerEventRepo: PaymentProviderEventRepository) {}

  async execute(input: ReprocessProviderEventsInput = {}): Promise<ReprocessProviderEventsResult> {
    const events = await this.providerEventRepo.findStalePending({
      olderThanMinutes: input.olderThanMinutes ?? 5,
      limit: input.limit ?? 100,
    });

    const result: ReprocessProviderEventsResult = {
      processed: 0,
      skipped: 0,
      failed: 0,
      details: [],
    };

    for (const event of events) {
      if (event.processingStatus === 'processed') {
        result.skipped += 1;
        result.details.push({
          eventId: event.id,
          status: 'skipped',
          reason: 'Event is already processed; double-apply is not allowed.',
        });
        continue;
      }

      if (!event.parsedPayload) {
        result.skipped += 1;
        result.details.push({
          eventId: event.id,
          status: 'skipped',
          reason: 'Stored event has no parsed payload that can be safely replayed without reconstructing provider raw body/signature context.',
        });
        continue;
      }

      result.skipped += 1;
      result.details.push({
        eventId: event.id,
        status: 'skipped',
        reason: 'Parsed payload is available, but Phase 8I does not double-apply provider mutations without a provider-specific replay adapter.',
      });
    }

    return result;
  }
}
