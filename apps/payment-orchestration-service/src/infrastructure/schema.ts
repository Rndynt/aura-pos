/**
 * schema — payment-orchestration-service schema boundary bridge.
 *
 * Standalone extraction first. Source applications integrate only after service/package
 * boundary, provider runtime, operations, and extraction simulation are stable.
 *
 * Phase 8I keeps this as a low-risk re-export bridge from AuraPoS `shared/schema.ts`.
 * Full relocation of `payment_orchestration_*` table definitions and migrations remains
 * deferred until extraction simulation proves there is no Drizzle/schema drift.
 */

export {
  paymentOrchestrationMerchants,
  paymentOrchestrationProviderAccounts,
  paymentOrchestrationIntents,
  paymentOrchestrationTransactions,
  paymentOrchestrationProviderEvents,
  paymentOrchestrationIdempotencyKeys,
} from '../../../../shared/schema.ts';
