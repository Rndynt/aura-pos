import type { ProviderCapabilities } from './provider';

/**
 * providerAccount.ts — Provider account/configuration abstraction.
 *
 * Phase 6 introduction: separates per-tenant gateway configuration from the
 * provider implementation class.
 *
 * Phase 6 Hardening change: raw `credentials` removed from domain type.
 * The domain descriptor now uses `credentialsRef` (a string handle pointing to
 * a secret stored outside the domain, e.g. in an env-var manager or vault).
 * Infrastructure adapters resolve the reference at runtime — the domain type
 * never holds a raw API key or secret.
 *
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │  No database table backs this type in Phase 6.                         │
 * │  A future phase will introduce a `provider_accounts` table for          │
 * │  multi-tenant configuration with credentialsRef stored encrypted-at-rest.│
 * └─────────────────────────────────────────────────────────────────────────┘
 */

/**
 * ProviderAccountConfig — the configuration descriptor for a gateway account.
 *
 * This type is intentionally free of raw secrets.  Actual credentials are
 * referenced by `credentialsRef` and resolved by infrastructure code that
 * has access to the vault / environment variable store.
 *
 * Fields
 * ------
 * - `provider`              — matches `PaymentProvider.providerCode`.
 * - `tenantId`              — which tenant owns this account (optional for global configs).
 * - `merchantId`            — provider-assigned merchant/account identifier.
 * - `environment`           — which environment this config targets.
 * - `credentialsRef`        — opaque reference to a secret bundle (env-var name, vault path, etc.).
 *                             Infrastructure resolves this to actual API keys at runtime.
 *                             NEVER put a raw secret here.
 * - `publicConfig`          — non-secret configuration (client-key prefix, webhook URL, etc.).
 * - `capabilitiesOverride`  — optional per-account capability overrides (e.g. disable partial refund
 *                             for a specific merchant agreement).
 * - `metadata`              — optional miscellaneous config (timeouts, retry policy, etc.).
 */
export interface ProviderAccountConfig {
  /** Matches the `providerCode` of the PaymentProvider adapter this config targets. */
  provider: string;
  /** Tenant that owns this provider account. Undefined for platform-level configs. */
  tenantId?: string;
  /**
   * Provider-assigned merchant/account identifier.
   * Examples: Midtrans merchant ID, Xendit account ID, Stripe account ID.
   */
  merchantId?: string;
  /**
   * Which environment this account config targets.
   * - `sandbox`    — provider's sandbox/test environment (fake money).
   * - `production` — provider's live environment (real money).
   * - `test`       — local unit-test environment (FakeGateway, no HTTP calls).
   */
  environment: 'sandbox' | 'production' | 'test';
  /**
   * Opaque reference to the secret credentials bundle for this account.
   * Infrastructure code resolves this reference to actual API keys at runtime.
   * Examples: `'MIDTRANS_TENANT_A_CREDENTIALS'` (env var name), `/secrets/midtrans/tenant-a` (vault path).
   *
   * NEVER store raw API keys, passwords, or tokens here.
   * This field is intentionally a string reference, not the secret itself.
   */
  credentialsRef?: string;
  /**
   * Non-secret provider configuration.
   * Examples: client-side publishable key prefix, webhook endpoint URL, timeout ms.
   * Must not contain API keys, private keys, or any other secrets.
   */
  publicConfig?: Record<string, unknown>;
  /**
   * Per-account capability overrides.
   * Use to restrict or extend the base provider capabilities for a specific merchant agreement.
   * Example: `{ supportsPartialRefund: false }` to disable partial refunds for a merchant
   * that has a non-standard refund agreement with the provider.
   */
  capabilitiesOverride?: Partial<ProviderCapabilities>;
  /**
   * Optional miscellaneous configuration (retry policy, rate limits, etc.).
   * Does not contain secrets.
   */
  metadata?: Record<string, unknown>;
}
