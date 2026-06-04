import type { Database } from '@pos/infrastructure/database';
import type {
  IPaymentIntentRepository,
  IPaymentTransactionRepository,
} from '@pos/infrastructure/repositories/payments';
import type { DomainPaymentIntent, DomainPaymentTransaction } from '@pos/domain/payments';
import {
  assertIntentAcceptsPayment,
  assertAmountValid,
  PaymentPolicyError,
} from '@pos/domain/payments';
import type { PaymentProviderRegistry } from './PaymentProviderRegistry';
import { intentRowToDomain } from './CreatePaymentIntent';
import { txRowToDomain } from './ListPaymentTransactions';
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
  providerReference: string | null;
  providerPaymentUrl: string | null;
  providerQrString: string | null;
  idempotentReplay: boolean;
}

/**
 * Phase 2 whitelist: only fake_gateway may be used until Phase 3 integrates real gateways.
 * This guard prevents accidental real-money calls if a future provider code leaks in.
 */
const PHASE2_ALLOWED_PROVIDERS = new Set<string>(['fake_gateway']);

export class CreateGatewayPayment {
  constructor(
    private readonly db: Database,
    private readonly intentRepo: IPaymentIntentRepository,
    private readonly txRepo: IPaymentTransactionRepository,
    private readonly providerRegistry: PaymentProviderRegistry,
  ) {}

  async execute(input: CreateGatewayPaymentInput): Promise<CreateGatewayPaymentOutput> {
    if (input.amount <= 0) {
      throw new PaymentPolicyError('Payment amount must be greater than zero', 'INVALID_AMOUNT');
    }

    // Phase 2 guard: only fake_gateway is allowed
    if (!PHASE2_ALLOWED_PROVIDERS.has(input.provider)) {
      throw new PaymentPolicyError(
        `Provider "${input.provider}" is not supported for gateway payments in Phase 2. ` +
          `Allowed provider(s): ${[...PHASE2_ALLOWED_PROVIDERS].join(', ')}.`,
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
      //
      // Security note: the idempotency check only *reads* an existing tx row.
      // It never creates a new allocation on a paid intent — the original
      // transaction already went through confirmation before the intent was paid.
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
          // Return the CURRENT intent state (which may now be 'paid') and the
          // original transaction row as-is.
          return {
            intent: intentDomain,
            transaction: txRowToDomain(existingTx),
            providerReference: existingTx.providerReference ?? null,
            providerPaymentUrl: existingTx.providerPaymentUrl ?? null,
            providerQrString: existingTx.providerQrString ?? null,
            idempotentReplay: true,
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

      // Step 6 — Insert transaction as `pending`.
      // IMPORTANT: Do NOT create an allocation and do NOT update amountPaid.
      // The transaction is not yet settled — it only transitions to succeeded
      // when ConfirmFakeGatewayPayment is called.
      const transactionData: InsertPaymentTransaction = {
        tenantId: input.tenantId,
        paymentIntentId: input.paymentIntentId,
        direction: 'incoming',
        transactionType: 'payment',
        method: input.method,
        provider: input.provider,
        status: 'pending',
        amount: input.amount.toFixed(2),
        providerReference: providerResult.providerReference,
        providerPaymentUrl: providerResult.providerPaymentUrl,
        providerQrString: providerResult.providerQrString,
        idempotencyKey: input.idempotencyKey ?? null,
        metadata: input.metadata ?? null,
        receivedAmount: null,
        changeAmount: null,
        failureReason: null,
      };

      const createdTx = await this.txRepo.create(transactionData, tx);

      // Intent status is NOT recalculated — pending tx does not change amountPaid.
      return {
        intent: intentDomain,
        transaction: txRowToDomain(createdTx),
        providerReference: providerResult.providerReference,
        providerPaymentUrl: providerResult.providerPaymentUrl,
        providerQrString: providerResult.providerQrString,
        idempotentReplay: false,
      };
    });
  }
}
