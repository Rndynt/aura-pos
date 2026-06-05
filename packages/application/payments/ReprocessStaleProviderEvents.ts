import type { Database } from '@pos/infrastructure/database';
import type { IPaymentProviderEventRepository } from '@pos/infrastructure/repositories/payments/PaymentProviderEventRepository';
import type { IPaymentTransactionRepository } from '@pos/infrastructure/repositories/payments/PaymentTransactionRepository';
import type { PaymentProviderRegistry } from './PaymentProviderRegistry';
import type { ApplyGatewayTransactionStatus } from './ApplyGatewayTransactionStatus';

export interface ReprocessStaleProviderEventsInput {
  /**
   * Events created more than this many minutes ago are considered stale.
   * Must be positive. Recommended minimum: 5 minutes to avoid touching fresh events.
   */
  cutoffMinutes: number;
  /**
   * Optional provider filter — only reprocess events for this provider.
   */
  provider?: string;
  /**
   * Phase 5 Hardening: optional tenant filter.
   * When provided, only events belonging to this tenant are selected.
   * Tenant-manager HTTP callers must always supply their own tenantId so
   * they cannot accidentally process another tenant's events.
   * null-tenant events are excluded when tenantId is set; they require a
   * future superadmin/global reconciliation job.
   */
  tenantId?: string;
  /**
   * Maximum number of stale events to select (default 50).
   */
  batchSize?: number;
  /**
   * When true, no mutations are made. The output describes what would happen.
   */
  dryRun: boolean;
}

export interface StaleEventResult {
  eventId: string;
  provider: string;
  providerEventId: string;
  providerReference: string | null;
  eventType: string;
  signatureValid: boolean;
  createdAt: Date;
  ageMinutes: number;
  /**
   * Outcome of the reprocessing attempt.
   * Only set when dryRun=false.
   *
   * skipped_already_claimed — event was no longer pending under the row lock
   *   (another concurrent job already claimed it).
   */
  outcome?:
    | 'reprocessed'
    | 'ignored_terminal'
    | 'ignored_event_type'
    | 'skipped_invalid_sig'
    | 'skipped_already_claimed'
    | 'unsupported_provider'
    | 'failed';
  error?: string;
}

export interface ReprocessStaleProviderEventsOutput {
  dryRun: boolean;
  cutoffMinutes: number;
  totalFound: number;
  reprocessed: number;
  ignored: number;
  skipped: number;
  failed: number;
  events: StaleEventResult[];
}

// Internal per-event outcome type used inside the DB transaction.
type EventTxOutcome =
  | { kind: 'skipped_already_claimed' }
  | { kind: 'skipped_invalid_sig' }
  | { kind: 'unsupported_provider'; error: string }
  | { kind: 'ignored_event_type' }
  | { kind: 'ignored_terminal' }
  | { kind: 'failed'; error: string }
  | { kind: 'reprocessed' };

/**
 * ReprocessStaleProviderEvents — Phase 5 reconciliation use case.
 *
 * Finds provider events stuck in `processingStatus='pending'` for longer than
 * cutoffMinutes and attempts to reprocess them using the stored rawPayload.
 *
 * Events get stuck when the DB transaction that updates their status rolls back
 * after the event row has already been committed (see Phase 3 hardening report).
 *
 * Phase 5 Hardening additions:
 * - tenantId filter: tenant-manager calls only see/process their own events.
 * - Event row locking: each event is claimed with SELECT FOR UPDATE before any
 *   mutation so concurrent reconciliation jobs cannot double-process the same event.
 * - Invalid-signature finalization: invalid-sig events are marked `ignored` with
 *   reason REPROCESS_INVALID_SIGNATURE instead of being left pending forever.
 * - Unsupported-provider finalization: unregistered provider events are marked
 *   `failed` with reason UNSUPPORTED_PROVIDER instead of being left pending forever.
 *
 * Unchanged safety rules:
 * - signatureValid=false events NEVER produce money movement.
 * - Unsupported providers are finalized without aborting the batch.
 * - Events whose target transaction is already terminal are ignored gracefully.
 * - One failed event does not abort the rest of the batch.
 * - Fresh events (created after cutoffDate) are never selected.
 * - dryRun=true never mutates anything — it only lists what would be reprocessed.
 */
