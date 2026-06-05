import type { Database } from '@pos/infrastructure/database';
import type {
  IPaymentIntentRepository,
  IPaymentTransactionRepository,
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
import type { ApplyGatewayTransactionStatus } from './ApplyGatewayTransactionStatus';
import type { InsertPaymentTransaction } from '../../../shared/schema';

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
  /** @deprecated Prefer providerActions[].value for redirect actions. */
  providerPaymentUrl: string | null;
  /** @deprecated Prefer providerActions[].value for QR actions. */
  providerQrString: string | null;
  /** True when this response was produced by an idempotency replay (no new tx created). */
  idempotentReplay: boolean;
  /**
   * Phase 6: Ordered list of customer actions returned by the provider.
   * Empty for pending/succeeded/failed outcomes or idempotent replays.
   */
  providerActions: ProviderAction[];
  /**
   * Phase 6: True when the provider settled the transaction immediately
   * (scenario: immediate_success).  Allocation is applied in the same DB tx.
   */
  immediateSuccess: boolean;
}

/**
 * Provider whitelist: only fake_gateway may be used until a real gateway phase
 * integrates production adapters.  This guard prevents accidental real-money
 * calls if a future provider code leaks in before its adapter is hardened.
 *
 * Expand this set when adding Midtrans, Xendit, Stripe, etc.
 */
const ALLOWED_GATEWAY_PROVIDERS = new Set<string>(['fake_gateway']);

/**
 * CreateGatewayPayment — create a pending/requires_action/immediate payment
 * via a registered gateway provider.
 *
 * Phase 6 additions
 * -----------------
 * 1. Provider result `status` field drives transaction status:
 *    - `pending`         → transaction stored as `pending`
 *    - `requires_action` → transaction stored as `requires_action`
 *    - `succeeded`       → transaction stored as `pending`, then immediately
 *                          transitioned to `succeeded` (via ApplyGatewayTransactionStatus)
 *                          + allocation created — all in the same DB transaction.
 *    - `failed`          → transaction stored as `failed`; no allocation.
 *
 * 2. `providerActions` from the provider result are propagated to the caller.
 *
 * 3. `immediateSuccess: true` is set on the output when the provider settles
 *    the payment synchronously.
 *
 * Immediate success implementation
 * ---------------------------------
 * For `succeeded` status, `applyGatewayStatus` (optional 5th constructor arg)
 * is called within the SAME outer DB transaction.  This atomically:
 *   a) Updates the transaction row to `succeeded`
 *   b) Creates a payment allocation
 *   c) Recalculates intent totals (amountPaid, amountRemaining, status)
 *
 * If `applyGatewayStatus` is not injected and the provider returns `succeeded`,
 * a clear `IMMEDIATE_SUCCESS_NOT_CONFIGURED` error is thrown.
 *
 * Locking order (unchanged from Phase 2)
 * ----------------------------------------
 * CreateGatewayPayment locks payment_intents FOR UPDATE (Step 1).
 * When `applyGatewayStatus` is called for immediate success it locks
 * payment_transactions FOR UPDATE → payment_intents FOR UPDATE (the standard
 * settlement locking order).  This is safe because the intent lock is
 * released by the inner helper after it re-acquires it — Drizzle's
 * savepoint nesting means both locks live within the same pg transaction.
 *
 * Backward compatibility
 * -----------------------
 * - The 5th constructor argument (`applyGatewayStatus`) is optional so that
 *   existing Phase 2 unit tests can continue to construct this use-case with
 *   4 arguments.  Those tests use the `default` scenario which returns
 *   `status: 'pending'` and never triggers the immediate-success path.
 * - `providerPaymentUrl` and `providerQrString` on the output are kept for
 *   all callers that read them directly from the response.
 */
export class CreateGatewayPayment {
  constructor(
    private readonly db: Database,
    private readonly intentRepo: IPaymentIntentRepository,
    private readonly txRepo: IPaymentTransactionRepository,
    private readonly providerRegistry: PaymentProviderRegistry,
    /**
     * Optional — required only when providers may return `status: 'succeeded'`
     * (immediate success).  Inject via container for production use.
     */
    private readonly applyGatewayStatus?: ApplyGatewayTransactionStatus,
  ) {}

