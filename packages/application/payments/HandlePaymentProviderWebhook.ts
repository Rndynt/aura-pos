import { createHash } from 'crypto';
import type { Database } from '@pos/infrastructure/database';
import type { IPaymentProviderEventRepository } from '@pos/infrastructure/repositories/payments/PaymentProviderEventRepository';
import type { IPaymentTransactionRepository } from '@pos/infrastructure/repositories/payments/PaymentTransactionRepository';
import type { DomainPaymentIntent, DomainPaymentTransaction } from '@pos/domain/payments';
import type { PaymentProviderRegistry } from './PaymentProviderRegistry';
import type { ApplyGatewayTransactionStatus } from './ApplyGatewayTransactionStatus';

export interface HandlePaymentProviderWebhookInput {
  /** Provider code from the URL route parameter, e.g. "fake_gateway". */
  provider: string;
  /** HTTP request headers as a key-value object. */
  headers: Record<string, string>;
  /** Raw request body (string).  Must match what was used to compute the signature. */
  rawBody: string;
  /**
   * Tenant ID resolved from the request context (service token / tenant header).
   * May be null for unauthenticated webhook calls from real payment providers.
   * When null the tenant is resolved from the transaction row via a global lookup.
   */
  tenantId?: string | null;
}

export type HandlePaymentProviderWebhookOutput =
  | {
      outcome: 'processed';
      eventId: string;
      intent: DomainPaymentIntent;
      transaction: DomainPaymentTransaction;
    }
  | { outcome: 'idempotent_replay'; eventId: string }
  | { outcome: 'ignored'; eventId: string | null; reason: string }
  | { outcome: 'invalid_signature'; eventId: string | null }
  | { outcome: 'unknown_provider' }
  | { outcome: 'parse_error'; error: string };

/**
 * HandlePaymentProviderWebhook — generic webhook processing use case (Phase 3).
 *
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │  This use case processes inbound provider webhook events.               │
 * │  It is NOT a test utility — it will be the live webhook handler once    │
 * │  real gateways are integrated in Phase 5+.                              │
 * └─────────────────────────────────────────────────────────────────────────┘
 *
 * Processing pipeline (Phase 3 hardened)
 * ----------------------------------------
 * 1. Lookup provider in registry → return `unknown_provider` if absent.
 * 2. Verify HMAC signature:
 *    - On failure: store a deterministic audit event via createOrGetByProviderEventId
 *      (signatureValid=false, processingStatus=failed, errorMessage=INVALID_SIGNATURE)
 *      and return `invalid_signature`.
 * 3. Parse raw payload via provider.parseWebhook → return `parse_error` on failure.
 * 4. Reserve event via createOrGetByProviderEventId (OUTSIDE the DB transaction):
 *    - If `created: false` (event already exists — any status including pending):
 *      return `idempotent_replay`.  Do NOT mutate any transaction.
 *    - If `created: true`: proceed.
 * 5. Resolve tenantId from route context or global TX lookup.
 * 6. Begin DB transaction (event INSERT has already committed in step 4):
 *    a. For `ignored` or `pending` status → markIgnored(dbTx) → return `ignored`.
 *    b. Check tenantId → markFailed(dbTx) if unresolved → return `ignored`.
 *    c. Apply transaction status via ApplyGatewayTransactionStatus (dbTx).
 *    d. `already_terminal` → markIgnored(TRANSACTION_ALREADY_TERMINAL, dbTx) → `ignored`.
 *    e. `not_found`        → markFailed(TRANSACTION_NOT_FOUND, dbTx) → `ignored`.
 *    f. `succeeded`/`failed` → markProcessed(dbTx) → return `processed`.
 *
 * Idempotency & safety (hardened in Phase 3 Hardening)
 * -----------------------------------------------------
 * Event insertion uses `createOrGetByProviderEventId` which issues:
 *   INSERT INTO payment_provider_events ... ON CONFLICT DO NOTHING RETURNING *
 *
 * This is SAFE inside and outside a DB transaction because:
 *   - ON CONFLICT DO NOTHING does not raise an error in PostgreSQL.
 *   - No unique-violation error → the PostgreSQL transaction is never aborted.
 *   - The follow-up SELECT fetches the existing row without the transaction entering
 *     an error state.
 *
 * Why the event INSERT happens OUTSIDE the DB transaction
 * -------------------------------------------------------
 * The event row is inserted (reserved) before `db.transaction()` is called.
 * The subsequent UPDATE (markProcessed / markIgnored / markFailed) runs inside
 * the DB transaction together with the payment_transaction + intent mutation.
 *
 * Benefit: if the DB transaction rolls back, the event row stays committed with
 * status 'pending', which prevents any retry from reprocessing the same event
 * (retries get `idempotent_replay`).  The orphaned pending row is acceptable in
 * Phase 3; a cleanup job will be implemented in Phase 5+.
 *
 * Concurrent duplicate delivery
 * ------------------------------
 * Two concurrent requests for the same providerEventId:
 *  - First request: createOrGetByProviderEventId → created:true → proceeds.
 *  - Second request: createOrGetByProviderEventId → created:false (conflict) →
 *    returns `idempotent_replay` immediately.  No duplicate INSERT error.
 *
 * Existing pending event
 * ----------------------
 * If an event row already exists with processingStatus='pending' (e.g. a previous
 * request started but the DB transaction was rolled back), retries receive
 * `idempotent_replay`.  Stale pending events are NOT automatically retried in
 * Phase 3 to avoid accidental double-processing.  A safe stale-timeout retry
 * policy will be implemented in Phase 5+.
 *
 * Invalid signature audit
 * -----------------------
 * Invalid signature attempts are recorded in payment_provider_events using a
 * deterministic event ID derived from SHA-256(rawBody)[0..31].  Repeated identical
 * payloads with an invalid signature produce the same audit event (no unbounded
 * row growth).  The audit event is always stored outside any DB transaction so it
 * is committed even if subsequent processing is skipped.
 */
