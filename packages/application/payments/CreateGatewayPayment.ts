import { randomUUID } from 'node:crypto';
import type { Database } from '@pos/infrastructure/database';
import type {
  IPaymentIntentRepository,
  IPaymentTransactionRepository,
  IPaymentAllocationRepository,
} from '@pos/infrastructure/repositories/payments';
import type { DomainPaymentIntent, DomainPaymentTransaction, ProviderAction } from '@pos/domain/payments';
import {
  assertIntentAcceptsPayment,
  assertAmountValid,
  PaymentPolicyError,
} from '@pos/domain/payments';
import type { PaymentProviderRegistry } from './PaymentProviderRegistry';
import { intentRowToDomain } from './CreatePaymentIntent';
import { txRowToDomain } from './ListPaymentTransactions';
import type { RecalculatePaymentIntent } from './RecalculatePaymentIntent';
import type { InsertPaymentTransaction, InsertPaymentAllocation } from '../../../shared/schema';

export interface CreateGatewayPaymentInput {
  tenantId: string;
  paymentIntentId: string;
  amount: number;
  method: 'qris' | 'ewallet' | 'card' | 'bank_transfer' | 'other';
  provider: string;
  idempotencyKey?: string;
  metadata?: Record<string, unknown>;
}

export interface CreateGatewayPaymentOutput {
  intent: DomainPaymentIntent;
  transaction: DomainPaymentTransaction;
  /** Provider-assigned reference for webhook matching and lookup. */
  providerReference: string | null;
  /** @deprecated Prefer providerActions[descriptor=WEB_URL].value */
  providerPaymentUrl: string | null;
  /** @deprecated Prefer providerActions[descriptor=QR_STRING].value */
  providerQrString: string | null;
  /** True when this response was produced by an idempotency replay (no new tx created). */
  idempotentReplay: boolean;
  /**
   * Phase 6: Ordered list of customer actions returned by the provider.
   * Each action includes a machine-readable `descriptor` for UI dispatch.
   * Empty for pending/succeeded/failed outcomes or idempotent replays.
   */
  providerActions: ProviderAction[];
  /**
   * Phase 6: True when the provider settled the transaction immediately.
   * Allocation was applied and intent recalculated in the same DB transaction.
   */
  immediateSuccess: boolean;
}

/**
 * Recognized gateway provider codes (Phase 7A: fake_gateway + xendit_sandbox).
 * This allowlist prevents unknown strings from reaching the registry.
 * Each provider must ALSO be registered in the registry to be usable.
 *
 * Policy:
 *  - 'manual'        → always rejected (not a gateway provider)
 *  - 'fake_gateway'  → allowed if registered (always registered in dev/test)
 *  - 'xendit_sandbox'→ allowed only when registered (requires XENDIT_SANDBOX_ENABLED=true)
 *  - anything else   → rejected (unrecognized code)
 */
const GATEWAY_PROVIDER_CODES = new Set<string>(['fake_gateway', 'xendit_sandbox']);

/**
 * CreateGatewayPayment — create a pending/requires_action/immediate payment
 * via a registered gateway provider.
 *
 * Phase 6 Hardening — Immediate-success lock-ordering fix
 * ========================================================
 *
 * Background
 * ----------
 * Normal settlement flows (webhook, confirmation) follow strict lock ordering:
 *   1. payment_transactions FOR UPDATE
 *   2. payment_intents FOR UPDATE
 *
 * The Phase 6 original implementation called ApplyGatewayTransactionStatus
 * (which follows the tx→intent order) from inside CreateGatewayPayment after
 * Step 1 had already locked the intent.  This produced:
 *   intent → tx → intent
 * — a reversed lock-order pattern that is safe now but would be a deadlock
 * hazard once concurrent real-provider flows exist.
 *
 * Fix
 * ---
 * For `status: 'succeeded'` from the provider, CreateGatewayPayment now:
 *   a) Creates the transaction directly as `succeeded` (no pending→succeeded
 *      two-step).
 *   b) Creates the allocation directly using the already-locked intent data.
 *   c) Recalculates intent totals using RecalculatePaymentIntent.
 *
 * Because CreateGatewayPayment OWNS the newly created tx row (it just inserted
 * it) and already holds the intent FOR UPDATE lock, no additional row locking
 * is needed.  ApplyGatewayTransactionStatus is NOT called — avoiding the
 * tx→intent re-lock that would produce the mixed ordering.
 *
 * Lock ordering summary
 * ---------------------
 * - Normal settlement (webhook/confirm): tx FOR UPDATE → intent FOR UPDATE
 * - Immediate-success in CreateGatewayPayment: intent FOR UPDATE only
 *   (tx was just created; caller owns it; no lock contention possible)
 *
 * Constructor dependencies
 * ------------------------
 * The 5th (`allocationRepo`) and 6th (`recalculate`) arguments are optional
 * for backward compatibility with Phase 2 unit tests that construct this use
 * case with 4 arguments.  Those tests use the `default` scenario which returns
 * `status: 'pending'` and never triggers the immediate-success path.
 *
 * If either dependency is missing and the provider returns `succeeded`,
 * a clear `IMMEDIATE_SUCCESS_NOT_CONFIGURED` error is thrown.
 */