  async execute(input: CreateGatewayPaymentInput): Promise<CreateGatewayPaymentOutput> {
    if (input.amount <= 0) {
      throw new PaymentPolicyError('Payment amount must be greater than zero', 'INVALID_AMOUNT');
    }

    // Provider whitelist guard — prevents accidental real-money calls
    if (!ALLOWED_GATEWAY_PROVIDERS.has(input.provider)) {
      throw new PaymentPolicyError(
        `Provider "${input.provider}" is not supported for gateway payments. ` +
          `Allowed provider(s): ${[...ALLOWED_GATEWAY_PROVIDERS].join(', ')}.`,
        'UNSUPPORTED_PROVIDER',
      );
    }

    // Resolve the provider — throws UNSUPPORTED_PROVIDER if not registered
    const gatewayProvider = this.providerRegistry.get(input.provider);

    return await this.db.transaction(async (tx) => {
      // Step 1 — Lock the intent row FOR UPDATE (prevents concurrent overpayment /
      // status change while we are creating the transaction).
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
      //
      // Correct ordering rationale:
      // When a client sends a gateway payment request with idempotency key K:
      //   a) The request is processed → pending tx created
      //   b) A fake-confirmation makes the tx succeed and the intent becomes 'paid'
      //   c) The client retries the SAME request with idempotency key K
      //
      // In step (c), the intent is terminal ('paid'), but the idempotent replay
      // MUST succeed and return the original transaction — not reject with a
      // "terminal intent" error. This mirrors standard idempotency guarantees:
      // a safe retry of an already-completed operation returns the same result.
      if (input.idempotencyKey) {
        const existingTx = await this.txRepo.findByIdempotencyKey(
          input.tenantId,
          input.idempotencyKey,
          tx,
        );
        if (existingTx) {
          if (existingTx.paymentIntentId !== input.paymentIntentId) {
            // Same key, different intent — always a conflict (regardless of intent state).
            throw new PaymentPolicyError(
              'Idempotency key was already used for a different payment intent',
              'IDEMPOTENCY_KEY_CONFLICT',
            );
          }
          // Same key + same intent → idempotent replay.
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

      // Step 3 — No idempotency replay found. Validate that a NEW transaction
      // can be added. Reject terminal-state intents only when we would actually
      // create a new pending transaction.
      assertIntentAcceptsPayment(intentDomain);

      // Step 4 — Amount validation (same rules as RecordManualPayment).
      assertAmountValid(input.amount, intentDomain.amountRemaining, intentDomain.allowPartial);

      // Step 5 — Call the provider to generate the payment URL / QR / reference.
      const providerResult = await gatewayProvider.createPayment({
        paymentIntentId: input.paymentIntentId,
        amount: input.amount,
        currency: intentDomain.currency,
        method: input.method,
        metadata: input.metadata,
      });

      // Step 6 — Map provider status → initial transaction status.
      //
      // For 'succeeded': create as 'pending' first so the row exists and can be
      // found by lockByProviderReferenceForUpdate inside ApplyGatewayTransactionStatus.
      // Then immediately apply the success transition in Step 8.
      //
      // For 'failed': create directly as 'failed' — no allocation needed.
      //
      // For 'requires_action' and 'pending': store verbatim.
      let initialTxStatus: 'pending' | 'requires_action' | 'failed';
      switch (providerResult.status) {
        case 'succeeded':
          // Will be transitioned to 'succeeded' in Step 8 after row is created.
          initialTxStatus = 'pending';
          break;
        case 'failed':
          initialTxStatus = 'failed';
          break;
        case 'requires_action':
          initialTxStatus = 'requires_action';
          break;
        case 'pending':
        default:
          initialTxStatus = 'pending';
          break;
      }

      // Step 7 — Insert the transaction row.
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
        failureReason: providerResult.status === 'failed' ? (providerResult.failureReason ?? 'Payment rejected by provider') : null,
      };

      const createdTx = await this.txRepo.create(transactionData, tx);

      // Step 8 — Immediate success: apply allocation in the same DB transaction.
      if (providerResult.status === 'succeeded') {
        if (!this.applyGatewayStatus) {
          throw new PaymentPolicyError(
            'Provider returned immediate success but ApplyGatewayTransactionStatus is not injected. ' +
              'Pass applyGatewayStatus as the 5th constructor argument to CreateGatewayPayment.',
            'IMMEDIATE_SUCCESS_NOT_CONFIGURED',
          );
        }

        if (!providerResult.providerReference) {
          throw new PaymentPolicyError(
            'Provider returned immediate success but providerReference is null. ' +
              'A providerReference is required for lockByProviderReferenceForUpdate.',
            'MISSING_PROVIDER_REFERENCE',
          );
        }

        const applyOutcome = await this.applyGatewayStatus.execute(
          {
            tenantId: input.tenantId,
            provider: input.provider,
            providerReference: providerResult.providerReference,
            status: 'succeeded',
            failureReason: null,
            allocationMetadata: { triggeredBy: 'immediate_success' },
          },
          tx,
        );

        if (applyOutcome.outcome === 'succeeded') {
          return {
            intent: applyOutcome.intent,
            transaction: applyOutcome.transaction,
            providerReference: providerResult.providerReference,
            providerPaymentUrl: providerResult.providerPaymentUrl,
            providerQrString: providerResult.providerQrString,
            idempotentReplay: false,
            providerActions: providerResult.actions,
            immediateSuccess: true,
          };
        }

        // Unexpected outcome from applyGatewayStatus for a just-created pending tx.
        // This should never happen in practice (we just created the row as pending).
        throw new PaymentPolicyError(
          `Unexpected outcome from ApplyGatewayTransactionStatus after immediate success: ${applyOutcome.outcome}`,
          'IMMEDIATE_SUCCESS_APPLY_FAILED',
        );
      }

      // Step 9 — Return result for non-immediate-success paths.
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