export class ReprocessStaleProviderEvents {
  constructor(
    private readonly db: Database,
    private readonly eventRepo: IPaymentProviderEventRepository,
    private readonly txRepo: IPaymentTransactionRepository,
    private readonly registry: PaymentProviderRegistry,
    private readonly applyGatewayStatus: ApplyGatewayTransactionStatus,
  ) {}

  async execute(
    input: ReprocessStaleProviderEventsInput,
  ): Promise<ReprocessStaleProviderEventsOutput> {
    const cutoffDate = new Date(Date.now() - input.cutoffMinutes * 60 * 1000);
    const limit = input.batchSize ?? 50;
    const now = new Date();

    const staleEvents = await this.eventRepo.listStalePendingEvents(cutoffDate, {
      provider: input.provider,
      tenantId: input.tenantId,
      limit,
    });

    const results: StaleEventResult[] = [];
    let reprocessed = 0;
    let ignored = 0;
    let skipped = 0;
    let failed = 0;

    for (const event of staleEvents) {
      const ageMs = now.getTime() - new Date(event.createdAt).getTime();
      const ageMinutes = Math.floor(ageMs / 60_000);

      const base: StaleEventResult = {
        eventId: event.id,
        provider: event.provider,
        providerEventId: event.providerEventId,
        providerReference: event.providerReference ?? null,
        eventType: event.eventType,
        signatureValid: event.signatureValid,
        createdAt: new Date(event.createdAt),
        ageMinutes,
      };

      // ── dry run ── just describe, no locks, no mutations
      if (input.dryRun) {
        results.push(base);
        continue;
      }

      // ── actual run ── lock row, then process inside one DB transaction per event
      try {
        const outcome: EventTxOutcome = await this.db.transaction(async (dbTx) => {
          // 1. Lock the event row before reading/mutating anything (Phase 5 Hardening Task 2).
          //    This prevents concurrent reconciliation jobs from processing the same event.
          const locked = await this.eventRepo.lockByIdForUpdate(event.id, dbTx);

          // 2. Re-check status under the lock — another process may have claimed it.
          if (!locked || locked.processingStatus !== 'pending') {
            return { kind: 'skipped_already_claimed' };
          }

          // 3. Invalid-signature events must never produce money movement.
          //    Phase 5 Hardening Task 3: finalize as ignored instead of leaving pending.
          if (!locked.signatureValid) {
            await this.eventRepo.markIgnored(
              event.id,
              'REPROCESS_INVALID_SIGNATURE: stale event with invalid signature finalized without money mutation',
              dbTx,
            );
            return { kind: 'skipped_invalid_sig' };
          }

          // 4. Provider must be registered.
          //    Phase 5 Hardening Task 4: finalize as failed instead of leaving pending.
          if (!this.registry.has(locked.provider)) {
            await this.eventRepo.markFailed(
              event.id,
              `UNSUPPORTED_PROVIDER: provider "${locked.provider}" is not registered`,
              dbTx,
            );
            return {
              kind: 'unsupported_provider',
              error: `Provider "${locked.provider}" is not registered`,
            };
          }

          const provider = this.registry.get(locked.provider);

          // 5. Re-parse the stored rawPayload through the provider's parser.
          let parsed: Awaited<ReturnType<typeof provider.parseWebhook>>;
          try {
            parsed = await provider.parseWebhook({
              rawPayload: JSON.stringify(locked.rawPayload ?? {}),
              headers: {},
            });
          } catch (parseErr: any) {
            await this.eventRepo.markFailed(
              event.id,
              `REPROCESS_PARSE_ERROR: ${parseErr?.message ?? String(parseErr)}`,
              dbTx,
            );
            return {
              kind: 'failed',
              error: `Parse error: ${parseErr?.message ?? String(parseErr)}`,
            };
          }

          // 6. Ignored or pending event types do not mutate transaction state.
          if (parsed.transactionStatus === 'ignored' || parsed.transactionStatus === 'pending') {
            await this.eventRepo.markIgnored(
              event.id,
              `REPROCESS_IGNORED: event type "${parsed.eventType}" does not trigger state mutation`,
              dbTx,
            );
            return { kind: 'ignored_event_type' };
          }

          // 7. Resolve tenantId — use the locked row's tenantId, or fall back to
          //    a global TX lookup by providerReference when the event has no tenant.
          let tenantId: string | null = locked.tenantId ?? null;
          if (!tenantId && parsed.providerReference) {
            // Global lookup is a read and does not need to be inside the tx,
            // but keeping it here ensures a consistent snapshot under the lock.
            const txGlobal = await this.txRepo.findByProviderReferenceGlobal(
              locked.provider,
              parsed.providerReference,
            );
            tenantId = txGlobal?.tenantId ?? null;
          }

          if (!tenantId) {
            await this.eventRepo.markFailed(
              event.id,
              'REPROCESS_TENANT_NOT_RESOLVED: cannot resolve tenantId for transaction mutation',
              dbTx,
            );
            return {
              kind: 'failed',
              error: 'Cannot resolve tenantId for transaction mutation',
            };
          }

          // 8. Apply the gateway transaction status.
          const applyResult = await this.applyGatewayStatus.execute(
            {
              tenantId,
              provider: locked.provider,
              providerReference: parsed.providerReference,
              status: parsed.transactionStatus as 'succeeded' | 'failed',
              failureReason: parsed.failureReason ?? null,
            },
            dbTx,
          );

          if (applyResult.outcome === 'already_terminal') {
            await this.eventRepo.markIgnored(
              event.id,
              `REPROCESS_TERMINAL: transaction is already in state "${applyResult.currentStatus}"`,
              dbTx,
            );
            return { kind: 'ignored_terminal' };
          } else if (applyResult.outcome === 'not_found') {
            await this.eventRepo.markFailed(
              event.id,
              `REPROCESS_TX_NOT_FOUND: no ${locked.provider} transaction for reference "${parsed.providerReference}"`,
              dbTx,
            );
            return {
              kind: 'failed',
              error: `No ${locked.provider} transaction for reference "${parsed.providerReference}"`,
            };
          } else {
            await this.eventRepo.markProcessed(event.id, { processedAt: new Date() }, dbTx);
            return { kind: 'reprocessed' };
          }
        });

        // Update counters and results based on the per-event transaction outcome.
        switch (outcome.kind) {
          case 'skipped_already_claimed':
            // Silent — another job already claimed this event; do not push to results.
            break;
          case 'skipped_invalid_sig':
            results.push({ ...base, outcome: 'skipped_invalid_sig' });
            skipped++;
            break;
          case 'unsupported_provider':
            results.push({ ...base, outcome: 'unsupported_provider', error: outcome.error });
            skipped++;
            break;
          case 'ignored_event_type':
            results.push({ ...base, outcome: 'ignored_event_type' });
            ignored++;
            break;
          case 'ignored_terminal':
            results.push({ ...base, outcome: 'ignored_terminal' });
            ignored++;
            break;
          case 'failed':
            results.push({ ...base, outcome: 'failed', error: outcome.error });
            failed++;
            break;
          case 'reprocessed':
            results.push({ ...base, outcome: 'reprocessed' });
            reprocessed++;
            break;
        }
      } catch (err: any) {
        // Per-event failure must never abort the whole batch (Phase 5 Task 5).
        try {
          await this.eventRepo.markFailed(
            event.id,
            `REPROCESS_ERROR: ${err?.message ?? String(err)}`,
          );
        } catch {
          // best-effort — swallow secondary failure
        }
        results.push({
          ...base,
          outcome: 'failed',
          error: err?.message ?? String(err),
        });
        failed++;
      }
    }

    return {
      dryRun: input.dryRun,
      cutoffMinutes: input.cutoffMinutes,
      totalFound: staleEvents.length,
      reprocessed,
      ignored,
      skipped,
      failed,
      events: results,
    };
  }
}
