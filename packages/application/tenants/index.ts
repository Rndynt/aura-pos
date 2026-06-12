/**
 * Tenants Application Services
 *
 * Tenant entitlement state is sourced exclusively from the entitlement SOT
 * (packages/application/entitlements). Legacy feature/module use cases have
 * been removed in entitlement Phase 2.
 */

export type {
  TenantDraft,
  TenantRepositoryPort,
} from './ports';