export class HandlePaymentProviderWebhook {
  constructor(
    private readonly db: Database,
    private readonly registry: PaymentProviderRegistry,
    private readonly eventRepo: IPaymentProviderEventRepository,
    private readonly txRepo: IPaymentTransactionRepository,
    private readonly applyGatewayStatus: ApplyGatewayTransactionStatus,
  ) {}

  async execute(
    input: HandlePaymentProviderWebhookInput,
  ): Promise<HandlePaymentProviderWebhookOutput> {
    // ── Step 1: Validate provider ─────────────────────────────────────────────
    if (!this.registry.has(input.provider)) {
      return { outcome: 'unknown_provider' };
    }
    const provider = this.registry.get(input.provider);

    // ── Step 2: Verify webhook signature ─────────────────────────────────────
    const signature =
      input.headers['x-fake-gateway-signature'] ||
      input.headers['x-signature'] ||
      input.headers['x-webhook-signature'] ||
      '';

    const signatureValid = await provider.verifyWebhook({
      rawPayload: input.rawBody,
      signature,
      headers: input.headers,
    });

    if (!signatureValid) {
      // Audit the invalid signature attempt using a deterministic event ID.
      // The same raw body always maps to the same audit row — no unbounded growth.
      const deterministicId = `invalid_sig_${createHash('sha256')
        .update(input.rawBody)
        .digest('hex')
        .slice(0, 32)}`;

      let auditEventId: string | null = null;
      try {
        const { event } = await this.eventRepo.createOrGetByProviderEventId({
          provider: input.provider,
          providerEventId: deterministicId,
          providerReference: null,
          eventType: 'invalid_signature',
          rawPayload: tryParseJson(input.rawBody),
          signatureValid: false,
          processingStatus: 'failed',
          errorMessage: 'INVALID_SIGNATURE',
          tenantId: input.tenantId ?? null,
          processedAt: null,
        });
        auditEventId = event.id;
      } catch {
        // Audit failure is non-fatal — still return invalid_signature.
      }

      return { outcome: 'invalid_signature', eventId: auditEventId };
    }

    // ── Step 3: Parse the raw payload ─────────────────────────────────────────
    let parsed: Awaited<ReturnType<typeof provider.parseWebhook>>;
    try {
      parsed = await provider.parseWebhook({
        rawPayload: input.rawBody,
        headers: input.headers,
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return { outcome: 'parse_error', error: message };
    }

    // ── Step 4: Reserve the provider event (OUTSIDE the DB transaction) ───────
    //
    // Uses ON CONFLICT DO NOTHING — safe in PostgreSQL (no error, no aborted tx).
    //
    // created: false means an event row already exists for this providerEventId
    // (in ANY status, including 'pending'). In either case we do not reprocess:
    //  - terminal status (processed/ignored/failed): idempotent replay.
    //  - pending status: stale orphan from a previous failed tx; NOT retried in
    //    Phase 3 to avoid double-processing (cleanup job deferred to Phase 5+).
    const { event, created } = await this.eventRepo.createOrGetByProviderEventId({
      provider: input.provider,
      providerEventId: parsed.providerEventId,
      providerReference: parsed.providerReference || null,
      eventType: parsed.eventType,
      rawPayload: tryParseJson(input.rawBody),
      signatureValid: true,
      processingStatus: 'pending',
      tenantId: input.tenantId ?? null,
      processedAt: null,
      errorMessage: null,
    });

    if (!created) {
      return { outcome: 'idempotent_replay', eventId: event.id };
    }

    // ── Step 5: Resolve tenantId ──────────────────────────────────────────────
    // For fake_gateway the tenantId is always provided via the route context.
    // For future real providers, fall back to a global transaction lookup.
    let resolvedTenantId: string | null = input.tenantId ?? null;

    if (
      !resolvedTenantId &&
      parsed.transactionStatus !== 'ignored' &&
      parsed.transactionStatus !== 'pending' &&
      parsed.providerReference
    ) {
      const txGlobal = await this.txRepo.findByProviderReferenceGlobal(
        input.provider,
        parsed.providerReference,
      );
      if (!txGlobal) {
        await this.eventRepo.markFailed(
          event.id,
          'TRANSACTION_NOT_FOUND: cannot resolve tenantId — no transaction for providerReference',
        );
        return { outcome: 'ignored', eventId: event.id, reason: 'TRANSACTION_NOT_FOUND' };
      }
      resolvedTenantId = txGlobal.tenantId;
    }

    // ── Step 5b: Backfill event tenantId after tenant resolution ─────────────
    //
    // Real provider webhooks (e.g. Xendit) do not carry x-tenant-id. After
    // resolving the tenant from the transaction row above, we backfill the
    // provider event row so tenant-scoped stale reconciliation (Phase 5) can
    // find and retry it.
    //
    // Done OUTSIDE the DB transaction so the backfill persists even if the
    // subsequent mutation transaction rolls back (event stays 'pending' with
    // tenantId set — stale recovery job can repick with correct tenant scope).
    //
    // Conflict policy: if event.tenantId is already set to a DIFFERENT tenant,
    // assignTenant throws TENANT_MISMATCH — we log and continue (the event
    // processing is still valid; the mismatch is auditable in the event row).
    if (resolvedTenantId && !event.tenantId) {
      try {
        await this.eventRepo.assignTenant(event.id, resolvedTenantId);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        console.warn(
          `[HandlePaymentProviderWebhook] Could not backfill event tenantId for event ` +
            `${event.id}: ${msg}`,
        );
        // Non-fatal: continue processing. The missing tenantId is observable via
        // listStalePendingEvents (global scan) and auditable in event.errorMessage.
      }
    }

    // ── Step 6: Process inside a DB transaction ───────────────────────────────
    //
    // The event row already exists (committed in step 4).
    // This transaction only:
    //   a. Updates the event status (markIgnored / markFailed / markProcessed).
    //   b. Mutates the payment_transaction + creates allocation + recalculates intent.
    //
    // If this transaction rolls back, the event stays as 'pending' (committed in
    // step 4 and not rolled back because it was outside this transaction).
    // A retry will return `idempotent_replay` — no double-processing.
    return await this.db.transaction(async (dbTx) => {
      // ── 6a: No state mutation for informational / unsupported event types ───
      if (parsed.transactionStatus === 'ignored' || parsed.transactionStatus === 'pending') {
        await this.eventRepo.markIgnored(
          event.id,
          `Event type "${parsed.eventType}" does not trigger state mutation (status: ${parsed.transactionStatus})`,
          dbTx,
        );
        return {
          outcome: 'ignored',
          eventId: event.id,
          reason: `Event type: ${parsed.eventType}`,
        };
      }

      // ── 6b: tenantId must be resolved for transaction mutation ──────────────
      if (!resolvedTenantId) {
        await this.eventRepo.markFailed(
          event.id,
          'Cannot resolve tenantId for transaction mutation',
          dbTx,
        );
        return { outcome: 'ignored', eventId: event.id, reason: 'TENANT_NOT_RESOLVED' };
      }

      // ── 6c: Apply transaction status via the shared atomic helper ───────────
      const applyResult = await this.applyGatewayStatus.execute(
        {
          tenantId: resolvedTenantId,
          provider: input.provider,
          providerReference: parsed.providerReference,
          status: parsed.transactionStatus as 'succeeded' | 'failed',
          failureReason: parsed.failureReason ?? null,
        },
        dbTx,
      );

      if (applyResult.outcome === 'not_found') {
        await this.eventRepo.markFailed(
          event.id,
          `TRANSACTION_NOT_FOUND: no ${input.provider} transaction for reference "${parsed.providerReference}"`,
          dbTx,
        );
        return { outcome: 'ignored', eventId: event.id, reason: 'TRANSACTION_NOT_FOUND' };
      }

      if (applyResult.outcome === 'already_terminal') {
        await this.eventRepo.markIgnored(
          event.id,
          `TRANSACTION_ALREADY_TERMINAL: transaction is in state "${applyResult.currentStatus}"`,
          dbTx,
        );
        return { outcome: 'ignored', eventId: event.id, reason: 'TRANSACTION_ALREADY_TERMINAL' };
      }

      // ── 6d: succeeded or failed — mark event as processed ──────────────────
      await this.eventRepo.markProcessed(event.id, { processedAt: new Date() }, dbTx);

      return {
        outcome: 'processed',
        eventId: event.id,
        intent: applyResult.intent,
        transaction: applyResult.transaction,
      };
    });
  }
}

// ── Private helpers ────────────────────────────────────────────────────────────

/**
 * Safely parse a JSON string into an object for storage.
 * Falls back to `{ raw: rawBody }` if parsing fails.
 */
function tryParseJson(rawBody: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(rawBody);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
    return { raw: rawBody };
  } catch {
    return { raw: rawBody };
  }
}
