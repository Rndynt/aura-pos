import type { Database } from '@pos/infrastructure/database';
import type {
  IPaymentIntentRepository,
  IPaymentTransactionRepository,
  IPaymentAllocationRepository,
} from '@pos/infrastructure/repositories/payments';
import type { DomainPaymentIntent, DomainPaymentTransaction } from '@pos/domain/payments';
import { PaymentPolicyError } from '@pos/domain/payments';
import { intentRowToDomain } from './CreatePaymentIntent';
import { txRowToDomain } from './ListPaymentTransactions';
import { RecalculatePaymentIntent } from './RecalculatePaymentIntent';
import type { InsertPaymentAllocation } from '../../../shared/schema';

export interface ConfirmFakeGatewayPaymentInput {
  tenantId: string;
  providerReference: string;
  status: 'succeeded' | 'failed';
  failureReason?: string;
  metadata?: Record<string, unknown>;
}

export interface ConfirmFakeGatewayPaymentOutput {
  intent: DomainPaymentIntent;
  transaction: DomainPaymentTransaction;
}

/**
 * ConfirmFakeGatewayPayment — dev/test-only controlled confirmation use case.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │  This use case is NOT a real webhook handler.                           │
 * │  It exists solely to simulate gateway callbacks in development / tests. │
 * │  The corresponding HTTP endpoint must be disabled (or guarded) in       │
 * │  production — see the route file for the NODE_ENV guard.               │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * Concurrency safety
 * ------------------
 * The transaction row is locked with `SELECT ... FOR UPDATE` via
 * `lockByProviderReferenceForUpdate()` before checking its status.
 * This prevents two concurrent confirmations from both seeing `pending`
 * and creating duplicate allocations.
 *
 * The additional unique DB index on
 * `payment_allocations(payment_transaction_id, target_type, target_id)` acts
 * as a second safety net (schema-level guard). See `shared/schema.ts` and
 * migration notes in `docs/reports/payment-engine-phase-2-hardening-report.md`.
 *
 * Rules
 * -----
 * - Only `fake_gateway` transactions can be confirmed through this use case.
 * - The transaction must be in `pending` or `requires_action` state.
 * - If status = 'succeeded':
 *     1. Transaction → `succeeded`, `succeededAt` set.
 *     2. Default allocation created (intent payable target).
 *     3. Intent recalculated (may become `paid` / `partially_paid`).
 * - If status = 'failed':
 *     1. Transaction → `failed`, `failedAt` set.
 *     2. No allocation.
 *     3. No amountPaid change.
 *     4. Intent status derived from succeeded transactions only (unchanged if none).
 * - All steps run in a single DB transaction with FOR UPDATE locks on both the
 *   payment_transaction row and the payment_intent row.
 */
export class ConfirmFakeGatewayPayment {
  constructor(
    private readonly db: Database,
    private readonly intentRepo: IPaymentIntentRepository,
    private readonly txRepo: IPaymentTransactionRepository,
    private readonly allocationRepo: IPaymentAllocationRepository,
    private readonly recalculate: RecalculatePaymentIntent,
  ) {}

  async execute(
    input: ConfirmFakeGatewayPaymentInput,
  ): Promise<ConfirmFakeGatewayPaymentOutput> {
    return await this.db.transaction(async (tx) => {
      // Step 1 — Lock the transaction row FOR UPDATE before reading its status.
      // This ensures two concurrent confirmations cannot both see `pending`
      // and proceed to create duplicate allocations.
      const txRow = await this.txRepo.lockByProviderReferenceForUpdate(
        'fake_gateway',
        input.providerReference,
        input.tenantId,
        tx,
      );

      if (!txRow) {
        throw new PaymentPolicyError(
          `No fake_gateway transaction found for provider reference: "${input.providerReference}"`,
          'TRANSACTION_NOT_FOUND',
        );
      }

      // Step 2 — Confirm this is a fake_gateway transaction (defensive check).
      if (txRow.provider !== 'fake_gateway') {
        throw new PaymentPolicyError(
          `This endpoint only accepts fake_gateway transactions. ` +
            `Transaction provider is "${txRow.provider}".`,
          'WRONG_PROVIDER',
        );
      }

      // Step 3 — Reject already-terminal transactions.
      // Because we hold a FOR UPDATE lock on the row, the status we see here
      // is the authoritative current state — no other concurrent confirmation
      // can have modified it in the time since we acquired the lock.
      const activeStatuses = new Set(['pending', 'requires_action']);
      if (!activeStatuses.has(txRow.status)) {
        throw new PaymentPolicyError(
          `Cannot confirm transaction in state "${txRow.status}". ` +
            `Only pending/requires_action transactions may be confirmed.`,
          'INVALID_TRANSITION',
        );
      }

      // Step 4 — Lock the related intent row FOR UPDATE.
      // Lock order is always: transaction first, then intent — never reversed.
      // Consistent lock ordering prevents deadlocks with CreateGatewayPayment
      // (which only locks the intent and never the transaction row).
      const intentRow = await this.intentRepo.lockForUpdate(
        txRow.paymentIntentId,
        input.tenantId,
        tx,
      );

      if (!intentRow) {
        throw new PaymentPolicyError(
          'Payment intent not found or access denied',
          'INTENT_NOT_FOUND',
        );
      }

      const intentDomain = intentRowToDomain(intentRow);

      if (input.status === 'succeeded') {
        // Step 5a — Mark transaction as succeeded.
        const updatedTxRow = await this.txRepo.update(
          txRow.id,
          input.tenantId,
          {
            status: 'succeeded',
            succeededAt: new Date(),
            updatedAt: new Date(),
          },
          tx,
        );

        // Step 5b — Create default allocation to intent payable target.
        // The unique index payment_allocations_tx_target_unique on
        // (payment_transaction_id, target_type, target_id) guarantees that even
        // if two requests somehow both pass the FOR UPDATE check (e.g. via
        // read replicas), only one allocation is persisted.
        const txAmount =
          typeof txRow.amount === 'string' ? parseFloat(txRow.amount) : Number(txRow.amount);
        const allocationData: InsertPaymentAllocation = {
          tenantId: input.tenantId,
          paymentIntentId: txRow.paymentIntentId,
          paymentTransactionId: txRow.id,
          targetType: intentDomain.payableType,
          targetId: intentDomain.payableId,
          amount: txAmount.toFixed(2),
          metadata: input.metadata ?? null,
        };

        await this.allocationRepo.create(allocationData, tx);

        // Step 5c — Recalculate intent totals (amountPaid, amountRemaining, status).
        const { intent: updatedIntent } = await this.recalculate.execute({
          tenantId: input.tenantId,
          intentId: txRow.paymentIntentId,
          tx,
        });

        return {
          intent: updatedIntent,
          transaction: txRowToDomain(updatedTxRow),
        };
      } else {
        // status === 'failed'
        // Step 5a — Mark transaction as failed.
        const updatedTxRow = await this.txRepo.update(
          txRow.id,
          input.tenantId,
          {
            status: 'failed',
            failedAt: new Date(),
            failureReason:
              input.failureReason ?? 'Payment rejected via fake gateway confirmation endpoint',
            updatedAt: new Date(),
          },
          tx,
        );

        // Do NOT create allocation.
        // Do NOT call recalculate — failed tx does not change amountPaid.
        // Intent status is based solely on succeeded transactions, so it remains
        // as-is (requires_payment / partially_paid / etc.).
        return {
          intent: intentDomain,
          transaction: txRowToDomain(updatedTxRow),
        };
      }
    });
  }
}