export class CreateGatewayPayment {
  constructor(
    private readonly db: Database,
    private readonly intentRepo: IPaymentIntentRepository,
    private readonly txRepo: IPaymentTransactionRepository,
    private readonly providerRegistry: PaymentProviderRegistry,
    /**
     * Required for immediate-success settlement (provider returns `status: 'succeeded'`).
     * Optional for backward compat with 4-arg Phase 2 test constructions.
     */
    private readonly allocationRepo?: IPaymentAllocationRepository,
    /**
     * Required for immediate-success settlement — recalculates intent totals
     * after the allocation is created.
     * Optional for backward compat with 4-arg Phase 2 test constructions.
     */
    private readonly recalculate?: RecalculatePaymentIntent,
  ) {}

  async execute(input: CreateGatewayPaymentInput): Promise<CreateGatewayPaymentOutput> {
    if (input.amount <= 0) {
      throw new PaymentPolicyError('Payment amount must be greater than zero', 'INVALID_AMOUNT');
    }

    // Policy: reject manual provider — it is not a gateway payment provider.
    if (input.provider === 'manual') {
      throw new PaymentPolicyError(
        `Provider "manual" is not supported for gateway payments. Use RecordManualPayment instead.`,
        'UNSUPPORTED_PROVIDER',
      );
    }
    // Policy: reject unrecognized gateway codes before touching the registry.
    if (!GATEWAY_PROVIDER_CODES.has(input.provider)) {
      throw new PaymentPolicyError(
        `Provider "${input.provider}" is not supported for gateway payments. ` +
          `Recognized gateway providers: ${[...GATEWAY_PROVIDER_CODES].join(', ')}.`,
        'UNSUPPORTED_PROVIDER',
      );
    }
    // Policy: provider must be registered (xendit_sandbox requires XENDIT_SANDBOX_ENABLED=true + key).
    if (!this.providerRegistry.has(input.provider)) {
      throw new PaymentPolicyError(
        `Provider "${input.provider}" is recognized but not registered. ` +
          `Ensure it is enabled and configured (e.g. XENDIT_SANDBOX_ENABLED=true for xendit_sandbox).`,
        'UNSUPPORTED_PROVIDER',
      );
    }

    const gatewayProvider = this.providerRegistry.get(input.provider);

    return await this.db.transaction(async (tx) => {
      // Step 1 — Lock the intent row FOR UPDATE.
      // This is the only lock acquired in CreateGatewayPayment.
      // Immediate-success path uses this already-held lock for the allocation
      // step — it does NOT call ApplyGatewayTransactionStatus (which would
      // re-lock tx→intent and reverse the ordering).
      const intentRow = await this.intentRepo.lockForUpdate(
        input.paymentIntentId,
        input.tenantId,
        tx,
      );

      if (!intentRow) {
        throw new Error('Payment intent not found or access denied');
      }

      const intentDomain = intentRowToDomain(intentRow);

      // Step 2 — Idempotency check (BEFORE terminal-state validation).
      if (input.idempotencyKey) {
        const existingTx = await this.txRepo.findByIdempotencyKey(
          input.tenantId,
          input.idempotencyKey,
          tx,
        );
        if (existingTx) {
          if (existingTx.paymentIntentId !== input.paymentIntentId) {
            throw new PaymentPolicyError(
              'Idempotency key was already used for a different payment intent',
              'IDEMPOTENCY_KEY_CONFLICT',
            );
          }
          return {
            intent: intentDomain,
            transaction: txRowToDomain(existingTx),
            providerReference: existingTx.providerReference ?? null,
            providerPaymentUrl: existingTx.providerPaymentUrl ?? null,
            providerQrString: existingTx.providerQrString ?? null,
            idempotentReplay: true,
            providerActions: [],
            immediateSuccess: false,
          };
        }
      }

      // Step 3 — Validate intent can accept a new transaction.
      assertIntentAcceptsPayment(intentDomain);

      // Step 4 — Amount validation.
      assertAmountValid(input.amount, intentDomain.amountRemaining, intentDomain.allowPartial);

      // Step 5 — Call provider to generate the payment URL / QR / reference.
      //
      // Generate a per-attempt unique provider_request_id so that multiple gateway
      // attempts for the same intent use different reference_id values in Xendit
      // (and equivalent providers).  Without this, `reference_id = aurapos-<intentId>`
      // would collide on retries.
      //
      // Source order: idempotency key (caller's unique key) → fresh UUID.
      // This is passed in metadata so the provider can use it as its reference_id.
      const providerRequestId = `aurapos-${input.paymentIntentId}-${input.idempotencyKey ?? randomUUID()}`;

      const providerResult = await gatewayProvider.createPayment({
        paymentIntentId: input.paymentIntentId,
        amount: input.amount,
        currency: intentDomain.currency,
        method: input.method,
        metadata: { ...input.metadata, provider_request_id: providerRequestId },
      });

      // Step 6 — Handle immediate success (provider returns `status: 'succeeded'`).
      //
      // Lock-order note: we already hold intent FOR UPDATE from Step 1.
      // We create the tx as 'succeeded' directly and apply the allocation
      // without calling ApplyGatewayTransactionStatus (which would try to
      // lock tx→intent again and reverse the ordering).
      // The tx row is brand-new — no lock contention is possible.
      if (providerResult.status === 'succeeded') {
        if (!this.allocationRepo || !this.recalculate) {
          throw new PaymentPolicyError(
            'Provider returned immediate success but allocationRepo and recalculate are not injected. ' +
              'Pass allocationRepo (5th arg) and recalculate (6th arg) to CreateGatewayPayment.',
            'IMMEDIATE_SUCCESS_NOT_CONFIGURED',
          );
        }

        // 6a — Create transaction as succeeded directly.
        const txData: InsertPaymentTransaction = {
          tenantId: input.tenantId,
          paymentIntentId: input.paymentIntentId,
          direction: 'incoming',
          transactionType: 'payment',
          method: input.method,
          provider: input.provider,
          status: 'succeeded',
          amount: input.amount.toFixed(2),
          providerReference: providerResult.providerReference,
          providerPaymentUrl: providerResult.providerPaymentUrl,
          providerQrString: providerResult.providerQrString,
          idempotencyKey: input.idempotencyKey ?? null,
          metadata: input.metadata ?? null,
          receivedAmount: null,
          changeAmount: null,
          failureReason: null,
          succeededAt: new Date(),
        };
        const createdTx = await this.txRepo.create(txData, tx);

        // 6b — Create allocation (unique index prevents duplicates).
        const allocationData: InsertPaymentAllocation = {
          tenantId: input.tenantId,
          paymentIntentId: input.paymentIntentId,
          paymentTransactionId: createdTx.id,
          targetType: intentDomain.payableType,
          targetId: intentDomain.payableId,
          amount: input.amount.toFixed(2),
          metadata: { triggeredBy: 'immediate_success' },
        };
        await this.allocationRepo.create(allocationData, tx);

        // 6c — Recalculate intent totals (amountPaid, amountRemaining, status).
        // RecalculatePaymentIntent.execute() reads intent via findById (not lockForUpdate)
        // — we already hold the lock, so this is safe.
        const { intent: updatedIntent } = await this.recalculate.execute({
          tenantId: input.tenantId,
          intentId: input.paymentIntentId,
          tx,
        });

        return {
          intent: updatedIntent,
          transaction: txRowToDomain(createdTx),
          providerReference: providerResult.providerReference,
          providerPaymentUrl: providerResult.providerPaymentUrl,
          providerQrString: providerResult.providerQrString,
          idempotentReplay: false,
          providerActions: providerResult.actions,
          immediateSuccess: true,
        };
      }

      // Step 7 — Map provider status → initial transaction status for non-immediate paths.
      let initialTxStatus: 'pending' | 'requires_action' | 'failed';
      switch (providerResult.status) {
        case 'failed':          initialTxStatus = 'failed';          break;
        case 'requires_action': initialTxStatus = 'requires_action'; break;
        case 'pending':
        default:                initialTxStatus = 'pending';          break;
      }

      // Step 8 — Insert the transaction row.
      const transactionData: InsertPaymentTransaction = {
        tenantId: input.tenantId,
        paymentIntentId: input.paymentIntentId,
        direction: 'incoming',
        transactionType: 'payment',
        method: input.method,
        provider: input.provider,
        status: initialTxStatus,
        amount: input.amount.toFixed(2),
        providerReference: providerResult.providerReference,
        providerPaymentUrl: providerResult.providerPaymentUrl,
        providerQrString: providerResult.providerQrString,
        idempotencyKey: input.idempotencyKey ?? null,
        metadata: input.metadata ?? null,
        receivedAmount: null,
        changeAmount: null,
        failureReason:
          providerResult.status === 'failed'
            ? (providerResult.failureReason ?? 'Payment rejected by provider')
            : null,
      };

      const createdTx = await this.txRepo.create(transactionData, tx);

      // Intent status is NOT recalculated — pending/requires_action/failed tx
      // does not change amountPaid.
      return {
        intent: intentDomain,
        transaction: txRowToDomain(createdTx),
        providerReference: providerResult.providerReference,
        providerPaymentUrl: providerResult.providerPaymentUrl,
        providerQrString: providerResult.providerQrString,
        idempotentReplay: false,
        providerActions: providerResult.actions,
        immediateSuccess: false,
      };
    });
  }
}
