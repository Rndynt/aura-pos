/**
 * providerAccount.ts — Provider account/configuration abstraction.
 *
 * Phase 6 introduction: separates per-tenant gateway credentials from the
 * provider implementation class.  This allows a single FakeGatewayProvider
 * (or future MidtransProvider) to serve multiple tenants, each with their own
 * credentials, without duplicating the adapter logic.
 *
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │  No database table backs this type in Phase 6.                         │
 * │  Credentials are supplied to use-cases via constructor injection or     │
 * │  loaded from environment variables inside the provider adapter.        │
 * │  A future phase will introduce a `provider_accounts` table for         │
 * │  multi-tenant credential storage with encryption-at-rest.              │
 * └─────────────────────────────────────────────────────────────────────────┘
 */

/**
 * ProviderAccountConfig — the configuration a gateway adapter needs to
 * initialise a connection to the provider for a specific tenant.
 *
 * Fields
 * ------
 * - `tenantId`      — which tenant owns this account config.
 * - `providerCode`  — matches `PaymentProvider.providerCode` (e.g. `'fake_gateway'`).
 * - `accountId`     — provider-assigned merchant/account identifier (e.g. merchant ID).
 * - `credentials`   — arbitrary key→value bag of secrets (API keys, client IDs, etc.).
 *                     Content is provider-specific; caller must know the shape.
 * - `sandboxMode`   — true when this account targets the provider's sandbox/test environment.
 * - `metadata`      — optional additional config values (timeouts, webhook URL overrides, etc.).
 *
 * Security note: `credentials` values are secrets.  Never log, serialise to JSON responses,
 * or store unencrypted.  The field is typed as `Record<string, string>` to prevent
 * accidental nesting of structured objects that could mask credential values.
 */
export interface ProviderAccountConfig {
  /** Tenant that owns this provider account. */
  tenantId: string;
  /** Matches the `providerCode` of the PaymentProvider adapter this config targets. */
  providerCode: string;
  /**
   * Provider-assigned account/merchant identifier.
   * Examples: Midtrans merchant ID, Xendit account ID, Stripe account ID.
   */
  accountId: string;
  /**
   * Secret credentials required to authenticate with the provider.
   * Key names are provider-specific (e.g. `{ serverKey: '...', clientKey: '...' }`).
   * Must be treated as secrets — never log or expose in API responses.
   */
  credentials: Record<string, string>;
  /**
   * When true, the adapter must target the provider's sandbox/test environment.
   * When false (or undefined), the adapter targets the provider's production environment.
   */
  sandboxMode?: boolean;
  /**
   * Optional provider-specific configuration (webhook URL override, timeout ms, etc.).
   * Does not contain secrets.
   */
  metadata?: Record<string, unknown>;
}
